-- Quién puede editar / borrar un evento (2026-09-24).
--
-- Antes: cualquier miembro del curso podía editar o borrar CUALQUIER evento
-- del curso (eventos_update / eventos_delete con es_miembro_curso) — solo la
-- pantalla lo frenaba. Ahora:
--   · quien lo creó (sea cual sea su rol),
--   · la Room Parent del curso (es_admin_curso),
--   · el colegio (colegio_admin de ese colegio) y super,
--   · en un festejo, también el otro padre/madre del cumpleañero.
--
-- Y evento_asistencia pasa a borrarse en cascada con el evento: antes la app
-- borraba las confirmaciones a mano antes del evento (la FK no tenía cascade),
-- lo que obligaba a dejar que cualquiera borrara confirmaciones ajenas.
--
-- Correr una vez. Idempotente.

create or replace function public.puede_editar_evento(p_curso uuid, p_creado_por uuid, p_tipo text, p_alumno uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_admin_curso(p_curso)
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_tipo = 'festejo' and p_alumno is not null and public.es_padre_de(p_alumno))
$$;

revoke all on function public.puede_editar_evento(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.puede_editar_evento(uuid, uuid, text, uuid) to authenticated;

drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (public.puede_editar_evento(curso_id, creado_por, tipo, alumno_id))
  with check (
    public.puede_editar_evento(curso_id, creado_por, tipo, alumno_id)
    and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_miembro_curso(curso_id))
  );

drop policy if exists eventos_delete on public.eventos;
create policy eventos_delete on public.eventos for delete to authenticated
  using (public.puede_editar_evento(curso_id, creado_por, tipo, alumno_id));

alter table public.evento_asistencia drop constraint if exists evento_asistencia_evento_id_fkey;
alter table public.evento_asistencia
  add constraint evento_asistencia_evento_id_fkey
  foreign key (evento_id) references public.eventos(id) on delete cascade;
