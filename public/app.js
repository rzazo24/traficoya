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
  const ICON_LOCATION =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ICON_SHARE =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  const capaUbicacion = L.layerGroup().addTo(mapa);

  // Marcador de cada incidencia por id, reconstruido en cada pintarIncidencias() igual que la
  // propia capa — sirve para poder abrir el popup correcto al cargar con ?id= en la URL.
  const marcadoresPorId = new Map();

  function idDesdeUrl() {
    return new URLSearchParams(location.search).get('id');
  }

  // replaceState, no pushState: abrir o cerrar popups no debería llenar el historial del
  // navegador con una entrada por cada marcador tocado, igual que el buscador tampoco lo hace.
  function actualizarUrlIncidencia(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set('id', id);
    else url.searchParams.delete('id');
    history.replaceState(null, '', url.pathname + url.search);
  }

  function enlaceIncidencia(id) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('id', id);
    return url.toString();
  }

  // Distinta de capaIncidencias a propósito: pintarIncidencias limpia y repinta esa capa en
  // cada refresco/filtro, y el marcador de "tu ubicación" no debe parpadear ni desaparecer
  // cada vez que eso ocurre.
  let ubicacionUsuario = null; // {lat, lon} o null si no se ha pedido/concedido

  function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function formatDistancia(km) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }

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

    const distancia = ubicacionUsuario
      ? formatDistancia(
          distanciaKm(ubicacionUsuario.lat, ubicacionUsuario.lon, incidencia.lat, incidencia.lon)
        )
      : null;

    const filas = [
      incidencia.carretera ? `<dt>Carretera</dt><dd>${incidencia.carretera}</dd>` : '',
      incidencia.sentido ? `<dt>Sentido</dt><dd>${incidencia.sentido}</dd>` : '',
      typeof incidencia.kilometro === 'number' ? `<dt>Punto kilométrico</dt><dd>Km ${incidencia.kilometro}</dd>` : '',
      incidencia.carril ? `<dt>Carril</dt><dd>${incidencia.carril}</dd>` : '',
      incidencia.municipio ? `<dt>Municipio</dt><dd>${incidencia.municipio}</dd>` : '',
      distancia ? `<dt>Distancia</dt><dd>${distancia} de tu ubicación</dd>` : '',
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
        <button type="button" class="popup-compartir" data-id="${incidencia.id}" aria-label="Compartir esta incidencia">${ICON_SHARE}</button>
      </div>
    `;
  }

  function flashBoton(boton, iconoTemporal) {
    const original = boton.innerHTML;
    boton.innerHTML = iconoTemporal;
    setTimeout(() => {
      boton.innerHTML = original;
    }, 1500);
  }

  // navigator.share (móvil, algunos navegadores de escritorio) abre el diálogo nativo de
  // compartir; si no existe, se copia el enlace al portapapeles y el propio botón hace de
  // confirmación visual (✓ un momento) en vez de un aviso aparte.
  async function compartirIncidencia(incidencia, boton) {
    const url = enlaceIncidencia(incidencia.id);
    const texto = `${incidencia.descripcion_tipo || 'Incidencia'} en ${incidencia.carretera || incidencia.municipio || 'Madrid'} — TráficoYa`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'TráficoYa', text: texto, url });
      } catch (error) {
        // El usuario cerró el diálogo nativo sin elegir nada — no es un error que avisar.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      flashBoton(boton, ICON_CHECK);
    } catch (error) {
      console.error('No se pudo copiar el enlace:', error);
    }
  }

  // Delegado en document en vez de un listener por popup: el contenido de cada popup es HTML
  // generado por Leaflet a partir del string de construirPopup, no nodos con listeners propios.
  document.addEventListener('click', (event) => {
    const boton = event.target.closest('.popup-compartir');
    if (!boton) return;
    const incidencia = ultimasIncidencias.find((i) => String(i.id) === boton.dataset.id);
    if (incidencia) compartirIncidencia(incidencia, boton);
  });

  // Sin tildes ni mayúsculas, para que "alcobendas"/"Alcobéndas" den con "Alcobendas" igual.
  function normalizarTexto(str) {
    return str
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  function coincideBusqueda(incidencia) {
    if (!textoBusqueda) return true;
    return (
      normalizarTexto(incidencia.carretera || '').includes(textoBusqueda) ||
      normalizarTexto(incidencia.municipio || '').includes(textoBusqueda)
    );
  }

  function incidenciaVisible(incidencia) {
    return (
      typeof incidencia.lat === 'number' &&
      typeof incidencia.lon === 'number' &&
      bucketsVisibles.has(bucketDe(incidencia)) &&
      coincideBusqueda(incidencia)
    );
  }

  // Devuelve las incidencias realmente pintadas (tras aplicar filtros de leyenda y búsqueda),
  // para que quien llama (el buscador) pueda encuadrar el mapa sobre ellas sin recalcular el
  // filtro por su cuenta.
  function pintarIncidencias(incidencias) {
    capaIncidencias.clearLayers();
    marcadoresPorId.clear();

    const visibles = incidencias.filter(incidenciaVisible);

    visibles.forEach((incidencia) => {
      const bucket = bucketDe(incidencia);
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
      // Refleja en la URL qué incidencia se está viendo, para que se pueda compartir el enlace
      // directo (ver enlaceIncidencia/compartirIncidencia) sin más que copiar la barra de
      // direcciones. Solo se limpia al cerrar si sigue siendo la incidencia actual en la URL —
      // si ya se abrió otra (p.ej. al tocar un marcador distinto sin cerrar antes), el cierre
      // "viejo" de la primera no debe borrar el id de la que se acaba de abrir.
      marcador.on('popupopen', () => actualizarUrlIncidencia(incidencia.id));
      marcador.on('popupclose', () => {
        if (idDesdeUrl() === String(incidencia.id)) actualizarUrlIncidencia(null);
      });
      marcador.addTo(capaIncidencias);
      marcadoresPorId.set(String(incidencia.id), marcador);
    });

    buscadorSinResultados.hidden = !textoBusqueda || visibles.length > 0;

    return visibles;
  }

  // Filtros de la leyenda: todos los buckets visibles por defecto. Se guardan las últimas
  // incidencias recibidas para poder re-pintar al cambiar un filtro sin volver a pedir el
  // feed — cambiar qué se ve no debería depender de la red ni esperar al próximo refresco.
  const bucketsVisibles = new Set(['obras', 'accidente', 'resto', 'highest']);
  let ultimasIncidencias = [];
  let textoBusqueda = '';

  document.querySelectorAll('.filtro-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const bucket = checkbox.dataset.bucket;
      if (checkbox.checked) bucketsVisibles.add(bucket);
      else bucketsVisibles.delete(bucket);
      pintarIncidencias(ultimasIncidencias);
    });
  });

  // Buscador por carretera/municipio: filtra al instante en cada tecla (barato, menos de un
  // centenar de incidencias), pero el encuadre del mapa a los resultados se retrasa un poco
  // (debounce) para no dar saltos de zoom en cada letra mientras se escribe.
  const buscadorInput = document.getElementById('buscador-input');
  const buscadorSugerencias = document.getElementById('buscador-sugerencias');
  const buscadorSinResultados = document.getElementById('buscador-sin-resultados');
  let debounceEncuadre = null;
  let sugerenciasActuales = [];
  let indiceSugerenciaActiva = -1;

  function encuadrarSobre(visibles) {
    if (visibles.length === 0) return;
    const bounds = L.latLngBounds(visibles.map((i) => [i.lat, i.lon]));
    mapa.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }

  // Sugerencias de carretera/municipio que ya coinciden con el texto y con los filtros de
  // tipo activos en la leyenda — así nunca se sugiere algo que llevaría a un mapa vacío por
  // culpa de un filtro de tipo, aunque el propio texto sí exista en los datos.
  function obtenerSugerencias(texto) {
    if (!texto) return [];
    const valores = new Set();
    ultimasIncidencias.forEach((incidencia) => {
      if (!bucketsVisibles.has(bucketDe(incidencia))) return;
      if (incidencia.carretera && normalizarTexto(incidencia.carretera).includes(texto)) {
        valores.add(incidencia.carretera);
      }
      if (incidencia.municipio && normalizarTexto(incidencia.municipio).includes(texto)) {
        valores.add(incidencia.municipio);
      }
    });
    return [...valores].sort((a, b) => a.localeCompare(b, 'es')).slice(0, 8);
  }

  function ocultarSugerencias() {
    buscadorSugerencias.hidden = true;
    buscadorSugerencias.innerHTML = '';
    sugerenciasActuales = [];
    indiceSugerenciaActiva = -1;
    buscadorInput.setAttribute('aria-expanded', 'false');
    buscadorInput.removeAttribute('aria-activedescendant');
  }

  function resaltarSugerencia() {
    [...buscadorSugerencias.children].forEach((li, indice) => {
      li.classList.toggle('activa', indice === indiceSugerenciaActiva);
    });
    if (indiceSugerenciaActiva >= 0) {
      buscadorInput.setAttribute('aria-activedescendant', `sugerencia-${indiceSugerenciaActiva}`);
      buscadorSugerencias.children[indiceSugerenciaActiva].scrollIntoView({ block: 'nearest' });
    } else {
      buscadorInput.removeAttribute('aria-activedescendant');
    }
  }

  function mostrarSugerencias(sugerencias) {
    sugerenciasActuales = sugerencias;
    indiceSugerenciaActiva = -1;
    buscadorSugerencias.innerHTML = sugerencias
      .map((valor, i) => `<li role="option" id="sugerencia-${i}">${valor}</li>`)
      .join('');
    buscadorSugerencias.hidden = sugerencias.length === 0;
    buscadorInput.setAttribute('aria-expanded', sugerencias.length > 0 ? 'true' : 'false');
  }

  function seleccionarSugerencia(valor) {
    buscadorInput.value = valor;
    textoBusqueda = normalizarTexto(valor);
    const visibles = pintarIncidencias(ultimasIncidencias);
    ocultarSugerencias();
    encuadrarSobre(visibles);
    buscadorInput.focus();
  }

  buscadorInput.addEventListener('input', () => {
    textoBusqueda = normalizarTexto(buscadorInput.value);
    const visibles = pintarIncidencias(ultimasIncidencias);
    mostrarSugerencias(obtenerSugerencias(textoBusqueda));

    clearTimeout(debounceEncuadre);
    if (!textoBusqueda || visibles.length === 0) return;
    debounceEncuadre = setTimeout(() => encuadrarSobre(visibles), 400);
  });

  // mousedown, no click: dispara antes que el blur del input, así que preventDefault aquí
  // evita que el input pierda el foco (y con él, que se oculten las sugerencias) antes de que
  // el click llegue a registrarse.
  buscadorSugerencias.addEventListener('mousedown', (event) => {
    const li = event.target.closest('li');
    if (!li) return;
    event.preventDefault();
    seleccionarSugerencia(li.textContent);
  });

  buscadorInput.addEventListener('keydown', (event) => {
    if (buscadorSugerencias.hidden) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      indiceSugerenciaActiva = Math.min(indiceSugerenciaActiva + 1, sugerenciasActuales.length - 1);
      resaltarSugerencia();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      indiceSugerenciaActiva = Math.max(indiceSugerenciaActiva - 1, -1);
      resaltarSugerencia();
    } else if (event.key === 'Enter' && indiceSugerenciaActiva >= 0) {
      event.preventDefault();
      seleccionarSugerencia(sugerenciasActuales[indiceSugerenciaActiva]);
    } else if (event.key === 'Escape') {
      ocultarSugerencias();
    }
  });

  // Tab fuera del buscador (sin pasar por el mousedown de arriba, que ya cubre el click)
  // también debe cerrar las sugerencias.
  document.querySelector('.buscador').addEventListener('focusout', (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) ocultarSugerencias();
  });

  // Geolocalización: pide la ubicación al navegador, la marca en el mapa (capaUbicacion, no
  // capaIncidencias, para que sobreviva a cada repintado) y centra la vista ahí. A partir de
  // ese momento construirPopup añade la distancia a cada incidencia — no hace falta volver a
  // pintar nada para que aparezca, se calcula la próxima vez que se abra un popup.
  const btnUbicacion = document.getElementById('btn-ubicacion');
  btnUbicacion.innerHTML = ICON_LOCATION;

  btnUbicacion.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      estadoEl.textContent = 'Tu navegador no admite geolocalización.';
      return;
    }

    btnUbicacion.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const { latitude, longitude, accuracy } = posicion.coords;
        ubicacionUsuario = { lat: latitude, lon: longitude };

        capaUbicacion.clearLayers();
        L.circle([latitude, longitude], {
          radius: accuracy,
          color: '#2196f3',
          weight: 1,
          fillColor: '#2196f3',
          fillOpacity: 0.15,
        }).addTo(capaUbicacion);
        L.circleMarker([latitude, longitude], {
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: '#2196f3',
          fillOpacity: 1,
          className: 'marcador-ubicacion',
        }).addTo(capaUbicacion);

        mapa.setView([latitude, longitude], 13);
        btnUbicacion.disabled = false;
        btnUbicacion.classList.add('activo');
      },
      (error) => {
        console.error('Error de geolocalización:', error);
        estadoEl.textContent =
          error.code === error.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado.'
            : 'No se pudo obtener tu ubicación.';
        btnUbicacion.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Solo se intenta una vez, en la primera carga — no en cada refresco de 3 minutos, o
  // reabriría el popup enlazado (y le robaría el foco al usuario) cada vez que llega el turno
  // del auto-refresco, aunque llevara un rato navegando tranquilamente por otro sitio del mapa.
  let enlaceInicialProcesado = false;

  function abrirIncidenciaDesdeUrl() {
    const id = idDesdeUrl();
    if (!id) return;

    const marcador = marcadoresPorId.get(id);
    if (!marcador) {
      estadoEl.textContent = 'La incidencia enlazada ya no está activa.';
      return;
    }
    mapa.setView(marcador.getLatLng(), 14);
    marcador.openPopup();
  }

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

      if (!enlaceInicialProcesado) {
        enlaceInicialProcesado = true;
        abrirIncidenciaDesdeUrl();
      }
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
