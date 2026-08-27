---
title: Elección de calendario en mobile (iOS y Android)
status: implemented
priority: medium
---

> Implementado 2026-08-26. Pendiente: el QA de punta a punta en dispositivos
> reales con cuenta Google (criterios marcados abajo) y, antes del próximo
> build debug local, regenerar `mobile/android/` (`npx expo prebuild --clean`
> + reaplicar `debuggableVariants = []`) porque `expo-calendar` es un módulo
> nativo nuevo.

## Summary

Hoy un apoderado que usa Google Calendar no tiene un camino directo para
sincronizar el calendario del curso desde la app mobile: en iOS el sheet
"Sincronizar calendario" solo ofrece el flujo `webcal://` (Apple Calendar) o
copiar el enlace, y en Android directamente no hay atajo — hay que copiar el
enlace y pegarlo en la web de escritorio de Google Calendar. Esta feature
resuelve ambas plataformas con la menor fricción posible y **sin obligar al
usuario a salir de la app**:

- **iOS**: elección explícita entre **Apple Calendar** (el flujo `webcal://`
  existente, sin cambios) y **Google Calendar** — un botón que abre el flujo
  de suscripción de Google Calendar web
  (`calendar.google.com/calendar/render?cid=webcal://…`, el mismo que la web
  de tribbu ya usa verificado) dentro de un SFSafariViewController in-app.
- **Android**: un botón **"Conectar con mi calendario"** que escribe los
  eventos de tribbu directamente en el calendario Google del usuario vía
  `expo-calendar` (CalendarContract) — 100% dentro de la app, ~3 taps
  (trigger → conectar → permiso del sistema), sin browser ni login. Los
  eventos insertados en un calendario Google del dispositivo **sí sincronizan
  a los servidores de Google**: aparecen en la app de Google Calendar, en
  calendar.google.com y en los demás dispositivos del usuario. La app pasa a
  ser responsable de mantenerlos al día (re-sync al abrirse), leyendo del
  mismo feed ICS `calendar-feed` para no duplicar la lógica de alcance
  multi-curso.

La web no cambia.

## Antecedentes — por qué Android va por el calendario del dispositivo

Documentado en el header de `mobile/features/calendario/BotonAgregarCalendario.jsx`
y verificado con un usuario real:

- **Atajo web (Linking / Custom Tab) — descartado**: `calendar.google.com`
  está verificado como Android App Link de la app de Google Calendar; Android
  le entrega la URL a esa app en ambos casos y la app muestra un "agregado
  con éxito" **falso** — no suscribe nada.
- **WebView interno (react-native-webview) — descartado**: evitaría la
  intercepción, pero Google **bloquea el login en WebViews embebidos**
  (`disallowed_useragent`); spoofear el user-agent es frágil y contrario a
  sus ToS.
