---
name: store-release
description: Build the tribbu mobile app for iOS and Android locally with EAS (zero cloud-build quota), submit both to the stores (App Store Connect + Play internal track) and write the release notes for both consoles. Use when the user wants to ship a new mobile release, "build y submit", publish the app to the stores, or get the release notes / novedades for a version.
argument-hint: "[all|ios|android] [--cloud] (default: all, local builds, iOS first)"
---

# Store Release — build local + submit a ambas tiendas

You are shipping a release of **tribbu mobile** (`mobile/`, Expo managed + EAS).
Builds run **locally** by default (`eas build --local`) so they consume **no EAS
cloud-build quota** — the user is on the free tier and wants to avoid paying.
Signing still uses the EAS-managed remote credentials (iOS certs, Android
keystore), and `buildNumber`/`versionCode` auto-increment from the EAS server
(`appVersionSource: remote`), so no manual version bumping.

Platforms to release: **$ARGUMENTS** (default `all` = **iOS first, then
Android**, sequentially — never both builds at once, they'd contend for
CPU/RAM. iOS goes first on purpose: it's the slower path and the one whose
App Store review queue starts later, so getting its build uploaded early wins
wall-clock time. Only use cloud builds if `--cloud` was passed or the user
explicitly asks after a local failure).

## Phase 0 — Preflight (abort on failure)

1. Everything below runs from `mobile/`. **Prefix every eas command with an
   explicit `cd <repo>/mobile &&`** (especially background runs — the session
   cwd can silently reset to the repo root, and from there eas fails with
   "EAS project not configured").
2. Working tree: `git status` must be clean (or only contain changes the user
   just asked to ship — confirm with them if dirty) and on `main` with the
   release commit pushed.
