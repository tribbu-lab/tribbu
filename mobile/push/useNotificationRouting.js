// Deep-link de notificaciones → pantalla, equivalente al TAB_MAP de la web.
// Cubre foreground, background y cold start (app cerrada).

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

// type de la notificación → ruta de tab (mismo mapeo que la web)
export const TAB_MAP = {
  recordatorio: "/(tabs)/recordatorios",
  evento: "/(tabs)/calendario",
  colecta: "/(tabs)/finanzas",
  alerta: "/(tabs)/muro",
  festejo: "/(tabs)/cumples",
  encuesta: "/(tabs)/encuestas",
};

// Además del tab, arma los params de deep-link específicos por tipo (mismo
// patrón que usa el Muro: openFecha para eventos) para no dejar al usuario
// en la pantalla "en blanco" del tab.
const routeForData = (data) => {
  const type = data?.type;
  const route = type ? TAB_MAP[type] : null;
  if (!route) return null;
  const params = type === "evento" && data?.fecha ? { openFecha: data.fecha } : {};
  return { pathname: route, params };
};

/** Engancha los listeners de respuesta a notificaciones y navega al tab destino. */
export function useNotificationRouting(ready) {
  const router = useRouter();
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (!ready) return undefined;

    // Cold start: la app se abrió tocando una notificación.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync().then((response) => {
        const target = routeForData(response?.notification?.request?.content?.data);
        if (target) router.push(target);
      });
    }

    // Foreground/background: toque de notificación con la app viva.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const target = routeForData(response?.notification?.request?.content?.data);
      if (target) router.push(target);
    });

    return () => sub.remove();
  }, [ready, router]);
}
