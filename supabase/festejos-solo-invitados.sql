-- supabase/festejos-solo-invitados.sql
--
-- Un festejo (eventos.tipo = 'festejo', el cumple de un alumno con su lista
-- de invitados) solo lo ven quienes tienen que ver con él. Antes lo veía todo
-- el curso — en el Calendario y en Cumpleaños aparecía la fiesta aunque tu
-- hijo no estuviera invitado.
--
-- Pueden verlo:
--   - las familias con un hijo invitado (evento_asistencia.alumno_invitado_id)
--     o invitadas directamente (evento_asistencia.usuario_id),
--   - la familia del cumpleañero (eventos.alumno_id),
--   - quien lo creó (eventos.creado_por),
--   - super y el colegio_admin de ese colegio (administración).
-- Un Room Parent NO lo ve por serlo: solo si cae en alguno de los casos de
-- arriba. El resto de los eventos (actos, reuniones, etc.) no cambia: los ve
-- todo el curso, como siempre.
--
-- Filtrarlo en RLS y no solo en la UI: si no, cualquier miembro del curso lo
-- seguiría leyendo por la API. El feed ICS (calendar-feed) usa la service
-- role y aplica el mismo criterio a mano.
--
-- Correr una vez, después de rls-hardening.sql y multi-colegio.sql.

create or replace function public.estoy_invitado_a_evento(p_evento uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.evento_asistencia ea
    where ea.evento_id = p_evento
      and (
        ea.usuario_id = public.mi_usuario_id()
        or exists (
          select 1 from public.usuario_hijos uh
          where uh.hijo_id = ea.alumno_invitado_id and uh.usuario_id = public.mi_usuario_id()
        )
      )
  )
$$;

grant execute on function public.estoy_invitado_a_evento(uuid) to authenticated;

drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
    or (tipo is distinct from 'festejo' and public.es_miembro_curso(curso_id))
    or (
      tipo = 'festejo' and (
        creado_por = public.mi_usuario_id()
        or public.es_padre_de(alumno_id)
        or public.estoy_invitado_a_evento(id)
      )
    )
  );
