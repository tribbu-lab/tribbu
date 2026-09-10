-- =============================================================================
-- multi-colegio.sql · Soporte multi-tenant (varios colegios) para tribbu
-- =============================================================================
--
-- Ver specs/multi-colegio.md para el diseño completo. Resumen:
--   · `colegio` (singleton) → `colegios` (una fila por colegio real).
--   · `cursos`/`menu`/`contactos`/`uniformes` ganan `colegio_id` — todo lo que
--     cuelga de `curso_id` (hijos, maestros, eventos, recordatorios, colectas,
--     cumples, alertas, horarios, útiles, libros, uniforme_cursos, encuestas,
--     códigos de invitación) queda scopeado TRANSITIVAMENTE vía curso→colegio,
--     sin agregarles la columna una por una.
--   · Nuevo rol `colegio_admin`: mismo alcance que "Super Admin" hoy, acotado a
--     `usuarios.colegio_id`. `super` (vos) sigue sin restricción — pasa a ser el
--     rol de plataforma (crea colegios, entra a administrar cualquiera).
--   · A casi toda policy que hoy dice `es_super()` se le AGREGA una
--     alternativa (`es_colegio_admin_de(...)`) — no se le quita nada a
--     nadie ahí. Mientras no exista ningún usuario `colegio_admin`, esas
--     policies no cambian de resultado para nadie.
--   · Excepción real (no solo aditiva): `menu`/`uniformes`/`uniforme_items`/
--     `contactos` SELECT pasan de "cualquier autenticado" (`true`, tenía
--     sentido con un solo colegio) a "miembro de ESE colegio" — necesario
--     para que dejen de filtrarse entre colegios. No afecta a ningún usuario
--     real hoy: todo apoderado/admin/padre activo ya es miembro de al menos
--     un curso de su colegio (el alta por código lo garantiza en el mismo
--     paso), así que `es_miembro_colegio()` les da true igual que antes.
--
-- CÓMO CORRERLO
--   Pegar TODO el archivo en el SQL editor de Supabase (proyecto tribbu) y
--   ejecutar. Es idempotente en la parte de funciones/policies (create or
--   replace / drop-then-create); la parte de creación de tabla y columnas usa
--   `if not exists` así que también se puede re-correr sin romper nada.
--
-- ROLLBACK
--   No hace falta un bloque de rollback separado: esta migración es puramente
--   ADITIVA sobre las policies (agrega un "or" a cada una) — para revertir el
--   modelo de permisos alcanza con volver a correr `rls-hardening.sql` +
--   `encuestas.sql`/`encuestas-hardening.sql`/`recordatorios-hardening.sql`
--   completos (que no tienen la cláusula de colegio_admin) sobre las tablas que
--   toca. Las columnas/tabla nuevas (`colegios`, `*.colegio_id`) pueden quedar
--   sin uso; no rompen nada si el código no las lee.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) TABLA colegios (reemplaza el singleton colegio) + columnas colegio_id
-- -----------------------------------------------------------------------------

create table if not exists public.colegios (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text,
  telefono            text,
  email               text,
  direccion           text,
  url_maps            text,
  horario_clases      text,
  horario_secretaria  text,
  sitio_web           text,
  año_lectivo_actual  integer not null default extract(year from now()),
  logo_url            text,
  color_primario      text,
  creado_en           timestamptz not null default now()
);

-- Migra la fila única existente (una sola vez — no duplica si ya se corrió).
insert into public.colegios
  (id, nombre, telefono, email, direccion, url_maps, horario_clases, horario_secretaria, sitio_web, año_lectivo_actual)
select id, nombre, telefono, email, direccion, url_maps, horario_clases, horario_secretaria, sitio_web, año_lectivo_actual
from public.colegio
where not exists (select 1 from public.colegios where colegios.id = colegio.id);

-- cursos
alter table public.cursos add column if not exists colegio_id uuid references public.colegios(id);
update public.cursos set colegio_id = (select id from public.colegios limit 1) where colegio_id is null;
alter table public.cursos alter column colegio_id set not null;

