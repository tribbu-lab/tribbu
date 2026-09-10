// Firmado de URLs de Supabase Storage. Los buckets `adjuntos` y `eventos`
// pasaron a privados (ver supabase/storage-privado.sql): ya no se puede usar
// getPublicUrl, hay que firmar cada acceso.
//
// Compatibilidad: en la base hay filas viejas que guardaron la URL pública
// completa (`.../object/public/<bucket>/<path>`) y filas nuevas que guardan
// solo el path. parseStoragePath() maneja ambas.

import { supabase } from "../supabase";

const SIGN_TTL = 60 * 60; // 1 hora

// Devuelve { bucket, path } a partir de una URL pública/firmada guardada, o
// null si `stored` ya es un path pelado (el caller pasa el bucket aparte).
export function parseStoragePath(stored) {
  if (!stored || typeof stored !== "string") return null;
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

// Firma `stored` (URL guardada o path pelado). Si no se puede resolver, o si
// el firmado falla, devuelve `stored` tal cual (mejor una imagen rota que un
// throw). `bucket` es obligatorio cuando `stored` es un path pelado.
export async function signStorageUrl(stored, bucket) {
  if (!stored || typeof stored !== "string") return stored;
  const parsed = parseStoragePath(stored);
  const b = parsed?.bucket || bucket;
  const p = parsed?.path || stored;
  if (!b || !p || p.startsWith("http")) return stored;
  try {
    const { data, error } = await supabase.storage.from(b).createSignedUrl(p, SIGN_TTL);
    return error ? stored : (data?.signedUrl || stored);
  } catch {
    return stored;
  }
}
