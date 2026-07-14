// Helpers de medios para mobile (no existen en la web, que usa el DOM):
// - pickAndUploadImage: elige una imagen con expo-image-picker, la sube al bucket
//   de Supabase Storage y devuelve la URL pública. Reemplaza el <input type=file>
//   + storage.upload(File) de la web (RN no tiene File/Blob desde el picker).
// - exportRowsToExcel: arma un .xlsx con xlsx, lo escribe en cache con
//   expo-file-system y abre la hoja de compartir nativa (la web usa writeFile,
//   que dispara una descarga).

import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Decodifica base64 → Uint8Array sin depender de atob/Buffer (no garantizados en
// Hermes). Supabase Storage acepta un ArrayBufferView directamente.
function base64ToBytes(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    out.push((e1 << 2) | (e2 >> 4));
    if (e3 >= 0 && i + 2 < clean.length) out.push(((e2 & 15) << 4) | (e3 >> 2));
    if (e4 >= 0 && i + 3 < clean.length) out.push(((e3 & 3) << 6) | e4);
  }
  return Uint8Array.from(out);
}

const EXT_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
};

/**
 * Pide permiso, abre la galería, sube la imagen elegida al bucket indicado y
 * devuelve `{ url }` con la URL pública, o `null` si el usuario canceló.
 * Lanza si falla el permiso o la subida (el caller muestra el error).
 */
export async function pickAndUploadImage({ bucket = "eventos", pathPrefix = "" }) {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permiso de galería denegado");

  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;

  const asset = res.assets[0];
  const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase().split("?")[0];
  const contentType = EXT_MIME[ext] || asset.mimeType || "image/jpeg";
  const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
  const bytes = base64ToBytes(b64);
  const path = `${pathPrefix}${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl };
}

/**
 * Escribe `rows` (array de objetos) como .xlsx y abre la hoja de compartir.
 * `cols` opcional define el ancho de columnas. `nombreHoja`/`fileName` rotulan.
 */
export async function exportRowsToExcel({ rows, cols, nombreHoja = "Hoja1", fileName = "export" }) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (cols) ws["!cols"] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 28));
  const b64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

  const safeName = fileName.replace(/[/\\?*[\]:]/g, "").slice(0, 60) || "export";
  const uri = `${FileSystem.cacheDirectory}${safeName}.xlsx`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: "base64" });

  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartir no disponible en este dispositivo");
  await Sharing.shareAsync(uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    dialogTitle: `${safeName}.xlsx`,
    UTI: "org.openxmlformats.spreadsheetml.sheet",
  });
}
