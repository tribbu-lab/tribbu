-- supabase/eventos-multi-curso.sql
--
-- Eventos multi-curso (mismo patrón que comunicaciones-multi-curso.sql para
-- recordatorios): une con un id compartido las filas de `eventos` que nacen
-- de un mismo evento publicado por Super Admin / Admin de Colegio en varios
-- cursos a la vez (ej. un feriado, un acto de todo el colegio). No es una
-- tabla nueva ni cambia el modelo existente — cada fila se sigue
-- viendo/editando/borrando por curso exactamente igual que hoy.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table public.eventos add column if not exists grupo_id uuid;
