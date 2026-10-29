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

// Dibuja la marca de agua sobre todo el canvas: el texto en diagonal, repetido,
// blanco con borde oscuro (se ve sobre fondos claros y oscuros).
function marcaDeAgua(ctx, w, h, texto) {
  const fuente = Math.max(14, Math.round(Math.min(w, h) / 14));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `700 ${fuente}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, fuente / 14);
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  const diag = Math.hypot(w, h);
  const paso = fuente * 3.2;
  const ancho = ctx.measureText(texto).width + fuente * 2;
  for (let y = -diag / 2, fila = 0; y <= diag / 2; y += paso, fila++) {
    for (let x = -diag / 2 + (fila % 2) * (ancho / 2); x <= diag / 2; x += ancho) {
      ctx.strokeText(texto, x, y);
      ctx.fillText(texto, x, y);
    }
  }
  ctx.restore();
}

function aJpegConMarca(bmp, lado, calidad, texto) {
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
  marcaDeAgua(ctx, w, h, texto);
  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("toBlob"))), "image/jpeg", calidad));
}

// Fotos escolares (lib/fotosEscolares): la muestra que ven las familias va
// chica y con la marca grabada en la imagen; el original queda tal cual.
const MUESTRA_LADO = 1200;

/**
 * Fotos escolares: { original, muestra, mini } listos para subir (JPEG).
 * El original se sube como vino (si es JPEG) para que la descarga digital sea
 * la foto de la fotógrafa; un PNG se pasa a JPEG de alta calidad.
 */
export async function prepararFotoEscolar(file, textoMarca) {
  const bmp = await createImageBitmap(file);
  try {
    const [original, muestra, mini] = await Promise.all([
      file.type === "image/jpeg" ? file : aJpeg(bmp, Math.max(bmp.width, bmp.height), 0.92),
      aJpegConMarca(bmp, MUESTRA_LADO, CALIDAD_ORIGINAL, textoMarca),
      aJpegConMarca(bmp, MINI_LADO * 1.5, CALIDAD_MINI, textoMarca),
    ]);
    return { original, muestra, mini };
  } finally {
    bmp.close?.();
  }
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
