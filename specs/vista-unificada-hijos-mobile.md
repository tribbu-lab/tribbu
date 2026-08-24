---
title: Vista "Todos" global (acceso unificado de hijos, mobile + web)
status: implemented
priority: medium
---

## Summary

> **v2 — pivot de enfoque.** La v1 de este spec proponía un filtro "Todos mis
> hijos" local en Recordatorios + Pendientes del Muro. Por decisión de producto
> se reemplazó por un enfoque radical: **"Todos" es un acceso más en el selector
> del header** (como si fuera un hijo extra, primero en la lista y default al
> abrir la app) y, cuando está activo, **todas las pantallas** quedan dominadas
> por ese modo, mostrando la información de todos los cursos de los hijos.
>
> **v2.1 — port a la web.** El mismo modelo se replicó en la web (`src/`),
> reemplazando el viejo botón "Ver todos" local de Recordatorios: mobile y web
> quedan unificados en comportamiento.

Un apoderado con hijos en más de un curso ya no vive la app "de a un hijo por
vez": al abrirla, la vista "Todos" responde la pregunta diaria real ("¿qué tengo
pendiente hoy, contando a todos mis hijos?") en todas las superficies — Inicio,
Avisos, Calendario, Colectas, Cumpleaños, Alumnos, Info Útil y la campana de
notificaciones. Cada fila/card lleva el **tag del hijo** (dot con su color de
identidad + primer nombre) para saber de quién es cada cosa. Tocar un hijo en el
selector vuelve a la vista por curso, idéntica a la de siempre, donde viven las
acciones que requieren un curso concreto (rol admin, publicar alerta, admin del
curso).

## Arquitectura (contrato de sesión)

`mobile/context/Session.jsx` (mobile) y `src/App.jsx` (web, que baja todo por
props al no tener contexto de sesión) son la única fuente del modo:

- `items` gana un pseudo-item `{ _tipo: "todos", id: "__todos__", nombre: "Todos" }`
  **primero y default** (`cursoIdx` 0), solo cuando los hijos abarcan >1 curso.
- `esVistaTodos`: bool.
- `cursoId`: **null** en vista Todos (guard natural para flujos de curso único).
- `cursoIds`: array para TODAS las lecturas — `.in("curso_id", cursoIds)`
  (en Todos = todos los cursos con hijos; por hijo = `[cursoId]`).
- `rolEfectivo`/`isAdmin`: `"padre"`/false en Todos (las acciones admin exigen
  elegir un hijo — esto oculta solas la mayoría de las acciones por curso).
- `tagDeCurso(curso_id)` → `{nombre, color}` de los hijos de ese curso **solo en
  vista Todos** (null en vista por hijo): las pantallas lo llaman
  incondicionalmente para etiquetar filas.
- `cursoNombre` = "Todos mis hijos" en Todos.

## Acceptance Criteria

- [x] Header (`AppHeader`): chip "Todos" (icono `account-group`) primero en el
      selector, solo con hijos en >1 curso; default al iniciar sesión; sin
      botón de paleta; header sin tinte de color en Todos.
- [x] Regla de escrituras: ninguna escritura usa el `cursoId` de sesión en vista
      Todos — se usa el `curso_id` de la entidad (recordatorio, colecta, evento,
      cumple/festejo) o la acción queda gateada (isAdmin false / guard).
- [x] **Inicio (Muro)**: pendientes (recordatorios sin leer, colectas impagas,
      invitaciones), agenda de 15 días (eventos + cumples de alumnos/maestros) y
      alertas activas de todos los cursos, con tag por card/fila; comedor
      (global) intacto; "Publicar alerta" solo en vista por hijo con rol admin;
      "Estás al día" solo si no hay pendientes en ningún curso.
- [x] **Avisos (Recordatorios)**: lista unificada con tag por fila; "N sin leer"
      global; permisos de editar/borrar por fila según el rol en el curso de esa
      fila (o autoría); "+ Nuevo" en Todos muestra selector "Para el curso de"
      (chips con dot de color por hijo) y el push usa el curso elegido; editar
      nunca mueve la fila de curso; historial de comunicados unificado con tag.
- [x] **Calendario**: eventos de todos los cursos en mes/lista con tag; vista
      Horario en Todos renderiza una grilla por curso encabezada por el tag del
      hijo; asistencia/EventoModal operan con el `curso_id` del evento.
- [x] **Colectas (Finanzas)**: colectas de todos los cursos con tag; el registro
      de pago ofrece solo los hijos del curso de esa colecta; los contadores "X
      de N pagaron" usan los alumnos del curso de la colecta; deep-link
      `openColecta` funciona cross-curso.
- [x] **Cumpleaños**: cumples de alumnos y maestros de todos los cursos con tag;
      festejos/regalos/colecta-regalo operan con el curso de la entidad; RSVP
      itera todos los hijos invitados; la pill de monto de regalo solo se
      muestra si todos los cursos coinciden.
