-- =============================================================================
-- docentes.sql · La docente ve y publica en SUS cursos (Fase B)
-- =============================================================================
-- Ver specs/docentes-clases-y-grupos.md. Requiere mensajes-docentes.sql (rol
-- docente, maestros.usuario_id) y materias-y-clases.sql (clases).
--
-- Una docente "es del curso" si tiene una clase en él (es_docente_curso). NO
-- se la suma a es_miembro_curso (que también habilita colectas, votar
-- encuestas, festejos, marketplace…): se agrega explícitamente donde
-- corresponde. Tampoco a comparte_curso → no lee filas de `usuarios` de las
-- familias (teléfono/email); los nombres le llegan por RPC.
--
-- Idempotente.
-- =============================================================================

-- 1) Helpers -------------------------------------------------------------------
create or replace function public.es_docente_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.clases c
    join public.maestros m on m.id = c.maestro_id
    join public.usuarios u on u.id = m.usuario_id
    where c.curso_id = p_curso and u.auth_id = auth.uid() and coalesce(u.activo, true)
  )
$$;

-- La docente "es del colegio" (logo/datos del colegio, menú).
create or replace function public.es_miembro_colegio(p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_colegio_admin_de(p_colegio)
    or exists (select 1 from public.cursos c where c.colegio_id = p_colegio and public.es_miembro_curso(c.id))
    or exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.rol = 'docente' and u.colegio_id = p_colegio)
$$;

-- Ve a las maestras de sus cursos (incluida ella misma).
create or replace function public.es_maestro_visible(p_maestro uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super() or exists (
    select 1 from public.maestro_cursos mc
    where mc.maestro_id = p_maestro and (public.es_miembro_curso(mc.curso_id) or public.es_docente_curso(mc.curso_id))
  ) or exists (select 1 from public.maestros m where m.id = p_maestro and m.usuario_id = public.mi_usuario_id())
$$;

-- El colegio puede editar/borrar lo que publicaron sus docentes (además de lo
-- suyo). Lo usan puede_editar_evento y puede_editar_recordatorio.
create or replace function public.evento_creado_por_colegio(p_creado_por uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = p_creado_por
      and (u.rol = 'super' or (u.rol in ('colegio_admin','docente') and u.colegio_id = public.colegio_de_curso(p_curso)))
  )
$$;

-- Autorizaciones de una docente: las gestiona ella (creadora) y el colegio
-- (puede_ver_lecturas ya cubre ambos casos); nada que cambiar.

-- 2) Policies: sumar es_docente_curso donde la docente tiene que ver/publicar ---
drop policy if exists cursos_select on public.cursos;
create policy cursos_select on public.cursos for select to authenticated
  using (public.es_super() or public.es_miembro_curso(id) or public.es_docente_curso(id) or public.es_colegio_admin_de(colegio_id));

drop policy if exists clases_select on public.clases;
create policy clases_select on public.clases for select to authenticated
  using (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));

drop policy if exists horarios_select on public.horarios;
create policy horarios_select on public.horarios for select to authenticated
  using (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));

drop policy if exists alertas_select on public.alertas;
create policy alertas_select on public.alertas for select to authenticated
  using (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));

-- Avisos: ve los del curso (no los personales de otros) y publica.
drop policy if exists recordatorios_select on public.recordatorios;
create policy recordatorios_select on public.recordatorios for select to authenticated
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or ((public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id))
             and (para_usuario_id is null or para_usuario_id = public.mi_usuario_id()
                  or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id))));
drop policy if exists recordatorios_insert on public.recordatorios;
create policy recordatorios_insert on public.recordatorios for insert to authenticated
  with check (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
              or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
drop policy if exists recordatorios_update on public.recordatorios;
create policy recordatorios_update on public.recordatorios for update to authenticated
  using (public.puede_editar_recordatorio(curso_id, creado_por, para_usuario_id))
  with check (public.puede_editar_recordatorio(curso_id, creado_por, para_usuario_id)
              and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
                   or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)));

-- Eventos: ve los del curso (los festejos siguen siendo solo de las familias
-- invitadas) y crea.
drop policy if exists eventos_select on public.eventos;
create policy eventos_select on public.eventos for select to authenticated
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or ((tipo is distinct from 'festejo') and (public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)))
         or ((tipo = 'festejo') and ((creado_por = public.mi_usuario_id()) or public.es_padre_de(alumno_id) or public.estoy_invitado_a_evento(id))));
drop policy if exists eventos_insert on public.eventos;
create policy eventos_insert on public.eventos for insert to authenticated
  with check (public.es_super() or public.es_miembro_curso(curso_id)
              or (public.es_docente_curso(curso_id) and tipo is distinct from 'festejo')
              or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
drop policy if exists eventos_update on public.eventos;
create policy eventos_update on public.eventos for update to authenticated
  using (public.puede_editar_evento(curso_id, creado_por, tipo, alumno_id))
  with check (public.puede_editar_evento(curso_id, creado_por, tipo, alumno_id)
              and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
                   or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)));

