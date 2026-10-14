import { useLocalSearchParams, useRouter } from "expo-router";
import { Finanzas } from "../../features/finanzas";
import { ConVolverCurso } from "../../components/VolverCurso";

export default function FinanzasScreen() {
  const { openColecta } = useLocalSearchParams();
  const router = useRouter();
  return (
    <ConVolverCurso>
      <Finanzas
        openColectaId={openColecta || null}
        onClearOpen={() => router.setParams({ openColecta: "" })}
      />
    </ConVolverCurso>
  );
}
