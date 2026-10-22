-- =============================================================================
-- Materias por nivel (2026-10-22, pedido de Yanina).
--
-- · materias.nivel: 'inicial' | 'primaria' | 'secundaria', o null = "Todos los
--   niveles" (las compartidas: Español, Educación Física, Almuerzo…).
-- · Migración: en los colegios con más de un nivel, una materia que hoy se
--   da solo en cursos de un nivel toma ese nivel; las que se usan en varios
--   niveles (o en ninguno) quedan generales.
-- · El nombre es único por colegio + nivel ("Inglés" de Inicial y de Primaria
--   pueden convivir).
-- · La Secretaría/Dirección por nivel (nivel_admin) administra las materias
--   de SUS niveles (crear, editar, ocultar, borrar, unificar). Las generales y
--   las de otros niveles las ve y las usa, pero no las cambia. El
--   administrador y super, todas.
-- Idempotente. Probado en una transacción con rollback.
-- =============================================================================

alter table public.materias add column if not exists nivel text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materias_nivel_check') then
    alter table public.materias add constraint materias_nivel_check check (nivel is null or nivel in ('inicial','primaria','secundaria'));
  end if;
end $$;

-- Migración (solo lo que todavía no tiene nivel)
update public.materias m set nivel = x.nivel
from (
  select c.materia_id, min(cu.nivel) as nivel
  from public.clases c join public.cursos cu on cu.id = c.curso_id
  where cu.nivel is not null
  group by c.materia_id
  having count(distinct cu.nivel) = 1
) x
join public.materias mm on mm.id = x.materia_id
join public.colegios co on co.id = mm.colegio_id
where m.id = x.materia_id and m.nivel is null and coalesce(array_length(co.niveles, 1), 0) > 1;

drop index if exists public.materias_nombre_uq;
create unique index materias_nombre_uq on public.materias (colegio_id, coalesce(nivel, ''), public.norm_materia(nombre));

-- ¿Soy Secretaría/Dirección de ese nivel en ese colegio?
create or replace function public.es_secretaria_de_nivel(p_colegio uuid, p_nivel text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p_nivel is not null and exists (
    select 1 from public.usuarios u
    where u.auth_id = auth.uid() and u.rol = 'nivel_admin' and u.activo is not false
      and u.colegio_id = p_colegio and p_nivel = any(coalesce(u.niveles, '{}')))
$$;
revoke all on function public.es_secretaria_de_nivel(uuid, text) from public, anon;
grant execute on function public.es_secretaria_de_nivel(uuid, text) to authenticated;

alter policy materias_write on public.materias
  using (es_super() OR es_colegio_admin_de(colegio_id) OR es_secretaria_de_nivel(colegio_id, nivel))
  with check (es_super() OR es_colegio_admin_de(colegio_id) OR es_secretaria_de_nivel(colegio_id, nivel));

-- Unificar: el administrador cualquiera; la Secretaría, dos de sus niveles.
CREATE OR REPLACE FUNCTION public.fusionar_materias(p_origen uuid, p_destino uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare o public.materias; d public.materias; r record;
begin
  select * into o from public.materias where id = p_origen;
  select * into d from public.materias where id = p_destino;
  if o.id is null or d.id is null or o.id = d.id or o.colegio_id <> d.colegio_id then
    raise exception 'Materias inválidas';
  end if;
  if not (public.es_super() or public.es_colegio_admin_de(o.colegio_id)
          or (public.es_secretaria_de_nivel(o.colegio_id, o.nivel) and public.es_secretaria_de_nivel(d.colegio_id, d.nivel))) then
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
end $function$;
