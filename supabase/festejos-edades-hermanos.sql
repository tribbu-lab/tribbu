-- supabase/festejos-edades-hermanos.sql
--
-- Respuesta a una invitación de cumpleaños (evento_asistencia): además de
-- cuántos hermanos van, la edad de cada uno (años). Traer hermanos es
-- opcional, y la edad de cada uno también (una por hermano, null = sin edad,
-- en el mismo orden). Sale en el resumen del organizador y en el Excel.

alter table public.evento_asistencia
  add column if not exists hermanos_edades smallint[];
