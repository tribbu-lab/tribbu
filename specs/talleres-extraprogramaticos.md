---
title: Talleres extraprogramáticos
status: implemented (falta redeploy de avisos-automaticos)
priority: medium
---

## Summary

Los colegios ofrecen talleres fuera del horario de clase (robótica, coro,
tenis, ajedrez…), muchas veces dictados por un profe o una empresa externa,
pero hoy la oferta llega por circulares sueltas, la inscripción se hace en
papel o en un formulario aparte y nadie sabe cuántos lugares quedan. Con
**Talleres**, el colegio publica cada taller en tribbu —descripción, días y
horario, profe, lugar, costo informativo, cupo y fechas— y decide **quién
puede anotarse** (por curso o por rango de edad) y **cómo se asignan los
lugares** (por orden de llegada, con aprobación del colegio o por sorteo).
Cada familia ve el catálogo de talleres disponibles **para cada hijo**, lo
anota o lo da de baja desde la app y sigue su estado (inscripto, en lista de
espera, pendiente de aprobación). El taller aparece después en el horario y el
calendario del hijo. El colegio gestiona inscriptos y lista de espera, avisa a
los anotados y exporta la lista. La app muestra el costo pero no cobra.

## Acceptance Criteria

### Datos y permisos
- [ ] Tablas nuevas (SQL en `supabase/talleres.sql`):
      `talleres` (colegio_id, nombre, descripcion, foto (path en el bucket
      privado `adjuntos` bajo `talleres/<colegio>/`), profe_maestro_id
      (nullable, maestra con cuenta) o profe_texto (externo), lugar,
      costo_texto (libre: "$25.000 por mes", "Gratis"), cupo (nullable = sin
      límite), modo_asignacion `orden_llegada | aprobacion | sorteo`,
      elegibilidad `cursos | edad`, edad_min/edad_max (años), inscripcion_desde,
      inscripcion_hasta, fecha_inicio, fecha_fin, baja_hasta (default
      fecha_inicio), estado `borrador | publicado | cerrado | cancelado`,
      creado_por, año_lectivo),
      `taller_cursos` (taller_id, curso_id — solo si elegibilidad = cursos),
      `taller_horarios` (taller_id, dia, hora_inicio, hora_fin — días con la
      misma normalización que `@shared/horarios`),
      `taller_inscripciones` (taller_id, hijo_id, estado `inscripto |
      espera | pendiente | rechazado | baja`, posicion_espera, inscripto_por,
      creado_en, resuelto_por, resuelto_en; unique (taller_id, hijo_id)).
- [ ] RLS: ver un taller publicado = familias con al menos un hijo elegible
      (curso en `taller_cursos`, o edad dentro del rango para los de edad),
      docente asignada, colegio (super / colegio_admin de ese colegio). Crear,
      editar, cancelar y gestionar inscriptos = solo el colegio. La familia ve
      solo las inscripciones de sus hijos; colegio y docente asignada ven
      todas las del taller.
- [ ] Anotar y dar de baja pasan **solo** por RPCs `security definer`
      (`inscribir_en_taller(taller, hijo)`, `baja_de_taller(taller, hijo)`)
      que verifican en la base: es su hijo (`es_padre_de`), es elegible, la
      inscripción está abierta (fechas en hora de Argentina), y **el cupo**
      (con bloqueo de la fila del taller, para que dos familias que tocan a la
      vez no superen el cupo). Las familias no tienen INSERT/UPDATE directo
      sobre `taller_inscripciones`.
- [ ] Edad: se calcula con `hijos.fecha_nacimiento` a la fecha de inicio del
      taller. Un hijo sin fecha de nacimiento no es elegible para talleres
      por edad (el colegio lo ve listado como "sin fecha de nacimiento").

### Modos de asignación
- [ ] **Orden de llegada**: con lugar → `inscripto`; sin lugar → `espera` con
      posición. Si alguien se da de baja (o el colegio lo quita), el primero de
      la lista de espera pasa a `inscripto` automáticamente y recibe un push.