- **Entrada por `www.google.com/calendar/render?cid=` en Custom Tab —
  descartado como principal**: ese dominio no es App Link de Calendar y el
  redirect del servidor dentro de Chrome no dispara App Links, así que en
  teoría esquiva la intercepción usando la sesión de Chrome. Pero depende de
  que la web mobile de Google soporte el diálogo de suscripción (no
  verificado), sigue siendo un browser (fricción/percepción de "salir de la
  app") y Google puede matar el redirect legacy cuando quiera. Queda anotado
  solo como curiosidad, no como fallback.
- **API de Google Calendar — descartado**: la API **no soporta** suscribir un
  calendario "desde URL" (feature request histórico), así que OAuth ni
  siquiera compraría el resultado; sincronizar evento por evento vía API
  exigiría OAuth + refresh tokens server-side — desproporcionado.
- **CalendarContract (expo-calendar) — elegido**: una app normal puede
  insertar/editar/borrar eventos en cualquier calendario con permiso de
  escritura, incluidos los calendarios Google del dispositivo, y el sync
  adapter de Google los sube al servidor. Limitación conocida: una app normal
  **no** puede crear un calendario *nuevo* que sincronice con Google (eso es
  solo para sync adapters) — por eso se escribe en un calendario Google
  existente del usuario, no en un calendario "Tribbu" aparte.

## Acceptance Criteria

### iOS

- [x] El `Sheet` ofrece **dos acciones primarias con nombre de destino
      explícito**: "Apple Calendar" (el `abrirWebcal()` existente, intacto) y
      "Google Calendar" (nueva), más "Copiar enlace" relegado a acción
      secundaria para otras apps (Outlook, etc.).
- [x] Camino feliz Google: trigger → "Google Calendar" → confirmación dentro
      de Google ("Agregar calendario") — **3 taps**, sin copiar/pegar. (Un
      login de Google la primera vez dentro del navegador in-app es aceptable
      e inevitable: SFSafariViewController no comparte cookies con Safari.)
- [x] La acción Google abre `https://calendar.google.com/calendar/render?cid=`
      + `encodeURIComponent(feedUrl con esquema webcal://)` — la misma
      conversión que `abrirEnGoogle()` en
      `src/features/calendario/BotonAgregarCalendarioWeb.jsx` (con `https://`
      a secas Google falla con "Unable to add calendar").
- [x] La URL de Google se abre con `WebBrowser.openBrowserAsync` de
      `expo-web-browser` (SFSafariViewController), **no** con
      `Linking.openURL`: los universal links no se disparan dentro de
      SFSafariViewController, así que la app nativa de Google Calendar no
      puede interceptar la URL — el modo de falla que hundió el atajo web en
      Android.
- [ ] **QA en dispositivo/simulador iOS real con una cuenta de Google real,
      verificando de punta a punta**: el calendario "Tribbu" aparece
      efectivamente en calendar.google.com y en la app de Google Calendar. Un
      dialog de éxito de Google **no** cuenta como verificación.
- [x] **Contingencia definida**: si el QA demuestra que `render?cid=` no
      completa la suscripción en Safari mobile, la acción "Google Calendar"
      en iOS cae al flujo Android (conexión vía calendario del dispositivo,
      abajo), el spec se actualiza con el hallazgo, y **no** se shipea un
      botón que aparente funcionar sin hacerlo.
- [x] Tras completar el flujo, `metodo` persiste como `"gcal"` — **no**
      `"google"`, que en el componente mobile está reservado como legacy del
      falso positivo Android y se trata como `soloCopiado`. Con `"gcal"`
      (igual que `"webcal"`) el trigger pasa a "✓ Calendario sincronizado".
      Se marca al **cerrar** el browser (la promesa de `openBrowserAsync`
      resuelve ahí), no al abrirlo.

### Android

- [x] El `Sheet` ofrece una acción primaria **"Conectar con mi calendario"**
      (copy final a definir en implementación, tono del sheet actual) y
      "Copiar enlace" como secundaria. Camino feliz: trigger → "Conectar" →
      diálogo de permiso del sistema → listo — **~3 taps, sin salir de la
      app, sin browser, sin login**.
- [x] La conexión usa `expo-calendar`: pide permiso
      (`requestCalendarPermissionsAsync`), lista los calendarios con
      `getCalendarsAsync()` y elige el **calendario Google escribible del
      usuario** (`allowsModifications` + `source.type`/accountType Google,
      preferiendo `isPrimary`/el que coincide con `ownerAccount`). Si hay más
      de una cuenta Google con calendario escribible, un mini-picker dentro
      del mismo `Sheet` (un tap extra solo en ese caso).
- [x] **Motor de sync**: un módulo `mobile/lib/calendarSync.js` que (1)
      descarga el feed ICS existente (`calendar-feed?token=…` por https —
      misma fuente de verdad que iOS/web, cero duplicación de la lógica de
      alcance multi-curso, prefijos de curso, festejos), (2) parsea los
      VEVENT (parser mínimo propio: nosotros generamos ese ICS, formato
      controlado — `UID`, `SUMMARY`, `DTSTART`/`DTEND` en fecha y datetime,
      `RRULE:FREQ=YEARLY`, `LOCATION`, `DESCRIPTION`), y (3) upsertea contra
      el calendario elegido guardando el mapa `UID → eventId del dispositivo`
      en AsyncStorage (`calsync_map_<userId>`): crea los nuevos, actualiza
      los cambiados, **borra** los que ya no están en el feed.
- [x] Cumpleaños se insertan como evento **recurrente anual**
      (`recurrenceRule: { frequency: 'yearly' }`), no uno por año. Eventos de
      día completo y multi-día respetan el DTEND exclusivo del feed
      (RFC5545) al mapear a `allDay`/`endDate`.
- [x] El sync corre al **conectar** (primera vez) y después **al abrir la
      app** (foreground vía `AppState` y/o mount de Calendario) cuando
      `metodo === "device"`, con throttle (p. ej. una vez por sesión/por
      hora) para no martillar el feed ni el CalendarProvider.
- [x] El copy de éxito es honesto sobre la cadencia: los eventos "se
      actualizan cuando abrís la app" (no hay push del servidor al calendario
      como en una suscripción ICS).
