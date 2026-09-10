-- =============================================================================
-- storage-privado-por-curso.sql · Hardening opcional de A1 (defensa en profundidad)
-- =============================================================================
-- Correr DESPUÉS de storage-privado.sql, y solo si querés acotar más.
--
-- storage-privado.sql dejó la lectura de `adjuntos`/`eventos` en "cualquier
-- usuario autenticado". Eso ya cierra el hueco real (antes: cualquiera en
-- internet). Las tablas que exponen esas imágenes (recordatorios, eventos,
-- colegios) ya están acotadas por curso/colegio en su propio RLS.
--
-- Este archivo agrega scoping por curso a nivel Storage para `adjuntos`, cuyo
-- path es predecible: `{cursoId}/{ts}.ext` (adjuntos de avisos/eventos) o
-- `colegios/{colegioId}/logo.ext` (logo del colegio).
--
-- `eventos` (invitaciones a festejos) NO se acota acá: su path es
-- `festejos/{cursoId}_{alumnoId}_{ts}.ext` — el cursoId va en el nombre del
-- archivo, no en la carpeta, y parsearlo con regex en una policy que corre en
-- cada request de firma es frágil. Queda en "authenticated".
-- =============================================================================

drop policy if exists "priv_read_adjuntos_eventos" on storage.objects;

-- adjuntos: miembro del curso de la carpeta, o admin del colegio de ese curso,
-- o (carpeta "colegios") miembro de ese colegio.
create policy "priv_read_adjuntos_scoped" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'adjuntos'
    and (
      case
        when (storage.foldername(name))[1] = 'colegios'
          then public.es_super()
            or public.es_miembro_colegio(((storage.foldername(name))[2])::uuid)
        else public.es_super()
          or public.es_miembro_curso(((storage.foldername(name))[1])::uuid)
          or public.es_colegio_admin_de(public.colegio_de_curso(((storage.foldername(name))[1])::uuid))
      end
    )
  );

-- eventos: authenticated (ver comentario arriba).
create policy "priv_read_eventos_auth" on storage.objects
  for select to authenticated
  using ( bucket_id = 'eventos' );
