# 🚦 TráficoYa

Mapa en tiempo real de incidencias de tráfico en la Comunidad de Madrid, con datos abiertos de la DGT.

## Stack

- Frontend: HTML/CSS/JS vanilla (sin frameworks, sin build step) + [Leaflet](https://leafletjs.com/)
- Backend: función serverless de Node.js en Vercel (`api/incidencias.js`)
- Datos: feed DATEX2 v3.7 de la DGT (`https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml`)

## Estructura

```
traficoya/
├── api/
│   └── incidencias.js   # descarga el XML de la DGT, lo parsea y devuelve JSON filtrado a Madrid
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js           # mapa Leaflet, fetch a /api/incidencias, refresco periódico
├── package.json
├── vercel.json
└── README.md
```

## Desarrollo local

```bash
npm install
npx vercel dev
```

Esto sirve `public/` como estático y expone `api/incidencias.js` en `http://localhost:3000/api/incidencias`.

## Endpoint `/api/incidencias`

Devuelve un array JSON con las incidencias activas cuya provincia (`lse:province`) es Madrid:

```json
[
  {
    "id": "22832648",
    "tipo": "roadMaintenance",
    "descripcion_tipo": "Obras de mantenimiento: obras en la calzada",
    "carretera": "M-50",
    "lat": 40.3338,
    "lon": -3.6281,
    "municipio": "Madrid",
    "fecha_inicio": "2026-07-10T10:55:00.000+02:00",
    "fecha_fin": "2026-10-30T05:30:00.000+01:00",
    "severidad": null
  }
]
```

Para incidencias en tramo de carretera (con `loc:from`/`loc:to`), `lat`/`lon` es el punto medio del tramo. Se cachea 2 minutos (`s-maxage=120`) para no saturar el feed de la DGT.

## Despliegue

Proyecto listo para desplegar en Vercel sin configuración adicional (`vercel` / conectar el repo desde el dashboard).
