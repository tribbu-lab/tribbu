-- supabase/cambios-salida.sql — Cambios en la salida (docs/notas-tecnicas.md)
--
-- Una familia avisa al colegio que su hijo se retira de forma distinta a la
-- habitual: día, horario, motivo, con quién se retira y un comentario. Una
-- fila por aviso; el historial es la misma tabla (no se borra nada).
--
-- Permisos:
--   - avisar: la familia del hijo, con el curso del hijo, para hoy o después
--     (hora AR);
--   - ver: la familia del hijo, la Secretaría del nivel del curso, el
--     administrador del colegio, super y (solo lectura) las docentes del curso;
--   - marcar como visto: Secretaría del nivel / administrador / super
--     (RPC marcar_cambio_salida_visto);
--   - cancelar: la familia, mientras no haya pasado el día
--     (RPC cancelar_cambio_salida).
--   Sin políticas de update/delete: los cambios de estado van solo por RPC.
--
-- Sin push (2026-10-27): se avisa con el globito rojo (contarSalidasSinVer /
-- contarNovedadesSalidas en src/lib/cambiosSalida.js). El RPC de destinatarios
-- de la primera versión se borra.
--
-- Correr después de rls-hardening.sql, multi-colegio.sql, docentes.sql y
-- roles-por-nivel.sql. Idempotente.

create table if not exists public.cambios_salida (
  id              uuid primary key default gen_random_uuid(),
  hijo_id         uuid not null references public.hijos(id) on delete cascade,
  curso_id        uuid not null references public.cursos(id) on delete cascade,
  fecha           date not null,
  hora            time not null,
  motivo          text not null check (motivo in ('medico', 'actividad', 'familiar', 'otro')),
  motivo_detalle  text,
  retira          text not null check (retira in ('familia', 'otro_adulto', 'transporte', 'solo')),
  retira_nombre   text,
  retira_dni      text,
  comentario      text,
  creado_por      uuid references public.usuarios(id) on delete set null default public.mi_usuario_id(),
  creado_en       timestamptz not null default now(),
  visto_por       uuid references public.usuarios(id) on delete set null,
  visto_en        timestamptz,
  cancelado_en    timestamptz,
  constraint cambios_salida_motivo_otro check (motivo <> 'otro' or coalesce(btrim(motivo_detalle), '') <> ''),
  constraint cambios_salida_otro_adulto check (retira <> 'otro_adulto' or (coalesce(btrim(retira_nombre), '') <> '' and coalesce(btrim(retira_dni), '') <> ''))
);
create index if not exists cambios_salida_curso_fecha on public.cambios_salida (curso_id, fecha desc);
create index if not exists cambios_salida_hijo on public.cambios_salida (hijo_id);

-- Hoy en Argentina (la fecha del aviso se compara contra esto).
create or replace function public.hoy_ar()
returns date
language sql stable set search_path = public, pg_temp
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- ¿Quien llama gestiona los cambios de salida de este curso?
create or replace function public.gestiona_salidas_de_curso(p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or public.es_colegio_admin_de(public.colegio_de_curso(p_curso))
      or public.es_secretaria_de_curso(p_curso)
$$;

alter table public.cambios_salida enable row level security;

drop policy if exists cambios_salida_select on public.cambios_salida;
create policy cambios_salida_select on public.cambios_salida for select to authenticated
  using (public.es_padre_de(hijo_id)
         or public.gestiona_salidas_de_curso(curso_id)
         or public.es_docente_curso(curso_id));

drop policy if exists cambios_salida_insert on public.cambios_salida;
create policy cambios_salida_insert on public.cambios_salida for insert to authenticated
  with check (public.es_padre_de(hijo_id)
              and creado_por = public.mi_usuario_id()
              and exists (select 1 from public.hijos h where h.id = hijo_id and h.curso_id = cambios_salida.curso_id)
              and fecha >= public.hoy_ar()
              and visto_por is null and visto_en is null and cancelado_en is null);

drop policy if exists cambios_salida_update on public.cambios_salida;
drop policy if exists cambios_salida_delete on public.cambios_salida;

-- Secretaría / administrador / super: "Visto". Devuelve true si cambió.
create or replace function public.marcar_cambio_salida_visto(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_curso uuid;
begin
  select curso_id into v_curso from public.cambios_salida where id = p_id;
  if v_curso is null or not public.gestiona_salidas_de_curso(v_curso) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.cambios_salida
     set visto_por = public.mi_usuario_id(), visto_en = now()
   where id = p_id and visto_en is null and cancelado_en is null;
  return found;
end $$;

-- La familia cancela el aviso mientras no haya pasado el día.
create or replace function public.cancelar_cambio_salida(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_hijo uuid;
begin
  select hijo_id into v_hijo from public.cambios_salida where id = p_id;
  if v_hijo is null or not public.es_padre_de(v_hijo) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.cambios_salida
     set cancelado_en = now()
   where id = p_id and cancelado_en is null and fecha >= public.hoy_ar();
  return found;
end $$;

drop function if exists public.destinatarios_cambio_salida(uuid);

do $$
declare f text;
begin
  foreach f in array array['gestiona_salidas_de_curso(uuid)', 'marcar_cambio_salida_visto(uuid)',
    'cancelar_cambio_salida(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
grant select, insert on public.cambios_salida to authenticated;
