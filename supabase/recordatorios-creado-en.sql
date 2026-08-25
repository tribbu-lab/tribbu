-- supabase/recordatorios-creado-en.sql
--
-- `recordatorios` no tenía ninguna columna de fecha de creación (`fecha` es
-- la fecha del evento/vencimiento, no cuándo se cargó la fila) — hace falta
-- para el historial de Comunicaciones en Super Admin (specs pendiente),
-- que necesita ordenar "de la última a la primera".
--
-- Correr una sola vez.

alter table public.recordatorios
  add column if not exists creado_en timestamptz not null default now();
