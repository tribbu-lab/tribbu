-- Grupos de Mensajes: además del nombre de quien escribe, "familia de Juan"
-- (2026-10-20). En el grupo del curso las familias se conocen por los chicos,
-- no por el nombre de los padres.
--
-- autores_conversacion suma la columna `familia` (familia_de(): solo hijos en
-- cursos donde quien pregunta es miembro, nunca revela alumnos de otros
-- cursos). Cambia el tipo de retorno, así que se dropea y se recrea; la app
-- vieja lee solo usuario_id/nombre y sigue andando.

drop function if exists public.autores_conversacion(uuid);
create function public.autores_conversacion(p_conv uuid)
returns table (usuario_id uuid, nombre text, familia text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, '')),
    case when u.rol not in ('super', 'colegio_admin', 'docente') then public.familia_de(u.id) end
  from public.mensajes m join public.usuarios u on u.id = m.autor_id
  where m.conversacion_id = p_conv and public.es_miembro_conversacion(p_conv)
$$;
revoke all on function public.autores_conversacion(uuid) from public, anon;
grant execute on function public.autores_conversacion(uuid) to authenticated;
