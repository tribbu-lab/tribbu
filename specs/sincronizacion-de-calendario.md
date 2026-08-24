---
title: Sincronización de calendario
status: implemented
priority: medium
---

## Summary

Hoy un apoderado o admin tiene que abrir tribbu para chequear el calendario del
curso — no hay forma de que los eventos del colegio (actos, paseos, cumpleaños,
festejos, comunicados) aparezcan solos en el calendario personal que ya usa
todos los días (Google Calendar, Apple Calendar, Outlook). Esta feature
completa un botón que había quedado a medio armar: cada usuario obtiene un
enlace privado de sincronización (feed ICS) que puede suscribir una sola vez y
que se actualiza solo. Como un apoderado puede tener hijos en más de un curso,
cada evento del feed lleva el nombre del curso en el título ("Sala Roja — Acto
del 25 de mayo") para poder diferenciarlos de un vistazo. Aplica a web y mobile.

## Acceptance Criteria

- [x] `usuarios` tiene una columna `calendar_token text unique` (nula hasta la
      primera vez que se genera). *(SQL corrida contra la base real vía
      `supabase db query --linked`, verificada en vivo.)*
- [x] Nueva función `regenerar_calendar_token()` (RPC `security definer`,
      mismo patrón que `crear_apoderado`/`verificar_codigo`): genera un token
      aleatorio, lo guarda en la fila `usuarios` del caller (`auth_id =
      auth.uid()`) y lo devuelve. Se usa tanto para crear el token la primera
      vez como para regenerarlo. *(Verificado en vivo llamando la RPC por
      REST con la sesión real del usuario — devuelve un token hex de 48
      caracteres. Nota: hubo que corregir `gen_random_bytes` →
      `extensions.gen_random_bytes` — pgcrypto vive en el schema `extensions`
      en Supabase, no en `public`, y la función fija `search_path = public,
      pg_temp` por seguridad.)*
- [x] Nuevo Edge Function `calendar-feed`, desplegado **sin verificación de
      JWT** (`supabase functions deploy calendar-feed --no-verify-jwt`) —
      confirmado en vivo con un `curl` real al feed: devuelve un `VCALENDAR`
      válido con eventos de los dos cursos del usuario, festejos y
      cumpleaños recurrentes.
- [x] Token inexistente/revocado → `404` limpio (no un 500). *(Verificado en
      vivo: `curl` con un token inválido devuelve HTTP 404.)*
- [x] Cada `VEVENT` tiene `SUMMARY: "{curso.nombre} — {título}"` (o "Cumple de
      {nombre}" para cumpleaños) para diferenciar cursos en hogares con más de
      un hijo. *(Verificado contra el feed real: eventos de "K3 Ants - Kinder"
      y "1°B — Primaria" combinados y diferenciados correctamente.)*
- [x] Eventos de todo el día (`todo_el_dia`, cumpleaños, festejos) usan
      `DTSTART;VALUE=DATE` / `DTEND;VALUE=DATE` con **DTEND = último día + 1**
      (fin exclusivo según RFC5545). Eventos con hora usan `hora`/`hora_fin`
      convertidos a UTC asumiendo `America/Argentina/Buenos_Aires` fijo
      (UTC-3, sin horario de verano) — sin necesidad de bloque `VTIMEZONE`.
- [x] Eventos multi-día (`fecha_fin`) generan **un solo** `VEVENT` que abarca
      todo el rango, no uno por día.
- [x] Cumpleaños se generan como **un** `VEVENT` recurrente
      (`RRULE:FREQ=YEARLY`) anclado en la fecha de nacimiento, no uno por año.
- [x] Cada `VEVENT` tiene `UID` estable (`evento-{id}@tribbu.app`,
      `cumple-hijo-{id}@tribbu.app`, `cumple-maestro-{id}@tribbu.app`) para que
      un refetch actualice en lugar de duplicar.
- [x] `LOCATION` = `lugar`; `DESCRIPTION` incluye `descripcion` y, si existe,
      `url_ubicacion`.
- [x] Web: `BotonAgregarCalendarioWeb.jsx` se integra en
      `src/features/calendario/index.jsx` (como indica su propio comentario),
      crea el token la primera vez sin pasos extra, y suma una acción
      "Regenerar enlace" (con confirmación — "los calendarios ya suscriptos
      con el enlace actual van a dejar de actualizarse") que llama la RPC de
      nuevo y refresca la URL mostrada. *(Verificado en vivo con
      `agent-browser`/Browser tool: botón, texto de "Regenerar" y flujo de
      confirmación renderizan correctamente; se encontró y corrigió un error
      de consola real — `window.prompt()` sin capturar en el fallback de
      copiar — durante esta misma pasada de QA.)*
- [ ] Mobile: acción equivalente en `mobile/features/calendario/index.jsx` (o
      componente nuevo): "Copiar enlace" (universal, vía `expo-clipboard`,
      agregado a `mobile/package.json`) y, en iOS, "Agregar a Calendario"
      abriendo la URL `webcal://`. Android solo copia el enlace, con copy
      explicando el camino manual por Google Calendar web. *(Código escrito,
      lint mobile y `npx expo export` limpios — no se relanzó el emulador
      Android para QA visual de este componente puntual en esta pasada.)*
- [x] Se ve bien en mobile bottom-tab y desktop sidebar (es una adición a la
      feature Calendario existente, no un tab nuevo — no toca
      `TABS`/`renderTab()`/`TAB_MAP` ni Super Admin). *(Verificado en vivo en
      ambos layouts vía el Browser tool.)*
- [x] `npm run lint` (raíz) y `cd mobile && npm run lint` + `npx expo export -p ios`
      pasan.

## Technical Notes

- **La RLS actual obliga a usar un RPC, no un `.update()` directo.** La policy
  `usuarios_update` solo permite `es_super()`
  (`supabase/rls-hardening.sql:348`) — un apoderado/admin normal no puede
  escribir su propia fila `usuarios`. La generación/regeneración del token
  tiene que pasar por una función `security definer`, igual que
  `crear_apoderado`/`verificar_codigo` (`src/features/auth/index.jsx:170,202`,
  `mobile/features/auth/index.jsx:219,263`). El SQL (columna + RPC) se agrega
  a `supabase/rls-hardening.sql` o un archivo nuevo, mismo "correr a mano en
  el SQL editor" que usó `adjuntos-en-recordatorios-y-eventos.md`.
- **`calendar-feed` necesita invocación sin JWT**
  (`supabase functions deploy calendar-feed --no-verify-jwt`), a diferencia de
  `manage-auth-user`/`delete-account`/`send-push`, que sí esperan JWT/anon key
  — Google/Apple/Outlook lo consultan directo, sin sesión. El token de la URL
  *es* la autenticación. Adentro de la función se usa la service-role key
  (mismo patrón que `send-push`) para leer todos los cursos del usuario sin
  pasar por RLS — nunca en `src/`.
- **Alcance del feed** = mismo cálculo de `items` que el "Mi acceso" de
  `App.jsx`: `curso_id` de los hijos ∪ `usuario_cursos` (admin) de ese
  usuario. Se consulta `eventos` y `hijos`/`maestros` (cumpleaños) por cada
  `curso_id` resuelto, con join a `cursos.nombre` para el prefijo del
  `SUMMARY`.
- **Generación del ICS**: armar el string `text/calendar` a mano en el Edge
  Function (Deno, no hace falta librería para este alcance) —
  `BEGIN:VCALENDAR` / `VERSION:2.0` /
  `PRODID:-//tribbu//calendar-feed//ES` / un `VEVENT` por fila /
  `END:VCALENDAR`. Headers: `Content-Type: text/calendar; charset=utf-8`,
  `Cache-Control: no-cache` (así los pollers siempre traen datos frescos,
  consistente con el texto ya escrito en el botón: "se actualizan solos").
- **Wiring web**: `BotonAgregarCalendarioWeb.jsx` ya lee `calendar_token` vía
  `supabase.from("usuarios").select(...)`, que sí está permitido por
  `usuarios_select` (`id = mi_usuario_id()`) — solo la escritura necesita el
  RPC. Al montar, si `calendar_token` es null, llamar la RPC una vez para
  crearlo sin pedirle nada al usuario. Reemplazar los hex hardcodeados
  (`COLOR_PRIMARIO = "#3B82F6"`) por tokens de `src/lib/theme.js` (`T`) antes
  de integrarlo, para seguir la convención del proyecto.
- **Mobile**: archivo nuevo `mobile/features/calendario/BotonAgregarCalendario.jsx`
  (puerto RN, misma lógica de token/RPC vía `mobile/lib/supabase.js`), skin
  "A3" (`THEMES`/`SPACE`/`RADIUS`, sin sombras). Agregar `expo-clipboard` a
  `mobile/package.json`. [skill: vercel-react-native-skills]
- El efecto de fetch del token en el archivo huérfano ya limpia con una
  bandera `activo` — mantener ese patrón en el puerto mobile.
  [skill: vercel-react-best-practices]

## Out of Scope

- Push notification cuando se agrega un evento nuevo (el feed es pull-based;
  la copia ya existente ya avisa "Google puede tardar unas horas").
- Exclusión por curso (un usuario con 2 hijos en cursos distintos no puede
  sacar uno del feed) — todo o nada para v1.
- Sync bidireccional (importar eventos externos a tribbu).
- CalDAV/push real (iCloud) — solo el flujo "suscribirse por URL" (webcal).
- Historial/auditoría de regeneraciones de token.
- Cambios al modelo de datos de eventos/cumpleaños más allá de lo ya hecho
  (`fecha_fin`).
