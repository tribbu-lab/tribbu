// Preferencia de desbloqueo con huella/Face ID — ver
// specs/desbloqueo-con-huella-digital.md. Es solo un booleano de UI (no un
// secreto), guardado localmente por usuario; no viaja al servidor.

import AsyncStorage from "@react-native-async-storage/async-storage";

const key = (userId) => `biometric_enabled_${userId}`;

/** Lee la preferencia del usuario. false si no hay nada guardado o falla. */
export async function getBiometricPref(userId) {
  if (!userId) return false;
  try {
    return (await AsyncStorage.getItem(key(userId))) === "1";
  } catch {
    return false;
  }
}

/** Guarda la preferencia del usuario. */
export async function setBiometricPref(userId, enabled) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(key(userId), enabled ? "1" : "0");
  } catch {
    /* noop — si falla, el toggle simplemente no persiste, no es crítico */
  }
}
