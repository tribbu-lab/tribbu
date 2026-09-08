---
title: Multi-colegio (soporte para múltiples tenants)
status: implemented
priority: high
---

> **Estado real (2026-09-08):** SQL corrido en producción, `manage-auth-user`
> redeployada, y **verificado en vivo end-to-end** con una cuenta `super`
> real (`admin@tribbu.com`): "Plataforma → Colegios" lista el colegio
> migrado, "+ Nuevo colegio" crea la fila y su primer `colegio_admin`
> (usuario + cuenta Auth reales, vía `manage-auth-user`), "Entrar a
> administrar"/"← Volver a Colegios" navegan correctamente, y logueado
> como el `colegio_admin` de prueba el panel mostró **1 usuario (él
> mismo) — 0 del colegio real** (71 usuarios), confirmando el
> aislamiento de RLS. Colegio y usuario de prueba borrados al terminar.
> De paso salió un bug real: `Card` no reenviaba `onClick` al DOM (fix en
> `src/components/Card.jsx`, sin el cual "Colegios" no navegaba nada).
>
> Quedan deliberadamente **sin hacer**, más allá de lo que ya marca "Out
> of Scope" abajo: mobile por completo, aplicar `logo_url`/`color_primario`
> en el sidebar/wordmark (se guardan y se editan, pero no se leen en
> ningún lado todavía), y extender `tagDeCurso`/"Mi acceso" para colegios
> múltiples (sin efecto observable hoy porque solo existe un colegio real).

## Summary

Hoy tribbu es mono-tenant de raíz: `colegio` es una tabla singleton (una
sola fila, id hardcodeado), y `usuario.rol==="super"` ve y edita usuarios,
cursos, alumnos y maestros de **toda la base**, sin ningún filtro — porque
no existe la columna para filtrarlo. Esta feature agrega el nivel que
faltaba: cada colegio pasa a ser una fila real en una tabla `colegios`,
cada `curso` (y transitivamente casi todo lo demás) queda atado a un
colegio concreto, y aparecen dos roles donde antes había uno —
**`super`**, el operador de la plataforma (vos), que da de alta colegios
nuevos y puede entrar a administrar cualquiera; y **`colegio_admin`**, que
reemplaza el uso diario que hoy hace Super Admin pero acotado a **su**
colegio, sin ver ni un dato de los demás. Room Parent (`admin`, por
curso) y Apoderado (`padre`) no cambian en nada.

La pregunta que motivó esto — "¿un padre con un hijo en dos colegios
necesita dos apps?" — se responde extendiendo el mecanismo que ya existe:
"Mi acceso"/vista **"Todos"** (hoy unifica hijos en distintos cursos de un
mismo colegio) pasa a unificar también hijos en distintos **colegios**.
Un mismo login, un mismo "Todos", con una etiqueta de colegio además de la
de curso en cada fila.

## Acceptance Criteria

**Modelo de datos**
- [x] `colegios` (tabla nueva, reemplaza el singleton `colegio`): `id`,
      `nombre`, `logo_url` (nullable), `color_primario` (nullable, hex),
      `telefono`, `email`, `direccion`, `url_maps`, `horario_clases`,
      `horario_secretaria`, `sitio_web`, `año_lectivo_actual` — cada
      colegio gestiona el suyo de forma independiente, sin relación con
      el de otro colegio.
- [x] `cursos.colegio_id not null` — ancla principal: con esto,
      alumnos/maestros/eventos/recordatorios/colectas/cumples/alertas/
      horarios/uniformes/útiles/libros quedan scopeados **transitivamente**
      vía `curso_id → colegio_id`, sin agregar la columna a cada una.
- [x] `menu.colegio_id not null` — el comedor pasa a ser por colegio (hoy
      es 100% global, sin `curso_id` siquiera); un colegio sigue
      compartiendo un único menú entre todos sus cursos, igual que hoy
      dentro de un colegio. *(`menu.fecha` era globalmente único — pasó a
      `unique(colegio_id,fecha)`, con `onConflict` actualizado en cada
      upsert de menú, web y mobile.)* También `contactos.colegio_id` y
      `uniformes.colegio_id` — no estaban en el plan original: sus
      `curso_id` son legacy/inexistentes, así que necesitaban la columna
      directa igual que `menu`.
