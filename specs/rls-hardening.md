---
title: RLS Hardening — Aislamiento por curso
status: draft
priority: high
---

## Summary

Las políticas RLS del proyecto Supabase de tribbu están efectivamente abiertas:
cualquier usuario autenticado puede leer datos de **todos los cursos** vía la API
REST, y algunas tablas se leen incluso **sin sesión** (solo con la anon key, que
viaja en el bundle web y en `mobile/.env`). La UI no lo expone porque cada query
del cliente filtra `curso_id`/`usuario_id` del lado del cliente, pero
`GET /rest/v1/<tabla>` con el anon key + el JWT de cualquier apoderado devuelve
todo el colegio: nombres y DNI de menores de otros cursos, contactos de padres,
recordatorios, colectas, etc. Este spec cierra la fuga a nivel de base con RLS,
preservando el modelo de dominio (super ve todo; el resto solo sus cursos; padre
vs admin por curso; tablas de marca propia solo del dueño) y el registro con
código de invitación.

Verificado empíricamente el 2026-08-21 logueado como la cuenta demo
(`demo@tribbu.app`, apoderada/Room Parent **solo** del curso demo "3°A — Primaria",
`5f4b9003-406d-41f6-b932-8e836cc38d18`).

## Inventario del leak (observado por REST)

Login demo (rol authenticated). "rows" = filas visibles; "cursos" = cursos
distintos entre esas filas (la demo debería ver solo el suyo). "anon" = accesible
solo con apikey (sin Authorization).

| Tabla | auth: rows | cursos | ¿fuga cross-curso? | anon | Nota |
|---|---|---|---|---|---|
| usuarios | 71 | (todos) | **Sí** (todo el colegio) | — | PII de apoderados: email, tel, DNI |
| cursos | 5 | 5 | **Sí** | — | los 5 cursos del sistema |
| hijos | 43 | 3 | **Sí** | **43 (anon)** | **PII de menores expuesta a internet** |
| maestros | 15 | — | **Sí** | **15 (anon)** | email/fecha_nac de docentes |
| maestro_cursos | 23 | 3 | **Sí** | **23 (anon)** | |
| usuario_hijos | 73 | — | **Sí** | — | mapa padre↔hijo del colegio |
| usuario_cursos | 6 | 3 | **Sí** | — | membresías de otros usuarios |
| cumples | 48 | 3 | **Sí** | — | |
| eventos | 47 | 3 | **Sí** | — | |
| evento_asistencia | 1 | — | (solo demo) | — | |
| recordatorios | 23 | 3 | **Sí** | — | incluye `para_usuario_id` dirigidos |
| recordatorio_leidos | 20 | — | **Sí** | — | debería ser marca propia |
| colectas | 3 | 3 | **Sí** | — | |
| colecta_pagos | 2 | — | (solo demo) | — | quién pagó |
| menu | 117 | (global) | n/a | **117 (anon)** | global del colegio |
| utiles | 66 | 2 | **Sí** | — | |
| util_adquirido | 6 | — | **Sí** | — | debería ser marca propia |
| libros | 15 | 2 | **Sí** | — | |
| libro_adquirido | 0 | — | — | — | |
| uniformes | 4 | (global) | n/a | — | catálogo global |
| uniforme_items | 25 | (global) | n/a | — | catálogo global |
| uniforme_cursos | 8 | 4 | **Sí** | — | |
| uniforme_adquirido | 8 | — | **Sí** | — | debería ser marca propia |
| horarios | 38 | 2 | **Sí** | — | |
| colegio | 1 | (global) | n/a | — | info del colegio |
| contactos | 2 | (null) | (nivel colegio) | — | `curso_id` es **integer legacy** (no uuid), siempre null; la app no lo usa |
| alertas | 4 | 2 | **Sí** | — | |
| codigos_invitacion | (no en TABLES) | — | — | ver abajo | **existe** pero no está en el backup |

Dos clases de fuga:

1. **Cross-curso autenticado** (todas las tablas con `curso_id` o derivadas): un
   apoderado de un curso lee los datos de los otros cursos. Es la fuga principal.
   El patrón sugiere que hoy hay policies del tipo "cualquier authenticated" (por
   eso el anónimo puro recibe `200 0` en la mayoría, pero el autenticado ve todo).
