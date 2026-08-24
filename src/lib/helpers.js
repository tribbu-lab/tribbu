// Helpers puros — sin efectos secundarios, sin imports de React ni Supabase
// Antes: definidos sueltos en App.jsx líneas 130–155
// Extraerlos acá permite testearlos de forma aislada
//
// Compartido entre web (Vite) y mobile (Expo). El único acoplamiento a
// plataforma es el almacenamiento de colores por hijo, que se delega a un
// backend inyectable (ver ./storage.js).

import { getStorageBackend } from "./storage";

/**
 * uuid v4 liviano, sin dependencias. No es un token de seguridad — se usa
 * para claves de agrupación (ej. `grupo_id` de comunicaciones multi-curso).
 * `crypto.randomUUID()` existe en navegadores modernos pero no está
 * garantizado en Hermes/React Native, así que usamos esto en las dos
 * plataformas para no divergir.
 */
export const uuidLite = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

/** "$1.234" */
export const fmtM = (m) => `$${Math.abs(m).toLocaleString("es-AR")}`;

/** "12 de marzo" */
export const fmtF = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" });

/** Igual que fmtF — alias usado en algunas secciones */
export const fmtDM = fmtF;

/** Días que faltan hasta una fecha (negativo = ya pasó) */
export const dHasta = (s) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(s + "T00:00:00");
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / 86_400_000);
};

/** "María García" — une nombre + apellido limpiamente */
export const fmtNombre = (a) =>
  a ? `${a.nombre || ""} ${a.apellido || ""}`.trim() : "";

/** Elimina < y > para prevenir inyección HTML básica */
export const sanitize = (s) =>
  typeof s === "string" ? s.replace(/[<>]/g, "").trim() : s;

/**
 * Sanitiza URLs — previene javascript: y data: URIs maliciosos.
 * Solo permite http, https, tel, mailto.
 */
export const safeUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (/^(https?:\/\/|tel:|mailto:)/i.test(u)) return u;
  if (/^[a-zA-Z0-9]/.test(u) && !u.includes("javascript:")) return "https://" + u;
  return null;
};

/** Lee el color personalizado de un hijo desde el storage de la plataforma */
export const getHijoColor = (userId, hijoId) => {
  const backend = getStorageBackend();
  if (!backend) return null;
  try {
    return backend.getItem(`hcolor_${userId}_${hijoId}`) || null;
  } catch {
    return null;
  }
};

/** Guarda el color personalizado de un hijo en el storage de la plataforma */
export const setHijoColor = (userId, hijoId, color) => {
  const backend = getStorageBackend();
  if (!backend) return;
  try {
    backend.setItem(`hcolor_${userId}_${hijoId}`, color);
  } catch { /* noop */ }
};
