-- supabase/room-parent-avisos-autorizaciones.sql
--
-- Avisos y autorizaciones: el Room Parent queda igual que cualquier apoderado.
-- Idempotente. Probar antes en una transacción con rollback, y aplicarlo DESPUÉS
-- de publicar la web: si no, la web vieja le sigue ofreciendo al Room Parent
-- crear autorizaciones, y le fallaría.
--
-- 1) Avisos: deja de ver quién leyó los avisos ajenos y los personales de otras
--    familias, y de editar los que no tienen creador.
-- 2) Autorizaciones: las crean solo el colegio y las maestras. El Room Parent ya
--    no crea ni gestiona las ajenas; las que él creó las sigue gestionando.
--
-- No cambia: gestionar colectas, moderar el grupo del curso y Lost & Found.

create or replace function public.puede_ver_lecturas(p_curso uuid, p_creado_por uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
$$;

create or replace function public.puede_editar_recordatorio(p_curso uuid, p_creado_por uuid, p_para uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or ((public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso))
          and public.evento_creado_por_colegio(p_creado_por, p_curso))
      or (p_creado_por is not null and p_creado_por = public.mi_usuario_id())
      or (p_para is not null and p_para = public.mi_usuario_id())
$$;

alter policy recordatorios_select on public.recordatorios
  using (
    public.es_super()
    or ((public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id))
        and not public.es_recordatorio_de_familias(tipo))
    or ((public.es_miembro_curso(curso_id)
         or (public.es_docente_curso(curso_id)
             and not public.recordatorio_del_colegio(creado_por, curso_id)
             and not public.es_recordatorio_de_familias(tipo)))
        and (para_usuario_id is null or para_usuario_id = public.mi_usuario_id() or creado_por = public.mi_usuario_id()))
  );

alter policy autorizaciones_insert on public.autorizaciones
  with check (
    creado_por = public.mi_usuario_id()
    and (public.es_super()
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or public.es_secretaria_de_curso(curso_id)
         or public.es_docente_curso(curso_id))
  );
