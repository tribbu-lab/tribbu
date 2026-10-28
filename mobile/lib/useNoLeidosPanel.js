// Globitos de no leídos del panel del colegio en la app (Mensajes de
// familias, del personal, Cambios en la salida sin ver y Ayuda y soporte).
// Espejo de src/hooks/useNoLeidosPanel.js: se recalcula con cada mensaje que
// llega (el canal lo abre useMensajesNoLeidos en app/(super)), al volver la app
// a primer plano, cada minuto, con recontarPanel() y cuando cambia `clave` (la
// pantalla del panel): leer un chat no dispara ningún evento de `mensajes`.
import { useCallback, useEffect, useRef, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { supabase } from "./supabase";
import { noLeidosPanel } from "@shared/mensajes";
import { contarSalidasSinVer } from "@shared/cambiosSalida";
import { fmtLocalDate } from "@shared/helpers";
import { EVENTO_MENSAJE, EVENTO_RESYNC } from "./useMensajesNoLeidos";

const CERO = { familias: 0, personal: 0, soporte: 0, salidas: 0 };
// Recontar ya (p. ej. al marcar un cambio en la salida como visto).
const EVENTO_RECONTAR_PANEL = "tribbu:panel-recontar";
export const recontarPanel = () => DeviceEventEmitter.emit(EVENTO_RECONTAR_PANEL);

export function useNoLeidosPanel(activo, clave) {
  const [n, setN] = useState(CERO);
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    if (!activo) return;
    const [b, c, salidas] = await Promise.all([
      supabase.rpc("bandeja_colegio"), supabase.rpc("mis_conversaciones"), contarSalidasSinVer(supabase, fmtLocalDate()).catch(() => 0),
    ]);
    if (!b.error && !c.error) setN({ ...noLeidosPanel(b.data, c.data), salidas });
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
    const s1 = DeviceEventEmitter.addListener(EVENTO_MENSAJE, pronto);
    const s2 = DeviceEventEmitter.addListener(EVENTO_RESYNC, cargar);
    const s3 = DeviceEventEmitter.addListener(EVENTO_RECONTAR_PANEL, cargar);
    const poll = setInterval(cargar, 60_000);
    return () => {
      clearTimeout(timer.current);
      clearInterval(poll);
      s1.remove();
      s2.remove();
      s3.remove();
    };
  }, [activo, cargar]);

  return activo ? n : CERO;
}
