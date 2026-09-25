import { useLocalSearchParams } from "expo-router";
import { Comunidad } from "../../features/comunidad";

export default function ComunidadScreen() {
  const { sub } = useLocalSearchParams();
  return <Comunidad sub={typeof sub === "string" ? sub : undefined} />;
}
