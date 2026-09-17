#!/usr/bin/env node
// scripts/smoke-test.mjs
// Uso: npm test (o node scripts/smoke-test.mjs)
//
// Comprueba de extremo a extremo, contra un servidor local mínimo, que los caminos
// principales de la app funcionan: monta el sitio estático + el handler real de
// api/incidencias.js directamente (misma forma que Vercel: handler(req, res)), sin necesitar
// el CLI de Vercel. El feed de la DGT es público (sin credenciales), así que se prueba contra
// el feed real, no contra datos inventados — misma filosofía que el smoke test de BusYa.
//
// A diferencia de BusYa (paradas de bus reales y estables, con IDs que se pueden fijar en el
// propio script), las incidencias de tráfico son efímeras: una que existe al escribir esta
// prueba puede no existir al ejecutarla. Por eso los checks que necesitan una incidencia
// concreta la piden en el momento (obtenerIncidenciaDePrueba) en vez de tener un id fijo, y se
// omiten con un aviso claro si ahora mismo no hay ninguna activa en Madrid — algo posible,
// aunque raro, no un fallo de la app.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const { default: incidenciasHandler } = await import(path.join(ROOT, 'api/incidencias.js'));

const server = await startServer();
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const results = [];

try {
  const incidenciaDePrueba = await obtenerIncidenciaDePrueba();
  if (!incidenciaDePrueba) {
    console.log('Aviso: la DGT no tiene ninguna incidencia activa en Madrid ahora mismo — se omiten los checks que necesitan una en concreto.\n');
  }

  await check('la página carga sin errores de consola', () =>
    withPage(async (page) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        // /_vercel/insights/script.js (Vercel Web Analytics) solo existe en un despliegue real
        // con Analytics activado en el dashboard — aquí da 404 a propósito, no es un fallo de
        // la app (ver CLAUDE.md).
        if (m.type() === 'error' && !m.location().url.includes('/_vercel/insights/script.js')) errors.push(m.text());
      });
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      if (errors.length) throw new Error(errors.join(' | '));
    })
  );

  await check('el feed de la DGT devuelve incidencias reales de Madrid', async () => {
    const res = await fetch(`${baseUrl}/api/incidencias`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const datos = await res.json();
    if (!Array.isArray(datos)) throw new Error('la respuesta no es un array');
    for (const campo of ['id', 'tipo', 'descripcion_tipo', 'lat', 'lon']) {
      if (datos.length > 0 && !(campo in datos[0])) throw new Error(`falta el campo "${campo}" en la respuesta`);
    }
  });

  await check('buscar por carretera o municipio filtra el mapa y sugiere coincidencias', () =>
    withPage(async (page) => {
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      const totalInicial = await page.locator('.leaflet-interactive').count();
      await page.fill('#buscador-input', 'madrid');
      await page.waitForTimeout(200);
      const totalFiltrado = await page.locator('.leaflet-interactive').count();
      if (totalFiltrado === 0) throw new Error('"madrid" no dio ningún resultado');
      if (totalFiltrado > totalInicial) throw new Error('el filtro debería reducir o mantener el número de marcadores, no aumentarlo');
      const sugerencias = await page.locator('#buscador-sugerencias li').count();
      if (sugerencias === 0) throw new Error('no aparecieron sugerencias para "madrid"');
    })
  );

  await check('un término de búsqueda sin coincidencias muestra "Sin resultados"', () =>
    withPage(async (page) => {
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      await page.fill('#buscador-input', 'zzzznoexistezzzz');
      await page.waitForTimeout(200);
      if ((await page.locator('.leaflet-interactive').count()) !== 0) throw new Error('quedaron marcadores visibles');
      if (await page.locator('#buscador-sin-resultados').isHidden()) throw new Error('no se mostró el aviso de "Sin resultados"');
    })
  );

  await check('los filtros de la leyenda ocultan y vuelven a mostrar los marcadores', () =>
    withPage(async (page) => {
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      const total = await page.locator('.leaflet-interactive').count();
      for (const bucket of ['obras', 'accidente', 'resto', 'highest']) {
        await page.click(`input[data-bucket="${bucket}"]`);
      }
      if ((await page.locator('.leaflet-interactive').count()) !== 0) throw new Error('quedaron marcadores con todos los filtros desmarcados');
      for (const bucket of ['obras', 'accidente', 'resto', 'highest']) {
        await page.click(`input[data-bucket="${bucket}"]`);
      }
      const totalTrasRemarcar = await page.locator('.leaflet-interactive').count();
      if (totalTrasRemarcar !== total) throw new Error(`se esperaban ${total} marcadores tras remarcar todo, hay ${totalTrasRemarcar}`);
    })
  );

  if (incidenciaDePrueba) {
    await check('tocar un marcador abre su popup y actualiza la URL con ?id=', () =>
      withPage(async (page) => {
        await page.goto(baseUrl);
        await esperarIncidenciasCargadas(page);
        await page.locator('.leaflet-interactive').first().click({ force: true });
        await page.waitForSelector('.leaflet-popup-content', { timeout: 5_000 });
        const texto = await page.locator('.leaflet-popup-content').innerText();
        if (!texto.includes('Municipio') && !texto.includes('Carretera')) {
          throw new Error('el popup no muestra los detalles esperados');
        }
        const id = new URL(page.url()).searchParams.get('id');
        if (!id) throw new Error('la URL no se actualizó con ?id= al abrir el popup');
      })
    );

    await check('compartir una incidencia copia su enlace al portapapeles', () =>
      withPage(async (page, context) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto(baseUrl);
        await esperarIncidenciasCargadas(page);
        await page.locator('.leaflet-interactive').first().click({ force: true });
        await page.waitForSelector('.popup-compartir', { timeout: 5_000 });
        await page.click('.popup-compartir');
        await page.waitForFunction(
          () => document.querySelector('.popup-compartir')?.innerHTML.includes('M5 13l4 4L19 7'),
          { timeout: 2_000 }
        );
        const idEnUrl = new URL(page.url()).searchParams.get('id');
        const portapapeles = await page.evaluate(() => navigator.clipboard.readText());
        if (!portapapeles.includes(`id=${idEnUrl}`)) {
          throw new Error(`el portapapeles no tiene el enlace esperado: "${portapapeles}"`);
        }
      })
    );

    await check('un enlace directo (?id=) abre esa incidencia automáticamente', () =>
      withPage(async (page) => {
        await page.goto(`${baseUrl}/?id=${incidenciaDePrueba.id}`);
        await esperarIncidenciasCargadas(page);
        await page.waitForSelector('.leaflet-popup-content', { timeout: 5_000 });
        const texto = await page.locator('.leaflet-popup-content').innerText();
        if (!texto.includes(incidenciaDePrueba.carretera || incidenciaDePrueba.municipio || '')) {
          throw new Error('el popup abierto no corresponde a la incidencia enlazada');
        }
      })
    );
  } else {
    skip('tocar un marcador / compartir / enlace directo', 'no hay ninguna incidencia activa en Madrid ahora mismo');
  }

  await check('un ?id= que ya no existe avisa en vez de fallar', () =>
    withPage(async (page) => {
      await page.goto(`${baseUrl}/?id=999999999999`);
      await page.waitForFunction(() => (document.getElementById('estado')?.textContent.length ?? 0) > 0);
      await page.waitForTimeout(500);
      const estado = await page.locator('#estado').innerText();
      if (!estado.includes('ya no está activa')) throw new Error(`estado inesperado: "${estado}"`);
    })
  );

  await check('la geolocalización marca la ubicación y añade la distancia a los popups', () =>
    withPage(async (page, context) => {
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 40.4168, longitude: -3.7038 }); // Puerta del Sol
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      await page.click('#btn-ubicacion');
      await page.waitForSelector('.marcador-ubicacion', { timeout: 10_000 });

      if ((await page.locator('.leaflet-interactive:not(.marcador-ubicacion)').count()) > 0) {
        await page.locator('.leaflet-interactive:not(.marcador-ubicacion)').first().click({ force: true });
        await page.waitForSelector('.leaflet-popup-content', { timeout: 5_000 });
        const texto = await page.locator('.leaflet-popup-content').innerText();
        if (!texto.includes('Distancia')) throw new Error('el popup no muestra la distancia tras geolocalizar');
      }
    })
  );

  await check('el panel de ayuda abre, mide el estado de la API, y cierra sin errores', () =>
    withPage(async (page) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      await page.click('#help-open');
      await page.waitForSelector('.help-panel');
      await page.waitForFunction(
        () => document.querySelectorAll('.api-status-row__value--pending').length === 0,
        { timeout: 15_000 }
      );
      const filas = await page.locator('.api-status-row').count();
      if (filas !== 1) throw new Error(`se esperaba 1 fila de estado de la API, hay ${filas}`);
      await page.click('#help-close');
      if (errors.length) throw new Error(errors.join(' | '));
    })
  );

  await check('la vista en lista muestra las mismas incidencias que el mapa', () =>
    withPage(async (page) => {
      await page.goto(baseUrl);
      await esperarIncidenciasCargadas(page);
      const totalMapa = await page.locator('.leaflet-interactive').count();
      await page.click('#lista-open');
      // No ".help-panel" a secas: esa clase la comparten los dos overlays (ayuda y lista), y
      // con el de ayuda siempre presente-pero-oculto en el DOM, el selector sería ambiguo.
      await page.waitForSelector('.lista-panel');
      const totalLista = await page.locator('.lista-item').count();
      if (totalLista !== totalMapa) throw new Error(`el mapa tiene ${totalMapa} marcadores pero la lista muestra ${totalLista}`);

      const distanciaDeshabilitada = await page.locator('.lista-orden-btn[data-orden="distancia"]').isDisabled();
      if (!distanciaDeshabilitada) throw new Error('el orden por distancia debería empezar deshabilitado sin geolocalización');

      if (totalLista > 0) {
        await page.locator('.lista-item__boton').first().click();
        await page.waitForTimeout(200);
        if (await page.locator('#lista-overlay').isVisible()) throw new Error('la lista no se cerró al tocar una fila');
        if (await page.locator('.leaflet-popup-content').count() === 0) throw new Error('no se abrió ningún popup al tocar una fila de la lista');
      }
    })
  );

  await check('el service worker se registra', () =>
    withPage(async (page) => {
      await page.goto(baseUrl);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 10_000 });
    })
  );
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => r.status === 'FAIL');
console.log(
  `\n${results.length - failed.length - results.filter((r) => r.status === 'SKIP').length} OK · ${results.filter((r) => r.status === 'SKIP').length} omitidas · ${failed.length} fallidas`
);
process.exitCode = failed.length > 0 ? 1 : 0;

