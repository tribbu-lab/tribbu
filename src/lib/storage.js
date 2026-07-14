// Backend de almacenamiento clave-valor inyectable.
//
// La web usa `localStorage` (síncrono). El mobile (Expo) inyecta un adaptador
// respaldado por AsyncStorage que mantiene la misma firma SÍNCRONA mediante una
// caché en memoria hidratada al arranque (ver mobile/lib/hijoColors.js). Así
// `getHijoColor`/`setHijoColor` en `helpers.js` no cambian su contrato.

const localStorageBackend = {
  getItem: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  setItem: (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* noop */ }
  },
  removeItem: (key) => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
  },
};

let _backend =
  typeof localStorage !== "undefined" ? localStorageBackend : null;

export const setStorageBackend = (backend) => {
  _backend = backend;
};

export const getStorageBackend = () => _backend;
