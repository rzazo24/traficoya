const { XMLParser } = require('fast-xml-parser');

const DGT_FEED_URL =
  'https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml';

const PROVINCIA_OBJETIVO = 'Madrid';

// Traducciones de sit:causeType (DATEX2) a español.
const CAUSE_LABELS = {
  abnormalTraffic: 'Tráfico anormal',
  accident: 'Accidente',
  environmentalObstruction: 'Obstáculo ambiental',
  infrastructureDamageObstruction: 'Daños en la infraestructura',
  obstruction: 'Obstáculo en la vía',
  poorEnvironment: 'Condiciones ambientales adversas',
  publicEvent: 'Evento público',
  roadMaintenance: 'Obras de mantenimiento',
  roadOrCarriagewayOrLaneManagement: 'Gestión de carriles/calzada',
  vehicleObstruction: 'Vehículo obstaculizando la vía',
};

// Traducciones del valor "detallado" (segundo nivel de sit:detailedCauseType),
// cubriendo los valores habituales de las distintas enumeraciones DATEX2.
const DETAIL_LABELS = {
  // abnormalTrafficType
  heavyTraffic: 'tráfico denso',
  slowTraffic: 'tráfico lento',
  stationaryTraffic: 'tráfico detenido',
  queuingTraffic: 'retenciones',
  // accidentType
  accident: 'accidente',
  collision: 'colisión',
  multiVehiclePileUp: 'colisión múltiple',
  jackKnifedArticulatedVehicle: 'vehículo articulado cruzado en la vía',
  // environmentalObstructionType
  avalanches: 'aludes',
  fallenTrees: 'árboles caídos',
  flooding: 'inundación',
  forestFire: 'incendio forestal',
  rockfalls: 'desprendimientos',
  // infrastructureDamageType
  damagedRoadSurface: 'firme dañado',
  damagedSignsOrSignals: 'señalización dañada',
  // nonWeatherRelatedRoadConditionType
  roadSurfaceInPoorCondition: 'firme en mal estado',
  iceOnRoad: 'hielo en la calzada',
  looseChippings: 'gravilla suelta',
  mudOnRoad: 'barro en la calzada',
  oilOnRoad: 'aceite en la calzada',
  // obstructionType
  objectOnTheRoad: 'objeto en la calzada',
  obstructionOnTheRoad: 'obstáculo en la calzada',
  animalOnRoad: 'animal en la calzada',
  // poorEnvironmentType
  badWeather: 'mal tiempo',
  fog: 'niebla',
  smokeHazard: 'humo',
  strongWinds: 'viento fuerte',
  visibilityReduced: 'visibilidad reducida',
  heavyFrost: 'heladas',
  heavySnowfall: 'nevadas intensas',
  // publicEventType
  majorEvent: 'evento de gran afluencia',
  sportsMeeting: 'evento deportivo',
  fair: 'feria',
  marketOpen: 'mercadillo',
  // roadMaintenanceType
  roadworks: 'obras en la calzada',
  constructionWork: 'obras de construcción',
  maintenanceWork: 'trabajos de mantenimiento',
  resurfacingWork: 'trabajos de repavimentación',
  // roadOrCarriagewayOrLaneManagementType
  carriagewayClosures: 'cierre de calzada',
  doNotUseSpecifiedLanesOrCarriageways: 'carriles cerrados al tráfico',
  intermittentShortTermClosures: 'cortes intermitentes de corta duración',
  laneClosures: 'cierre de carril',
  lanesDeviated: 'carriles desviados',
  narrowLanes: 'carriles estrechos',
  newRoadworksLayout: 'nueva ordenación por obras',
  other: 'otras afecciones',
  reducedLanes: 'reducción de carriles',
  roadClosed: 'carretera cortada',
  singleAlternateLineTraffic: 'circulación alternativa por un solo carril',
  useOfSpecifiedLanesOrCarriagewaysAllowed: 'uso permitido de carriles habilitados',
  weightRestrictionInOperation: 'restricción de peso',
  // speedManagementType
  convoySpeedsInOperation: 'circulación en convoy',
  speedRestrictionInOperation: 'restricción de velocidad',
  temporarySpeedLimit: 'límite de velocidad temporal',
  // vehicleObstructionType
  brokenDownVehicle: 'vehículo averiado',
  vehicleOnFire: 'vehículo incendiado',
  vehicleStuck: 'vehículo atrapado',
  // generalInstructionToRoadUsersType
  driveCarefully: 'circular con precaución',
  followDiversionSigns: 'seguir desvío señalizado',
  keepAtSafeDistance: 'mantener distancia de seguridad',
  reduceSpeedNow: 'reducir la velocidad',
};

