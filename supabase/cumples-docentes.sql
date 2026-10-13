-- Cumpleaños para docentes (2026-10-13).
--
-- Una docente ve los cumpleaños de los alumnos y de las maestras de sus cursos.
-- No se le abre la RLS de `hijos` (tiene dni) ni la de `cumples` (quién regala,
-- regalo comprado: cosa de las familias): esta RPC devuelve solo nombre, fecha
-- de nacimiento y color. Los festejos siguen siendo solo para los invitados.

create or replace function public.cumples_para_docente(p_cursos uuid[])
returns table(tipo text, id uuid, nombre text, apellido text, fecha_nacimiento date, color text, curso_id uuid)
language sql stable security definer set search_path = public as $$
  select 'alumno'::text, h.id, h.nombre, h.apellido, h.fecha_nacimiento, h.color, h.curso_id
  from public.hijos h
  where h.curso_id = any(p_cursos)
    and h.fecha_nacimiento is not null
    and public.es_docente_curso(h.curso_id)
  union all
  select * from (
    select distinct on (m.id) 'maestro'::text, m.id, m.nombre, m.apellido, m.fecha_nacimiento, null::text, c.curso_id
    from public.maestros m
    join public.clases c on c.maestro_id = m.id
    where c.curso_id = any(p_cursos)
      and m.fecha_nacimiento is not null
      and public.es_docente_curso(c.curso_id)
    order by m.id, c.curso_id
  ) maestras
$$;

revoke all on function public.cumples_para_docente(uuid[]) from public, anon;
grant execute on function public.cumples_para_docente(uuid[]) to authenticated;