-- menu (hoy 100% global, sin curso_id — pasa a ser por colegio)
alter table public.menu add column if not exists colegio_id uuid references public.colegios(id);
update public.menu set colegio_id = (select id from public.colegios limit 1) where colegio_id is null;
alter table public.menu alter column colegio_id set not null;
-- `fecha` era unique a secas (un solo colegio) — con varios colegios, dos
-- colegios distintos deben poder tener menú cargado para la misma fecha.
-- La app usa onConflict:"colegio_id,fecha" en el upsert (UploadMenuExcel y
-- el editor de día a día) desde este mismo cambio.
alter table public.menu drop constraint if exists menu_fecha_key;
alter table public.menu add constraint menu_colegio_fecha_key unique (colegio_id, fecha);

-- contactos (curso_id es legacy integer, siempre null — no sirve para scopear)
alter table public.contactos add column if not exists colegio_id uuid references public.colegios(id);
update public.contactos set colegio_id = (select id from public.colegios limit 1) where colegio_id is null;
alter table public.contactos alter column colegio_id set not null;

-- uniformes (catálogo global, sin curso_id)
alter table public.uniformes add column if not exists colegio_id uuid references public.colegios(id);
update public.uniformes set colegio_id = (select id from public.colegios limit 1) where colegio_id is null;
alter table public.uniformes alter column colegio_id set not null;

-- usuarios (solo se completa para colegio_admin; super no tiene)
alter table public.usuarios add column if not exists colegio_id uuid references public.colegios(id);

-- Nuevo rol en el check constraint de usuarios.rol. Superset: incluye 'room'
-- (Room Parent, ver rol-admin-a-room.sql) y 'admin' (legacy) para no romper
-- ni el alta de apoderados/Room Parent nuevos ni filas viejas, corra este
-- archivo antes o después de rol-admin-a-room.sql.
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre','admin','room','super','colegio_admin']));


-- -----------------------------------------------------------------------------
-- 2) FUNCIONES HELPER — colegio_admin y resolución de colegio por join
-- -----------------------------------------------------------------------------

-- ¿el usuario actual es colegio_admin del colegio dado?
create or replace function public.es_colegio_admin_de(p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.usuarios
    where auth_id = auth.uid() and rol = 'colegio_admin' and colegio_id = p_colegio
  )
$$;

