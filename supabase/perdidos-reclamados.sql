-- Perdidos y encontrados: qué objetos ya fueron reclamados ("¡Es mío!" /
-- "Lo tengo yo"). La RLS de objeto_perdido_avisos solo deja ver los avisos
-- propios, así que una familia no sabía si otra ya había reclamado un
-- encontrado: el Muro seguía preguntando "¿es de tu hijo?" y "¿Será este?"
-- lo seguía sugiriendo. Esto devuelve solo los ids (nunca quién avisó), y
-- solo de objetos que quien consulta puede ver.
--
-- Correr una vez, después de perdidos-y-encontrados.sql.

create or replace function public.objetos_reclamados(p_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct a.objeto_id
  from public.objeto_perdido_avisos a
  where a.objeto_id = any(p_ids)
    and public.puede_ver_objeto_perdido(a.objeto_id)
$$;

revoke all on function public.objetos_reclamados(uuid[]) from public, anon;
grant execute on function public.objetos_reclamados(uuid[]) to authenticated;
