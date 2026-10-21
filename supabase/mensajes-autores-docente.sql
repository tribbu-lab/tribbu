-- Chats con la maestra y con Secretaría: el mismo formato que los grupos de
-- familias (2026-10-21). Cada burbuja ya lleva el nombre de quien escribe;
-- faltaba el dato al lado:
--   · apoderado → "familia de <alumno del hilo>". familia_de() solo cuenta
--     hijos en cursos donde quien pregunta es miembro, así que a la maestra y a
--     Secretaría (que no son miembros del curso) les llegaba vacío. En estos
--     hilos el alumno es uno solo (conversaciones.hijo_id).
--   · maestra → la(s) materia(s) que da en el curso del alumno ("Inglés").
-- Mismo tipo de retorno que mensajes-autores-familia.sql: no hace falta
-- dropear y la app no cambia (la columna `familia` es el texto de al lado).

create or replace function public.autores_conversacion(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
    case
      when c.tipo in ('docente', 'colegio') and u.rol not in ('super', 'colegio_admin', 'docente')
        then (select 'familia de ' || h.nombre from public.hijos h where h.id = c.hijo_id)
      when c.tipo = 'docente' and u.rol = 'docente'
        then (select string_agg(distinct ma.nombre, ', ')
              from public.maestros mt
              join public.clases cl on cl.maestro_id = mt.id
              join public.materias ma on ma.id = cl.materia_id
              join public.hijos h on h.id = c.hijo_id and h.curso_id = cl.curso_id
              where mt.id = c.maestro_id and mt.usuario_id = u.id)
      when u.rol not in ('super', 'colegio_admin', 'docente') then public.familia_de(u.id)
    end
  from public.mensajes m
  join public.usuarios u on u.id = m.autor_id
  join public.conversaciones c on c.id = m.conversacion_id
  where m.conversacion_id = p_conv and public.es_miembro_conversacion(p_conv)
$$;
revoke all on function public.autores_conversacion(uuid) from public, anon;
grant execute on function public.autores_conversacion(uuid) to authenticated;
