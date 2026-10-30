-- Fotos escolares: cada opción tiene precio en papel y/o digital, y la
-- familia elige el formato (pedido de Yanina, 2026-10-30). Las opciones
-- pasan de {precio, digital} a {precio, precio_digital} (null = no se ofrece
-- en ese formato); las sesiones viejas con digital = true se leen como "solo
-- digital". guardar_pedido_fotos recibe p_digital (default null: con un solo
-- formato no hace falta). Mismo cuerpo que en fotos-escolares.sql.
-- Idempotente.

drop function if exists public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text);
create or replace function public.guardar_pedido_fotos(
  p_sesion uuid, p_hijo uuid, p_opcion text, p_foto uuid, p_copias jsonb, p_comentario text default null,
  p_digital boolean default null
)
returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  s public.fotos_sesiones;
  v_op jsonb; v_cp jsonb; x jsonb;
  v_total numeric := 0; v_copias jsonb := '[]'::jsonb; v_cant int; v_id uuid;
  v_prev public.fotos_pedidos;
  v_papel numeric; v_dig numeric; v_es_digital boolean := false;
begin
  select * into s from public.fotos_sesiones where id = p_sesion;
  if s.id is null or s.publicada_en is null or not public.es_padre_de(p_hijo) or not public.es_familia_de_sesion(s.id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fotos f where f.sesion_id = s.id and f.hijo_id = p_hijo) then
    raise exception 'Todavía no hay fotos de este alumno';
  end if;
  if public.hoy_ar() > s.vence then raise exception 'El plazo para pedir fotos ya venció'; end if;
  select * into v_prev from public.fotos_pedidos where sesion_id = s.id and hijo_id = p_hijo;
  if v_prev.pagado_en is not null then raise exception 'El pedido ya está pagado: para cambiarlo, hablá con la Secretaría'; end if;

  if nullif(p_opcion, '') is not null then
    select o into v_op from jsonb_array_elements(s.opciones) o where o->>'id' = p_opcion;
    if v_op is null then raise exception 'Opción no válida'; end if;
    if p_foto is null or not exists (select 1 from public.fotos f where f.id = p_foto and f.sesion_id = s.id and f.hijo_id = p_hijo) then
      raise exception 'Elegí la foto para la opción';
    end if;
    -- Precio por formato (papel / digital); la familia elige si hay los dos.
    if (v_op ? 'precio_digital') or not coalesce((v_op->>'digital')::boolean, false) then
      v_papel := nullif(v_op->>'precio', '')::numeric;
      v_dig := nullif(v_op->>'precio_digital', '')::numeric;
    else
      v_dig := nullif(v_op->>'precio', '')::numeric; -- sesión vieja: opción solo digital
    end if;
    if v_papel is not null and v_dig is not null then
      if p_digital is null then raise exception 'Elegí si la querés en papel o digital'; end if;
      v_es_digital := p_digital;
    elsif v_dig is not null then
      if p_digital is false then raise exception 'Esa opción es solo digital'; end if;
      v_es_digital := true;
    elsif v_papel is not null then
      if p_digital then raise exception 'Esa opción es solo en papel'; end if;
    else
      raise exception 'Opción no válida';
    end if;
    v_total := case when v_es_digital then v_dig else v_papel end;
  end if;

  if jsonb_typeof(coalesce(p_copias, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_copias, '[]'::jsonb)) > 30 then
    raise exception 'Copias no válidas';
  end if;
  for x in select * from jsonb_array_elements(coalesce(p_copias, '[]'::jsonb)) loop
    select c into v_cp from jsonb_array_elements(s.copias) c where c->>'id' = x->>'copia_id';
    v_cant := (x->>'cantidad')::int;
    if v_cp is null or v_cant is null or v_cant < 1 or v_cant > 20 then raise exception 'Copias no válidas'; end if;
    if not exists (select 1 from public.fotos f where f.id = (x->>'foto_id')::uuid and f.sesion_id = s.id
                     and (f.hijo_id = p_hijo or f.tipo = 'grupal')) then
      raise exception 'Copias no válidas';
    end if;
    v_total := v_total + v_cant * coalesce((v_cp->>'precio')::numeric, 0);
    v_copias := v_copias || jsonb_build_object('foto_id', x->>'foto_id', 'copia_id', v_cp->>'id',
      'tamano', v_cp->>'tamano', 'precio', coalesce((v_cp->>'precio')::numeric, 0), 'cantidad', v_cant);
  end loop;

  if v_op is null and jsonb_array_length(v_copias) = 0 then raise exception 'Elegí una opción o copias'; end if;

  insert into public.fotos_pedidos as p (sesion_id, curso_id, hijo_id, opcion_id, opcion_nombre, digital, foto_id,
                                         copias, total, comentario, creado_por, actualizado_en)
  values (s.id, s.curso_id, p_hijo, v_op->>'id', v_op->>'nombre', v_es_digital,
          case when v_op is null then null else p_foto end, v_copias, v_total,
          nullif(left(btrim(coalesce(p_comentario, '')), 500), ''), public.mi_usuario_id(), now())
  on conflict (sesion_id, hijo_id) do update
     set opcion_id = excluded.opcion_id, opcion_nombre = excluded.opcion_nombre, digital = excluded.digital,
         foto_id = excluded.foto_id, copias = excluded.copias, total = excluded.total,
         comentario = excluded.comentario, creado_por = excluded.creado_por, actualizado_en = now(),
         informado_pago_en = null
  returning p.id into v_id;
  return v_id;
end $$;

revoke all on function public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.guardar_pedido_fotos(uuid, uuid, text, uuid, jsonb, text, boolean) to authenticated, service_role;