-- Autorizaciones: crea en sus cursos y ve las del curso.
drop policy if exists autorizaciones_select on public.autorizaciones;
create policy autorizaciones_select on public.autorizaciones for select to authenticated
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id));
drop policy if exists autorizaciones_insert on public.autorizaciones;
create policy autorizaciones_insert on public.autorizaciones for insert to authenticated
  with check ((creado_por = public.mi_usuario_id())
              and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
                   or public.es_admin_curso(curso_id) or public.es_docente_curso(curso_id)));

-- Encuestas: crea y ve resultados; NO vota (encuesta_votos_insert no cambia).
create or replace function public.es_docente_curso_de_encuesta(p_encuesta uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$ select public.es_docente_curso((select curso_id from public.encuestas where id = p_encuesta)) $$;

drop policy if exists encuestas_select on public.encuestas;
create policy encuestas_select on public.encuestas for select to authenticated
  using (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
drop policy if exists encuestas_insert on public.encuestas;
create policy encuestas_insert on public.encuestas for insert to authenticated
  with check (public.es_super() or public.es_miembro_curso(curso_id) or public.es_docente_curso(curso_id)
              or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
drop policy if exists encuesta_opciones_select on public.encuesta_opciones;
create policy encuesta_opciones_select on public.encuesta_opciones for select to authenticated
  using (public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) or public.es_docente_curso_de_encuesta(encuesta_id)
         or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id)));
drop policy if exists encuesta_votos_select on public.encuesta_votos;
create policy encuesta_votos_select on public.encuesta_votos for select to authenticated
  using (public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) or public.es_docente_curso_de_encuesta(encuesta_id)
         or public.es_colegio_admin_de(public.colegio_de_encuesta(encuesta_id)));

-- 3) RPCs -----------------------------------------------------------------------

-- Destinatarios de push de un curso (familias + Room Parents), en UNA request.
-- Reemplaza las 3 lecturas de getUserIdsByCurso (que la docente no puede hacer:
-- no lee usuario_cursos/usuario_hijos).
create or replace function public.usuarios_de_curso(p_curso uuid)
returns setof uuid
language sql stable security definer set search_path = public, pg_temp
as $$
  select usuario_id from public.usuario_cursos
  where curso_id = p_curso
    and (public.es_super() or public.es_miembro_curso(p_curso) or public.es_docente_curso(p_curso)
         or public.es_colegio_admin_de(public.colegio_de_curso(p_curso)))
  union
  select uh.usuario_id from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id
  where h.curso_id = p_curso
    and (public.es_super() or public.es_miembro_curso(p_curso) or public.es_docente_curso(p_curso)
         or public.es_colegio_admin_de(public.colegio_de_curso(p_curso)))
$$;

-- Alumnos de un curso de la docente con los NOMBRES de sus apoderados (sin
-- teléfono ni email).
create or replace function public.alumnos_de_curso_docente(p_curso uuid)
returns table (hijo_id uuid, nombre text, apellido text, apoderados jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.apellido,
    coalesce((select jsonb_agg(jsonb_build_object('usuario_id', u.id, 'nombre', btrim(u.nombre || ' ' || coalesce(u.apellido, ''))) order by u.nombre)
              from public.usuario_hijos uh join public.usuarios u on u.id = uh.usuario_id
              where uh.hijo_id = h.id and coalesce(u.activo, true)), '[]'::jsonb)
  from public.hijos h
  where h.curso_id = p_curso and public.es_docente_curso(p_curso)
  order by h.apellido, h.nombre
$$;

-- Etiqueta de autor para lo publicado por docentes ("Laura Fernández · Inglés").
-- Solo devuelve filas de usuarios con rol docente.
create or replace function public.autores_docentes(p_ids uuid[])
returns table (usuario_id uuid, nombre text, materias text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select u.id, btrim(u.nombre || ' ' || coalesce(u.apellido, '')), m.materia
  from public.usuarios u left join public.maestros m on m.usuario_id = u.id
  where u.id = any(p_ids) and u.rol = 'docente'
$$;

revoke all on function public.es_docente_curso(uuid) from public, anon;
revoke all on function public.es_docente_curso_de_encuesta(uuid) from public, anon;
revoke all on function public.usuarios_de_curso(uuid) from public, anon;
revoke all on function public.alumnos_de_curso_docente(uuid) from public, anon;
revoke all on function public.autores_docentes(uuid[]) from public, anon;
grant execute on function public.es_docente_curso(uuid), public.es_docente_curso_de_encuesta(uuid),
  public.usuarios_de_curso(uuid), public.alumnos_de_curso_docente(uuid), public.autores_docentes(uuid[])
to authenticated;
