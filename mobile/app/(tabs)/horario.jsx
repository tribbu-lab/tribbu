import { View } from "react-native";
import { Calendario } from "../../features/calendario";
import { SubTabs, SECCION_AGENDA } from "../../components/SubTabs";

// Agenda → Horario: el horario de clases como pestaña propia (antes era una
// vista dentro del Calendario).
export default function HorarioScreen() {
  return (
    <View style={{ flex: 1 }}>
      <SubTabs items={SECCION_AGENDA} activo="horario" />
      <Calendario soloHorario />
    </View>
  );
}
