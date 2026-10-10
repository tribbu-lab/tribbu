-- =============================================================================
-- mensajes-docentes.sql · Mensajes con las maestras y con Secretaría
-- =============================================================================
-- Ver specs/mensajes.md (decisiones 2026-10-10). Correr DESPUÉS de mensajes.sql.
--
--   · Rol nuevo `docente` (usuarios.rol): una cuenta vinculada a una ficha de
--     maestros (maestros.usuario_id). La crea el colegio desde Super Admin →
--     Maestros → "Acceso a Mensajes". Solo ve Mensajes.
--   · Conversación tipo `docente`: UN hilo por alumno × maestra. Lo ven los
--     apoderados del alumno, la docente y los colegio_admin de ese colegio
--     (decisión: el colegio puede leer los chats institucionales). Escriben
--     solo los apoderados y la docente.
--   · Conversación tipo `colegio` ("Secretaría"): UN hilo por alumno, lo
--     atienden los colegio_admin (fase 3 del spec).
--   · Los chats entre familias (directo/curso) siguen sin acceso del colegio.
--
-- Idempotente.
-- =============================================================================

-- 1) Rol docente ---------------------------------------------------------------
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre','admin','room','super','colegio_admin','docente']));

alter table public.maestros add column if not exists usuario_id uuid references public.usuarios(id) on delete set null;
create unique index if not exists maestros_usuario_uq on public.maestros (usuario_id) where usuario_id is not null;

-- 2) Conversación tipo docente --------------------------------------------------
alter table public.conversaciones add column if not exists maestro_id uuid references public.maestros(id) on delete cascade;
alter table public.conversaciones drop constraint if exists conversaciones_tipo_check;
alter table public.conversaciones add constraint conversaciones_tipo_check
  check (tipo in ('directo','curso','colegio','soporte','docente'));
alter table public.conversaciones drop constraint if exists conversaciones_forma;
alter table public.conversaciones add constraint conversaciones_forma check (
     (tipo = 'directo' and curso_id is not null and usuario_a is not null
        and usuario_b is not null and usuario_a < usuario_b)
  or (tipo = 'curso'   and curso_id is not null)
  or (tipo = 'colegio' and curso_id is not null and hijo_id is not null and colegio_id is not null)
  or (tipo = 'docente' and curso_id is not null and hijo_id is not null and colegio_id is not null and maestro_id is not null)
  or (tipo = 'soporte' and usuario_id is not null)
);
create unique index if not exists conversaciones_docente_uq on public.conversaciones (hijo_id, maestro_id) where tipo = 'docente';

alter table public.mensajes drop constraint if exists mensajes_rol_autor_check;
alter table public.mensajes add constraint mensajes_rol_autor_check
  check (rol_autor in ('usuario','soporte','colegio','docente'));

-- 3) Helpers --------------------------------------------------------------------
create or replace function public.es_docente_de(p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(select 1 from public.maestros m where m.id = p_maestro and m.usuario_id = public.mi_usuario_id())
$$;

-- Versión con maestro (reemplaza a la de 7 parámetros).
create or replace function public.puede_ver_conversacion(
  p_tipo text, p_curso uuid, p_colegio uuid, p_hijo uuid, p_a uuid, p_b uuid, p_usuario uuid, p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'directo' then public.mi_usuario_id() in (p_a, p_b)
    when 'curso'   then public.es_miembro_curso(p_curso)
    when 'colegio' then public.es_padre_de(p_hijo) or public.es_colegio_admin_de(p_colegio)
    when 'docente' then public.es_padre_de(p_hijo) or public.es_docente_de(p_maestro) or public.es_colegio_admin_de(p_colegio)
    when 'soporte' then p_usuario = public.mi_usuario_id() or public.es_super()
    else false
  end
$$;

create or replace function public.es_miembro_conversacion(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id, c.maestro_id)
    from public.conversaciones c where c.id = p_conv
  ), false)
$$;

create or replace function public.puede_escribir_conversacion(p_conv uuid)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  c  public.conversaciones;
  yo uuid := public.mi_usuario_id();
  otro uuid;
begin
  select * into c from public.conversaciones where id = p_conv;
  if not found or yo is null then return false; end if;
  if c.tipo = 'docente' then
    -- el colegio puede leer, pero escriben solo la familia y la docente
    return public.es_padre_de(c.hijo_id) or public.es_docente_de(c.maestro_id);
  end if;
  if not public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id, c.maestro_id) then
    return false;
  end if;
  if c.tipo in ('directo','curso')
     and not exists (select 1 from public.normas_chat_aceptadas where usuario_id = yo) then
    return false;
  end if;
  if c.tipo = 'directo' then
    otro := case when c.usuario_a = yo then c.usuario_b else c.usuario_a end;
    if exists (select 1 from public.usuario_bloqueos
               where (usuario_id = otro and bloqueado_id = yo)
                  or (usuario_id = yo and bloqueado_id = otro)) then
      return false;
    end if;
  end if;
  return true;
