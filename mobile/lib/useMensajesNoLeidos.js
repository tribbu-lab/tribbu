// mobile/lib/useMensajesNoLeidos.js — espejo de src/hooks/useMensajesNoLeidos.js.
//
// Badge de Mensajes + la ÚNICA suscripción Realtime de la sesión a la tabla
// `mensajes` (specs/mensajes.md). Cada cambio se reemite por DeviceEventEmitter
// (EVENTO_MENSAJE, { evento, row }) para que el chat abierto y las bandejas
// del panel lo tomen sin abrir otro canal. Al volver la app a primer plano
// (Realtime no reenvía lo perdido) se recalcula y se emite EVENTO_RESYNC.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, DeviceEventEmitter } from "react-native";
import { supabase } from "./supabase";

export const EVENTO_MENSAJE = "tribbu:mensaje";
export const EVENTO_RESYNC = "tribbu:mensajes-resync";

export function useMensajesNoLeidos(userId, { contar = true } = {}) {
  const [noLeidos, setNoLeidos] = useState(0);
  const timer = useRef(null);

  const recargar = useCallback(async () => {
    if (!userId || !contar) return;
    const { data, error } = await supabase.rpc("mensajes_no_leidos_total");
    if (!error) setNoLeidos(data || 0);
  }, [userId, contar]);

  const recargarPronto = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(recargar, 600);
  }, [recargar]);

  useEffect(() => {
    if (!userId) return undefined;
    recargar();
    const canal = supabase
      .channel(`mensajes-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, (p) => {
        DeviceEventEmitter.emit(EVENTO_MENSAJE, { evento: p.eventType, row: p.new });
        recargarPronto();
      })
      .subscribe();
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado !== "active") return;
      recargar();
      DeviceEventEmitter.emit(EVENTO_RESYNC);
    });
    return () => {
      clearTimeout(timer.current);
      sub.remove();
      supabase.removeChannel(canal);
    };
  }, [userId, recargar, recargarPronto]);

  return { noLeidos, recargar };
}

const MensajesCtx = createContext({ noLeidos: 0, recargar: () => {} });
export const MensajesProvider = MensajesCtx.Provider;
export const useMensajesCtx = () => useContext(MensajesCtx);
