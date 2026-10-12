-- =============================================================================
-- mensajes-grupos.sql · Grupo del curso, grupos propios y difusión (Fase C)
-- =============================================================================
-- Ver specs/docentes-clases-y-grupos.md. Correr después de mensajes.sql,
-- mensajes-docentes.sql y docentes.sql.
--
--   · Grupo del curso (tipo `curso`, ya modelado): uno por curso, creado
--     automáticamente (acá para los cursos existentes; trigger para los
--     nuevos). Miembros = es_miembro_curso (familias + Room Parent; ni
--     docentes ni colegio). Modera la Room Parent.
--   · Grupos propios (tipo `grupo`): los arma un apoderado con familias de
--     sus cursos. Membresía EXPLÍCITA en conversacion_participantes (es el
--     único tipo con lista de miembros guardada).
--   · Difusión: RPC enviar_difusion — el mismo texto a varias familias, cada
--     una en su 1 a 1 (respeta bloqueos y normas; máx. 50).
--
-- Idempotente.
-- =============================================================================

-- 1) Esquema -----------------------------------------------------------------
alter table public.conversaciones add column if not exists nombre text check (nombre is null or char_length(btrim(nombre)) between 1 and 60);
alter table public.conversaciones add column if not exists creado_por uuid references public.usuarios(id) on delete set null;

alter table public.conversaciones drop constraint if exists conversaciones_tipo_check;
alter table public.conversaciones add constraint conversaciones_tipo_check
  check (tipo in ('directo','curso','colegio','soporte','docente','grupo'));
alter table public.conversaciones drop constraint if exists conversaciones_forma;
alter table public.conversaciones add constraint conversaciones_forma check (
     (tipo = 'directo' and curso_id is not null and usuario_a is not null
        and usuario_b is not null and usuario_a < usuario_b)
  or (tipo = 'curso'   and curso_id is not null)
  or (tipo = 'colegio' and curso_id is not null and hijo_id is not null and colegio_id is not null)
  or (tipo = 'docente' and curso_id is not null and hijo_id is not null and colegio_id is not null and maestro_id is not null)
  or (tipo = 'grupo'   and curso_id is not null and nombre is not null)
  or (tipo = 'soporte' and usuario_id is not null)
);

create table if not exists public.conversacion_participantes (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  agregado_en     timestamptz not null default now(),
  primary key (conversacion_id, usuario_id)
);
create index if not exists conv_participantes_usuario on public.conversacion_participantes (usuario_id);
alter table public.conversacion_participantes enable row level security;

-- 2) Membresía: puede_ver_conversacion recibe también el id (para `grupo`) ---
create or replace function public.es_participante(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.conversacion_participantes
                 where conversacion_id = p_conv and usuario_id = public.mi_usuario_id())
$$;

create or replace function public.puede_ver_conversacion(
  p_tipo text, p_curso uuid, p_colegio uuid, p_hijo uuid, p_a uuid, p_b uuid, p_usuario uuid, p_maestro uuid, p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'directo' then public.mi_usuario_id() in (p_a, p_b)
    when 'curso'   then public.es_miembro_curso(p_curso)
    when 'grupo'   then public.es_participante(p_id)
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
    select public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id, c.maestro_id, c.id)
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
    return public.es_padre_de(c.hijo_id) or public.es_docente_de(c.maestro_id);
  end if;
  if not public.puede_ver_conversacion(c.tipo, c.curso_id, c.colegio_id, c.hijo_id, c.usuario_a, c.usuario_b, c.usuario_id, c.maestro_id, c.id) then
    return false;
  end if;
  if c.tipo in ('directo','curso','grupo')
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
  using (public.puede_ver_conversacion(tipo, curso_id, colegio_id, hijo_id, usuario_a, usuario_b, usuario_id, maestro_id, id));
drop function if exists public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid);

-- Participantes: los ven los miembros del grupo; se escriben por RPC.
drop policy if exists conv_participantes_select on public.conversacion_participantes;
create policy conv_participantes_select on public.conversacion_participantes for select to authenticated
  using (public.es_participante(conversacion_id));

-- Push: miembros de un grupo propio.
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
  select p.usuario_id from c join public.conversacion_participantes p on p.conversacion_id = c.id where c.tipo = 'grupo'
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

-- Moderación: Room Parent en el grupo del curso; quien creó un grupo propio.
create or replace function public.modera_conversacion(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(select 1 from public.conversaciones c
                where c.id = p_conv
                  and ((c.tipo = 'curso' and public.es_admin_curso(c.curso_id))
                    or (c.tipo = 'grupo' and c.creado_por = public.mi_usuario_id())))
$$;

-- 3) Grupo del curso automático -------------------------------------------------
insert into public.conversaciones (tipo, curso_id, colegio_id)
select 'curso', cu.id, cu.colegio_id from public.cursos cu
on conflict (curso_id) where tipo = 'curso' do nothing;

