---
title: Encuestas
status: draft
priority: medium
---

## Summary

Hoy, cuando alguien del curso necesita un consenso rápido —¿quién trae la
torta el viernes?, ¿mejor día para la reunión de fin de año?— no hay forma
de hacerlo dentro de tribbu: se resuelve por WhatsApp aparte, sin quedar
visible para el resto ni fácil de rastrear. Esta feature agrega un tab
**Encuestas**, por curso, donde **cualquier apoderado o Room Parent** (no
solo admin) puede armar una pregunta con varias opciones. Cada apoderado
vota una sola vez (el voto es de la familia, no de cada hijo), los
resultados se ven en vivo apenas se entra al tab —haya votado o no—, y se
avisa por push a todo el curso apenas se publica, sin importar qué rol la
creó.

## Acceptance Criteria

- [ ] Nuevo tab **"Encuestas"** (📊) en `TABS` de `App.jsx` — aparece en el
      sidebar desktop y, en mobile, dentro de "Más" (no está en
      `TAB_FIJOS`, mismo criterio que Colectas/Info Util/Contacto hoy).
- [ ] El botón "+ Nueva encuesta" es visible para **cualquier rol** en el
      curso activo (padre o admin) — a diferencia del resto de los "+" de
      tribbu (eventos, recordatorios, colectas), acá **no** está gateado a
      `isAdmin`.
- [ ] Crear una encuesta pide: pregunta (texto, obligatorio) y 2 a 6
      opciones de texto libre (mínimo 2, no vacías). Se guarda con el
      `curso_id` activo y `creado_por` = usuario actual.
- [ ] Fecha de cierre **opcional**. Sin fecha, la encuesta queda abierta
      hasta que alguien la cierre a mano.
- [ ] Un apoderado vota **una sola vez por encuesta** (constraint
      `unique(encuesta_id, usuario_id)` en `encuesta_votos`) sin importar
      cuántos hijos tenga en ese curso. Puede cambiar su voto (reemplaza la
      fila, no agrega una segunda).
- [ ] Resultados **en vivo**: conteo de votos por opción visible para
      cualquier miembro del curso apenas entra al tab, haya votado o no.
- [ ] Al publicar una encuesta, push a todos los apoderados/admins del
      curso vía `sendPush`/`getUserIdsByCurso` — **siempre**, sin importar
      el rol de quien la creó. Nuevo `type: "encuesta"` en
      `supabase/functions/send-push/index.ts` → `buildMessage()`
      (`"Nueva encuesta"` / texto = la pregunta) y en `TAB_MAP` (web
      `src/App.jsx` y mobile `push/useNotificationRouting.js`) para que el
      deep-link abra el tab Encuestas.
- [ ] Cerrar una encuesta antes de la fecha (o sin fecha): puede hacerlo
      quien la creó o un admin/Super Admin del curso. Una encuesta cerrada
      deja de aceptar votos nuevos pero sigue mostrando resultados.
- [ ] Eliminar una encuesta: quien la creó, un admin del curso, o Super
      Admin — mismo criterio de permisos que recordatorios hoy.
- [ ] Vista consolidada **"Todos"**: la lista junta las encuestas de todos
      los cursos del usuario, cada una etiquetada con `tagDeCurso(curso_id)`
      (mismo patrón que Recordatorios/Cumpleaños). El voto sigue siendo por
      curso individual — votar una encuesta de un curso no afecta a otro.
- [ ] Se ve bien en los tres layouts (Super Admin no tiene tab propio de
      Encuestas — no gestiona cursos individuales así; mobile bottom-tab
      con el tab dentro de "Más"; desktop sidebar) y en pantalla angosta,
      sin scroll horizontal.
- [ ] `npm run lint` + `npm run build` (raíz) y `cd mobile && npm run lint`
      + `npx expo export -p ios` pasan limpio.

## Technical Notes

- **Tablas nuevas** (SQL a correr a mano en el SQL editor de Supabase, no
  hay migraciones en el repo):
  ```sql
  create table public.encuestas (
    id bigint generated always as identity primary key,
    curso_id bigint not null references public.cursos(id),
    pregunta text not null,
    creado_por uuid not null references public.usuarios(id),
    creado_en timestamptz not null default now(),
    fecha_cierre date,
    cerrada_manual boolean not null default false
  );

  create table public.encuesta_opciones (
    id bigint generated always as identity primary key,
    encuesta_id bigint not null references public.encuestas(id) on delete cascade,
    texto text not null,
    orden int not null default 0
  );

  create table public.encuesta_votos (
    id bigint generated always as identity primary key,
    encuesta_id bigint not null references public.encuestas(id) on delete cascade,
    opcion_id bigint not null references public.encuesta_opciones(id) on delete cascade,
    usuario_id uuid not null references public.usuarios(id),
    creado_en timestamptz not null default now(),
    unique (encuesta_id, usuario_id)
  );
  ```
  (Tipo exacto de `cursos.id`/`usuarios.id` a confirmar contra el schema real
  antes de correr — el snippet asume lo mismo que el resto de la base.)
