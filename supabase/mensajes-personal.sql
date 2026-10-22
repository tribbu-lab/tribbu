-- =============================================================================
-- Mensajes entre el personal del colegio (2026-10-22)
--
-- Maestras (rol docente), Secretarías/Direcciones por nivel (nivel_admin) y el
-- administrador (colegio_admin) del MISMO colegio pueden escribirse:
--   * 1 a 1  → conversaciones.tipo = 'personal', nombre null, usuario_a < usuario_b
--   * grupos → tipo 'personal' con nombre (lo crea cualquiera del personal)
-- La membresía es explícita (conversacion_participantes), igual que los grupos
-- de familias, así que si alguien deja el colegio deja de ver el chat al
-- quitarlo. Ninguna familia puede entrar ni verlos (validar_personal), y el
-- colegio no lee los chats del personal en los que no participa.
-- No se requieren las normas de convivencia (son para escribirle a familias) y
-- la retención por año lectivo no los toca (mensajes-retencion solo limpia
-- directo/curso/colegio/docente/grupo).
--
-- Idempotente.
-- =============================================================================

-- 1) Esquema -----------------------------------------------------------------
alter table public.conversaciones drop constraint if exists conversaciones_tipo_check;
alter table public.conversaciones add constraint conversaciones_tipo_check
  check (tipo in ('directo','curso','colegio','soporte','docente','grupo','personal'));
alter table public.conversaciones drop constraint if exists conversaciones_forma;
alter table public.conversaciones add constraint conversaciones_forma check (
     (tipo = 'directo' and curso_id is not null and usuario_a is not null
        and usuario_b is not null and usuario_a < usuario_b)
  or (tipo = 'curso'   and curso_id is not null)
  or (tipo = 'colegio' and curso_id is not null and hijo_id is not null and colegio_id is not null)
  or (tipo = 'docente' and curso_id is not null and hijo_id is not null and colegio_id is not null and maestro_id is not null)
  or (tipo = 'grupo'   and curso_id is not null and nombre is not null)
  or (tipo = 'soporte' and usuario_id is not null)
  or (tipo = 'personal' and colegio_id is not null
        and (nombre is not null
             or (usuario_a is not null and usuario_b is not null and usuario_a < usuario_b)))
);
create unique index if not exists conversaciones_personal_uq
  on public.conversaciones (usuario_a, usuario_b) where tipo = 'personal' and nombre is null;

-- 2) Quién es personal -------------------------------------------------------
create or replace function public.es_personal_de_colegio(p_usuario uuid, p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.usuarios u
                 where u.id = p_usuario and u.colegio_id = p_colegio
                   and u.rol in ('docente','colegio_admin','nivel_admin')
                   and coalesce(u.activo, true))
$$;

-- colegio del usuario actual si es personal (si no, null)
create or replace function public.mi_colegio_personal()
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.colegio_id from public.usuarios u
  where u.id = public.mi_usuario_id() and u.rol in ('docente','colegio_admin','nivel_admin')
    and coalesce(u.activo, true)
$$;

-- "Administración" / "Dirección · Primaria" / "Docente · Inglés, Música"
create or replace function public.cargo_personal(p_usuario uuid)
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select case u.rol
    when 'colegio_admin' then 'Administración'
    when 'nivel_admin' then coalesce(nullif(btrim(u.cargo), ''), 'Secretaría')
      || coalesce(' · ' || (select string_agg(initcap(n), ', ' order by array_position(array['inicial','primaria','secundaria'], n))
                            from unnest(u.niveles) n), '')
    when 'docente' then 'Docente'
      || coalesce(' · ' || nullif((select string_agg(nullif(btrim(m.materia), ''), ', ') from public.maestros m where m.usuario_id = u.id), ''), '')
  end
  from public.usuarios u where u.id = p_usuario
$$;

create or replace function public.validar_personal(p_usuarios uuid[], p_colegio uuid)
returns uuid[]
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct x), '{}')
  from unnest(coalesce(p_usuarios, '{}')) x
  where x <> public.mi_usuario_id() and public.es_personal_de_colegio(x, p_colegio)
$$;

