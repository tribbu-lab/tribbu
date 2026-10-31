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

/**
 * "Mis invitaciones" de Cumpleaños (web + mobile): filas de evento_asistencia
 * con el join `evento`. Solo festejos (evento_asistencia también se usa para
 * confirmar asistencia a paseos/actos/reuniones), solo de hoy en adelante (un
 * festejo que ya pasó no es una invitación pendiente) y del hijo en vista
 * (`hijoActivo` null = todos), ordenadas por fecha.
 */
export const invitacionesVigentes = (filas = [], hoyStr, hijoActivo = null) =>
  invitacionesDelHijo(filas, hijoActivo)
    .filter((i) => i.evento && i.evento.tipo === "festejo" && i.evento.fecha && i.evento.fecha >= hoyStr)
    .sort((a, b) => (a.evento.fecha + (a.evento.hora || "")).localeCompare(b.evento.fecha + (b.evento.hora || "")));

// ── Festejos por hijo ("Mi acceso") ─────────────────────────────────────────
// La RLS deja ver un festejo a toda la familia de un invitado (o del
// cumpleañero) y las pantallas leen por curso: con un hijo elegido eso no
// alcanza — los festejos de un hermano se colaban (Hoy en la app no filtraba
// ni por curso; con hermanos en el mismo curso ningún filtro por curso sirve).
// Regla: con un hijo elegido, un festejo va si ese hijo es el cumpleañero o
// está invitado. Si ninguno de mis hijos lo es (lo organicé yo para otro, me
// invitaron directo), va en cualquier vista de su curso. En "Todos"
// (`hijoActivo` null) va todo lo que trae la RLS.

/** Filas de evento_asistencia del hijo en vista (`hijoActivo` null = todas). */
export function invitacionesDelHijo(filas = [], hijoActivo = null) {
  return hijoActivo ? filas.filter((f) => f.alumno_invitado_id === hijoActivo) : filas;
}

/**
 * Saca de `eventos` los festejos que en la vista de `hijoActivo` son de un
 * hermano. `asistencias` = filas de evento_asistencia de mis hijos (con
 * `evento_id` o el join `evento`); los demás tipos de evento pasan igual.
 */
export const festejosDelHijo = (eventos = [], { hijoActivo = null, misHijos = [], asistencias = [] } = {}) => {
  if (!hijoActivo) return eventos;
  const invitados = new Map(); // evento_id → Set(hijos míos invitados o cumpleañeros)
  const sumar = (id, hijo) => {
    if (!id || !hijo || !misHijos.includes(hijo)) return;
    if (!invitados.has(id)) invitados.set(id, new Set());
    invitados.get(id).add(hijo);
  };
  for (const f of asistencias) sumar(f.evento_id || f.evento?.id, f.alumno_invitado_id);
  return eventos.filter((e) => {
    if (e.tipo !== "festejo") return true;
    sumar(e.id, e.alumno_id);
    const mios = invitados.get(e.id);
    return !mios || mios.has(hijoActivo);
  });
};
