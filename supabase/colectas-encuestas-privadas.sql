-- =============================================================================
-- Colectas y encuestas de las familias: privadas de las familias (2026-10-22,
-- pedido de Yanina).
--
-- · Colectas (+ pagos y participantes): las ven solo las familias del curso
--   (Room Parent incluida) y super. El colegio (administración, Secretaría/
--   Dirección por nivel) y las maestras ya no. (Las maestras nunca estuvieron.)
-- · Encuestas (+ opciones y votos): las maestras, la administración y la
--   Secretaría ven solo las que mandó el colegio (las creó un colegio_admin,
--   una Secretaría/Dirección o una maestra, o super). Las que arman las
--   familias (apoderados, Room Parent) quedan entre las familias del curso.
--
-- Para que el panel siga andando sin leer esas filas:
-- · contenido_de_curso(curso): cuenta avisos/eventos/colectas/alertas/encuestas
--   para el chequeo "no se puede borrar un curso con contenido".
-- · Las referencias a un usuario que se borra se ponen en null solas
--   (responsable/pagado_por/creado_por) y sus votos se borran en cascada.
-- Idempotente. Probado en una transacción con rollback.
-- =============================================================================

-- ¿La creó el colegio? (por quién la creó; null = familia o usuario borrado)
create or replace function public.creado_por_colegio(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_usuario is not null and exists (
    select 1 from public.usuarios u where u.id = p_usuario and u.rol in ('super','colegio_admin','nivel_admin','docente'))
$$;

create or replace function public.encuesta_del_colegio(p_encuesta uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.encuestas e where e.id = p_encuesta and public.creado_por_colegio(e.creado_por))
$$;

-- Colectas: sin las ramas del colegio
alter policy colectas_select on public.colectas
  using (es_super() OR es_miembro_curso(curso_id));
alter policy colecta_pagos_select on public.colecta_pagos
  using (es_super() OR es_miembro_curso_de_colecta(colecta_id));
alter policy colecta_participantes_select on public.colecta_participantes
  using (es_super() OR es_miembro_curso_de_colecta(colecta_id));

-- Encuestas: el colegio y las maestras, solo las del colegio
alter policy encuestas_select on public.encuestas
  using (es_super() OR es_miembro_curso(curso_id)
         OR ((es_docente_curso(curso_id) OR es_colegio_admin_de(colegio_de_curso(curso_id)) OR es_secretaria_de_curso(curso_id))
             AND creado_por_colegio(creado_por)));
alter policy encuesta_opciones_select on public.encuesta_opciones
  using (es_super() OR es_miembro_curso_de_encuesta(encuesta_id)
         OR ((es_docente_curso_de_encuesta(encuesta_id) OR es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id))
             AND encuesta_del_colegio(encuesta_id)));
alter policy encuesta_votos_select on public.encuesta_votos
  using (es_super() OR es_miembro_curso_de_encuesta(encuesta_id)
         OR ((es_docente_curso_de_encuesta(encuesta_id) OR es_colegio_admin_de(colegio_de_encuesta(encuesta_id)) OR es_secretaria_de_encuesta(encuesta_id))
             AND encuesta_del_colegio(encuesta_id)));

-- Chequeo de "curso con contenido" sin depender de qué filas ve el colegio
create or replace function public.contenido_de_curso(p_curso uuid)
returns integer language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(p_curso)) or public.es_secretaria_de_curso(p_curso)) then
    raise exception 'Sin permiso';
  end if;
  return (select count(*) from public.recordatorios where curso_id = p_curso)
       + (select count(*) from public.eventos      where curso_id = p_curso)
       + (select count(*) from public.colectas     where curso_id = p_curso)
       + (select count(*) from public.alertas      where curso_id = p_curso)
       + (select count(*) from public.encuestas    where curso_id = p_curso);
end $$;

-- Borrar un usuario no se traba por colectas/encuestas que el colegio ya no ve
alter table public.colectas drop constraint if exists colectas_responsable_id_fkey;
alter table public.colectas add constraint colectas_responsable_id_fkey
  foreign key (responsable_id) references public.usuarios(id) on delete set null;
alter table public.colecta_pagos drop constraint if exists colecta_pagos_pagado_por_fkey;
alter table public.colecta_pagos add constraint colecta_pagos_pagado_por_fkey
  foreign key (pagado_por) references public.usuarios(id) on delete set null;
alter table public.encuestas drop constraint if exists encuestas_creado_por_fkey;
alter table public.encuestas add constraint encuestas_creado_por_fkey
  foreign key (creado_por) references public.usuarios(id) on delete set null;
alter table public.encuesta_votos drop constraint if exists encuesta_votos_usuario_id_fkey;
alter table public.encuesta_votos add constraint encuesta_votos_usuario_id_fkey
  foreign key (usuario_id) references public.usuarios(id) on delete cascade;

revoke all on function public.creado_por_colegio(uuid) from public, anon;
revoke all on function public.encuesta_del_colegio(uuid) from public, anon;
revoke all on function public.contenido_de_curso(uuid) from public, anon;
grant execute on function public.creado_por_colegio(uuid), public.encuesta_del_colegio(uuid), public.contenido_de_curso(uuid) to authenticated;
