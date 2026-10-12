-- =============================================================================
-- materias-y-clases.sql · Materias del colegio + clases por curso (Fase A)
-- =============================================================================
-- Ver specs/docentes-clases-y-grupos.md.
--
--   · materias: catálogo por colegio ("Inglés", "Educación Física", "Recreo").
--   · clases:   curso × materia × maestra (maestra opcional: un Recreo no
--               tiene). Es la fuente de verdad de "quién da qué en qué curso".
--   · maestro_cursos queda DERIVADA de clases (trigger), así siguen andando
--     los ~10 lugares que la leen (calendario, cumples, muro, ICS, avisos…).
--   · maestros.materia queda DERIVADA (texto con las materias de sus clases),
--     así Contacto/Mensajes/push siguen mostrando algo prolijo sin cambios.
--   · horarios.clase_id: el horario se arma eligiendo una clase; un trigger
--     completa materia/docente/color desde la clase. Los horarios viejos sin
--     clase siguen como estaban.
--
-- La migración de datos (sección 5) crea materias desde los textos actuales y
-- clases desde maestro_cursos + horarios. No borra nada. Las variantes
-- ("Educacion Fisica" / "Educación Física") se unifican por normalización;
-- las que no son obvias ("Gym Primaria") se fusionan después desde Super
-- Admin → 📚 Materias → "Unificar con…" (RPC fusionar_materias).
--
-- Idempotente.
-- =============================================================================

-- 1) Normalización de nombres (sin acentos, minúsculas, espacios simples) ----
create or replace function public.norm_materia(p text)
returns text
language sql immutable
as $$
  select regexp_replace(lower(translate(btrim(coalesce(p, '')),
    'áéíóúàèìòùäëïöüâêîôûÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛñÑ', 'aeiouaeiouaeiouaeiouAEIOUAEIOUAEIOUAEIOUnN')), '\s+', ' ', 'g')
$$;

-- 2) Tablas ------------------------------------------------------------------
create table if not exists public.materias (
  id         uuid primary key default gen_random_uuid(),
  colegio_id uuid not null references public.colegios(id) on delete cascade,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 60),
  color      text not null default '#3B82F6',
  orden      int  not null default 0,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);
create unique index if not exists materias_nombre_uq on public.materias (colegio_id, public.norm_materia(nombre));

