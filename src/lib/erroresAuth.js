// src/lib/erroresAuth.js — mensajes de error de Auth en castellano. Puro,
// compartido por web y mobile (@shared/erroresAuth).

/**
 * El motivo de un error de Auth en castellano, para el toast (antes el panel
 * decía solo "Error al crear la cuenta en Auth" y no se sabía qué pasaba).
 */
export const mensajeErrorAuth = (e) => {
  const m = String(e?.message || e || "");
  if (/already (been )?registered|already exists|email_exists/i.test(m)) return "Ya existe una cuenta con ese mail. Usá otro mail o, si es la misma persona, editala desde la lista.";
  if (/password/i.test(m) && /(least|short|weak|characters)/i.test(m)) return "La contraseña es muy corta o muy simple: probá con una más larga, con letras y números.";
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return "El mail no es válido.";
  if (/sin permisos/i.test(m)) return "No tenés permiso para crear esta cuenta.";
  return m || "Error desconocido";
};
