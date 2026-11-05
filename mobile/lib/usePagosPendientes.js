// Globito de Curso: pagos al colegio pendientes de esta familia. Mismo
// mecanismo que useFotosNovedades: recuenta al cambiar de hijos/cursos, al
// volver a primer plano y cada 2 minutos. La pantalla de Pagos llama a
// `recargar` después de "Ya pagué"/"Deshacer", así baja apenas se toca.
// No usar usePathname en el layout de tabs para recontar: re-renderiza el
// layout en cada navegación y, con freezeOnBlur, dejaba el hilo de JS en un
// bucle de renders (las pantallas quedaban en "Cargando…").
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { contarPagosPendientes } from "@shared/pagosColegio";

export function usePagosPendientes({ hijoIds, cursoIds, activo }) {
  const [n, setN] = useState(0);

  const recargar = useCallback(async () => {
    if (!activo) return;
    try {
      setN(await contarPagosPendientes(supabase, hijoIds, cursoIds));
    } catch {
      // sin globito
    }
  }, [hijoIds, cursoIds, activo]);

  useEffect(() => {
    if (!activo) return undefined;
    Promise.resolve().then(recargar);
    const poll = setInterval(recargar, 120_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") recargar(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [activo, recargar]);

  return useMemo(() => ({ n: activo ? n : 0, recargar }), [activo, n, recargar]);
}

const PagosCtx = createContext({ n: 0, recargar: () => {} });
export const PagosPendientesProvider = PagosCtx.Provider;
export const usePagosPendientesCtx = () => useContext(PagosCtx);