create table if not exists public.clases (
  id         uuid primary key default gen_random_uuid(),
  curso_id   uuid not null references public.cursos(id) on delete cascade,
  materia_id uuid not null references public.materias(id) on delete cascade,
  maestro_id uuid references public.maestros(id) on delete set null,
  creado_en  timestamptz not null default now()
);
-- una misma materia puede tener dos maestras en un curso, pero no repetida
create unique index if not exists clases_uq on public.clases (curso_id, materia_id, coalesce(maestro_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists clases_maestro on public.clases (maestro_id);

alter table public.horarios add column if not exists clase_id uuid references public.clases(id) on delete set null;

-- 3) Derivados: maestro_cursos, maestros.materia, horarios ----------------------

-- Texto "Inglés, Matemática" con las materias de las clases de una maestra.
create or replace function public.recalcular_materia_maestro(p_maestro uuid)
returns void
language sql security definer set search_path = public, pg_temp
as $$
  update public.maestros m set materia = (
    select string_agg(nombre, ', ' order by nombre) from (
      select distinct ma.nombre from public.clases c join public.materias ma on ma.id = c.materia_id
      where c.maestro_id = p_maestro
    ) x
  ) where m.id = p_maestro
    and exists (select 1 from public.clases where maestro_id = p_maestro)
$$;

create or replace function public.clases_sync()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- alta del par maestra ↔ curso
  if tg_op in ('INSERT','UPDATE') and new.maestro_id is not null
     and not exists (select 1 from public.maestro_cursos where maestro_id = new.maestro_id and curso_id = new.curso_id) then
    insert into public.maestro_cursos (maestro_id, curso_id) values (new.maestro_id, new.curso_id);
  end if;
  -- baja del par si ya no queda ninguna clase de esa maestra en ese curso
  if tg_op in ('DELETE','UPDATE') and old.maestro_id is not null
     and not exists (select 1 from public.clases where maestro_id = old.maestro_id and curso_id = old.curso_id) then
    delete from public.maestro_cursos where maestro_id = old.maestro_id and curso_id = old.curso_id;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.maestro_id is not null then perform public.recalcular_materia_maestro(new.maestro_id); end if;
  if tg_op in ('DELETE','UPDATE') and old.maestro_id is not null then perform public.recalcular_materia_maestro(old.maestro_id); end if;
  -- los horarios de la clase siguen mostrando la maestra actual
  if tg_op = 'UPDATE' then
    update public.horarios h set clase_id = h.clase_id where h.clase_id = new.id;
  end if;
  return null;
end $$;
drop trigger if exists clases_sync on public.clases;
create trigger clases_sync after insert or update or delete on public.clases
  for each row execute function public.clases_sync();

-- Renombrar/recolorear una materia actualiza los textos derivados.
create or replace function public.materias_sync()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare r record;
begin
  if new.nombre is distinct from old.nombre or new.color is distinct from old.color then
    update public.horarios h set clase_id = h.clase_id
    from public.clases c where c.id = h.clase_id and c.materia_id = new.id;
    for r in select distinct maestro_id from public.clases where materia_id = new.id and maestro_id is not null loop
      perform public.recalcular_materia_maestro(r.maestro_id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists materias_sync on public.materias;
create trigger materias_sync after update on public.materias
  for each row execute function public.materias_sync();

-- Horario con clase: materia/docente/color salen de la clase.
create or replace function public.horarios_desde_clase()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v record;
begin
  if new.clase_id is null then return new; end if;
  select c.curso_id, ma.nombre, ma.color,
         nullif(btrim(coalesce(m.nombre, '') || ' ' || coalesce(m.apellido, '')), '') as docente
    into v
  from public.clases c join public.materias ma on ma.id = c.materia_id
  left join public.maestros m on m.id = c.maestro_id
  where c.id = new.clase_id;
  if not found then return new; end if;
  new.curso_id := v.curso_id;
  new.materia  := v.nombre;
  new.color    := v.color;
  new.docente  := coalesce(v.docente, new.docente);  -- clase sin maestra: conserva el texto que había
  return new;
end $$;
drop trigger if exists horarios_desde_clase on public.horarios;
create trigger horarios_desde_clase before insert or update on public.horarios
  for each row execute function public.horarios_desde_clase();

-- 4) RLS ---------------------------------------------------------------------
alter table public.materias enable row level security;
alter table public.clases   enable row level security;

drop policy if exists materias_select on public.materias;
create policy materias_select on public.materias for select to authenticated
  using (public.es_super() or public.es_miembro_colegio(colegio_id) or public.es_colegio_admin_de(colegio_id)
         or exists (select 1 from public.usuarios u where u.auth_id = auth.uid() and u.colegio_id = materias.colegio_id));
drop policy if exists materias_write on public.materias;
create policy materias_write on public.materias for all to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id))
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id));

drop policy if exists clases_select on public.clases;
create policy clases_select on public.clases for select to authenticated
  using (public.es_super() or public.es_miembro_curso(curso_id) or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
         or exists (select 1 from public.maestros m where m.id = clases.maestro_id and m.usuario_id = public.mi_usuario_id()));
drop policy if exists clases_write on public.clases;
create policy clases_write on public.clases for all to authenticated
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)))
  with check (
    (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)))
    -- la materia tiene que ser del mismo colegio que el curso
    and exists (select 1 from public.materias ma where ma.id = materia_id and ma.colegio_id = public.colegio_de_curso(curso_id))
  );