- [x] `usuarios.colegio_id` (nullable — solo se completa para
      `rol="colegio_admin"`; `super` no tiene, porque no está acotado a
      ninguno).
- [ ] Migración de datos (una sola vez, sobre producción): **SQL escrito
      (`supabase/multi-colegio.sql`), todavía no corrido contra
      producción** — falta que el usuario lo ejecute. La fila
      singleton `colegio` existente pasa a ser la primera fila de
      `colegios`; todos los `cursos`/`menu` existentes quedan con
      `colegio_id` apuntando a esa fila. El/los usuarios `rol="super"`
      actuales (Yanina) **quedan como `super`** (no se les cambia el rol:
      `super` ya incluye todos los permisos de `colegio_admin` sobre
      cualquier colegio, incluido el piloto — no hace falta que sea
      literalmente los dos roles a la vez).

**Roles y permisos**
- [x] Nuevo rol `rol="colegio_admin"`: mismo alcance funcional que el
      "Super Admin" de hoy (Usuarios, Cursos, Alumnos, Maestros, Códigos,
      Horarios, Uniformes, Alertas, Comunicaciones, Menú, datos de
      Colegio), acotado siempre a `usuarios.colegio_id`. No ve ni puede
      nombrar otro colegio.
- [x] `rol="super"` sigue sin restricción (como hoy), pero pasa a ser un
      rol de plataforma: además de todo lo anterior, gestiona la tabla
      `colegios` en sí (alta de colegios nuevos) y puede entrar a
      administrar cualquier colegio existente como si fuera su
      `colegio_admin`.
- [x] `rol="admin"` (Room Parent, por curso) y `rol="padre"` (apoderado):
      **sin cambios** de comportamiento ni de nomenclatura.

**RLS (aislamiento real entre colegios)**
- [x] Nuevo helper `SECURITY DEFINER`: `es_colegio_admin_de(p_colegio)` —
      mismo patrón que `es_admin_curso(curso)` en `rls-hardening.sql`.
- [x] Helpers de resolución `colegio_de_curso(p_curso)` y análogos
      (`_hijo`/`_evento`/`_colecta`/`_recordatorio`/`_util`/`_libro`/
      `_uniforme`/`_uniforme_item`/`_encuesta`) para las tablas que cuelgan
      de `curso_id` sin `colegio_id` propio — mismo patrón ya usado por
      `es_miembro_curso_de_hijo`/`…_evento`/`…_colecta`/etc.
- [x] Toda policy existente que hoy usa `es_super()` sin alternativa gana
      un `or es_colegio_admin_de(<colegio de la fila>)` — cubre
      `rls-hardening.sql` (27 tablas) + `encuestas.sql`/
      `encuestas-recuperar-y-editar.sql` (3 tablas), en un único
      `supabase/multi-colegio.sql` nuevo. `calendar-token-hardening.sql`
      queda sin tocar a propósito (el token del feed ICS es siempre
      estrictamente personal, ni siquiera `colegio_admin` debería leer el
      de otro usuario).
- [x] Aislamiento confirmado — no con `scripts/verify-rls.sh` (no se
      extendió), sino en vivo: un `colegio_admin` de un colegio de prueba
      recién creado vio **1 usuario (él mismo)** en su panel de Usuarios,
      contra los 71 del colegio real — 0 filas cruzadas.
- [x] `manage-auth-user` (Edge Function): hoy solo chequea `rol==="super"`
      sin scope — se le agrega el chequeo de que un `colegio_admin` solo
      puede crear/editar/buscar usuarios de **su propio** `colegio_id`;
      `super` sigue sin restricción. *(Código actualizado y lint-clean;
      el redeploy queda pendiente hasta después de correr el SQL — ver
      nota de rollout.)*