// --- helpers ---

// El feed de la DGT es un XML real de varios MB descargado y parseado en cada petición, no
// instantáneo — 1 reintento con una pequeña pausa absorbe un timeout o un hipo de red
// puntuales sin dejar de detectar un fallo persistente de verdad.
async function check(name, fn, { retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
      console.log(`✓ ${name}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        console.log(`  (reintentando "${name}" tras: ${err.message})`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  results.push({ name, status: 'FAIL', error: lastErr.message });
  console.log(`✗ ${name}\n  ${lastErr.message}`);
}

function skip(name, reason) {
  results.push({ name, status: 'SKIP', reason });
  console.log(`- ${name} (omitido: ${reason})`);
}

async function withPage(fn) {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await fn(page, context);
  } finally {
    await context.close();
  }
}

// Espera a que #estado deje de decir "Cargando…"/"Actualizando…" — el mismo punto en el que
// cualquier check puede empezar a mirar marcadores/popups con garantías.
async function esperarIncidenciasCargadas(page) {
  await page.waitForFunction(
    () => document.getElementById('estado')?.textContent.includes('incidencias'),
    { timeout: 15_000 }
  );
}

async function obtenerIncidenciaDePrueba() {
  const res = await fetch(`${baseUrl}/api/incidencias`);
  const datos = await res.json();
  return datos.find((i) => typeof i.lat === 'number' && typeof i.lon === 'number') || null;
}

function makeVercelRes(res) {
  return {
    _status: 200,
    status(code) {
      this._status = code;
      return this;
    },
    setHeader(...args) {
      res.setHeader(...args);
    },
    json(body) {
      res.writeHead(this._status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    },
  };
}

function startServer() {
  return new Promise((resolve) => {
    const httpServer = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');

      if (url.pathname === '/api/incidencias') {
        return incidenciasHandler(req, makeVercelRes(res));
      }

      const rutaSinQuery = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = path.join(ROOT, 'public', rutaSinQuery);
      const ext = path.extname(filePath);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    httpServer.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
}
