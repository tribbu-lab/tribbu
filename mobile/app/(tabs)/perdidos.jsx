import { useLocalSearchParams } from "expo-router";
import { Perdidos } from "../../features/perdidos";
import { ConVolverCurso } from "../../components/VolverCurso";

// openObjeto llega del toque en una push "perdido" (push/useNotificationRouting.js):
// la pantalla va a ese objeto y lo resalta. `tab` (perdido|encontrado) abre esa
// pestaña (el "Ver" de encontrados del Inicio). `t` = nonce para re-disparar.
export default function PerdidosScreen() {
  const { openObjeto, tab, t } = useLocalSearchParams();
  const str = (v) => (typeof v === "string" && v ? v : null);
  return (
    <ConVolverCurso>
      <Perdidos openObjeto={str(openObjeto)} abrirTab={str(tab)} nonce={str(t)} />
    </ConVolverCurso>
  );
}
