-- =============================================================================
-- colectas-datos-transferencia.sql
-- =============================================================================
-- Correr UNA vez en el SQL editor de Supabase (proyecto tribbu). Idempotente.
--
-- Agrega `colectas.alias_cbu`: el alias o CBU/CVU a donde las familias
-- transfieren su aporte. Lo carga quien crea/edita la colecta (admin o
-- responsable) y la app lo muestra con un botón de "copiar" bien grande.
-- El dinero nunca pasa por tribbu — va directo a la cuenta del organizador.
--
-- No cambia RLS (las policies de colectas ya cubren todas las columnas).
-- =============================================================================

alter table public.colectas add column if not exists alias_cbu text;
