-- supabase/comunicaciones-titulo-descripcion.sql
--
-- La Comunicación del colegio (ComunicacionesAdmin en Super Admin, ver
-- specs/comunicaciones-multi-curso.md) pasa de un único campo "texto" a
-- "título" + "descripción". No se toca el modelo existente: `titulo` es
-- una columna nueva, nullable — `null` para cualquier recordatorio normal
-- (Room Parent) o comunicación publicada antes de esta migración, que
-- sigue mostrando solo `texto` exactamente como hoy. `texto` sigue siendo
-- obligatoria (ahora funciona como "descripción" para las comunicaciones
-- que sí cargan título).
--
-- Correr una sola vez en el SQL editor de Supabase.

alter table public.recordatorios add column if not exists titulo text;
