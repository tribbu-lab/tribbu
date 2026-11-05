// src/lib/cuentas.js — reglas del perfil multicuenta (specs/perfil-multicuenta.md).
// Puro: la app guarda la lista en AsyncStorage y la web todavía no lo usa.
//
// Una cuenta guardada: { auth_id, usuario_id, email, nombre, etiqueta,
// access_token, refresh_token }. Nunca la contraseña.

/** Agrega la cuenta o actualiza la que ya está (por auth_id), sin cambiar el orden. */
export const guardarEnLista = (lista, cuenta) => {
  const actual = lista || [];
  if (!cuenta?.auth_id) return actual;
  return actual.some((c) => c.auth_id === cuenta.auth_id)
    ? actual.map((c) => (c.auth_id === cuenta.auth_id ? { ...c, ...cuenta } : c))
    : [...actual, cuenta];
};

export const quitarDeLista = (lista, authId) => (lista || []).filter((c) => c.auth_id !== authId);

/** Las cuentas guardadas que no son la que está abierta. */
export const otrasCuentas = (lista, authId) => (lista || []).filter((c) => c.auth_id !== authId);

/** Lo que se muestra debajo del nombre: "Colegio · Ana, Beto". */
export const etiquetaDeCuenta = (colegios, hijos) =>
  [
    [...new Set((colegios || []).filter(Boolean))].join(", "),
    (hijos || []).map((n) => (n || "").split(" ")[0]).filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

/** Roles que pueden estar en el selector: las cuentas del panel del colegio no. */
export const rolAdmiteMulticuenta = (rol) => ["padre", "room", "admin", "docente"].includes(rol);
