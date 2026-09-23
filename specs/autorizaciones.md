---
title: Autorizaciones digitales
status: implemented
priority: high
---

## Summary

Hoy, cuando hay una salida (excursión, campamento, acto fuera del colegio), el
colegio o el Room Parent manda una nota en papel que cada familia tiene que
firmar y devolver, y alguien tiene que juntar y contar papelitos. Con
**Autorizaciones**, el colegio (Super Admin / Admin de Colegio, a uno o varios
cursos) o el Room Parent (a su curso) publica una autorización; cada familia
responde desde la app **por hijo**: *Autorizo / No autorizo*, **quién lo retira**
y un **comentario** libre, con registro de quién respondió y cuándo. Quien la
creó, el Room Parent del curso y el colegio ven el estado de todas las
respuestas (autorizados / no autorizados / sin responder) y pueden exportar la
lista a Excel para imprimirla el día de la salida. Puede tener una fecha
límite opcional: pasada esa fecha no se puede responder ni cambiar la
respuesta.

## Acceptance Criteria

- [x] Tablas `autorizaciones` (una fila por curso, `grupo_id` compartido cuando
      el colegio la publica en varios cursos — mismo modelo que Comunicaciones)
      y `autorizacion_respuestas` (una por `autorizacion_id` + `hijo_id`),
      con RLS: cualquier miembro del curso ve la autorización; crear/editar/
      borrar solo colegio (super / colegio_admin), Room Parent del curso o
      quien la creó; cada familia ve y responde solo por sus hijos; las
      respuestas de todos las ven creador / Room Parent / colegio
      (`puede_ver_lecturas`, el mismo criterio que la confirmación de lectura).
- [x] La fecha límite se hace cumplir en la base (RLS), no solo en la UI: con
      `fecha_limite` pasada (hora de Argentina) no se puede insertar ni
      modificar una respuesta.
- [x] Web: pestaña "Autorizaciones" (nav mobile "Más" y sidebar desktop) con
      las autorizaciones del curso activo (o de todos en la vista Todos, con
      tag de curso). Cada tarjeta muestra, por cada hijo del usuario en ese
      curso, el formulario Autorizo/No autorizo + quién retira + comentario
      (o la respuesta ya dada, editable hasta la fecha límite).
- [x] Web: el Room Parent (o el creador / colegio) ve el resumen
      "12 autorizados · 2 no · 5 sin responder", el detalle por alumno y un
      botón "Exportar Excel".
- [x] Web: el Room Parent crea autorizaciones para su curso desde esa
      pestaña; el colegio crea para uno o varios cursos desde la sección
      "✍️ Autorizaciones" del Super Admin (CursoListSelector, año vigente).
- [x] Mobile: pantalla "Autorizaciones" (tile en "Más") con el mismo flujo
      de respuesta, alta para Room Parent y resumen/detalle de respuestas.
- [x] Al publicar se manda push (type `autorizacion`) a las familias de los
      cursos alcanzados; el deep-link abre la pestaña Autorizaciones (web y
      mobile).
- [x] Muro (web y mobile): una autorización abierta con algún hijo sin
      responder aparece en "Pendientes".

## Technical Notes

- SQL: `supabase/autorizaciones.sql`. Helpers `security definer`:
  `autorizacion_abierta(id)` (sin fecha límite o no vencida en hora AR) y
  reutiliza `puede_ver_lecturas(curso, creado_por)`, `es_padre_de`,
  `es_miembro_curso`, `es_admin_curso`, `es_colegio_admin_de(colegio_de_curso)`.
- Respuesta = upsert con `onConflict: "autorizacion_id,hijo_id"`; el hijo tiene
  que ser del curso de la autorización (chequeado en la policy).
- Lógica pura compartida (`src/lib/autorizaciones.js`, `@shared/autorizaciones`):
  estado abierta/cerrada, resumen de respuestas, pendientes por hijo.
- Web: `src/features/autorizaciones/index.jsx`; tab `autorizaciones` en
  `App.jsx` (nav + `renderTab` + `TABS_VALIDOS` + `TAB_MAP`). Super Admin:
  sección `autorizaciones` (grupo Comunidad). Export con `xlsx` (ya es
  dependencia).
- Mobile: `mobile/features/autorizaciones/index.jsx` + ruta
  `mobile/app/(tabs)/autorizaciones.jsx` (oculta del tab bar, tile en "Más"),
  `TAB_MAP` de notificaciones.

## Out of Scope

- Firma dibujada / documento PDF firmado.
- Campos personalizados por autorización (más allá de quién retira y
  comentario).
- Recordatorio automático a quien no respondió (se puede sumar después a
  `avisos-automaticos`).
- Creación de autorizaciones del colegio desde el Super Admin de mobile (se
  crean desde la web; en mobile se responden y se ven).
