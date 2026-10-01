// "¿Lo leí?" embebido en la consulta de recordatorios (web + mobile, vía
// @shared/leidos). Antes cada pantalla (Muro, campanita, Avisos) pedía aparte
// TODOS los recordatorio_leidos del usuario desde siempre — una consulta más
// que crecía sin límite con el uso. Embebido, llegan solo los de los avisos
// que se están mostrando, en el mismo viaje.
//
// Uso: conLeidoDe(supabase.from("recordatorios").select(SELECT_REC_CON_LEIDO), userId)
//        .in(...)...
//      const { recs, leidos } = separarLeidos(data);
// El .eq filtra la tabla embebida (no los avisos); la RLS de
// recordatorio_leidos igual solo deja ver las filas propias.

export const SELECT_REC_CON_LEIDO = "*, recordatorio_leidos(recordatorio_id)";

/** Saca el embebido de cada fila: { recs (filas limpias), leidos (Set de ids) }. */
export const separarLeidos = (rows) => {
  const leidos = new Set();
  const recs = [];
  for (const { recordatorio_leidos: l, ...r } of rows || []) {
    if (l?.length) leidos.add(r.id);
    recs.push(r);
  }
  return { recs, leidos };
};

/** Aplica el filtro "leídos míos" a una consulta de recordatorios (sin usuario,
 *  no filtra: la RLS igual devuelve solo filas propias, o sea ninguna). */
export const conLeidoDe = (query, userId) =>
  userId ? query.eq("recordatorio_leidos.usuario_id", userId) : query;