// Además de sit:cause.sit:detailedCauseType (el porqué: "roadworks"), cada tipo concreto de
// situationRecord trae su propio campo hermano de detalle, con nombre distinto según
// sit:@_xsi:type — mismo patrón documentado para detailedCauseType, pero un campo aparte e
// independiente, no una alternativa. Comprobado contra el feed en vivo de Madrid: en el ~87% de
// las incidencias activas este campo tiene un valor *distinto* de detailedCauseType (ej. la
// causa es "obras en la calzada" pero este campo añade "cierre de carril", la restricción
// concreta), así que aporta información real, no redundante.
// sit:genericSituationRecordName (de sit:GenericSituationRecord) se excluye a propósito: es una
// etiqueta de "tipo de registro" genérica, no un detalle — el único valor visto en vivo es
// "incident", que no añade nada ("Vehículo atrapado · incidencia" no dice más que "Vehículo
// atrapado" solo) — mismo criterio que ya se aplica a "unspecifiedCarriageway" etc. más abajo.
const CAMPOS_TIPO_PROPIO = [
  'sit:roadOrCarriagewayOrLaneManagementType',
  'sit:nonWeatherRelatedRoadConditionType',
  'sit:abnormalTrafficType',
  'sit:obstructionType',
];

function extraerTipoPropio(registro) {
  for (const campo of CAMPOS_TIPO_PROPIO) {
    if (typeof registro[campo] === 'string') return registro[campo];
  }
  return null;
}

// Sentido de circulación (loc:tpegDirection). "unknown" y "both" se omiten a propósito: no
// aportan nada útil que mostrar ("sentido desconocido" no ayuda a nadie).
const DIRECCION_LABELS = {
  northBound: 'sentido norte',
  southBound: 'sentido sur',
  eastBound: 'sentido este',
  westBound: 'sentido oeste',
  northEastBound: 'sentido noreste',
  northWestBound: 'sentido noroeste',
  southEastBound: 'sentido sureste',
  southWestBound: 'sentido suroeste',
};

// Tipo de calzada (loc:carriageway). "unspecifiedCarriageway"/"mainCarriageway" (la calzada
// principal, el caso más común) se omiten a propósito: no añaden información sobre la
// incidencia frente a no decir nada.
const CALZADA_LABELS = {
  entrySlipRoad: 'vía de incorporación',
  exitSlipRoad: 'vía de salida',
  serviceRoad: 'vía de servicio',
  connectingCarriageway: 'vía de conexión',
  parallelCarriageway: 'calzada paralela',
  climbingLane: 'carril de ascenso',
};

// Carril afectado (loc:laneUsage). "allLanesCompleteCarriageway" (todos los carriles) se omite
// a propósito, por el mismo motivo que unspecifiedCarriageway arriba.
const CARRIL_LABELS = {
  leftLane: 'carril izquierdo',
  rightLane: 'carril derecho',
  middleLane: 'carril central',
  middleLeftLane: 'carril central izquierdo',
  middleRightLane: 'carril central derecho',
  turningLane: 'carril de giro',
  carPoolLane: 'carril VAO',
  tidalFlowLane: 'carril reversible',
  centralReservation: 'mediana',
  hardShoulder: 'arcén',
  leftHardShoulder: 'arcén izquierdo',
  rightHardShoulder: 'arcén derecho',
};

