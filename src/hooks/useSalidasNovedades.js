// Globito de "Cambios en la salida" en Comunicaciones (familias y docentes):
// novedades desde la última vez que se abrió la pestaña (@shared/cambiosSalida).
// La primera vez no cuenta nada viejo: arranca desde ahora. Con la pestaña
// abierta (`abierta`) se marca todo como visto. Recarga al volver a la
// ventana y cada 2 minutos.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { getStorageBackend } from "../lib/storage";
import { fmtLocalDate } from "../lib/helpers";
import { CLAVE_SALIDAS_VISTAS, contarNovedadesSalidas } from "../lib/cambiosSalida";

const leerDesde = (userId) => {
  const st = getStorageBackend();
  const k = CLAVE_SALIDAS_VISTAS(userId);
  let v = st?.getItem(k);
  if (!v) { v = new Date().toISOString(); st?.setItem(k, v); }
  return v;
};

export function useSalidasNovedades({ userId, cursoIds, hijoIds, esDocente, abierta, activo = true }) {
  const [n, setN] = useState(0);

  const cargar = useCallback(async () => {
    if (!activo || !userId) return;
    try {
      setN(await contarNovedadesSalidas(supabase, { cursoIds, hijoIds, esDocente, desde: leerDesde(userId), hoy: fmtLocalDate() }));
    } catch {
      // sin globito
    }
  }, [activo, userId, cursoIds, hijoIds, esDocente]);

  useEffect(() => {
    if (!activo || !userId) return undefined;
    if (abierta) {
      getStorageBackend()?.setItem(CLAVE_SALIDAS_VISTAS(userId), new Date().toISOString());
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
