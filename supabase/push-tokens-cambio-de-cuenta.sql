-- supabase/push-tokens-cambio-de-cuenta.sql — El teléfono es de la última
-- cuenta que inició sesión en él (2026-10-27).
--
-- Bug: push_tokens tiene token único y la app guarda con
-- upsert(onConflict: "token"). Si en el teléfono ya había entrado otra cuenta,
-- el ON CONFLICT DO UPDATE choca con push_tokens_update_own (solo filas
-- propias) y falla: el token quedaba para siempre a nombre de la primera
-- cuenta, y los push de la cuenta nueva le llegaban a la vieja (o a nadie).
--
-- Arreglo, sin cambiar la app: antes de insertar, un trigger security definer
-- borra la fila de ese token si es de OTRA cuenta; el insert sigue sin
-- conflicto y con la RLS de siempre (usuario_id = el que llama). Saber un
-- token ajeno solo permitiría "llevárselo" a la propia cuenta (ese teléfono
-- recibiría los push de quien lo hizo), no leer nada.
--
-- Correr después de mobile/supabase/push_tokens.sql. Idempotente.

create or replace function public.push_tokens_antes_insert()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  delete from public.push_tokens
   where token = new.token and usuario_id is distinct from new.usuario_id;
  return new;
end $$;
revoke all on function public.push_tokens_antes_insert() from public, anon, authenticated;

drop trigger if exists push_tokens_antes_insert on public.push_tokens;
create trigger push_tokens_antes_insert
  before insert on public.push_tokens
  for each row execute function public.push_tokens_antes_insert();