create or replace function public.colegio_de_curso(p_curso uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select colegio_id from public.cursos where id = p_curso $$;

create or replace function public.colegio_de_hijo(p_hijo uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.hijos where id = p_hijo $$;

create or replace function public.colegio_de_evento(p_evento uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.eventos where id = p_evento $$;

create or replace function public.colegio_de_colecta(p_colecta uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.colectas where id = p_colecta $$;

create or replace function public.colegio_de_recordatorio(p_recordatorio uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.recordatorios where id = p_recordatorio $$;

create or replace function public.colegio_de_util(p_util uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.utiles where id = p_util $$;

create or replace function public.colegio_de_libro(p_libro uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.libros where id = p_libro $$;

create or replace function public.colegio_de_uniforme(p_uniforme uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select colegio_id from public.uniformes where id = p_uniforme $$;

create or replace function public.colegio_de_uniforme_item(p_item uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_uniforme(uniforme_id) from public.uniforme_items where id = p_item $$;

create or replace function public.colegio_de_encuesta(p_encuesta uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select public.colegio_de_curso(curso_id) from public.encuestas where id = p_encuesta $$;

-- ¿el maestro dado da clase en algún curso del colegio administrado por mí?
create or replace function public.es_colegio_admin_de_maestro(p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.maestro_cursos mc
    where mc.maestro_id = p_maestro
      and public.es_colegio_admin_de(public.colegio_de_curso(mc.curso_id))
  )
$$;

-- ¿el usuario dado (por usuario_cursos o hijos vinculados) pertenece al colegio
-- que administro? — mismo criterio de membresía que comparte_curso/es_miembro_curso,
-- resuelto contra mi colegio en vez de contra "compartir un curso puntual".
create or replace function public.es_colegio_admin_de_usuario(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.usuario_cursos uc
    where uc.usuario_id = p_usuario
      and public.es_colegio_admin_de(public.colegio_de_curso(uc.curso_id))
  ) or exists(
    select 1 from public.usuario_hijos uh
    join public.hijos h on h.id = uh.hijo_id
    where uh.usuario_id = p_usuario
      and public.es_colegio_admin_de(public.colegio_de_curso(h.curso_id))
  )
$$;

grant execute on function
  public.es_colegio_admin_de(uuid), public.colegio_de_curso(uuid),
  public.colegio_de_hijo(uuid), public.colegio_de_evento(uuid),
  public.colegio_de_colecta(uuid), public.colegio_de_recordatorio(uuid),
  public.colegio_de_util(uuid), public.colegio_de_libro(uuid),
  public.colegio_de_uniforme(uuid), public.colegio_de_uniforme_item(uuid),
  public.colegio_de_encuesta(uuid), public.es_colegio_admin_de_maestro(uuid),
  public.es_colegio_admin_de_usuario(uuid)
to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3) RLS: tabla colegios
-- -----------------------------------------------------------------------------
alter table public.colegios enable row level security;

-- Miembro de cualquier curso del colegio, su colegio_admin, o super.
create or replace function public.es_miembro_colegio(p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_colegio_admin_de(p_colegio) or exists(
    select 1 from public.cursos c
    where c.colegio_id = p_colegio and public.es_miembro_curso(c.id)
  )
$$;
grant execute on function public.es_miembro_colegio(uuid) to anon, authenticated;

drop policy if exists colegios_select on public.colegios;
create policy colegios_select on public.colegios for select to authenticated
  using ( public.es_super() or public.es_miembro_colegio(id) );
drop policy if exists colegios_insert on public.colegios;
create policy colegios_insert on public.colegios for insert to authenticated
  with check ( public.es_super() );
drop policy if exists colegios_update on public.colegios;
create policy colegios_update on public.colegios for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(id) )
  with check ( public.es_super() or public.es_colegio_admin_de(id) );
drop policy if exists colegios_delete on public.colegios;
create policy colegios_delete on public.colegios for delete to authenticated
  using ( public.es_super() );


-- -----------------------------------------------------------------------------
-- 4) RLS: agregar colegio_admin a las policies existentes (rls-hardening.sql)
--    Mismo criterio en cada una: donde decía `es_super()`, ahora dice
--    `es_super() or es_colegio_admin_de(<colegio de la fila>)`. El resto de la
--    condición (miembro del curso, autor, admin del curso, marca propia) queda
--    igual que en rls-hardening.sql.
-- -----------------------------------------------------------------------------

-- === usuarios =================================================================
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
  using ( public.es_super() or id = public.mi_usuario_id() or public.comparte_curso(id) or public.es_colegio_admin_de_usuario(id) );
-- Un colegio_admin puede insertar usuarios nuevos (mismo criterio "sin scope
-- de fila" que ya tenía super — a esta altura el usuario todavía no tiene
-- ningún usuario_cursos/usuario_hijos con el que resolver su colegio; el
-- alcance real se aplica después, en usuario_cursos_insert/usuario_hijos_insert,
-- que sí conocen el curso). Lo único que NO puede es crear otro colegio_admin
-- ni un super — eso queda exclusivamente para el módulo "Colegios" de super.
drop policy if exists usuarios_insert on public.usuarios;
create policy usuarios_insert on public.usuarios for insert to authenticated
  with check (
    public.es_super()
    or (
      rol not in ('super','colegio_admin')
      and exists(select 1 from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'colegio_admin')
    )
  );
-- Un colegio_admin puede editar usuarios de su colegio (activar/desactivar,
-- promover a Room Parent, etc. — mismo panel que hoy usa Super Admin), pero
-- WITH CHECK le bloquea poner rol='super' o 'colegio_admin' en cualquier fila
-- (incluida la propia, que de todos modos no matchea es_colegio_admin_de_usuario
-- porque un colegio_admin no tiene usuario_cursos/usuario_hijos propios —
-- mismo comportamiento que ya tenía cualquier no-super antes de esta migración,
-- que no podía autoeditarse por RLS).
drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de_usuario(id) )
  with check ( public.es_super() or ( public.es_colegio_admin_de_usuario(id) and rol not in ('super','colegio_admin') ) );
drop policy if exists usuarios_delete on public.usuarios;
create policy usuarios_delete on public.usuarios for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de_usuario(id) );

-- === cursos ===================================================================
drop policy if exists cursos_select on public.cursos;
create policy cursos_select on public.cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(id) or public.es_colegio_admin_de(colegio_id) );
drop policy if exists cursos_insert on public.cursos;
create policy cursos_insert on public.cursos for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists cursos_update on public.cursos;
create policy cursos_update on public.cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(id) or public.es_colegio_admin_de(colegio_id) )
  with check ( public.es_super() or public.es_admin_curso(id) or public.es_colegio_admin_de(colegio_id) );
drop policy if exists cursos_delete on public.cursos;
create policy cursos_delete on public.cursos for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(colegio_id) );

-- === hijos =====================================================================
drop policy if exists hijos_select on public.hijos;
create policy hijos_select on public.hijos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_padre_de(id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists hijos_insert on public.hijos;
create policy hijos_insert on public.hijos for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists hijos_update on public.hijos;
create policy hijos_update on public.hijos for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists hijos_delete on public.hijos;
create policy hijos_delete on public.hijos for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === maestros (sin curso_id; vía maestro_cursos) ==============================
drop policy if exists maestros_select on public.maestros;
create policy maestros_select on public.maestros for select to authenticated
  using ( public.es_maestro_visible(id) or public.es_colegio_admin_de_maestro(id) );
drop policy if exists maestros_insert on public.maestros;
create policy maestros_insert on public.maestros for insert to authenticated
  with check ( public.es_super() or exists(select 1 from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'colegio_admin') );
drop policy if exists maestros_update on public.maestros;
create policy maestros_update on public.maestros for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de_maestro(id) )
  with check ( public.es_super() or public.es_colegio_admin_de_maestro(id) );
drop policy if exists maestros_delete on public.maestros;
create policy maestros_delete on public.maestros for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de_maestro(id) );

-- === maestro_cursos ============================================================
drop policy if exists maestro_cursos_select on public.maestro_cursos;
create policy maestro_cursos_select on public.maestro_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists maestro_cursos_insert on public.maestro_cursos;
create policy maestro_cursos_insert on public.maestro_cursos for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists maestro_cursos_update on public.maestro_cursos;
create policy maestro_cursos_update on public.maestro_cursos for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists maestro_cursos_delete on public.maestro_cursos;
create policy maestro_cursos_delete on public.maestro_cursos for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === usuario_hijos ==============================================================
drop policy if exists usuario_hijos_select on public.usuario_hijos;
create policy usuario_hijos_select on public.usuario_hijos for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_miembro_curso_de_hijo(hijo_id) or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) );
drop policy if exists usuario_hijos_insert on public.usuario_hijos;
create policy usuario_hijos_insert on public.usuario_hijos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) );
drop policy if exists usuario_hijos_update on public.usuario_hijos;
create policy usuario_hijos_update on public.usuario_hijos for update to authenticated
  using ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) )
  with check ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) );
