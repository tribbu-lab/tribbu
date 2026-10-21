import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Mensajes } from "../../features/mensajes";
import { ComunicacionesTabs } from "../../components/SubTabs";

// Params: c = conversación a abrir (push "mensaje"), soporte=1 ("Ayuda y
// soporte" en Mi cuenta), usuario = apoderado al que escribirle (Alumnos),
// hijo + maestro = hilo familia ↔ docente (Alumnos de la docente),
// articulo = JSON { id, usuarioId?, borrador } (chat del Marketplace).
// `t` = nonce para re-disparar el mismo pedido.
// Comunicaciones = Avisos + Mensajes (pestañas internas).
export default function MensajesScreen() {
  const { c, soporte, usuario, hijo, maestro, alumnoNombre, docente, secretaria, articulo, t } = useLocalSearchParams();
  // docente / secretaria: JSON desde Contacto (chat con una maestra / con Secretaría).
  const json = (v) => { try { return typeof v === "string" && v ? JSON.parse(v) : null; } catch { return null; } };
  const str = (v) => (typeof v === "string" && v ? v : null);
  const alumno = str(hijo) && str(maestro) ? { hijo_id: str(hijo), maestro_id: str(maestro), nombre: str(alumnoNombre) || "" } : null;
  return (
    <View style={{ flex: 1 }}>
      <ComunicacionesTabs activo="mensajes" />
      <Mensajes abrirConv={str(c)} abrirSoporte={soporte === "1"} abrirUsuario={str(usuario)} abrirAlumno={alumno} abrirDocente={json(docente)} abrirSecretaria={json(secretaria)} abrirArticulo={json(articulo)} nonce={str(t)} />
    </View>
  );
}
