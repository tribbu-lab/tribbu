# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**tribbu** is a school-community ("comunidad escolar") mobile/web app: parents (apoderados), Room Parents (admins) and a Super Admin coordinate per-classroom (`curso`) life — calendar, lunch menu, birthdays, reminders, fundraisers (colectas), contacts, etc. React + Vite SPA, Supabase backend, packaged as an Android app via Capacitor + OneSignal push. The domain and all UI copy are in Spanish — match that when writing new strings.

## Commands

```bash
npm run dev       # Vite dev server (web)
npm run build     # production build to dist/
npm run preview   # serve the built dist/
npm run lint      # ESLint (flat config in eslint.config.js)
```

There is **no test suite** and no test runner configured. `npm run lint` is the only automated check.

Android (Capacitor wraps the built `dist/`):
```bash
npm run build && npx cap sync android   # rebuild web + copy into android/
npx cap open android                    # open in Android Studio
```

## Environment

Copy `.env.example` to `.env`. Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Also referenced in code: `VITE_ONESIGNAL_APP_ID` (push). The client only ever uses the **anon** key; the service-role key must never appear in `src/`.

## Architecture

### App shell — `src/App.jsx`
A single ~520-line component that owns nearly all top-level state and routing. There is no router library; `tab` state drives a `switch` in `renderTab()` that mounts one feature. Key responsibilities:
- **Session bootstrap**: on mount, `supabase.auth.getSession()` → load the `usuarios` row (joined with `usuario_hijos` + `usuario_cursos`) by `auth_id`, shape it into the `usuario` object.
- **"Mi acceso" model**: `items` = the user's children (`hijos`) plus any courses where they are a Room Parent. `cursoIdx` selects the active item; `rolEfectivo` ("padre" | "admin") is derived per-item — **a user can be a parent in one course and admin in another**. `cursoId` flows down to every feature as a prop.
- **Three layouts** rendered from the same state: Super Admin (`usuario.rol==="super"` → only `<SuperAdmin/>`), mobile (bottom tab bar + "Más" menu), and desktop (fixed sidebar). When changing navigation/header, update all three.
- **Push deep-linking**: OneSignal notification clicks dispatch a `tribbu:navigate` CustomEvent; `TAB_MAP` maps notification `type` → tab id. `window._tribbuPendingTab` / `_tribbuUserId` bridge the native plugin and React.

### Features — `src/features/<name>/index.jsx`
Each feature is one self-contained file exporting its component(s) (e.g. `Muro`, `Calendario`, `Finanzas`, `SuperAdmin`). They receive `cursoId`, `userId`, `isAdmin`, etc. as props and do their own Supabase queries directly — there is no shared data/store layer. `features/shared/index.jsx` holds cross-feature widgets (`EmojiPicker`). The canonical `ListToolbar` lives in `src/components/ListToolbar.jsx`. `features/contacto` exports both `Contacto` and `Alumnos`.

### Shared modules
- `src/lib/theme.js` — design tokens (`T` color palette, `ROL_LABEL`/`ROL_COLOR`, `HIJO_COLORS_CUSTOM`, `MESES`). Import these instead of hardcoding colors. **Pure & cross-platform** — also consumed by the mobile app via the `@shared` alias.
- `src/lib/tokens.js` — the full design-token system layered on `theme.js` (also pure/cross-platform, `@shared/tokens`): `SLATE`/`BLUE` ramps, `STATUS`, **`THEMES.light`/`THEMES.dark`** (same keys; dark = the login/AppHeader recipe), `TYPE`, `SPACE`, `RADIUS`, `SHADOW`, `MIN_TOUCH`, and `withAlpha`/`roleTheme`/`childTheme`. Reference doc: `mobile/DESIGN_SYSTEM.md`. Prefer these over raw hex in new code (web and mobile).
- `src/lib/helpers.js` — pure helpers: `fmtM` (money, es-AR), `fmtF`/`fmtDM` (dates), `dHasta` (days-until), `sanitize`/`safeUrl` (basic XSS guards — use `safeUrl` for any user-supplied link), `getHijoColor`/`setHijoColor`. The color helpers delegate to a **pluggable storage backend** (`src/lib/storage.js`, default `localStorage`) so mobile can back them with AsyncStorage without changing the sync signature.
- `src/lib/runtimeConfig.js` + `src/lib/storage.js` — **platform-injection seams**. `lib` no longer reads `import.meta.env` directly: the web injects config in `src/bootConfig.js` (imported first in `main.jsx`); mobile injects `EXPO_PUBLIC_*` + an AsyncStorage backend. `supabase.js`, `lib/push.js`, `lib/authAdmin.js` read URL/anon from `getRuntimeConfig()` — keep new env reads going through there, not `import.meta.env`.
- `src/hooks/useListControls.js` + `src/components/ListToolbar.jsx` + `Paginador.jsx` — the standard pattern for any searchable/sortable/filtered/paginated list. Wire `const ctrl = useListControls(items, {...})` then `<ListToolbar {...ctrl}/>` and map `ctrl.items`.
- `src/components/` — `Card`, `Pill`, `Spinner`, etc., re-exported via `components/index.js` barrel.