2. **Anónimo público**: `hijos`, `maestros`, `maestro_cursos`, `menu` se leen con
   **solo la anon key, sin sesión**. `hijos` expone nombre/apellido/DNI/fecha de
   nacimiento de **menores** de todo el colegio a cualquiera que tenga la anon key
   (que es pública por diseño). Es el hallazgo más grave.

Hallazgo lateral (no de seguridad): la tabla `codigos_invitacion` **no** está en
la lista `TABLES` de `backup_tribbu.cjs`, así que **no se respalda**. Conviene
agregarla al backup.

## Modelo de políticas elegido

Funciones **helper `SECURITY DEFINER`** (owned por un rol con BYPASSRLS → no
disparan RLS al leer `usuarios`/`usuario_cursos`, evitando la recursión infinita
que rompería las policies sobre esas dos tablas base):

- `es_super()` — `usuarios.rol = 'super'` para el `auth.uid()` actual.
- `mi_usuario_id()` — `usuarios.id` del `auth.uid()` actual.
- `es_miembro_curso(curso)` / `es_admin_curso(curso)` — membresía por curso.
- `es_admin_any()` — admin de al menos un curso (recursos globales del colegio).
- `comparte_curso(usuario)` — visibilidad "mismo curso" para listar compañeros.
- `es_padre_de(hijo)`, `es_miembro_curso_de_hijo/…_evento/…_colecta`,
  `es_admin_curso_de_hijo`, `es_maestro_visible` — para las tablas sin `curso_id`
  que se scopean vía join.

Patrón por tipo de tabla:

| Tipo | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| Por curso (hijos, cursos, cumples, eventos, recordatorios, colectas, utiles, libros, horarios, maestro_cursos, uniforme_cursos, alertas) | super o miembro del curso | super o admin del curso; **excepto** cumples/eventos/recordatorios/colectas donde cualquier **miembro** escribe (festejos creados por apoderados + auto-recordatorios) |
| Base (usuarios, usuario_cursos) | super, yo, o compañero de curso / miembro del curso | super (usuarios) · super o admin del curso (usuario_cursos) — el alta de apoderado va por RPC |
| Sin curso_id, vía join (maestros, evento_asistencia, colecta_pagos, usuario_hijos) | super o miembro del curso asociado | según corresponda (evento_asistencia/colecta_pagos: miembro del curso; usuario_hijos: admin del curso del hijo) |
| Marca propia (recordatorio_leidos, util/libro/uniforme_adquirido) | super o `usuario_id = mi_usuario_id()` | igual (solo filas propias) |
| Global del colegio (menu, uniformes, uniforme_items, colegio) | cualquier autenticado (`true`) | super o admin |
| contactos (nivel colegio) | cualquier autenticado (`true`) — `curso_id` es integer legacy siempre null, no se puede scopear por curso | super o admin |
| codigos_invitacion | super o miembro del curso (el anónimo NO lee la tabla) | super |

`recordatorios` SELECT además protege los recordatorios **dirigidos**
(`para_usuario_id`): solo los ve su destinatario, el creador o el admin del curso.

**No** se usa `FORCE ROW LEVEL SECURITY`: las Edge Functions (service_role,
BYPASSRLS) y los helpers definer dependen de poder saltear RLS. El
`service_role` de las Edge Functions no se ve afectado por RLS en ningún caso.

## Registro con código de invitación (fase anón)

Hoy el registro corre **entero del lado del cliente** (`src/features/auth`,
`mobile/features/auth`):

1. `verificarCodigo()` — **anon** — `SELECT` sobre `codigos_invitacion` por
   `codigo` + join `cursos(nombre)`.
2. `signUp()` crea el Auth user (si "Confirm email" está OFF, deja sesión).
3. `INSERT usuarios` (auth_id propio) · `INSERT usuario_cursos` (rol padre) ·
   `UPDATE codigos_invitacion.usos_actuales`.

Problemas para RLS:

- Un `SELECT` anónimo sobre `codigos_invitacion` con `USING (activo)` permitiría
  **enumerar todos los códigos** activos y auto-unirse a cualquier curso → nueva
  fuga.
