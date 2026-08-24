-- supabase/comunicaciones-multi-curso.sql
--
-- Comunicaciones multi-curso (ver specs/comunicaciones-multi-curso.md):
-- une con un id compartido las filas de `recordatorios` que nacen de una
-- misma comunicación publicada por Super Admin en varios cursos a la vez.
-- No es una tabla nueva ni cambia el modelo existente — cada fila se sigue
-- viendo/editando/borrando por curso exactamente igual que hoy.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table public.recordatorios add column if not exists grupo_id uuid;