drop policy if exists usuario_hijos_delete on public.usuario_hijos;
create policy usuario_hijos_delete on public.usuario_hijos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso_de_hijo(hijo_id) or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) );

-- === usuario_cursos ==============================================================
drop policy if exists usuario_cursos_select on public.usuario_cursos;
create policy usuario_cursos_select on public.usuario_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists usuario_cursos_insert on public.usuario_cursos;
create policy usuario_cursos_insert on public.usuario_cursos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists usuario_cursos_update on public.usuario_cursos;
create policy usuario_cursos_update on public.usuario_cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists usuario_cursos_delete on public.usuario_cursos;
create policy usuario_cursos_delete on public.usuario_cursos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === cumples ===================================================================
drop policy if exists cumples_select on public.cumples;
create policy cumples_select on public.cumples for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists cumples_insert on public.cumples;
create policy cumples_insert on public.cumples for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists cumples_update on public.cumples;
create policy cumples_update on public.cumples for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists cumples_delete on public.cumples;
create policy cumples_delete on public.cumples for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === eventos ====================================================================
drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists eventos_delete on public.eventos;
create policy eventos_delete on public.eventos for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === evento_asistencia (sin curso_id; vía evento) ==============================
drop policy if exists evento_asistencia_select on public.evento_asistencia;
create policy evento_asistencia_select on public.evento_asistencia for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) or public.es_colegio_admin_de(public.colegio_de_evento(evento_id)) );
drop policy if exists evento_asistencia_insert on public.evento_asistencia;
create policy evento_asistencia_insert on public.evento_asistencia for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) or public.es_colegio_admin_de(public.colegio_de_evento(evento_id)) );
drop policy if exists evento_asistencia_update on public.evento_asistencia;
create policy evento_asistencia_update on public.evento_asistencia for update to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) or public.es_colegio_admin_de(public.colegio_de_evento(evento_id)) )
  with check ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) or public.es_colegio_admin_de(public.colegio_de_evento(evento_id)) );
