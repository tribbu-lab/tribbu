import { useLocalSearchParams } from "expo-router";
import { Autorizaciones } from "../../features/autorizaciones";

// openAutorizacion (+ t, nonce) llega desde Hoy ("Responder autorización"):
// la pantalla va a esa tarjeta y abre el formulario del hijo que falta.
export default function AutorizacionesScreen() {
  const { openAutorizacion, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return <Autorizaciones openAutorizacion={str(openAutorizacion)} nonce={str(t)} />;
}
