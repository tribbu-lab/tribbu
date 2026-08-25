-- supabase/recordatorios-hardening.sql
--
-- Fix de seguridad: recordatorios_select restringe los recordatorios
-- dirigidos (para_usuario_id no nulo) a su destinatario, el creador, o el
-- admin del curso — pero recordatorios_update/delete solo pedían ser
-- miembro del curso, sin esa restricción. Cualquier apoderado que se
-- enterara del id de un recordatorio personal de otro (ej. vía un grupo_id
-- compartido de Comunicaciones) podía editarlo o borrarlo directo por
-- PostgREST, aunque nunca lo hubiera podido ver por SELECT.
--
-- Fix: mismo criterio que ya usa recordatorios_select. Correr una sola vez.

drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios for update to authenticated
  using (
    public.es_super() or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  )
  with check (
    public.es_super() or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );

drop policy if exists recordatorios_delete on public.recordatorios;
create policy recordatorios_delete on public.recordatorios for delete to authenticated
  using (
    public.es_super() or (
      public.es_miembro_curso(curso_id) and (
        para_usuario_id is null
        or para_usuario_id = public.mi_usuario_id()
        or creado_por     = public.mi_usuario_id()
        or public.es_admin_curso(curso_id)
      )
    )
  );