create or replace function public.cursos_crear_grupo()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  insert into public.conversaciones (tipo, curso_id, colegio_id) values ('curso', new.id, new.colegio_id)
  on conflict (curso_id) where tipo = 'curso' do nothing;
  return null;
end $$;
drop trigger if exists cursos_crear_grupo on public.cursos;
create trigger cursos_crear_grupo after insert on public.cursos
  for each row execute function public.cursos_crear_grupo();

-- 4) Lista de conversaciones (suma grupos; del curso aunque no tenga mensajes)
drop function if exists public.mis_conversaciones();
create function public.mis_conversaciones()
returns table (
  id uuid, tipo text, curso_id uuid, hijo_id uuid, otro_id uuid,
  titulo text, subtitulo text, estado text,
  ultimo_texto text, ultimo_fotos int, ultimo_autor_id uuid, ultimo_borrado boolean,
  ultimo_en timestamptz, no_leidos int, silenciado boolean, bloqueado boolean,
  modero boolean, creado_por uuid
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
       or (c.tipo = 'curso'   and public.es_miembro_curso(c.curso_id)
           and exists (select 1 from public.cursos cu join public.colegios co on co.id = cu.colegio_id
                       where cu.id = c.curso_id and cu."año_lectivo" >= co."año_lectivo_actual"))
       or (c.tipo = 'grupo'   and exists (select 1 from public.conversacion_participantes p where p.conversacion_id = c.id and p.usuario_id = yo.uid))
       or (c.tipo = 'colegio' and public.es_padre_de(c.hijo_id) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'docente' and (public.es_padre_de(c.hijo_id) or public.es_docente_de(c.maestro_id)) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'soporte' and c.usuario_id = yo.uid and c.ultimo_mensaje_en is not null)
  )
  select
    c.id, c.tipo, c.curso_id, c.hijo_id, c.otro,
    case c.tipo
      when 'directo' then public.nombre_usuario(c.otro)
      when 'curso'   then 'Grupo ' || split_part(cu.nombre, ' - ', 1)
      when 'grupo'   then c.nombre
      when 'colegio' then 'Secretaría'
      when 'docente' then case when c.soy_docente
                              then 'Familia de ' || btrim(h.nombre || ' ' || coalesce(h.apellido, ''))
                              else btrim(ma.nombre || ' ' || coalesce(ma.apellido, '')) end
      else 'Soporte tribbu'
    end,
    case c.tipo
      when 'directo' then public.familia_de(c.otro)
      when 'curso'   then 'Todas las familias de ' || cu.nombre
      when 'grupo'   then (select count(*) from public.conversacion_participantes p where p.conversacion_id = c.id)::text || ' participantes'
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
    c.tipo = 'directo' and c.otro in (select bloqueado_id from bloq),
    (c.tipo = 'curso' and public.es_admin_curso(c.curso_id)) or (c.tipo = 'grupo' and c.creado_por = yo.uid),
    c.creado_por
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
create or replace function public.mensajes_no_leidos_total()
returns int
language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(sum(no_leidos), 0)::int from public.mis_conversaciones() $$;

-- 5) RPCs: grupos propios -------------------------------------------------------

-- Valida que todos los usuarios compartan curso conmigo (y no sean docentes ni
-- me hayan bloqueado). Devuelve los ids válidos, sin repetidos y sin mí.
create or replace function public.validar_participantes(p_usuarios uuid[])
returns uuid[]
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); r uuid[];
begin
  select coalesce(array_agg(distinct u.id), '{}') into r
  from public.usuarios u
  where u.id = any(p_usuarios) and u.id <> yo and coalesce(u.activo, true)
    and coalesce(u.rol, 'padre') in ('padre','room','admin')
    and public.comparte_curso(u.id)
    and not exists (select 1 from public.usuario_bloqueos b where b.usuario_id = u.id and b.bloqueado_id = yo);
  return r;
end $$;

create or replace function public.crear_grupo(p_nombre text, p_usuarios uuid[])
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); v_curso uuid; v_id uuid; v_ok uuid[];
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  if not exists (select 1 from public.normas_chat_aceptadas where usuario_id = yo) then
    raise exception 'Primero aceptá las normas de convivencia';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'Poné un nombre al grupo'; end if;
  v_ok := public.validar_participantes(p_usuarios);
  if coalesce(array_length(v_ok, 1), 0) = 0 then raise exception 'Elegí al menos una familia de tus cursos'; end if;
  if array_length(v_ok, 1) > 49 then raise exception 'Un grupo puede tener hasta 50 personas'; end if;
  -- ancla de retención: el curso más nuevo del creador
  select cu.id into v_curso from public.cursos cu
  where cu.id in (select public.cursos_de_usuario(yo)) order by cu."año_lectivo" desc nulls last limit 1;
  insert into public.conversaciones (tipo, curso_id, colegio_id, nombre, creado_por)
  values ('grupo', v_curso, public.colegio_de_curso(v_curso), left(btrim(p_nombre), 60), yo)
  returning id into v_id;
  insert into public.conversacion_participantes (conversacion_id, usuario_id)
  select v_id, x from unnest(v_ok || yo) as x on conflict do nothing;
  return v_id;
