-- La Secretaría (nivel_admin) ve a las maestras de los cursos de sus niveles
-- (2026-10-21). Faltaba en roles-por-nivel.sql: es_maestro_visible no la
-- contemplaba, así que en su panel "Docentes" daba 0 y los horarios/clases de
-- sus cursos salían sin el nombre de la maestra. Solo lectura: las maestras
-- las sigue gestionando el administrador. Idempotente.
create or replace function public.es_maestro_visible(p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super() or exists (
    select 1 from public.maestro_cursos mc
    where mc.maestro_id = p_maestro
      and (public.es_miembro_curso(mc.curso_id) or public.es_docente_curso(mc.curso_id) or public.es_secretaria_de_curso(mc.curso_id))
  ) or exists (select 1 from public.maestros m where m.id = p_maestro and m.usuario_id = public.mi_usuario_id())
$$;