- **RLS**, siguiendo el patrón de `specs/rls-hardening.md`
  (`es_miembro_curso(curso)`, `es_admin_curso(curso)`, `mi_usuario_id()`,
  `es_super()`):
  - `encuestas`: SELECT/INSERT para `es_miembro_curso(curso_id)` (cualquier
    rol); UPDATE (cerrar) para `creado_por = mi_usuario_id() OR
    es_admin_curso(curso_id) OR es_super()`; DELETE mismo criterio que
    UPDATE.
  - `encuesta_opciones`: SELECT para miembros del curso de la encuesta
    padre; INSERT solo junto con la encuesta (mismo creador); sin
    UPDATE/DELETE en v1 (no se editan opciones después de creada).
  - `encuesta_votos`: SELECT para miembros del curso (necesario para el
    conteo en vivo — implica que un apoderado técnicamente puede ver qué
    votó cada `usuario_id`, no solo el agregado; ver "Out of Scope" sobre
    voto anónimo); INSERT/UPDATE/DELETE solo con `usuario_id =
    mi_usuario_id()`.
- **Feature nueva** `src/features/encuestas/index.jsx` (+ mobile
  `mobile/features/encuestas/index.jsx`), mismo contrato que el resto:
  recibe `cursoId`, `cursoIds`, `esVistaTodos`, `tagDeCurso`, `userId`,
  `isAdmin` desde `App.jsx`/`Session.jsx`.
- **UI de resultados**: barra de progreso simple por opción (ancho =
  % de votos) con el conteo al lado — reusar `T`/tokens, sin librería de
  gráficos nueva. [skill: frontend-design — tratar la barra de resultados
  con el mismo cuidado tipográfico/de espaciado que el resto de tribbu, no
  un `<progress>` por defecto].
- **Crear/votar**: modal simple (web: mismo patrón `position:fixed` que ya
  usa `calendario/index.jsx`; mobile: `Sheet` de `components/Sheet.jsx`).
- **Lista de encuestas por curso**: probablemente corta (no amerita
  `useListControls`/`ListToolbar` en v1) — un toggle simple "Activas /
  Cerradas" como el resto de tabs de tribbu (ej. las tabs de vista en
  Calendario).
- **Mobile**: lista con `FlatList` (convención del proyecto), estilos
  `StyleSheet` + tokens de `@shared/tokens`. [skill:
  vercel-react-native-skills — evitar renders custom sin `FlatList` para
  listas que puedan crecer].
- **Push**: `sendPush({type:"encuesta", payload:{titulo:pregunta,
  userIds}})` con `userIds = await getUserIdsByCurso(cursoId)` — un solo
  curso por encuesta, no hace falta dedupe multi-curso como en
  Comunicaciones. Requiere agregar el case `"encuesta"` en
  `buildMessage()` de `supabase/functions/send-push/index.ts` y
  redeployar (`supabase functions deploy send-push`) — se puede hacer
  desde esta sesión vía `npx supabase`, como se hizo con `calendar-feed`.
- [skill: vercel-react-best-practices — memoizar el agrupamiento por curso
  en la vista "Todos" (igual que `cursoIds` en `App.jsx`), y no recalcular
  el conteo de votos en cada render si no cambiaron los votos].

## Out of Scope

- Preguntas de opción múltiple (elegir más de una opción) — v1 es opción
  única por apoderado.
- Voto anónimo / ocultar quién votó qué a nivel RLS — ver nota de
  `encuesta_votos` arriba; queda para una versión futura si hace falta.
- Editar la pregunta o las opciones después de creada (si hace falta
  corregir, borrar y crear de nuevo).
- Integración con el centro de notificaciones in-app (el panel 🔔 de
  `features/notificaciones`) — hoy solo lee `recordatorios` + `alertas`;
  agregar `encuestas` ahí queda para después.
- Aviso push cuando alguien vota (solo se avisa al crearse la encuesta).
- Programar la publicación para una fecha futura (se publica al instante).
- Exportar resultados (Excel/CSV).
- Cualquier cambio al modelo "Año lectivo" — una encuesta vive mientras
  viva su `curso_id`, sin pensar en archivado/promoción todavía.
