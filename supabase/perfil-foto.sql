-- Foto de perfil (2026-10-15) — aditivo.
--
-- usuarios.foto_url = path en el bucket privado `adjuntos`
-- (perfiles/<usuario_id>/<ts>.jpg, con su .thumb.jpg al lado), firmado al
-- mostrarse como el resto de las imágenes. Las familias no pueden editar su
-- fila de `usuarios` (usuarios_update es solo del colegio), así que la foto se
-- cambia con una RPC que toca SOLO esa columna de la propia fila y solo
-- acepta paths dentro de la carpeta propia. Devuelve el path anterior para
-- que la app lo borre del Storage (puede_modificar_archivo deja borrar lo
-- que subió uno mismo). p_path null = quitar la foto.

alter table public.usuarios add column if not exists foto_url text;

create or replace function public.actualizar_mi_foto(p_path text)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare yo uuid := public.mi_usuario_id(); v_anterior text;
begin
  if yo is null then raise exception 'Sin usuario'; end if;
  if p_path is not null and p_path not like ('perfiles/' || yo::text || '/%') then
    raise exception 'La foto tiene que estar en tu carpeta de perfil';
  end if;
  select foto_url into v_anterior from public.usuarios where id = yo;
  update public.usuarios set foto_url = p_path where id = yo;
  return v_anterior;
end $$;

revoke all on function public.actualizar_mi_foto(text) from public, anon;
grant execute on function public.actualizar_mi_foto(text) to authenticated;
