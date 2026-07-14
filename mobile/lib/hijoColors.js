// Shim de storage SÍNCRONO sobre AsyncStorage para los colores por hijo.
//
// `@shared/helpers` expone getHijoColor/setHijoColor con firma SÍNCRONA (la web
// usa localStorage). AsyncStorage es asíncrono, así que mantenemos una caché en
// memoria hidratada al arranque y escribimos en AsyncStorage en segundo plano.
// Las claves son `hcolor_<userId>_<hijoId>` (mismo formato que la web).

import AsyncStorage from "@react-native-async-storage/async-storage";

const cache = new Map();

/** Lee todas las claves hcolor_* de AsyncStorage a la caché. Llamar al arranque. */
export async function hydrateHijoColors() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const hcolorKeys = keys.filter((k) => k.startsWith("hcolor_"));
    if (!hcolorKeys.length) return;
    const pairs = await AsyncStorage.multiGet(hcolorKeys);
    for (const [k, v] of pairs) {
      if (v != null) cache.set(k, v);
    }
  } catch {
    /* noop — sin colores personalizados es un fallback aceptable */
  }
}

// Backend con la forma que espera @shared/storage (getItem/setItem/removeItem).
export const asyncStorageColorBackend = {
  getItem: (key) => (cache.has(key) ? cache.get(key) : null),
  setItem: (key, value) => {
    cache.set(key, value);
    AsyncStorage.setItem(key, value).catch(() => {});
  },
  removeItem: (key) => {
    cache.delete(key);
    AsyncStorage.removeItem(key).catch(() => {});
  },
};
