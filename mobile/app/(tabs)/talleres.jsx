import { useLocalSearchParams } from "expo-router";
import { Talleres } from "../../features/talleres";
import { ConVolverCurso } from "../../components/VolverCurso";

// openTaller llega del toque en una push "taller" o de la tarjeta del Muro: la
// pantalla va a ese taller y lo resalta. `t` = nonce para re-disparar.
export default function TalleresScreen() {
  const { openTaller, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return (
    <ConVolverCurso>
      <Talleres openTaller={str(openTaller)} nonce={str(t)} />
    </ConVolverCurso>
  );
}
