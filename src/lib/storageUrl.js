// Firmado de URLs de Supabase Storage. Los buckets `adjuntos` y `eventos`
// pasaron a privados (ver supabase/storage-privado.sql): ya no se puede usar
// getPublicUrl, hay que firmar cada acceso.
//
// Compatibilidad: en la base hay filas viejas que guardaron la URL pública
// completa (`.../object/public/<bucket>/<path>`) y filas nuevas que guardan
// solo el path. parseStoragePath() maneja ambas.

import { supabase } from "../supabase";
import { pathMiniatura, esMiniatura } from "./miniaturas";

const SIGN_TTL = 60 * 60; // 1 hora

// Caché de URLs firmadas: path → { promesa, vence }. Sin esto cada render de
// una imagen privada (y el lightbox al ampliarla) pedía otra firma, y como la
// URL firmada cambia en cada pedido, el navegador/RN volvía a descargar la
// imagen entera. Se guarda la promesa (dos pedidos simultáneos de la misma
// foto comparten uno) y se reusa hasta 5 min antes de que venza.
const firmadas = new Map();
const MARGEN_MS = 5 * 60 * 1000;

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
export async function signStorageUrl(stored, bucket, { miniatura = false } = {}) {
  if (!stored || typeof stored !== "string") return stored;
  const parsed = parseStoragePath(stored);
  const b = parsed?.bucket || bucket;
  const p = parsed?.path || stored;
  if (!b || !p || p.startsWith("http")) return stored;
  // Miniatura (lib/miniaturas): la .thumb.jpg de al lado si existe; si no
  // (fotos subidas antes de las miniaturas), la original como siempre.
  if (miniatura && !esMiniatura(p)) {
    const mini = await firmar(b, pathMiniatura(p));
    if (mini) return mini;
  }
  return (await firmar(b, p)) || stored;
}

// Firma b/p con caché: la promesa (URL firmada, o null si no se pudo) se
// reusa hasta 5 min antes de vencer. Un 404 (no existe — típico de una
// miniatura que todavía no se generó) también queda en caché, para no
// repetir el pedido fallido en cada render; cualquier otro error, no.
function firmar(b, p) {
  const clave = `${b}/${p}`;
  const enCache = firmadas.get(clave);
  if (enCache && enCache.vence > Date.now()) return enCache.promesa;
  const promesa = (async () => {
    try {
      const { data, error } = await supabase.storage.from(b).createSignedUrl(p, SIGN_TTL);
      if (error || !data?.signedUrl) {
        if (String(error?.statusCode ?? error?.status) !== "404") firmadas.delete(clave);
        return null;
      }
      return data.signedUrl;
    } catch {
      firmadas.delete(clave);
      return null;
    }
  })();
  firmadas.set(clave, { promesa, vence: Date.now() + SIGN_TTL * 1000 - MARGEN_MS });
  return promesa;
}

// Borra del bucket los archivos de algo que se borró (aviso, evento,
// publicación), para no dejar huérfanos. `refs`: paths pelados, URLs viejas
// o items { url } de un array de adjuntos. Best-effort: la RLS de Storage
// (storage-borrado.sql) solo deja borrar a quien subió el archivo, así que si
// lo borra otro (el colegio, por ejemplo) el archivo queda y no pasa nada.
export async function borrarArchivos(refs, bucket) {
  const porBucket = {};
  for (const r of refs || []) {
    const stored = typeof r === "string" ? r : r?.url;
    if (!stored) continue;
    const parsed = parseStoragePath(stored);
    const b = parsed?.bucket || bucket;
    const p = parsed?.path || stored;
    if (!b || !p || p.startsWith("http")) continue;
    (porBucket[b] = porBucket[b] || []).push(p);
    // Y su miniatura, si tiene (si no existe, remove la ignora).
    if (!esMiniatura(p)) porBucket[b].push(pathMiniatura(p));
  }
  for (const [b, paths] of Object.entries(porBucket)) {
    try {
      await supabase.storage.from(b).remove(paths);
    } catch {
      // best-effort
    }
  }
}