end $$;

drop policy if exists conversaciones_select on public.conversaciones;
create policy conversaciones_select on public.conversaciones for select to authenticated
  using (public.puede_ver_conversacion(tipo, curso_id, colegio_id, hijo_id, usuario_a, usuario_b, usuario_id, maestro_id));

drop function if exists public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid);

-- rol_autor: también 'docente'
create or replace function public.mensajes_antes_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare c public.conversaciones;
begin
  new.autor_id := public.mi_usuario_id();
  new.creado_en := now();
  new.editado_en := null;
  new.borrado_en := null;
  select * into c from public.conversaciones where id = new.conversacion_id;
  new.rol_autor := case
    when c.tipo = 'soporte' and new.autor_id is distinct from c.usuario_id then 'soporte'
    when c.tipo = 'colegio' and not public.es_padre_de(c.hijo_id) then 'colegio'
    when c.tipo = 'docente' and public.es_docente_de(c.maestro_id) and not public.es_padre_de(c.hijo_id) then 'docente'
    else 'usuario'
  end;
  return new;
end $$;

-- Destinatarios de push: en `docente` la familia y la docente (el colegio lee
-- pero no recibe push de cada mensaje).
create or replace function public.miembros_conversacion(p_conv uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  with c as (select * from public.conversaciones where id = p_conv)
  select u.id from c join public.usuarios u on u.id in (c.usuario_a, c.usuario_b) where c.tipo = 'directo'
  union
  select uc.usuario_id from c join public.usuario_cursos uc on uc.curso_id = c.curso_id where c.tipo = 'curso'
  union
  select uh.usuario_id from c join public.hijos h on h.curso_id = c.curso_id
    join public.usuario_hijos uh on uh.hijo_id = h.id where c.tipo = 'curso'
  union
  select uh.usuario_id from c join public.usuario_hijos uh on uh.hijo_id = c.hijo_id where c.tipo in ('colegio','docente')
  union
  select u.id from c join public.usuarios u on u.rol = 'colegio_admin' and u.colegio_id = c.colegio_id where c.tipo = 'colegio'
  union
  select m.usuario_id from c join public.maestros m on m.id = c.maestro_id where c.tipo = 'docente' and m.usuario_id is not null
  union
  select c.usuario_id from c where c.tipo = 'soporte'
  union
  select u.id from c join public.usuarios u on u.rol = 'super' where c.tipo = 'soporte'
$$;
revoke all on function public.miembros_conversacion(uuid) from public, anon, authenticated;
grant execute on function public.miembros_conversacion(uuid) to service_role;

-- 4) Lista: suma Secretaría y maestras (lado familia) y familias (lado docente)
create or replace function public.mis_conversaciones()
returns table (
  id uuid, tipo text, curso_id uuid, hijo_id uuid, otro_id uuid,
  titulo text, subtitulo text, estado text,
  ultimo_texto text, ultimo_fotos int, ultimo_autor_id uuid, ultimo_borrado boolean,
  ultimo_en timestamptz, no_leidos int, silenciado boolean, bloqueado boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with yo as (select public.mi_usuario_id() as uid),
  bloq as (select b.bloqueado_id from public.usuario_bloqueos b, yo where b.usuario_id = yo.uid),
  convs as (
    select c.*,
      case when c.tipo = 'directo' then case when c.usuario_a = yo.uid then c.usuario_b else c.usuario_a end end as otro,
      (c.tipo = 'docente' and public.es_docente_de(c.maestro_id)) as soy_docente
    from public.conversaciones c, yo
    where (c.tipo = 'directo' and yo.uid in (c.usuario_a, c.usuario_b) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'curso'   and public.es_miembro_curso(c.curso_id))
       or (c.tipo = 'colegio' and public.es_padre_de(c.hijo_id) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'docente' and (public.es_padre_de(c.hijo_id) or public.es_docente_de(c.maestro_id)) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'soporte' and c.usuario_id = yo.uid and c.ultimo_mensaje_en is not null)
  )
  select
    c.id, c.tipo, c.curso_id, c.hijo_id, c.otro,
    case c.tipo
      when 'directo' then public.nombre_usuario(c.otro)
      when 'curso'   then 'Grupo ' || cu.nombre
      when 'colegio' then 'Secretaría'
      when 'docente' then case when c.soy_docente
                              then 'Familia de ' || btrim(h.nombre || ' ' || coalesce(h.apellido, ''))
                              else btrim(ma.nombre || ' ' || coalesce(ma.apellido, '')) end
      else 'Soporte tribbu'
    end,
    case c.tipo
      when 'directo' then public.familia_de(c.otro)
      when 'colegio' then 'Sobre ' || h.nombre || coalesce(' · ' || co.nombre, '')
      when 'docente' then case when c.soy_docente then cu.nombre
                              else coalesce(ma.materia || ' · ', '') || 'Sobre ' || h.nombre end
      else null
    end,
    c.estado,
    um.texto, coalesce(jsonb_array_length(um.fotos), 0), um.autor_id, um.borrado_en is not null,
    coalesce(c.ultimo_mensaje_en, c.creado_en),
    (select count(*)::int from public.mensajes m
      where m.conversacion_id = c.id
        and m.creado_en > coalesce(cm.ultimo_leido_en, '-infinity'::timestamptz)
        and m.autor_id is distinct from yo.uid
        and m.borrado_en is null
        and (m.autor_id is null or m.autor_id not in (select bloqueado_id from bloq))),
    coalesce(cm.silenciado, false),
    c.tipo = 'directo' and c.otro in (select bloqueado_id from bloq)
  from convs c
  cross join yo
  left join public.conversacion_miembros cm on cm.conversacion_id = c.id and cm.usuario_id = yo.uid
  left join public.cursos cu on cu.id = c.curso_id
  left join public.colegios co on co.id = c.colegio_id
  left join public.hijos h on h.id = c.hijo_id
  left join public.maestros ma on ma.id = c.maestro_id
  left join lateral (
    select m.texto, m.fotos, m.autor_id, m.borrado_en from public.mensajes m
    where m.conversacion_id = c.id
      and (m.autor_id is null or m.autor_id not in (select bloqueado_id from bloq))
    order by m.creado_en desc limit 1
  ) um on true
  order by coalesce(c.ultimo_mensaje_en, c.creado_en) desc
$$;

-- 5) RPCs nuevas -----------------------------------------------------------------

