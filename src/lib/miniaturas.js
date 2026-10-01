// Miniaturas livianas de imágenes privadas (web + mobile, vía @shared/miniaturas).
//
// El plan de Supabase no tiene transformación de imágenes, así que una
// miniatura de 64 px descargaba la foto entera (invitaciones de 2 MB). Ahora,
// al subir una imagen se guarda al lado una versión chica:
//   festejos/123.png  →  festejos/123.thumb.jpg
// y donde se muestra una miniatura se pide esa (signStorageUrl con
// { miniatura: true }). Si no existe (fotos subidas antes de esto y no
// regeneradas), se usa la original como siempre.

/** Lado mayor de la miniatura: las miniaturas se ven a ≤ 92 px, ×3 de densidad. */
export const MINI_LADO = 320;
/** Lado mayor máximo de la original al subir (las fotos de celular vienen a 4000 px). */
export const ORIGINAL_LADO = 1600;
/** Calidad JPEG (0–1) de la original achicada y de la miniatura. */
export const CALIDAD_ORIGINAL = 0.82;
export const CALIDAD_MINI = 0.7;

/** Path de la miniatura de un path de Storage (mismo bucket). */
export const pathMiniatura = (path) => `${String(path).replace(/\.[^./]+$/, "")}.thumb.jpg`;

/** ¿Es ya una miniatura? (no se le busca miniatura a una miniatura) */
export const esMiniatura = (path) => /\.thumb\.jpg$/i.test(String(path));
