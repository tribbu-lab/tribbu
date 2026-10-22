-- =============================================================================
-- Festejos de cumpleaños: entre familias (2026-10-22, pedido de Yanina).
-- El colegio (administración y Secretaría/Dirección por nivel) sigue viendo
-- todos los eventos de sus cursos, pero ya no los festejos ni sus
-- confirmaciones de asistencia. Los festejos los ven la familia del
-- cumpleañero, las familias invitadas y quien lo creó (como antes) y super
-- (soporte de la plataforma). Las maestras ya no los veían.
-- Idempotente. Probado en una transacción con rollback.
-- =============================================================================

create or replace function public.evento_es_festejo(p_evento uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.eventos e where e.id = p_evento and e.tipo = 'festejo')
$$;
revoke all on function public.evento_es_festejo(uuid) from public, anon;
grant execute on function public.evento_es_festejo(uuid) to authenticated;

alter policy eventos_select on public.eventos
  using (es_super()
    OR ((tipo IS DISTINCT FROM 'festejo')
        AND (es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id)
             OR es_miembro_curso(curso_id) OR es_docente_curso(curso_id)))
    OR ((tipo = 'festejo')
        AND ((creado_por = mi_usuario_id()) OR es_padre_de(alumno_id) OR estoy_invitado_a_evento(id))));

alter policy evento_asistencia_select on public.evento_asistencia
  using (es_super() OR es_miembro_curso_de_evento(evento_id)
    OR ((es_colegio_admin_de(colegio_de_evento(evento_id)) OR es_secretaria_de_evento(evento_id))
        AND NOT evento_es_festejo(evento_id)));
