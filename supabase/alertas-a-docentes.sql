-- Las alertas del colegio son para todos: también les llega el push a las
-- maestras del curso (2026-10-21, pedido de Yanina). usuarios_de_curso no
-- incluye docentes a propósito (los comunicados a familias no son para ellas),
-- así que las alertas suman esta lista aparte.
-- Devuelve los usuario_id (rol docente) de las maestras que dan clase en el
-- curso. Solo para quien puede mandar una alerta a ese curso: super, el
-- colegio, la Secretaría de su nivel o la Room Parent. Idempotente.
create or replace function public.docentes_de_curso(p_curso uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct m.usuario_id
  from public.clases cl
  join public.maestros m on m.id = cl.maestro_id
  join public.usuarios u on u.id = m.usuario_id and u.rol = 'docente' and coalesce(u.activo, true)
  where cl.curso_id = p_curso
    and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
         or public.es_secretaria_de_curso(p_curso) or public.es_admin_curso(p_curso))
$$;
revoke all on function public.docentes_de_curso(uuid) from public, anon;
grant execute on function public.docentes_de_curso(uuid) to authenticated;
