// Globito de Fotos escolares en Curso (familias): sesiones publicadas con
// fotos de sus hijos y pedidos que el colegio marcó pagados o entregados,
// desde la última vez que se abrió la pestaña (@shared/fotosEscolares).
// Mismo mecanismo que useSalidasNovedades: la primera vez arranca desde ahora,
// con la pestaña abierta se marca todo como visto, recarga al volver y cada 2 min.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { getStorageBackend } from "../lib/storage";
import { CLAVE_FOTOS_VISTAS, contarNovedadesFotos } from "../lib/fotosEscolares";

const leerDesde = (userId) => {
  const st = getStorageBackend();
  const k = CLAVE_FOTOS_VISTAS(userId);
  let v = st?.getItem(k);
  if (!v) { v = new Date().toISOString(); st?.setItem(k, v); }
  return v;
};

export function useFotosNovedades({ userId, cursoIds, hijoIds, abierta, activo = true }) {
  const [n, setN] = useState(0);

  const cargar = useCallback(async () => {
    if (!activo || !userId) return;
    try {
      setN(await contarNovedadesFotos(supabase, { cursoIds, hijoIds, desde: leerDesde(userId) }));
    } catch {
      // sin globito
    }
  }, [activo, userId, cursoIds, hijoIds]);

  useEffect(() => {
    if (!activo || !userId) return undefined;
    if (abierta) {
      getStorageBackend()?.setItem(CLAVE_FOTOS_VISTAS(userId), new Date().toISOString());
      Promise.resolve().then(() => setN(0));
      return undefined;
    }
    Promise.resolve().then(cargar);
    const poll = setInterval(cargar, 120_000);
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(poll); document.removeEventListener("visibilitychange", alVolver); };
  }, [activo, userId, abierta, cargar]);

  return activo ? n : 0;
}
