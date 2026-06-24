---
name: spec
description: Generate a well-structured feature spec grounded in the current project state. Reads the template, understands architecture, asks clarifying questions, and writes the spec file. Use when the user wants to plan or specify a new tribbu feature before implementing it.
argument-hint: <feature-description>
---

# Spec Writer

You are writing a feature spec for **tribbu** (a school-community app: parents/apoderados, Room Parents/admins and a Super Admin coordinate per-classroom life). Your goal is to produce a clear, actionable spec that can be handed off for implementation.

## Input

$ARGUMENTS

## Phase 1: Understand Context

Before writing anything, gather context:

1. **Read the template**: Read `specs/_template.md` to get the exact output format (frontmatter fields, section headings). Your spec MUST follow this structure — do not invent new sections unless the user asks.
2. **Read project docs**: Read `CLAUDE.md` to understand architecture, tech stack (React + Vite SPA, Supabase, Capacitor/OneSignal), the "Mi acceso" model, conventions (inline styles, design tokens), and the repository-hygiene rules.
3. **Scan existing specs**: Run `ls specs/` to see what features already exist. Read any specs that seem related to the requested feature to avoid overlap and maintain consistency in style and detail level.
4. **Inspect relevant code**: Based on the feature description, selectively read the parts of the codebase that matter. Don't read everything — focus on what's relevant:
   - `src/App.jsx` — the app shell: top-level state, `tab`-driven routing, the `items`/`cursoIdx`/`rolEfectivo` ("Mi acceso") model, and the three layouts (super / mobile / desktop). Read this if the feature adds a tab, changes navigation, or touches the role model.
   - `src/features/<name>/index.jsx` — if the feature extends or resembles an existing feature (e.g. `muro`, `calendario`, `finanzas`, `cumples`, `recordatorios`, `comedor`, `contacto`, `admin`, `superadmin`).
   - `src/lib/` — `theme.js` (design tokens `T`, role labels), `helpers.js` (formatters, `sanitize`/`safeUrl`), `authAdmin.js`, `push.js`/`notifications.js` (push + course-membership helpers). Read if the feature needs shared logic, money/date formatting, or notifications.
   - `src/hooks/` + `src/components/` — `useListControls` + `ListToolbar`/`Paginador` if the feature involves a searchable/sortable/paginated list; `Card`/`Pill`/`Spinner` for shared UI.
   - `supabase/functions/` — Edge Functions, if the feature needs a privileged/server-side operation (the service-role key must never reach the client).
   - Data model: the Supabase tables are listed in `CLAUDE.md` ("Core data model") and exhaustively in `backup_tribbu.cjs`'s `TABLES`. Read if the feature likely needs schema changes.

## Phase 1.5: Consult Local Skills

tribbu ships several skills under `.agents/skills/`. Decide which (if any) apply to this feature, then load that skill's `SKILL.md` (and its `rules/` where present) and let it shape the spec's Acceptance Criteria and Technical Notes. Pick by what the feature touches:

- **vercel-react-best-practices** — any feature that adds React components, effects, data fetching, or has a re-render/perf dimension. Almost always relevant given the React + Vite codebase.
- **vercel-react-native-skills** — features touching the Android/Capacitor side, native modules, OneSignal push behavior, or mobile-list performance.
- **frontend-design** — features that introduce new UI surfaces or reshape existing ones (palette, typography, layout).
- **web-design-guidelines** — features where the spec should hold the UI to accessibility/UX standards.
- **agent-browser** — note in Technical Notes if the feature will need real-browser QA/testing to verify.

When a skill informs a criterion or note, add a short trailing citation so the source is traceable — e.g. `[skill: vercel-react-best-practices]`. Keep it lightweight.

**Never block the spec on a skill.** If a skill is missing, unreadable, or not applicable, note it in your working summary (e.g. "frontend-design skipped — no new UI") and proceed using the template + project context. No retry loops.

## Phase 2: Clarify

Evaluate whether the feature description is clear enough to write a good spec. If any of the following are ambiguous, **ask the user before proceeding**:

- **Scope**: What's included vs. excluded? (e.g. "Should this apply to all `cursos` or only the active one?")
- **Roles**: Who can do this — apoderado (padre), Room Parent (admin), Super Admin? Recall `rolEfectivo` is per-item, so a user can be padre in one course and admin in another. (e.g. "Can a padre create these, or only an admin?")
- **User flow**: How does the user interact with this? (e.g. "Is this a new tab, a modal, an addition to the Muro, or part of an existing feature?")
- **Data model**: Does this need new Supabase tables/columns? Is data scoped per-`curso`, per-`hijo`, or per-`usuario`? (e.g. "Should this store one row per child or per course?")
- **Edge cases**: Any special handling? (e.g. "What happens for a user who has children in multiple courses?")
- **Notifications**: Should this send a push (OneSignal via the `send-push` Edge Function) and/or appear in the in-app notification center?
- **Integration**: How does it connect to existing features? (e.g. "Should creating this also surface an alerta on the Muro?")

**Rules for questions:**

- Ask only what you genuinely need — don't ask for the sake of asking.
- Present questions as a numbered list for easy answering.
- If the description is already clear and complete, skip this phase and say so.
- Wait for the user's answers before proceeding to Phase 3.

## Phase 3: Draft & Confirm

1. **Draft the spec** following the template format exactly:
   - `title`: Short, descriptive feature name.
   - `status: draft`
   - `priority`: Infer from context (high/medium/low), or ask if unclear.
   - **Summary**: One paragraph — what it does and why it's needed. Reference the user's problem (in the school-community domain), not implementation details. UI copy and domain terms are Spanish — use the project's vocabulary (curso, hijo, apoderado, Room Parent, recordatorio, colecta, etc.).
   - **Acceptance Criteria**: Specific, testable checklist items, each verifiable by reading the code or running the app. Bad: "should work well". Good: "Only users whose `rolEfectivo` is `admin` for the active `cursoId` see the create button". **If the feature includes UI**, always add a criterion that it works across all three layouts (Super Admin / mobile bottom-tab / desktop sidebar) and is usable on a narrow phone screen.
   - **Technical Notes**: Reference real tribbu modules, patterns, and conventions from `CLAUDE.md`. Be concrete:
     - Styling is **inline `style={{}}` objects only** — pull colors from the `T` token palette in `src/lib/theme.js`; no CSS frameworks.
     - Features are self-contained `src/features/<name>/index.jsx` files that query Supabase directly and receive `cursoId`, `userId`, `isAdmin` etc. as props from `App.jsx`.
     - Use `useListControls` + `ListToolbar` + `Paginador` for any searchable/sortable/paginated list.
     - Use `sanitize`/`safeUrl` from `helpers.js` for any user-supplied text/links.
     - Privileged auth/admin operations go through an **Edge Function** (pattern: `supabase/functions/manage-auth-user`, called via `lib/authAdmin.js`); never put the service-role key in `src/`.
     - Push goes through `sendPush` / `getUserIdsByCurso` (`lib/notifications.js`) and the `send-push` Edge Function.
     - A new top-level tab means updating `TABS`, `renderTab()`, and — for push deep-linking — `TAB_MAP` in `App.jsx`, across the mobile and desktop layouts.
     - Mobile-first: tribbu is also a Capacitor Android app; respect `env(safe-area-inset-*)`, keep touch targets comfortable, and verify the mobile bottom-tab layout.
   - **Out of Scope**: Always populated. Explicitly list what this feature does NOT include to prevent scope creep.

2. **Present the full spec** to the user in a code block for review.

3. **Wait for confirmation** or feedback. If the user requests changes, incorporate them and re-present.

## Phase 4: Write

Once the user confirms:

1. Derive the filename from the title using kebab-case (e.g. "Permisos de Salida" → `permisos-de-salida.md`).
2. Write the spec to `specs/<filename>.md` (create the `specs/` directory if it doesn't exist).
3. Report the file path so the user can reference it for implementation.