drop policy if exists evento_asistencia_delete on public.evento_asistencia;
create policy evento_asistencia_delete on public.evento_asistencia for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_evento(evento_id) or public.es_colegio_admin_de(public.colegio_de_evento(evento_id)) );

-- === recordatorios ===============================================================
-- Select y (update/delete, ver recordatorios-hardening.sql) respetan el mismo
-- criterio de "dirigidos" — se agrega colegio_admin como alternativa a super.
drop policy if exists recordatorios_select on public.recordatorios;
create policy recordatorios_select on public.recordatorios for select to authenticated
  using (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );
drop policy if exists recordatorios_insert on public.recordatorios;
create policy recordatorios_insert on public.recordatorios for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios for update to authenticated
  using (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  )
  with check (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );
drop policy if exists recordatorios_delete on public.recordatorios;
create policy recordatorios_delete on public.recordatorios for delete to authenticated
  using (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );

-- === recordatorio_leidos (marca propia) =========================================
drop policy if exists recordatorio_leidos_select on public.recordatorio_leidos;
create policy recordatorio_leidos_select on public.recordatorio_leidos for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_recordatorio(recordatorio_id)) );
drop policy if exists recordatorio_leidos_insert on public.recordatorio_leidos;
create policy recordatorio_leidos_insert on public.recordatorio_leidos for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists recordatorio_leidos_update on public.recordatorio_leidos;
create policy recordatorio_leidos_update on public.recordatorio_leidos for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists recordatorio_leidos_delete on public.recordatorio_leidos;
create policy recordatorio_leidos_delete on public.recordatorio_leidos for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === colectas =====================================================================
drop policy if exists colectas_select on public.colectas;
create policy colectas_select on public.colectas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists colectas_insert on public.colectas;
create policy colectas_insert on public.colectas for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists colectas_update on public.colectas;
create policy colectas_update on public.colectas for update to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists colectas_delete on public.colectas;
create policy colectas_delete on public.colectas for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === colecta_pagos (sin curso_id; vía colecta) ====================================
drop policy if exists colecta_pagos_select on public.colecta_pagos;
create policy colecta_pagos_select on public.colecta_pagos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id)) );
drop policy if exists colecta_pagos_insert on public.colecta_pagos;
create policy colecta_pagos_insert on public.colecta_pagos for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id)) );
drop policy if exists colecta_pagos_update on public.colecta_pagos;
create policy colecta_pagos_update on public.colecta_pagos for update to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id)) )
  with check ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id)) );
drop policy if exists colecta_pagos_delete on public.colecta_pagos;
create policy colecta_pagos_delete on public.colecta_pagos for delete to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_colecta(colecta_id) or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id)) );

-- === menu (ahora por colegio, ya no global) =======================================
-- Antes "true" (cualquier autenticado) tenía sentido porque solo existía un
-- colegio; con colegio_id real, dejarlo así filtraría el menú de otros
-- colegios a cualquiera — se acota a "miembro de ese colegio".
drop policy if exists menu_select on public.menu;
create policy menu_select on public.menu for select to authenticated
  using ( public.es_super() or public.es_miembro_colegio(colegio_id) );
drop policy if exists menu_insert on public.menu;
create policy menu_insert on public.menu for insert to authenticated
  with check ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists menu_update on public.menu;
create policy menu_update on public.menu for update to authenticated
  using ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) )
  with check ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists menu_delete on public.menu;
create policy menu_delete on public.menu for delete to authenticated
  using ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );

-- === utiles =========================================================================
drop policy if exists utiles_select on public.utiles;
create policy utiles_select on public.utiles for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists utiles_insert on public.utiles;
create policy utiles_insert on public.utiles for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists utiles_update on public.utiles;
create policy utiles_update on public.utiles for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists utiles_delete on public.utiles;
create policy utiles_delete on public.utiles for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === util_adquirido (marca propia) ==================================================
drop policy if exists util_adquirido_select on public.util_adquirido;
create policy util_adquirido_select on public.util_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_util(util_id)) );
drop policy if exists util_adquirido_insert on public.util_adquirido;
create policy util_adquirido_insert on public.util_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists util_adquirido_update on public.util_adquirido;
create policy util_adquirido_update on public.util_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists util_adquirido_delete on public.util_adquirido;
create policy util_adquirido_delete on public.util_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === libros ===========================================================================
drop policy if exists libros_select on public.libros;
create policy libros_select on public.libros for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists libros_insert on public.libros;
create policy libros_insert on public.libros for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists libros_update on public.libros;
create policy libros_update on public.libros for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists libros_delete on public.libros;
create policy libros_delete on public.libros for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === libro_adquirido (marca propia) ===================================================
drop policy if exists libro_adquirido_select on public.libro_adquirido;
create policy libro_adquirido_select on public.libro_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_libro(libro_id)) );
drop policy if exists libro_adquirido_insert on public.libro_adquirido;
create policy libro_adquirido_insert on public.libro_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists libro_adquirido_update on public.libro_adquirido;
create policy libro_adquirido_update on public.libro_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists libro_adquirido_delete on public.libro_adquirido;
create policy libro_adquirido_delete on public.libro_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === uniformes (ahora por colegio) ====================================================
drop policy if exists uniformes_select on public.uniformes;
create policy uniformes_select on public.uniformes for select to authenticated
  using ( public.es_super() or public.es_miembro_colegio(colegio_id) );
drop policy if exists uniformes_insert on public.uniformes;
create policy uniformes_insert on public.uniformes for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists uniformes_update on public.uniformes;
create policy uniformes_update on public.uniformes for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(colegio_id) )
  with check ( public.es_super() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists uniformes_delete on public.uniformes;
create policy uniformes_delete on public.uniformes for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(colegio_id) );

-- === uniforme_items ====================================================================
drop policy if exists uniforme_items_select on public.uniforme_items;
create policy uniforme_items_select on public.uniforme_items for select to authenticated
  using ( public.es_super() or public.es_miembro_colegio(public.colegio_de_uniforme(uniforme_id)) );
drop policy if exists uniforme_items_insert on public.uniforme_items;
create policy uniforme_items_insert on public.uniforme_items for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_uniforme(uniforme_id)) );
drop policy if exists uniforme_items_update on public.uniforme_items;
create policy uniforme_items_update on public.uniforme_items for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_uniforme(uniforme_id)) )
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_uniforme(uniforme_id)) );
drop policy if exists uniforme_items_delete on public.uniforme_items;
create policy uniforme_items_delete on public.uniforme_items for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_uniforme(uniforme_id)) );

-- === uniforme_cursos =====================================================================
drop policy if exists uniforme_cursos_select on public.uniforme_cursos;
create policy uniforme_cursos_select on public.uniforme_cursos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists uniforme_cursos_insert on public.uniforme_cursos;
create policy uniforme_cursos_insert on public.uniforme_cursos for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists uniforme_cursos_update on public.uniforme_cursos;
create policy uniforme_cursos_update on public.uniforme_cursos for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists uniforme_cursos_delete on public.uniforme_cursos;
create policy uniforme_cursos_delete on public.uniforme_cursos for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === uniforme_adquirido (marca propia) ====================================================
drop policy if exists uniforme_adquirido_select on public.uniforme_adquirido;
create policy uniforme_adquirido_select on public.uniforme_adquirido for select to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_uniforme_item(uniforme_item_id)) );
drop policy if exists uniforme_adquirido_insert on public.uniforme_adquirido;
create policy uniforme_adquirido_insert on public.uniforme_adquirido for insert to authenticated
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists uniforme_adquirido_update on public.uniforme_adquirido;
create policy uniforme_adquirido_update on public.uniforme_adquirido for update to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() )
  with check ( public.es_super() or usuario_id = public.mi_usuario_id() );
drop policy if exists uniforme_adquirido_delete on public.uniforme_adquirido;
create policy uniforme_adquirido_delete on public.uniforme_adquirido for delete to authenticated
  using ( public.es_super() or usuario_id = public.mi_usuario_id() );

-- === horarios ================================================================================
drop policy if exists horarios_select on public.horarios;
create policy horarios_select on public.horarios for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists horarios_insert on public.horarios;
create policy horarios_insert on public.horarios for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists horarios_update on public.horarios;
create policy horarios_update on public.horarios for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists horarios_delete on public.horarios;
create policy horarios_delete on public.horarios for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === contactos (ahora por colegio, ya no global) ==============================================
drop policy if exists contactos_select on public.contactos;
create policy contactos_select on public.contactos for select to authenticated
  using ( public.es_super() or public.es_miembro_colegio(colegio_id) );
