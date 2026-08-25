-- supabase/encuestas.sql
--
-- Encuestas por curso (ver specs/encuestas.md): cualquier apoderado o Room
-- Parent puede armar una pregunta con 2-6 opciones para su curso; cada
-- apoderado vota una sola vez (constraint `unique(encuesta_id, usuario_id)`
-- en encuesta_votos, no una por hijo) y los resultados se ven en vivo.
--
-- Correr una sola vez en el SQL editor de Supabase, DESPUÉS de
-- rls-hardening.sql (usa mi_usuario_id()/es_super()/es_miembro_curso()/
-- es_admin_curso(), definidas ahí). gen_random_uuid() es un builtin de
-- Postgres desde la v13 — no necesita `create extension`, a diferencia de
-- gen_random_bytes() (pgcrypto) que sí se usó en calendar-sync.sql.

-- === tablas ===================================================================

create table public.encuestas (
  id              uuid primary key default gen_random_uuid(),
  curso_id        uuid not null references public.cursos(id),
  pregunta        text not null,
  creado_por      uuid not null references public.usuarios(id),
  creado_en       timestamptz not null default now(),
  fecha_cierre    date,
  cerrada_manual  boolean not null default false
);

create table public.encuesta_opciones (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  texto        text not null,
  orden        int not null default 0,
  -- Unique redundante sobre (id, encuesta_id) para ser el destino de la FK
  -- compuesta de encuesta_votos abajo — así la base misma impide que un voto
  -- tenga una opción que no pertenece a esa encuesta (integridad relacional,
  -- no solo autorización vía RLS).
  unique (id, encuesta_id)
);

create table public.encuesta_votos (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references public.encuestas(id) on delete cascade,
  opcion_id    uuid not null,
  usuario_id   uuid not null references public.usuarios(id),
  creado_en    timestamptz not null default now(),
  unique (encuesta_id, usuario_id),
  foreign key (opcion_id, encuesta_id)
    references public.encuesta_opciones (id, encuesta_id) on delete cascade
);

create index encuesta_opciones_encuesta_id_idx on public.encuesta_opciones(encuesta_id);
create index encuesta_votos_encuesta_id_idx on public.encuesta_votos(encuesta_id);
create index encuesta_votos_opcion_id_idx on public.encuesta_votos(opcion_id);

-- === helper: membresía por encuesta (mismo patrón que es_miembro_curso_de_evento) ===

create or replace function public.es_miembro_curso_de_encuesta(p_encuesta uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_miembro_curso((select curso_id from public.encuestas where id = p_encuesta))
$$;

-- === RLS =======================================================================

alter table public.encuestas enable row level security;
alter table public.encuesta_opciones enable row level security;
alter table public.encuesta_votos enable row level security;

-- encuestas: cualquier miembro del curso lee y crea; cerrar/borrar es de quien
-- la creó, un admin del curso, o super (mismo criterio para las dos acciones).
create policy encuestas_select on public.encuestas for select to authenticated
  using ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy encuestas_insert on public.encuestas for insert to authenticated
  with check ( public.es_super() or public.es_miembro_curso(curso_id) );
create policy encuestas_update on public.encuestas for update to authenticated
  using (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id)
  )
  with check (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id)
  );
create policy encuestas_delete on public.encuestas for delete to authenticated
  using (
    public.es_super() or creado_por = public.mi_usuario_id() or public.es_admin_curso(curso_id)
  );

-- encuesta_opciones: se leen junto con la encuesta; se insertan solo quien
-- crea la encuesta (o un admin del curso) — sin update/delete en v1 (no se
-- editan opciones después de creada, ver "Out of Scope" del spec).
create policy encuesta_opciones_select on public.encuesta_opciones for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) );
create policy encuesta_opciones_insert on public.encuesta_opciones for insert to authenticated
  with check (
    public.es_super() or exists (
      select 1 from public.encuestas e
      where e.id = encuesta_id
        and (e.creado_por = public.mi_usuario_id() or public.es_admin_curso(e.curso_id))
    )
  );

-- encuesta_votos: cualquier miembro del curso lee (necesario para el conteo en
-- vivo); cada quien solo puede escribir su propio voto, y no si la encuesta
-- ya está cerrada (manual o por fecha_cierre vencida).
create policy encuesta_votos_select on public.encuesta_votos for select to authenticated
  using ( public.es_super() or public.es_miembro_curso_de_encuesta(encuesta_id) );
create policy encuesta_votos_insert on public.encuesta_votos for insert to authenticated
  with check (
    usuario_id = public.mi_usuario_id()
    and public.es_miembro_curso_de_encuesta(encuesta_id)
    and not exists (
      select 1 from public.encuestas e
      where e.id = encuesta_id
        and (e.cerrada_manual or (e.fecha_cierre is not null and e.fecha_cierre < current_date))
    )
  );
create policy encuesta_votos_update on public.encuesta_votos for update to authenticated
  using ( usuario_id = public.mi_usuario_id() )
  with check (
    usuario_id = public.mi_usuario_id()
    and not exists (
      select 1 from public.encuestas e
      where e.id = encuesta_id
        and (e.cerrada_manual or (e.fecha_cierre is not null and e.fecha_cierre < current_date))
    )
  );
create policy encuesta_votos_delete on public.encuesta_votos for delete to authenticated
  using ( usuario_id = public.mi_usuario_id() or public.es_super() );

-- Después de correr este SQL, agregar el caso "encuesta" a
-- supabase/functions/send-push/index.ts y redeployar:
--   supabase functions deploy send-push
