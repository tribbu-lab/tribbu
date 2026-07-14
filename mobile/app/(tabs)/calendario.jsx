import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendario } from "../../features/calendario";

export default function CalendarioScreen() {
  const { openFecha } = useLocalSearchParams();
  const router = useRouter();
  return (
    <Calendario
      openFecha={openFecha || null}
      onClearOpenFecha={() => router.setParams({ openFecha: "" })}
    />
  );
}
