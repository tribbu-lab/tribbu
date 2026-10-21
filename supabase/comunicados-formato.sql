-- Comunicados con membrete (2026-10-21). Ver specs/comunicados-con-formato.md.
--
-- · recordatorios.con_membrete: el comunicado del colegio se muestra con el
--   encabezado (logo + nombre + línea) y la firma del colegio.
-- · colegios.membrete_linea / membrete_firma: lo general; membrete_niveles
--   (jsonb { "primaria": { "linea": "...", "firma": "..." } }) pisa lo general
--   para los cursos de ese nivel (roles-por-nivel.sql).
-- El formato del texto (negrita, títulos, listas, links) no necesita columnas:
-- va como Markdown acotado en recordatorios.texto.
--
-- Aditivo e idempotente. Las políticas de colegios/recordatorios no cambian
-- (el colegio ya edita su fila de colegios y sus recordatorios).

alter table public.recordatorios add column if not exists con_membrete boolean not null default false;

alter table public.colegios add column if not exists membrete_linea text;
alter table public.colegios add column if not exists membrete_firma text;
alter table public.colegios add column if not exists membrete_niveles jsonb not null default '{}'::jsonb;
