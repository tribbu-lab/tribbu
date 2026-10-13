-- Talleres extraprogramáticos (spec: specs/talleres-extraprogramaticos.md)
--
-- El colegio publica talleres (dictados por una maestra o por un profe/empresa
-- externa), define quién puede anotarse (por cursos o por rango de edad) y cómo
-- se asignan los lugares (orden de llegada, aprobación o sorteo). Las familias
-- anotan a sus hijos SOLO por RPC (inscribir_en_taller / baja_de_taller): el
-- cupo, la elegibilidad y las fechas se validan acá, con la fila del taller
-- bloqueada para que dos familias a la vez no pasen el cupo.
--
-- Fechas "abierta/cerrada" en hora de Argentina (como autorizacion_abierta()).
-- Idempotente.

-- 1) Tablas ------------------------------------------------------------------

create table if not exists public.talleres (
  id                uuid primary key default gen_random_uuid(),
  colegio_id        uuid not null references public.colegios(id) on delete cascade,
  nombre            text not null,
  descripcion       text,
  foto              text,                      -- path en adjuntos: talleres/<colegio>/...
  profe_maestro_id  uuid references public.maestros(id) on delete set null,
  profe_texto       text,                      -- profe o empresa externa
  lugar             text,
  costo_texto       text,                      -- informativo, la app no cobra
  cupo              integer check (cupo is null or cupo > 0),
  modo_asignacion   text not null default 'orden_llegada' check (modo_asignacion in ('orden_llegada','aprobacion','sorteo')),
  elegibilidad      text not null default 'cursos' check (elegibilidad in ('cursos','edad')),
  edad_min          integer check (edad_min is null or edad_min between 0 and 25),
  edad_max          integer check (edad_max is null or edad_max between 0 and 25),
  inscripcion_desde date,
  inscripcion_hasta date,
  fecha_inicio      date,
  fecha_fin         date,
  baja_hasta        date,                      -- null = hasta fecha_inicio
  estado            text not null default 'borrador' check (estado in ('borrador','publicado','cerrado','cancelado')),
  año_lectivo       integer,
  sorteado_en       timestamptz,
  sorteado_por      uuid references public.usuarios(id) on delete set null,
  creado_por        uuid references public.usuarios(id) on delete set null default public.mi_usuario_id(),
  creado_en         timestamptz not null default now(),
  check (edad_min is null or edad_max is null or edad_min <= edad_max),
  check (fecha_inicio is null or fecha_fin is null or fecha_inicio <= fecha_fin),
  check (inscripcion_desde is null or inscripcion_hasta is null or inscripcion_desde <= inscripcion_hasta)
);
create index if not exists talleres_colegio on public.talleres (colegio_id);

create table if not exists public.taller_cursos (
  taller_id uuid not null references public.talleres(id) on delete cascade,
  curso_id  uuid not null references public.cursos(id)   on delete cascade,
  primary key (taller_id, curso_id)
);
create index if not exists taller_cursos_curso on public.taller_cursos (curso_id);

create table if not exists public.taller_horarios (
  id          uuid primary key default gen_random_uuid(),
  taller_id   uuid not null references public.talleres(id) on delete cascade,
  dia         text not null check (dia in ('Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo')),
  hora_inicio time not null,
  hora_fin    time not null,
  check (hora_fin > hora_inicio)
);
create index if not exists taller_horarios_taller on public.taller_horarios (taller_id);

create table if not exists public.taller_inscripciones (
  id              uuid primary key default gen_random_uuid(),
  taller_id       uuid not null references public.talleres(id) on delete cascade,
  hijo_id         uuid not null references public.hijos(id)    on delete cascade,
  estado          text not null check (estado in ('inscripto','espera','pendiente','rechazado','baja')),
  posicion_espera integer,
  motivo          text,
  inscripto_por   uuid references public.usuarios(id) on delete set null,
  creado_en       timestamptz not null default now(),
  resuelto_por    uuid references public.usuarios(id) on delete set null,
  resuelto_en     timestamptz,
  unique (taller_id, hijo_id)
);
create index if not exists taller_inscripciones_hijo on public.taller_inscripciones (hijo_id);

-- 2) Helpers -----------------------------------------------------------------

create or replace function public.hoy_ar()
returns date language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- El colegio del taller (super o colegio_admin de ese colegio).
create or replace function public.gestiona_taller(p_taller uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.talleres t where t.id = p_taller
                 and (public.es_super() or public.es_colegio_admin_de(t.colegio_id)))
