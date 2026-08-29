---
title: Elección de calendario en mobile (iOS y Android)
status: implemented
priority: medium
---

> Implementado 2026-08-26. **Revisión 2026-08-28**: el usuario ahora **elige el
> destino** — "Calendario del dispositivo" o "Google Calendar" — con la misma
> UI en iOS y Android, y cada opción usa el mecanismo que funciona en esa
> plataforma. Motiva el cambio un hallazgo verificado en emulador contra una
> cuenta Google real: el calendario LOCAL que crea `expo-calendar` en Android
> **no aparece en la app de Google Calendar** (existía con `visible=1` y 108
> eventos), así que para quien usa Google Calendar la opción es la
> suscripción al feed hecha desde una computadora — la única que produce un
> "Tribbu" real dentro de la cuenta. También se corrigió un crash nativo del
> motor Android (cumples recurrentes, detalle en Technical Notes). `expo-calendar`
> sigue siendo módulo nativo: regenerar `mobile/android/` (`npx expo prebuild
> --clean` + reaplicar `debuggableVariants = []`) antes de un build.

## Summary

Hoy un apoderado que usa Google Calendar no tiene un camino directo para
sincronizar el calendario del curso desde la app mobile: en iOS el sheet
"Sincronizar calendario" solo ofrece el flujo `webcal://` (Apple Calendar) o
copiar el enlace, y en Android directamente no hay atajo — hay que copiar el
enlace y pegarlo en la web de escritorio de Google Calendar. Esta feature
resuelve ambas plataformas con la menor fricción posible y **sin obligar al
usuario a salir de la app**:

- **Selector de destino (ambas plataformas)**: el Sheet muestra dos filas
  tipo radio — **📱 Calendario del dispositivo** y **🗓️ Google Calendar** —
  con una descripción por plataforma que explica el alcance de cada una. Al
  elegir, aparece el panel de esa opción. Debajo, siempre, el fallback para
  otras apps (Outlook, etc.): copiar el enlace.

| destino | iOS | Android |
|---|---|---|
| Calendario del dispositivo | `webcal://` → Apple Calendar se suscribe a un "Tribbu" nativo que el servidor actualiza solo | `expo-calendar` crea un calendario **"Tribbu" LOCAL** y lo re-sincroniza al abrir la app (motor `mobile/lib/calendarSync.js`); "Desconectar" lo borra entero |
| Google Calendar | **Suscripción guiada, idéntica en ambas** (revisión 2026-08-28): "Copiar enlace" / "Enviármelo por mail" + 4 pasos para agregarlo una vez desde `calendar.google.com` en una computadora + "Ya lo agregué" | ídem |

- El Android/dispositivo tiene un límite que **el copy dice**: no llega a
  calendar.google.com y la app de Google Calendar no lo muestra. Sirve para
  Samsung Calendar/AOSP/otras, y para quien no tiene cuenta Google. Quien usa
  Google Calendar elige la otra opción.
- El Android/Google es el único camino que da un calendario "Tribbu" real en
  la cuenta (`ownerAccount …@import.calendar.google.com`, nombre, color y
  toggle propios, sync a todos los dispositivos) — verificado en la cuenta
  del usuario. Costo: un paso manual fuera de la app la primera vez, y Google
  tarda horas en reflejar el feed.

La web no cambia.

## Antecedentes — por qué cada opción usa el mecanismo que usa

Documentado en el header de `BotonAgregarCalendario.jsx`, verificado con un
usuario real y en emulador contra una cuenta Google real:

- **Atajo web (Linking / Custom Tab) — descartado**: `calendar.google.com`
  está verificado como Android App Link de la app de Google Calendar; Android
  le entrega la URL a esa app en ambos casos y la app muestra un "agregado
  con éxito" **falso** — no suscribe nada.
- **WebView interno (react-native-webview) — descartado**: evitaría la
  intercepción, pero Google **bloquea el login en WebViews embebidos**
  (`disallowed_useragent`); spoofear el user-agent es frágil y contrario a
  sus ToS.
- **API de Google Calendar — descartado**: la API **no soporta** suscribir un
  calendario "desde URL" (feature request histórico); sincronizar evento por
  evento vía API exigiría OAuth + refresh tokens server-side.
