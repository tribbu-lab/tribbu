// src/lib/muro.js
//
// Cálculos del Muro (Inicio) compartidos por web (src/features/muro) y mobile
// (@shared/muro): qué va a "Pendientes" y los cumpleaños próximos. Puro: sin
// supabase ni APIs de plataforma — cada pantalla hace sus queries y le pasa
// las filas. Las fechas son strings "YYYY-MM-DD" locales (fmtLocalDate).
//
// Unifica copias que se habían separado entre plataformas: la web mostraba
// invitaciones a festejos ya pasados (y una por hijo invitado al mismo
// festejo), y mobile podía mostrar más de una alerta del mismo curso.

import { fmtLocalDate } from "./helpers";
import { estaActiva } from "./encuestas";

/** Próximo cumpleaños a partir de hoy: días que faltan + la fecha concreta. */
export const proximoCumple = (fechaNacimiento, hoy = new Date()) => {
  const base = new Date(hoy);
  base.setHours(0, 0, 0, 0);
  const d = new Date(fechaNacimiento + "T00:00:00");
  const next = new Date(base.getFullYear(), d.getMonth(), d.getDate());
  if (next < base) next.setFullYear(base.getFullYear() + 1);
  return { dias: Math.round((next - base) / 86400000), fecha: fmtLocalDate(next) };
};

/**
 * Recordatorios que van a Pendientes: no leídos, para todo el curso o para
 * este usuario, sin fecha o con fecha entre hoy y `hasta`. Excluye los
 * automáticos (regalo de cumple / vencimiento de colecta), que ya tienen su
 * propia card. Más nuevos primero.
 */
export const recordatoriosPendientes = (recordatorios, leidosIds, userId, hoyStr, hasta) =>
  recordatorios
    .filter((r) => {
      if (r.tipo === "regalo_cumple" || r.tipo === "colecta_vence") return false;
      if (leidosIds.has(r.id)) return false;
      if (r.para_usuario_id && r.para_usuario_id !== userId) return false;
      if (r.fecha && r.fecha < hoyStr) return false;
      if (r.fecha && r.fecha > hasta) return false;
      return true;
    })
    .sort((a, b) => (b.creado_en || "").localeCompare(a.creado_en || ""));

/** Colectas activas que vencen hasta `hasta` (o sin vencimiento). */
export const colectasActivas = (colectas, hasta) => colectas.filter((c) => c.activa && (!c.vencimiento || c.vencimiento <= hasta));

/**
 * Colectas con algún hijo mío de ESE curso sin pagar. `misHijosPorCurso` es
 * Map<curso_id, hijo_id[]>: en la vista Todos hay colectas de varios cursos,
 * y un hijo de otro curso no cuenta como impago.
 */
export const colectasPendientes = (activas, pagos, misHijosPorCurso) => {
  const pagados = new Set(pagos.filter((p) => p.estado === "pagado").map((p) => `${p.colecta_id}-${p.alumno_id}`));
  return activas.filter((c) => (misHijosPorCurso.get(c.curso_id) || []).some((hid) => !pagados.has(`${c.id}-${hid}`)));
};

/**
 * Invitaciones a festejos sin responder → los festejos (no las filas de
 * asistencia): uno por festejo aunque haya varios hijos invitados, y solo los
 * que todavía no pasaron. `filas` = evento_asistencia con el join `evento`.
 */
export const festejosPendientes = (filas, hoyStr) => {
  const vistos = new Set();
  const festejos = [];
  for (const { evento } of filas) {
    if (!evento?.fecha || evento.fecha < hoyStr || vistos.has(evento.id)) continue;
    vistos.add(evento.id);
    festejos.push(evento);
  }
  return festejos;
};

/** Encuestas abiertas (ni cerradas ni eliminadas) — candidatas a Pendientes. */
export const encuestasAbiertas = (encuestas, hoyStr) => encuestas.filter((e) => estaActiva(e, hoyStr));

/** La alerta más reciente de cada curso (las filas ya vienen de más nueva a más vieja). */
export const alertasUnaPorCurso = (alertas) => {
  const cursos = new Set();
  return alertas.filter((a) => (cursos.has(a.curso_id) ? false : cursos.add(a.curso_id)));
};
