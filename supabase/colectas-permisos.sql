-- Quién puede editar / cerrar / borrar una colecta (2026-09-24).
--
-- Antes: cualquier miembro del curso podía editar, cerrar o borrar CUALQUIER
-- colecta del curso (colectas_update / colectas_delete con es_miembro_curso)
-- — solo la pantalla lo frenaba. Ahora:
--   · super y el colegio (colegio_admin de ese colegio),
--   · la Room Parent del curso (es_admin_curso),
--   · el responsable de la colecta (responsable_id, quien junta la plata),
--   · quien la creó (creado_por, columna nueva: las colectas no lo guardaban).
-- Los pagos (colecta_pagos) no cambian: cada familia sigue marcando el suyo.
--
-- Correr una vez. Idempotente.

-- creado_por: se completa solo con quien inserta (mi_usuario_id() lee el JWT);
-- las colectas viejas quedan en null y las gestionan RP / responsable / colegio.
alter table public.colectas
  add column if not exists creado_por uuid references public.usuarios(id) on delete set null;
alter table public.colectas alter column creado_por set default public.mi_usuario_id();

create or replace function public.puede_gestionar_colecta(p_curso uuid, p_responsable uuid, p_creado_por uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_admin_curso(p_curso)
      or (p_responsable is not null and p_responsable = public.mi_usuario_id())
      or (p_creado_por  is not null and p_creado_por  = public.mi_usuario_id())
$$;

revoke all on function public.puede_gestionar_colecta(uuid, uuid, uuid) from public, anon;
grant execute on function public.puede_gestionar_colecta(uuid, uuid, uuid) to authenticated;

drop policy if exists colectas_update on public.colectas;
create policy colectas_update on public.colectas for update to authenticated
  using (public.puede_gestionar_colecta(curso_id, responsable_id, creado_por))
  with check (
    public.puede_gestionar_colecta(curso_id, responsable_id, creado_por)
    and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_miembro_curso(curso_id))
  );

drop policy if exists colectas_delete on public.colectas;
create policy colectas_delete on public.colectas for delete to authenticated
  using (public.puede_gestionar_colecta(curso_id, responsable_id, creado_por));
