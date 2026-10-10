// src/hooks/useMensajesNoLeidos.js
//
// Badge de Mensajes + la ÚNICA suscripción Realtime de la sesión a la tabla
// `mensajes` (specs/mensajes.md). La RLS decide qué filas recibe cada usuario.
// Cada INSERT/UPDATE se reenvía como evento de ventana `tribbu:mensaje`
// ({ evento, row }) para que la pantalla de Mensajes (y las bandejas de
// Super Admin) actualicen sin abrir otro canal.
//
// Realtime no reenvía lo que pasó mientras estaba desconectado: al volver la
// pestaña a primer plano se recalcula el total y se emite `tribbu:mensajes-resync`
// para que el chat abierto pida lo que falte.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";

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

  // Varios mensajes seguidos → un solo recálculo.
  const recargarPronto = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(recargar, 600);
  }, [recargar]);

  useEffect(() => {
    if (!userId) return undefined;
    let vigente = true;
    Promise.resolve().then(() => { if (vigente) recargar(); });
    const canal = supabase
      .channel(`mensajes-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes" }, (p) => {
        window.dispatchEvent(new CustomEvent(EVENTO_MENSAJE, { detail: { evento: p.eventType, row: p.new } }));
        recargarPronto();
      })
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      recargar();
      window.dispatchEvent(new CustomEvent(EVENTO_RESYNC));
    };
    const poll = setInterval(recargar, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      vigente = false;
      clearInterval(poll);
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(canal);
    };
  }, [userId, recargar, recargarPronto]);

  return { noLeidos, recargar };
}
