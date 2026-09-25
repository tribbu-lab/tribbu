-- Storage: borrar y sobrescribir archivos solo quien los subió (2026-09-25).
--
-- Antes, en los buckets privados `adjuntos` y `eventos`:
--   · UPDATE ("priv_update_adjuntos_eventos", "adjuntos_update") dejaba a
--     cualquier usuario logueado sobrescribir CUALQUIER archivo (un upload con
--     upsert sobre el path de otro).
--   · no había DELETE: borrar un aviso / evento / publicación dejaba sus
--     archivos huérfanos para siempre.
-- Ahora las dos operaciones son del dueño del archivo (owner_id = quien lo
-- subió), super, y el admin del colegio sobre el logo de su colegio
-- (colegios/<colegio_id>/logo.*, que re-sube cualquier admin de ese colegio).
-- La app borra los archivos de lo que borra (borrarArchivos en storageUrl.js).
--
-- Correr una vez. Idempotente.

create or replace function public.puede_modificar_archivo(p_bucket text, p_name text, p_owner text)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select public.es_super()
      or (p_owner is not null and p_owner = auth.uid()::text)
      or (p_bucket = 'adjuntos' and p_name like 'colegios/%'
          and (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
          and public.es_colegio_admin_de(((storage.foldername(p_name))[2])::uuid))
$$;
revoke all on function public.puede_modificar_archivo(text, text, text) from public, anon;
grant execute on function public.puede_modificar_archivo(text, text, text) to authenticated;

drop policy if exists "priv_update_adjuntos_eventos" on storage.objects;
drop policy if exists "adjuntos_update" on storage.objects;
drop policy if exists "priv_update_propios" on storage.objects;
create policy "priv_update_propios" on storage.objects for update to authenticated
  using (bucket_id in ('adjuntos', 'eventos') and public.puede_modificar_archivo(bucket_id, name, owner_id))
  with check (bucket_id in ('adjuntos', 'eventos') and public.puede_modificar_archivo(bucket_id, name, owner_id));

drop policy if exists "priv_delete_propios" on storage.objects;
create policy "priv_delete_propios" on storage.objects for delete to authenticated
  using (bucket_id in ('adjuntos', 'eventos') and public.puede_modificar_archivo(bucket_id, name, owner_id));
