-- Quitar la maestra de una clase (2026-10-13)
--
-- Dos arreglos sobre supabase/materias-y-clases.sql:
--
-- 1) Poner una clase en "Sin maestra" dejaba el nombre de la maestra en los
--    bloques del horario: horarios_desde_clase() conserva el texto "docente"
--    cuando la clase no tiene maestra (pensado para Recreo/Almuerzo, que nunca
--    la tuvieron). Ahora clases_sync(), cuando una clase PASA de tener maestra
--    a no tenerla, borra el texto de sus bloques — solo donde dice el nombre de
--    esa maestra. Recreo/Almuerzo (nunca tuvieron maestra) y los textos
--    escritos a mano no se tocan.
--
-- 2) recalcular_materia_maestro() no actualizaba maestros.materia cuando a la
--    maestra no le quedaba ninguna clase (`and exists (...)`): sacarle su
--    última clase dejaba la materia vieja en su ficha para siempre. Ahora queda
--    vacía. Solo corre cuando cambia una clase de esa maestra, así que no toca
--    a las maestras sin clases que todavía tienen el texto libre de antes.
--
-- Idempotente: se puede correr más de una vez.

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
$$;
revoke all on function public.recalcular_materia_maestro(uuid) from public, anon, authenticated;

create or replace function public.clases_sync()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_nombre text;
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
  -- la clase se quedó sin maestra: sacar su nombre de los bloques del horario
  if tg_op = 'UPDATE' and old.maestro_id is not null and new.maestro_id is null then
    select nullif(btrim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '') into v_nombre
      from public.maestros where id = old.maestro_id;
    if v_nombre is not null then
      update public.horarios h set docente = null
      where h.clase_id = new.id and public.norm_materia(btrim(h.docente)) = public.norm_materia(v_nombre);
    end if;
  end if;
  -- los horarios de la clase siguen mostrando la maestra actual
  if tg_op = 'UPDATE' then
    update public.horarios h set clase_id = h.clase_id where h.clase_id = new.id;
  end if;
  return null;
end $$;
-- el trigger clases_sync ya existe y apunta a esta función: no hace falta recrearlo.

-- Reparación de lo que ya quedó mal ------------------------------------------
-- a) Bloques de horario de clases SIN maestra que todavía muestran el nombre
--    de una maestra que ya no da esa clase. Mirá primero cuáles son:
--
--   select h.id, cu.nombre as curso, h.dia, h.hora_inicio, h.materia, h.docente
--   from public.horarios h
--   join public.clases c on c.id = h.clase_id and c.maestro_id is null
--   join public.cursos cu on cu.id = h.curso_id
--   where exists (select 1 from public.maestros m
--                 where public.norm_materia(btrim(m.nombre || ' ' || coalesce(m.apellido, ''))) = public.norm_materia(btrim(h.docente)));
--
--   y si la lista es la esperada, borralos:
--
--   update public.horarios h set docente = null
--   from public.clases c
--   where c.id = h.clase_id and c.maestro_id is null
--     and exists (select 1 from public.maestros m
--                 where public.norm_materia(btrim(m.nombre || ' ' || coalesce(m.apellido, ''))) = public.norm_materia(btrim(h.docente)));
--
-- b) La materia de las maestras a las que se les sacó la última clase queda
--    vacía recién la próxima vez que se toque una clase suya. No hay reparación
--    masiva a propósito: borraría también el texto de las maestras que nunca
--    tuvieron clases cargadas.