-- 5) RPC: unificar dos materias ------------------------------------------------
create or replace function public.fusionar_materias(p_origen uuid, p_destino uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare o public.materias; d public.materias; r record;
begin
  select * into o from public.materias where id = p_origen;
  select * into d from public.materias where id = p_destino;
  if o.id is null or d.id is null or o.id = d.id or o.colegio_id <> d.colegio_id then
    raise exception 'Materias inválidas';
  end if;
  if not (public.es_super() or public.es_colegio_admin_de(o.colegio_id)) then
    raise exception 'Sin permiso';
  end if;
  -- cada clase de la materia origen pasa a la destino (o se une a la que ya existe)
  for r in select * from public.clases where materia_id = p_origen loop
    declare v_dest uuid;
    begin
      select id into v_dest from public.clases
      where curso_id = r.curso_id and materia_id = p_destino and maestro_id is not distinct from r.maestro_id;
      if v_dest is null then
        update public.clases set materia_id = p_destino where id = r.id;
      else
        update public.horarios set clase_id = v_dest where clase_id = r.id;
        delete from public.clases where id = r.id;
      end if;
    end;
  end loop;
  delete from public.materias where id = p_origen;
  -- refrescar textos derivados
  update public.horarios h set clase_id = h.clase_id from public.clases c where c.id = h.clase_id and c.materia_id = p_destino;
  for r in select distinct maestro_id from public.clases where materia_id = p_destino and maestro_id is not null loop
    perform public.recalcular_materia_maestro(r.maestro_id);
  end loop;
end $$;
revoke all on function public.fusionar_materias(uuid, uuid) from public, anon;
grant execute on function public.fusionar_materias(uuid, uuid) to authenticated;
revoke all on function public.recalcular_materia_maestro(uuid) from public, anon, authenticated;

-- 6) MIGRACIÓN DE DATOS (idempotente) -------------------------------------------
do $$
declare
  paleta text[] := array['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#0EA5E9','#14B8A6'];
