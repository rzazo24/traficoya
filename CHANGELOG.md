# Changelog

Todos los cambios notables de TráficoYa, de más reciente a más antiguo. El número de versión
va sincronizado entre `package.json`, la cabecera de la app y el `CACHE_NAME` del service
worker — sirve también para avisar a quien ya tiene la app abierta de que hay una versión nueva.

## v0.9.7 — 2026-09-17

### Corregido
- El escape hatch `_extendedValue` de DATEX2 llevaba roto desde el principio por un desajuste
  de guiones bajos en la clave del atributo: cualquier arcén o carril central se perdía en
  silencio del campo `carril` en vez de mostrarse.

### Añadido
- Detalle propio de cada tipo de incidencia además de la causa (ej. "obras en la calzada ·
  cierre de carril"), distinto del anterior en ~87% de las incidencias activas de Madrid.

## v0.9.6 — 2026-09-17

### Añadido
- Si no hay conexión al abrir la app, se muestran los últimos datos guardados (hasta 6h de
  antigüedad) con el aviso "Sin conexión · datos de hace X", en vez de un mapa vacío.

## v0.9.5 — 2026-09-17

### Añadido
- Los filtros de tipo de la leyenda se recuerdan entre visitas (`localStorage`), en vez de
  reiniciarse siempre a los 4 marcados. El buscador se deja fuera a propósito: es contextual,
  no una preferencia.

## v0.9.4 — 2026-09-17

### Corregido
- El emoji 🎯 del aviso "activa tu ubicación" se sustituye por el icono real del botón de
  geolocalización del mapa.

## v0.9.3 — 2026-09-17

### Corregido
- La cabecera en móvil vuelve a caber en 2 filas (estado y botones comparten fila, con el
  texto recortándose con "…" si hiciera falta) en vez de las 3 más altas del fix anterior.

## v0.9.2 — 2026-09-17

### Corregido
- Cabecera desbordada en móviles de menos de ~394px de ancho: el botón de ayuda quedaba
  completamente fuera de la pantalla e inalcanzable.
- Botones "Severidad"/"Distancia" de la vista en lista subidos al mínimo táctil de 44px (medían
  ~25px) y aviso en texto plano para "Distancia" deshabilitado, ya que su `title` no se ve nunca
  en móvil.
- Scrollbars del panel de ayuda/lista y del buscador rediseñadas a juego con el tema oscuro.

## v0.9.1 — 2026-09-17

### Añadido
- Suite de smoke tests con Playwright (`npm test`) contra el feed real de la DGT, mismo patrón
  que BusYa.

### Corregido
- `bindPopup()` recibía un string ya construido en vez de una función: el contenido del popup
  quedaba congelado desde su creación, así que ninguna incidencia mostraba nunca la distancia
  hasta que otra cosa forzaba un repintado. Encontrado al escribir el test de arriba.

## v0.9.0 — 2026-09-17

### Añadido
- Vista en lista de las incidencias (texto real y navegable, con los mismos filtros/búsqueda
  que el mapa) — arreglo de accesibilidad real, ya que los marcadores de Leaflet no tenían
  ningún texto alternativo. Ordenable por severidad o por distancia.

## v0.8.1 — 2026-09-17

### Corregido
- Botón de compartir del popup movido a su propia esquina (abajo a la derecha), antes pegado a
  la "×" de cierre de Leaflet.

## v0.8.0 — 2026-09-17

### Añadido
- Enlace compartible a una incidencia concreta (`?id=`), con botón de compartir en cada popup
  (diálogo nativo o copia al portapapeles).
- Vercel Web Analytics.

### Documentación
- Captura del README refrescada.

## v0.7.1 — 2026-09-17

### Corregido
- El placeholder del buscador ("Buscar carretera o municipio") no cabía entero, sobre todo en
  móvil — acortado y campo ensanchado.

## v0.7.0 — 2026-09-17

### Añadido
- Sugerencias de carretera/municipio mientras se escribe en el buscador (combobox ARIA propio,
  navegable con teclado).

## v0.6.0 — 2026-09-17

### Añadido
- Buscador por carretera/municipio, compuesto con los filtros de la leyenda.
- Geolocalización: marca tu ubicación en el mapa y añade la distancia a cada popup.

## v0.5.0 — 2026-09-17

### Añadido
- Punto kilométrico, sentido y carril en cada incidencia, tras auditar qué campos del feed
  DATEX2 de la DGT se estaban desaprovechando.

### Documentación
- README actualizado con el estado real de la app y captura de pantalla.

## v0.4.0 — 2026-09-17

### Añadido
- Filtros de tipo en la leyenda (checkboxes): ocultar un tipo al instante sin recargar ni
  esperar al próximo refresco.

## v0.3.0 — 2026-09-17

### Añadido
- Estado de la API dentro del panel de ayuda: mide en directo cuánto tarda en responder
  `/api/incidencias`.

## v0.2.0 — 2026-09-17

### Añadido
- Panel de ayuda accesible (mismo patrón que BusYa: trampa de foco, bloqueo de scroll, Escape
  y clic fuera cierran).

### Documentación
- Licencia MIT.

## v0.1.1 — 2026-09-17

### Corregido
- Atribución del mapa desbordaba el viewport en móvil y tapaba la leyenda.
- Leyenda subida para dejar hueco claro con la atribución.
- Los dos fixes anteriores habían cambiado CSS sin subir la versión sincronizada, así que el
  aviso de "hay una versión nueva" nunca llegó a salir — corregido junto con este mismo commit.

## v0.1.0 — 2026-09-17

### Añadido
- Esqueleto inicial: función serverless que descarga y parsea el feed DATEX2 de la DGT
  (filtrado a incidencias activas de Madrid) y frontend con mapa Leaflet, marcadores por
  tipo/severidad y refresco automático.
- Número de versión real, sincronizado entre `package.json` y la cabecera de la app.
- PWA instalable: manifest, icono propio, service worker (stale-while-revalidate del shell
  estático) y aviso de "Recargar" cuando hay una versión nueva.
