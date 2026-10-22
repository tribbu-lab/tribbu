-- =============================================================================
-- Chats archivados al cambiar de año lectivo (pedido 2026-10-22).
--
-- Antes: mensajes-retencion BORRABA los chats de cursos de años cerrados
-- (directo, curso, colegio, docente, grupo) apenas cambiaba el año.
-- Ahora: esos chats quedan CERRADOS (se leen, no se escribe) y la app los
-- muestra aparte, en "Archivados"; la retención los borra recién 180 días
-- después de archivarlos. Los chats del personal y el soporte no se tocan.
--
-- Un chat está cerrado cuando:
--   · tiene archivada_en (lo marcó la retención o un "abrir" de este año), o
--   · su curso ancla (conversaciones.curso_id) es de un año < año vigente.
--
-- Los 1 a 1, Secretaría y maestra eran ÚNICOS por pareja / alumno / alumno+
-- maestra: si el viejo no se borra, al año siguiente se reabría el archivado.
-- Por eso los índices únicos pasan a contar solo los no archivados y los
-- "abrir" archivan el viejo y crean uno nuevo cuando el curso nuevo ya está
-- vigente (antes de promover a los alumnos devuelven el viejo, de solo lectura,
-- en vez de crear repetidos).
-- Idempotente. Probado en una transacción con rollback.
-- =============================================================================

alter table public.conversaciones add column if not exists archivada_en timestamptz;