- Abrir `INSERT` self sobre `usuario_cursos` deja que **cualquier autenticado se
  enrole en cualquier curso** (el código solo se valida en la UI, no en RLS) →
  rompe el aislamiento que estamos cerrando.

Solución (en `supabase/rls-hardening.sql`): dos funciones `SECURITY DEFINER`
que reemplazan el acceso directo del cliente:

- `verificar_codigo(p_codigo)` → devuelve `{valido, curso_id, curso_nombre,
  codigo_id, motivo}`. No permite enumerar (hay que saber el código exacto; el
  anónimo no tiene policy de SELECT sobre la tabla).
- `crear_apoderado(p_codigo, p_auth_id, p_nombre, p_apellido, p_email)` → valida
  el código, crea `usuarios` + `usuario_cursos` (rol padre) e incrementa el uso,
  todo server-side. Si hay sesión, exige `auth.uid() = p_auth_id`. Es idempotente.

Con esto, `usuarios.INSERT` y `usuario_cursos.INSERT` quedan restringidos
(super / admin) sin romper el alta, y **funciona con o sin confirmación de email**
(el definer no depende de la sesión).

## Acceptance Criteria

- [ ] Corrido el SQL, la cuenta demo (miembro de 1 curso) ve **solo** su curso en
      cada tabla: `scripts/verify-rls.sh` reporta 0 filas de cursos ajenos.
- [ ] El anónimo puro (solo apikey) recibe **0 filas** en `hijos`, `maestros`,
      `maestro_cursos`, `menu` y todas las demás.
- [ ] La demo sigue viendo sus propios datos: su curso, sus hijos, sus compañeros
      de curso (usuarios/usuario_hijos del mismo curso), sus recordatorios, etc.
- [ ] El bootstrap (`select usuarios … usuario_hijos(...), usuario_cursos(...)`
      por `auth_id`) sigue devolviendo la fila propia con sus joins (web y mobile).
- [ ] `getUserIdsByCurso(cursoId)` sigue devolviendo los ids del curso (lee
      `usuario_cursos`, `hijos`, `usuario_hijos` del curso propio).
- [ ] Super Admin (web y mobile) sigue leyendo/escribiendo todas las tablas.
- [ ] Registro con código: `verificarCodigo` y `registrar` usan los RPC nuevos y
      completan el alta (probar con un código real tras aplicar el SQL).
- [ ] `npm run lint` (web) y `cd mobile && npm run lint` pasan.

## Queries del cliente en riesgo (y su resolución)

1. **Registro — `verificarCodigo()`** (`src/features/auth/index.jsx:168`,
   `mobile/features/auth/index.jsx:217`): `SELECT codigos_invitacion` directo.
   → **Cambio aplicado**: pasa a `supabase.rpc("verificar_codigo", …)`.
2. **Registro — `registrar()`** (`src/features/auth/index.jsx:196-217`,
   `mobile/features/auth/index.jsx:260-289`): `INSERT usuarios` + `INSERT
   usuario_cursos` + `UPDATE codigos_invitacion`.
   → **Cambio aplicado**: tras `signUp`, un solo `supabase.rpc("crear_apoderado",
   …)`. **El SQL y el código deben desplegarse juntos.**
3. **SuperAdmin bulk import — `usuarios.select("id,auth_id").eq("email", …)`**
   (`superadmin/index.jsx:1269`, mobile `:1576`): busca por email. Corre como
   **super** → `es_super()` devuelve todas las filas, sigue funcionando. Un no-super
   no puede (y no ejecuta ese flujo). Sin cambios.
4. **Alumnos (vincular) — candidatos** (`src/features/contacto`, pantalla Alumnos):
   la lista de usuarios candidatos a vincular pasa a estar **scopeada al curso**
   (antes veía todo el colegio). Es el comportamiento correcto (el apoderado se
   registra al curso con su código y recién ahí aparece como candidato). **Cambio
   de comportamiento a observar en QA, no un bug.**
5. **`getUserIdsByCurso`** (`src/lib/push.js`, `mobile/lib/push.js`): lee
   `usuario_cursos`/`hijos`/`usuario_hijos` filtrando por `curso_id` del curso
   propio → cubierto por las policies de "miembro del curso". Sin cambios.

