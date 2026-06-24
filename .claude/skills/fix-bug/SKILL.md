---
name: fix-bug
description: Investigate, fix, and validate a bug in tribbu. Follows root-cause analysis, makes the minimal fix, and validates with lint + build + manual QA in the running app (no test suite exists). Use when the user reports a bug or regression to fix.
argument-hint: <bug-description-or-issue-url>
---

# Bug Fix Workflow

You are fixing a bug in **tribbu**, a school-community ("comunidad escolar") app: parents (apoderados), Room Parents (admins) and a Super Admin coordinate per-classroom (`curso`) life — calendar, lunch menu, birthdays, reminders, fundraisers (colectas), contacts, etc. React + Vite SPA, Supabase backend, packaged as an Android app via Capacitor + OneSignal push. **The domain and all UI copy are in Spanish — match that when writing new strings.**

## Bug Report

$ARGUMENTS

## Phase 1: Investigate

1. **Read `CLAUDE.md`** to refresh the architecture — the App shell, the "Mi acceso" role model (`rolEfectivo` is per-item: a user can be padre in one course and admin in another), conventions (inline styles, design tokens), and repository-hygiene rules (never touch the root `*.cjs` migration scripts or backup files).
2. **Reproduce / trace the bug** by following the actual code path, don't guess. Most likely starting points:
   - `src/App.jsx` — session bootstrap, `tab`-driven `renderTab()` routing, the `items`/`cursoIdx`/`rolEfectivo` model, `TABS`/`TAB_MAP`, the three layouts (Super Admin / mobile bottom-tab / desktop sidebar). Check here for navigation, role-gating, or session/`cursoId`-propagation bugs.
   - `src/features/<name>/index.jsx` — the self-contained feature file (`muro`, `calendario`, `finanzas`, `cumples`, `recordatorios`, `comedor`, `contacto`, `admin`, `superadmin`, `notificaciones`, `info`). Each does its own Supabase queries directly.
   - `src/lib/` — `theme.js`, `helpers.js` (`fmtM`/`fmtF`/`fmtDM`/`dHasta`, `sanitize`/`safeUrl`, `getHijoColor`), `authAdmin.js`, `push.js` (`sendPush`, `getUserIdsByCurso`).
   - `src/hooks/useListControls.js`, `src/components/` (`ListToolbar`, `Paginador`, `Card`, `Pill`, `Spinner`).
   - `supabase/functions/manage-auth-user/index.ts` — privileged auth operations.
3. Use **Grep** and **Glob** to find the relevant code fast.
4. **Identify the root cause** — don't just patch the symptom. Common tribbu-specific causes:
   - **Role gating**: `isAdmin` derived from the wrong item, or a check that assumes a single global role instead of per-`cursoId` `rolEfectivo`.
   - **Scoping**: a query missing its `curso_id` / `hijo_id` / `usuario_id` filter, so data leaks across courses or children.
   - **Data shape**: the `usuario` object assembled in `App.jsx` from the `usuarios` + `usuario_hijos` + `usuario_cursos` join.
   - **Supabase RLS / query**: a `.select()` that doesn't match the table's row-level-security policy, or a missing join.
   - **Push deep-linking**: `TAB_MAP` mismatch, or the `tribbu:navigate` event / `window._tribbuPendingTab` bridge.
5. **Present your findings** to the user before changing code:
   - Root-cause explanation.
   - Affected files (use clickable `path:line` references).
   - Proposed fix approach.
   - Any risks or side effects — especially across the three layouts or the role model.

## Phase 2: Fix