$$;

-- La docente asignada como profe (maestra con cuenta).
create or replace function public.es_profe_taller(p_taller uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.talleres t join public.maestros m on m.id = t.profe_maestro_id
                 where t.id = p_taller and m.usuario_id is not null and m.usuario_id = public.mi_usuario_id())
$$;

-- ¿El hijo puede anotarse? Mismo colegio + (curso habilitado | edad en rango a la
-- fecha de inicio; sin fecha de nacimiento no entra en los de edad).
create or replace function public.hijo_elegible_taller(p_taller uuid, p_hijo uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.talleres t join public.hijos h on h.id = p_hijo
    where t.id = p_taller
      and public.colegio_de_curso(h.curso_id) = t.colegio_id
      and case t.elegibilidad
        when 'cursos' then exists (select 1 from public.taller_cursos tc where tc.taller_id = t.id and tc.curso_id = h.curso_id)
        else h.fecha_nacimiento is not null
          and (t.edad_min is null or extract(year from age(coalesce(t.fecha_inicio, public.hoy_ar()), h.fecha_nacimiento)) >= t.edad_min)
          and (t.edad_max is null or extract(year from age(coalesce(t.fecha_inicio, public.hoy_ar()), h.fecha_nacimiento)) <= t.edad_max)
      end
  )
$$;

-- Una familia ve un taller (no borrador) si tiene un hijo elegible o anotado.
create or replace function public.familia_ve_taller(p_taller uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuario_hijos uh
    where uh.usuario_id = public.mi_usuario_id()
      and (public.hijo_elegible_taller(p_taller, uh.hijo_id)
           or exists (select 1 from public.taller_inscripciones i where i.taller_id = p_taller and i.hijo_id = uh.hijo_id))
  )
$$;

create or replace function public.puede_ver_taller(p_taller uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.gestiona_taller(p_taller) or public.es_profe_taller(p_taller)
      or exists (select 1 from public.talleres t where t.id = p_taller and t.estado <> 'borrador' and public.familia_ve_taller(t.id))
$$;

create or replace function public.inscripcion_taller_abierta(p_taller uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.talleres t where t.id = p_taller and t.estado = 'publicado'
                 and (t.inscripcion_desde is null or t.inscripcion_desde <= public.hoy_ar())
                 and (t.inscripcion_hasta is null or t.inscripcion_hasta >= public.hoy_ar()))
$$;

-- 3) RLS ---------------------------------------------------------------------

alter table public.talleres             enable row level security;
alter table public.taller_cursos        enable row level security;
alter table public.taller_horarios      enable row level security;
alter table public.taller_inscripciones enable row level security;

-- talleres: el colegio por columnas de la fila (un helper por id no ve la fila
-- nueva dentro de INSERT…RETURNING — lección de perdidos).
drop policy if exists talleres_select on public.talleres;
create policy talleres_select on public.talleres for select to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id)
         or public.es_profe_taller(id)
         or (estado <> 'borrador' and public.familia_ve_taller(id)));
drop policy if exists talleres_write on public.talleres;
create policy talleres_write on public.talleres for all to authenticated
  using (public.es_super() or public.es_colegio_admin_de(colegio_id))
  with check (public.es_super() or public.es_colegio_admin_de(colegio_id));

drop policy if exists taller_cursos_select on public.taller_cursos;
create policy taller_cursos_select on public.taller_cursos for select to authenticated
  using (public.puede_ver_taller(taller_id));
drop policy if exists taller_cursos_write on public.taller_cursos;
create policy taller_cursos_write on public.taller_cursos for all to authenticated
  using (public.gestiona_taller(taller_id))
  with check (public.gestiona_taller(taller_id) and exists (
    select 1 from public.talleres t where t.id = taller_id and public.colegio_de_curso(curso_id) = t.colegio_id));

drop policy if exists taller_horarios_select on public.taller_horarios;
create policy taller_horarios_select on public.taller_horarios for select to authenticated
  using (public.puede_ver_taller(taller_id));
drop policy if exists taller_horarios_write on public.taller_horarios;
create policy taller_horarios_write on public.taller_horarios for all to authenticated
  using (public.gestiona_taller(taller_id)) with check (public.gestiona_taller(taller_id));