begin
  -- 6a) materias desde los textos de maestros (por colegio de sus cursos) y de horarios
  insert into public.materias (colegio_id, nombre, color, orden)
  select colegio_id, nombre, paleta[1 + (abs(hashtext(norm)) % 8)], 0
  from (
    select distinct on (colegio_id, norm) colegio_id, nombre, norm
    from (
      select cu.colegio_id, btrim(unnest(string_to_array(m.materia, ','))) as nombre
      from public.maestros m
      join public.maestro_cursos mc on mc.maestro_id = m.id
      join public.cursos cu on cu.id = mc.curso_id
      where coalesce(btrim(m.materia), '') <> ''
        and not exists (select 1 from public.clases c where c.maestro_id = m.id) -- ya migrada: no re-leer su texto derivado
      union all
      select cu.colegio_id, btrim(h.materia)
      from public.horarios h join public.cursos cu on cu.id = h.curso_id
      where coalesce(btrim(h.materia), '') <> '' and h.clase_id is null
    ) t
    cross join lateral (select public.norm_materia(t.nombre) as norm) n
    where t.nombre <> ''
    order by colegio_id, norm, nombre desc  -- prefiere la variante con acentos ("Educación" > "Educacion")
  ) x
  on conflict (colegio_id, public.norm_materia(nombre)) do nothing;

  -- color de la materia = el más usado en sus horarios (respeta lo que ya eligió el colegio)
  update public.materias ma set color = x.color from (
    select distinct on (cu.colegio_id, public.norm_materia(h.materia)) cu.colegio_id, public.norm_materia(h.materia) as norm, h.color
    from public.horarios h join public.cursos cu on cu.id = h.curso_id
    where coalesce(h.color, '') ~ '^#[0-9A-Fa-f]{6}$' and h.clase_id is null
    group by cu.colegio_id, public.norm_materia(h.materia), h.color
    order by cu.colegio_id, public.norm_materia(h.materia), count(*) desc
  ) x where ma.colegio_id = x.colegio_id and public.norm_materia(ma.nombre) = x.norm
    and not exists (select 1 from public.clases c where c.materia_id = ma.id);

  -- 6b) clases desde maestro_cursos × materia de la maestra
  insert into public.clases (curso_id, materia_id, maestro_id)
  select distinct mc.curso_id, ma.id, m.id
  from public.maestros m
  join public.maestro_cursos mc on mc.maestro_id = m.id
  join public.cursos cu on cu.id = mc.curso_id
  cross join lateral unnest(string_to_array(m.materia, ',')) as t(nombre)
  join public.materias ma on ma.colegio_id = cu.colegio_id and public.norm_materia(ma.nombre) = public.norm_materia(t.nombre)
  where coalesce(btrim(m.materia), '') <> ''
    and not exists (select 1 from public.clases c where c.maestro_id = m.id and c.curso_id = mc.curso_id)
  on conflict do nothing;

  -- 6c) horarios → clase. Para cada horario se decide la maestra:
  --     · el texto "docente" coincide (por nombre) con una maestra del curso → esa
  --     · el texto "docente" no coincide con nadie ("Marcos") → clase SIN maestra
  --       (y el horario conserva su texto); nunca se le asigna otra maestra
  --     · sin texto "docente" → la clase de esa materia que ya exista en el curso
  --       (con maestra si hay), o una sin maestra (Recreo, Almuerzo)
  create temp table _hor_destino on commit drop as
  select h.id as horario_id, h.curso_id, ma.id as materia_id,
    case
      when coalesce(btrim(h.docente), '') <> '' then (
        select m.id from public.maestro_cursos mc join public.maestros m on m.id = mc.maestro_id
        where mc.curso_id = h.curso_id
          and public.norm_materia(btrim(m.nombre || ' ' || coalesce(m.apellido, ''))) like public.norm_materia(h.docente) || '%'
        limit 1)
      else (
        select c.maestro_id from public.clases c
        where c.curso_id = h.curso_id and c.materia_id = ma.id
        order by (c.maestro_id is null) limit 1)
    end as maestro_id
  from public.horarios h
  join public.cursos cu on cu.id = h.curso_id
  join public.materias ma on ma.colegio_id = cu.colegio_id and public.norm_materia(ma.nombre) = public.norm_materia(h.materia)
  where h.clase_id is null and coalesce(btrim(h.materia), '') <> '';

  insert into public.clases (curso_id, materia_id, maestro_id)
  select distinct d.curso_id, d.materia_id, d.maestro_id from _hor_destino d
  where not exists (select 1 from public.clases c where c.curso_id = d.curso_id and c.materia_id = d.materia_id
                    and c.maestro_id is not distinct from d.maestro_id)
  on conflict do nothing;

  update public.horarios h set clase_id = (
    select c.id from public.clases c
    where c.curso_id = d.curso_id and c.materia_id = d.materia_id and c.maestro_id is not distinct from d.maestro_id
    limit 1)
  from _hor_destino d where d.horario_id = h.id;
end $$;

-- 7) Mensajes → Nuevo → Maestras: la materia que da EN ESE CURSO (de clases),
--    no el texto general de la ficha. Reemplaza a la de mensajes-docentes.sql.
create or replace function public.docentes_para_mensaje()
returns table (hijo_id uuid, hijo_nombre text, curso_id uuid, maestro_id uuid,
               nombre text, apellido text, materia text, tiene_cuenta boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.curso_id, m.id, m.nombre, m.apellido,
    coalesce(
      (select string_agg(ma.nombre, ', ' order by ma.nombre)
       from public.clases c join public.materias ma on ma.id = c.materia_id
       where c.curso_id = h.curso_id and c.maestro_id = m.id),
      m.materia),
    m.usuario_id is not null
  from public.usuario_hijos uh
  join public.hijos h on h.id = uh.hijo_id
  join public.maestro_cursos mc on mc.curso_id = h.curso_id
  join public.maestros m on m.id = mc.maestro_id and coalesce(m.activo, true)
  where uh.usuario_id = public.mi_usuario_id()
  order by h.nombre, m.nombre, m.apellido
$$;
