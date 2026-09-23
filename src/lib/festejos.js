// src/lib/festejos.js — respuesta a invitaciones de cumpleaños (festejos),
// compartido por web y mobile (@shared/festejos). Puro: sin supabase.
//
// Hermanos: se puede indicar (opcional) la edad de cada uno
// (evento_asistencia.hermanos_edades, smallint[]; null = sin edad).

export const EDAD_MAX_HERMANO = 25;

/** Ajusta la lista de edades (strings del formulario) a `n` hermanos. */
export const ajustarEdades = (edades = [], n) =>
  Array.from({ length: Math.max(0, n) }, (_, i) => (edades[i] ?? "").toString());

/**
 * Valida y convierte para guardar. `edades` = strings del formulario.
 * La edad es opcional: un casillero vacío queda como null (sin edad); solo se
 * rechaza una edad inválida. Sin ninguna edad cargada → null.
 * → { ok: true, edades: (number|null)[] | null } · { ok: false, error }
 */
export const edadesParaGuardar = (hermanos, edades = []) => {
  const n = Number(hermanos) || 0;
  if (!n) return { ok: true, edades: null };
  const nums = ajustarEdades(edades, n).map((e) => (String(e).trim() === "" ? null : Number(e)));
  if (nums.some((e) => e !== null && (!Number.isInteger(e) || e < 0 || e > EDAD_MAX_HERMANO))) {
    return { ok: false, error: `Revisá la edad: tiene que ser un número entre 0 y ${EDAD_MAX_HERMANO}.` };
  }
  return { ok: true, edades: nums.some((e) => e !== null) ? nums : null };
};

/** [3, 6] → "3 y 6 años" · [1] → "1 año" · vacío/sin edades → "" */
export const fmtEdadesHermanos = (edades) => {
  const e = (edades || []).filter((x) => x !== null && x !== undefined);
  if (!e.length) return "";
  const lista = e.length === 1 ? String(e[0]) : `${e.slice(0, -1).join(", ")} y ${e[e.length - 1]}`;
  return `${lista} ${e.length === 1 && e[0] === 1 ? "año" : "años"}`;
};
