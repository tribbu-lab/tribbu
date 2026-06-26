import { useLocalSearchParams, useRouter } from "expo-router";
import { Finanzas } from "../../features/finanzas";

export default function FinanzasScreen() {
  const { openColecta } = useLocalSearchParams();
  const router = useRouter();
  return (
    <Finanzas
      openColectaId={openColecta || null}
      onClearOpen={() => router.setParams({ openColecta: "" })}
    />
  );
}
