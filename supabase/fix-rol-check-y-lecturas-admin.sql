-- =============================================================================
-- fix-rol-check-y-lecturas-admin.sql
-- =============================================================================
-- Correr UNA vez en el SQL editor de Supabase (proyecto tribbu). Idempotente.
--
-- Arregla dos cosas que rompían el panel de Super Admin / colegio_admin:
--
-- 1) `usuarios_rol_check` quedó inconsistente entre multi-colegio.sql
--    (['padre','admin','super','colegio_admin']) y rol-admin-a-room.sql
--    (['padre','room','super','colegio_admin']). Según cuál corrió último,
--    guardar un apoderado como Room Parent (rol='room') o incluso editarle
--    el teléfono tiraba una violación de constraint. Se deja el SUPERSET.
--
-- 2) Un `colegio_admin` no podía LEER de vuelta un maestro / apoderado recién
--    creado (la policy SELECT lo resuelve por membresía de curso, que todavía
--    no existe en el instante del alta) → el alta "no hacía nada". El cliente
--    ya genera el id localmente para no depender del readback, pero además
--    conviene que el colegio_admin pueda ver a los usuarios de su colegio_id
--    aunque todavía no tengan curso/hijo asignado.
-- =============================================================================

-- 1) constraint de rol — superset
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol = any (array['padre','admin','room','super','colegio_admin']));

-- 2) un usuario con colegio_id propio es visible/editable para el colegio_admin
--    de ese colegio, aunque no tenga usuario_cursos/usuario_hijos todavía.
drop policy if exists usuarios_select on public.usuarios;
create policy usuarios_select on public.usuarios for select to authenticated
  using (
    public.es_super()
    or id = public.mi_usuario_id()
    or public.comparte_curso(id)
    or public.es_colegio_admin_de_usuario(id)
    or (colegio_id is not null and public.es_colegio_admin_de(colegio_id))
  );

drop policy if exists usuarios_update on public.usuarios;
create policy usuarios_update on public.usuarios for update to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de_usuario(id)
    or (colegio_id is not null and public.es_colegio_admin_de(colegio_id))
  )
  with check (
    public.es_super()
    or (
      rol not in ('super','colegio_admin')
      and (
        public.es_colegio_admin_de_usuario(id)
        or (colegio_id is not null and public.es_colegio_admin_de(colegio_id))
      )
    )
  );
