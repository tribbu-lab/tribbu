-- supabase/maestros-apellido.sql
--
-- maestros solo tenía `nombre` como campo único ("Carlos Gómez" todo junto),
-- a diferencia de usuarios/hijos que ya separan nombre/apellido. Se agrega
-- la columna — queda null en los maestros ya cargados (no se puede partir
-- "Carlos Gómez" de forma confiable de forma automática para todos los
-- casos: apellidos compuestos, etc.) así que conviene revisar/completar el
-- apellido de los maestros existentes a mano desde Super Admin → Maestros
-- después de correr esto.
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table public.maestros
  add column if not exists apellido text;
