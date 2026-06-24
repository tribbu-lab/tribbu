---
title: <Feature Name>
status: draft
priority: <high | medium | low>
---

## Summary

<One paragraph: what this feature does and why it's needed. Frame it around the
user's problem in the school-community domain (curso, hijo, apoderado, Room
Parent, Super Admin), not implementation details. UI copy is Spanish.>

## Acceptance Criteria

<Specific, testable checklist items. Each must be verifiable by reading the code
or running the app. If the feature includes UI, include a criterion for all
three layouts (Super Admin / mobile bottom-tab / desktop sidebar) and narrow
phone screens.>

- [ ]
- [ ]
- [ ]

## Technical Notes

<Reference real tribbu modules, patterns, and conventions from CLAUDE.md:
feature file in src/features/<name>/index.jsx, props from App.jsx
(cursoId/userId/isAdmin), inline styles with T tokens from src/lib/theme.js,
useListControls/ListToolbar for lists, sanitize/safeUrl for user input,
Edge Functions for privileged ops, sendPush for notifications, new tabs touching
TABS/renderTab()/TAB_MAP. Note any new Supabase tables/columns and data scoping
(per-curso / per-hijo / per-usuario). Cite any skill that informed the spec,
e.g. [skill: vercel-react-best-practices].>

-

## Out of Scope

<Explicitly list what this feature does NOT include, to prevent scope creep.>

-
