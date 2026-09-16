(function () {
  const API_URL = '/api/incidencias';
  const INTERVALO_REFRESCO_MS = 3 * 60 * 1000; // 3 minutos

  const COLORES = {
    obras: '#ff8c00',
    accidente: '#e63946',
    resto: '#4a90d9',
    highest: '#c1121f',
  };

  const CATEGORIA_POR_TIPO = {
    roadMaintenance: 'obras',
    roadOrCarriagewayOrLaneManagement: 'obras',
    accident: 'accidente',
    infrastructureDamageObstruction: 'accidente',
  };

  const estadoEl = document.getElementById('estado');
  const btnRefrescar = document.getElementById('btn-refrescar');

  const mapa = L.map('mapa').setView([40.45, -3.7], 9);

  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    {
      attribution:
        'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 16,
    }
  ).addTo(mapa);

  const capaIncidencias = L.layerGroup().addTo(mapa);

  function categoriaDe(tipo) {
    return CATEGORIA_POR_TIPO[tipo] || 'resto';
  }

  function formatFecha(iso) {
    if (!iso) return null;
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return null;
    return fecha.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }

  function construirPopup(incidencia) {
    const inicio = formatFecha(incidencia.fecha_inicio);
    const fin = formatFecha(incidencia.fecha_fin);

    const filas = [
      incidencia.carretera ? `<dt>Carretera</dt><dd>${incidencia.carretera}</dd>` : '',
      incidencia.municipio ? `<dt>Municipio</dt><dd>${incidencia.municipio}</dd>` : '',
      inicio ? `<dt>Inicio</dt><dd>${inicio}</dd>` : '',
      fin ? `<dt>Fin previsto</dt><dd>${fin}</dd>` : '',
    ].join('');

    const badge =
      incidencia.severidad === 'highest'
        ? '<span class="badge-severidad">Severidad máxima</span>'
        : '';

    return `
      <div class="popup-incidencia">
        <h3>${incidencia.descripcion_tipo || 'Incidencia'}</h3>
        <dl>${filas}</dl>
        ${badge}
      </div>
    `;
  }

  function pintarIncidencias(incidencias) {
    capaIncidencias.clearLayers();

    incidencias.forEach((incidencia) => {
      if (typeof incidencia.lat !== 'number' || typeof incidencia.lon !== 'number') return;

      const esHighest = incidencia.severidad === 'highest';
      const categoria = categoriaDe(incidencia.tipo);
      const color = esHighest ? COLORES.highest : COLORES[categoria];

      const marcador = L.circleMarker([incidencia.lat, incidencia.lon], {
        radius: esHighest ? 10 : 7,
        color: esHighest ? '#ffffff' : '#1a1a1a',
        weight: esHighest ? 2 : 1,
        fillColor: color,
        fillOpacity: 0.9,
        className: esHighest ? 'marcador-highest' : '',
      });

      marcador.bindPopup(construirPopup(incidencia));
      marcador.addTo(capaIncidencias);
    });
  }

  async function cargarIncidencias() {
    btnRefrescar.disabled = true;
    estadoEl.textContent = 'Actualizando…';

    try {
      const respuesta = await fetch(API_URL);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

      const incidencias = await respuesta.json();
      pintarIncidencias(incidencias);

      const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      estadoEl.textContent = `${incidencias.length} incidencias · actualizado ${hora}`;
    } catch (error) {
      console.error('Error cargando incidencias:', error);
      estadoEl.textContent = 'Error al cargar incidencias. Reintentando en breve…';
    } finally {
      btnRefrescar.disabled = false;
    }
  }

  btnRefrescar.addEventListener('click', cargarIncidencias);

  cargarIncidencias();
  setInterval(cargarIncidencias, INTERVALO_REFRESCO_MS);

  // Cachea el shell de la app (ver sw.js) para que la PWA instalada cargue al instante y
  // funcione sin conexión. Si el registro falla (p.ej. servido por HTTP en algún entorno
  // local) no es grave: se registra en consola y ya está, la app sigue funcionando igual.
  if ('serviceWorker' in navigator) {
    const updateBanner = document.getElementById('update-banner');
    const updateReloadBtn = document.getElementById('update-reload-btn');

    // En la primera visita de siempre no hay ningún controller todavía; clients.claim() del
    // propio sw.js hace que ESA primera instalación también dispare "controllerchange" más
    // abajo, aunque no sea ninguna actualización real. Sin esta comprobación, cualquiera que
    // abriera la app por primera vez vería el aviso de "versión nueva disponible" sin sentido.
    const hadControllerBeforeRegister = Boolean(navigator.serviceWorker.controller);

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
    });

    // sw.js llama a skipWaiting()/clients.claim(), así que una versión nueva toma el control
    // de una pestaña ya abierta de inmediato — pero esa pestaña sigue con el html/css/js
    // antiguo ya cargado en memoria hasta que se recarga. "controllerchange" se dispara justo
    // en ese momento; en vez de recargar sola (podría cortar de golpe un popup abierto o un
    // refresco a medias), se avisa con un botón y se recarga cuando el usuario quiera. Con
    // guarda para no mostrar el aviso dos veces, ya que el evento en teoría puede repetirse.
    let updateAvailable = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateAvailable || !hadControllerBeforeRegister) return;
      updateAvailable = true;
      updateBanner.hidden = false;
    });

    updateReloadBtn.addEventListener('click', () => window.location.reload());

    // El navegador solo revisa sw.js en busca de cambios según su propio calendario (más o
    // menos cada 24h, o al navegar) — para una PWA que se reabre desde segundo plano en vez
    // de recargarse, eso puede dejarla desactualizada mucho más tiempo del deseado. Volver a
    // comprobar cada vez que la pestaña vuelve a ser visible detecta antes las novedades.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => reg && reg.update());
      }
    });
  }
})();
