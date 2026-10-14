import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Cumpleanios } from "../../features/cumples";
import { SubTabs, SECCION_AGENDA } from "../../components/SubTabs";

// Agenda = Calendario + Cumpleaños (pestañas internas).
export default function CumplesScreen() {
  const { openFestejo } = useLocalSearchParams();
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <SubTabs items={SECCION_AGENDA} activo="cumples" />
      <Cumpleanios
        openFestejoId={openFestejo || null}
        onClearOpenFestejo={() => router.setParams({ openFestejo: "" })}
      />
    </View>
  );
}