-- 3) Membresía y permisos ----------------------------------------------------
create or replace function public.puede_ver_conversacion(
  p_tipo text, p_curso uuid, p_colegio uuid, p_hijo uuid, p_a uuid, p_b uuid, p_usuario uuid, p_maestro uuid, p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select case p_tipo
    when 'directo' then public.mi_usuario_id() in (p_a, p_b)
    when 'curso'   then public.es_miembro_curso(p_curso)
    when 'grupo'   then public.es_participante(p_id)
    when 'personal' then public.es_participante(p_id)
    when 'colegio' then public.es_padre_de(p_hijo) or public.es_colegio_admin_de(p_colegio) or public.es_secretaria_de_hijo(p_hijo)
    when 'docente' then public.es_padre_de(p_hijo) or public.es_docente_de(p_maestro) or public.es_colegio_admin_de(p_colegio) or public.es_secretaria_de_hijo(p_hijo)
    when 'soporte' then p_usuario = public.mi_usuario_id() or public.es_super()
    else false
  end
$$;

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
  select p.usuario_id from c join public.conversacion_participantes p on p.conversacion_id = c.id where c.tipo in ('grupo','personal')
  union
  select uh.usuario_id from c join public.usuario_hijos uh on uh.hijo_id = c.hijo_id where c.tipo in ('colegio','docente')
  union
  select u.id from c join public.usuarios u on u.rol = 'colegio_admin' and u.colegio_id = c.colegio_id where c.tipo = 'colegio'
  union
  select u.id from c join public.hijos h on h.id = c.hijo_id join public.cursos cu on cu.id = h.curso_id
    join public.usuarios u on u.rol = 'nivel_admin' and u.colegio_id = cu.colegio_id and cu.nivel = any(u.niveles)
    where c.tipo = 'colegio'
  union
  select m.usuario_id from c join public.maestros m on m.id = c.maestro_id where c.tipo = 'docente' and m.usuario_id is not null
  union
  select c.usuario_id from c where c.tipo = 'soporte'
  union
  select u.id from c join public.usuarios u on u.rol = 'super' where c.tipo = 'soporte'
$$;

create or replace function public.modera_conversacion(p_conv uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(select 1 from public.conversaciones c
                where c.id = p_conv
                  and ((c.tipo = 'curso' and public.es_admin_curso(c.curso_id))
                    or (c.tipo in ('grupo','personal') and c.nombre is not null and c.creado_por = public.mi_usuario_id())))
$$;

-- 4) Abrir un 1 a 1 y crear un grupo del personal ---------------------------
create or replace function public.personal_para_mensaje()
returns table (usuario_id uuid, nombre text, cargo text, rol text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, public.nombre_usuario(u.id), public.cargo_personal(u.id), u.rol
  from public.usuarios u
  where public.mi_colegio_personal() is not null
    and u.colegio_id = public.mi_colegio_personal()
    and u.id <> public.mi_usuario_id()
    and u.rol in ('docente','colegio_admin','nivel_admin')
    and coalesce(u.activo, true)
  order by case u.rol when 'colegio_admin' then 0 when 'nivel_admin' then 1 else 2 end, u.nombre, u.apellido
$$;

create or replace function public.abrir_conversacion_personal(p_usuario uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); v_col uuid := public.mi_colegio_personal(); a uuid; b uuid; v_id uuid;
begin
  if v_col is null then raise exception 'Solo el personal del colegio'; end if;
  if p_usuario is null or p_usuario = yo or not public.es_personal_de_colegio(p_usuario, v_col) then
    raise exception 'Solo podés escribirle a alguien del personal de tu colegio';
  end if;
  a := least(yo, p_usuario); b := greatest(yo, p_usuario);
  select id into v_id from public.conversaciones
  where tipo = 'personal' and nombre is null and usuario_a = a and usuario_b = b;
  if v_id is null then
    insert into public.conversaciones (tipo, colegio_id, usuario_a, usuario_b, creado_por)
    values ('personal', v_col, a, b, yo)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversaciones
      where tipo = 'personal' and nombre is null and usuario_a = a and usuario_b = b;
    end if;
  end if;
  insert into public.conversacion_participantes (conversacion_id, usuario_id)
  values (v_id, a), (v_id, b) on conflict do nothing;
  return v_id;
end $$;

create or replace function public.crear_grupo_personal(p_nombre text, p_usuarios uuid[])
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); v_col uuid := public.mi_colegio_personal(); v_ok uuid[]; v_id uuid;
begin
  if v_col is null then raise exception 'Solo el personal del colegio'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'Poné un nombre al grupo'; end if;
  v_ok := public.validar_personal(p_usuarios, v_col);
  if coalesce(array_length(v_ok, 1), 0) = 0 then raise exception 'Elegí al menos una persona del personal'; end if;
  if array_length(v_ok, 1) > 49 then raise exception 'Un grupo puede tener hasta 50 personas'; end if;
  insert into public.conversaciones (tipo, colegio_id, nombre, creado_por)
  values ('personal', v_col, left(btrim(p_nombre), 60), yo)
  returning id into v_id;
  insert into public.conversacion_participantes (conversacion_id, usuario_id)
  select v_id, x from unnest(v_ok || yo) as x on conflict do nothing;
  return v_id;
end $$;

-- 5) Editar / salir / eliminar sirven también para los grupos del personal --
create or replace function public.editar_grupo(p_conv uuid, p_nombre text, p_agregar uuid[], p_quitar uuid[])
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c public.conversaciones; v_ok uuid[];
begin
  select * into c from public.conversaciones
  where id = p_conv and (tipo = 'grupo' or (tipo = 'personal' and nombre is not null));
  if not found or c.creado_por is distinct from yo then raise exception 'Solo quien creó el grupo puede editarlo'; end if;
  if coalesce(btrim(p_nombre), '') <> '' then
    update public.conversaciones set nombre = left(btrim(p_nombre), 60) where id = p_conv;
  end if;
  if p_quitar is not null then
    delete from public.conversacion_participantes where conversacion_id = p_conv and usuario_id = any(p_quitar) and usuario_id <> yo;
  end if;
  if p_agregar is not null then
    v_ok := case when c.tipo = 'personal' then public.validar_personal(p_agregar, c.colegio_id)
                 else public.validar_participantes(p_agregar) end;
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
  select * into c from public.conversaciones
  where id = p_conv and (tipo = 'grupo' or (tipo = 'personal' and nombre is not null));
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