- [x] Acción **"Desconectar"** disponible una vez conectado: borra todos los
      eventos insertados (usando el mapa guardado), limpia el mapa y resetea
      `metodo` — el usuario no queda con eventos huérfanos imposibles de
      sacar en masa.
- [x] `metodo` persiste como `"device"` → el trigger pasa a "✓ Calendario
      conectado". Permiso denegado o sin calendario Google escribible en el
      dispositivo → mensaje claro y el flujo cae a "Copiar enlace" (el
      comportamiento actual), sin marcar nada como conectado.
- [ ] **QA en emulador/dispositivo Android real con una cuenta de Google
      real, verificando de punta a punta**: los eventos aparecen en la app de
      Google Calendar del dispositivo **y** en calendar.google.com (o sea,
      sincronizaron al servidor, no quedaron solo locales). El falso positivo
      del intento anterior es el antecedente directo: ningún estado local
      cuenta como verificación.
- [ ] Editar un evento en tribbu y reabrir la app actualiza el evento del
      dispositivo; borrarlo en tribbu lo saca del calendario (verificado en
      el mismo QA).

### Comunes

- [x] `sincronizado = metodo === "webcal" || metodo === "gcal" || metodo ===
      "device"`; `"copia"`/`"google"` (legacy)/`"1"` (legacy) siguen como
      `soloCopiado`. Actualizar el comentario del componente que documenta
      estos valores.
- [x] "Copiar enlace" sigue disponible en ambas plataformas para apps de
      terceros, con su hint (el de Android se simplifica: ya no es el camino
      principal).
- [x] Sin cambios de esquema, RPC, Edge Function ni RLS: se reutilizan
      `usuario_calendar_tokens`, `regenerar_calendar_token()` y
      `calendar-feed` tal como están. "Regenerar enlace" sigue funcionando;
      en Android el sync usa el token vigente en cada corrida, así que
      regenerar no lo rompe.
- [x] Los botones del sheet caben sin recorte en un teléfono angosto
      (SE/mini y un Android chico): el `row` existente ya hace `flexWrap`.
      (No aplica a Super Admin / desktop: cambio exclusivo del sheet mobile.)
- [x] La web (`BotonAgregarCalendarioWeb.jsx`) no se toca.
- [x] `cd mobile && npm run lint` y `npx expo export -p ios` pasan.

## Technical Notes

- **Archivos**: `mobile/features/calendario/BotonAgregarCalendario.jsx`
  (UI + flujos por plataforma) y nuevo `mobile/lib/calendarSync.js` (fetch
  del feed + parser ICS mínimo + upsert/borrado vía `expo-calendar` + mapa en
  AsyncStorage + throttle). El hook de re-sync al foreground puede vivir en
  el propio componente o en `mobile/app/(tabs)/_layout.jsx` si conviene que
  corra sin visitar Calendario — decidir en implementación (empezar por lo
  simple: mount de Calendario + `AppState`).
- **iOS no necesita dependencia nueva**: `expo-web-browser` ya está
  (`~15.0.11`). **Android sí**: `expo-calendar` es un **módulo nativo nuevo**
  → mismo protocolo que `expo-local-authentication` (biometría): `npx expo
  prebuild --clean` (o equivalente) antes del próximo build debug, reaplicar
  el fix `debuggableVariants = []` en `mobile/android/app/build.gradle`, y un
  build nuevo de EAS para producción. Config plugin de `expo-calendar` en
  `app.json` con los permisos (`READ_CALENDAR`/`WRITE_CALENDAR`; en iOS
  agrega `NSCalendarsUsageDescription` aunque iOS no lo use en v1 — texto en
  español igual). Actualizar la sección de permisos del **Play Console data
  safety** al publicar.
