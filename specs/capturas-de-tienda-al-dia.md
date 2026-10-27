---
title: Capturas de tienda al día en cada release
status: implemented
priority: medium
---

## Summary

Las capturas de las fichas de App Store y Google Play son las de la primera publicación (14 de agosto): muestran la barra vieja (Inicio · Calendario · Cumpleaños · Avisos · Más) y a "Emma", de la demo anterior. Desde entonces salieron siete versiones con la navegación Hoy · Agenda · Comunicaciones · Curso, un header nuevo y otro estilo, así que un apoderado que mira la ficha antes de instalar ve una app que ya no existe. Pasa porque `/store-release` y `/store-promote` no miran las capturas y regenerarlas es un trabajo a mano que nadie se acuerda de hacer. Con esta feature, `/store-release` detecta qué pantallas de la ficha cambiaron desde la última captura (por el código de cada una) y, si alguna cambió, pone al día los datos del Colegio Demo y vuelve a capturar el set completo con la cuenta demo en el simulador de iOS y el emulador de Android. `/store-promote` compara lo que está publicado con lo del repo y, si difiere, sube las capturas en el mismo plan con un solo OK.

## Acceptance Criteria

**Manifiesto y detección**

- [x] Existe `mobile/stores/capturas.json` con:
  - `desde`: commit del código del que salió el set actual.
  - `comunes`: rutas cuyo cambio deja viejo todo el set (barra de pestañas `mobile/app/(tabs)/_layout.jsx`, `mobile/components/`, `mobile/lib/layout.js`, `src/lib/tokens.js`).
  - Las 6 capturas en orden: `01-hoy` (`muro`), `02-agenda` (`calendario`), `03-avisos` (`recordatorios`), `04-curso` (`curso`), `05-colectas` (`finanzas`), `06-comedor` (`comedor`). Cada una con su ruta de deep link, sus `fuentes` (el archivo de `mobile/app/(tabs)/`, su `mobile/features/<x>/` y los `src/lib/*.js` que usa), un texto que tiene que verse (`debeVer`) y, opcional, uno que no (`noDebeVer`).
- [x] `node scripts/capturas-tienda.mjs detectar` (sin red) corre `git diff --name-only <desde>..HEAD` sobre `comunes` + `fuentes` y lista qué capturas quedaron viejas y por qué archivos/commits; si ninguna cambió, imprime "capturas al día". Aborta si una ruta del manifiesto no existe en `mobile/app/(tabs)/`, si falta un PNG o si tiene otro tamaño.
- [x] Si una sola captura está vieja se regenera **el set entero** (mismos datos, fecha y barra de estado en todas).
- [x] Al implementarlo, `desde` arranca en `1b99568` (capturas de agosto) y las 6 salen viejas.

**Datos del Colegio Demo**

- [x] `supabase/demo-al-dia.sql` es idempotente, solo toca filas del Colegio Demo tribbu y de su curso "3°A - Primaria" (por id, nunca por nombre) y deja fechas relativas a `current_date`: ≥3 eventos en los próximos 15 días (uno con confirmación de asistencia), un cumple en los próximos 5 días, 2–3 avisos recientes sin leer para María, la colecta abierta con el pago de Sofía pendiente, una autorización y una encuesta abiertas, el menú del comedor de esta semana y las 4 siguientes y un encontrado de esta semana en Lost & Found.
- [x] No toca `normas_chat_aceptadas` (el revisor de Apple tiene que seguir viendo las normas del chat). Probado antes en una transacción con `rollback`; correrlo dos veces el mismo día deja el mismo estado.

**Captura**

