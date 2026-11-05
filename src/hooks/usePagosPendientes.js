// Globito de Curso: pagos al colegio pendientes de esta familia. Se recuenta al
// cambiar de pantalla (`clave`), así baja apenas se toca "Ya pagué" y se vuelve.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { contarPagosPendientes } from "../lib/pagosColegio";

export function usePagosPendientes({ hijoIds, cursoIds, activo, clave }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    contarPagosPendientes(supabase, hijoIds, cursoIds).then((c) => { if (vivo) setN(c); }).catch(() => {});
    return () => { vivo = false; };
  }, [hijoIds, cursoIds, activo, clave]);
  return activo ? n : 0;
}
