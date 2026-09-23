-- supabase/autorizaciones.sql — Autorizaciones digitales (specs/autorizaciones.md)
--
-- autorizaciones: una fila por curso. Cuando el colegio la publica en varios
-- cursos, las filas comparten grupo_id (mismo modelo que las Comunicaciones).
-- autorizacion_respuestas: una por autorización + hijo (Autorizo / No
-- autorizo, quién retira, comentario, quién respondió y cuándo).
--
-- Permisos:
--   - ver la autorización: cualquier miembro del curso (y el colegio);
--   - crear / editar / borrar: colegio (super / colegio_admin), Room Parent del
--     curso, o quien la creó;
--   - responder: la familia del hijo, si el hijo es de ese curso y la
--     autorización sigue abierta (sin fecha límite o no vencida, hora AR);
--   - ver todas las respuestas: creador / Room Parent / colegio
--     (puede_ver_lecturas, de lecturas-y-adopcion.sql); cada familia ve las
--     de sus hijos.
--
-- Correr una vez, después de rls-hardening.sql, multi-colegio.sql y
-- lecturas-y-adopcion.sql.

create table if not exists public.autorizaciones (
  id           uuid primary key default gen_random_uuid(),
  curso_id     uuid not null references public.cursos(id) on delete cascade,
  grupo_id     uuid,
  titulo       text not null,
  descripcion  text,
  fecha_evento date,
  fecha_limite date,
  creado_por   uuid references public.usuarios(id) on delete set null,
  creado_en    timestamptz not null default now()
);
create index if not exists autorizaciones_curso on public.autorizaciones (curso_id);
create index if not exists autorizaciones_grupo on public.autorizaciones (grupo_id);

create table if not exists public.autorizacion_respuestas (
  id               uuid primary key default gen_random_uuid(),
  autorizacion_id  uuid not null references public.autorizaciones(id) on delete cascade,
  hijo_id          uuid not null references public.hijos(id) on delete cascade,
  usuario_id       uuid references public.usuarios(id) on delete set null,
  autoriza         boolean not null,
  retira           text,
  comentario       text,
  respondido_en    timestamptz not null default now(),
  unique (autorizacion_id, hijo_id)
);

create or replace function public.curso_de_autorizacion(p_id uuid)
returns uuid
language sql stable security definer set search_path = public, pg_temp
as $$ select curso_id from public.autorizaciones where id = p_id $$;

create or replace function public.autorizacion_abierta(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.autorizaciones a
    where a.id = p_id
      and (a.fecha_limite is null
           or a.fecha_limite >= (now() at time zone 'America/Argentina/Buenos_Aires')::date)
  )
$$;

-- Creador / Room Parent del curso / colegio de una autorización.
create or replace function public.gestiona_autorizacion(p_id uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.autorizaciones a
    where a.id = p_id and public.puede_ver_lecturas(a.curso_id, a.creado_por)
  )
$$;

alter table public.autorizaciones enable row level security;
alter table public.autorizacion_respuestas enable row level security;

drop policy if exists autorizaciones_select on public.autorizaciones;
create policy autorizaciones_select on public.autorizaciones for select to authenticated
  using (public.es_super()
         or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or public.es_miembro_curso(curso_id));

drop policy if exists autorizaciones_insert on public.autorizaciones;
create policy autorizaciones_insert on public.autorizaciones for insert to authenticated
  with check (creado_por = public.mi_usuario_id()
              and (public.es_super()
                   or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
                   or public.es_admin_curso(curso_id)));

drop policy if exists autorizaciones_update on public.autorizaciones;
create policy autorizaciones_update on public.autorizaciones for update to authenticated
  using (public.puede_ver_lecturas(curso_id, creado_por))
  with check (public.puede_ver_lecturas(curso_id, creado_por));

drop policy if exists autorizaciones_delete on public.autorizaciones;
create policy autorizaciones_delete on public.autorizaciones for delete to authenticated
  using (public.puede_ver_lecturas(curso_id, creado_por));

drop policy if exists autorizacion_respuestas_select on public.autorizacion_respuestas;
create policy autorizacion_respuestas_select on public.autorizacion_respuestas for select to authenticated
  using (public.es_padre_de(hijo_id) or public.gestiona_autorizacion(autorizacion_id));

-- Responder: la familia del hijo, hijo del curso de la autorización, abierta.
drop policy if exists autorizacion_respuestas_insert on public.autorizacion_respuestas;
create policy autorizacion_respuestas_insert on public.autorizacion_respuestas for insert to authenticated
  with check (public.es_padre_de(hijo_id)
              and usuario_id = public.mi_usuario_id()
              and exists (select 1 from public.hijos h where h.id = hijo_id and h.curso_id = public.curso_de_autorizacion(autorizacion_id))
              and public.autorizacion_abierta(autorizacion_id));

drop policy if exists autorizacion_respuestas_update on public.autorizacion_respuestas;
create policy autorizacion_respuestas_update on public.autorizacion_respuestas for update to authenticated
  using (public.es_padre_de(hijo_id) and public.autorizacion_abierta(autorizacion_id))
  with check (public.es_padre_de(hijo_id)
              and usuario_id = public.mi_usuario_id()
              and public.autorizacion_abierta(autorizacion_id));