### Styling
**All styling is inline `style={{}}` objects** — no CSS modules, no Tailwind, no styled-components (only `index.css`/`App.css` globals exist). Follow the existing inline-style convention and pull colors from `T`.

### Backend & auth
- Auth is **Supabase Auth** (`signInWithPassword`, `resetPasswordForEmail`). The `usuarios` table row is linked by `auth_id`. `bcryptjs` is still imported in `features/auth` only as legacy from the pre-Auth password scheme (marked TODO for removal).
- **Privileged auth operations** (create user, change another user's email/password, find by email) go through the Edge Function `supabase/functions/manage-auth-user/index.ts`, called via `src/lib/authAdmin.js`. The function verifies the caller is `super`/`admin` via JWT before using the service-role key server-side. **Never** add the service key to the frontend — route new admin operations through an Edge Function instead.
- **Push** is sent via the `send-push` Edge Function (`supabase/functions/send-push/index.ts`) called from `src/lib/push.js` (`sendPush`, `getUserIdsByCurso`) — the single source for push helpers, imported by every feature as `../../lib/push`. It resolves recipients' Expo push tokens from `push_tokens` and posts to the Expo Push API (replacing the old OneSignal sender); invalid tokens (`DeviceNotRegistered`) are pruned. Invoked with the anon key (no super/admin JWT required), unlike `manage-auth-user`.

### Core data model (Supabase tables)
`usuarios`, `cursos`, `hijos`, `usuario_hijos` (parent↔child), `usuario_cursos` (user↔course with `rol`), `cumples`, `eventos` (+`evento_asistencia`), `recordatorios` (+`recordatorio_leidos`), `colectas` (+`colecta_pagos`), `menu`, `alertas`, `contactos`, plus útiles/libros/uniformes tables. `push_tokens` (Expo push tokens per device, used by the mobile app). The full list is in `backup_tribbu.cjs`'s `TABLES`.

## Mobile app — `mobile/` (Expo · iOS + Android)

A separate **React Native (Expo, managed)** app living in `mobile/`. It does **not** touch the web app (`src/`) beyond the env/storage-injection refactor described above. See `mobile/README.md` for setup/EAS/backend steps.

- **Shared logic, not copied**: Metro `watchFolders` + a Babel `@shared` alias point at `../src/lib`, so `theme.js` and the pure helpers feed both web and mobile from one source. Env and storage are injected per platform (`mobile/lib/config.js` → `EXPO_PUBLIC_*` + AsyncStorage). The Supabase client (`mobile/lib/supabase.js`) uses AsyncStorage + `AppState` auto-refresh; the session persists across restarts. `mobile/lib/push.js` / `authAdmin.js` are thin client-coupled wrappers of the same Edge Functions.
- **Navigation = Expo Router**: `mobile/app/` — root `_layout.jsx` is the auth gate (login / `(tabs)` / `(super)`). The web's three layouts collapse into one mobile layout; Super Admin gets its own stack. `(tabs)/_layout.jsx` renders the persistent `AppHeader` (A3 pattern: notifications bell with unread dot + active-child chip that opens the color picker; the multi-child/course selector row appears below when there's more than one access — account actions live in "Más": Cambiar contraseña + Cerrar sesión) above the custom `FloatingTabBar`. Admin tabs (Alumnos/Admin) are gated on `rolEfectivo==="admin"` via the "Más" screen. Notification deep-links (`mobile/push/useNotificationRouting.js`, `TAB_MAP`) cover foreground/background/cold-start.
- **Role model**: `mobile/context/Session.jsx` is the RN equivalent of the web `App.jsx` bootstrap — loads the `usuarios` row, derives `items` (hijos + admin cursos), `cursoIdx`, `rolEfectivo`, and exposes them via `useSession()`.
- **Push**: `expo-notifications` (replaces OneSignal on mobile). Tokens are stored in `push_tokens` (table SQL: `mobile/supabase/push_tokens.sql`). The `send-push` Edge Function lives at `supabase/functions/send-push/index.ts` (Expo Push API); the user still needs to run `push_tokens.sql` and `supabase functions deploy send-push` against their project.
- **UI**: RN primitives + `StyleSheet` only (no DOM/web styles). Colors/type/spacing come from `@shared/tokens` (`THEMES`, `TYPE`, `SPACE`, `RADIUS`; `T` remains for legacy) — see `mobile/DESIGN_SYSTEM.md` for the component system (`Button`, `Input`, `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Sheet`, `Money`, themable via `context/Theme.jsx`). **UI icons** use `@expo/vector-icons` (MaterialCommunityIcons `-outline` variants); emoji is reserved for content, not chrome. All ported feature screens wear the "A3" skin app-wide: no card shadows (hairline `borderStrong` borders, radius 16), 21/800 titles, `TYPE.label` section labels, soft status pills, urgency-tiered countdown chips, and collapsed select-chip filters (chip + `Sheet`, see `features/recordatorios`). Bottom nav is the custom **`FloatingTabBar`** (`components/`, wired via the Tabs `tabBar` prop; hidden screens stay out via its explicit tab list). Lists use `FlatList`. Conditionals must avoid bare `cond && <X/>` when `cond` can be `0`/`""` (renders stray text) — use ternaries returning `null`.
- **Status**: foundation + auth + session/role model + navigation + push are done. **Ported features**: Muro (Inicio, "A3" pattern: actionable Pendientes carousel — unread recordatorios / unpaid colectas / unanswered festejo invitations — dashed "Estás al día" empty state, unified 15-day agenda with urgency-tiered countdown chips, Comedor card), Recordatorios, in-app Notificaciones, **Calendario** (mes/lista/horario + EventoModal + asistencia), **Comedor** (día/semana/mes + admin Excel upload via `expo-document-picker` + `expo-file-system` + `xlsx`), **Colectas/Finanzas** (pagos + deep-link), **Contacto/Alumnos** (tel/mailto/maps via `Linking`), **Info Útil** (Útiles/Uniformes/Libros/Alumnos), **Cumpleaños** (lista + FestejoModal/FestejoDetalleModal/ResponsableModal/ColectaRegaloModal; invitation image upload + asistencia Excel export), **Admin** (`AdminPanel`: general + horarios; admin AlertaModal lives in Muro), and **Super Admin** (`features/superadmin/` rendered by `app/(super)/`: usuarios/cursos/maestros/alumnos/códigos/horarios/uniformes/alertas/menú + the 3 Excel uploads). Muro deep-links pass route params (`openColecta`→Finanzas, `openFecha`→Calendario, `openFestejo`→Cumpleaños opens that festejo's detail/RSVP modal). **Image upload & Excel export/share** go through `mobile/lib/media.js` (`pickAndUploadImage` via `expo-image-picker` + Supabase Storage; `exportRowsToExcel` via `xlsx` + `expo-sharing`) — the RN replacement for the web's `<input type=file>` / `XLSX.writeFile`. Lists use `mobile/lib/useListControls.js` + `components/ListToolbar.jsx`/`Paginador.jsx`. Remaining gaps: editing the school's contact info in Super Admin is still web-only; the `send-push` Expo migration is the only backend item left.
- **Build & distribution (EAS)**: from `mobile/`, `npx -y eas-cli@latest build -p <ios|android> --profile production` then `… submit -p <ios|android> --latest` (eas-cli is not a dependency; the login session lives in `~/.expo`). Signing is fully EAS-managed (iOS certs + Android keystore remote, native versions auto-increment via `appVersionSource: remote`); submit targets live in `eas.json > submit` (iOS `ascAppId`, Android Play `track: internal`). One-time Android setup (see `mobile/README.md`): `google-services.json` (local + EAS file env var `GOOGLE_SERVICES_JSON`) and an FCM V1 key via `eas credentials` for push; `mobile/play-service-account.json` for Play submits (the first AAB upload to Play Console is manual). Both JSON files are gitignored — never commit them. Android-only assets, both derived from `mobile/assets/icon.png` (regenerate if the logo changes): `adaptive-icon.png` (launcher foreground, glyph padded into the round-mask safe zone) and `splash-icon.png` (glyph on transparent for `android.splash.image` — required: the Android 12+ splash style always references a logo drawable, so an image-less splash fails the Gradle build, unlike iOS).
- **Validation here**: `cd mobile && npm run lint` (expo lint) + `npx expo export -p ios` (Metro bundle gate). For on-device QA, local Android emulator works on this machine: boot the AVD (`~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_36.1`), then `npx expo run:android` with `JAVA_HOME=/Applications/Android Studio.app/Contents/jbr/Contents/Home` (Android Studio's JBR; `/usr/bin/java` is a stub). It prebuilds `mobile/android/` locally — that dir is gitignored on purpose (if it reached git/EAS uploads, cloud builds would silently switch to bare workflow). Drive/screenshot via `adb` (`input tap/text`, `exec-out screencap`). iOS simulator QA is manual.

## Skills (`.claude/skills/`)

These skills are available locally — use them when a task matches. Load the skill's `SKILL.md` (and its `rules/` files where present) before acting on a matching task.

- **vercel-react-best-practices** — React/Next.js performance rules from Vercel (70 rules in `rules/`, 8 categories). Apply when **writing, reviewing, or refactoring React components, data fetching, re-render behavior, or bundle/perf**. The most relevant skill here given the React + Vite codebase — consult it before adding components or effects.
- **vercel-react-native-skills** — React Native / Expo best practices (list perf, animations, native modules). Use when working on the **Android/Capacitor mobile side** or any React Native / mobile-performance concern.
- **frontend-design** — guidance for distinctive, intentional visual design. Use when **building new UI or reshaping existing UI** (palette, typography, layout) so the result doesn't read as a templated default.
- **web-design-guidelines** — reviews UI code against Web Interface Guidelines. Use when asked to **review UI/UX, audit design, or check accessibility**.
- **agent-browser** — browser-automation CLI for AI agents. Use when a task needs to **drive a real browser**: navigate pages, fill forms, click, screenshot, scrape, or QA/test the running web app. Prefer it over built-in browser/web tools.
- **spec** — generates a feature spec grounded in tribbu's architecture. Use when the user wants to **plan or specify a new feature before implementing it**. Reads `specs/_template.md` + this file, asks clarifying questions, then writes the spec to `specs/<name>.md`.
- **implement** — full plan → implement → validate → document workflow for a **new feature** end-to-end. Use when the user wants to **build a feature** (not just spec it): asks clarifying questions, implements following tribbu conventions, validates with lint + build + manual QA, and updates `CLAUDE.md`/the spec. Pairs with **spec** (run `/spec` first for non-trivial features).
- **fix-bug** — investigate → root-cause → minimal fix → self-validate workflow. Use when the user **reports a bug or regression to fix**. Traces the real code path (App shell / feature / lib / Supabase), presents the root cause before changing code, and **must self-validate the fix** (lint + build + manual QA in the running app via agent-browser) before claiming it works — tribbu has no test suite.

## Repository hygiene

The root `*.cjs` scripts (`hash_passwords`, `migrate_to_auth`, `migrate_remaining`, `reset_passwords`, `backup_tribbu`) are **one-time** Node migration/backup utilities run manually with `node <file>.cjs`. They contain hardcoded Supabase service-role keys and connect to the live project — do not run them casually, and do not copy that key pattern into `src/`.
