-- supabase/permisos-push-y-tipo-evento.sql
--
-- Cierra dos huecos que solo se podían usar mandando pedidos a mano, sin pasar
-- por las pantallas. Idempotente. Probar antes en una transacción con rollback.
-- Aplicar ANTES de desplegar send-push: la función nueva llama a
-- destinatarios_push y, sin ella, no saldría ninguna notificación.
--
-- 1) eventos: una familia o un Room Parent no puede pasar un evento propio a un
--    tipo del colegio. Editar uno viejo sin cambiarle el tipo sigue funcionando.
-- 2) destinatarios_push(tipo, usuarios): devuelve a quiénes de esa lista puede
--    mandarle ese tipo de notificación quien llama. send-push manda solo a esos.
--      · super: todo.
--      · administrador y Secretaría: todo, dentro de su colegio.
--      · maestra: avisos, autorizaciones, eventos, encuestas y colectas a sus
--        cursos; lo de la comunidad, dentro de su colegio.
--      · familia y Room Parent: colectas y encuestas (y eventos, solo el Room
--        Parent) a quienes comparten un curso con ellos; festejos, Marketplace,
--        Lost & Found y talleres, dentro de su colegio.
--    Quien no corresponde se saltea sin frenar a los demás de la lista.
-- 3) es_apoderado_de_curso: ya no se puede consultar sin sesión.

create or replace function public.eventos_tipo_familias()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.tipo is distinct from old.tipo
     and auth.uid() is not null
     and new.tipo not in ('familias', 'festejo')
     and not public.es_super()
     and not public.es_colegio_admin_de(public.colegio_de_curso(new.curso_id))
     and not public.es_secretaria_de_curso(new.curso_id)
     and not public.es_docente_curso(new.curso_id)
  then
    raise exception 'Este tipo de evento lo publica el colegio' using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists eventos_tipo_familias on public.eventos;
create trigger eventos_tipo_familias before update on public.eventos
  for each row execute function public.eventos_tipo_familias();

-- Cursos en los que está un usuario: como familia, Room Parent o maestra.
create or replace function public.cursos_para_push(p_usuario uuid)
returns table(curso_id uuid)
language sql stable security definer set search_path = public, pg_temp
as $$
  select uc.curso_id from public.usuario_cursos uc where uc.usuario_id = p_usuario
  union
  select h.curso_id from public.usuario_hijos uh join public.hijos h on h.id = uh.hijo_id where uh.usuario_id = p_usuario
  union
  select cl.curso_id from public.clases cl join public.maestros m on m.id = cl.maestro_id where m.usuario_id = p_usuario
$$;

revoke all on function public.cursos_para_push(uuid) from public, anon, authenticated;

-- El colegio de un usuario: el suyo si es personal, o el de sus cursos.
create or replace function public.usuario_en_colegio(p_usuario uuid, p_colegio uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.usuarios u where u.id = p_usuario and u.colegio_id = p_colegio)
      or exists (select 1 from public.cursos_para_push(p_usuario) c
                 join public.cursos cu on cu.id = c.curso_id
                 where cu.colegio_id = p_colegio)
$$;

revoke all on function public.usuario_en_colegio(uuid, uuid) from public, anon, authenticated;

create or replace function public.destinatarios_push(p_tipo text, p_usuarios uuid[])
returns table(usuario_id uuid)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  yo uuid := public.mi_usuario_id();
  mi_rol text;
  mi_colegio uuid;
  comunidad constant text[] := array['festejo', 'marketplace', 'perdido', 'taller'];
  por_curso text[];
begin
  if yo is null then return; end if;
  select u.rol, u.colegio_id into mi_rol, mi_colegio from public.usuarios u where u.id = yo;

  if mi_rol = 'super' then
    return query select distinct d from unnest(p_usuarios) d;
    return;
  end if;

  if mi_rol in ('colegio_admin', 'nivel_admin') then
    return query select distinct d from unnest(p_usuarios) d
      where public.usuario_en_colegio(d, mi_colegio);
    return;
  end if;

  if p_tipo = any(comunidad) then
    -- El colegio de quien llama sale de sus cursos: una cuenta es de un solo colegio.
    return query select distinct d from unnest(p_usuarios) d
      where exists (select 1 from public.cursos_para_push(yo) c
                    join public.cursos cu on cu.id = c.curso_id
                    where public.usuario_en_colegio(d, cu.colegio_id));
    return;
  end if;

  if mi_rol = 'docente' then
    por_curso := array['recordatorio', 'autorizacion', 'evento', 'encuesta', 'colecta'];
  else
    por_curso := array['colecta', 'colecta_pago', 'recordatorio_pago', 'encuesta'];
    if exists (select 1 from public.usuario_cursos uc where uc.usuario_id = yo and uc.rol = 'room') then
      por_curso := por_curso || 'evento'::text;
    end if;
  end if;
  if not (p_tipo = any(por_curso)) then return; end if;

  return query select distinct d from unnest(p_usuarios) d
    where exists (select 1 from public.cursos_para_push(yo) a
                  join public.cursos_para_push(d) b on b.curso_id = a.curso_id);
end
$$;

revoke all on function public.destinatarios_push(text, uuid[]) from public, anon;
grant execute on function public.destinatarios_push(text, uuid[]) to authenticated;

revoke execute on function public.es_apoderado_de_curso(uuid, uuid) from public, anon;
grant execute on function public.es_apoderado_de_curso(uuid, uuid) to authenticated;