- [x] `send-push`, `delete-account`: sin cambios (no dependen del
      concepto de colegio) — confirmado, no hizo falta tocarlos.

**UI — rol `super` (plataforma)**
- [x] Super Admin gana un grupo nuevo, **"Plataforma"**, visible solo para
      `rol==="super"`: módulo **"🏫 Colegios"** con la lista de colegios
      y un botón **"+ Nuevo colegio"** que crea la fila en `colegios` **y**
      su primer `colegio_admin` (nombre/email/contraseña, vía el mismo
      patrón de `manage-auth-user` que ya usa el alta de usuarios).
      *(Simplificado: la tarjeta de cada colegio muestra nombre + año
      lectivo vigente, sin el conteo de cursos/usuarios del plan
      original — se puede agregar después, no bloqueaba el resto.)*
- [x] Tocar un colegio de la lista lo pone como "colegio activo" de la
      sesión de `super` (`colegioId` de estado + botón "← Volver a
      Colegios"), y el resto de los módulos (Usuarios, Cursos, Hijos,
      Maestros, Alumnos) pasan a mostrar los datos de **ese** colegio —
      filtrado client-side sobre las mismas queries (RLS no acota a
      `super`, por diseño), sin duplicar componentes.

**UI — rol `colegio_admin`**
- [x] Ve exactamente los mismos módulos que el Super Admin actual
      (`SECCIONES` sin el grupo "Plataforma"), ya scopeados a su
      `colegio_id` sin selector — no elige colegio porque solo tiene uno.
      *(Acá el scoping es RLS puro, sin filtro client-side extra.)*
- [x] El módulo "Colegio" (`src/features/contacto/index.jsx` con
      `isSuperAdmin`) deja de leer el id hardcodeado
      (`d31b5547-246b-46fa-906e-950e51d4af58`) y usa el `colegio_id` del
      usuario en sesión (o el colegio activo, si es `super`) — con
      fallback a "el único colegio existente" para cualquier otro caller
      que todavía no pase `colegioId` explícito.

**Branding por colegio**
- [ ] Un colegio con `logo_url`/`color_primario` cargados reemplaza el
      wordmark "tribbu." y el acento de color en el sidebar/header de la
      app **una vez logueado**, para cualquier apoderado/admin/
      colegio_admin de ese colegio — se edita desde el módulo "Colegio".
      *(No hecho: los dos campos existen en la tabla y son editables
      desde el form de Colegio, pero nada en la UI los lee todavía para
      pintar el wordmark/acento — queda para una próxima pasada.)*
- [ ] En vista **"Todos"** (hijos en más de un colegio), se usa el
      branding **default de tribbu** — sin efecto observable hoy (no
      aplica ningún branding todavía, ver punto anterior).
- [x] La landing pública (`tribbu.ar`), el ícono de la PWA/APK y el
      `X-WR-CALNAME` del feed ICS **no** cambian por colegio — cierto por
      omisión, no se tocó ninguno de los tres.

**"Mi acceso" multi-colegio**
- [x] `items` (web `App.jsx`) sigue construyéndose igual (hijos + cursos
      admin), sin importar de qué colegio es cada curso — no se tocó ese
      código, así que un padre con hijos en dos colegios seguiría viendo
      un solo login y un solo "Todos" con ambos en cuanto existiera un
      segundo colegio real.
- [ ] `tagDeCurso(curso_id)` gana el nombre del colegio además del de
      curso — **no implementado**. Con un solo colegio en la base no hay
      forma de probarlo de verdad; queda para cuando exista un segundo
      colegio real (o de prueba).
- [x] `cursoIds`/`cursoId` (el contrato que ya consume cada feature vía
      `.in("curso_id", cursoIds)`) **no cambia de forma** — cero cambios
      de query en ningún feature existente, mismo principio que ya usó
      `specs/ano-lectivo-y-promocion-de-curso.md` para año lectivo.
