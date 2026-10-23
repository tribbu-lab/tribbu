-- supabase/recordatorios-solo-familias.sql (2026-10-23)
--
-- Los recordatorios automáticos de las familias (tipo 'colecta_vence', que se
-- crea al abrir una colecta, y 'regalo_cumple', el regalo de un cumpleaños)
-- los ven solo las familias del curso — y el super —, igual que las colectas
-- y los festejos (colectas-encuestas-privadas.sql, festejos-sin-colegio.sql).
-- Antes la docente los veía en Avisos y en el Calendario ("Colecta … Recordá
-- abonar"), y el colegio (administración / Secretaría) también.
--
-- Mismo recordatorios_select de prod, con `not es_recordatorio_de_familias(tipo)`
-- en la rama del colegio y en la de la docente. Una familia que además es
-- staff los sigue viendo por la rama de miembro del curso.
--
-- Idempotente. Se aplicó con `npx supabase db query --linked -f`.

create or replace function public.es_recordatorio_de_familias(p_tipo text)
returns boolean language sql immutable set search_path = public, pg_temp
as $$ select coalesce(p_tipo, 'general') in ('colecta_vence', 'regalo_cumple') $$;

alter policy recordatorios_select on public.recordatorios
  using (
    es_super()
    or ((es_colegio_admin_de(colegio_de_curso(curso_id)) or es_secretaria_de_curso(curso_id))
        and not es_recordatorio_de_familias(tipo))
    or ((es_miembro_curso(curso_id)
         or (es_docente_curso(curso_id)
             and not recordatorio_del_colegio(creado_por, curso_id)
             and not es_recordatorio_de_familias(tipo)))
        and (para_usuario_id is null or para_usuario_id = mi_usuario_id()
             or creado_por = mi_usuario_id() or es_admin_curso(curso_id)))
  );
