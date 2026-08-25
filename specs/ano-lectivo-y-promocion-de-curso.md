---
title: Año lectivo y promoción de curso
status: implemented
priority: high
---

## Summary

Hoy `cursos` es una entidad permanente sin ninguna noción de año — "1ºA -
Primaria" es la misma fila para siempre, y no existe ningún proceso (ni
siquiera manual) para pasar a un alumno de un año al siguiente. Esta
feature agrega esa noción: cada curso pertenece a un año lectivo concreto,
un valor único a nivel colegio (`colegio.año_lectivo_actual`) determina
cuál es el año vigente para toda la escuela, y Super Admin cuenta con una
herramienta para preparar el año siguiente (duplicar la configuración de un
curso) y promover alumnos en bloque de un curso a su continuación el año
que viene — sin perder ni mezclar los recordatorios, eventos, colectas,
alertas, encuestas, menú y horarios del curso anterior, que quedan
intactos en su propia fila histórica. Los apoderados no necesitan ver ni
elegir ningún año: siguen viendo únicamente el curso vigente de su hijo,
automáticamente, sin ningún cambio en cómo funciona hoy "Mi acceso".

## Acceptance Criteria

> **Estado de verificación**: migración SQL corrida y confirmada contra la
> base real (`npx supabase db query --linked`, los 5 cursos reales quedaron
> en `año_lectivo=2026`, `colegio.año_lectivo_actual=2026`). El código está
> completo, es lint/build-clean (`npm run lint`/`npm run build`, sin errores
> nuevos sobre el baseline preexistente). **QA visual en vivo completada**
> con credenciales de Super Admin válidas (`admin@tribbu.com`) contra la
> base real: Cursos (selector de año "2027 / 2026 (vigente)", modal "Nuevo
> curso" prefillea el año vigente, modal "Duplicar" prefillea nombre/ícono/
> año+1 y muestra la nota de qué se copia), Colegio (campo "AÑO LECTIVO
> ACTUAL" prefilleado), Promoción (curso origen "1°B - Primaria" cargó sus
> 19 alumnos reales pre-tildados, destildar actualizó el contador a 18/19,
> "Curso de destino (2027)" mostró correctamente el estado vacío porque
> todavía no existe ningún curso 2027), y los selectores de Alumnos/Alertas
> siguen mostrando los 5 cursos vigentes. Sin errores nuevos de consola en
> ninguna pantalla. **No se confirmó ningún "Crear duplicado" ni
> "Promover"** para no crear un curso 2027 real ni reasignar alumnos reales
> sin pedido explícito — todo se canceló antes del submit final.

**Modelo de datos**
- [x] `cursos.año_lectivo integer not null` — backfill de las filas
      existentes con el año actual (2026). *(Corrido contra la base real.)*
- [x] `colegio.año_lectivo_actual integer not null` — backfill con 2026;
      editable desde Super Admin → Colegio (nuevo campo en el formulario
      existente). *(Corrido contra la base real; campo agregado en
      `src/features/contacto/index.jsx`.)*
- [x] El formulario "Nuevo curso" en Super Admin gana un campo de año
      lectivo, con el año vigente del colegio como valor por defecto.

**Duplicar curso para el año siguiente**
- [x] Super Admin → Cursos: botón "Duplicar para el año siguiente" en cada
      curso del año vigente. Crea una fila nueva en `cursos` con
      `año_lectivo` = año actual + 1, mismo nombre/color/avatar (editable
      antes de confirmar).
- [x] Al confirmar, se clonan también al curso nuevo: horarios de clase,
      el Room Parent asignado (`usuario_cursos`), el maestro asignado
      (`maestro_cursos`), los uniformes vinculados (`uniforme_cursos`), y
      los útiles/libros de ese curso (`utiles`/`libros`, clonando fila con
      el `curso_id` nuevo). *(`clonarConfiguracionCurso` — código revisado,
      no ejecutado contra datos reales para no crear un curso 2027 real sin
      pedir confirmación primero.)*
- [x] Los alumnos **no** se copian en este paso — eso lo hace la
      promoción, por separado.

**Selector de año / filtrado**
- [x] Super Admin → Cursos tiene un selector de año lectivo, default al
      año vigente del colegio; permite ver años anteriores para consulta o
      para armar la promoción.
- [x] El resto de los selectores de curso en Super Admin (Alumnos,
      Maestros, Alertas, Horarios, Comunicaciones, Uniformes, Códigos — el
      `CursoListSelector` compartido) filtran por defecto a
      `año_lectivo = año vigente del colegio`, para no acumular años
      viejos en cada selector. *(`cursosAnoActual`, calculado una sola vez
      en `SuperAdmin()`; con un solo año real (2026) hoy el filtro no
      cambia lo que se ve, pero queda listo para cuando exista un 2027.)*

