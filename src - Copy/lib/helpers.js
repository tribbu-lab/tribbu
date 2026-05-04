// Funciones utilitarias puras — sin dependencias de React ni Supabase
// Antes dispersas al inicio de App.jsx

/** Formatea un monto en pesos AR: 1500 → "$1.500" */
export const fmtM = (m) =>
  `$${Math.abs(m).toLocaleString("es-AR")}`;

/** Formatea una fecha "YYYY-MM-DD" → "3 de junio" */
export const fmtF = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });

/** Igual que fmtF — alias usado en algunos componentes */
export const fmtDM = fmtF;

/** Días hasta una fecha "YYYY-MM-DD" (puede ser negativo si ya pasó) */
export const dHasta = (s) => {
  const h = new Date();
  h.setHours(0, 0, 0, 0);
  const f = new Date(s + "T00:00:00");
  f.setHours(0, 0, 0, 0);
  return Math.ceil((f - h) / 86400000);
};

/** "{ nombre: 'Ana', apellido: 'García' }" → "Ana García" */
export const fmtNombre = (a) =>
  a ? `${a.nombre || ""} ${a.apellido || ""}`.trim() : "";

/** Elimina < y > para prevenir inyección HTML básica */
export const sanitize = (s) =>
  typeof s === "string" ? s.replace(/[<>]/g, "").trim() : s;

/**
 * Valida y sanea una URL.
 * Solo permite http, https, tel y mailto.
 * Previene javascript: y data: URIs.
 */
export const safeUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (/^(https?:\/\/|tel:|mailto:)/i.test(u)) return u;
  if (/^[a-zA-Z0-9]/.test(u) && !u.includes("javascript:"))
    return "https://" + u;
  return null;
};

/** Color para un hijo según userId + hijoId (persiste en localStorage) */
export const getHijoColor = (userId, hijoId) => {
  try {
    return localStorage.getItem(`hcolor_${userId}_${hijoId}`) || null;
  } catch {
    return null;
  }
};

export const setHijoColor = (userId, hijoId, color) => {
  try {
    localStorage.setItem(`hcolor_${userId}_${hijoId}`, color);
  } catch {}
};
