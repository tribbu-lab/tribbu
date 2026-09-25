import { useLocalSearchParams } from "expo-router";
import { Recordatorios } from "../../features/recordatorios";

// openAviso / openGrupo llegan del toque en una notificación
// (push/useNotificationRouting.js): la pantalla va a ese aviso y lo resalta.
export default function RecordatoriosScreen() {
  const { openAviso, openGrupo } = useLocalSearchParams();
  return <Recordatorios openAviso={typeof openAviso === "string" ? openAviso : null} openGrupo={typeof openGrupo === "string" ? openGrupo : null} />;
}
