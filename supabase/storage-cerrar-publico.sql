-- supabase/storage-cerrar-publico.sql
--
-- storage-privado.sql (2026-09) pasó los buckets `adjuntos` y `eventos` a
-- privados, pero quedaron vivas dos policies viejas de lectura para el rol
-- `public` (anon, sin login) — verificado 2026-09-23: con la anon key, que está
-- en el bundle, se podían listar y bajar adjuntos, logos e invitaciones sin
-- cuenta. La lectura de usuarios logueados sigue por priv_read_adjuntos_eventos
-- (authenticated), que es la que usa la app para firmar URLs.
--
-- Además, "upload libros" dejaba subir archivos al bucket `libros` sin login:
-- queda solo para authenticated (la lectura pública de libros es a propósito).

drop policy if exists "Allow public read" on storage.objects;
drop policy if exists "adjuntos_read" on storage.objects;

drop policy if exists "upload libros" on storage.objects;
create policy "upload libros" on storage.objects for insert to authenticated
  with check (bucket_id = 'libros');