- **CalendarContract vía `expo-calendar` — vigente como opción "dispositivo"
  en Android, no como única vía**. Se probaron las dos variantes:
  - *Crear un calendario "Tribbu" propio* (**la que quedó**): separación
    visual como en iOS y "Desconectar" limpio, pero de cuenta **LOCAL**: la
    app de Google Calendar **no lo lista ni lo dibuja** (verificado en
    emulador: `visible=1`, 108 eventos, ausente del cajón y de la grilla) y
    no sube a calendar.google.com. Solo el sync adapter de Google, o la
    Calendar API con OAuth, pueden crear un calendario real dentro de la
    cuenta. Por eso el copy lo advierte y existe la otra opción.
  - *Escribir en el calendario Google existente* (commit 1425d9b, descartada):
    sí se ve y sí sincroniza, pero mezcla los eventos del colegio con el
    calendario personal, sin toggle ni color propios, y exige cuenta Google.
- **Suscripción ICS guiada — vigente como opción "Google" en Android**. Es el
  único camino que produce un calendario "Tribbu" real dentro de la cuenta
  Google. Lo único que no se puede automatizar es *crear* la suscripción
  desde el teléfono — de ahí los pasos guiados + el enlace por mail.

## Acceptance Criteria

### iOS

- [x] El `Sheet` muestra el selector de destino. **Calendario del dispositivo**
      → botón " Abrir Apple Calendar" = `Linking.openURL(webcal://…)` (flujo
      preexistente, sin cambios de mecanismo; marca `metodo="webcal"`).
      **Google Calendar** → el mismo panel de suscripción guiada que Android
      (aviso, Copiar enlace / Enviármelo por mail, 4 pasos, "Ya lo agregué" →
      `metodo="suscripcion"`). El atajo in-app anterior
      (`WebBrowser.openBrowserAsync(render?cid=…)`, `metodo="gcal"`) se quitó
      el 2026-08-28 para que la experiencia sea idéntica en ambas plataformas;
      `"gcal"` queda como legacy y sigue contando como sincronizado.
- [x] Sin dependencias ni permisos nuevos en iOS: el `calendarPermission` del
      plugin `expo-calendar` queda declarado por si el flujo se extiende, pero
      iOS **no llama** a expo-calendar.
- [ ] QA manual en iPhone: ambas opciones abren lo que dicen; la suscripción
      de Apple Calendar persiste; el flujo Google confirma la suscripción
      dentro del SFSafariViewController.

### Android