- [x] `node scripts/capturas-tienda.mjs capturar --plataforma ios|android|all` corre los flows de Maestro de `mobile/stores/capturas/`: entra con la cuenta demo (contraseña leída de la API de ASC, `appStoreReviewDetail.demoAccountPassword`, pasada por variable de entorno, nunca impresa ni guardada), niega el permiso de notificaciones, navega a cada pantalla con `tribbu://<ruta>`, espera `debeVer`, comprueba que no esté `noDebeVer` (p. ej. "Estás al día" en Hoy) y espera a que terminen las animaciones antes de capturar.
- [x] Barra de estado limpia en las dos plataformas: 9:41, batería llena, wifi, sin notificaciones; se restaura al terminar.
- [x] Salidas: `mobile/assets/store/screenshots/ios/NN-<id>.png` 1320×2868 (simulador iPhone 17 Pro Max), `ios-6.5/` 1284×2778 derivadas con `sips` (como hoy) y `android/` 1080×2400 (emulador `Medium_Phone_API_36.1`, `wm size reset`).
- [x] No deja un set a medias: escribe en una carpeta temporal y reemplaza solo si salieron las 18 imágenes; borra los PNG que ya no están en el manifiesto (`01-inicio`, `03-recordatorios`, `04-cumples`…) y actualiza `desde` al `HEAD` capturado.
- [x] Android se captura con el AAB del release (splits de bundletool en el emulador); iOS, con un build Release para simulador del mismo commit (sin Metro ni LogBox, Xcode 26.2). Ninguno gasta buildNumber, versionCode ni cuota de EAS.
- [x] Revisión visual del agente antes de quedárselas: abre cada captura nueva junto a la anterior, dice qué cambió en cada pantalla y descarta y repite el set si alguna muestra el login, un spinner, el teclado, un error, un overlay de desarrollo, un diálogo del sistema o datos que no sean del Colegio Demo.

**/store-release**

- [x] La Phase 0 corre `detectar` y dice qué pantallas quedaron viejas y por qué.
- [x] Si hay alguna, una fase nueva **"Capturas"** (después del build de Android, para no competir por CPU) corre `demo-al-dia.sql`, `capturar --plataforma all` y la revisión visual, y deja los PNG + el manifiesto en una rama con un PR `chore(stores): capturas <versión>`. Si están al día, dice "capturas al día" y no hace nada.
- [x] Una falla en las capturas no frena los submits: se reporta al final.

**/store-promote**

- [x] **Plan**: compara la ficha publicada con el repo por hash. Play: `phoneScreenshots` es-419 (`sha256`, en orden) contra `screenshots/android/`. ASC: el set `APP_IPHONE_65` del locale es-MX de la versión (`sourceFileChecksum` = MD5) contra `screenshots/ios-6.5/`. Imprime "capturas al día" o "reemplazar 6 → 6" con la lista.
- [x] Solo sube PNG commiteados en `HEAD`: si hay cambios sin commitear en `mobile/assets/store/screenshots/`, lo dice y saltea las capturas (el resto de la promoción sigue). Si `detectar` dice que el repo está viejo respecto de `HEAD`, avisa pero no bloquea.
- [x] **Aplicar Android**: dentro del mismo edit del release de producción, `DELETE listings/es-419/phoneScreenshots`, sube las 6 en orden (`upload/…/phoneScreenshots?uploadType=media`) y hace el mismo `edits:commit`. Si el plan dijo "al día", no toca las imágenes.
- [x] **Aplicar iOS**: solo si la versión es editable y antes del `submitted:true`, borra las capturas del set, sube las nuevas (reserva `appScreenshots` → `uploadOperations` → `PATCH uploaded:true` + MD5), las ordena según el manifiesto y espera `assetDeliveryState` `COMPLETE` (máx. ~5 min). Si alguna termina `FAILED` o se pasa del tiempo, no envía iOS a review y lo informa (Android sigue). Si la versión ya no es editable, el plan dice "capturas quedan para la próxima versión".
- [x] `promover-release.mjs --solo-capturas` actualiza solo las imágenes, con el mismo plan → aplicar: Play en cualquier momento (edit y commit propios, pasa por la revisión de Google); iOS solo si hay una versión editable. Sirve para poner al día la ficha de Play ya, sin esperar un release.
- [x] Idempotente: correrlo dos veces deja la segunda en "capturas al día" en las dos tiendas.

**Documentación**

- [x] `mobile/STORE_RELEASE.md` (paso 0.3), los `SKILL.md` de `store-release` y `store-promote`, la fila "App" de `CLAUDE.md` y el "Out of Scope" de `specs/promover-release-a-produccion.md` (las capturas dejan de estar afuera) quedan actualizados.

