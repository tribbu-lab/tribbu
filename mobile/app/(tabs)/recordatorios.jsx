import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Recordatorios } from "../../features/recordatorios";
import { ComunicacionesTabs } from "../../components/SubTabs";

// openAviso / openGrupo llegan del toque en una notificación
// (push/useNotificationRouting.js): la pantalla va a ese aviso y lo resalta.
// Comunicaciones = Avisos + Mensajes (pestañas internas).
export default function RecordatoriosScreen() {
  const { openAviso, openGrupo, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return (
    <View style={{ flex: 1 }}>
      <ComunicacionesTabs activo="recordatorios" />
      <Recordatorios openAviso={str(openAviso)} openGrupo={str(openGrupo)} nonce={str(t)} />
    </View>
  );
}