- [x] **Alumnos** (contacto) e **Info Útil** (útiles/libros/uniformes): listas
      unificadas agrupadas por curso con encabezado de sección con tag (solo
      cuando hay datos de >1 curso). `Contacto` (colegio) no filtra por curso —
      sin cambios.
- [x] **Campana de notificaciones** (`useNotificaciones`) y **badge de Avisos**
      (`useRecordatoriosBadge` en `(tabs)/_layout`): cuentan/muestran sobre
      `cursoIds`, con tag por notificación en Todos.
- [x] Con hijos en un solo curso (o un solo hijo) NO existe el item "Todos" y
      toda la app queda idéntica a antes (`cursoIds` = [curso], tags null).
- [x] Cambio 100% mobile; sin cambios de esquema, RLS ni Edge Functions.
- [x] `cd mobile && npm run lint` y `npx expo export -p ios` pasan.
- [x] QA manual en emulador Android con cuenta multi-curso (2 hijos / 2 cursos):
      header con chips Todos/Santiago/Federico, Muro unificado con tags, Avisos
      con tags y selector de curso en el alta, Calendario mes + horario por
      secciones, vista por hijo idéntica a la previa (header teñido, sin tags).

### Web (v2.1 — paridad total)

- [x] `src/App.jsx`: pseudo-item "👥 Todos" primero y default en `items`;
      deriva `cursoIds` (memoizado — identidad estable para los efectos de las
      features), `esVistaTodos`, `tagDeCurso` (usa `hijoColorsMap`/
      `getHijoColor`/`hijos.color`) y `cursosAdmin`; `renderTab()` los pasa como
      props a todas las features; guard `!cursoIds.length`; badge de
      Recordatorios y `useNotificaciones` por `cursoIds`; el selector de
      accesos ("Mi acceso", con chip "👥 Todos") vive en la **navegación** —
      sidebar en desktop y header en el layout mobile — como en la app: se
      cambia de vista desde cualquier pantalla; el Muro ya no renderiza un
      selector propio.
- [x] **Recordatorios web**: se eliminó el botón local "Ver todos" (reemplazado
      por el modo global); tags por fila; permisos por fila vía `cursosAdmin`;
      selector "Para el curso de" en el alta; **fix del bug** por el que editar
      pisaba `curso_id` y movía la fila al curso activo; historial de
      comunicados unificado con tag.
- [x] **Muro, Calendario (incl. horario por secciones), Colectas, Cumpleaños,
      Alumnos, Info Útil, campana**: mismas reglas que mobile (lecturas
      `.in(cursoIds)`, tags, escrituras con el curso de la entidad, acciones
      admin ocultas en Todos). `Contacto` no filtra por curso — sin cambios.
- [x] Fix de bugs preexistentes encontrados en el camino: `FestejoDetalleModal`
      sin importar en `calendario` y `muro`, y `EventoAsistenciaModal` sin
      importar en `muro` (ReferenceError al abrir invitaciones).
- [x] `npm run build` pasa. `npm run lint`: el repo ya tenía 181 errores
      preexistentes (reglas react-hooks nuevas); este cambio no agrega errores
      (delta: +2 warnings de exhaustive-deps, patrón ya presente).
- [x] QA con agent-browser (cuenta multi-curso real) en desktop sidebar y
      viewport 390px: selector con Todos default, Muro/Recordatorios unificados
      con tags, modal con selector de curso, vista por hijo idéntica a la
      previa, sin scroll horizontal.

## Technical Notes

- Las pantallas destino de los deep-links del Muro ya están unificadas, así que
  navegar desde una card de otro curso NO cambia el acceso activo (se eliminó el
  salto `setCursoIdx` de la v1): el usuario permanece en "Todos".
- `tagDeCurso` se construye una vez en Session (Map curso→{nombre, color}) con
  los primeros nombres de los hijos del curso y `colorDeItem` (el color de
  identidad del selector); el tag estándar es dot 8px + texto ~11/700 muted.
- Fix incluido (bug latente, también presente en la web): al **editar** un
  recordatorio el payload ya no pisa `curso_id`, que antes movía la fila al
  curso activo.
- Los toggles "adquirido" de Info Útil son por usuario (sin curso) y siguen
  activos en Todos a propósito.
- Riesgos menores aceptados: identidad de `cursoIds` cambia cuando recomputa el
  value del contexto (refetch extra inocuo); maestro presente en dos cursos del
  usuario se etiqueta con el primero.
- RLS: solo lecturas `.in()` sobre cursos donde el usuario es miembro (mismo
  patrón que el "Ver todos" web, verificado en emulador contra el proyecto real).

## Out of Scope

- Modo Todos para **Admin** y **Super Admin** (requieren curso concreto; la tab
  Admin se oculta sola en Todos porque `isAdmin` es false).
- Persistir el acceso seleccionado entre sesiones (siempre arranca en "Todos"
  cuando existe).
- Agrupar el **Comedor** por curso (el menú es global del colegio).