create or replace function public.eliminar_grupo(p_conv uuid)
returns text[]
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c record; v_fotos text[];
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  select * into c from public.conversaciones where id = p_conv for update;
  if not found or not (c.tipo = 'grupo' or (c.tipo = 'personal' and c.nombre is not null)) then raise exception 'No es un grupo'; end if;
  if c.creado_por is distinct from yo then raise exception 'Solo quien creó el grupo puede eliminarlo'; end if;
  select coalesce(array_agg(f), '{}') into v_fotos
  from public.mensajes m, jsonb_array_elements_text(coalesce(m.fotos, '[]'::jsonb)) f
  where m.conversacion_id = p_conv;
  delete from public.conversaciones where id = p_conv;  -- cascada: mensajes, participantes, miembros
  return v_fotos;
end $$;

create or replace function public.participantes_grupo(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text, es_creador boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, public.nombre_usuario(u.id),
    case when c.tipo = 'personal' then public.cargo_personal(u.id) else public.familia_de(u.id) end,
    c.creado_por = u.id
  from public.conversacion_participantes p
  join public.conversaciones c on c.id = p.conversacion_id
  join public.usuarios u on u.id = p.usuario_id
  where p.conversacion_id = p_conv and public.es_participante(p_conv)
  order by (c.creado_por = u.id) desc, u.nombre
$$;

-- "Borrar chat" también en un 1 a 1 del personal (lo saca solo de mi lista)
create or replace function public.ocultar_conversacion(p_conv uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c record;
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  select * into c from public.conversaciones where id = p_conv;
  if not found or not (c.tipo = 'directo' or (c.tipo = 'personal' and c.nombre is null))
     or yo not in (c.usuario_a, c.usuario_b) then
    raise exception 'Solo se pueden borrar tus chats 1 a 1';
  end if;
  insert into public.conversacion_miembros (conversacion_id, usuario_id, ultimo_leido_en, oculto_desde)
  values (p_conv, yo, now(), now())
  on conflict (conversacion_id, usuario_id)
  do update set oculto_desde = now(), ultimo_leido_en = now();
end $$;

-- En los chats del personal, debajo del nombre va el cargo
create or replace function public.autores_conversacion(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
    case
      when c.tipo = 'personal' then public.cargo_personal(u.id)
      when c.tipo in ('docente', 'colegio') and u.rol not in ('super', 'colegio_admin', 'nivel_admin', 'docente')
        then (select 'familia de ' || h.nombre from public.hijos h where h.id = c.hijo_id)
      when c.tipo = 'docente' and u.rol = 'docente'
        then (select string_agg(distinct ma.nombre, ', ')
              from public.maestros mt
              join public.clases cl on cl.maestro_id = mt.id
              join public.materias ma on ma.id = cl.materia_id
              join public.hijos h on h.id = c.hijo_id and h.curso_id = cl.curso_id
              where mt.id = c.maestro_id and mt.usuario_id = u.id)
      when u.rol not in ('super', 'colegio_admin', 'nivel_admin', 'docente') then public.familia_de(u.id)
    end
  from public.mensajes m
  join public.usuarios u on u.id = m.autor_id
  join public.conversaciones c on c.id = m.conversacion_id
  where m.conversacion_id = p_conv and public.es_miembro_conversacion(p_conv)
$$;

-- 6) La lista: los chats del personal aparecen en mis_conversaciones ---------
create or replace function public.mis_conversaciones()
returns table (id uuid, tipo text, curso_id uuid, hijo_id uuid, otro_id uuid, titulo text, subtitulo text, estado text, ultimo_texto text, ultimo_fotos integer, ultimo_autor_id uuid, ultimo_borrado boolean, ultimo_en timestamptz, no_leidos integer, silenciado boolean, bloqueado boolean, modero boolean, creado_por uuid, oculto_desde timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  with yo as (select public.mi_usuario_id() as uid),
  bloq as (select b.bloqueado_id from public.usuario_bloqueos b, yo where b.usuario_id = yo.uid),
  convs as (
    select c.*,
      case when c.tipo = 'directo' or (c.tipo = 'personal' and c.nombre is null)
           then case when c.usuario_a = yo.uid then c.usuario_b else c.usuario_a end end as otro,
      (c.tipo = 'docente' and public.es_docente_de(c.maestro_id)) as soy_docente
    from public.conversaciones c, yo
    where (c.tipo = 'directo' and yo.uid in (c.usuario_a, c.usuario_b) and c.ultimo_mensaje_en is not null)
       or (c.tipo = 'curso'   and public.es_miembro_curso(c.curso_id)
           and exists (select 1 from public.cursos cu join public.colegios co on co.id = cu.colegio_id
                       where cu.id = c.curso_id and cu."año_lectivo" >= co."año_lectivo_actual"))
       or (c.tipo = 'grupo'   and exists (select 1 from public.conversacion_participantes p where p.conversacion_id = c.id and p.usuario_id = yo.uid))
       or (c.tipo = 'personal' and exists (select 1 from public.conversacion_participantes p where p.conversacion_id = c.id and p.usuario_id = yo.uid)
           and (c.nombre is not null or c.ultimo_mensaje_en is not null))
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
      when 'personal' then coalesce(c.nombre, public.nombre_usuario(c.otro))
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
      when 'personal' then case when c.nombre is null then public.cargo_personal(c.otro)
                               else (select count(*) from public.conversacion_participantes p where p.conversacion_id = c.id)::text || ' participantes · Personal' end
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
    (c.tipo = 'curso' and public.es_admin_curso(c.curso_id))
      or (c.tipo in ('grupo','personal') and c.nombre is not null and c.creado_por = yo.uid),
    c.creado_por,
    cm.oculto_desde
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
      and m.creado_en > coalesce(cm.oculto_desde, '-infinity'::timestamptz)
      and (m.autor_id is null or m.autor_id not in (select bloqueado_id from bloq))
    order by m.creado_en desc limit 1
  ) um on true
  where not ((c.tipo = 'directo' or (c.tipo = 'personal' and c.nombre is null)) and cm.oculto_desde is not null
             and coalesce(c.ultimo_mensaje_en, c.creado_en) <= cm.oculto_desde)
  order by coalesce(c.ultimo_mensaje_en, c.creado_en) desc
$$;

-- 7) Permisos de ejecución ---------------------------------------------------
revoke all on function public.es_personal_de_colegio(uuid, uuid) from public, anon;
revoke all on function public.mi_colegio_personal() from public, anon;
revoke all on function public.cargo_personal(uuid) from public, anon;
revoke all on function public.validar_personal(uuid[], uuid) from public, anon;
revoke all on function public.personal_para_mensaje() from public, anon;
revoke all on function public.abrir_conversacion_personal(uuid) from public, anon;
revoke all on function public.crear_grupo_personal(text, uuid[]) from public, anon;
grant execute on function public.es_personal_de_colegio(uuid, uuid) to authenticated;
grant execute on function public.mi_colegio_personal() to authenticated;
grant execute on function public.cargo_personal(uuid) to authenticated;
grant execute on function public.validar_personal(uuid[], uuid) to authenticated;
grant execute on function public.personal_para_mensaje() to authenticated;
grant execute on function public.abrir_conversacion_personal(uuid) to authenticated;
grant execute on function public.crear_grupo_personal(text, uuid[]) to authenticated;
