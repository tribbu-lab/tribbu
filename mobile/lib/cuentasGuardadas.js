// Cuentas guardadas en este celular (specs/perfil-multicuenta.md). Van en
// AsyncStorage, donde Supabase ya guarda la sesión abierta. Solo tokens: la
// contraseña nunca se guarda.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { guardarEnLista, quitarDeLista } from "@shared/cuentas";

const CLAVE = "tribbu_cuentas_guardadas";

export async function leerCuentas() {
  try {
    const crudo = await AsyncStorage.getItem(CLAVE);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

// Las escrituras van en fila: el refresco de token y la carga del usuario
// pueden guardar a la vez, y una lectura vieja pisaría a la otra.
let cola = Promise.resolve();
function modificar(cambio) {
  cola = cola.then(async () => {
    const nueva = cambio(await leerCuentas());
    await AsyncStorage.setItem(CLAVE, JSON.stringify(nueva));
    return nueva;
  }).catch(() => leerCuentas());
  return cola;
}

export const guardarCuenta = (cuenta) => modificar((lista) => guardarEnLista(lista, cuenta));
export const quitarCuenta = (authId) => modificar((lista) => quitarDeLista(lista, authId));
