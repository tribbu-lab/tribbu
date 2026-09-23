-- supabase/avisos-automaticos.sql
--
-- Registro de avisos automáticos ya enviados (Edge Function
-- avisos-automaticos): una fila por aviso, con una clave única del tipo
--   eventos:<fecha>:<usuario>   colecta:<colecta>:<usuario>   semanal:<lunes>:<usuario>
-- La función la inserta ANTES de mandar y solo manda si la clave es nueva,
-- así una corrida repetida del cron no duplica notificaciones.
-- Solo la usa la función (service role): RLS activada y sin policies.
--
-- La programación (pg_cron) está aparte, en avisos-automaticos-cron.sql.

create table if not exists public.avisos_automaticos_log (
  clave      text primary key,
  enviado_en timestamptz not null default now()
);

alter table public.avisos_automaticos_log enable row level security;

-- Limpieza: con 60 días de historia alcanza para el dedupe.
create index if not exists avisos_automaticos_log_enviado_en on public.avisos_automaticos_log (enviado_en);
