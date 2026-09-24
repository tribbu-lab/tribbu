-- Quién puede editar / borrar un evento (2026-09-24).
--
-- Antes: cualquier miembro del curso podía editar o borrar CUALQUIER evento
-- del curso (eventos_update / eventos_delete con es_miembro_curso) — solo la
-- pantalla lo frenaba. Ahora:
--   · super: cualquier evento de la plataforma,
--   · el colegio (colegio_admin de ese colegio): solo los que creó el colegio
--     (creado_por es un colegio_admin de ese colegio o un super),
--   · cualquier otro (Room Parent incluida): solo lo que creó él mismo,
--   · en un festejo, también el otro padre/madre del cumpleañero.
-- (2026-09-24, 2ª versión: la Room Parent ya no puede sobre eventos ajenos.)
--
-- Y evento_asistencia pasa a borrarse en cascada con el evento: antes la app
-- borraba las confirmaciones a mano antes del evento (la FK no tenía cascade),
-- lo que obligaba a dejar que cualquiera borrara confirmaciones ajenas.
--
-- Correr una vez. Idempotente.

-- ¿Lo creó el colegio? (un colegio_admin de ese colegio, o un super)
create or replace function public.evento_creado_por_colegio(p_creado_por uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_creado_por
      and (u.rol = 'super' or (u.rol = 'colegio_admin' and u.colegio_id = public.colegio_de_curso(p_curso)))
  )
$$;

create or replace function public.puede_editar_evento(p_curso uuid, p_creado_por uuid, p_tipo text, p_alumno uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or (public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) and public.evento_creado_por_colegio(p_creado_por, p_curso))
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_tipo = 'festejo' and p_alumno is not null and public.es_padre_de(p_alumno))
$$;

revoke all on function public.evento_creado_por_colegio(uuid, uuid) from public, anon;
grant execute on function public.evento_creado_por_colegio(uuid, uuid) to authenticated;
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

-- Festejos de un alumno: se borran con el alumno. Al dar de baja un alumno
-- desde el panel, el colegio ya no puede borrar a mano los festejos que creó
-- la familia (regla de arriba); con cascade la baja sigue funcionando.
alter table public.eventos drop constraint if exists eventos_alumno_id_fkey;
alter table public.eventos
  add constraint eventos_alumno_id_fkey
  foreign key (alumno_id) references public.hijos(id) on delete cascade;
