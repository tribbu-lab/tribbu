import { useLocalSearchParams } from "expo-router";
import { Perdidos } from "../../features/perdidos";

// openObjeto llega del toque en una push "perdido" (push/useNotificationRouting.js):
// la pantalla va a ese objeto y lo resalta. `t` = nonce para re-disparar.
export default function PerdidosScreen() {
  const { openObjeto, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return <Perdidos openObjeto={str(openObjeto)} nonce={str(t)} />;
}
