-- supabase/calendar-sync.sql
--
-- Sincronización de calendario (ver specs/sincronizacion-de-calendario.md):
-- token privado por usuario para suscribir un feed ICS (Google/Apple/Outlook)
-- con sus eventos + cumpleaños + festejos de todos los cursos a los que tiene
-- acceso. El feed lo sirve el Edge Function `calendar-feed` (deploy aparte,
-- ver el comentario al final de este archivo).
--
-- La policy `usuarios_update` solo permite `es_super()` (ver rls-hardening.sql),
-- así que un apoderado/admin normal no puede escribir su propia fila `usuarios`
-- directamente. Por eso el token se genera/regenera vía una función
-- SECURITY DEFINER, igual patrón que `crear_apoderado`/`verificar_codigo`.
--
-- Correr una sola vez en el SQL editor de Supabase, DESPUÉS de rls-hardening.sql
-- (esta función usa `mi_usuario_id()`, definida ahí).

create extension if not exists pgcrypto;

alter table public.usuarios add column if not exists calendar_token text unique;

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
  -- pgcrypto vive en el schema `extensions` en Supabase (no en public), y esta
  -- función fija search_path = public, pg_temp por seguridad, así que hay que
  -- calificar el nombre completo en vez de confiar en el search_path.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  update public.usuarios set calendar_token = v_token where id = v_uid;
  return v_token;
end $$;

grant execute on function public.regenerar_calendar_token() to authenticated;

-- Después de correr este SQL, desplegar el Edge Function que sirve el feed:
--   supabase functions deploy calendar-feed --no-verify-jwt
-- El flag --no-verify-jwt es necesario: a diferencia de send-push/manage-auth-user,
-- a este endpoint lo consultan Google/Apple/Outlook directamente sin sesión de
-- Supabase — el token de la URL es la única autenticación.
