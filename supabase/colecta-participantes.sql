-- supabase/colecta-participantes.sql
--
-- Permite elegir qué alumnos del curso participan de una colecta — a veces
-- no participan todos. Sin filas para una colecta = participan todos los
-- alumnos del curso, igual que el comportamiento de hoy: backward
-- compatible con las colectas existentes, sin migrar ningún dato. Mismo
-- patrón que evento_asistencia para festejos (invitados explícitos), pero
-- sin estado de RSVP — acá es solo membresía (participa / no participa).
--
-- Correr una sola vez en el SQL editor de Supabase.

create table if not exists public.colecta_participantes (
  colecta_id uuid not null references public.colectas(id) on delete cascade,
  alumno_id  uuid not null references public.hijos(id) on delete cascade,
  primary key (colecta_id, alumno_id)
);

alter table public.colecta_participantes enable row level security;

-- Mismos helpers que ya usa colecta_pagos (es_miembro_curso_de_colecta,
-- puede_gestionar_colecta_id, colegio_de_colecta) — no hace falta nada nuevo.
create policy colecta_participantes_select on public.colecta_participantes for select to authenticated
  using (
    public.es_super()
    or public.es_miembro_curso_de_colecta(colecta_id)
    or public.es_colegio_admin_de(public.colegio_de_colecta(colecta_id))
  );

create policy colecta_participantes_insert on public.colecta_participantes for insert to authenticated
  with check (public.puede_gestionar_colecta_id(colecta_id));

create policy colecta_participantes_delete on public.colecta_participantes for delete to authenticated
  using (public.puede_gestionar_colecta_id(colecta_id));