- [ ] **Con aprobación**: toda inscripción entra `pendiente`; el colegio
      aprueba (→ `inscripto`, respetando el cupo) o rechaza (→ `rechazado`,
      con motivo opcional). La familia recibe push en ambos casos.
- [ ] **Sorteo**: durante la inscripción todos quedan `pendiente` ("Anotado
      para el sorteo"). Cerrada la inscripción, el colegio toca "Sortear": la
      base asigna al azar hasta el cupo (`inscripto`) y el resto queda en
      `espera` en orden sorteado. Se puede sortear una sola vez; el resultado
      queda registrado (quién y cuándo). Push a todos con su resultado.

### Familias (web + mobile)
- [ ] Nueva sección **"🎨 Talleres"** (web: nav mobile "Más" + sidebar desktop,
      `?tab=talleres`; mobile: tile en Más + ruta oculta `(tabs)/talleres`).
- [ ] Catálogo por hijo: en vista Todos, una sección por hijo con sus talleres
      elegibles (tag de color del hijo); en vista por hijo, solo los suyos.
      Cada tarjeta: foto, nombre, días/horario, profe, lugar, costo, fechas,
      "Quedan N lugares" / "Lista de espera" / "Sin cupo", modo ("Por orden de
      llegada" / "Con aprobación" / "Por sorteo") y el estado del hijo con su
      acción: **Anotar a <nombre>**, **Darse de baja**, "En lista de espera
      (puesto 2)", "Pendiente de aprobación", "Anotado para el sorteo",
      "Inscripción cerrada", "Rechazado".
- [ ] Dar de baja pide confirmación; pasado `baja_hasta` el botón se reemplaza
      por "Para darte de baja, escribile al colegio" (con acceso a Mensajes →
      Secretaría).
- [ ] Los talleres en los que el hijo está `inscripto` aparecen en Calendario
      → Horario (con la marca ✦ que ya usan los talleres optativos, entre
      `fecha_inicio` y `fecha_fin`) y en el detalle del día del calendario.
- [ ] Muro → Pendientes: tarjeta "🎨 Inscripción abierta: Robótica (hasta el
      viernes)" mientras haya talleres con inscripción abierta para algún hijo
      que todavía no se anotó; desaparece al anotarse o al cerrar.
- [ ] Funciona en los tres layouts (Super Admin / mobile bottom-tab /
      sidebar desktop) y en pantallas de teléfono angostas sin scroll
      horizontal.

### Colegio (panel, web; mobile con lo esencial)
- [ ] Super Admin → Comunidad → **"🎨 Talleres"** (`TalleresColegio`): lista
      de talleres del año con estado, inscriptos/cupo, espera y pendientes;
      filtros por estado y buscador (`useListControls` + `ListToolbar`).
- [ ] Crear/editar taller en un formulario: datos, foto, profe (maestra de
      la lista o texto libre), horarios (varios días a la vez, mismo selector
      que el editor de horarios), elegibilidad (cursos con
      `CursoListSelector` o rango de edad), cupo, modo, fechas. Se puede
      guardar como borrador y publicar después.
- [ ] Detalle del taller: inscriptos, pendientes y lista de espera con curso y
      apoderados; aprobar/rechazar, mover de espera a inscripto, quitar,
      anotar a mano a un alumno; **Sortear** (modo sorteo); **Exportar Excel**;
      **Avisar a los inscriptos** (crea un aviso a esas familias + push).
- [ ] Cancelar un taller (con confirmación) avisa por push a todas las
      familias anotadas.
- [ ] Mobile (panel del colegio): lista de talleres, detalle con inscriptos y
      aprobar/rechazar/sortear. Crear y editar talleres queda solo en web.

### Docente
- [ ] Una docente asignada como profe (`profe_maestro_id` con cuenta) ve "Mis
      talleres" con la lista de inscriptos (nombre y curso, sin datos de
      contacto) y el taller en su horario. No gestiona inscripciones.