## Technical Notes

- Sin cambios en el código de la app (`src/`, `mobile/features/`, `mobile/app/`): son scripts, flows, SQL de datos demo y los skills. Los skills de UI/React no aplican. [skill: store-release] [skill: store-promote]
- **Estado verificado el 2026-10-27 (solo lectura)**: Play es-419 tiene 6 `phoneScreenshots` con el mismo `sha256` que `screenshots/android/*.png`, 0 de tablet, y el feature graphic es `feature-graphic.png`. ASC 1.12, 1.13 y 1.14 tienen en es-MX solo el set `APP_IPHONE_65`, con el mismo MD5 que `ios-6.5/`; el set 6.9" (`ios/`) nunca se subió y es la fuente de la derivación a 6.5". Los hashes de las tiendas son exactos: comparar "ficha vs repo" no necesita bajar imágenes.
- **ASC**: las capturas son por versión (una versión nueva copia las de la anterior) y solo se editan en estado editable. 1.14.0 está READY_FOR_DISTRIBUTION, así que el primer cambio en iOS llega con la próxima versión. Endpoints: `POST /v1/appScreenshotSets` (si falta el set), `POST /v1/appScreenshots` (`fileName`, `fileSize`, relación al set → `uploadOperations` con url/offset/length/headers), `PUT` de cada parte, `PATCH /v1/appScreenshots/{id}` `{uploaded:true, sourceFileChecksum}`, `DELETE /v1/appScreenshots/{id}`, `PATCH /v1/appScreenshotSets/{id}/relationships/appScreenshots` para el orden.
- **Play**: las imágenes de la ficha no dependen de un release; subirlas en el mismo edit hace que Google revise la ficha y el release juntos. El orden de subida es el orden de la ficha. 1080×2400 ya fue aceptado (es lo publicado). Mismo gotcha de `changesNotSentForReview` que ya existe.
- **Maestro** ya está instalado (`/opt/homebrew/bin/maestro`); es una herramienta de desarrollo, no una dependencia de la app. Se usa `launchApp: {clearState: true, permissions: {notifications: deny}}`, `openLink`, `extendedWaitUntil`, `assertNotVisible`, `waitForAnimationToEnd` y `takeScreenshot`. La salida de Maestro pasa por el script, que tacha la contraseña antes de mostrar o guardar cualquier log.
- **Deep links**: `scheme: "tribbu"` + expo-router; los grupos no van en la URL (`tribbu://calendario` abre `(tabs)/calendario`). `app/_layout.jsx` solo redirige si se está fuera de `(tabs)`. Verificar a mano con `xcrun simctl openurl` / `adb shell am start -a android.intent.action.VIEW -d`.
- **Barra de estado**: iOS `xcrun simctl status_bar <udid> override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100` (y `clear` al final); Android, modo demo de SystemUI (`settings put global sysui_demo_allowed 1` + `am broadcast -a com.android.systemui.demo` con `clock`, `battery`, `network`, `notifications`; `exit` al final).
- **Emulador**: compartido con la sesión de desgrava y con `/data` al ~95%. Receta de la memoria `qa-release-android-local`: `bundletool build-apks --connected-device` + `install-apks`, bajar y restaurar el umbral de almacenamiento, siempre `adb -s emulator-5554`, coordinar por SendMessage si hay otra sesión usándolo, no tocar `ar.desgrava.mobile`. Desinstalar tribbu del emulador está bien (el flow vuelve a hacer el login).
- **Build iOS para simulador**: `DEVELOPER_DIR=/Applications/Xcode-26.2.app/Contents/Developer npx expo run:ios --configuration Release --device <udid> --no-bundler` (necesita `mobile/ios/` prebuildeado) o un perfil EAS `capturas` con `ios.simulator: true` y sin `autoIncrement`, con `--local`. En septiembre `xcodebuild` para simulador falló con errores de Swift en pods (memoria `ios-simulator-qa-automation`): validarlo primero al implementar y, si no compila, reportarlo antes de seguir.
- **Datos demo**: ids en la memoria `cuenta-demo-app-review` (colegio `6dbee020-…`, curso `f2290440-…`, María `31a9a50c-…`, Carolina `a15dad89-…`); tablas en `backup_tribbu.cjs` (`TABLES`). Revisar cómo se guarda el menú del comedor (por nivel/colegio) antes de correr sus fechas. Se aplica con `npx supabase db query --linked -f supabase/demo-al-dia.sql` y se anota "aplicado" en `docs/notas-tecnicas.md`. Los ids no son secretos; la contraseña nunca entra al repo.
- **Revisión visual**: el agente achica cada par con `sips -Z 700` al scratchpad y lo abre con Read (la anterior sale de `git show HEAD:<png>`).
- **Git**: `desde` es el commit del código capturado, no el de los PNG, así que el squash merge del PR no lo rompe. Flujo de siempre: rama → PR → CI → squash merge.
- **Tiempo**: ~15–25 min (build iOS de simulador + los dos flows). Corre después de los builds, mientras ASC procesa el IPA, que es tiempo muerto.
- **Por qué el disparador es el diff de código y no los píxeles**: las fechas y los datos cambian en cada captura, así que dos capturas nunca son iguales píxel a píxel. El diff de código propone y la revisión visual confirma qué cambió de verdad.