// Algunos valores de enumeración DATEX2 que no están en el esquema base vienen como
// "_extended" en el texto de la etiqueta, con el valor real en el atributo _extendedValue —
// visto en vivo en loc:laneUsage (ej. <loc:laneUsage _extendedValue="leftHardShoulder">
// _extended</loc:laneUsage>). fast-xml-parser convierte eso en un objeto con "@_extendedValue"
// en vez de en un string plano, así que hay que comprobar ambos casos.
function valorConExtendido(nodo) {
  // loc:carriageway se fuerza a array en el parser (ver isArray más abajo) porque puede
  // repetirse como hermano — pero eso también envuelve en un array de un elemento la etiqueta
  // interna del mismo nombre que lleva el valor real (<loc:carriageway><loc:carriageway>
  // exitSlipRoad</loc:carriageway>...), así que hay que desenvolverla aquí también.
  if (Array.isArray(nodo)) nodo = nodo[0];
  if (typeof nodo === 'string') return nodo;
  // El atributo XML se llama literalmente "_extendedValue" (con guion bajo inicial incluido en
  // el propio nombre), así que con attributeNamePrefix: '@_' el parser produce la clave
  // "@__extendedValue" (dos guiones bajos) — confirmado contra el feed en vivo. Un solo guion
  // bajo aquí (como estaba antes) nunca hace match, así que este escape hatch llevaba desde el
  // principio sin funcionar de verdad: cualquier carril venido por esta vía (arcenes, carriles
  // centrales) se perdía en silencio en vez de aparecer en "carril".
  if (nodo && typeof nodo === 'object' && nodo['@__extendedValue']) {
    return nodo['@__extendedValue'];
  }
  return null;
}

function humanizar(valorCamelCase) {
  if (!valorCamelCase || typeof valorCamelCase !== 'string') return null;
  const conEspacios = valorCamelCase.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return conEspacios.charAt(0).toLowerCase() + conEspacios.slice(1);
}

function etiquetaCausa(causeType) {
  return CAUSE_LABELS[causeType] || humanizar(causeType) || 'Incidencia';
}

function etiquetaDetalle(detailValue) {
  if (!detailValue) return null;
  return DETAIL_LABELS[detailValue] || humanizar(detailValue);
}

function extraerDetalleCausa(detailedCauseType) {
  if (!detailedCauseType || typeof detailedCauseType !== 'object') return null;
  const valor = Object.values(detailedCauseType).find(
    (v) => typeof v === 'string'
  );
  return valor || null;
}

function extraerPunto(nodoPunto) {
  if (!nodoPunto) return null;
  const coords = nodoPunto['loc:pointCoordinates'];
  if (!coords) return null;

  const lat = parseFloat(coords['loc:latitude']);
  const lon = parseFloat(coords['loc:longitude']);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;

  const ext =
    nodoPunto['loc:_tpegNonJunctionPointExtension']?.[
      'loc:extendedTpegNonJunctionPoint'
    ] || {};

  const km = parseFloat(ext['lse:kilometerPoint']);

  return {
    lat,
    lon,
    provincia: ext['lse:province'] ?? null,
    municipio: ext['lse:municipality'] ?? null,
    kilometro: Number.isNaN(km) ? null : km,
  };
}

// El carril/calzada afectado vive en loc:supplementaryPositionalDescription, fuera de los
// puntos from/to — es una propiedad del tramo completo, no de un extremo en concreto.
// loc:carriageway puede repetirse (una entrada para la vía de acceso, otra para el carril
// concreto de la calzada principal), forzado a array siempre en el parser para no tener que
// distinguir el caso de una sola entrada del de varias.
function extraerCarril(supplementaryPositionalDescription) {
  const entradas = supplementaryPositionalDescription?.['loc:carriageway'];
  if (!entradas) return null;

  const partes = [];
  for (const entrada of entradas) {
    const tipoCalzada = valorConExtendido(entrada['loc:carriageway']);
    if (tipoCalzada && CALZADA_LABELS[tipoCalzada]) partes.push(CALZADA_LABELS[tipoCalzada]);

    const carril = valorConExtendido(entrada['loc:lane']?.['loc:laneUsage']);
    if (carril && CARRIL_LABELS[carril]) partes.push(CARRIL_LABELS[carril]);
  }

  return partes.length ? partes.join(', ') : null;
}

// El sentido vive en el propio tpegLinearLocation/tpegPointLocation, con una ruta distinta
// según el tipo de ubicación (igual que el resto de extracción por tipo en esta función).
function extraerSentido(locationReference, tipo) {
  const nodoDireccion =
    tipo === 'loc:PointLocation'
      ? locationReference['loc:tpegPointLocation']?.['loc:tpegDirection']
      : locationReference['loc:tpegLinearLocation']?.['loc:tpegDirection'];

  const valor = valorConExtendido(nodoDireccion);
  return valor ? DIRECCION_LABELS[valor] ?? null : null;
}

