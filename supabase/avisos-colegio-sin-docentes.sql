-- Los comunicados del colegio a las familias no le llegan a las maestras
-- (2026-10-21, pedido de Yanina). Hasta ahora una docente veía en Avisos /
-- Inicio / campana todo recordatorio de los cursos donde da clase
-- (es_docente_curso en recordatorios_select, docentes.sql), incluidas las
-- Comunicaciones que el colegio les manda a los apoderados. Push no recibía
-- (usuarios_de_curso no incluye docentes), pero sí los veía como "sin leer".
--
-- Ahora la rama docente excluye lo que publicó el colegio (un super o un
-- colegio_admin de ese colegio). Sigue viendo lo suyo, lo de otras maestras y
-- lo de la Room Parent. Si además es apoderada de ese curso, lo ve como familia.
--
-- Correr después de docentes.sql. Idempotente.

-- ¿El autor es del colegio (super o colegio_admin del colegio del curso)?
create or replace function public.recordatorio_del_colegio(p_creado_por uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_creado_por
      and (u.rol = 'super' or (u.rol = 'colegio_admin' and u.colegio_id = public.colegio_de_curso(p_curso)))
  )
$$;
revoke all on function public.recordatorio_del_colegio(uuid, uuid) from public, anon;
grant execute on function public.recordatorio_del_colegio(uuid, uuid) to authenticated;

drop policy if exists recordatorios_select on public.recordatorios;
create policy recordatorios_select on public.recordatorios for select to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
    or (
      (public.es_miembro_curso(curso_id)
       or (public.es_docente_curso(curso_id) and not public.recordatorio_del_colegio(creado_por, curso_id)))
      and (para_usuario_id is null or para_usuario_id = public.mi_usuario_id()
           or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id))
    )
  );