- [x] Un Room Parent (`admin`) de un curso en el Colegio A y apoderado de
      un hijo en el Colegio B seguiría funcionando igual que hoy funciona
      "admin en un curso, padre en otro" — no se tocó `rolEfectivo`, sigue
      siendo per-item. *(No verificable en vivo con un solo colegio.)*

**Plataforma**
- [x] Esta primera versión es **web únicamente** (Super Admin +
      `colegio_admin`) — mobile sigue viendo un solo colegio (el único
      que existe) sin selector; su `Comedor` recibió el fix mínimo
      necesario para no romperse con `menu.colegio_id not null`
      (resuelve "el único colegio" como stopgap), sin ningún otro cambio
      de rol/UI.
- [x] `npm run lint` + `npm run build` limpios (233 problems, sube +4
      sobre el baseline de 229 — mismo patrón `set-state-in-effect` ya
      usado en todo el archivo, no una categoría nueva de error);
      `cd mobile && npm run lint` + `npx expo export -p ios` limpios.

## Technical Notes

- Migración SQL real (ya escrita, a correr a mano en el SQL editor de
  Supabase — no quedó como el snippet ilustrativo original de este spec):
  **`supabase/multi-colegio.sql`**. Crea `colegios` desde la fila
  `colegio` existente, agrega `colegio_id` a `cursos`/`menu`/`contactos`/
  `uniformes` (`not null`, con backfill) y `usuarios` (nullable), migra
  `menu`'s unique constraint de `fecha` a `(colegio_id, fecha)`, agrega
  `'colegio_admin'` al check constraint de `usuarios.rol`, define todos
  los helpers `colegio_de_*`/`es_colegio_admin_de*`, y reescribe (drop +
  create, mismo idiom que `rls-hardening.sql`) las policies de las 27
  tablas de `rls-hardening.sql` + las 3 de `encuestas.sql` para agregar
  `es_colegio_admin_de(...)` junto a cada `es_super()`. `colegio`
  (singular) queda en la base sin usarse — no se dropea en este script.
- `SuperAdmin()` (`src/features/superadmin/index.jsx`) se reutiliza tal
  cual para `colegio_admin` — no se duplica el componente. Gana un prop
  (o deriva de `usuario.rol`) para decidir si muestra el grupo
  "Plataforma" y de qué `colegio_id` filtrar cada query (`usuario.colegio_id`
  para `colegio_admin`; el colegio activo elegido en el módulo Colegios
  para `super`).
- El selector de "colegio activo" para `super` es el mismo patrón que ya
  usa "Mi acceso" (una lista + estado de índice activo), no un componente
  nuevo desde cero.
- `tagDeCurso`/"Mi acceso": mismo archivo/contrato que documenta
  `specs/vista-unificada-hijos-mobile.md` — extender ahí, no crear un
  mecanismo paralelo.
- [skill: vercel-react-best-practices] — el selector de colegio activo de
  `super` y la lista de colegios deben memoizarse igual que `cursosAdmin`/
  `cursoIds` hoy, para no recalcular en cada render.

## Out of Scope

- Mobile — toda la feature (roles, branding, selector de colegio, "Mi
  acceso" multi-colegio) queda web-only en esta versión.
- Branding en la landing pública (`tribbu.ar`), ícono de la PWA/APK,
  `X-WR-CALNAME` del feed ICS, o cualquier asset que se defina en tiempo
  de build en vez de en runtime.
- Facturación / planes / límites por colegio (cuántos cursos, cuántos
  usuarios) — queda para una versión futura si hace falta.
- Borrar o archivar un colegio.
- Mover un curso de un colegio a otro después de creado.
- Cualquier vista para que un apoderado elija manualmente "ver solo
  Colegio A" — "Todos" ya cubre el caso; ver-uno-solo se resuelve
  seleccionando el hijo puntual, igual que hoy con cursos.
- Impersonar a un usuario específico desde `super` (distinto de "entrar a
  administrar un colegio") — no es parte de este spec.
