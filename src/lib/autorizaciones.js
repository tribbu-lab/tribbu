// src/lib/autorizaciones.js
//
// Reglas de Autorizaciones compartidas por web y mobile (@shared/autorizaciones).
// Puro: sin supabase. Ver specs/autorizaciones.md y supabase/autorizaciones.sql
// (la fecha límite también la hace cumplir la RLS).

/** Abierta = sin fecha límite o no vencida. `hoyStr` = "YYYY-MM-DD" local. */
export const estaAbierta = (a, hoyStr) => !a.fecha_limite || a.fecha_limite >= hoyStr;

/**
 * Estado por alumno de una autorización: [{ hijo, respuesta|null }], con los
 * sin responder primero y después por nombre.
 */
export const estadoPorAlumno = (alumnos, respuestas) => {
  const porHijo = new Map(respuestas.map((r) => [r.hijo_id, r]));
  return alumnos
    .map((hijo) => ({ hijo, respuesta: porHijo.get(hijo.id) || null }))
    .sort((a, b) => {
      if (!a.respuesta !== !b.respuesta) return a.respuesta ? 1 : -1;
      return `${a.hijo.nombre} ${a.hijo.apellido || ""}`.localeCompare(`${b.hijo.nombre} ${b.hijo.apellido || ""}`, "es");
    });
};

/** { autorizados, noAutorizados, sinResponder } sobre la lista de alumnos del curso. */
export const resumenRespuestas = (alumnos, respuestas) => {
  const ids = new Set(alumnos.map((h) => h.id));
  const validas = respuestas.filter((r) => ids.has(r.hijo_id));
  const autorizados = validas.filter((r) => r.autoriza).length;
  const noAutorizados = validas.length - autorizados;
  return { autorizados, noAutorizados, sinResponder: alumnos.length - validas.length };
};

/** Mis hijos del curso de la autorización que todavía no tienen respuesta. */
export const hijosSinResponder = (a, misHijos, respuestas) =>
  misHijos.filter((h) => h.curso_id === a.curso_id && !respuestas.some((r) => r.autorizacion_id === a.id && r.hijo_id === h.id));

/** Autorizaciones abiertas con algún hijo mío sin responder (para Pendientes del Muro). */
export const autorizacionesPendientes = (autorizaciones, misHijos, respuestas, hoyStr) =>
  autorizaciones.filter((a) => estaAbierta(a, hoyStr) && hijosSinResponder(a, misHijos, respuestas).length > 0);

// ── Flujo de respuesta (rediseño etapa 3) ─────────────────────────────────

/** "lun 19 oct" (sin puntos ni comas), para las fechas de la tarjeta. */
export const fechaAut = (s) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "") : "";

/**
 * Estado de la convocatoria, separado de "tu respuesta" (para que "Abierta" no
 * parezca que falta responder): "Abierta hasta el jue 15 oct" / "Abierta" /
 * "Cerrada".
 */
export const estadoConvocatoria = (a, hoyStr) =>
  !estaAbierta(a, hoyStr) ? "Cerrada" : a.fecha_limite ? `Abierta hasta el ${fechaAut(a.fecha_limite)}` : "Abierta";

/** La fecha límite es hoy o mañana (se resalta en la tarjeta). */
export const limiteCercano = (a, hoyStr) => {
  if (!a.fecha_limite || !estaAbierta(a, hoyStr)) return false;
  const dias = Math.round((new Date(a.fecha_limite + "T00:00:00") - new Date(hoyStr + "T00:00:00")) / 86400000);
  return dias <= 1;
};

/** Confirmación después de responder: "Respuesta enviada: autorizaste a Emma". */
export const textoConfirmacion = (autoriza, nombreHijo) =>
  `Respuesta enviada: ${autoriza ? "autorizaste" : "no autorizaste"} a ${nombreHijo}`;

/** Estado de la respuesta de un hijo, en una palabra: "Autorizada" / "No autorizada". */
export const textoRespuesta = (r) => (r ? (r.autoriza ? "Autorizada" : "No autorizada") : "Falta tu respuesta");
