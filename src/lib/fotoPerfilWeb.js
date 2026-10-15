// Foto de perfil desde la web (supabase/perfil-foto.sql). Espejo de
// mobile/lib/fotoPerfil.js: sube a `adjuntos` en perfiles/<usuario_id>/<ts>.jpg
// (+ miniatura) y la guarda con la RPC actualizar_mi_foto, que devuelve la
// anterior para borrarla del Storage.
import { subirImagen } from "./imagenesWeb";
import { borrarArchivos } from "./storageUrl";

const MAX_FOTO = 10 * 1024 * 1024;

/** Pone `file` como foto de perfil. Devuelve el path nuevo. */
export async function ponerFotoPerfil(supabase, usuarioId, file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Elegí una imagen.");
  if (file.size > MAX_FOTO) throw new Error("La foto supera los 10 MB.");
  const { path, error } = await subirImagen(supabase, "adjuntos", `perfiles/${usuarioId}/${Date.now()}`, file);
  if (error) throw error;
  const { data: anterior, error: e } = await supabase.rpc("actualizar_mi_foto", { p_path: path });
  if (e) {
    borrarArchivos([path], "adjuntos").catch(() => {});
    throw e;
  }
  if (anterior) borrarArchivos([anterior], "adjuntos").catch(() => {});
  return path;
}

/** Saca la foto de perfil (vuelven las iniciales). */
export async function quitarFotoPerfil(supabase) {
  const { data: anterior, error } = await supabase.rpc("actualizar_mi_foto", { p_path: null });
  if (error) throw error;
  if (anterior) borrarArchivos([anterior], "adjuntos").catch(() => {});
}
