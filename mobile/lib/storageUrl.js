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
