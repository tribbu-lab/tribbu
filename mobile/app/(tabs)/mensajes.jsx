import { useLocalSearchParams } from "expo-router";
import { Mensajes } from "../../features/mensajes";

// Params: c = conversación a abrir (push "mensaje"), soporte=1 ("Ayuda y
// soporte" en Más), usuario = apoderado al que escribirle (Alumnos).
// `t` = nonce para re-disparar el mismo pedido.
export default function MensajesScreen() {
  const { c, soporte, usuario, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return <Mensajes abrirConv={str(c)} abrirSoporte={soporte === "1"} abrirUsuario={str(usuario)} nonce={str(t)} />;
}
