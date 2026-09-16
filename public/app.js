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

  const ICON_HELP =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><g transform="translate(12 12) scale(1.35) translate(-12 -12)"><path d="M9.4 9.6c0-1.9 1.6-3.3 2.7-3.3 2 0 3.4 1.4 3.4 3.1 0 1.3-.7 2.1-1.8 2.8-.9.6-1.3 1-1.3 2v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.1" cy="16.9" r="1.05" fill="currentColor"/></g></svg>';
  const ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

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

  // El "bucket" es la categoría visual real de una incidencia (la que decide su color en el
  // mapa): severidad máxima manda sobre el tipo, igual que en pintarIncidencias. Se reutiliza
  // tal cual para los filtros de la leyenda, así una incidencia con severidad máxima se
  // oculta con el filtro "Severidad máxima" aunque su tipo de fondo sea "Obras", por ejemplo
  // — coherente con que ya se ve de ese color en el mapa, no del naranja de obras.
  function bucketDe(incidencia) {
    return incidencia.severidad === 'highest' ? 'highest' : categoriaDe(incidencia.tipo);
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

      const bucket = bucketDe(incidencia);
      if (!bucketsVisibles.has(bucket)) return;

      const esHighest = bucket === 'highest';

      const marcador = L.circleMarker([incidencia.lat, incidencia.lon], {
        radius: esHighest ? 10 : 7,
        color: esHighest ? '#ffffff' : '#1a1a1a',
        weight: esHighest ? 2 : 1,
        fillColor: COLORES[bucket],
        fillOpacity: 0.9,
        className: esHighest ? 'marcador-highest' : '',
      });

      marcador.bindPopup(construirPopup(incidencia));
      marcador.addTo(capaIncidencias);
    });
  }

  // Filtros de la leyenda: todos los buckets visibles por defecto. Se guardan las últimas
  // incidencias recibidas para poder re-pintar al cambiar un filtro sin volver a pedir el
  // feed — cambiar qué se ve no debería depender de la red ni esperar al próximo refresco.
  const bucketsVisibles = new Set(['obras', 'accidente', 'resto', 'highest']);
  let ultimasIncidencias = [];

  document.querySelectorAll('.filtro-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const bucket = checkbox.dataset.bucket;
      if (checkbox.checked) bucketsVisibles.add(bucket);
      else bucketsVisibles.delete(bucket);
      pintarIncidencias(ultimasIncidencias);
    });
  });

  async function cargarIncidencias() {
    btnRefrescar.disabled = true;
    estadoEl.textContent = 'Actualizando…';

    try {
      const respuesta = await fetch(API_URL);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);

      const incidencias = await respuesta.json();
      ultimasIncidencias = incidencias;
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

  // Panel de ayuda: mismo patrón de accesibilidad que en BusYa (bloqueo de scroll del fondo,
  // foco atrapado dentro del panel, se guarda y se devuelve el foco al cerrar, Escape cierra,
  // tocar fuera del panel cierra).
  const helpOpenBtn = document.getElementById('help-open');
  const helpCloseBtn = document.getElementById('help-close');
  const helpOverlay = document.getElementById('help-overlay');
  const helpPanel = helpOverlay.querySelector('.help-panel');

  helpOpenBtn.innerHTML = ICON_HELP;
  helpCloseBtn.innerHTML = ICON_CLOSE;

  let lockedScrollY = 0;

  function lockBodyScroll() {
    lockedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.style.width = '100%';
  }

  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, lockedScrollY);
  }

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocusedBeforeHelp = null;

  function trapFocusInPanel(event, panel) {
    const focusable = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Estado de la API: mide en directo cuánto tarda /api/incidencias en responder, dentro del
  // propio panel de ayuda (mismo patrón que el panel "Estado de las APIs" de BusYa, pero como
  // una sección más aquí en vez de un overlay aparte, ya que TráficoYa solo tiene una API).
  const apiStatusListEl = document.getElementById('api-status-list');
  const apiStatusRecheckBtn = document.getElementById('api-status-recheck');

  const API_STATUS_CHECKS = [{ name: 'DGT · incidencias', url: API_URL }];

  // Solo mide si la petición completa a tiempo (res.ok) y cuánto tarda — no si el feed de la
  // DGT tiene incidencias en Madrid ahora mismo (0 incidencias también es una respuesta válida).
  async function measureApiLatency({ name, url }) {
    const start = performance.now();
    try {
      const res = await fetch(url);
      const elapsedMs = Math.round(performance.now() - start);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return { name, elapsedMs, ok: false, message: payload.error || `Error ${res.status}` };
      }
      return { name, elapsedMs, ok: true };
    } catch (err) {
      return { name, elapsedMs: Math.round(performance.now() - start), ok: false, message: err.message };
    }
  }

  function loadingDotsHtml(label) {
    return `<span class="loading-dots" role="status" aria-label="${label}"><span class="loading-dots__dot"></span><span class="loading-dots__dot"></span><span class="loading-dots__dot"></span></span>`;
  }

  function renderApiStatusRow(name, valueText, valueClass) {
    const li = document.createElement('li');
    li.className = 'api-status-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'api-status-row__name';
    nameEl.textContent = name;

    const valueEl = document.createElement('span');
    valueEl.className = `api-status-row__value ${valueClass}`;
    if (valueClass === 'api-status-row__value--pending') {
      valueEl.innerHTML = loadingDotsHtml('Comprobando');
    } else {
      valueEl.textContent = valueText;
    }

    li.append(nameEl, valueEl);
    return li;
  }

  async function checkApiStatus() {
    apiStatusListEl.innerHTML = '';
    for (const check of API_STATUS_CHECKS) {
      apiStatusListEl.appendChild(renderApiStatusRow(check.name, '', 'api-status-row__value--pending'));
    }

    const results = await Promise.all(API_STATUS_CHECKS.map(measureApiLatency));

    apiStatusListEl.innerHTML = '';
    for (const result of results) {
      if (!result.ok) {
        apiStatusListEl.appendChild(renderApiStatusRow(result.name, result.message || 'Error', 'api-status-row__value--error'));
        continue;
      }
      const valueClass = result.elapsedMs < 1000 ? 'api-status-row__value--ok' : 'api-status-row__value--slow';
      apiStatusListEl.appendChild(renderApiStatusRow(result.name, `${result.elapsedMs} ms`, valueClass));
    }
  }

  apiStatusRecheckBtn.addEventListener('click', checkApiStatus);

  function openHelp() {
    lastFocusedBeforeHelp = document.activeElement;
    helpOverlay.hidden = false;
    lockBodyScroll();
    helpCloseBtn.focus();
    checkApiStatus();
  }

  function closeHelp() {
    if (helpOverlay.hidden) return;
    helpOverlay.hidden = true;
    unlockBodyScroll();
    if (lastFocusedBeforeHelp && document.contains(lastFocusedBeforeHelp)) {
      lastFocusedBeforeHelp.focus();
    }
    lastFocusedBeforeHelp = null;
  }

  helpOpenBtn.addEventListener('click', openHelp);
  helpCloseBtn.addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', (event) => {
    if (event.target === helpOverlay) closeHelp();
  });

  // El anillo de foco de .user-is-tabbing (ver style.css) no se deja en manos del
  // :focus-visible nativo: openHelp() mueve el foco al ✕ con .focus() incluso al abrir el
  // panel con un toque, y algunos navegadores móviles pintan igualmente su anillo por
  // defecto en ese caso. Se controla a mano: solo cuenta como "usando teclado" tras un Tab
  // real, y cualquier puntero (ratón o toque) lo desactiva enseguida.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeHelp();
      return;
    }
    if (event.key === 'Tab') {
      document.body.classList.add('user-is-tabbing');
      if (!helpOverlay.hidden) trapFocusInPanel(event, helpPanel);
    }
  });
  document.addEventListener('mousedown', () => document.body.classList.remove('user-is-tabbing'));
  document.addEventListener('touchstart', () => document.body.classList.remove('user-is-tabbing'), { passive: true });

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