function extraerUbicacion(locationReference) {
  if (!locationReference) return null;

  const tipo = locationReference['@_xsi:type'];
  const supDesc = locationReference['loc:supplementaryPositionalDescription'];
  const carretera = supDesc?.['loc:roadInformation']?.['loc:roadName'] ?? null;

  let desde = null;
  let hasta = null;

  if (tipo === 'loc:PointLocation') {
    const punto = locationReference['loc:tpegPointLocation']?.['loc:point'];
    desde = hasta = extraerPunto(punto);
  } else if (tipo === 'loc:SingleRoadLinearLocation') {
    const lineal = locationReference['loc:tpegLinearLocation'];
    desde = extraerPunto(lineal?.['loc:from']);
    hasta = extraerPunto(lineal?.['loc:to']);
  }

  return {
    carretera,
    desde,
    hasta,
    sentido: extraerSentido(locationReference, tipo),
    carril: extraerCarril(supDesc),
  };
}

function coordenadaMedia(desde, hasta) {
  if (desde && hasta) {
    return {
      lat: (desde.lat + hasta.lat) / 2,
      lon: (desde.lon + hasta.lon) / 2,
    };
  }
  return desde || hasta || null;
}

function parsearIncidencias(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (nombre) =>
      ['sit:situation', 'sit:situationRecord', 'loc:carriageway'].includes(nombre),
  });

  const doc = parser.parse(xml);
  const situaciones = doc?.['d2:payload']?.['sit:situation'] || [];

  const incidencias = [];

  for (const situacion of situaciones) {
    const registros = situacion['sit:situationRecord'] || [];
    const severidadSituacion = situacion['sit:overallSeverity'] ?? null;

    for (const registro of registros) {
      const validez = registro['sit:validity'];
      const estado = validez?.['com:validityStatus'];
      if (estado !== 'active') continue;

      const ubicacion = extraerUbicacion(registro['sit:locationReference']);
      if (!ubicacion) continue;

      const provincia =
        ubicacion.hasta?.provincia || ubicacion.desde?.provincia || null;
      if (provincia !== PROVINCIA_OBJETIVO) continue;

      const coordenada = coordenadaMedia(ubicacion.desde, ubicacion.hasta);
      if (!coordenada) continue;

      const causa = registro['sit:cause'];
      const causeType = causa?.['sit:causeType'] ?? null;
      const detalle = extraerDetalleCausa(causa?.['sit:detailedCauseType']);
      const tipoPropio = extraerTipoPropio(registro);

      const tiempos = validez?.['com:validityTimeSpecification'];

      const etiquetaBase = etiquetaCausa(causeType);
      // tipoPropio se ignora si coincide en crudo con "detalle" (mismo valor bajo dos nombres
      // de campo, en vez de dos piezas de información distintas) — ver CAMPOS_TIPO_PROPIO.
      const detallesExtra = [
        etiquetaDetalle(detalle),
        tipoPropio && tipoPropio !== detalle ? etiquetaDetalle(tipoPropio) : null,
      ].filter(Boolean);
      const descripcionTipo = detallesExtra.length
        ? `${etiquetaBase}: ${detallesExtra.join(' · ')}`
        : etiquetaBase;

      incidencias.push({
        id: registro['@_id'] ?? situacion['@_id'],
        tipo: causeType,
        descripcion_tipo: descripcionTipo,
        carretera: ubicacion.carretera,
        lat: coordenada.lat,
        lon: coordenada.lon,
        municipio: ubicacion.hasta?.municipio || ubicacion.desde?.municipio || null,
        kilometro: ubicacion.hasta?.kilometro ?? ubicacion.desde?.kilometro ?? null,
        sentido: ubicacion.sentido,
        carril: ubicacion.carril,
        fecha_inicio: tiempos?.['com:overallStartTime'] ?? null,
        fecha_fin: tiempos?.['com:overallEndTime'] ?? null,
        severidad: severidadSituacion || registro['sit:severity'] || null,
      });
    }
  }

  return incidencias;
}

module.exports = async (req, res) => {
  try {
    const respuesta = await fetch(DGT_FEED_URL);
    if (!respuesta.ok) {
      res.status(502).json({ error: `Feed DGT respondió ${respuesta.status}` });
      return;
    }

    const xml = await respuesta.text();
    const incidencias = parsearIncidencias(xml);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    res.status(200).json(incidencias);
  } catch (error) {
    console.error('Error obteniendo incidencias DGT:', error);
    res.status(500).json({ error: 'Error al obtener las incidencias' });
  }
};