### Notificaciones (push type `taller`, deep-link a Talleres con el taller abierto)
- [ ] Al publicar un taller (o al abrirse su inscripción, si `inscripcion_desde`
      es futura): un push a las familias con al menos un hijo elegible.
- [ ] A la familia: inscripción confirmada, pasó de espera a inscripto,
      aprobada/rechazada, resultado del sorteo, taller cancelado.
- [ ] Recordatorio automático (avisos-automáticos, modo diario): "Mañana cierra
      la inscripción a Robótica" a familias con hijo elegible no anotado; se
      puede apagar en Notificaciones (nuevo tipo en `@shared/avisos`).

## Technical Notes

- Módulo propio, separado de `clases.optativa`/`clase_alumnos` (que siguen
  para opciones dentro del programa, por curso y anotadas por el colegio). Un
  taller es del colegio y puede abarcar varios cursos o un rango de edad, por
  eso no es una `clase`.
- Reglas puras en `src/lib/talleres.js` (`@shared/talleres`): elegibilidad
  (`esElegible(taller, hijo, cursosDelTaller)`, edad a `fecha_inicio`),
  `inscripcionAbierta`, `lugaresLibres`, texto de estado/acción por hijo,
  `talleresPendientesMuro`, filas de horario para un hijo inscripto. Web y
  mobile importan de ahí (lección de muro/encuestas: las copias divergen).
- La lógica de cupo, lista de espera, aprobación y sorteo vive en la base:
  RPCs `inscribir_en_taller`, `baja_de_taller`, `resolver_inscripcion`
  (aprobar/rechazar/mover), `sortear_taller` (con `select … for update`
  sobre `talleres` para serializar). Al liberarse un lugar, la promoción del
  primero en espera se hace en la misma transacción. El push lo dispara el
  cliente después de un RPC exitoso, con `sendPush` (mismo patrón que
  Autorizaciones); el del recordatorio de cierre, desde
  `supabase/functions/avisos-automaticos` (redeploy).
- Fechas y "abierta/cerrada" en hora de Argentina, igual que
  `autorizacion_abierta()`.
- Foto: `subirImagen` (web) / `pickAndUploadImage` (mobile) con miniatura;
  mostrar con `<SignedImg miniatura>` / `<SignedImage miniatura>`.
- Horario del hijo: `Calendario` (web + mobile) suma los `taller_horarios` de
  los talleres en los que el hijo está `inscripto` (vigentes por fecha) en la
  misma ronda de requests (embed en un select, sin un pedido más en serie;
  ver "Round-trips" en CLAUDE.md).
- Nuevo tab `talleres`: `TABS_VALIDOS`, `renderTab()` (lazy con `aLazy`),
  `TAB_MAP` (push `taller`) en `App.jsx`; mobile `TAB_MAP` en
  `useNotificationRouting.js`. No entra en `TABS_DOCENTE` salvo "Mis talleres"
  para la docente asignada.
- Estilos inline con tokens de `@shared/tokens`; listas del colegio con
  `useListControls`/`ListToolbar`/`Paginador`; texto del colegio por
  `sanitize`; nada de `window.confirm` (usar `useConfirmar`).
- Excel con `const XLSX = await import("xlsx")` (web) / `exportRowsToExcel`
  (mobile).
- QA: probar en la app (agent-browser) los tres modos con dos cuentas de
  prueba compitiendo por el último lugar, y la promoción desde la lista de
  espera. [skill: agent-browser]

## Out of Scope

- Cobro o registro de pagos en la app (solo se muestra `costo_texto`); ni
  colectas automáticas por taller.
- Cuentas para profes o empresas externas: lo gestiona el colegio.
- Asistencia por clase del taller.
- Límite de talleres por hijo y choques de horario entre talleres (se
  muestran en el horario pero no se impiden).
- Talleres ofrecidos por terceros sin el colegio (Comunidad → Servicios).
- Room Parent como organizador: ve los talleres como apoderado.
- Crear/editar talleres desde el celular (solo web; mobile gestiona
  inscriptos).
- Copiar talleres al año siguiente.
