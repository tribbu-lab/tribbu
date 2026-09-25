// Firmado de URLs de Supabase Storage (mobile) — equivalente RN de
// src/lib/storageUrl.js. Buckets `adjuntos` y `eventos` son privados
// (supabase/storage-privado.sql).

import { supabase } from "./supabase";

const SIGN_TTL = 60 * 60; // 1 hora

export function parseStoragePath(stored) {
  if (!stored || typeof stored !== "string") return null;
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

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
  }
  for (const [b, paths] of Object.entries(porBucket)) {
    try {
      await supabase.storage.from(b).remove(paths);
    } catch {
      // best-effort
    }
  }
}