- **Por qué el feed ICS como fuente y no queries directas a Supabase**: la
  lógica de alcance (cursos del usuario ∪ admin, prefijo de curso en el
  título, cumples recurrentes, festejos, DTEND exclusivo) ya vive verificada
  en `supabase/functions/calendar-feed/index.ts`. Parsearlo del lado del
  cliente mantiene una sola fuente de verdad; el parser solo necesita
  entender el formato que nosotros mismos emitimos (sin librería ICS).
  Cuidado con el **line folding** de RFC5545 (líneas continuadas con espacio
  inicial) si el feed lo emite — verificar contra el generador real.
- **Elección del calendario destino**: en Android los calendarios Google
  aparecen con `source`/accountType `com.google`. Escribir en el calendario
  **existente** del usuario (no crear uno): los calendarios creados por apps
  normales son `LOCAL` y no sincronizan al servidor — crear "Tribbu" local
  daría el mismo falso resultado que el intento anterior (visible solo en el
  teléfono). Los títulos del feed ya llevan el prefijo del curso, así que los
  eventos se distinguen dentro del calendario personal.
- **Idempotencia**: el `UID` estable del feed (`evento-{id}@tribbu.app`,
  etc.) es la clave del mapa. Nunca buscar por título/fecha. Si el mapa se
  pierde (reinstalación), el peor caso es duplicar — mitigable guardando
  también el UID en alguna propiedad del evento del dispositivo si
  `expo-calendar` lo permite, o aceptando el edge y documentándolo
  ("Desconectar" antes de reinstalar). Decidir en implementación y anotar.
- **Marcar `metodo` en el momento correcto**: iOS `"gcal"` al resolver
  `openBrowserAsync` (cierre del browser); Android `"device"` recién cuando
  el primer sync terminó sin error (no al pedir el permiso).
- **Copy en español**, tono del sheet actual: "¿Qué calendario usás?" en iOS
  ( Apple Calendar / 🗓️ Google Calendar); en Android el botón único
  "Conectar con mi calendario" + explicación de que se actualiza al abrir la
  app. Estilos existentes `btnPrimary`/`btnSecondary` (tokens
  `THEMES`/`SPACE`/`RADIUS`, skin A3, sin sombras).
- **QA**: manual — no hay test suite. Android: el emulador local sirve
  (recordar el workaround de DNS `-dns-server 8.8.8.8,1.1.1.1` si la red
  falla) pero necesita una AVD con Google Play y una cuenta Google logueada
  para que exista un calendario `com.google` escribible; verificar en
  calendar.google.com desde afuera. iOS: simulador/dispositivo manual.
  [skill: agent-browser no aplica — flujos nativos]
- Sin efectos nuevos complejos en el componente (las acciones son handlers);
  el listener de `AppState` y el throttle viven en `calendarSync.js` con
  cleanup correcto. Los `useEffect` existentes ya limpian con la bandera
  `activo`. [skill: vercel-react-best-practices] [skill:
  vercel-react-native-skills — módulo nativo nuevo: revisar sus notas de
  native modules antes de implementar]

## Out of Scope

- Crear un calendario "Tribbu" separado y sincronizado en la cuenta Google
  del usuario (imposible para apps normales — solo sync adapters) o uno
  local device-only (falso "conectado": no llega a calendar.google.com).
- Sync en background (expo-background-task / headless): v1 actualiza al
  abrir la app, que en la práctica es frecuente por las notificaciones push.
- API de Google Calendar con OAuth (no soporta suscripción por URL; insertar
  evento a evento exigiría infra OAuth server-side).
- Usar el flujo `expo-calendar` también en iOS (webcal:// es superior: el
  servidor empuja actualizaciones sin abrir la app). Solo entra como
  contingencia si el flujo Google de iOS falla el QA.
- Detectar qué app de calendario tiene instalada el usuario para
  preseleccionar.
- Cambios a la web (`BotonAgregarCalendarioWeb.jsx`) o al Edge Function
  `calendar-feed`.
- Sync bidireccional (ediciones hechas en Google Calendar no vuelven a
  tribbu; el sync las pisa en la próxima corrida — documentado en el copy si
  hace falta), exclusión por curso, CalDAV.