-- ¿El curso es de un año lectivo ya cerrado? (mismo criterio que la retención)
create or replace function public.curso_cerrado(p_curso uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_curso is not null and exists (
    select 1 from public.cursos cu join public.colegios co on co.id = cu.colegio_id
    where cu.id = p_curso and cu."año_lectivo" < co."año_lectivo_actual")
$$;

create or replace function public.conversacion_archivada(p_conv uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce((
    select c.archivada_en is not null
        or (c.tipo in ('directo','curso','colegio','docente','grupo') and public.curso_cerrado(c.curso_id))
    from public.conversaciones c where c.id = p_conv), false)
$$;

-- Ids de MIS chats archivados (para la sección "Archivados" de Mensajes).
create or replace function public.mis_conversaciones_archivadas()
returns setof uuid language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from public.conversaciones c
  where c.tipo in ('directo','curso','colegio','docente','grupo')
    and (c.archivada_en is not null or public.curso_cerrado(c.curso_id))
    and ((c.tipo = 'directo' and public.mi_usuario_id() in (c.usuario_a, c.usuario_b))
      or (c.tipo in ('colegio','docente') and public.es_padre_de(c.hijo_id))
      or (c.tipo = 'docente' and public.es_docente_de(c.maestro_id))
      or (c.tipo = 'grupo' and exists (select 1 from public.conversacion_participantes p
                                        where p.conversacion_id = c.id and p.usuario_id = public.mi_usuario_id())))
$$;

-- Índices únicos: solo entre los no archivados.
drop index if exists public.conversaciones_directo_uq;
create unique index conversaciones_directo_uq on public.conversaciones (usuario_a, usuario_b)
  where tipo = 'directo' and archivada_en is null;
drop index if exists public.conversaciones_colegio_uq;
create unique index conversaciones_colegio_uq on public.conversaciones (hijo_id)
  where tipo = 'colegio' and archivada_en is null;
drop index if exists public.conversaciones_docente_uq;
create unique index conversaciones_docente_uq on public.conversaciones (hijo_id, maestro_id)
  where tipo = 'docente' and archivada_en is null;

-- No se escribe en un chat archivado (la política mensajes_insert usa esta función).
create or replace function public.puede_escribir_conversacion(p_conv uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c  public.conversaciones;
  yo uuid := public.mi_usuario_id();
  otro uuid;
begin
  select * into c from public.conversaciones where id = p_conv;
  if not found or yo is null then return false; end if;
  if public.conversacion_archivada(p_conv) then return false; end if;
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
end $function$;

-- 1 a 1 entre familias: el ancla es un curso VIGENTE en común; el viejo, si
-- quedó en un año cerrado, se archiva y se abre uno nuevo.
CREATE OR REPLACE FUNCTION public.abrir_conversacion_directa(p_usuario uuid, p_curso uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  yo uuid := public.mi_usuario_id();
  a uuid; b uuid; v_curso uuid; v_id uuid; v_ancla uuid;
begin
  if yo is null or p_usuario is null or p_usuario = yo then
    raise exception 'Destinatario inválido';
  end if;
  a := least(yo, p_usuario); b := greatest(yo, p_usuario);
  if p_curso is not null and not public.curso_cerrado(p_curso)
     and p_curso in (select public.cursos_de_usuario(yo))
     and p_curso in (select public.cursos_de_usuario(p_usuario)) then
    v_curso := p_curso;
  else
    select cu.id into v_curso
    from public.cursos cu
    where cu.id in (select public.cursos_de_usuario(yo))
      and cu.id in (select public.cursos_de_usuario(p_usuario))
      and not public.curso_cerrado(cu.id)
    order by cu."año_lectivo" desc nulls last
    limit 1;
  end if;
  select id, curso_id into v_id, v_ancla from public.conversaciones
  where tipo = 'directo' and usuario_a = a and usuario_b = b and archivada_en is null;
  if v_id is not null then
    if not public.curso_cerrado(v_ancla) or v_curso is null then return v_id; end if;
    update public.conversaciones set archivada_en = now() where id = v_id;
    v_id := null;
  end if;
  if v_curso is null then
    raise exception 'Solo podés escribirle a familias de tus cursos';
  end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, usuario_a, usuario_b)
  values ('directo', v_curso, public.colegio_de_curso(v_curso), a, b)
  on conflict (usuario_a, usuario_b) where tipo = 'directo' and archivada_en is null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'directo' and usuario_a = a and usuario_b = b and archivada_en is null;
  end if;
  return v_id;
end $function$;

-- Secretaría (un hilo por alumno): nuevo hilo cuando el alumno ya está en un curso vigente.
CREATE OR REPLACE FUNCTION public.abrir_conversacion_colegio(p_hijo uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_curso uuid; v_colegio uuid; v_id uuid; v_ancla uuid;
begin
  select h.curso_id into v_curso from public.hijos h where h.id = p_hijo;
  v_colegio := public.colegio_de_curso(v_curso);
  if v_curso is null or not (public.es_padre_de(p_hijo) or public.es_colegio_admin_de(v_colegio) or public.es_secretaria_de_curso(v_curso)) then
    raise exception 'Sin permiso';
  end if;
  select id, curso_id into v_id, v_ancla from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo and archivada_en is null;
  if v_id is not null then
    if not public.curso_cerrado(v_ancla) or public.curso_cerrado(v_curso) then return v_id; end if;
    update public.conversaciones set archivada_en = now() where id = v_id;
    v_id := null;
  end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, hijo_id)
  values ('colegio', v_curso, v_colegio, p_hijo)
  on conflict (hijo_id) where tipo = 'colegio' and archivada_en is null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'colegio' and hijo_id = p_hijo and archivada_en is null;
  end if;
  return v_id;
end $function$;

-- Maestra (un hilo por alumno + maestra): igual que Secretaría.
CREATE OR REPLACE FUNCTION public.abrir_conversacion_docente(p_hijo uuid, p_maestro uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_curso uuid; v_id uuid; v_cuenta uuid; v_ancla uuid;
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
  select id, curso_id into v_id, v_ancla from public.conversaciones where tipo = 'docente' and hijo_id = p_hijo and maestro_id = p_maestro and archivada_en is null;
  if v_id is not null then
    if not public.curso_cerrado(v_ancla) or public.curso_cerrado(v_curso) then return v_id; end if;
    update public.conversaciones set archivada_en = now() where id = v_id;
    v_id := null;
  end if;
  insert into public.conversaciones (tipo, curso_id, colegio_id, hijo_id, maestro_id)
  values ('docente', v_curso, public.colegio_de_curso(v_curso), p_hijo, p_maestro)
  on conflict (hijo_id, maestro_id) where tipo = 'docente' and archivada_en is null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversaciones where tipo = 'docente' and hijo_id = p_hijo and maestro_id = p_maestro and archivada_en is null;
  end if;
  return v_id;
end $function$;

-- Marketplace: abre un 1 a 1 aunque no compartan curso; mismo criterio de archivo.
CREATE OR REPLACE FUNCTION public.abrir_conversacion_articulo(p_articulo uuid, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS TABLE(conversacion_id uuid, otro_id uuid, nombre text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  yo uuid := public.mi_usuario_id();
  art public.marketplace_articulos;
  otro uuid; a uuid; b uuid; v_curso uuid; v_id uuid; v_ancla uuid;
begin
  select * into art from public.marketplace_articulos where id = p_articulo;
  if not found or yo is null then raise exception 'Publicación no encontrada'; end if;
  if p_usuario is null then
    if art.publicado_por = yo then raise exception 'Es tu publicación'; end if;
    if not public.familia_ve_articulo(p_articulo) then raise exception 'No podés escribir por esta publicación'; end if;
    otro := art.publicado_por;
    if otro is null then raise exception 'Quien lo publicó ya no usa tribbu'; end if;
    insert into public.marketplace_interesados (articulo_id, usuario_id)
    values (p_articulo, yo) on conflict (articulo_id, usuario_id) do nothing;
  else
    if art.publicado_por is distinct from yo then raise exception 'No podés escribir por esta publicación'; end if;
    if not exists (select 1 from public.marketplace_interesados i where i.articulo_id = p_articulo and i.usuario_id = p_usuario) then
      raise exception 'Esa familia no marcó Me interesa';
    end if;
    otro := p_usuario;
  end if;
  if exists (select 1 from public.usuario_bloqueos
             where (usuario_id = otro and bloqueado_id = yo) or (usuario_id = yo and bloqueado_id = otro)) then
    raise exception 'No podés escribirle a esta persona';
  end if;

  a := least(yo, otro); b := greatest(yo, otro);
  select cu.id into v_curso
  from public.cursos cu
  where cu.id in (select public.cursos_de_usuario(yo))
    and cu.id in (select public.cursos_de_usuario(otro))
    and not public.curso_cerrado(cu.id)
  order by cu."año_lectivo" desc nulls last
  limit 1;
  if v_curso is null and not public.curso_cerrado(art.curso_id) then v_curso := art.curso_id; end if;
  if v_curso is null then
    select cu.id into v_curso from public.cursos cu
    where cu.id in (select public.cursos_de_usuario(art.publicado_por))
      and not public.curso_cerrado(cu.id)
    order by cu."año_lectivo" desc nulls last limit 1;
  end if;

  select c.id, c.curso_id into v_id, v_ancla from public.conversaciones c
  where c.tipo = 'directo' and c.usuario_a = a and c.usuario_b = b and c.archivada_en is null;
  if v_id is not null and public.curso_cerrado(v_ancla) and v_curso is not null then
    update public.conversaciones set archivada_en = now() where id = v_id;
    v_id := null;
  end if;
  if v_id is null then
    if v_curso is null then raise exception 'No se pudo abrir el chat'; end if;
    insert into public.conversaciones (tipo, curso_id, colegio_id, usuario_a, usuario_b)
    values ('directo', v_curso, public.colegio_de_curso(v_curso), a, b)
    on conflict (usuario_a, usuario_b) where tipo = 'directo' and archivada_en is null do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.conversaciones c where c.tipo = 'directo' and c.usuario_a = a and c.usuario_b = b and c.archivada_en is null;
    end if;
  end if;
  return query select v_id, otro, public.nombre_usuario(otro);
end $function$;

revoke all on function public.curso_cerrado(uuid) from public, anon;
revoke all on function public.conversacion_archivada(uuid) from public, anon;
revoke all on function public.mis_conversaciones_archivadas() from public, anon;
grant execute on function public.curso_cerrado(uuid), public.conversacion_archivada(uuid), public.mis_conversaciones_archivadas() to authenticated;