-- inscripciones: cada familia ve las de sus hijos; colegio y profe, todas.
-- Escribir directo solo el colegio; las familias van por RPC.
drop policy if exists taller_inscripciones_select on public.taller_inscripciones;
create policy taller_inscripciones_select on public.taller_inscripciones for select to authenticated
  using (public.es_padre_de(hijo_id) or public.gestiona_taller(taller_id) or public.es_profe_taller(taller_id));
drop policy if exists taller_inscripciones_write on public.taller_inscripciones;
create policy taller_inscripciones_write on public.taller_inscripciones for all to authenticated
  using (public.gestiona_taller(taller_id)) with check (public.gestiona_taller(taller_id));

-- 4) Lógica de inscripción ----------------------------------------------------

-- Usuarios (apoderados activos) de unos hijos. Interno: para devolver a quién
-- avisar desde las RPCs, sin abrir usuario_hijos.
create or replace function public.usuarios_de_hijos(p_hijos uuid[])
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct uh.usuario_id), '{}')
  from public.usuario_hijos uh join public.usuarios u on u.id = uh.usuario_id
  where uh.hijo_id = any(p_hijos) and coalesce(u.activo, true)
$$;
revoke all on function public.usuarios_de_hijos(uuid[]) from public, anon, authenticated;

create or replace function public.inscriptos_count(p_taller uuid)
returns integer language sql stable security definer set search_path = public, pg_temp
as $$ select count(*)::int from public.taller_inscripciones where taller_id = p_taller and estado = 'inscripto' $$;

