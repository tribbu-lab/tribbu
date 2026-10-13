-- Talleres optativos en el horario (2026-10-13)
--
-- Una clase puede ser OPTATIVA (taller de robótica después de hora, coro del
-- sábado…): solo la hacen los alumnos anotados. En el horario del curso la ve
-- todo el que gestiona (colegio, Room Parent, docentes) con la marca
-- "Optativo"; cada familia la ve solo si alguno de sus hijos está anotado.
--
--   · clases.optativa          false = la hace todo el curso (lo de siempre)
--   · clase_alumnos            quién está anotado en una clase optativa
--
-- Sábados y talleres después de hora no necesitan nada en la base: horarios.dia
-- ya acepta "Sábado" y las horas son libres. Idempotente.

alter table public.clases add column if not exists optativa boolean not null default false;

create table if not exists public.clase_alumnos (
  clase_id  uuid not null references public.clases(id) on delete cascade,
  hijo_id   uuid not null references public.hijos(id)  on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (clase_id, hijo_id)
);
create index if not exists clase_alumnos_hijo on public.clase_alumnos (hijo_id);

alter table public.clase_alumnos enable row level security;

-- Ver: el colegio, el Room Parent y las docentes del curso (para armar y
-- consultar la lista), y cada familia solo la fila de sus hijos.
drop policy if exists clase_alumnos_select on public.clase_alumnos;
create policy clase_alumnos_select on public.clase_alumnos for select to authenticated
  using (
    public.es_super()
    or public.es_padre_de(hijo_id)
    or exists (
      select 1 from public.clases c
      where c.id = clase_alumnos.clase_id
        and (public.es_colegio_admin_de(public.colegio_de_curso(c.curso_id))
             or public.es_admin_curso(c.curso_id)
             or public.es_docente_curso(c.curso_id))
    )
  );

-- Anotar/desanotar: solo el colegio (es quien arma las clases). El alumno tiene
-- que ser de ese mismo curso.
drop policy if exists clase_alumnos_write on public.clase_alumnos;
create policy clase_alumnos_write on public.clase_alumnos for all to authenticated
  using (
    public.es_super()
    or exists (select 1 from public.clases c where c.id = clase_alumnos.clase_id
               and public.es_colegio_admin_de(public.colegio_de_curso(c.curso_id)))
  )
  with check (
    exists (
      select 1 from public.clases c join public.hijos h on h.id = clase_alumnos.hijo_id
      where c.id = clase_alumnos.clase_id and h.curso_id = c.curso_id
        and (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(c.curso_id)))
    )
  );
