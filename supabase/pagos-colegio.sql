-- supabase/pagos-colegio.sql — Pagos al colegio (specs/pagos-colegio.md):
-- excursiones, visitas y otros cobros del colegio por curso. La familia avisa
-- "Ya pagué" y el colegio confirma cuando recibe el dinero. Es aparte de las
-- colectas entre familias, que el colegio no ve. Idempotente.
-- También: reenviar un comunicado (recordatorios.ultimo_reenvio) y el aviso
-- automático antes del vencimiento (preferencias_avisos.pago_por_vencer).

create table if not exists public.pagos_colegio (
  id                  uuid primary key default gen_random_uuid(),
  curso_id            uuid not null references public.cursos(id) on delete cascade,
  grupo_id            uuid,            -- mismo valor en los cursos de una misma carga
  titulo              text not null,
  descripcion         text,
  monto               numeric not null check (monto >= 0),
  moneda              text not null default '$',
  fecha_limite        date,
  datos_pago          text,
  activo              boolean not null default true,
  ultimo_recordatorio timestamptz,
  creado_por          uuid references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now()
);
create index if not exists pagos_colegio_curso_idx on public.pagos_colegio (curso_id);

-- Una fila por alumno que tiene que pagar: el que no va, no tiene fila.
create table if not exists public.pago_colegio_alumnos (
  pago_id       uuid not null references public.pagos_colegio(id) on delete cascade,
  hijo_id       uuid not null references public.hijos(id) on delete cascade,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'informado', 'pagado')),
  informado_por uuid references public.usuarios(id) on delete set null,
  informado_en  timestamptz,
  confirmado_por uuid references public.usuarios(id) on delete set null,
  confirmado_en timestamptz,
  primary key (pago_id, hijo_id)
);
create index if not exists pago_colegio_alumnos_hijo_idx on public.pago_colegio_alumnos (hijo_id);

create or replace function public.gestiona_pagos_de_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
$$;

create or replace function public.gestiona_pago_colegio(p_pago uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.pagos_colegio p where p.id = p_pago and public.gestiona_pagos_de_curso(p.curso_id))
$$;

-- Security definer: evita la recursión de RLS entre las dos tablas.
create or replace function public.familia_ve_pago_colegio(p_pago uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.pago_colegio_alumnos a where a.pago_id = p_pago and public.es_padre_de(a.hijo_id))
$$;

alter table public.pagos_colegio enable row level security;
alter table public.pago_colegio_alumnos enable row level security;

drop policy if exists pagos_colegio_select on public.pagos_colegio;
create policy pagos_colegio_select on public.pagos_colegio for select to authenticated
  using (public.gestiona_pagos_de_curso(curso_id) or (activo and public.familia_ve_pago_colegio(id)));
drop policy if exists pagos_colegio_insert on public.pagos_colegio;
create policy pagos_colegio_insert on public.pagos_colegio for insert to authenticated
  with check (public.gestiona_pagos_de_curso(curso_id));
drop policy if exists pagos_colegio_update on public.pagos_colegio;
create policy pagos_colegio_update on public.pagos_colegio for update to authenticated
  using (public.gestiona_pagos_de_curso(curso_id)) with check (public.gestiona_pagos_de_curso(curso_id));
drop policy if exists pagos_colegio_delete on public.pagos_colegio;
create policy pagos_colegio_delete on public.pagos_colegio for delete to authenticated
  using (public.gestiona_pagos_de_curso(curso_id));

-- Cada familia ve solo a sus hijos: nadie ve quién más pagó. Escribe por
-- avisar_pago_colegio, que no le deja marcar "pagado".
drop policy if exists pago_colegio_alumnos_select on public.pago_colegio_alumnos;
create policy pago_colegio_alumnos_select on public.pago_colegio_alumnos for select to authenticated
  using (public.gestiona_pago_colegio(pago_id) or public.es_padre_de(hijo_id));
drop policy if exists pago_colegio_alumnos_insert on public.pago_colegio_alumnos;
create policy pago_colegio_alumnos_insert on public.pago_colegio_alumnos for insert to authenticated
  with check (public.gestiona_pago_colegio(pago_id));
drop policy if exists pago_colegio_alumnos_update on public.pago_colegio_alumnos;
create policy pago_colegio_alumnos_update on public.pago_colegio_alumnos for update to authenticated
  using (public.gestiona_pago_colegio(pago_id)) with check (public.gestiona_pago_colegio(pago_id));
drop policy if exists pago_colegio_alumnos_delete on public.pago_colegio_alumnos;
create policy pago_colegio_alumnos_delete on public.pago_colegio_alumnos for delete to authenticated
  using (public.gestiona_pago_colegio(pago_id));

revoke all on public.pagos_colegio, public.pago_colegio_alumnos from anon;
grant select, insert, update, delete on public.pagos_colegio, public.pago_colegio_alumnos to authenticated;

-- "Ya pagué" / deshacer. Una vez confirmado por el colegio, la familia ya no lo cambia.
create or replace function public.avisar_pago_colegio(p_pago uuid, p_hijo uuid, p_pague boolean)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_estado text;
begin
  if not public.es_padre_de(p_hijo) then raise exception 'Sin permiso'; end if;
  select estado into v_estado from public.pago_colegio_alumnos where pago_id = p_pago and hijo_id = p_hijo for update;
  if v_estado is null then raise exception 'Este pago no es para este alumno'; end if;
  if v_estado = 'pagado' then raise exception 'El colegio ya confirmó este pago'; end if;
  update public.pago_colegio_alumnos
     set estado = case when p_pague then 'informado' else 'pendiente' end,
         informado_por = case when p_pague then public.mi_usuario_id() end,
         informado_en = case when p_pague then now() end
   where pago_id = p_pago and hijo_id = p_hijo;
  return case when p_pague then 'informado' else 'pendiente' end;
end $$;
revoke all on function public.avisar_pago_colegio(uuid, uuid, boolean) from public, anon;
grant execute on function public.avisar_pago_colegio(uuid, uuid, boolean) to authenticated;

-- Familias con algún hijo todavía pendiente en este pago, para los avisos.
create or replace function public.familias_pendientes_pago_colegio(p_pago uuid)
returns setof uuid
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not public.gestiona_pago_colegio(p_pago) then raise exception 'Sin permiso'; end if;
  return query
    select distinct uh.usuario_id
      from public.pago_colegio_alumnos a
      join public.usuario_hijos uh on uh.hijo_id = a.hijo_id
      join public.usuarios u on u.id = uh.usuario_id and coalesce(u.activo, true)
     where a.pago_id = p_pago and a.estado = 'pendiente';
end $$;
revoke all on function public.familias_pendientes_pago_colegio(uuid) from public, anon;
grant execute on function public.familias_pendientes_pago_colegio(uuid) to authenticated;

-- Aviso automático dos días antes (Edge Function avisos-automaticos).
alter table public.preferencias_avisos add column if not exists pago_por_vencer boolean not null default true;

-- Último reenvío de un comunicado, para mostrarlo en el historial.
alter table public.recordatorios add column if not exists ultimo_reenvio timestamptz;
