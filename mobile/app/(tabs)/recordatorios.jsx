import { useLocalSearchParams } from "expo-router";
import { Recordatorios } from "../../features/recordatorios";

// openAviso / openGrupo llegan del toque en una notificación
// (push/useNotificationRouting.js): la pantalla va a ese aviso y lo resalta.
export default function RecordatoriosScreen() {
  const { openAviso, openGrupo, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return <Recordatorios openAviso={str(openAviso)} openGrupo={str(openGrupo)} nonce={str(t)} />;
}
