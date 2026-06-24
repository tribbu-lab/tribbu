---
title: Limpieza de código duplicado y backups en desuso
status: implemented
priority: medium
---

## Summary

El repositorio de tribbu acumula copias de respaldo manuales y módulos
duplicados que ya no se usan: snapshots completos del `App.jsx` previos a
Capacitor, una carpeta `src - Copy/` entera, un backup de datos en JSON, y
varios módulos en `src/lib` y `src/features/shared` que duplican lógica viva.
Esto infla el repo (~1.6 MB de archivos muertos), confunde búsquedas y deja
guías contradictorias en `CLAUDE.md` (recomienda `notifications.js`, pero todas
las features importan `push.js`). Esta tarea elimina los archivos en desuso,
consolida los duplicados hacia una sola fuente de verdad y actualiza `CLAUDE.md`
para reflejar la realidad. No cambia ningún comportamiento de la app.

## Acceptance Criteria

- [x] Se eliminan (vía `git rm`) los backups no importados por nadie:
  `App.backup_pre-capacitor_20260318.jsx`, `tribbu_backup_2026-03-17.json`,
  `src - Copy/` (carpeta completa), `src/App - Copy 0604.jsx`,
  `src/features/cumples/index_original.jsx`.
- [x] `src/lib/notifications.js` se elimina; su implementación mejorada
  (`sendPush` devuelve `await res.json()` y `null` ante error;
  `getUserIdsByCurso` con el mismo cuerpo) se porta a `src/lib/push.js`,
  conservando el import path `../../lib/push` que ya usan las 9 features.
- [x] Las 9 features que importan `{ sendPush, getUserIdsByCurso } from "../../lib/push"`
  siguen funcionando sin cambios en sus imports (calendario, cumples, finanzas,
  muro, superadmin, admin, recordatorios, comedor).
- [x] `src/lib/hijoColors.js` se elimina (su `getHijoColor`/`setHijoColor` ya
  viven en `helpers.js`, que es de donde `App.jsx` los importa).
- [x] La función `ListToolbar` duplicada en `src/features/shared/index.jsx` se
  elimina; `EmojiPicker` (que sí se usa en superadmin) permanece. La
  `ListToolbar` canónica sigue siendo `src/components/ListToolbar.jsx`,
  re-exportada por el barrel `components/index.js`.
- [x] `CLAUDE.md` se actualiza: se quitan de la sección "Repository hygiene" las
  entradas de archivos ya borrados; se corrige la guía de push para decir que
  `lib/push.js` es la fuente única (eliminando la mención a `notifications.js` y
  la nota de "estos dos archivos duplican helpers").
- [x] `npm run lint` pasa sin nuevos errores y `npm run build` compila tras la
  limpieza (verificación de que no quedó ningún import colgando).
- [x] No se modifica ningún comportamiento observable de la app en los tres
  layouts (Super Admin / mobile bottom-tab / desktop sidebar): es refactor puro.

## Technical Notes

- **Solo borrado + consolidación, cero features nuevas.** Ningún cambio de UI ni
  de estilos; no se tocan tokens de `T` ni layouts.
- **Verificar "sin imports" antes de borrar** cada archivo con un grep
  (`grep -rn` sobre `src/`, excluyendo el propio archivo). Ya confirmado:
  ningún `*.jsx`/`*.js` vivo importa los backups, `notifications.js`,
  `hijoColors.js`, ni la `ListToolbar` de `shared`.
- **push.js**: portar el cuerpo de `notifications.js` pero conservando
  `import { supabase } from "../supabase"` (el path correcto desde `lib/`;
  `notifications.js` usaba `"./supabase"`, que era parte de por qué estaba
  desconectado). Mantener exactamente las firmas `sendPush(...)` y
  `getUserIdsByCurso(cursoId)`.
- **Edge Function `send-push`** no se toca — sigue siendo el backend de
  `sendPush`. Esta limpieza es puramente del lado cliente.
- **Orden seguro de operaciones**: (1) portar impl a `push.js`; (2) `git rm`
  duplicados y backups; (3) `npm run lint && npm run build`; (4) actualizar
  `CLAUDE.md`. El build es la red de seguridad ante un import olvidado.
- **Historial preservado**: todo lo borrado queda en el historial de git, así
  que no hace falta archivar nada por fuera. [skill: vercel-react-best-practices —
  reducir módulos muertos y rutas de import ambiguas ayuda al tree-shaking y a la
  claridad del bundle]

## Out of Scope

- Los scripts `*.cjs` de la raíz (`hash_passwords`, `migrate_to_auth`,
  `migrate_remaining`, `reset_passwords`, `backup_tribbu`) — quedan tal cual,
  incluidas sus service-role keys hardcodeadas. (Decisión del usuario: fuera de
  alcance; tratar la exposición de claves sería una tarea de seguridad aparte.)
- Eliminar la dependencia legacy `bcryptjs` de `features/auth` (marcada como
  TODO en CLAUDE.md) — no es duplicado ni backup.
- Cualquier refactor de lógica de negocio, renombre de tablas Supabase o cambio
  de comportamiento.
- Reescritura de `App.jsx` o de features para reducir su tamaño — solo se
  borran copias, no se reorganiza código vivo.
