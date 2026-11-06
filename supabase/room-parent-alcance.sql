-- supabase/room-parent-alcance.sql
--
-- Alcance del Room Parent: horarios, adopción, alertas, uniformes, apoderados y
-- datos del curso pasan a ser solo del colegio. Nombrar Room Parents sigue
-- permitido, entre los apoderados del curso.
-- Idempotente. Probar antes en una transacción con rollback.
--
-- 1) horarios: el Room Parent deja de poder crear, editar y borrar bloques.
--    Sigue pudiendo leerlos, como cualquier miembro del curso (horarios_select
--    no cambia).
-- 2) adopcion_por_curso: el Room Parent deja de ver los números. Usa su propio
--    chequeo porque puede_ver_lecturas también decide quién ve las lecturas de
--    los avisos, y eso no cambia.
-- 3) alertas: el Room Parent deja de poder publicarlas, editarlas y borrarlas.
--    Las sigue viendo y cerrando para sí, como cualquier familia.
-- 4) uniforme_cursos y usuario_hijos: el Room Parent deja de poder escribirlos.
-- 5) cursos: del curso solo puede cambiar el monto y la moneda del regalo.
-- 6) eventos: una familia o un Room Parent solo crea eventos "familias" y
--    festejos; los tipos del colegio quedan para el colegio y las maestras.
--    Los eventos ya creados no se tocan.
-- 7) usuario_cursos: el Room Parent solo agrega Room Parents, y solo entre los
--    apoderados de ese curso. Sacar o cambiar a otro queda para el colegio;
--    cada uno puede seguir quitándose a sí mismo.

alter policy horarios_insert on public.horarios
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy horarios_update on public.horarios
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id))
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy horarios_delete on public.horarios
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy alertas_insert on public.alertas
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy alertas_update on public.alertas
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id))
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy alertas_delete on public.alertas
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy uniforme_cursos_insert on public.uniforme_cursos with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
alter policy uniforme_cursos_update on public.uniforme_cursos using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))) with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));
alter policy uniforme_cursos_delete on public.uniforme_cursos using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)));

alter policy usuario_hijos_insert on public.usuario_hijos with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) or public.es_secretaria_de_hijo(hijo_id));
alter policy usuario_hijos_update on public.usuario_hijos using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) or public.es_secretaria_de_hijo(hijo_id)) with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) or public.es_secretaria_de_hijo(hijo_id));
alter policy usuario_hijos_delete on public.usuario_hijos using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_hijo(hijo_id)) or public.es_secretaria_de_hijo(hijo_id));

alter policy eventos_insert on public.eventos
  with check (
    public.es_super()
    or (public.es_miembro_curso(curso_id) and tipo in ('familias', 'festejo'))
    or (public.es_docente_curso(curso_id) and tipo is distinct from 'festejo')
    or public.es_colegio_admin_de(public.colegio_de_curso(curso_id))
    or public.es_secretaria_de_curso(curso_id)
  );

create or replace function public.es_apoderado_de_curso(p_usuario uuid, p_curso uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.usuario_hijos uh
    join public.hijos h on h.id = uh.hijo_id
    join public.usuarios u on u.id = uh.usuario_id
    where uh.usuario_id = p_usuario
      and h.curso_id = p_curso
      and u.rol in ('padre', 'room')
      and coalesce(u.activo, true)
  )
$$;

alter policy usuario_cursos_insert on public.usuario_cursos
  with check (
    public.es_super()
    or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id)
    or (public.es_admin_curso(curso_id) and rol = 'room' and public.es_apoderado_de_curso(usuario_id, curso_id))
  );

alter policy usuario_cursos_update on public.usuario_cursos
  using (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id))
  with check (public.es_super() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

alter policy usuario_cursos_delete on public.usuario_cursos
  using (public.es_super() or usuario_id = public.mi_usuario_id() or public.es_colegio_admin_de(public.colegio_de_curso(curso_id)) or public.es_secretaria_de_curso(curso_id));

-- RLS no distingue columnas: lo hace este trigger. Solo aplica a quien edita el
-- curso por ser Room Parent; el colegio y las Edge Functions no entran acá.
create or replace function public.cursos_room_solo_regalo()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if public.es_admin_curso(old.id)
     and not public.es_super()
     and not public.es_colegio_admin_de(old.colegio_id)
     and (to_jsonb(new) - 'monto_regalo' - 'moneda_regalo') is distinct from (to_jsonb(old) - 'monto_regalo' - 'moneda_regalo')
  then
    raise exception 'El Room Parent solo puede cambiar el monto del regalo' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists cursos_room_solo_regalo on public.cursos;
create trigger cursos_room_solo_regalo before update on public.cursos
  for each row execute function public.cursos_room_solo_regalo();

create or replace function public.adopcion_por_curso(p_ids uuid[])
returns table(curso_id uuid, familias integer, con_app integer, con_calendario integer, activas_30d integer)
language sql stable security definer set search_path = public, pg_temp
as $$
  with fam as (
    select distinct h.curso_id, u.id as usuario_id, u.auth_id
    from public.hijos h
    join public.usuario_hijos uh on uh.hijo_id = h.id
    join public.usuarios u on u.id = uh.usuario_id
    where h.curso_id = any(p_ids)
      and coalesce(u.activo, true)
      and (public.es_super()
           or public.es_colegio_admin_de(public.colegio_de_curso(h.curso_id))
           or public.es_secretaria_de_curso(h.curso_id))
  )
  select f.curso_id,
         count(*)::int,
         count(*) filter (where exists (select 1 from public.push_tokens pt where pt.usuario_id = f.usuario_id))::int,
         count(*) filter (where exists (select 1 from public.usuario_calendar_tokens t where t.usuario_id = f.usuario_id and t.leido_en is not null))::int,
         count(*) filter (where exists (select 1 from auth.users au where au.id = f.auth_id and au.last_sign_in_at > now() - interval '30 days'))::int
  from fam f
  group by f.curso_id
$$;
