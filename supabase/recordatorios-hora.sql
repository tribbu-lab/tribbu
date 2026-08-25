-- supabase/recordatorios-hora.sql
--
-- Hora inicio/fin para comunicaciones del colegio (item 7 del backlog):
-- "la comunicación del colegio puede tener hora inicio y fin" — ej. "Reunión
-- general de padres el viernes 15, de 18 a 19hs". Columnas en recordatorios
-- (no solo en Comunicaciones) porque una comunicación multi-curso es, en la
-- base, una fila más de recordatorios (mismo modelo que specs/
-- comunicaciones-multi-curso.md) — ambas opcionales e independientes entre sí.
--
-- Correr una sola vez.

alter table public.recordatorios add column if not exists hora_inicio time;
alter table public.recordatorios add column if not exists hora_fin time;