-- Si hay lugar, pasa al primero de la lista de espera a inscripto. Devuelve el
-- hijo promovido (o null). Llamar con la fila del taller ya bloqueada.
create or replace function public.promover_espera_taller(p_taller uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_cupo int; v_hijo uuid;
begin
  select cupo into v_cupo from public.talleres where id = p_taller;
  if v_cupo is not null and public.inscriptos_count(p_taller) >= v_cupo then return null; end if;
  select hijo_id into v_hijo from public.taller_inscripciones
   where taller_id = p_taller and estado = 'espera' order by posicion_espera nulls last, creado_en limit 1;
  if v_hijo is null then return null; end if;
  update public.taller_inscripciones set estado = 'inscripto', posicion_espera = null, resuelto_en = now()
   where taller_id = p_taller and hijo_id = v_hijo;
  -- reacomodar los puestos de los que siguen esperando
  update public.taller_inscripciones i set posicion_espera = x.n
    from (select hijo_id, row_number() over (order by posicion_espera nulls last, creado_en) n
            from public.taller_inscripciones where taller_id = p_taller and estado = 'espera') x
   where i.taller_id = p_taller and i.hijo_id = x.hijo_id;
  return v_hijo;
end $$;
revoke all on function public.promover_espera_taller(uuid) from public, anon, authenticated;

-- Familia anota a su hijo. Devuelve { estado, posicion }.
create or replace function public.inscribir_en_taller(p_taller uuid, p_hijo uuid)
returns json language plpgsql security definer set search_path = public, pg_temp
as $$
declare t public.talleres; v_actual text; v_estado text; v_pos int;
begin
  if not public.es_padre_de(p_hijo) then raise exception 'Solo podés anotar a tus hijos' using errcode = '42501'; end if;
  select * into t from public.talleres where id = p_taller for update;
  if not found then raise exception 'El taller no existe'; end if;
  if not public.inscripcion_taller_abierta(p_taller) then raise exception 'La inscripción no está abierta'; end if;
  if not public.hijo_elegible_taller(p_taller, p_hijo) then raise exception 'Este taller no es para tu hijo/a'; end if;

  select estado into v_actual from public.taller_inscripciones where taller_id = p_taller and hijo_id = p_hijo;
  if v_actual in ('inscripto','espera','pendiente') then
    return (select json_build_object('estado', estado, 'posicion', posicion_espera) from public.taller_inscripciones where taller_id = p_taller and hijo_id = p_hijo);
  end if;
  if v_actual = 'rechazado' then raise exception 'El colegio rechazó esta inscripción. Escribile a Secretaría si querés revisarlo.'; end if;

  if t.modo_asignacion = 'orden_llegada' then
    if t.cupo is null or public.inscriptos_count(p_taller) < t.cupo then
      v_estado := 'inscripto';
    else
      v_estado := 'espera';
      select coalesce(max(posicion_espera), 0) + 1 into v_pos from public.taller_inscripciones where taller_id = p_taller and estado = 'espera';
    end if;
  else
    v_estado := 'pendiente'; -- aprobación o sorteo
  end if;

  insert into public.taller_inscripciones (taller_id, hijo_id, estado, posicion_espera, inscripto_por, creado_en)
  values (p_taller, p_hijo, v_estado, v_pos, public.mi_usuario_id(), now())
  on conflict (taller_id, hijo_id) do update
    set estado = excluded.estado, posicion_espera = excluded.posicion_espera, inscripto_por = excluded.inscripto_por,
        creado_en = now(), motivo = null, resuelto_por = null, resuelto_en = null;
  return json_build_object('estado', v_estado, 'posicion', v_pos);
end $$;

-- Familia (hasta baja_hasta / fecha_inicio) o colegio (siempre) da de baja.
-- Devuelve { promovido: hijo, avisar: usuarios a notificar del promovido }.
create or replace function public.baja_de_taller(p_taller uuid, p_hijo uuid)
returns json language plpgsql security definer set search_path = public, pg_temp
as $$
declare t public.talleres; v_actual text; v_prom uuid; v_limite date;
begin
  select * into t from public.talleres where id = p_taller for update;
  if not found then raise exception 'El taller no existe'; end if;
  if not public.gestiona_taller(p_taller) then
    if not public.es_padre_de(p_hijo) then raise exception 'Solo podés dar de baja a tus hijos' using errcode = '42501'; end if;
    v_limite := coalesce(t.baja_hasta, t.fecha_inicio);
    if v_limite is not null and public.hoy_ar() > v_limite then
      raise exception 'Ya pasó la fecha para darse de baja. Escribile al colegio.';
    end if;
  end if;
  select estado into v_actual from public.taller_inscripciones where taller_id = p_taller and hijo_id = p_hijo;
  if v_actual is null or v_actual in ('baja','rechazado') then return json_build_object('promovido', null, 'avisar', '{}'::uuid[]); end if;
  update public.taller_inscripciones set estado = 'baja', posicion_espera = null, resuelto_por = public.mi_usuario_id(), resuelto_en = now()
   where taller_id = p_taller and hijo_id = p_hijo;
  if v_actual = 'inscripto' and t.estado in ('publicado','cerrado') then v_prom := public.promover_espera_taller(p_taller); end if;
  if v_actual = 'espera' then
    update public.taller_inscripciones i set posicion_espera = x.n
      from (select hijo_id, row_number() over (order by posicion_espera nulls last, creado_en) n
              from public.taller_inscripciones where taller_id = p_taller and estado = 'espera') x
     where i.taller_id = p_taller and i.hijo_id = x.hijo_id;
  end if;
  return json_build_object('promovido', v_prom,
    'avisar', case when v_prom is null then '{}'::uuid[] else public.usuarios_de_hijos(array[v_prom]) end);
end $$;

-- Colegio: aprobar / rechazar / inscribir (a mano o desde la espera) / quitar.
-- Devuelve { estado, avisar (familia del hijo), promovido, avisar_promovido }.
create or replace function public.resolver_inscripcion_taller(p_taller uuid, p_hijo uuid, p_accion text, p_motivo text default null)
returns json language plpgsql security definer set search_path = public, pg_temp
as $$
declare t public.talleres; v_actual text; v_estado text; v_prom uuid;
begin
  if not public.gestiona_taller(p_taller) then raise exception 'Solo el colegio gestiona las inscripciones' using errcode = '42501'; end if;
  select * into t from public.talleres where id = p_taller for update;
  select estado into v_actual from public.taller_inscripciones where taller_id = p_taller and hijo_id = p_hijo;

  if p_accion = 'aprobar' then
    if v_actual is distinct from 'pendiente' then raise exception 'Solo se aprueban inscripciones pendientes'; end if;
    if t.cupo is not null and public.inscriptos_count(p_taller) >= t.cupo then raise exception 'No hay más lugares (cupo %)', t.cupo; end if;
    v_estado := 'inscripto';
  elsif p_accion = 'rechazar' then
    if v_actual is distinct from 'pendiente' and v_actual is distinct from 'espera' then raise exception 'Solo se rechazan pendientes o en espera'; end if;
    v_estado := 'rechazado';
  elsif p_accion = 'inscribir' then
    -- decisión del colegio: puede pasar el cupo a propósito (la UI avisa)
    if not exists (select 1 from public.hijos h where h.id = p_hijo and public.colegio_de_curso(h.curso_id) = t.colegio_id) then
      raise exception 'Ese alumno no es de este colegio';
    end if;
    v_estado := 'inscripto';
  elsif p_accion = 'quitar' then
    return public.baja_de_taller(p_taller, p_hijo);
  else
    raise exception 'Acción desconocida: %', p_accion;
  end if;

  insert into public.taller_inscripciones (taller_id, hijo_id, estado, motivo, inscripto_por, resuelto_por, resuelto_en)
  values (p_taller, p_hijo, v_estado, case when v_estado = 'rechazado' then nullif(btrim(p_motivo), '') end,
          public.mi_usuario_id(), public.mi_usuario_id(), now())
  on conflict (taller_id, hijo_id) do update
    set estado = excluded.estado, posicion_espera = null, motivo = excluded.motivo,
        resuelto_por = excluded.resuelto_por, resuelto_en = now();
  if v_actual = 'espera' then
    update public.taller_inscripciones i set posicion_espera = x.n
      from (select hijo_id, row_number() over (order by posicion_espera nulls last, creado_en) n
              from public.taller_inscripciones where taller_id = p_taller and estado = 'espera') x
     where i.taller_id = p_taller and i.hijo_id = x.hijo_id;
  end if;
  return json_build_object('estado', v_estado, 'avisar', public.usuarios_de_hijos(array[p_hijo]));
end $$;

-- Colegio: sorteo (una sola vez, con la inscripción cerrada). Los pendientes
-- entran al azar hasta el cupo; el resto queda en espera en el orden sorteado.
create or replace function public.sortear_taller(p_taller uuid)
returns json language plpgsql security definer set search_path = public, pg_temp
as $$
declare t public.talleres; v_libres int; v_ins uuid[]; v_esp uuid[];
begin
  if not public.gestiona_taller(p_taller) then raise exception 'Solo el colegio puede sortear' using errcode = '42501'; end if;
  select * into t from public.talleres where id = p_taller for update;
  if t.modo_asignacion <> 'sorteo' then raise exception 'Este taller no es por sorteo'; end if;
  if t.sorteado_en is not null then raise exception 'Este taller ya se sorteó'; end if;
  if public.inscripcion_taller_abierta(p_taller) then raise exception 'Cerrá la inscripción antes de sortear'; end if;
  v_libres := case when t.cupo is null then 2147483647 else greatest(t.cupo - public.inscriptos_count(p_taller), 0) end;

  with orden as (
    select hijo_id, row_number() over (order by random()) n
    from public.taller_inscripciones where taller_id = p_taller and estado = 'pendiente'
  ), upd as (
    update public.taller_inscripciones i
       set estado = case when o.n <= v_libres then 'inscripto' else 'espera' end,
           posicion_espera = case when o.n <= v_libres then null else (o.n - v_libres)::int end,
           resuelto_por = public.mi_usuario_id(), resuelto_en = now()
      from orden o where i.taller_id = p_taller and i.hijo_id = o.hijo_id
    returning i.hijo_id, i.estado
  )
  select array_agg(hijo_id) filter (where estado = 'inscripto'), array_agg(hijo_id) filter (where estado = 'espera')
    into v_ins, v_esp from upd;

  update public.talleres set sorteado_en = now(), sorteado_por = public.mi_usuario_id(),
         estado = case when estado = 'publicado' then 'cerrado' else estado end
   where id = p_taller;
  return json_build_object(
    'inscriptos', coalesce(array_length(v_ins, 1), 0), 'espera', coalesce(array_length(v_esp, 1), 0),
    'avisar_inscriptos', public.usuarios_de_hijos(coalesce(v_ins, '{}')),
    'avisar_espera', public.usuarios_de_hijos(coalesce(v_esp, '{}')));
end $$;

-- 5) Lecturas ----------------------------------------------------------------

