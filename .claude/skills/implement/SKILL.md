---
name: implement
description: Plan, implement, validate, and document a new tribbu feature end-to-end. Follows the full agentic workflow — clarifying questions, implementation, manual QA, lint/build validation, and CLAUDE.md/spec updates. Use when the user wants to build a feature (not just spec it).
argument-hint: <feature-description-or-spec-file>
---

# New Feature Implementation Workflow

You are implementing a new feature for **tribbu**, a school-community ("comunidad escolar") app: parents (apoderados), Room Parents (admins) and a Super Admin coordinate per-classroom (`curso`) life — calendar, lunch menu, birthdays, reminders, fundraisers (colectas), contacts, etc. React + Vite SPA, Supabase backend, packaged as an Android app via Capacitor + OneSignal push. **The domain and all UI copy are in Spanish — match that when writing new strings.**

## Feature Request

$ARGUMENTS

## Phase 1: Plan & Clarify

1. **Read `CLAUDE.md`** to refresh the architecture, the "Mi acceso" role model, conventions (inline styles, design tokens), and the repository-hygiene rules (never edit the `*Copy*`, `*backup*`, `index_original.jsx`, or root `*.cjs` files).
2. **Read the spec if one exists.** If `$ARGUMENTS` names a file in `specs/`, or `ls specs/` shows a spec matching this feature, read it for acceptance criteria and treat it as the source of truth. If no spec exists and the feature is non-trivial, suggest running `/spec` first.
3. **Inspect the relevant code** — don't read everything, focus on what the feature touches:
   - `src/App.jsx` — app shell: top-level state, `tab`-driven `renderTab()` routing, the `items`/`cursoIdx`/`rolEfectivo` model, `TABS`, `TAB_MAP`, and the three layouts (Super Admin / mobile bottom-tab / desktop sidebar). Read this if the feature adds a tab, changes navigation, or touches the role model.
   - `src/features/<name>/index.jsx` — the closest existing feature (`muro`, `calendario`, `finanzas`, `cumples`, `recordatorios`, `comedor`, `contacto`, `admin`, `superadmin`) to mirror its structure and Supabase query style.
   - `src/lib/` — `theme.js` (tokens `T`, `ROL_LABEL`/`ROL_COLOR`, `MESES`), `helpers.js` (`fmtM`/`fmtF`/`fmtDM`/`dHasta`, `sanitize`/`safeUrl`, `getHijoColor`), `authAdmin.js`, `notifications.js` (`sendPush`, `getUserIdsByCurso`).
   - `src/hooks/useListControls.js` + `src/components/` (`ListToolbar`, `Paginador`, `Card`, `Pill`, `Spinner`) for list-shaped UI.
   - `supabase/functions/` — if the feature needs a privileged/server-side operation.
4. **Identify** which layers are affected (App shell / feature / lib / Supabase schema / Edge Function), what's reused vs. new, and any new Supabase tables/columns and their scoping (per-`curso` / per-`hijo` / per-`usuario`).
5. **Consult local skills** that apply (load the `SKILL.md` + any `rules/` before acting):
   - **vercel-react-best-practices** — almost always relevant; consult before adding components, effects, or data fetching.
   - **vercel-react-native-skills** — Capacitor/Android side, OneSignal push behavior, mobile-list performance.
   - **frontend-design** — new or reshaped UI surfaces.
   - **web-design-guidelines** — when the UI should be held to accessibility/UX standards.
   - **agent-browser** — to QA the running web app in Phase 3.
6. **Present a plan** to the user:
   - Summary of what you'll build.
   - Files you'll create or modify (and any Supabase schema changes).
   - Clarifying questions where requirements are ambiguous — especially: **roles** (who can do this — apoderado, admin, super? remember `rolEfectivo` is per-item), **scope** (all `cursos` or only the active one?), **user flow** (new tab / modal / addition to an existing feature?), **data model** (new tables/columns? scoping?), **notifications** (push via `send-push` and/or in-app alerta?), and **edge cases** (user with children in multiple courses).
7. **Wait for user approval** before proceeding.

## Phase 2: Implement

Once the plan is approved:

1. **Database changes** (if needed):
   - tribbu has **no migration tooling in-tree**. Provide the SQL (`create table` / `alter table`, with appropriate RLS policies matching existing tables) for the user to run in the Supabase SQL editor, and confirm with them before relying on it. Keep table/column naming consistent with the existing schema (snake_case, Spanish domain nouns). The full table list is in `CLAUDE.md` and `backup_tribbu.cjs`'s `TABLES`.

2. **Privileged / server-side operations**: never put the service-role key in `src/`. Route create-user / change-another-user's-credentials / find-by-email and any service-role operation through an **Edge Function** (pattern: `supabase/functions/manage-auth-user/index.ts`, called via `src/lib/authAdmin.js`). The function must verify the caller is `super`/`admin` via JWT first.

3. **Implement the feature following tribbu conventions**:
   - One self-contained `src/features/<name>/index.jsx` file that queries Supabase directly and receives `cursoId`, `userId`, `isAdmin`, etc. as props from `App.jsx`. No shared data/store layer.
   - **Styling is inline `style={{}}` objects only** — no Tailwind, no CSS modules, no styled-components. Pull every color from the `T` token palette in `src/lib/theme.js`; never hardcode colors.
   - Use `fmtM` for money (es-AR), `fmtF`/`fmtDM` for dates, `dHasta` for days-until — don't reinvent formatters.
   - Use `sanitize` for user-supplied text and `safeUrl` for any user-supplied link (XSS guards).
   - Use `useListControls` + `ListToolbar` + `Paginador` for any searchable/sortable/filtered/paginated list.
   - Reuse `Card`/`Pill`/`Spinner` from `src/components/` for shared UI.
   - Gate admin-only actions on `isAdmin` (derived from `rolEfectivo === "admin"` for the active `cursoId`) — a user can be padre in one course and admin in another.
   - **All UI copy in Spanish**, using the project's vocabulary (curso, hijo, apoderado, Room Parent, recordatorio, colecta, comedor, alerta).
   - Send push (`sendPush` + `getUserIdsByCurso` from `lib/notifications.js`, via the `send-push` Edge Function) and/or surface an in-app alerta only when the plan calls for it.

4. **If the feature adds a new top-level tab**, update `App.jsx` consistently across all three layouts: add it to `TABS`, handle it in `renderTab()`, and — for push deep-linking — add it to `TAB_MAP`. Verify the Super Admin, mobile bottom-tab, and desktop sidebar paths.

5. **Mobile-first** (tribbu is also a Capacitor Android app):
   - Design for narrow phone widths first; the mobile bottom-tab layout is the primary surface.
   - Respect `env(safe-area-inset-*)` where the existing layout does.
   - Keep touch targets comfortable (≥44px) and ensure text doesn't clip or force horizontal scroll on a narrow screen.

6. Run `npm run lint` after implementation and fix any issues.

## Phase 3: Validate & QA

There is **no test suite and no test runner** in tribbu — `npm run lint` is the only automated check. So validation is lint + build + manual QA:

1. Run the build gate:
   ```bash
   npm run lint && npm run build
   ```
   Both must pass. Fix and re-run until clean.

2. **Manually QA the running web app** with the **agent-browser** skill (`npm run dev`, then drive the browser): exercise the feature's happy path and the role gating. Verify it works in the **mobile** layout (narrow viewport) and the **desktop sidebar** layout; if it touches the Super Admin surface, check that too. Confirm no console errors and no horizontal-scroll bleed on a phone-width viewport.

3. If the feature touches the Android/Capacitor side, note that the native build is verified separately with `npm run build && npx cap sync android` (don't run Android Studio unprompted).

## Phase 4: Document & Codify

1. **Update `CLAUDE.md`** if the feature introduces anything that changes how the codebase is described:
   - A new top-level tab / feature directory (`src/features/<name>/`).
   - A new shared module in `src/lib/`, `src/hooks/`, or `src/components/`.
   - A new Supabase table/column (add to the "Core data model" list).
   - A new Edge Function or environment variable.
   - A new pattern or convention.

2. **Update the spec** in `specs/` if acceptance criteria were defined: check off the criteria that are met and set `status: implemented` in the frontmatter.

## Phase 5: Summary

Present a concise summary:
- What was implemented (files created/modified, any SQL the user still needs to run).
- What QA was performed and its result (layouts checked, lint/build status).
- Decisions made and why.
- Suggestions for follow-up work.
