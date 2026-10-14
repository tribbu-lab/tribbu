import { AlumnosDocente } from "../../features/docente";
import { ConVolverCurso } from "../../components/VolverCurso";

// Alumnos de la docente (Más → Alumnos). Ver features/docente.
export default function AlumnosScreen() {
  return (
    <ConVolverCurso>
      <AlumnosDocente />
    </ConVolverCurso>
  );
}
