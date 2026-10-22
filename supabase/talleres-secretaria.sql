-- Talleres: también los cargan y gestionan los directivos por nivel
-- (Secretaría, nivel_admin) — 2026-10-21, pedido de Yanina.
--
-- Una Secretaría gestiona (crea, edita, inscripciones, sorteo, aviso) un
-- taller de su colegio si:
--   · lo creó ella (talleres.creado_por), o
--   · todos sus cursos (taller_cursos) son de sus niveles.
-- Un taller "por edad" sin cursos lo gestiona quien lo creó y el administrador.
-- Al armar el taller solo puede elegir cursos de sus niveles.
-- El administrador del colegio y super siguen gestionando todos.
--
-- Todas las RPC de talleres (inscriptos, resolver, sortear, elegibles,
-- usuarios) preguntan gestiona_taller(), así que alcanza con extenderla.
-- Correr después de talleres.sql y roles-por-nivel.sql. Idempotente.

alter table public.talleres add column if not exists creado_por uuid
  references public.usuarios(id) on delete set null default public.mi_usuario_id();

-- ¿La Secretaría que llama gestiona este taller?
create or replace function public.es_secretaria_de_taller(p_taller uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.talleres t
    join public.usuarios u on u.auth_id = auth.uid() and u.rol = 'nivel_admin' and u.colegio_id = t.colegio_id
    where t.id = p_taller and (
      t.creado_por = u.id
      or (exists (select 1 from public.taller_cursos tc where tc.taller_id = t.id)
          and not exists (
            select 1 from public.taller_cursos tc join public.cursos c on c.id = tc.curso_id
            where tc.taller_id = t.id and (c.nivel is null or not (c.nivel = any(u.niveles)))))
    )
  )
$$;
revoke all on function public.es_secretaria_de_taller(uuid) from public, anon;
grant execute on function public.es_secretaria_de_taller(uuid) to authenticated;

create or replace function public.gestiona_taller(p_taller uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.talleres t where t.id = p_taller
                 and (public.es_super() or public.es_colegio_admin_de(t.colegio_id)))
      or public.es_secretaria_de_taller(p_taller)
$$;

-- Talleres de la Secretaría: por columnas de la fila (en un INSERT … RETURNING
-- la fila nueva todavía no la ve una función que la busque por id).
drop policy if exists talleres_secretaria on public.talleres;
create policy talleres_secretaria on public.talleres for all to authenticated
  using (public.es_secretaria_de_colegio(colegio_id) and (creado_por = public.mi_usuario_id() or public.es_secretaria_de_taller(id)))
  with check (public.es_secretaria_de_colegio(colegio_id) and (creado_por = public.mi_usuario_id() or public.es_secretaria_de_taller(id)));

-- Cursos del taller: la Secretaría solo suma cursos de sus niveles.
drop policy if exists taller_cursos_write on public.taller_cursos;
create policy taller_cursos_write on public.taller_cursos for all to authenticated
  using (public.gestiona_taller(taller_id))
  with check (
    public.gestiona_taller(taller_id)
    and exists (select 1 from public.talleres t where t.id = taller_cursos.taller_id and public.colegio_de_curso(taller_cursos.curso_id) = t.colegio_id)
    and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(taller_cursos.curso_id)) or public.es_secretaria_de_curso(taller_cursos.curso_id))
  );
