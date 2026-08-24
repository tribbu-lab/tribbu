---
title: Comunicaciones multi-curso
status: draft
priority: medium
---

## Summary

Hoy, cuando el Super Admin quiere avisar algo a varios cursos a la vez (una
circular de todo el colegio, un aviso que aplica a dos secciones del mismo
grado), tiene que entrar curso por curso y cargar el mismo recordatorio
manualmente en cada uno. Esta feature agrega, dentro de **Super Admin**, un
lugar para redactar un recordatorio una sola vez y elegir a qué cursos se
publica, entre **todos** los cursos del colegio. Se publica un recordatorio
independiente en cada curso elegido (mismo modelo y mismas reglas que hoy —
se edita/borra por curso, igual que cualquier otro recordatorio, pero unidos
por un identificador común para poder rastrearlos como una sola comunicación)
y se avisa por push una sola vez a todos los destinatarios, sin duplicar el
push a un apoderado con hijos en más de un curso elegido. Un Room Parent
sigue publicando recordatorios exactamente como hoy, siempre en su propio
curso — esta feature no le agrega ninguna capacidad nueva.

## Acceptance Criteria

- [ ] `recordatorios` tiene una columna nueva `grupo_id uuid` (nullable —
      `null` para cualquier recordatorio creado como siempre, con un solo
      curso).
- [ ] Web: nueva sección "Comunicaciones" dentro de `SuperAdmin`
      (`src/features/superadmin/index.jsx`), siguiendo el patrón ya usado por
      `AlertasAdmin({ cursos })`/`HorariosAdmin({ cursos })` — el selector
      ofrece **todos** los cursos del colegio.
- [ ] Mobile: misma sección en `mobile/features/superadmin/index.jsx`.
- [ ] `AdminPanel` (Room Parent, web y mobile) **no cambia** — sigue
      publicando recordatorios solo en su propio curso, como hoy.
- [ ] El formulario reutiliza los mismos campos que un recordatorio normal:
      texto, fecha (opcional), prioridad, urgente, adjuntos — mismos límites
      y componentes (`AdjuntosInput`, tope de 3 archivos).
- [ ] Selector de cursos: checkboxes con "Seleccionar todos" (todos los
      cursos habilitados para ese rol). Publicar requiere al menos 1 curso
      elegido y el texto no vacío — mismas validaciones silenciosas que hoy
      (`if(!form.texto?.trim()) return`).
- [ ] Confirmación antes de publicar ("¿Publicar en {N} cursos?") — mismo
      patrón que ya usa `AlertaModal` para "Enviar alerta a toda la
      comunidad".
- [ ] Al publicar, se genera **un `grupo_id` (uuid) nuevo** y se hace **un
      insert por curso elegido** en `recordatorios` (misma fila que crearía
      hoy el "+ Nuevo" de Recordatorios, con `curso_id` de cada curso,
      `creado_por` = usuario actual, y ese `grupo_id` compartido) — no una
      fila compartida entre cursos. Aparece en la lista de Recordatorios de
      cada curso exacto igual que cualquier otro recordatorio, y se
      edita/borra por curso de forma independiente (sin acción de "editar
      todas a la vez" en esta primera versión — el `grupo_id` deja la puerta
      abierta para agregarla después sin volver a tocar el modelo de datos).
- [ ] Push: se resuelven los destinatarios de **todos** los cursos elegidos
      con `getUserIdsByCurso` y se **deduplican** antes de mandar — un
      apoderado con hijos en 2+ de los cursos elegidos recibe **un solo**
      push, no uno por curso. Un solo llamado a `sendPush({type:"recordatorio", ...})`
      con la lista ya deduplicada (mismo copy "Nuevo recordatorio" que hoy).
- [ ] Se ve bien en el layout de Super Admin tanto en mobile como en desktop,
      y en pantalla angosta.
- [ ] `npm run lint` (raíz) y `cd mobile && npm run lint` + `npx expo export -p ios`
      pasan.

## Technical Notes

- **SQL**: `alter table public.recordatorios add column if not exists grupo_id uuid;`
  — a correr a mano en el SQL editor de Supabase (no hay migraciones en el
  repo). No hace falta índice para el alcance de esta versión (no se
  consulta por `grupo_id` todavía, solo se guarda para uso futuro); si más
  adelante se agrega "ver/editar en bloque", sumar
  `create index on recordatorios(grupo_id) where grupo_id is not null`.
- **Sin `tipo` distintivo por ahora.** Aunque la tabla `recordatorios` ya
  tiene una columna `tipo` (usada hoy para `regalo_cumple`/`colecta_vence`),
  **no** se propone un valor nuevo tipo `"comunicado"` — ese nombre ya está
  tomado conceptualmente por el "Historial de comunicados" que hoy muestra
  `alertas` (`HistorialComunicados` en `src/features/recordatorios/index.jsx`
  y su puerto mobile), una feature distinta (banner urgente de un solo
  curso). Introducir "comunicado" acá generaría confusión de vocabulario en
  la misma pantalla. El `grupo_id` ya resuelve la identificación sin
  necesitar una etiqueta con nombre.
- **Cursos que puede elegir el Super Admin** (el único rol con acceso a esta
  feature): `supabase.from("cursos").select("id,nombre")`
  sin filtro — mismo query que ya corre `SuperAdmin()` para poblar el `cursos`
  que le pasa a `AlertasAdmin`/`HorariosAdmin`; reusar esa misma lista en vez
  de duplicar la consulta.
- **Push deduplicado**: `const userIds = [...new Set((await Promise.all(cursosElegidos.map(getUserIdsByCurso))).flat())]`,
  luego un solo `sendPush({type:"recordatorio", payload:{titulo:form.texto, userIds}})`
  — evita el N-llamados-a-sendPush que tendría un loop ingenuo insert-por-insert.
- **Inserts**: `supabase.from("recordatorios").insert(cursosElegidos.map(curso_id => ({...payload, curso_id, grupo_id})))`
  — un solo insert multi-fila, no un loop de inserts individuales.
- **UI**: nueva sección "Comunicaciones" dentro del menú de secciones de
  `SuperAdmin` (web) y su equivalente mobile. Checkboxes de curso con estilo
  `Pill`/inline consistente con el resto de `SuperAdmin` (no introducir un
  componente de multi-select nuevo si `Pill` alcanza). Botón "Seleccionar
  todos" simple toggle sobre el array de ids.
  [skill: vercel-react-best-practices — evitar recomputar la lista de cursos
  disponibles en cada render, memoizar].

## Out of Scope

- Ver/editar/borrar en bloque todas las filas de una misma comunicación
  (`grupo_id` deja la puerta abierta, pero la UI para eso no se construye en
  esta versión).
- Una etiqueta visual ("Comunicación") en la fila del recordatorio para
  distinguirla a simple vista de una creada normalmente.
- Historial/auditoría de comunicaciones multi-curso publicadas (a diferencia
  del historial que sí tiene `alertas`).
- Programar la publicación para una fecha/hora futura (se publica al
  instante, como hoy).
- Adjuntar la misma comunicación a `eventos` o `alertas` — solo genera filas
  en `recordatorios`.
