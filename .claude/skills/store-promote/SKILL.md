---
name: store-promote
description: Promote the tribbu mobile release that /store-release uploaded to production in both stores — Google Play internal track → production at 100%, and App Store Connect version + build + "Novedades" → submitted for review — loading each store's release notes from mobile/stores/release-notes-<version>.md. Use when the user wants to "promover a producción", publish the new version to users, send the iOS build to review, or finish a release after /store-release.
argument-hint: "[versión] [all|ios|android] (default: expo.version de app.config.js, all)"
---

# Store Promote — de interno/ASC a producción en ambas tiendas

Cierra el tramo que `/store-release` deja manual: la versión ya está en el
track **interno** de Play y como build procesado en **App Store Connect**; este
skill la lleva a **producción** con las "Novedades" de cada tienda.
Spec: `specs/promover-release-a-produccion.md`.

Toda la lógica vive en **`mobile/scripts/promover-release.mjs`** (Node puro, sin
dependencias, habla directo con la Play Developer API y la App Store Connect
API). El skill es el protocolo para correrlo: **plan → confirmación → aplicar
→ reporte**. Nunca corras `--aplicar` sin mostrar el plan y tener el OK
explícito del usuario en este turno: publicar a producción y enviar a review
son acciones públicas y no se deshacen.

Argumentos: `$ARGUMENTS` → versión (default: `expo.version` de
`mobile/app.config.js`) y plataforma (`all` por default; Android primero,
después iOS).

## Phase 0 — Preflight

Todo desde `mobile/` con `cd <repo>/mobile &&` explícito.

1. Existe `mobile/stores/release-notes-<versión>.md` con las secciones
   `## Google Play` y `## App Store Connect` (cada una con un bloque ```) y el
   encabezado `Android vcNN · iOS build NN`. Si falta, lo genera la Phase 3 de
   `/store-release` — no lo inventes acá.
2. Credenciales (nunca las imprimas ni las commitees):
   - Play: `mobile/play-service-account.json` (gitignoreado).
   - ASC: `~/.appstoreconnect/private_keys/AuthKey_332U7L8KB5.p8`. Key ID e
     issuer del equipo vienen como default en el script; se pueden pisar con
     `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_PATH`. La key de EAS Submit
     (`B63THHC69Y`) vive en los servidores de Expo y **no se puede bajar** —
     por eso se usa esta otra key del mismo equipo.

## Phase 1 — Plan (solo lectura)

```bash
cd <repo>/mobile && node scripts/promover-release.mjs --version <v> --plataforma <p>
```

Sin `--aplicar` el script no escribe nada (en Play abre un edit y lo descarta
sin commit). Qué valida e imprime:

- **Notas**: extrae los bloques; aborta si Play > 500 o ASC > 4000 caracteres.
- **Android**: el release de `versionCode` más alto del track interno; aborta
  si no coincide con el `vcNN` del encabezado de las notas. Si ya está en
  producción → "nada que hacer".
- **iOS**: el build más alto de esa versión; aborta si no coincide con el
  `iOS build NN` de las notas o si no está `VALID` (sigue procesando →
  reintentar en unos minutos). Decide si reusa la versión, renombra la única
  versión editable (ASC admite una sola) o crea una nueva. Si la versión ya
  está enviada/aprobada con ese build → "nada que hacer"; con **otro** build →
  aborta (sacarla de review es manual y fuera de alcance).
- **Review Notes**: imprime las actuales. Si mencionan `Y5WPT2` o un "código de
  invitación/demo" ("invitation/demo code"), marca **envío a review
  BLOQUEADO**. Esas notas describen el registro con código que se sacó en 1.6.1
  y el revisor no tiene dónde usarlo. El script igual deja la versión lista,
  pero **no la envía**.

Pegá el plan en el chat tal cual. Si hay bloqueo de Review Notes, decilo
primero: el usuario tiene que editarlas en ASC (App → versión → "Información de
la revisión de la app"), describiendo la cuenta demo usuario+contraseña y sin
código. Después se vuelve a correr el skill. No las edites vos: está fuera del
alcance.

## Phase 2 — Aplicar (con OK explícito)

```bash
cd <repo>/mobile && node scripts/promover-release.mjs --version <v> --plataforma <p> --aplicar
```

- **Android**: `PUT tracks/production` con el vc, `status: completed` (100%) y
  notas `es-419` → `edits:commit`. Google revisa la versión antes de publicarla
  (de horas a días); eso no es un fallo.
- **iOS**: versión (crear/renombrar/reusar, `releaseType AFTER_APPROVAL` = se
  publica sola al aprobarse) → asigna el build → `whatsNew` en **todos** los
  locales (hoy solo `es-MX`) → `reviewSubmission` (reusa una abierta o crea una)
  + item + `submitted: true`.
- Es **idempotente**: si se corta a mitad de camino, volvé a correrlo (primero
  en plan). Lo ya hecho aparece como "nada que hacer" y no se duplica.
- Un fallo de una plataforma no frena a la otra; exit code ≠ 0 si alguna falló
  o quedó bloqueada.

## Phase 3 — Reporte

1. Por plataforma: versión, vc/build y estado final (las líneas `Resumen:` del
   script).
2. Recordá qué falta del lado de las tiendas: la revisión de Google y la de
   Apple, y que con `AFTER_APPROVAL` iOS se publica sola al aprobarse.
3. Actualizá la memoria de estado de stores con lo que quedó publicado.

## Gotchas

- **Si el commit de Play falla**, por ejemplo con "Changes cannot be sent for
  review automatically… changesNotSentForReview": mostrá el error tal cual y
  no reintentes con otros parámetros. Suele significar que en Play Console hay
  cambios pendientes de la ficha o que la app tiene la publicación gestionada
  activada, y eso lo resuelve el usuario en la consola.
- **Timeouts de red** (40 s por request): el script no reintenta solo. Antes de
  volver a correrlo con `--aplicar`, corrélo en plan para ver qué quedó hecho.
- Una versión de ASC rechazada queda `DEVELOPER_REJECTED`/`REJECTED`/
  `METADATA_REJECTED` y sigue siendo editable: el script la reusa (o la
  renombra si el build nuevo es de otra versión).
- **Export compliance**: `app.config.js` declara
  `ITSAppUsesNonExemptEncryption: false`, así que los builds llegan con
  `usesNonExemptEncryption=false`. Si algún día aparece `null`, el script
  aborta en lugar de declararlo por su cuenta.
- Este skill no toca builds, binarios ni la ficha de la tienda (descripción,
  screenshots, privacidad). Eso sigue siendo `/store-release` o
  `mobile/STORE_RELEASE.md`.
