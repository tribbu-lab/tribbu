import { FotosEscolares } from "../../features/fotos";
import { ConVolverCurso } from "../../components/VolverCurso";

// Curso → Fotos escolares (también abre desde el push "fotos").
export default function FotosScreen() {
  return (
    <ConVolverCurso>
      <FotosEscolares />
    </ConVolverCurso>
  );
}