2b. **Establecé el rango real del release con `git log`, no con el snapshot de
   la sesión.** El bloque `gitStatus` del contexto puede venir desactualizado
   (el 2026-09-11 mostraba `HEAD` en el release anterior cuando origin ya
   estaba varios commits adelante — reporté "esta versión no trae cambios de
   código" y era falso, había 8 commits). Sacá el tag/commit del release
   anterior de `mobile/STORE_RELEASE.md` o de la memoria de estado de stores y
   corré:

```bash
git log --oneline <commit-release-anterior>..HEAD
git diff --stat <commit-release-anterior>..HEAD -- mobile/ src/lib/
```

   El segundo comando importa: sólo `mobile/` y `src/lib/` (vía el alias
   `@shared`) viajan en el binario — commits de la landing o de `src/` web no
   son "novedades" de la app y no van en las notas de tienda.
3. Validation gates: `npm run lint` and `npx expo export -p ios` must pass.
4. Toolchain (per platform being built):
   - **iOS**: `xcodebuild -version` and `which fastlane` must succeed
     (`brew install fastlane` if missing).
   - **Android**: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`
     and `ANDROID_HOME="$HOME/Library/Android/sdk"` must exist (`/usr/bin/java` is a stub).
5. EAS session: `npx -y eas-cli@latest whoami` (login lives in `~/.expo`; if it
   fails, ask the user to run `npx eas-cli login` — you can't do OAuth for them).
6. Artifacts go to `mobile/tribbu-production.ipa` / `.aab` (gitignored — never
   commit them).

## Phase 1 — iOS (build → submit)

Always the first platform built.

```bash
npx -y eas-cli@latest build -p ios --profile production --local \
  --non-interactive --output ./tribbu-production.ipa
```

- Run in background (takes 10–25 min); watch for completion, then confirm the
  `.ipa` exists and is non-trivial in size.
- Requires Xcode + fastlane. First run may prompt for keychain access — if the
  build hangs or fails on codesigning/keychain, surface the error and ask the
  user to run it once in an interactive terminal; don't loop retries.
- Submit (uploads to App Store Connect, `ascAppId` from `eas.json`):

```bash
npx -y eas-cli@latest submit -p ios --profile production \
  --path ./tribbu-production.ipa --non-interactive
```

## Phase 2 — Android (build → submit)

Only start after Phase 1's iOS build finished (resource contention).

```bash
GOOGLE_SERVICES_JSON="$PWD/google-services.json" \
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
npx -y eas-cli@latest build -p android --profile production --local \
  --non-interactive --output ./tribbu-production.aab
```

- Run in background (takes 10–25 min); watch for completion, then confirm the
  `.aab` exists and is non-trivial in size (> 20 MB).
- **`GOOGLE_SERVICES_JSON` con ruta ABSOLUTA local es OBLIGATORIO en builds
  locales**: el archivo está gitignoreado (no entra al tarball del build) y la
  file env var de EAS tiene visibilidad *secret*, que NO baja a `--local` — sin
  esto el binario sale **sin Firebase y el push no registra** (fue el bug de las
  APKs 1.0.0/vc≤3 de julio, descubierto 2026-08-20). Solo los builds cloud la
  reciben de EAS. No "arreglarlo" des-ignorando el archivo.
- Verificación post-build del binario (debe dar ≥1):
  - **AAB**: `unzip -p <artefacto> base/resources.pb | grep -a -c 943309263680`
    (los AAB guardan los recursos en protobuf; **no tienen `resources.arsc`** —
    buscarlo ahí da 0 y parece un build roto cuando no lo está. Verificado
    2026-08-28.)
  - **APK**: `unzip -p <artefacto> resources.arsc | grep -a -c 943309263680`

  Si da 0, el build salió sin Firebase — no lo distribuyas.
- Submit (does **not** consume build quota; targets come from `eas.json > submit`,
  Play **internal** track, `play-service-account.json` must exist locally):

```bash
npx -y eas-cli@latest submit -p android --profile production \
  --path ./tribbu-production.aab --non-interactive
```

### Variante — APK compartible (sin submit)

Si el usuario pide una **APK para compartir** (distribución directa, no
tiendas): mismo comando de build pero con `--profile apk` (extiende
`production`, `buildType: apk`) y `--output ./tribbu-compartible.apk`; **no hay
paso de submit**. Aplican el mismo gotcha de `GOOGLE_SERVICES_JSON` y la
verificación post-build (en un `.apk` el path es `resources.arsc`, sin
`base/`). Doc humana: sección "APK compartible" de `mobile/STORE_RELEASE.md`
(incluye qué compartir para compilar desde otra computadora).

## Phase 3 — Release notes (SIEMPRE, no es opcional)

Generá **siempre** `mobile/stores/release-notes-<version>.md`, aunque el usuario
no lo pida — se necesita sí o sí para publicar en ambas consolas. Escribilo
**mientras corren los builds** (son ~25 min de tiempo muerto), a partir del
rango de commits de la Phase 0 (2b).

El archivo lleva tres secciones:

1. **Google Play → "Novedades"**, en es-419, **máximo 500 caracteres** (límite
   duro de Play). Verificá el largo, no lo estimes:
   `… | wc -m` sobre el bloque antes de entregarlo.
2. **App Store Connect → "Novedades de esta versión"** (es-419, hasta 4000
   caracteres, se puede explayar un poco más que Play).
3. **"Qué entró realmente (interno, no publicar)"** — los commits con su hash y
   la causa raíz de cada fix. Es lo que hace auditable el release después.

Reglas de redacción de las notas públicas:

- En **español rioplatense** (es-419), orientadas al apoderado: qué cambia para
  él, nunca jerga interna (nada de RLS, `auth.users`, Edge Functions, hashes).
- Una viñeta por cambio **observable**. Un fix invisible para el usuario se
  resume como "mejoras de estabilidad"; no inventes novedades para llenar.
- Las **remociones también son novedades** — si se sacó una pantalla o un botón,
  el usuario lo va a notar y tiene que estar dicho.

**Chequeo obligatorio contra las Review Notes de ASC**: si el release toca el
login, el alta de cuentas o el onboarding, releé las Review Notes / el
argumento de Guideline 3.2 que ya está cargado en App Store Connect y decí
explícitamente si quedaron inválidas. Caso real (1.6.1, 2026-09-11): sacar el
registro con código dejó al revisor con un código demo que ya no tiene dónde
ingresarse, y volteó el argumento de 3.2 que se le había mandado a Apple. Eso
frena el envío a review y hay que avisarlo **antes** de que el usuario mande.

## Phase 4 — Verify & report

1. Report the version actually shipped per platform. **`build:list` does NOT
   work for this** — local builds are never registered on the EAS servers, so
   it only ever lists old cloud builds (verified 2026-09-08). Read the real
   numbers from the artifacts/logs instead:
   - **iOS**: unzip the IPA's `Info.plist` and read it —
     `unzip -q -o ./tribbu-production.ipa "Payload/*.app/Info.plist" -d /tmp/ipa`
     then `plutil -extract CFBundleVersion raw /tmp/ipa/Payload/*.app/Info.plist`
     (`CFBundleShortVersionString` = the marketing version).
   - **Android**: `grep -i versionCode` on the build log (the
     `CONFIGURE_ANDROID_VERSION` phase prints "Incrementing versionCode from N
     to N+1").
   - Don't pipe a background build through `tail -N`: it buffers the whole run,
     so you lose the header (where the version increment is logged) and get no
     live progress. Redirect the raw output instead.
2. Report submission status from each submit command's output (ASC: el build
   tarda ~10–30 min en procesarse y luego hay que asignarlo a la versión en App
   Store Connect; Play: aparece en el track interno en minutos).
3. Remind the user of the manual console steps that EAS does NOT do, per
   `mobile/STORE_RELEASE.md`: attaching the processed build + submitting for
   review in ASC, and promotion beyond the internal track in Play Console.
   Pegá en el chat los dos bloques listos para copiar de
   `mobile/stores/release-notes-<version>.md` (Phase 3) — son parte de esos
   pasos manuales, y levantá ahí cualquier problema con las Review Notes.
4. Delete or leave the local artifacts as the user prefers (they're gitignored).

## Failure fallbacks

- If a **local** build fails for environment reasons you can't fix, offer the
  cloud build (`npx eas-cli build -p <plat> --profile production`) but warn it
  consumes the free-tier build quota — never launch it without the user's OK.
- If the **iOS** build fails and can't be recovered, don't let that block
  Android — continue to Phase 2, ship it, and report the iOS failure explicitly.
- **`SUBMISSION_SERVICE_IOS_OLD_APP_VERSION`** ("You've already submitted this
  version of the app") = ASC refuses a second build under a marketing version
  (`expo.version`) it already has. `buildNumber` auto-increments, but the
  version string does NOT — so shipping again after a release that already
  reached ASC needs an `expo.version` bump in `mobile/app.config.js` first.
  Check whether the previous release's version already went up (git log /
  `mobile/STORE_RELEASE.md`) BEFORE building iOS, not after (hit 2026-09-08:
  1.3.1 build 18 built and rejected, had to bump to 1.4.0 and rebuild). Ask the
  user for the number and keep both platforms on the same one.
- **Submit status when the CLI's `--wait` dies** (it lost DNS mid-poll on
  2026-09-08: `getaddrinfo ENOTFOUND api.expo.dev`): that kills only the local
  poller — the submission is already scheduled server-side and keeps going, so
  never re-submit blindly. There is no `eas submit:list`; query the Expo API
  with the stored session instead (`-4` matters: `api.expo.dev` intermittently
  hangs over IPv6 on this machine while the rest of the network is fine):

```bash
SECRET=$(node -e "console.log(require(process.env.HOME+'/.expo/state.json').auth.sessionSecret)")
curl -s -4 --max-time 40 https://api.expo.dev/graphql \
  -H 'Content-Type: application/json' -H "expo-session: $SECRET" \
  -d '{"query":"query{submissions{byId(submissionId:\"<id>\"){id status platform error{errorCode message}}}}"}'
```

  `IN_QUEUE` is normal and can last ~50 min on the free tier — not a hang.
  `ERRORED` carries the real `errorCode`/`message`.
- Never commit: `*.aab`, `*.ipa`, `google-services.json`,
  `play-service-account.json`, `mobile/android/`, `mobile/ios/`.
- Do not touch native version numbers in `app.json` — versions are remote.
