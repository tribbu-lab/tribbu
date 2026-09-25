-- Permisos de escritura por dueño en avisos, pagos de colectas, asistencias y
-- cumples (2026-09-25). Mismo criterio que eventos-permisos-edicion.sql y
-- colectas-permisos.sql: antes cualquier miembro del curso podía editar o
-- borrar lo de cualquiera (solo la pantalla lo frenaba).
--
-- · recordatorios (avisos + Comunicaciones del colegio): super; el colegio,
--   solo lo que creó el colegio; quien lo creó; el destinatario de un aviso
--   personal (para_usuario_id); avisos viejos sin creado_por → Room Parent.
-- · colecta_pagos: la familia del alumno (es_padre_de) o quien gestiona la
--   colecta (puede_gestionar_colecta: RP, responsable, creador, colegio).
-- · evento_asistencia: la familia del invitado (o el invitado directo), quien
--   gestiona el evento (puede_editar_evento) y el colegio.
-- · cumples (responsable del regalo / comprado): Room Parent, colegio,
--   el responsable.
--
-- Y borrado en cascada donde la app limpiaba a mano filas que la RLS no le
-- deja ver/borrar: recordatorio_leidos (cada uno ve solo las suyas → borrar un
-- aviso ya leído por otros fallaba por FK), colecta_pagos, cumples y
-- evento_asistencia al borrar la colecta / el alumno.
--
-- Correr una vez, después de eventos-permisos-edicion.sql y
-- colectas-permisos.sql. Idempotente.

-- ── Helpers por id (security definer: leen la fila padre sin RLS) ──────────
create or replace function public.puede_editar_evento_id(p_evento uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.eventos e
    where e.id = p_evento and public.puede_editar_evento(e.curso_id, e.creado_por, e.tipo, e.alumno_id)
  )
$$;

create or replace function public.puede_gestionar_colecta_id(p_colecta uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.colectas c
    where c.id = p_colecta and public.puede_gestionar_colecta(c.curso_id, c.responsable_id, c.creado_por)
  )
$$;

create or replace function public.puede_editar_recordatorio(p_curso uuid, p_creado_por uuid, p_para uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or (public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) and public.evento_creado_por_colegio(p_creado_por, p_curso))
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_para is not null and p_para = public.mi_usuario_id())
      or (p_creado_por is null and public.es_admin_curso(p_curso))
$$;

revoke all on function public.puede_editar_evento_id(uuid) from public, anon;
revoke all on function public.puede_gestionar_colecta_id(uuid) from public, anon;
revoke all on function public.puede_editar_recordatorio(uuid, uuid, uuid) from public, anon;
grant execute on function public.puede_editar_evento_id(uuid) to authenticated;
grant execute on function public.puede_gestionar_colecta_id(uuid) to authenticated;
grant execute on function public.puede_editar_recordatorio(uuid, uuid, uuid) to authenticated;

-- ── recordatorios ──────────────────────────────────────────────────────────
drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios for update to authenticated
  using (public.puede_editar_recordatorio(curso_id, creado_por, para_usuario_id))
  with check (
    public.puede_editar_recordatorio(curso_id, creado_por, para_usuario_id)
    and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_miembro_curso(curso_id))
  );

drop policy if exists recordatorios_delete on public.recordatorios;
create policy recordatorios_delete on public.recordatorios for delete to authenticated
  using (public.puede_editar_recordatorio(curso_id, creado_por, para_usuario_id));

-- ── colecta_pagos ──────────────────────────────────────────────────────────
drop policy if exists colecta_pagos_insert on public.colecta_pagos;
create policy colecta_pagos_insert on public.colecta_pagos for insert to authenticated
  with check (
    public.es_miembro_curso_de_colecta(colecta_id) and public.es_padre_de(alumno_id)
    or public.puede_gestionar_colecta_id(colecta_id)
  );

