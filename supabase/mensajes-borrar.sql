-- Borrar chats (2026-10-14) — aditivo.
--
-- 1) "Borrar chat" en un 1 a 1: lo saca de MI lista sin borrarlo para la otra
--    persona (como WhatsApp). conversacion_miembros.oculto_desde = cuándo lo
--    borré: mis_conversaciones lo oculta mientras no haya mensajes posteriores
--    (si me vuelven a escribir, reaparece) y la app solo muestra los mensajes
--    posteriores a esa fecha.
-- 2) "Eliminar grupo": quien creó un grupo propio (tipo 'grupo') lo borra para
--    todos. Devuelve las rutas de las fotos para que la app las borre del
--    Storage (puede_modificar_archivo deja borrar las propias; las demás las
--    limpia mensajes-retencion igual que siempre).

alter table public.conversacion_miembros add column if not exists oculto_desde timestamptz;

-- mis_conversaciones: + columna oculto_desde, oculta los 1 a 1 borrados y la
-- vista previa / no leídos cuentan solo lo posterior.
drop function if exists public.mis_conversaciones();
create function public.mis_conversaciones()
 RETURNS TABLE(id uuid, tipo text, curso_id uuid, hijo_id uuid, otro_id uuid, titulo text, subtitulo text, estado text, ultimo_texto text, ultimo_fotos integer, ultimo_autor_id uuid, ultimo_borrado boolean, ultimo_en timestamp with time zone, no_leidos integer, silenciado boolean, bloqueado boolean, modero boolean, creado_por uuid, oculto_desde timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  where not (c.tipo = 'directo' and cm.oculto_desde is not null
             and coalesce(c.ultimo_mensaje_en, c.creado_en) <= cm.oculto_desde)
  order by coalesce(c.ultimo_mensaje_en, c.creado_en) desc
$function$;
revoke all on function public.mis_conversaciones() from public, anon;
grant execute on function public.mis_conversaciones() to authenticated;

create or replace function public.ocultar_conversacion(p_conv uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c record;
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  select * into c from public.conversaciones where id = p_conv;
  if not found or c.tipo <> 'directo' or yo not in (c.usuario_a, c.usuario_b) then
    raise exception 'Solo se pueden borrar tus chats 1 a 1';
  end if;
  insert into public.conversacion_miembros (conversacion_id, usuario_id, ultimo_leido_en, oculto_desde)
  values (p_conv, yo, now(), now())
  on conflict (conversacion_id, usuario_id)
  do update set oculto_desde = now(), ultimo_leido_en = now();
end $$;

create or replace function public.eliminar_grupo(p_conv uuid)
returns text[]
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); c record; v_fotos text[];
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  select * into c from public.conversaciones where id = p_conv for update;
  if not found or c.tipo <> 'grupo' then raise exception 'No es un grupo'; end if;
  if c.creado_por is distinct from yo then raise exception 'Solo quien creó el grupo puede eliminarlo'; end if;
  select coalesce(array_agg(f), '{}') into v_fotos
  from public.mensajes m, jsonb_array_elements_text(coalesce(m.fotos, '[]'::jsonb)) f
  where m.conversacion_id = p_conv;
  delete from public.conversaciones where id = p_conv;  -- cascada: mensajes, participantes, miembros
  return v_fotos;
end $$;

revoke all on function public.ocultar_conversacion(uuid) from public, anon;
revoke all on function public.eliminar_grupo(uuid) from public, anon;
grant execute on function public.ocultar_conversacion(uuid) to authenticated;
grant execute on function public.eliminar_grupo(uuid) to authenticated;
