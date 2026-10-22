// Globitos de no leídos del panel del colegio (Mensajes de familias, del
// personal y Ayuda y soporte). Se recalcula con cada mensaje que llega por
// Realtime (el canal lo abre useMensajesNoLeidos en App), al volver a la
// pestaña, cada minuto y cuando cambia `clave` (la pantalla del panel):
// leer un chat no dispara ningún evento de `mensajes`.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { noLeidosPanel } from "../lib/mensajes";
import { EVENTO_MENSAJE, EVENTO_RESYNC } from "./useMensajesNoLeidos";

const CERO = { familias: 0, personal: 0, soporte: 0 };

export function useNoLeidosPanel(activo, clave) {
  const [n, setN] = useState(CERO);
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    if (!activo) return;
    const [b, c] = await Promise.all([supabase.rpc("bandeja_colegio"), supabase.rpc("mis_conversaciones")]);
    if (!b.error && !c.error) setN(noLeidosPanel(b.data, c.data));
  }, [activo]);

  useEffect(() => {
    if (!activo) return undefined;
    let vigente = true;
    Promise.resolve().then(() => { if (vigente) cargar(); });
    return () => { vigente = false; };
  }, [activo, cargar, clave]);

  useEffect(() => {
    if (!activo) return undefined;
    const pronto = () => { clearTimeout(timer.current); timer.current = setTimeout(cargar, 800); };
    window.addEventListener(EVENTO_MENSAJE, pronto);
    window.addEventListener(EVENTO_RESYNC, cargar);
    const poll = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(timer.current);
      clearInterval(poll);
      window.removeEventListener(EVENTO_MENSAJE, pronto);
      window.removeEventListener(EVENTO_RESYNC, cargar);
    };
  }, [activo, cargar]);

  return activo ? n : CERO;
}
