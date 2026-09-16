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
│   └── incidencias.js        # descarga el XML de la DGT, lo parsea y devuelve JSON filtrado a Madrid
├── public/
│   ├── index.html
│   ├── style.css
│   ├── app.js                # mapa Leaflet, fetch a /api/incidencias, refresco periódico, registro del SW
│   ├── sw.js                 # service worker: cachea el shell estático (nunca las incidencias en vivo)
│   ├── manifest.webmanifest
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       ├── icon-512-maskable.png
│       └── apple-touch-icon.png
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

## PWA

Instalable desde el navegador ("Añadir a pantalla de inicio" / el aviso de instalación de
Chrome) y funciona sin conexión gracias a un service worker (`sw.js`) que cachea el shell
estático (HTML/CSS/JS/manifest/iconos) con una estrategia stale-while-revalidate — nunca las
incidencias en sí, que siempre se piden en vivo a `/api/incidencias`. Revisa si hay
actualización cada vez que la app vuelve a primer plano, no solo con la frecuencia por defecto
del navegador (~24h); al detectar una versión nueva, avisa con un mensaje y un botón "Recargar"
en vez de recargar la pestaña sola.

El número de versión (`v0.1.0`, visible junto al título) se sube a mano junto con `"version"`
en `package.json` y `CACHE_NAME` en `sw.js` en cada despliegue con cambios visibles — subir
`CACHE_NAME` es lo que dispara el aviso de "versión nueva" en quien ya tenga la app abierta o
instalada.

## Despliegue

Proyecto listo para desplegar en Vercel sin configuración adicional (`vercel` / conectar el repo desde el dashboard).