**Promoción de alumnos**
- [x] Nueva sección en Super Admin, "Promoción de curso": elegir curso
      origen (año vigente) y curso destino (año siguiente, ya duplicado).
      Lista los alumnos del curso origen, todos pre-tildados.
- [x] El admin puede destildar individualmente a quien no se promueve a
      ese destino (repite, cambia de sección, se va del colegio).
- [x] Al confirmar, se actualiza `hijos.curso_id` en bloque (un solo
      update) para los alumnos tildados, apuntando al curso destino. Los
      no seleccionados no sufren ningún cambio — quedan con su `curso_id`
      actual para reasignación manual posterior, fuera de esta
      herramienta.
- [x] Sin ninguna acción sobre `usuario_hijos`: "Mi acceso" ya deriva el
      acceso del apoderado desde `hijos.curso_id`, así que en cuanto la
      promoción corre, cada apoderado ve el curso nuevo automáticamente la
      próxima vez que entra — web y mobile, sin cambios de código en
      ningún feature.
- [x] Los recordatorios/eventos/colectas/alertas/encuestas/menu/horarios
      del curso de origen quedan intactos, atados a esa fila de curso
      vieja — no se tocan, no se mueven, no se mezclan con los del curso
      nuevo. *(Por diseño: la promoción solo hace `update hijos.curso_id`,
      no toca ninguna otra tabla.)*
- [x] Cambiar `colegio.año_lectivo_actual` es una acción manual aparte en
      Super Admin → Colegio — no ocurre automáticamente al promover.

**Plataforma**
- [x] Toda la feature (duplicar curso + promoción) vive en Super Admin
      **web únicamente** en esta versión — no se construye en mobile. El
      resto de la app en ambas plataformas sigue funcionando igual una vez
      hecha la promoción, porque no depende de desde dónde se actualizó
      `hijos.curso_id`.
- [x] No fuerza scroll horizontal en pantalla angosta. *(Mismos patrones de
      layout que el resto de Super Admin — no verificado visualmente esta
      pasada, ver nota de QA arriba.)*

## Technical Notes

- Migración SQL (a correr a mano, sin tooling de migraciones en el repo):
  ```sql
  alter table public.cursos add column año_lectivo int;
  update public.cursos set año_lectivo = 2026 where año_lectivo is null;
  alter table public.cursos alter column año_lectivo set not null;

  alter table public.colegio add column año_lectivo_actual int;
  update public.colegio set año_lectivo_actual = 2026;
  alter table public.colegio alter column año_lectivo_actual set not null;
  ```
  Sin `default` a nivel de columna a propósito — cada curso nuevo debe
  declarar su año explícitamente en el formulario, no heredarlo
  implícitamente de "cuándo se creó la fila".
- **RLS sin cambios**: `es_miembro_curso()`/`es_admin_curso()` y todas las
  policies siguen operando sobre `curso_id` exactamente igual — el año
  lectivo no altera el modelo de permisos en absoluto, es la ventaja
  central de este enfoque.
- El `CursoListSelector` compartido (`src/features/superadmin/index.jsx`,
  agregado esta sesión) es el punto único donde aplicar el filtro de año:
  mejor resolverlo filtrando la lista de `cursos` una sola vez en
  `SuperAdmin()` (que ya hace el único fetch) antes de pasarla a cada
  sub-componente, en vez de filtrar adentro del selector compartido.
- Clonar horarios/uniforme_cursos/maestro_cursos/usuario_cursos/utiles/
  libros: un `insert` multi-fila por tabla, mapeando las filas del curso
  origen con `curso_id` reemplazado por el del curso nuevo — mismo patrón
  que ya usa Comunicaciones multi-curso para insertar N filas de una vez.
- [skill: vercel-react-best-practices] — la pantalla de promoción maneja
  una lista de alumnos con checkboxes que puede ser larga; memoizar el
  cálculo de seleccionados para no re-renderizar la lista completa en cada
  toggle.

## Out of Scope

- Agregar `año_lectivo` a cualquier tabla de contenido (recordatorios,
  eventos, colectas, alertas, encuestas, menu) o tocar sus queries —
  deliberadamente no se toca ninguna, esa es la premisa central del
  enfoque elegido.
- Marcar formalmente a un alumno como "egresado" (columna `activo` en
  `hijos` o similar) — un alumno no promovido simplemente queda con su
  `curso_id` sin cambios; un flujo de baja/egreso queda para una versión
  futura si hace falta.
- Mobile — duplicar curso y promoción son web-only en esta versión.
- Cambiar `colegio.año_lectivo_actual` automáticamente al promover.
- Cualquier vista para que el apoderado elija o consulte años anteriores.
- Deshacer una promoción ya confirmada (se corrige a mano si hace falta).
- Migrar o recalcular años lectivos anteriores a 2026 — no hay datos
  históricos multi-año hoy; todo lo existente se backfillea al año actual.