Ninguna otra query rompe: todas filtran por un `cursoId`/`userId` que ya es del
usuario, y las policies permiten exactamente ese alcance.

## Riesgos y residuales

- **Acoplamiento SQL↔código del registro**: si se aplica solo uno, el alta se
  rompe. Desplegar juntos (o aplicar SQL primero en una ventana corta y el código
  inmediatamente después). Rollback del SQL disponible al final del `.sql`.
- **Escritura intra-curso amplia**: para no romper el flujo de festejos (donde un
  **apoderado** crea eventos/colectas/recordatorios/cumples de su curso), esas
  tablas permiten escribir a cualquier **miembro** del curso, no solo admin. Un
  apoderado podría entonces crear/borrar contenido de **su propio** curso vía API
  (no de otros). Es un residual menor y NO una fuga cross-curso. Endurecer a
  "admin o autor" es un follow-up (requiere afinar por `creado_por`/`responsable_id`).
- **`crear_apoderado` recibe `p_auth_id` del cliente**: mitigado exigiendo
  `auth.uid() = p_auth_id` cuando hay sesión, e idempotencia por `auth_id`. Con
  "Confirm email" ON no hay sesión en ese momento; el riesgo (crear una fila
  `usuarios` para un `auth_id` ajeno conocido) queda acotado por requerir un
  código válido y no vinculado aún.
- **Confirm email**: si estuviera **ON**, con el modelo anterior los inserts
  post-signUp corrían como anon y hoy funcionan solo porque todo está abierto. El
  RPC definer los hace funcionar en ambos casos. Igual conviene confirmar el
  setting en Supabase Auth.
- **Recordatorios dirigidos**: la policy de SELECT ahora oculta los
  `para_usuario_id` ajenos. La UI ya filtraba client-side, así que solo recibe
  menos filas (correcto). Verificar el badge de "no leídos" en Notificaciones.

## Rollout

1. Backup: `node backup_tribbu.cjs` (además, agregar `codigos_invitacion` a
   `TABLES`). Opcional: export de Storage no incluido por el script.
2. Correr `scripts/verify-rls.sh` **antes** (queda el "before": muestra la fuga).
3. Aplicar `supabase/rls-hardening.sql` completo en el SQL editor de Supabase.
4. Desplegar el código (web + mobile) con los RPC del registro.
5. Correr `scripts/verify-rls.sh` **después**: 0 filas ajenas, 0 filas anónimas,
   y los datos propios de la demo siguen accesibles.
6. QA manual: login apoderado (ve solo su curso), login admin, Super Admin
   (ve todo), y **alta con un código real** (registro end-to-end).

## Rollback

Bloque comentado al final de `supabase/rls-hardening.sql`: borra las policies y
hace `disable row level security` en todas las tablas (vuelve al estado abierto).
Los helpers/RPC pueden quedar. Usar solo como emergencia.

## Out of Scope

- Endurecer la escritura intra-curso a "admin o autor" (follow-up).
- Migrar el registro a una Edge Function (los RPC definer alcanzan).
- Rotar la anon key / revisar exposición de Storage (bucket `adjuntos` público).
- RLS sobre objetos de Storage.
- Agregar `codigos_invitacion` al backup (recomendado, trivial, aparte).

## Technical Notes

- SQL: `supabase/rls-hardening.sql` (idempotente; dropea policies previas con un
  `DO` sobre `pg_policies`, crea helpers definer + RPC, habilita RLS y crea las
  policies). Correr entero en el SQL editor.
- Verificación: `scripts/verify-rls.sh` (curl; lee URL/anon de `mobile/.env`; no
  hardcodea secretos; login demo + probes por tabla autenticadas y anónimas).
- Código tocado (mínimo y fiel al flujo actual): `src/features/auth/index.jsx` y
  `mobile/features/auth/index.jsx` — `verificarCodigo()` → `rpc("verificar_codigo")`
  y `registrar()` → `signUp` + `rpc("crear_apoderado")`.
- Edge Functions (`manage-auth-user`, `delete-account`, `send-push`): usan
  service_role → **no** afectadas por RLS. No se tocan.
