---
title: Promover release a producción en ambas tiendas
status: implemented
priority: medium
---

## Summary

Hoy `/store-release` deja cada versión de tribbu mobile en el track interno de Google Play y como build procesado en App Store Connect. Para que llegue a los apoderados todavía hay que entrar a cada consola, promover a producción a mano y copiar las "Novedades" desde `mobile/stores/release-notes-<versión>.md`. Es fácil equivocarse en ese paso y ya pasó: adjuntar un build viejo de los que quedaron sin usar (por ejemplo 23/24/25) o mandar a review con las Review Notes vencidas (código demo `Y5WPT2`). El skill nuevo `/store-promote` cierra ese tramo. En Play toma la versión del track interno, la publica en producción al 100% con las novedades de Play, y en ASC deja la versión de App Store con el build correcto y las novedades de ASC, y la envía a revisión. Todo pasa por un script Node que no tiene dependencias, primero muestra un plan en seco y frena antes de cualquier paso irreversible.

## Acceptance Criteria

- [x] Existe `.claude/skills/store-promote/SKILL.md`, invocable como `/store-promote [versión] [ios|android|all]`. Si no se pasa versión, usa `expo.version` de `mobile/app.config.js`. La plataforma por default es `all`.
- [x] Existe `mobile/scripts/promover-release.mjs`, que usa solo built-ins de Node (`crypto`, `fs`, `fetch`). Sin `--aplicar` imprime el plan y no hace ninguna escritura; con `--aplicar` ejecuta. El skill siempre corre primero el plan, lo muestra y pide confirmación antes de `--aplicar`.
- [x] Notas: el script lee `mobile/stores/release-notes-<versión>.md` y extrae el primer bloque ``` de la sección `## Google Play` y el de `## App Store Connect`. Aborta si falta el archivo, falta alguna sección, el bloque de Play pasa los 500 caracteres (`[...str].length`) o el de ASC pasa los 4000.
- [x] **Android, resolución**: dentro de un edit lee el track `internal` y busca el release con el `versionCode` más alto. Si el encabezado de las notas declara `vcNN` y no coincide, aborta. Si ese versionCode ya está en `production`, informa "ya promovido" y no hace nada.
- [x] **Android, promoción**: con `--aplicar` hace `PUT tracks/production` con `releases:[{versionCodes:[vc], status:"completed", releaseNotes:[{language:"es-419", text}]}]` y luego `edits:commit`. Si el commit falla (por ejemplo, Google pide `changesNotSentForReview`), muestra el error tal cual y sale con código ≠ 0, sin reintentar con otros parámetros.
- [x] **iOS, build**: busca en `/v1/builds` el build de la app con `preReleaseVersion.version = <versión>` y el `version` (número de build) más alto. Si el encabezado de las notas declara `iOS build NN` y no coincide, aborta. Si el build no está en `processingState=VALID` (por ejemplo, sigue `PROCESSING`), aborta con "reintentá en unos minutos".
- [x] **iOS, versión**: si ya existe una `appStoreVersion` con ese `versionString` en `WAITING_FOR_REVIEW`, `IN_REVIEW`, `PENDING_DEVELOPER_RELEASE`, `READY_FOR_SALE` o un estado posterior con el mismo build, informa en qué estado está y no hace nada. Si está en uno de esos estados con **otro** build, aborta y explica la situación. Si hay una versión editable (`PREPARE_FOR_SUBMISSION`, `DEVELOPER_REJECTED`, `REJECTED`, `METADATA_REJECTED`) con otro `versionString`, el plan lo dice explícitamente y la renombra a la versión nueva (ASC admite una sola versión editable). Si no existe ninguna, la crea (`releaseType: AFTER_APPROVAL`).
- [x] **iOS, contenido**: asigna el build a la versión (`PATCH relationships/build`) y escribe el texto de ASC en `whatsNew` de **todas** las `appStoreVersionLocalizations` de la versión. El plan lista los locales.
- [x] **iOS, export compliance**: si el build tiene `usesNonExemptEncryption = null` y `mobile/app.config.js` no declara `ITSAppUsesNonExemptEncryption`, aborta antes de enviar. El script no declara cumplimiento de exportación por su cuenta.
- [x] **iOS, Review Notes**: el plan imprime las `notes` actuales de `appStoreReviewDetail`. Si contienen `Y5WPT2` o coinciden con `/c[óo]digo\s+(de\s+invitaci[óo]n|demo)/i`, no envía a review (el resto de los pasos de iOS sí se aplican) y le indica al usuario que actualice las notas en ASC y vuelva a correr el skill.
- [x] **iOS, envío**: reusa una `reviewSubmission` abierta de la app (`READY_FOR_REVIEW`) o crea una, le agrega la `appStoreVersion` como `reviewSubmissionItem` y hace `PATCH submitted:true`. Si la versión ya está en la submission, no la duplica.
- [x] El script es **idempotente**: correrlo dos veces seguidas con `--aplicar` no crea versiones, submissions ni releases duplicados. La segunda corrida termina informando "ya promovido / ya en review".
- [x] Credenciales: Play usa `mobile/play-service-account.json` (OAuth con JWT firmado, scope `androidpublisher`). ASC usa la `.p8` de `~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8`, con `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_KEY_PATH` sobreescribibles por env y los valores actuales (`332U7L8KB5`, issuer del equipo) como default en el script. Ninguna credencial ni contenido de `.p8`/`.json` termina en el repo ni en el output.
- [x] Al terminar, el skill reporta por plataforma qué quedó (versión, vc/build, estado final) y actualiza la memoria de estado de stores.
- [x] La Phase 4 de `/store-release` deja de decir "promover a mano" y apunta a `/store-promote`. `CLAUDE.md → Skills` lista el skill nuevo.