1. Make the **minimal change** needed to fix the bug.
2. Do **NOT** refactor, add features, or "improve" surrounding code in the same change.
3. Follow tribbu conventions in the fix:
   - **Styling is inline `style={{}}` objects only** — no Tailwind/CSS modules. Pull colors from the `T` token palette in `src/lib/theme.js`; never hardcode colors.
   - Use existing helpers: `fmtM`/`fmtF`/`fmtDM`/`dHasta`, `sanitize` for user text, `safeUrl` for user-supplied links. Don't reinvent them.
   - Keep all UI copy in **Spanish**, using the project vocabulary (curso, hijo, apoderado, Room Parent, recordatorio, colecta, comedor, alerta).
   - Gate admin-only actions on `isAdmin` (per-`cursoId` `rolEfectivo === "admin"`).
   - **Never** add the service-role key to `src/` — route any new privileged operation through an Edge Function (pattern: `supabase/functions/manage-auth-user/index.ts`, called via `src/lib/authAdmin.js`, verifying the caller's JWT).
4. **If the bug is in a UI component**, keep the fix mobile-friendly (tribbu is also a Capacitor Android app, and the mobile bottom-tab layout is the primary surface):
   - Design for narrow phone widths; no content should force horizontal scroll on a phone-width viewport.
   - Respect `env(safe-area-inset-*)` where the surrounding layout does.
   - Keep touch targets comfortable (≥44px).
   - If the fix changes navigation or the header, update **all three layouts** (Super Admin, mobile bottom-tab, desktop sidebar).
5. **If the fix requires a database change**: tribbu has **no migration tooling in-tree**. Provide the SQL (`alter table` / RLS policy, matching the conventions of existing tables — snake_case, Spanish nouns) for the user to run in the Supabase SQL editor, and confirm before relying on it. Do not run the root `*.cjs` scripts.
6. **Consult local skills** that apply (load `SKILL.md` + any `rules/` first): **vercel-react-best-practices** (re-render / effect / data-fetch bugs), **vercel-react-native-skills** (Capacitor/Android, OneSignal), **web-design-guidelines** (accessibility/UX regressions), **frontend-design** (visual fixes).
7. Run `npm run lint` and fix any issues introduced.

## Phase 3: Self-Validate (MANDATORY — do NOT assume the fix works)

There is **no test suite and no test runner** in tribbu — `npm run lint` is the only automated check. A clean lint, a clean build, and a passing code-read are **NOT proof the bug is fixed**. The only proof is **observing the original bug no longer reproduce in the running app**. You must complete this phase and gather that evidence before claiming success.

**Hard rule:** Never tell the user the bug is fixed based on reasoning, code review, or "the change looks correct." If you could not actually reproduce-then-confirm-gone (e.g. the bug needs real Supabase data, a specific role, or a device-only path), say so explicitly and state exactly what you *did* verify and what remains unverified — do not round up to "fixed."

1. **Build gate** — both must pass; fix and re-run until clean (lint/build passing is necessary but not sufficient):
   ```bash
   npm run lint && npm run build
   ```
2. **Reproduce-then-confirm-gone in the running app**, using the **agent-browser** skill (`npm run dev`, then drive the real browser). This is the core of validation:
   - **Reproduce the exact steps** from the bug report and confirm the bug is **gone**. If you can, capture the before/after evidence (the failing state vs. the fixed state — a screenshot or the observed DOM/console).
   - Confirm you did **not** break the **happy path** of the affected feature.
   - Check the **role gating** still holds — exercise it as both apoderado and admin where the bug touches `rolEfectivo`/`isAdmin`.
   - Verify in the **mobile** (narrow viewport) and **desktop sidebar** layouts; if the fix touches the Super Admin surface, check that too.
   - Confirm **no console errors** and no horizontal-scroll bleed on a phone-width viewport.
3. **If you cannot fully reproduce the fix locally** (missing data, push/native-only path, server-side RLS, etc.): do the most you can in-browser, then clearly enumerate the residual steps the user must run to confirm — with the exact actions and expected result. Treat the fix as *unconfirmed* until then.
4. If the fix touches the Android/Capacitor side, note that the native build is verified separately with `npm run build && npx cap sync android` (don't open Android Studio unprompted).

## Phase 4: Summary

Present a concise summary:
- **Root cause** — what was actually wrong.
- **What was changed** — files modified (clickable `path:line` refs), and any SQL the user still needs to run in Supabase.
- **Validation evidence** — what you actually observed proving the bug is gone (the reproduce-then-confirm-gone result, layouts/roles QA'd, lint/build status). State plainly whatever you could **not** confirm locally and what the user must verify themselves — do not claim "fixed" without the evidence from Phase 3.
- **Risks / follow-ups** — anything to watch, or related cleanup worth a separate change.
