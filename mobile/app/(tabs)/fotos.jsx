import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { FotosEscolares } from "../../features/fotos";
import { ConVolverCurso } from "../../components/VolverCurso";
import { useFotosCtx } from "../../lib/useFotosNovedades";

// Curso → Fotos escolares (también abre desde el push "fotos"). Al entrar
// se apaga el globito de novedades de Curso.
export default function FotosScreen() {
  const { marcarVistas } = useFotosCtx();
  useFocusEffect(useCallback(() => { marcarVistas(); }, [marcarVistas]));
  return (
    <ConVolverCurso>
      <FotosEscolares />
    </ConVolverCurso>
  );
}
