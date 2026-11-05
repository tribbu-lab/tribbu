-- supabase/borrado-de-usuarios.sql
--
-- Dos FKs "ON DELETE SET NULL" a usuarios no podían cumplirse, así que borrar a
-- quien escribió un mensaje o creó una encuesta fallaba siempre, también en
-- delete-account (encontrado al probar con rollback, 2026-11-05):
--
-- 1. mensajes.autor_id: la FK dispara mensajes_antes_update, que pisa autor_id
--    con el valor viejo y rechaza a quien no es el autor. Ahora deja pasar ese
--    caso. No se puede usar desde el cliente: exige que el autor ya no exista
--    en usuarios, y eso solo pasa durante el propio borrado.
-- 2. encuestas.creado_por era NOT NULL: la encuesta es del curso y debe quedar.
--
-- Idempotente.

create or replace function public.mensajes_antes_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- se borró la cuenta del autor (FK ON DELETE SET NULL): el mensaje queda sin autor
  if old.autor_id is not null and new.autor_id is null
     and not exists (select 1 from public.usuarios u where u.id = old.autor_id) then
    return new;
  end if;
  new.id := old.id;
  new.conversacion_id := old.conversacion_id;
  new.autor_id := old.autor_id;
  new.rol_autor := old.rol_autor;
  new.creado_en := old.creado_en;
  if old.borrado_en is not null then
    raise exception 'El mensaje ya fue eliminado';
  end if;
  if new.borrado_en is not null then
    -- borrar: se va el contenido, queda la fila
    new.borrado_en := now();
    new.texto := null;
    new.fotos := '[]'::jsonb;
    new.editado_en := old.editado_en;
    return new;
  end if;
  -- editar: solo el autor (current_user = 'authenticated' → viene del cliente)
  if old.autor_id is distinct from public.mi_usuario_id() then
    raise exception 'Solo quien escribió el mensaje puede editarlo';
  end if;
  if new.texto is distinct from old.texto or new.fotos is distinct from old.fotos then
    new.editado_en := now();
  else
    new.editado_en := old.editado_en;
  end if;
  return new;
end $function$;

alter table public.encuestas alter column creado_por drop not null;

-- 3. Eliminar una cuenta es del administrador del colegio (responsable de sus
--    usuarios) o de super. La Secretaría no: se le quita el permiso.
alter policy usuarios_delete on public.usuarios
  using (public.es_super() or public.es_colegio_admin_de_usuario(id));