end $$;

create or replace function public.editar_grupo(p_conv uuid, p_nombre text, p_agregar uuid[], p_quitar uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c public.conversaciones; v_ok uuid[];
begin
  select * into c from public.conversaciones where id = p_conv and tipo = 'grupo';
  if not found or c.creado_por is distinct from yo then raise exception 'Solo quien creó el grupo puede editarlo'; end if;
  if coalesce(btrim(p_nombre), '') <> '' then
    update public.conversaciones set nombre = left(btrim(p_nombre), 60) where id = p_conv;
  end if;
  if p_quitar is not null then
    delete from public.conversacion_participantes where conversacion_id = p_conv and usuario_id = any(p_quitar) and usuario_id <> yo;
  end if;
  if p_agregar is not null then
    v_ok := public.validar_participantes(p_agregar);
    insert into public.conversacion_participantes (conversacion_id, usuario_id)
    select p_conv, x from unnest(v_ok) as x on conflict do nothing;
    if (select count(*) from public.conversacion_participantes where conversacion_id = p_conv) > 50 then
      raise exception 'Un grupo puede tener hasta 50 personas';
    end if;
  end if;
end $$;

create or replace function public.salir_de_grupo(p_conv uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c public.conversaciones; v_nuevo uuid;
begin
  select * into c from public.conversaciones where id = p_conv and tipo = 'grupo';
  if not found then raise exception 'Grupo inexistente'; end if;
  delete from public.conversacion_participantes where conversacion_id = p_conv and usuario_id = yo;
  -- si se va quien lo creó, el grupo pasa al participante más antiguo
  if c.creado_por = yo then
    select usuario_id into v_nuevo from public.conversacion_participantes
    where conversacion_id = p_conv order by agregado_en limit 1;
    if v_nuevo is null then
      delete from public.conversaciones where id = p_conv;  -- quedó vacío
    else
      update public.conversaciones set creado_por = v_nuevo where id = p_conv;
    end if;
  end if;
end $$;

create or replace function public.participantes_grupo(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text, es_creador boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, public.nombre_usuario(u.id), public.familia_de(u.id), c.creado_por = u.id
  from public.conversacion_participantes p
  join public.conversaciones c on c.id = p.conversacion_id
  join public.usuarios u on u.id = p.usuario_id
  where p.conversacion_id = p_conv and public.es_participante(p_conv)
  order by (c.creado_por = u.id) desc, u.nombre
$$;

-- 6) Difusión ---------------------------------------------------------------------
create or replace function public.enviar_difusion(p_usuarios uuid[], p_texto text)
returns table (enviados int, omitidos int)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  v_ok uuid[]; u uuid; v_conv uuid; n_ok int := 0; n_total int;
  t text := left(btrim(coalesce(p_texto, '')), 2000);
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  if t = '' then raise exception 'Escribí el mensaje'; end if;
  if not exists (select 1 from public.normas_chat_aceptadas where usuario_id = yo) then
    raise exception 'Primero aceptá las normas de convivencia';
  end if;
  n_total := coalesce(array_length(p_usuarios, 1), 0);
  if n_total > 50 then raise exception 'Podés mandar a hasta 50 familias por vez'; end if;
  v_ok := public.validar_participantes(p_usuarios);
  foreach u in array v_ok loop
    -- tampoco a quien bloqueé yo
    continue when exists (select 1 from public.usuario_bloqueos where usuario_id = yo and bloqueado_id = u);
    begin
      v_conv := public.abrir_conversacion_directa(u);
      insert into public.mensajes (conversacion_id, texto) values (v_conv, t);
      n_ok := n_ok + 1;
    exception when others then
      null; -- se cuenta como omitido
    end;
  end loop;
  return query select n_ok, n_total - n_ok;
end $$;

-- 7) Permisos ---------------------------------------------------------------------
revoke all on function public.es_participante(uuid) from public, anon;
revoke all on function public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.validar_participantes(uuid[]) from public, anon, authenticated;
revoke all on function public.crear_grupo(text, uuid[]) from public, anon;
revoke all on function public.editar_grupo(uuid, text, uuid[], uuid[]) from public, anon;
revoke all on function public.salir_de_grupo(uuid) from public, anon;
revoke all on function public.participantes_grupo(uuid) from public, anon;
revoke all on function public.enviar_difusion(uuid[], text) from public, anon;
revoke all on function public.mis_conversaciones() from public, anon;
grant execute on function
  public.es_participante(uuid),
  public.puede_ver_conversacion(text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  public.crear_grupo(text, uuid[]), public.editar_grupo(uuid, text, uuid[], uuid[]),
  public.salir_de_grupo(uuid), public.participantes_grupo(uuid), public.enviar_difusion(uuid[], text),
  public.mis_conversaciones()
to authenticated;