-- Lugares ocupados por taller (las familias no ven las inscripciones ajenas).
create or replace function public.cupos_talleres(p_ids uuid[])
returns table (taller_id uuid, inscriptos int, espera int, pendientes int)
language sql stable security definer set search_path = public, pg_temp
as $$
  select t.id,
         count(*) filter (where i.estado = 'inscripto')::int,
         count(*) filter (where i.estado = 'espera')::int,
         count(*) filter (where i.estado = 'pendiente')::int
  from public.talleres t left join public.taller_inscripciones i on i.taller_id = t.id
  where t.id = any(p_ids) and public.puede_ver_taller(t.id)
  group by t.id
$$;

-- Lista de inscriptos para el colegio y la profe (la profe sin datos de
-- contacto: hijos tiene RLS cerrada por el dni).
create or replace function public.inscriptos_taller(p_taller uuid)
returns table (hijo_id uuid, nombre text, apellido text, curso text, estado text, posicion_espera int,
               motivo text, creado_en timestamptz, apoderados text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.apellido, c.nombre, i.estado, i.posicion_espera, i.motivo, i.creado_en,
         case when public.gestiona_taller(p_taller) then (
           select string_agg(btrim(coalesce(u.nombre,'') || ' ' || coalesce(u.apellido,'')) ||
                             coalesce(' · ' || nullif(u.telefono,''), '') || coalesce(' · ' || nullif(u.email,''), ''), '; ')
           from public.usuario_hijos uh join public.usuarios u on u.id = uh.usuario_id where uh.hijo_id = h.id)
         end
  from public.taller_inscripciones i
  join public.hijos h on h.id = i.hijo_id
  left join public.cursos c on c.id = h.curso_id
  where i.taller_id = p_taller and (public.gestiona_taller(p_taller) or public.es_profe_taller(p_taller))
  order by case i.estado when 'inscripto' then 0 when 'pendiente' then 1 when 'espera' then 2 when 'rechazado' then 3 else 4 end,
           i.posicion_espera nulls last, h.apellido, h.nombre
$$;

-- Alumnos elegibles que NO están anotados (para "anotar a mano" y para ver
-- quién falta). Solo el colegio.
create or replace function public.elegibles_taller(p_taller uuid)
returns table (hijo_id uuid, nombre text, apellido text, curso text, sin_fecha_nacimiento boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select h.id, h.nombre, h.apellido, c.nombre,
         (t.elegibilidad = 'edad' and h.fecha_nacimiento is null)
  from public.talleres t
  join public.cursos c on public.colegio_de_curso(c.id) = t.colegio_id
  join public.hijos h on h.curso_id = c.id
  where t.id = p_taller and public.gestiona_taller(p_taller)
    and (public.hijo_elegible_taller(t.id, h.id) or (t.elegibilidad = 'edad' and h.fecha_nacimiento is null))
    and (t.año_lectivo is null or c.año_lectivo = t.año_lectivo)
    and not exists (select 1 from public.taller_inscripciones i where i.taller_id = t.id and i.hijo_id = h.id and i.estado <> 'baja')
  order by c.nombre, h.apellido, h.nombre
$$;

-- A quién avisar (usuarios). Solo el colegio:
--   'elegibles'  familias con algún hijo elegible (al publicar)
--   'anotados'   familias con hijo inscripto / en espera / pendiente
--   'inscriptos' solo inscriptos
create or replace function public.usuarios_taller(p_taller uuid, p_modo text)
returns uuid[] language sql stable security definer set search_path = public, pg_temp
as $$
  select case when not public.gestiona_taller(p_taller) then '{}'::uuid[]
    when p_modo = 'elegibles' then public.usuarios_de_hijos(coalesce((
      select array_agg(h.id) from public.talleres t
      join public.cursos c on public.colegio_de_curso(c.id) = t.colegio_id
      join public.hijos h on h.curso_id = c.id
      where t.id = p_taller and (t.año_lectivo is null or c.año_lectivo = t.año_lectivo)
        and public.hijo_elegible_taller(t.id, h.id)), '{}'))
    else public.usuarios_de_hijos(coalesce((
      select array_agg(i.hijo_id) from public.taller_inscripciones i
      where i.taller_id = p_taller and i.estado = any(case when p_modo = 'inscriptos' then array['inscripto'] else array['inscripto','espera','pendiente'] end)), '{}'))
  end
$$;

grant execute on function public.inscribir_en_taller(uuid, uuid), public.baja_de_taller(uuid, uuid),
  public.resolver_inscripcion_taller(uuid, uuid, text, text), public.sortear_taller(uuid),
  public.cupos_talleres(uuid[]), public.inscriptos_taller(uuid), public.elegibles_taller(uuid),
  public.usuarios_taller(uuid, text) to authenticated;
