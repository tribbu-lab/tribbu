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

const CARGO = { colegio_admin: "Administración", nivel_admin: "Secretaría", docente: "Docente" };

/** Lo que se muestra debajo del nombre: "Colegio · Ana, Beto" o "Colegio · Secretaría". */
export const etiquetaDeCuenta = (colegios, hijos, rol) =>
  [
    [...new Set((colegios || []).filter(Boolean))].join(", "),
    CARGO[rol] || (hijos || []).map((n) => (n || "").split(" ")[0]).filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

/** Todas menos las de plataforma (super), que no son de ningún colegio. */
export const rolAdmiteMulticuenta = (rol) => ["padre", "room", "admin", "docente", "colegio_admin", "nivel_admin"].includes(rol);

/** Estas cuentas entran al panel del colegio, no a las pantallas de la familia. */
export const rolVaAlPanel = (rol) => ["colegio_admin", "nivel_admin"].includes(rol);

/**
 * Valida los tokens guardados sin tocar la sesión abierta. `temporal`: un cliente
 * de Supabase que no persiste nada (un setSession con un refresh token inválido
 * en el cliente principal borraría la sesión abierta). { session } o { error, vencida }.
 */
export async function validarCuenta(temporal, cuenta) {
  const { data, error } = await temporal.auth.setSession({ access_token: cuenta.access_token, refresh_token: cuenta.refresh_token });
  if (error || !data?.session) return { error: error?.message || "sin sesión", vencida: true };
  const { data: fila } = await temporal.from("usuarios").select("id,activo").eq("auth_id", data.session.user.id).maybeSingle();
  if (!fila?.activo) return { error: "Esa cuenta ya no está activa." };
  return { session: data.session };
}

/** Entra con mail y contraseña en el cliente temporal. { session, fila } o { error }. */
export async function iniciarCuenta(temporal, email, password, authIdActual) {
  const { data, error } = await temporal.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return { error: /invalid login/i.test(error.message) ? "Correo o contraseña incorrectos" : `No se pudo conectar: ${error.message}` };
  if (data.user.id === authIdActual) return { error: "Ya estás usando esa cuenta." };
  const { data: fila } = await temporal.from("usuarios").select("id,nombre,apellido,email,rol,activo").eq("auth_id", data.user.id).maybeSingle();
  if (!fila?.activo) return { error: "Esa cuenta no está activa. Consultá con el colegio." };
  if (!rolAdmiteMulticuenta(fila.rol)) return { error: "Esa cuenta es de la plataforma: entrá con ella cerrando esta sesión." };
  return { session: data.session, fila };
}
