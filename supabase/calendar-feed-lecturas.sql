-- supabase/calendar-feed-lecturas.sql
--
-- Registro de lecturas del feed ICS: calendar-feed anota cuándo lo leyó
-- Google (User-Agent "Google-Calendar-Importer") y cuándo lo leyó cualquier
-- cliente. Con eso la app puede decir "✓ Google ya está leyendo tu
-- calendario" en vez de depender del botón "Ya lo agregué" — que no prueba
-- nada: el usuario puede tocarlo sin haber terminado la suscripción.
--
-- Correr una sola vez, después de calendar-token-hardening.sql. Solo lo
-- escribe calendar-feed (service role); el usuario lee su propia fila con la
-- policy usuario_calendar_tokens_select que ya existe.

alter table public.usuario_calendar_tokens
  add column if not exists google_leido_en timestamptz,  -- última lectura de Google Calendar
  add column if not exists leido_en        timestamptz,  -- última lectura de cualquier cliente
  add column if not exists leido_por       text;         -- User-Agent de esa última lectura (diagnóstico)

-- Regenerar el enlace invalida las suscripciones viejas: las lecturas
-- registradas eran del token anterior, así que se limpian.
create or replace function public.regenerar_calendar_token()
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := public.mi_usuario_id();
  v_token text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.usuario_calendar_tokens (usuario_id, token)
  values (v_uid, v_token)
  on conflict (usuario_id) do update
    set token = excluded.token, creado_en = now(),
        google_leido_en = null, leido_en = null, leido_por = null;
  return v_token;
end $$;

grant execute on function public.regenerar_calendar_token() to authenticated;
