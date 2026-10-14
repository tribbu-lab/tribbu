import { useLocalSearchParams } from "expo-router";
import { Comunidad } from "../../features/comunidad";
import { ConVolverCurso } from "../../components/VolverCurso";

export default function ComunidadScreen() {
  const { sub } = useLocalSearchParams();
  return (
    <ConVolverCurso>
      <Comunidad sub={typeof sub === "string" ? sub : undefined} />
    </ConVolverCurso>
  );
}
