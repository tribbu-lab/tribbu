-- Marketplace: el contacto es por Mensajes de tribbu y el colegio solo mira
-- (2026-10-21). Pedido de Yanina:
--   · "La mensajería debería ser por tribbu y no por WhatsApp (ocultar celular
--     y correo)": "Me interesa" abre un chat 1 a 1 con quien publicó
--     (abrir_conversacion_articulo). contacto_articulo / interesados_articulo
--     dejan de devolver teléfono y mail (mismas columnas, en null, para que
--     las versiones viejas de la app no se rompan).
--   · "El colegio no debería intervenir (hoy puede poner Me interesa): solo
--     verlo, para controlar si se comercializa algo que no permite": el
--     colegio (super / colegio_admin) ya no publica, no edita, no marca
--     vendido, no se anota como interesado ni ve quiénes se interesaron. Sí ve
--     todo lo de su colegio y puede quitar una publicación (moderación).
--
-- Correr después de marketplace.sql y mensajes-grupos.sql. Idempotente.

-- ¿Quien llama es una familia que ve el artículo? (no el colegio ni una docente)
create or replace function public.familia_ve_articulo(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.marketplace_articulos a
    where a.id = p_id and (
      (a.alcance = 'curso' and public.es_miembro_curso(a.curso_id))
      or (a.alcance = 'colegio' and exists (
            select 1 from public.cursos c where c.colegio_id = a.colegio_id and public.es_miembro_curso(c.id)))
    )
  )
$$;
revoke all on function public.familia_ve_articulo(uuid) from public, anon;
grant execute on function public.familia_ve_articulo(uuid) to authenticated;

-- Gestiona = solo quien publicó (antes también el colegio).
create or replace function public.gestiona_articulo(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.marketplace_articulos a
    where a.id = p_id and a.publicado_por = public.mi_usuario_id()
  )
$$;

-- Publicar: solo familias, en un curso suyo. El colegio ya no publica.
drop policy if exists marketplace_articulos_insert on public.marketplace_articulos;
create policy marketplace_articulos_insert on public.marketplace_articulos for insert to authenticated
  with check (
    publicado_por = public.mi_usuario_id()
    and estado = 'disponible' and comprador_id is null
    and not es_colegio
    and curso_id is not null and public.es_miembro_curso(curso_id)
    and public.colegio_de_curso(curso_id) = colegio_id
  );

-- Editar / vendido / renovar: solo quien publicó.
drop policy if exists marketplace_articulos_update on public.marketplace_articulos;
create policy marketplace_articulos_update on public.marketplace_articulos for update to authenticated
  using (publicado_por = public.mi_usuario_id())
  with check (publicado_por = public.mi_usuario_id() and not es_colegio);

-- Borrar: quien publicó o el colegio (quitar algo que no se permite). Sin cambios.

-- "Me interesa": solo una familia que ve el artículo y no lo publicó.
drop policy if exists marketplace_interesados_insert on public.marketplace_interesados;
create policy marketplace_interesados_insert on public.marketplace_interesados for insert to authenticated
  with check (
    usuario_id = public.mi_usuario_id()
    and public.familia_ve_articulo(articulo_id)
    and not exists (select 1 from public.marketplace_articulos a where a.id = articulo_id and a.publicado_por = public.mi_usuario_id())
  );
-- marketplace_interesados_select ya usa gestiona_articulo: el colegio deja de ver quiénes.

-- Sin teléfono ni mail (las columnas quedan por compatibilidad con la app vieja).
create or replace function public.contacto_articulo(p_id uuid)
returns table (nombre text, telefono text, email text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), null::text, null::text
  from public.marketplace_articulos a
  left join public.usuarios u on u.id = a.publicado_por
  where a.id = p_id
    and exists (select 1 from public.marketplace_interesados i where i.articulo_id = a.id and i.usuario_id = public.mi_usuario_id())
$$;

create or replace function public.interesados_articulo(p_id uuid)
returns table (usuario_id uuid, nombre text, telefono text, email text, mensaje text, creado_en timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, trim(coalesce(u.nombre, '') || ' ' || coalesce(u.apellido, '')), null::text, null::text, i.mensaje, i.creado_en
  from public.marketplace_interesados i
  join public.usuarios u on u.id = i.usuario_id
  where i.articulo_id = p_id and public.gestiona_articulo(p_id)
  order by i.creado_en
$$;

-- Abre (o crea) el 1 a 1 por un artículo.
--   · p_usuario null: quien llama es la familia interesada → la anota como
--     interesada (si no lo estaba) y abre el chat con quien publicó.
--   · p_usuario = un interesado: quien llama es quien publicó y le escribe.
-- Funciona aunque no compartan curso (alcance "todo el colegio"): el chat se
-- ancla a un curso en común si hay, si no al curso de la publicación.
-- Devuelve el id de la conversación y el nombre del otro.
create or replace function public.abrir_conversacion_articulo(p_articulo uuid, p_usuario uuid default null)
returns table (conversacion_id uuid, otro_id uuid, nombre text)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  art public.marketplace_articulos;
  otro uuid; a uuid; b uuid; v_curso uuid; v_id uuid;
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
  select c.id into v_id from public.conversaciones c where c.tipo = 'directo' and c.usuario_a = a and c.usuario_b = b;
  if v_id is null then
    select cu.id into v_curso
    from public.cursos cu
    where cu.id in (select public.cursos_de_usuario(yo))
      and cu.id in (select public.cursos_de_usuario(otro))
    order by cu."año_lectivo" desc nulls last
    limit 1;
    if v_curso is null then v_curso := art.curso_id; end if;
    if v_curso is null then
      select cu.id into v_curso from public.cursos cu
      where cu.id in (select public.cursos_de_usuario(art.publicado_por))
      order by cu."año_lectivo" desc nulls last limit 1;
    end if;
    if v_curso is null then raise exception 'No se pudo abrir el chat'; end if;
    insert into public.conversaciones (tipo, curso_id, colegio_id, usuario_a, usuario_b)
    values ('directo', v_curso, public.colegio_de_curso(v_curso), a, b)
    on conflict (usuario_a, usuario_b) where tipo = 'directo' do nothing
    returning id into v_id;
    if v_id is null then
      select c.id into v_id from public.conversaciones c where c.tipo = 'directo' and c.usuario_a = a and c.usuario_b = b;
    end if;
  end if;
  return query select v_id, otro, public.nombre_usuario(otro);
end $$;
revoke all on function public.abrir_conversacion_articulo(uuid, uuid) from public, anon;
grant execute on function public.abrir_conversacion_articulo(uuid, uuid) to authenticated;
