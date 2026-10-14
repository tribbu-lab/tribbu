import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendario } from "../../features/calendario";
import { SubTabs, SECCION_AGENDA } from "../../components/SubTabs";

// Agenda = Calendario + Cumpleaños (pestañas internas).
export default function CalendarioScreen() {
  const { openFecha } = useLocalSearchParams();
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <SubTabs items={SECCION_AGENDA} activo="calendario" />
      <Calendario
        openFecha={openFecha || null}
        onClearOpenFecha={() => router.setParams({ openFecha: "" })}
      />
    </View>
  );
}
