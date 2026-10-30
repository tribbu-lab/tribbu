// Globito de Fotos escolares en Curso (familias): sesiones publicadas con
// fotos de sus hijos y pedidos que el colegio marcó pagados o entregados,
// desde la última vez que se abrió la pantalla (@shared/fotosEscolares;
// espejo de src/hooks/useFotosNovedades.js). Mismo mecanismo que
// useSalidasNovedades: AsyncStorage, arranca desde ahora la primera vez,
// recarga al volver a primer plano y cada 2 minutos. Lo levanta
// app/(tabs)/_layout y lo comparte por contexto.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { CLAVE_FOTOS_VISTAS, contarNovedadesFotos } from "@shared/fotosEscolares";

async function leerDesde(userId) {
  const k = CLAVE_FOTOS_VISTAS(userId);
  let v = await AsyncStorage.getItem(k);
  if (!v) { v = new Date().toISOString(); await AsyncStorage.setItem(k, v); }
  return v;
}

export function useFotosNovedades({ userId, cursoIds, hijoIds, activo = true }) {
  const [n, setN] = useState(0);
  const clave = `${(cursoIds || []).join(",")}|${(hijoIds || []).join(",")}`;

  const cargar = useCallback(async () => {
    if (!activo || !userId) return;
    const [cursos, hijos] = clave.split("|").map((x) => (x ? x.split(",") : []));
    try {
      setN(await contarNovedadesFotos(supabase, { cursoIds: cursos, hijoIds: hijos, desde: await leerDesde(userId) }));
    } catch {
      // sin globito
    }
  }, [activo, userId, clave]);

  // Al abrir Fotos escolares: todo visto.
  const marcarVistas = useCallback(async () => {
    if (!userId) return;
    setN(0);
    await AsyncStorage.setItem(CLAVE_FOTOS_VISTAS(userId), new Date().toISOString());
  }, [userId]);

  useEffect(() => {
    if (!activo || !userId) return undefined;
    Promise.resolve().then(cargar);
    const poll = setInterval(cargar, 120_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") cargar(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [activo, userId, cargar]);

  return { n: activo ? n : 0, marcarVistas };
}

const FotosCtx = createContext({ n: 0, marcarVistas: () => {} });
export const FotosNovedadesProvider = FotosCtx.Provider;
export const useFotosCtx = () => useContext(FotosCtx);
