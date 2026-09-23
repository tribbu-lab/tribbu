-- supabase/lecturas-y-adopcion.sql
--
-- Confirmación de lectura y adopción de la app.
--
-- 1) lecturas_de_recordatorios(ids): para cada aviso, la lista de familias
--    destinatarias con si lo leyó (y cuándo) y si tiene la app instalada.
--    La ven: quien publicó el aviso, el Room Parent del curso, y el colegio
--    (super / colegio_admin). Las familias siguen viendo solo su propio
--    leído, como hasta ahora — por eso esto es una RPC con el chequeo de
--    permisos adentro, y no se abren las policies de recordatorio_leidos ni
--    de push_tokens (que son privadas de cada usuario).
--
-- 2) adopcion_por_curso(ids): por curso, cuántas familias hay, cuántas
--    tienen la app instalada (push_tokens), cuántas sincronizaron el
--    calendario (el feed ICS registró alguna lectura) y cuántas entraron en
--    los últimos 30 días. Mismos permisos (Room Parent del curso o colegio).
--
-- "Familia" = usuario activo con al menos un hijo en el curso (usuario_hijos
-- → hijos.curso_id). Un aviso personal (para_usuario_id) tiene como único
-- destinatario a esa persona. Quien publicó el aviso no cuenta.
--
-- Correr una vez, después de rls-hardening.sql, multi-colegio.sql y
-- calendar-feed-lecturas.sql.

create or replace function public.puede_ver_lecturas(p_curso uuid, p_creado_por uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_admin_curso(p_curso)
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
$$;

create or replace function public.lecturas_de_recordatorios(p_ids uuid[])
returns table (
  recordatorio_id uuid,
  usuario_id uuid,
  nombre text,
  apellido text,
  hijos text,
  leido_en timestamptz,
  tiene_app boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with recs as (
    select r.id, r.curso_id, r.creado_por, r.para_usuario_id
    from public.recordatorios r
    where r.id = any(p_ids)
      and public.puede_ver_lecturas(r.curso_id, r.creado_por)
  ),
  destinatarios as (
    -- aviso para todo el curso: las familias con hijos en ese curso
    select r.id as recordatorio_id, u.id as usuario_id,
           string_agg(distinct h.nombre, ', ') as hijos
    from recs r
    join public.hijos h on h.curso_id = r.curso_id
    join public.usuario_hijos uh on uh.hijo_id = h.id
    join public.usuarios u on u.id = uh.usuario_id
    where r.para_usuario_id is null
      and coalesce(u.activo, true)
      and u.id is distinct from r.creado_por
    group by r.id, u.id
    union all
    -- aviso personal: solo esa persona
    select r.id, r.para_usuario_id, null
    from recs r
    where r.para_usuario_id is not null
  )
  select d.recordatorio_id, u.id, u.nombre, u.apellido, d.hijos,
         rl.leido_en,
         exists (select 1 from public.push_tokens pt where pt.usuario_id = u.id) as tiene_app
  from destinatarios d
  join public.usuarios u on u.id = d.usuario_id
  left join public.recordatorio_leidos rl
    on rl.recordatorio_id = d.recordatorio_id and rl.usuario_id = d.usuario_id
  order by d.recordatorio_id, (rl.leido_en is null) desc, u.nombre, u.apellido
$$;

create or replace function public.adopcion_por_curso(p_ids uuid[])
returns table (
  curso_id uuid,
  familias int,
  con_app int,
  con_calendario int,
  activas_30d int
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with fam as (
    select distinct h.curso_id, u.id as usuario_id, u.auth_id
    from public.hijos h
    join public.usuario_hijos uh on uh.hijo_id = h.id
    join public.usuarios u on u.id = uh.usuario_id
    where h.curso_id = any(p_ids)
      and coalesce(u.activo, true)
      and public.puede_ver_lecturas(h.curso_id, null)
  )
  select f.curso_id,
         count(*)::int,
         count(*) filter (where exists (select 1 from public.push_tokens pt where pt.usuario_id = f.usuario_id))::int,
         count(*) filter (where exists (select 1 from public.usuario_calendar_tokens t where t.usuario_id = f.usuario_id and t.leido_en is not null))::int,
         count(*) filter (where exists (select 1 from auth.users au where au.id = f.auth_id and au.last_sign_in_at > now() - interval '30 days'))::int
  from fam f
  group by f.curso_id
$$;

revoke all on function public.lecturas_de_recordatorios(uuid[]) from public, anon;
revoke all on function public.adopcion_por_curso(uuid[]) from public, anon;
grant execute on function public.lecturas_de_recordatorios(uuid[]) to authenticated;
grant execute on function public.adopcion_por_curso(uuid[]) to authenticated;
