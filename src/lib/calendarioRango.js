// Rango de fechas que el Calendario necesita tener cargado (web + mobile, vía
// @shared/calendarioRango). Antes cada apertura del Calendario pedía TODOS los
// eventos de los cursos (el año entero, y crece con el uso); ahora se pide un
// rango y se amplía solo cuando la vista lo necesita (ir a otro mes, rango
// personalizado, deep-link a una fecha). Puro: sin supabase.
//
// Fechas como "AAAA-MM-DD" (se comparan como strings).

import { fmtLocalDate } from "./helpers";

/** Días hacia adelante que cubre siempre (el filtro "Próximos" llega a 90). */
export const DIAS_ADELANTE = 90;

const primerDia = (d) => fmtLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
const ultimoDia = (d) => fmtLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));

/**
 * Rango que la vista actual necesita: siempre [1° del mes actual, hoy + 90 días];
 * más el mes que se está mirando (vista "mes") y el rango personalizado (web).
 */
export function rangoNecesario({ hoy, mes, vista, desdeCustom = null, hastaCustom = null }) {
  const adelante = new Date(hoy);
  adelante.setDate(adelante.getDate() + DIAS_ADELANTE);
  let desde = primerDia(hoy);
  let hasta = fmtLocalDate(adelante);
  if (vista === "mes" && mes) {
    if (primerDia(mes) < desde) desde = primerDia(mes);
    if (ultimoDia(mes) > hasta) hasta = ultimoDia(mes);
  }
  if (desdeCustom && desdeCustom < desde) desde = desdeCustom;
  if (hastaCustom && hastaCustom > hasta) hasta = hastaCustom;
  return { desde, hasta };
}

/** ¿El rango cargado `a` ya cubre `b`? */
export const cubre = (a, b) => !!a && a.desde <= b.desde && a.hasta >= b.hasta;

/** Unión de dos rangos (el cargado solo crece: volver a un mes ya visto no recarga). */
export const unirRangos = (a, b) => (!a ? b : { desde: a.desde < b.desde ? a.desde : b.desde, hasta: a.hasta > b.hasta ? a.hasta : b.hasta });

/**
 * Filtro .or() de PostgREST para eventos que se solapan con [desde, …]:
 * empiezan desde `desde`, o empezaron antes pero terminan (fecha_fin) después.
 * El tope superior va aparte con .lte("fecha", hasta).
 */
export const filtroDesdeEventos = (desde) => `fecha.gte.${desde},fecha_fin.gte.${desde}`;
