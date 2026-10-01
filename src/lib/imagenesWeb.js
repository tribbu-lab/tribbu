// Subida de imágenes desde la web con original achicada + miniatura
// (ver lib/miniaturas.js). Solo web: usa canvas/createImageBitmap del DOM —
// mobile hace lo mismo con expo-image-manipulator en mobile/lib/media.js.

import { MINI_LADO, ORIGINAL_LADO, CALIDAD_ORIGINAL, CALIDAD_MINI, pathMiniatura } from "./miniaturas";

// A partir de este peso la original se re-comprime aunque no sea grande en px.
const PESO_MAX_ORIGINAL = 800 * 1024;

const extDe = (file) => (file.name?.split(".").pop() || "jpg").toLowerCase();

// Dibuja `bmp` con el lado mayor ≤ `lado` (sin agrandar) y lo exporta a JPEG.
// Fondo blanco: un PNG con transparencia no queda negro.
function aJpeg(bmp, lado, calidad) {
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("toBlob"))), "image/jpeg", calidad));
}

/**
 * Prepara una imagen para subir: { blob, ext, contentType, mini }.
 * GIF/SVG (o si el navegador no puede decodificarla) van tal cual, sin miniatura.
 */
export async function prepararImagen(file) {
  const tal = { blob: file, ext: extDe(file), contentType: file.type, mini: null };
  if (!file.type?.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return tal;
  try {
    const bmp = await createImageBitmap(file); // respeta la orientación EXIF
    const achicar = Math.max(bmp.width, bmp.height) > ORIGINAL_LADO || file.size > PESO_MAX_ORIGINAL;
    const [blob, mini] = await Promise.all([
      achicar ? aJpeg(bmp, ORIGINAL_LADO, CALIDAD_ORIGINAL) : file,
      aJpeg(bmp, MINI_LADO, CALIDAD_MINI),
    ]);
    bmp.close?.();
    return achicar ? { blob, ext: "jpg", contentType: "image/jpeg", mini } : { ...tal, mini };
  } catch {
    return tal;
  }
}

/**
 * Sube `file` a `bucket` en `${pathSinExt}.<ext>` (+ su .thumb.jpg al lado) y
 * devuelve { path, error }. La miniatura es best-effort: si falla, las
 * pantallas usan la original como antes.
 */
export async function subirImagen(supabase, bucket, pathSinExt, file, { upsert = false } = {}) {
  const prep = await prepararImagen(file);
  const path = `${pathSinExt}.${prep.ext}`;
  const subir = (p, blob, contentType) => supabase.storage.from(bucket).upload(p, blob, { contentType, upsert });
  const [res] = await Promise.all([
    subir(path, prep.blob, prep.contentType),
    prep.mini ? subir(pathMiniatura(path), prep.mini, "image/jpeg").catch(() => null) : null,
  ]);
  return { path, error: res.error };
}