- [x] El `Sheet` muestra el selector de destino con descripción honesta por
      opción ("…en un toque. No llega a Google Calendar." / "…en todos tus
      dispositivos. Se agrega una vez desde una computadora.").
- [x] **Dispositivo**: "Conectar con mi calendario" → permiso →
      `calendarSync.sincronizar()` crea el calendario "Tribbu" LOCAL y escribe
      los eventos; `metodo="device"` recién cuando el primer sync terminó sin
      error → trigger "✓ Calendario conectado" y el Sheet pasa al estado
      conectado (Copiar enlace + **Desconectar**, que borra el calendario
      entero y vuelve al selector). Permiso denegado → mensaje que sugiere la
      opción Google, sin marcar nada. Re-sync al montar Calendario y al volver
      a foreground, throttle 1 h. El hint de la opción advierte que en la app
      de Google Calendar no se muestra.
- [x] **Google**: aviso ("Google no permite suscribirse desde el celular…"),
      "Copiar enlace" + "Enviármelo por mail" (`mailto:` con pasos + enlace +
      advertencia de que es personal), 4 pasos numerados siempre visibles, y
      "Ya lo agregué" → `metodo="suscripcion"` → "✓ Calendario sincronizado".
      Copiar/mandar solo deja `metodo="copia"` ("🔗 Enlace copiado…").
- [x] Cumpleaños se insertan como **un evento de día completo por año**
      (`ANOS_RECURRENCIA = 3`, UID `<uid>::<año>`), no como recurrente —
      fix del crash nativo (ver Technical Notes). Eventos con hora sí pueden
      llevar `recurrenceRule`.
- [x] Valores legacy de `metodo` (`"google"`, `"1"`) se tratan como
      `"copia"`; no se reutilizan.
- [x] QA en emulador (Pixel API 36, cuenta Google real): ver la sección de
      validación al final.
- [ ] **Pendiente**: agregar el feed de cero en `calendar.google.com` y
      confirmar que los eventos bajan al teléfono, y cuánto tarda el primer
      refresh (la suscripción existente venía de una prueba previa con Sync
      apagado). Y verificar en un teléfono Samsung que el calendario LOCAL
      aparece en Samsung Calendar.

### Comunes

- [x] `sincronizado = metodo === "webcal" || metodo === "gcal" || metodo ===
      "device"`; `"copia"`/`"google"` (legacy)/`"1"` (legacy) siguen como
      `soloCopiado`. El trigger dice "✓ Calendario conectado" para `"device"`
      y "✓ Calendario sincronizado" para los otros dos.
- [x] "Copiar enlace" sigue disponible en ambas plataformas para apps de
      terceros, con su hint.
- [x] Sin cambios de esquema, RPC, Edge Function ni RLS: se reutilizan
      `usuario_calendar_tokens`, `regenerar_calendar_token()` y
      `calendar-feed` tal como están. "Regenerar enlace" sigue funcionando;
      en Android el sync usa el token vigente en cada corrida.
- [x] Los botones del sheet caben sin recorte en un teléfono angosto: el
      `row` hace `flexWrap`. (No aplica a Super Admin / desktop: cambio
      exclusivo del sheet mobile.)
- [x] La web (`BotonAgregarCalendarioWeb.jsx`) no se toca.
- [x] `cd mobile && npm run lint` y `npx expo export -p ios` / `-p android`
      pasan.

## Technical Notes

- **Archivos**: `mobile/features/calendario/BotonAgregarCalendario.jsx`
  (selector + los 4 paneles; tabla de mecanismos en el header) y
  `mobile/lib/calendarSync.js` (motor Android/dispositivo: fetch del feed +
  parser ICS mínimo + calendario "Tribbu" + upsert/borrado + mapa en
  AsyncStorage + throttle + expansión anual de cumples). El re-sync al
  foreground vive en el componente (`AppState` listener con cleanup).
- **Dependencias**: `expo-web-browser` (iOS/Google) y `expo-clipboard` ya
  estaban; `mailto:` va por `Linking`. `expo-calendar ~15.0.8` es **módulo
  nativo** → `npx expo prebuild --clean` antes del próximo build debug local,
  reaplicar `debuggableVariants = []`, build nuevo de EAS para producción.
  Config plugin en `app.config.js` con `calendarPermission` en español
  (Android suma `READ_CALENDAR`/`WRITE_CALENDAR`; declararlos en el **Play
  Console data safety** al publicar).
- **Crash nativo corregido (2026-08-28)**: para un evento de día completo con
  recurrencia (los cumples: `VALUE=DATE` + `RRULE:FREQ=YEARLY`) expo-calendar
  emite `DURATION="PT86400S"` y `CalendarProvider2.fixAllDayTime()` la parsea
  con un substring ingenuo (`Integer.parseInt("T86400")`) →
  `NumberFormatException` que escapa el catch angosto de `saveEventAsync`
  (solo Parse/EventNotSaved/InvalidArgument) y **mata el proceso** — no es un
  promise rejection, ningún try/catch de JS lo ve. Reproducido en emulador
  (stack: `CalendarModule.saveEvent(CalendarModule.kt:536)`). Fix: el parser
  expande esos VEVENT a uno por año, y `sincronizar()` no cambia — el mapa
  UID→eventId hace que la ventana de 3 años se corra sola en cada sync.
- **Por qué el feed ICS como fuente y no queries directas a Supabase**: la
  lógica de alcance (cursos del usuario ∪ admin, prefijo de curso en el
  título, cumples recurrentes, DTEND exclusivo) ya vive verificada en
  `supabase/functions/calendar-feed/index.ts`. El parser solo entiende el
  formato que nosotros mismos emitimos (sin librería ICS), incluido el line
  folding de RFC5545.
- **Idempotencia**: `UID` estable del feed como clave del mapa; nunca buscar
  por título/fecha. La firma de contenido excluye `DTSTAMP` (el generador lo
  re-emite en cada fetch — sin excluirlo, cada sync recrearía todo).
  Reinstalación: el "Tribbu" huérfano se borra y recrea, sin duplicados.
- **Marcar `metodo` en el momento correcto**: iOS `"gcal"` al resolver
  `openBrowserAsync` (cierre del browser); Android `"device"` recién cuando
  el primer sync terminó sin error.
- **QA**: manual — no hay test suite. Android: emulador local (workaround DNS
  `-dns-server 8.8.8.8,1.1.1.1` si la red falla); ya no hace falta cuenta
  Google, pero **sí** verificar la visibilidad del calendario LOCAL en la app
  de calendario que el usuario real usa (ver AC ⚠️). iOS:
  simulador/dispositivo manual. [skill: agent-browser no aplica — flujos
  nativos]
- Sin efectos nuevos complejos (las acciones son handlers); los `useEffect`
  limpian con la bandera `activo` / `sub.remove()`. [skill:
  vercel-react-best-practices] [skill: vercel-react-native-skills]

## Out of Scope

- Un calendario "Tribbu" **sincronizado al servidor de Google** (imposible
  para apps normales — solo sync adapters); si el QA de visibilidad falla en
  la app de Google Calendar, el fallback es la variante "escribir en el
  calendario Google existente" (commit 1425d9b), no un sync adapter propio.
- Sync en background (expo-background-task / headless): v1 actualiza al
  abrir la app, que en la práctica es frecuente por las notificaciones push.
- API de Google Calendar con OAuth (no soporta suscripción por URL; insertar
  evento a evento exigiría infra OAuth server-side).
- Reabrir el atajo in-app de iOS para Google (`render?cid=` en
  SFSafariViewController): funcionaba, pero exigía login de Google en un
  browser con cookies aisladas y hacía que iOS y Android divergieran. Se
  prefirió el instructivo único (2026-08-28).
- Usar `expo-calendar` también en iOS como "calendario del dispositivo":
  webcal:// es superior (el servidor empuja actualizaciones sin abrir la app y
  no pide permiso de calendario). Decisión explícita 2026-08-28.