## Technical Notes

- **Ubicación**: `.claude/skills/store-promote/SKILL.md` (mismo formato que `store-release`: fases, gotchas, comandos con `cd <repo>/mobile &&` explícito). Lógica en `mobile/scripts/promover-release.mjs`, versionado. Uso: `node scripts/promover-release.mjs --version 1.11.0 --plataforma all [--aplicar]`.
- **Play Developer API v3** (`androidpublisher.googleapis.com/androidpublisher/v3/applications/com.tribbu.app`): token OAuth con un JWT RS256 firmado con la `private_key` del service account (`aud: https://oauth2.googleapis.com/token`, scope `https://www.googleapis.com/auth/androidpublisher`), con el mismo método que ya se usó para leer el estado de los tracks. Flujo: `POST edits` → `GET edits/{id}/tracks/internal` + `tracks/production` → `PUT edits/{id}/tracks/production` → `POST edits/{id}:commit`. En modo plan, el edit se descarta (`DELETE edits/{id}`) sin commit.
- **App Store Connect API** (`api.appstoreconnect.apple.com/v1`, app `6787757386` desde `eas.json > submit.production.ios.ascAppId`): JWT ES256 (`kid`, `iss`, `aud: appstoreconnect-v1`, exp ≤20 min) firmado con `crypto.sign(..., {dsaEncoding:"ieee-p1363"})`. Ya se verificó que esa key responde 200 contra la app. Endpoints: `builds` (`filter[app]`, `filter[preReleaseVersion.version]`, `sort=-version`), `appStoreVersions` (`filter[app]`), `appStoreVersionLocalizations`, `appStoreReviewDetail`, `reviewSubmissions`/`reviewSubmissionItems`.
- La key de EAS Submit (`B63THHC69Y`) vive en los servidores de Expo y no se puede bajar, por eso se usa la `.p8` local, que es de otra key del mismo equipo.
- **Orden**: Android primero (el commit es atómico y la revisión de Google es rápida), después iOS. Un fallo en una plataforma no bloquea la otra; se reporta igual que en `store-release`.
- **Plan en seco**: cada paso se imprime como `[android] PUT production vc41 (es-419, 414 chars)` / `[ios] crear versión 1.11.0`, etc., con los estados actuales leídos. El skill pega el plan en el chat y espera el OK antes de `--aplicar`, porque son acciones visibles para el público y difíciles de revertir.
- Las notas son siempre es-419: en Play van con `language:"es-419"`; en ASC el mismo texto va a todos los locales de la versión (la app solo tiene copy en español).
- Gotchas a documentar en el SKILL.md: `api.expo.dev` y otras APIs a veces se cuelgan por IPv6 en esta máquina (usar `fetch` con timeout y reportar el error sin reintentar a ciegas); Google puede tardar horas o días en revisar producción, y eso no es un fallo; la primera versión de ASC tras un rechazo puede quedar en `DEVELOPER_REJECTED`, editable y reutilizable.
- Sin cambios en `src/`, Supabase ni UI de la app. No aplica a los skills de React o diseño.

## Out of Scope

- Rollout escalonado en Play (`inProgress` + `userFraction`), y pausar o detener un rollout.
- Editar las Review Notes, la ficha (descripción, keywords, screenshots), las respuestas de App Privacy/Data safety o cualquier metadata fuera de "Novedades".
- Liberación manual en iOS (`releaseType: MANUAL`), lanzamiento por fases (phased release) y TestFlight externo.
- Sacar una versión de review (`IN_REVIEW` → cancelar) para cambiarle el build.
- Builds y submits (siguen siendo `/store-release`) y la APK compartible.
- Otros tracks de Play (alpha/beta) y otros idiomas.

## Estado de la implementación (2026-10-03)

Validado en modo plan contra las tiendas reales: 1.11.0 → "ya en producción (vc41)" / "ya WAITING_FOR_REVIEW (build 31)"; 1.10.3 → aborta por vc40 ≠ vc41 en Android; versión sin notas → aborta. Las lecturas de Review Notes, locales (`es-MX`) y review submissions se verificaron aparte, solo lectura. Las escrituras (`--aplicar`) se siguen sin estrenar: se ejercitan por primera vez en el próximo release.