drop policy if exists contactos_insert on public.contactos;
create policy contactos_insert on public.contactos for insert to authenticated
  with check ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists contactos_update on public.contactos;
create policy contactos_update on public.contactos for update to authenticated
  using ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) )
  with check ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );
drop policy if exists contactos_delete on public.contactos;
create policy contactos_delete on public.contactos for delete to authenticated
  using ( public.es_super() or public.es_admin_any() or public.es_colegio_admin_de(colegio_id) );

-- === alertas =====================================================================================
drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists alertas_insert on public.alertas;
create policy alertas_insert on public.alertas for insert to authenticated
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists alertas_update on public.alertas;
create policy alertas_update on public.alertas for update to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists alertas_delete on public.alertas;
create policy alertas_delete on public.alertas for delete to authenticated
  using ( public.es_super() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );

-- === codigos_invitacion ===========================================================================
drop policy if exists codigos_invitacion_select on public.codigos_invitacion;
create policy codigos_invitacion_select on public.codigos_invitacion for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists codigos_invitacion_insert on public.codigos_invitacion;
create policy codigos_invitacion_insert on public.codigos_invitacion for insert to authenticated
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists codigos_invitacion_update on public.codigos_invitacion;
create policy codigos_invitacion_update on public.codigos_invitacion for update to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) )
  with check ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists codigos_invitacion_delete on public.codigos_invitacion;
create policy codigos_invitacion_delete on public.codigos_invitacion for delete to authenticated
  using ( public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );


-- -----------------------------------------------------------------------------
-- 5) RLS: encuestas / encuesta_opciones (encuestas.sql + encuestas-recuperar-y-editar.sql)
-- -----------------------------------------------------------------------------

drop policy if exists encuestas_select on public.encuestas;
create policy encuestas_select on public.encuestas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists encuestas_insert on public.encuestas;
create policy encuestas_insert on public.encuestas for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) );
drop policy if exists encuestas_update on public.encuestas;
create policy encuestas_update on public.encuestas for update to authenticated
  using (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
  )
  with check (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
  );
drop policy if exists encuestas_delete on public.encuestas;
create policy encuestas_delete on public.encuestas for delete to authenticated
  using (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
  );

drop policy if exists encuesta_opciones_select on public.encuesta_opciones;
create policy encuesta_opciones_select on public.encuesta_opciones for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id)) );
drop policy if exists encuesta_opciones_insert on public.encuesta_opciones;
create policy encuesta_opciones_insert on public.encuesta_opciones for insert to authenticated
  with check (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id)) or exists (
      select 1 from public.encuestas e
      where e.id = encuesta_id
        and (e.creado_por = public.mi_usuario_id() or public.es_admin_curso(e.curso_id))
    )
  );
-- encuesta_opciones_delete (agregado en encuestas-recuperar-y-editar.sql): mismo
-- criterio + colegio_admin, conservando el requisito de "0 votos".
drop policy if exists encuesta_opciones_delete on public.encuesta_opciones;
create policy encuesta_opciones_delete on public.encuesta_opciones for delete to authenticated
  using (
    (
      public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id))
      or exists (
        select 1 from public.encuestas e
        where e.id = encuesta_id
          and (e.creado_por = public.mi_usuario_id() or public.es_admin_curso(e.curso_id))
      )
    )
    and not exists (
      select 1 from public.encuesta_votos v where v.encuesta_id = encuesta_opciones.encuesta_id
    )
  );

drop policy if exists encuesta_votos_select on public.encuesta_votos;
create policy encuesta_votos_select on public.encuesta_votos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id)) );
-- insert/update/delete de encuesta_votos: sin cambios (solo la fila propia,
-- ver encuestas.sql) — un colegio_admin no vota por otro.

-- =============================================================================
-- FIN. Con ningún usuario `colegio_admin` todavía creado, ninguna policy de
-- arriba cambia de resultado para nadie (la nueva condición es siempre falsa).
-- Verificar creando un colegio_admin de prueba y confirmando que:
--   1) ve únicamente los cursos/usuarios/alumnos/maestros de su colegio_id,
--   2) 0 filas al pedir un curso/alumno de otro colegio,
--   3) super sigue viendo todo, sin restricción, como siempre.
-- =============================================================================