- Detectar qué app de calendario tiene instalada el usuario para
  preseleccionar.
- Cambios a la web (`BotonAgregarCalendarioWeb.jsx`) o al Edge Function
  `calendar-feed`.
- Sync bidireccional (ediciones hechas en el calendario del teléfono no
  vuelven a tribbu; el sync las pisa en la próxima corrida), exclusión por
  curso, CalDAV.

## Validación (2026-08-28, emulador Pixel API 36 con cuenta Google real)

- **Crash reproducido y corregido**: antes del fix, "Conectar" mataba el
  proceso (`FATAL EXCEPTION … IllegalArgumentException: For input string:
  "T86400" at CalendarModule.saveEvent(CalendarModule.kt:536)`). Con el fix,
  el mismo flujo termina con la app viva.
- **Android/dispositivo**: permiso → calendario "Tribbu" (`account_type=LOCAL`,
  `visible=1`) con **108 eventos**: 72 son cumples (24 alumnos × 3 años, p. ej.
  Valentino Terbay 2026/2027/2028-10-05, `allDay=1`) y los 108 tienen
  `rrule=NULL`. Trigger "✓ Calendario conectado"; Sheet en estado conectado.
  "Desconectar" borra el calendario (0 LOCAL) y vuelve al selector con el
  trigger en "Agregar a tu calendario". Reconectar → 108 otra vez, sin
  duplicados.
- **Android/Google**: aviso + botones + 4 pasos renderizan; "Copiar enlace"
  deja la URL real del feed en el portapapeles (vista previa del sistema);
  `mailto:` resuelve a Gmail sin romper la app; "Ya lo agregué" → "✓
  Calendario sincronizado", y **persiste tras reiniciar**.
- **Selector**: la opción activa se resalta (radio + borde accent); cambiar de
  opción cambia el panel; el fallback "Copiá el enlace" queda siempre visible.
- **Google Calendar y el LOCAL**: con el calendario LOCAL creado y visible, la
  app de Google Calendar no lo mostró ni en el cajón ni en la grilla — el
  "Cumple Val" visible en la grilla del usuario provenía de su calendario
  Personal (`calendar_id=5`), no del nuestro.
- **Suscripción en la cuenta**: el feed figura como calendario "Tribbu"
  (`account_type=com.google`, `ownerAccount …@import.calendar.google.com`,
  `access_level=200`) con nombre, color "Tangerine" y "Unsubscribe from
  calendar"; al activarle Sync aparece en el cajón lateral junto a los demás.
- `npm run lint` y `npx expo export -p ios` limpios; `prebuild --clean` con
  `expo-calendar` reinstalado deja `READ/WRITE_CALENDAR` en el manifest.
- **No verificado**: iOS (ambas opciones, QA manual pendiente); que los
  eventos de la suscripción bajen desde cero y cuánto tarda; el LOCAL en
  Samsung Calendar.