-- Maestras de los cursos de mis hijos (para "Nuevo mensaje" → Maestras).
create or replace function public.docentes_para_mensaje()
returns table (hijo_id uuid, hijo_nombre text, curso_id uuid, maestro_id uuid,
               nombre text, apellido text, materia text, tiene_cuenta boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.curso_id, m.id, m.nombre, m.apellido, m.materia, m.usuario_id is not null
  from public.usuario_hijos uh
  join public.hijos h on h.id = uh.hijo_id
  join public.maestro_cursos mc on mc.curso_id = h.curso_id
  join public.maestros m on m.id = mc.maestro_id and coalesce(m.activo, true)
  where uh.usuario_id = public.mi_usuario_id()
  order by h.nombre, m.nombre, m.apellido
$$;

-- Alumnos de la docente (para que ella pueda iniciar un hilo con una familia).
create or replace function public.alumnos_para_docente()
returns table (hijo_id uuid, nombre text, apellido text, curso_id uuid, curso_nombre text, maestro_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.apellido, h.curso_id, cu.nombre, m.id
  from public.maestros m
  join public.maestro_cursos mc on mc.maestro_id = m.id
  join public.cursos cu on cu.id = mc.curso_id
  join public.colegios co on co.id = cu.colegio_id and cu."año_lectivo" = co."año_lectivo_actual"
  join public.hijos h on h.curso_id = cu.id
  where m.usuario_id = public.mi_usuario_id()
    and exists (select 1 from public.usuario_hijos uh where uh.hijo_id = h.id)
  order by cu.nombre, h.apellido, h.nombre
$$;

create or replace function public.abrir_conversacion_docente(p_hijo uuid, p_maestro uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_curso uuid; v_id uuid; v_cuenta uuid;
begin
  if not (public.es_padre_de(p_hijo) or public.es_docente_de(p_maestro)) then
    raise exception 'Sin permiso';
  end if;
  select h.curso_id into v_curso from public.hijos h where h.id = p_hijo;
  if v_curso is null or not exists (select 1 from public.maestro_cursos where maestro_id = p_maestro and curso_id = v_curso) then
    raise exception 'Esa docente no da clase en el curso del alumno';
  end if;
  select usuario_id into v_cuenta from public.maestros where id = p_maestro;
  if v_cuenta is null then
    raise exception 'Esta docente todavía no usa tribbu';
  end if;
  select id into v_id from public.conversaciones where tipo = 'docente' and hijo_id = p_hijo and maestro_id = p_maestro;
  if v_id is not null then return v_id; end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, hijo_id, maestro_id)
  values ('docente', v_curso, public.colegio_de_curso(v_curso), p_hijo, p_maestro)
  on conflict (hijo_id, maestro_id) where tipo = 'docente' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'docente' and hijo_id = p_hijo and maestro_id = p_maestro;
  end if;
  return v_id;
end $$;

create or replace function public.abrir_conversacion_colegio(p_hijo uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_curso uuid; v_colegio uuid; v_id uuid;
begin
  select h.curso_id into v_curso from public.hijos h where h.id = p_hijo;
  v_colegio := public.colegio_de_curso(v_curso);
  if v_curso is null or not (public.es_padre_de(p_hijo) or public.es_colegio_admin_de(v_colegio)) then
    raise exception 'Sin permiso';
  end if;
  select id into v_id from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo;
  if v_id is not null then return v_id; end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, hijo_id)
  values ('colegio', v_curso, v_colegio, p_hijo)
  on conflict (hijo_id) where tipo = 'colegio' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo;
  end if;
  return v_id;
end $$;

-- Nombre de quien firma cada mensaje en hilos con más de dos personas
-- (familia + docente/colegio, grupo del curso). Solo para miembros.
create or replace function public.autores_conversacion(p_conv uuid)
returns table (usuario_id uuid, nombre text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, ''))
  from public.mensajes m join public.usuarios u on u.id = m.autor_id
  where m.conversacion_id = p_conv and public.es_miembro_conversacion(p_conv)
$$;

-- Bandeja del colegio: Secretaría (responde el colegio) + hilos con docentes
-- (el colegio solo lee). Solo colegio_admin de ese colegio.
create or replace function public.bandeja_colegio()
returns table (
  id uuid, tipo text, hijo_id uuid, alumno text, curso text, curso_id uuid, docente text,
  ultimo_texto text, ultimo_fotos int, ultimo_rol_autor text, ultimo_en timestamptz,
  no_leidos int, sin_responder boolean
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare v_colegio uuid;
begin
  select u.colegio_id into v_colegio from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'colegio_admin';
  if v_colegio is null then raise exception 'Solo el colegio'; end if;
  return query
  with leido as (
    select cm.conversacion_id, max(cm.ultimo_leido_en) as en
    from public.conversacion_miembros cm
    join public.usuarios a on a.id = cm.usuario_id and a.rol = 'colegio_admin' and a.colegio_id = v_colegio
    group by cm.conversacion_id
  )
  select c.id, c.tipo, c.hijo_id, btrim(h.nombre || ' ' || coalesce(h.apellido, '')), cu.nombre, c.curso_id,
    case when c.tipo = 'docente' then btrim(ma.nombre || ' ' || coalesce(ma.apellido, '')) end,
    um.texto, coalesce(jsonb_array_length(um.fotos), 0), um.rol_autor, c.ultimo_mensaje_en,
    case when c.tipo = 'colegio' then
      (select count(*)::int from public.mensajes m
        where m.conversacion_id = c.id and m.rol_autor = 'usuario' and m.borrado_en is null
          and m.creado_en > coalesce(l.en, '-infinity'::timestamptz))
    else 0 end,
    c.tipo = 'colegio' and coalesce(um.rol_autor = 'usuario', false)
  from public.conversaciones c
  join public.hijos h on h.id = c.hijo_id
  join public.cursos cu on cu.id = c.curso_id
  left join public.maestros ma on ma.id = c.maestro_id
  left join leido l on l.conversacion_id = c.id
  left join lateral (
    select m.texto, m.fotos, m.rol_autor from public.mensajes m
    where m.conversacion_id = c.id order by m.creado_en desc limit 1
  ) um on true
  where c.colegio_id = v_colegio and c.tipo in ('colegio','docente') and c.ultimo_mensaje_en is not null
  order by c.ultimo_mensaje_en desc;
end $$;

-- 6) Permisos -------------------------------------------------------------------
revoke all on function public.es_docente_de(uuid) from public, anon;
revoke all on function public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.docentes_para_mensaje() from public, anon;
revoke all on function public.alumnos_para_docente() from public, anon;
revoke all on function public.abrir_conversacion_docente(uuid, uuid) from public, anon;
revoke all on function public.abrir_conversacion_colegio(uuid) from public, anon;
revoke all on function public.autores_conversacion(uuid) from public, anon;
revoke all on function public.bandeja_colegio() from public, anon;
grant execute on function
  public.es_docente_de(uuid),
  public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  public.docentes_para_mensaje(), public.alumnos_para_docente(),
  public.abrir_conversacion_docente(uuid, uuid), public.abrir_conversacion_colegio(uuid),
  public.autores_conversacion(uuid), public.bandeja_colegio()
to authenticated;
