// src/lib/encuestas.js
//
// Reglas de Encuestas compartidas por web (src/features/encuestas, muro) y
// mobile (@shared/encuestas). Puro: sin supabase ni APIs de plataforma.
// Antes cada pantalla tenía su copia y ya se habían separado — p.ej. el
// "Pendientes" del Muro mostraba encuestas eliminadas (no miraba eliminada_en).

export const MAX_OPCIONES = 6;
export const MIN_OPCIONES = 2;

/** Cerrada a mano, o con fecha de cierre ya pasada. `hoyStr` = "YYYY-MM-DD" local. */
export const estaCerrada = (e, hoyStr) => !!(e.cerrada_manual || (e.fecha_cierre && e.fecha_cierre < hoyStr));

/** Eliminada (soft delete): queda solo en la pestaña "Eliminadas" de quien la gestiona. */
export const estaEliminada = (e) => !!e.eliminada_en;

/** Abierta a votos: ni cerrada ni eliminada. */
export const estaActiva = (e, hoyStr) => !estaCerrada(e, hoyStr) && !estaEliminada(e);

/**
 * Resultado de una opción: votos, porcentaje sobre el total de la encuesta y
 * los nombres (de pila) de quienes la votaron. `votos` son los de esa encuesta,
 * con el join `usuarios(nombre)`.
 */
export const resultadoOpcion = (votos, opcionId) => {
  const votantes = votos.filter((v) => v.opcion_id === opcionId);
  const cuenta = votantes.length;
  const pct = votos.length ? Math.round((cuenta / votos.length) * 100) : 0;
  const nombres = votantes.map((v) => v.usuarios?.nombre?.split(" ")[0] || "Apoderado").join(", ");
  return { cuenta, pct, nombres };
};

/** Opción con más votos (empate → la primera). null si no hay opciones. */
export const opcionGanadora = (opciones, votos) => {
  if (!opciones.length) return null;
  const cuenta = (o) => votos.filter((v) => v.opcion_id === o.id).length;
  return opciones.reduce((max, o) => (cuenta(o) > cuenta(max) ? o : max), opciones[0]);
};
