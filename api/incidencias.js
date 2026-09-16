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

  return {
    lat,
    lon,
    provincia: ext['lse:province'] ?? null,
    municipio: ext['lse:municipality'] ?? null,
  };
}

function extraerUbicacion(locationReference) {
  if (!locationReference) return null;

  const tipo = locationReference['@_xsi:type'];
  const carretera =
    locationReference['loc:supplementaryPositionalDescription']?.[
      'loc:roadInformation'
    ]?.['loc:roadName'] ?? null;

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

  return { carretera, desde, hasta };
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
    isArray: (nombre) => ['sit:situation', 'sit:situationRecord'].includes(nombre),
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

      const tiempos = validez?.['com:validityTimeSpecification'];

      const etiquetaBase = etiquetaCausa(causeType);
      const etiquetaExtra = etiquetaDetalle(detalle);
      const descripcionTipo = etiquetaExtra
        ? `${etiquetaBase}: ${etiquetaExtra}`
        : etiquetaBase;

      incidencias.push({
        id: registro['@_id'] ?? situacion['@_id'],
        tipo: causeType,
        descripcion_tipo: descripcionTipo,
        carretera: ubicacion.carretera,
        lat: coordenada.lat,
        lon: coordenada.lon,
        municipio: ubicacion.hasta?.municipio || ubicacion.desde?.municipio || null,
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
