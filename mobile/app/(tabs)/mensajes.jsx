import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Mensajes } from "../../features/mensajes";
import { ComunicacionesTabs } from "../../components/SubTabs";

// Params: c = conversación a abrir (push "mensaje"), soporte=1 ("Ayuda y
// soporte" en Mi cuenta), usuario = apoderado al que escribirle (Alumnos),
// hijo + maestro = hilo familia ↔ docente (Alumnos de la docente).
// `t` = nonce para re-disparar el mismo pedido.
// Comunicaciones = Avisos + Mensajes (pestañas internas).
export default function MensajesScreen() {
  const { c, soporte, usuario, hijo, maestro, alumnoNombre, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  const alumno = str(hijo) && str(maestro) ? { hijo_id: str(hijo), maestro_id: str(maestro), nombre: str(alumnoNombre) || "" } : null;
  return (
    <View style={{ flex: 1 }}>
      <ComunicacionesTabs activo="mensajes" />
      <Mensajes abrirConv={str(c)} abrirSoporte={soporte === "1"} abrirUsuario={str(usuario)} abrirAlumno={alumno} nonce={str(t)} />
    </View>
  );
}