## Out of Scope

- Elegir pantallas nuevas automáticamente: sumar Mensajes, Marketplace u otra es un cambio a mano del manifiesto (y para Mensajes la cuenta demo tendría que aceptar las normas del chat).
- Capturas de tablet en Play (7"/10"), de iPad (`supportsTablet: false`) y el slot 6.9" de ASC (`APP_IPHONE_67`): se sigue con 6.5".
- Feature graphic de Play (es el logo, no muestra pantallas), ícono y video promocional.
- Textos de la ficha (descripción corta/larga, subtítulo, keywords): también están viejos (hablan de "Recordatorios" y "Contactos del curso"); queda como pendiente aparte.
- Marcos, textos superpuestos o diseño de marketing sobre las capturas: siguen siendo capturas crudas.
- Locales de ASC distintos de es-MX y otros idiomas de Play.
- Imágenes de la web/landing (`public/store/`).
- Detección por comparación de píxeles.

## Estado de la implementación (2026-10-27)

- **Hecho y probado**: `detectar` (con `desde` en `1b99568` marcó las 6 viejas por 142 commits; después de capturar, "capturas al día"); `demo-al-dia.sql` probado con rollback y aplicado; `capturar --plataforma all` sacó las 18 imágenes (iOS con el build Release para simulador de 4aa06c5, Android con el AAB de 1.14.0 vc51) y dejó `desde = 4aa06c5`; revisión visual hecha. `planPlay`/`planAsc` probados en solo lectura contra las tiendas: Play daba "al día" contra el set viejo y ASC "difiere" contra el nuevo. La subida (`subirPlay`/`subirAsc`) se estrena la primera vez que se aplique.
- **Cambios respecto del borrador**: `capturas.json` suma `pasos` opcionales (comandos de Maestro después de abrir la pantalla: Agenda abre "Próximos" y Comedor la vista semana); los marcadores son textos que dependen de los datos de `demo-al-dia.sql` (con títulos fijos la captura salía antes de que cargaran). El login está en `mobile/stores/capturas/login.yaml` y el resto del flow se genera del manifiesto. En iOS cada deep link abre "Open in 'tribbu'?" (con demora) y el login ofrece guardar la contraseña; en Android, Google Password Manager: el flow los cierra y el script apaga el autofill del emulador mientras captura (lo restaura al final). HTTP y credenciales pasaron a `mobile/scripts/tiendas.mjs`, compartido con `promover-release.mjs`.
- **Hallazgo**: en una de las corridas, vc51 crasheó en Android después del login (`RetryableMountingLayerException` de Fabric) con la hoja de Google Password Manager en pantalla. Anotado en `PENDIENTES.md`.
- **Pendiente**: en Curso de Android la captura puede salir sin los globitos de pendientes (cargan aparte del marcador); en Comedor se ve "Subir archivo Excel" porque María es Room Parent.