drop policy if exists colecta_pagos_update on public.colecta_pagos;
create policy colecta_pagos_update on public.colecta_pagos for update to authenticated
  using (public.es_padre_de(alumno_id) or public.puede_gestionar_colecta_id(colecta_id))
  with check (
    public.es_miembro_curso_de_colecta(colecta_id) and public.es_padre_de(alumno_id)
    or public.puede_gestionar_colecta_id(colecta_id)
  );

drop policy if exists colecta_pagos_delete on public.colecta_pagos;
create policy colecta_pagos_delete on public.colecta_pagos for delete to authenticated
  using (public.es_padre_de(alumno_id) or public.puede_gestionar_colecta_id(colecta_id));

-- ── evento_asistencia ──────────────────────────────────────────────────────
drop policy if exists evento_asistencia_insert on public.evento_asistencia;
create policy evento_asistencia_insert on public.evento_asistencia for insert to authenticated
  with check (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_evento(evento_id))
    or public.puede_editar_evento_id(evento_id)
    or (public.es_miembro_curso_de_evento(evento_id) and (
         (alumno_invitado_id is not null and public.es_padre_de(alumno_invitado_id))
      or (alumno_invitado_id is null and usuario_id = public.mi_usuario_id())))
  );

drop policy if exists evento_asistencia_update on public.evento_asistencia;
create policy evento_asistencia_update on public.evento_asistencia for update to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_evento(evento_id))
    or public.puede_editar_evento_id(evento_id)
    or (alumno_invitado_id is not null and public.es_padre_de(alumno_invitado_id))
    or (alumno_invitado_id is null and usuario_id = public.mi_usuario_id())
  )
  with check (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_evento(evento_id))
    or public.puede_editar_evento_id(evento_id)
    or (alumno_invitado_id is not null and public.es_padre_de(alumno_invitado_id))
    or (alumno_invitado_id is null and usuario_id = public.mi_usuario_id())
  );

drop policy if exists evento_asistencia_delete on public.evento_asistencia;
create policy evento_asistencia_delete on public.evento_asistencia for delete to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_evento(evento_id))
    or public.puede_editar_evento_id(evento_id)
  );

-- ── cumples ────────────────────────────────────────────────────────────────
drop policy if exists cumples_insert on public.cumples;
create policy cumples_insert on public.cumples for insert to authenticated
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_admin_curso(curso_id));

drop policy if exists cumples_update on public.cumples;
create policy cumples_update on public.cumples for update to authenticated
  using (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_admin_curso(curso_id)
    or (responsable_id is not null and responsable_id = public.mi_usuario_id())
  )
  with check (
    public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_admin_curso(curso_id)
    or (responsable_id is not null and responsable_id = public.mi_usuario_id())
  );

drop policy if exists cumples_delete on public.cumples;
create policy cumples_delete on public.cumples for delete to authenticated
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_admin_curso(curso_id));

-- ── Borrado en cascada ─────────────────────────────────────────────────────
alter table public.recordatorio_leidos drop constraint if exists recordatorio_leidos_recordatorio_id_fkey;
alter table public.recordatorio_leidos add constraint recordatorio_leidos_recordatorio_id_fkey
  foreign key (recordatorio_id) references public.recordatorios(id) on delete cascade;

alter table public.colecta_pagos drop constraint if exists colecta_pagos_colecta_id_fkey;
alter table public.colecta_pagos add constraint colecta_pagos_colecta_id_fkey
  foreign key (colecta_id) references public.colectas(id) on delete cascade;

alter table public.colecta_pagos drop constraint if exists colecta_pagos_alumno_id_fkey;
alter table public.colecta_pagos add constraint colecta_pagos_alumno_id_fkey
  foreign key (alumno_id) references public.hijos(id) on delete cascade;

alter table public.cumples drop constraint if exists cumples_alumno_id_fkey;
alter table public.cumples add constraint cumples_alumno_id_fkey
  foreign key (alumno_id) references public.hijos(id) on delete cascade;

alter table public.evento_asistencia drop constraint if exists evento_asistencia_alumno_invitado_id_fkey;
alter table public.evento_asistencia add constraint evento_asistencia_alumno_invitado_id_fkey
  foreign key (alumno_invitado_id) references public.hijos(id) on delete cascade;
