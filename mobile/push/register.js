// Registro de push con expo-notifications (reemplaza OneSignal de la web).
// - Pide permisos en iOS y Android
// - Configura el canal de notificaciones de Android
// - Obtiene el Expo push token y lo persiste por dispositivo en `push_tokens`

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

// Mostrar la notificación aunque la app esté en foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const ANDROID_CHANNEL_ID = "default";

/** Pide permisos, configura el canal Android y devuelve el Expo push token (o null). */
export async function registerForPush() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Avisos del curso",
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: "#3B82F6",
    });
  }

  if (!Device.isDevice) {
    // Los emuladores/simuladores no entregan push real; no falla, solo no hay token.
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId;

  // Sin projectId de EAS no se puede obtener el Expo push token (p. ej. en Expo
  // Go, o antes de correr `eas init`). Se omite el push sin romper el login ni
  // ensuciar la consola con un error.
  if (!projectId) {
    console.warn(
      "[push] Sin EAS projectId: se omite el registro de push. Corré `eas init` " +
        "y agregá EAS_PROJECT_ID a mobile/.env (o usá un development build) para habilitarlo."
    );
    return null;
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (e) {
    console.warn("[push] getExpoPushTokenAsync falló:", e?.message || e);
    return null;
  }
}

/** Guarda/actualiza el token del dispositivo para el usuario en `push_tokens`. */
export async function savePushToken(usuarioId, token) {
  if (!usuarioId || !token) return;
  const { error } = await supabase.from("push_tokens").upsert(
    {
      usuario_id: usuarioId,
      token,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  );
  if (error) console.error("savePushToken error:", error);
}
