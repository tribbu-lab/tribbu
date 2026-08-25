-- supabase/encuestas-hardening.sql
--
-- Fix de integridad: encuesta_votos.opcion_id no estaba validado contra
-- encuesta_votos.encuesta_id — un voto podía insertarse con la opción de UNA
-- encuesta pero el encuesta_id de OTRA (RLS solo chequeaba membresía de
-- curso sobre encuesta_id, nunca que opcion_id perteneciera a esa misma
-- encuesta), corrompiendo el conteo mostrado.
--
-- Fix real: FK compuesta (opcion_id, encuesta_id) → encuesta_opciones(id,
-- encuesta_id) — la base rechaza el insert/update directamente, no depende
-- de que la RLS lo recuerde chequear. supabase/encuestas.sql ya quedó
-- actualizado con esto para instalaciones nuevas; este archivo es el parche
-- para la base que ya corrió la versión vieja.
--
-- Correr una sola vez, DESPUÉS de encuestas.sql. Requiere que hoy no exista
-- ningún voto ya desincronizado (no debería, la feature es de este mismo
-- día) — si la agrega el ALTER falla con foreign key violation, avisando
-- exactamente ese caso en vez de dejarlo pasar en silencio.

alter table public.encuesta_opciones
  add constraint encuesta_opciones_id_encuesta_uniq unique (id, encuesta_id);

alter table public.encuesta_votos
  drop constraint if exists encuesta_votos_opcion_id_fkey;

alter table public.encuesta_votos
  add constraint encuesta_votos_opcion_encuesta_fk
  foreign key (opcion_id, encuesta_id)
  references public.encuesta_opciones (id, encuesta_id) on delete cascade;
