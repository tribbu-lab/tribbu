-- =============================================================================
-- storage-privado.sql · Buckets `adjuntos` y `eventos` → privados
-- =============================================================================
-- Correr UNA vez en el SQL editor de Supabase (proyecto tribbu).
--
-- Motivo (auditoría A1): hoy los archivos adjuntos (permisos, PDFs), las
-- invitaciones a festejos y el logo del colegio viven en buckets PÚBLICOS —
-- cualquiera con la URL los abre sin estar logueado. Con esto pasan a
-- privados: solo se acceden con una URL firmada (expira en 1h) que el cliente
-- genera con la sesión del usuario. `libros` (tapas de libros de texto) queda
-- público a propósito: no es información sensible.
--
-- El código ya está preparado (src/lib/storageUrl.js, components/SignedImg):
-- firma cada acceso y es compatible con las filas viejas que guardaron la URL
-- pública completa.
--
-- DESPUÉS DE CORRER ESTO: en Dashboard → Storage → Policies, borrar cualquier
-- policy de lectura "pública"/"anon" que haya quedado sobre `adjuntos` o
-- `eventos` (p. ej. "Public Access", "Allow public read"). Con el bucket
-- privado la ruta /object/public/ ya falla, pero una policy `to anon` sobre
-- storage.objects permitiría firmar con la anon key sin cuenta.
-- =============================================================================

update storage.buckets set public = false where id in ('adjuntos', 'eventos');

-- Lectura: cualquier usuario autenticado puede firmar/leer objetos de estos
-- buckets. Las filas de la base que exponen estos archivos (recordatorios,
-- eventos, colegios) ya están acotadas por RLS por curso/colegio, así que el
-- salto real que cierra esto es "cualquiera en internet" → "usuario logueado".
drop policy if exists "priv_read_adjuntos_eventos" on storage.objects;
create policy "priv_read_adjuntos_eventos" on storage.objects
  for select to authenticated
  using ( bucket_id in ('adjuntos', 'eventos') );

-- Alta / reemplazo (upsert): se mantiene para autenticados — subir un adjunto,
-- una invitación o el logo del colegio.
drop policy if exists "priv_insert_adjuntos_eventos" on storage.objects;
create policy "priv_insert_adjuntos_eventos" on storage.objects
  for insert to authenticated
  with check ( bucket_id in ('adjuntos', 'eventos') );

drop policy if exists "priv_update_adjuntos_eventos" on storage.objects;
create policy "priv_update_adjuntos_eventos" on storage.objects
  for update to authenticated
  using ( bucket_id in ('adjuntos', 'eventos') )
  with check ( bucket_id in ('adjuntos', 'eventos') );
