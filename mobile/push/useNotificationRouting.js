// Deep-link de notificaciones → pantalla, equivalente al TAB_MAP de la web.
// Cubre foreground, background y cold start (app cerrada).

import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useSession } from "../context/Session";
import { leerCuentas } from "../lib/cuentasGuardadas";

// type de la notificación → ruta de tab (mismo mapeo que la web)
export const TAB_MAP = {
  recordatorio: "/(tabs)/recordatorios",
  evento: "/(tabs)/calendario",
  colecta: "/(tabs)/finanzas",
  colecta_pago: "/(tabs)/finanzas",
  alerta: "/(tabs)/muro",
  festejo: "/(tabs)/cumples",
  encuesta: "/(tabs)/encuestas",
  autorizacion: "/(tabs)/autorizaciones",
  fotos: "/(tabs)/fotos",
  taller: "/(tabs)/talleres",
  perdido: "/(tabs)/perdidos",
  marketplace: "/(tabs)/comunidad",
  resumen: "/(tabs)/muro", // resumen semanal (avisos-automaticos)
  mensaje: "/(tabs)/mensajes",
};

// Además del tab, arma los params de deep-link específicos por tipo (mismo
// patrón que usa el Muro: openFecha para eventos) para no dejar al usuario
// en la pantalla "en blanco" del tab.
const routeForData = (data) => {
  const type = data?.type;
  const route = type ? TAB_MAP[type] : null;
  if (!route) return null;
  const params =
    type === "evento" && data?.fecha ? { openFecha: data.fecha }
    : type === "marketplace" ? { sub: "marketplace" }
    : type === "colecta_pago" && data?.colectaId ? { openColecta: String(data.colectaId) }
    : type === "recordatorio" && data?.id ? { openAviso: String(data.id) }
    : type === "recordatorio" && data?.grupo ? { openGrupo: String(data.grupo) }
    : type === "taller" && data?.tallerId ? { openTaller: String(data.tallerId), t: String(Date.now()) }
    : type === "perdido" && data?.objetoId ? { openObjeto: String(data.objetoId), t: String(Date.now()) }
    : type === "mensaje" && data?.conversacionId ? { c: String(data.conversacionId), t: String(Date.now()) }
    : {};
  return { pathname: route, params };
};

// Panel del colegio (administrador, Secretaría, super): no tiene las tabs de
// la familia, así que el push abre la sección del panel. Un mensaje lleva la
// conversación (`c`) y el panel decide por su tipo si es del personal, de
// familias o soporte.
const PANEL_SEC = {
  soporte: "soporte",
  denuncia: "denuncias",
  autorizacion: "autorizaciones",
  taller: "talleres",
  evento: "eventos",
  recordatorio: "comunicaciones",
  alerta: "alertas",
};
const panelRouteForData = (data) => {
  const type = data?.type;
  const t = String(Date.now());
  if ((type === "mensaje" || type === "soporte") && data?.conversacionId) {
    return { pathname: "/(super)", params: { c: String(data.conversacionId), sec: PANEL_SEC[type] || "", t } };
  }
  const sec = PANEL_SEC[type];
  return sec ? { pathname: "/(super)", params: { sec, t } } : null;
};

/** Engancha los listeners de respuesta a notificaciones y navega al tab destino. */
export function useNotificationRouting(ready, { panel = false } = {}) {
  const router = useRouter();
  const destino = panel ? panelRouteForData : routeForData;
  const handledColdStart = useRef(false);
  const { usuario, cuentas, cambiarCuenta } = useSession();
  // Los listeners de abajo no se vuelven a enganchar por esto: leen lo último.
  const sesionRef = useRef({ usuarioId: null, cuentas: [], cambiarCuenta });
  useEffect(() => {
    sesionRef.current = { usuarioId: usuario?.id ?? null, cuentas, cambiarCuenta };
  }, [usuario?.id, cuentas, cambiarCuenta]);
  // Destino de un aviso de otra cuenta: se navega cuando ya se pasó a ella.
  const pendiente = useRef(null);

  const abrir = useCallback((data) => {
    const target = destino(data);
    const usuarioId = sesionRef.current.usuarioId ?? usuario?.id;
    const deOtraCuenta = !panel && data?.usuario_id && data.usuario_id !== usuarioId;
    if (!deOtraCuenta) {
      if (target && panel) router.navigate(target);
      else if (target) router.push(target);
      return;
    }
    (async () => {
      // La lista puede no estar cargada todavía si la app se abrió con este toque.
      const guardadas = sesionRef.current.cuentas.length ? sesionRef.current.cuentas : await leerCuentas();
      const cuenta = guardadas.find((c) => c.usuario_id === data.usuario_id);
      if (!cuenta) return;
      pendiente.current = target;
      const res = await sesionRef.current.cambiarCuenta(cuenta.auth_id);
      if (res?.error) {
        pendiente.current = null;
        Alert.alert("No se pudo abrir la otra cuenta", res.vencida ? "Su sesión venció: volvé a entrar desde Mi cuenta." : res.error);
      }
    })();
  }, [destino, router, panel, usuario?.id]);

  useEffect(() => {
    const target = pendiente.current;
    if (!target || !usuario?.id) return;
    pendiente.current = null;
    router.push(target);
  }, [usuario?.id, router]);

  useEffect(() => {
    if (!ready) return undefined;

    // Cold start: la app se abrió tocando una notificación.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      const response = Notifications.getLastNotificationResponse();
      // La "última respuesta" queda guardada hasta que se borra: sin esto, si
      // este layout se volvía a montar, re-navegaba a la misma notificación.
      if (response) Notifications.clearLastNotificationResponse();
      abrir(response?.notification?.request?.content?.data);
    }

    // Foreground/background: toque de notificación con la app viva.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      Notifications.clearLastNotificationResponse();
      abrir(response?.notification?.request?.content?.data);
    });

    return () => sub.remove();
  }, [ready, abrir]);
}
