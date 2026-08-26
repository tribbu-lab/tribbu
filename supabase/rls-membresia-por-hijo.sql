-- =============================================================================
-- rls-membresia-por-hijo.sql — Fix: padres sin fila en usuario_cursos no ven
-- NADA de su curso (calendario / muro / recordatorios / cumples vacíos) desde
-- que se aplicó rls-hardening.sql (2026-08-24).
--
-- CAUSA
--   es_miembro_curso() y comparte_curso() definen la membresía SOLO por
--   usuario_cursos, pero el modelo "Mi acceso" de la app deriva el acceso de
--   hijos.curso_id (usuario_hijos → hijos). Un apoderado creado/editado desde
--   Super Admin (el form solo escribe filas rol='admin' y al editar borra las
--   demás) o cuyo hijo fue promovido de curso queda SIN fila de membresía →
--   RLS le filtra todas las lecturas del curso aunque la UI lo muestre como
--   su curso. Caso real: nicolasalbani@gmail.com / hija Lucia (2026-08-26).
--
-- FIX
--   Membresía = UNIÓN de ambas fuentes: fila en usuario_cursos O hijo
--   vinculado en el curso — exactamente el modelo "Mi acceso" del cliente
--   (items = hijos + cursos donde es Room Parent). es_admin_curso NO cambia:
--   admin sigue siendo exclusivamente usuario_cursos.rol='admin'.
--   Todos los helpers derivados (es_miembro_curso_de_hijo / _de_evento /
--   _de_colecta, es_maestro_visible) heredan el fix porque delegan acá.
--
-- CÓMO CORRERLO
--   Pegar TODO el archivo en el SQL editor de Supabase (proyecto tribbu) y
--   ejecutar. Idempotente; create or replace preserva grants y ownership
--   (deben seguir siendo del rol postgres/supabase_admin del SQL editor,
--   igual que en rls-hardening.sql, para que SECURITY DEFINER saltee RLS).
--   rls-hardening.sql ya incorpora estas mismas definiciones — si se re-corre
--   entero, este fix no se pierde.
-- =============================================================================

-- ¿el usuario actual es miembro del curso dado?
-- (fila en usuario_cursos — cualquier rol — O hijo vinculado en ese curso)
create or replace function public.es_miembro_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from public.usuario_cursos uc
    join public.usuarios u on u.id = uc.usuario_id
    where u.auth_id = auth.uid() and uc.curso_id = p_curso
  ) or exists(
    select 1
    from public.usuario_hijos uh
    join public.usuarios u on u.id = uh.usuario_id
    join public.hijos h on h.id = uh.hijo_id
    where u.auth_id = auth.uid() and h.curso_id = p_curso
  )
$$;

-- ¿el usuario actual comparte al menos un curso con el usuario objetivo?
-- (los cursos de cada lado = usuario_cursos ∪ cursos de sus hijos vinculados)
create or replace function public.comparte_curso(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists(
    select 1
    from (
      select uc.curso_id
      from public.usuario_cursos uc
      join public.usuarios u on u.id = uc.usuario_id
      where u.auth_id = auth.uid()
      union
      select h.curso_id
      from public.usuario_hijos uh
      join public.usuarios u on u.id = uh.usuario_id
      join public.hijos h on h.id = uh.hijo_id
      where u.auth_id = auth.uid()
    ) mios
    join (
      select uc.curso_id
      from public.usuario_cursos uc
      where uc.usuario_id = p_usuario
      union
      select h.curso_id
      from public.usuario_hijos uh
      join public.hijos h on h.id = uh.hijo_id
      where uh.usuario_id = p_usuario
    ) otros on otros.curso_id = mios.curso_id and otros.curso_id is not null
  )
$$;
