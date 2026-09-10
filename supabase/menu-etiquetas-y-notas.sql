-- =============================================================================
-- menu-etiquetas-y-notas.sql
-- =============================================================================
-- Correr UNA vez en el SQL editor de Supabase (proyecto tribbu). Idempotente.
--
-- Agrega a `menu` dos campos por día para el rediseño del comedor en la app:
--   · etiquetas: array de etiquetas rápidas que el apoderado escanea de un
--     vistazo — "Sin TACC", "Sin lactosa", "Opción vegetariana", etc. Es info
--     a nivel DÍA (no por plato) para que el colegio la cargue sin fricción.
--   · notas: texto libre para aclaraciones de alérgenos/intolerancias.
--
-- No cambia RLS (las policies de menu ya cubren todas las columnas).
-- =============================================================================

alter table public.menu add column if not exists etiquetas jsonb not null default '[]'::jsonb;
alter table public.menu add column if not exists notas text;
