// Foto de perfil (supabase/perfil-foto.sql): se sube al bucket privado
// `adjuntos` en perfiles/<usuario_id>/<ts>.jpg (+ miniatura) y se guarda con
// la RPC actualizar_mi_foto, que devuelve la anterior para borrarla.
import { supabase } from "./supabase";
import { pickImages, uploadImage } from "./media";
import { borrarArchivos } from "./storageUrl";

/** Elige una foto de la galería y la pone de perfil. Devuelve el path nuevo, o null si canceló. */
export async function elegirFotoPerfil(usuarioId) {
  const [asset] = await pickImages();
  if (!asset) return null;
  const { url } = await uploadImage(asset, { bucket: "adjuntos", path: `perfiles/${usuarioId}/${Date.now()}` });
  const { data: anterior, error } = await supabase.rpc("actualizar_mi_foto", { p_path: url });
  if (error) {
    borrarArchivos([url], "adjuntos").catch(() => {});
    throw error;
  }
  if (anterior) borrarArchivos([anterior], "adjuntos").catch(() => {});
  return url;
}

/** Saca la foto de perfil (vuelven las iniciales). */
export async function quitarFotoPerfil() {
  const { data: anterior, error } = await supabase.rpc("actualizar_mi_foto", { p_path: null });
  if (error) throw error;
  if (anterior) borrarArchivos([anterior], "adjuntos").catch(() => {});
}
