-- supabase/mensajes-fotos.sql (2026-10-23)
--
-- 1) Fotos en la difusión ("Mensaje a varias familias"): enviar_difusion acepta
--    p_fotos (≤ 3 paths). Las fotos se suben UNA vez a
--    adjuntos/mensajes/difusion/<mi usuario>/… y cada mensaje de la difusión
--    referencia los mismos archivos (no se sube la misma foto 50 veces). Por eso
--    la app no borra del Storage una foto de difusión al editar/borrar un
--    mensaje: la limpia mensajes-retencion cuando ningún mensaje la usa.
--
-- 2) Fotos de Mensajes privadas: hasta acá cualquier usuario logueado que
--    tuviera la ruta podía leer cualquier foto del bucket `adjuntos` (la
--    política de lectura era de todo el bucket). Ahora un archivo bajo
--    `mensajes/` lo lee solo:
--      · quien lo subió,
--      · el super,
--      · quien ve la conversación de la carpeta (mensajes/<conversacion>/…),
--      · quien ve un mensaje que lo usa (difusión), o
--      · quien puede ver la denuncia de un mensaje que lo tenía (el colegio
--        no es miembro del chat, pero tiene que ver la foto denunciada).
--    El resto del bucket (avisos, eventos, logos, Lost & Found…) no cambia.
--
-- Idempotente. Se aplicó con `npx supabase db query --linked -f`.

-- ── 1) Difusión con fotos ─────────────────────────────────────────────────
drop function if exists public.enviar_difusion(uuid[], text, uuid);
create or replace function public.enviar_difusion(
  p_usuarios uuid[], p_texto text, p_curso uuid default null, p_fotos jsonb default '[]'::jsonb
)
returns table (enviados int, omitidos int)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  v_ok uuid[]; u uuid; v_conv uuid; n_ok int := 0; n_total int;
  t text := left(btrim(coalesce(p_texto, '')), 2000);
  f jsonb := coalesce(p_fotos, '[]'::jsonb);
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  if jsonb_typeof(f) <> 'array' or jsonb_array_length(f) > 3 then
    raise exception 'Podés mandar hasta 3 fotos';
  end if;
  -- Solo fotos propias de difusión (no rutas de chats ajenos).
  if exists (
    select 1 from jsonb_array_elements(f) x
    where jsonb_typeof(x) <> 'string'
       or not starts_with(x #>> '{}', 'mensajes/difusion/' || yo::text || '/')
  ) then
    raise exception 'Foto no válida';
  end if;
  if t = '' and jsonb_array_length(f) = 0 then raise exception 'Escribí el mensaje'; end if;
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
      v_conv := public.abrir_conversacion_directa(u, p_curso);
      insert into public.mensajes (conversacion_id, texto, fotos) values (v_conv, nullif(t, ''), f);
      n_ok := n_ok + 1;
    exception when others then
      null; -- se cuenta como omitido
    end;
  end loop;
  return query select n_ok, n_total - n_ok;
end $$;
revoke all on function public.enviar_difusion(uuid[], text, uuid, jsonb) from public, anon;
grant execute on function public.enviar_difusion(uuid[], text, uuid, jsonb) to authenticated;

-- ── 2) Lectura de fotos de Mensajes ───────────────────────────────────────
-- ¿p_foto (path guardado en mensajes.fotos) es p_name o su miniatura?
-- Misma regla que pathMiniatura (src/lib/miniaturas.js): sin extensión + .thumb.jpg
create or replace function public.es_foto_o_miniatura(p_foto text, p_name text)
returns boolean language sql immutable set search_path = public, pg_temp
as $$
  select p_foto = p_name or regexp_replace(p_foto, '\.[^./]+$', '') || '.thumb.jpg' = p_name
$$;

create or replace function public.puede_leer_foto_mensaje(p_name text, p_owner text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_carpeta text := split_part(p_name, '/', 2);
begin
  if p_owner is not null and p_owner = auth.uid()::text then return true; end if;
  if public.es_super() then return true; end if;
  -- mensajes/<conversacion>/…
  if v_carpeta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and public.es_miembro_conversacion(v_carpeta::uuid) then
    return true;
  end if;
  -- Un mensaje que puedo ver la usa (difusión: mensajes/difusion/<autor>/…)
  if exists (
    select 1 from public.mensajes m, jsonb_array_elements_text(m.fotos) f(p)
    where public.es_foto_o_miniatura(f.p, p_name)
      and public.es_miembro_conversacion(m.conversacion_id)
  ) then
    return true;
  end if;
  -- Foto de un mensaje denunciado (copia en fotos_snapshot): misma regla que denuncias_select
  return exists (
    select 1 from public.mensaje_denuncias d, jsonb_array_elements_text(d.fotos_snapshot) f(p)
    where public.es_foto_o_miniatura(f.p, p_name)
      and (d.denunciante_id = public.mi_usuario_id()
           or (d.colegio_id is not null and public.es_colegio_admin_de(d.colegio_id)))
  );
end $$;
revoke all on function public.puede_leer_foto_mensaje(text, text) from public, anon;
grant execute on function public.puede_leer_foto_mensaje(text, text) to authenticated;

drop policy if exists "priv_read_adjuntos_eventos" on storage.objects;
create policy "priv_read_adjuntos_eventos" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('adjuntos', 'eventos')
    and (bucket_id <> 'adjuntos' or name not like 'mensajes/%'
         or public.puede_leer_foto_mensaje(name, owner_id))
  );
