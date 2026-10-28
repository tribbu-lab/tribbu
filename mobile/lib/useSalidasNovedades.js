// Globito de "Salidas" (Cambios en la salida) en Comunicaciones, para familias
// y docentes: novedades desde la última vez que se abrió la pestaña
// (@shared/cambiosSalida; espejo de src/hooks/useSalidasNovedades.js). La
// fecha se guarda en AsyncStorage; la primera vez arranca desde ahora (no
// cuenta nada viejo). Recarga al volver la app a primer plano y cada 2
// minutos. Lo levanta app/(tabs)/_layout y lo comparte por contexto.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { fmtLocalDate } from "@shared/helpers";
import { CLAVE_SALIDAS_VISTAS, contarNovedadesSalidas } from "@shared/cambiosSalida";

async function leerDesde(userId) {
  const k = CLAVE_SALIDAS_VISTAS(userId);
  let v = await AsyncStorage.getItem(k);
  if (!v) { v = new Date().toISOString(); await AsyncStorage.setItem(k, v); }
  return v;
}

export function useSalidasNovedades({ userId, cursoIds, hijoIds, esDocente }) {
  const [n, setN] = useState(0);
  const clave = `${(cursoIds || []).join(",")}|${(hijoIds || []).join(",")}`;

  const cargar = useCallback(async () => {
    if (!userId) return;
    const [cursos, hijos] = clave.split("|").map((x) => (x ? x.split(",") : []));
    try {
      setN(await contarNovedadesSalidas(supabase, { cursoIds: cursos, hijoIds: hijos, esDocente, desde: await leerDesde(userId), hoy: fmtLocalDate() }));
    } catch {
      // sin globito
    }
  }, [userId, clave, esDocente]);

  // Al abrir la pestaña: todo visto.
  const marcarVistas = useCallback(async () => {
    if (!userId) return;
    setN(0);
    await AsyncStorage.setItem(CLAVE_SALIDAS_VISTAS(userId), new Date().toISOString());
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    Promise.resolve().then(cargar);
    const poll = setInterval(cargar, 120_000);
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") cargar(); });
    return () => { clearInterval(poll); sub.remove(); };
  }, [userId, cargar]);

  return { n, marcarVistas };
}

const SalidasCtx = createContext({ n: 0, marcarVistas: () => {} });
export const SalidasProvider = SalidasCtx.Provider;
export const useSalidasCtx = () => useContext(SalidasCtx);
