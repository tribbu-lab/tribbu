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
  // "informado" (la familia avisó que pagó, falta que lo confirmen) ya no le
  // pide nada a la familia.
  const pagados = new Set(pagos.filter((p) => p.estado === "pagado" || p.estado === "informado").map((p) => `${p.colecta_id}-${p.alumno_id}`));
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

/**
 * Festejos a los que dijimos que no (todos mis hijos invitados respondieron
 * "no") → no van a "Próximos días". `filas` = evento_asistencia de mis hijos.
 */
export const festejosRechazados = (filas = []) => {
  const estado = new Map();
  for (const f of filas) {
    const id = f.evento?.id || f.evento_id;
    if (!id) continue;
    estado.set(id, (estado.get(id) ?? true) && f.asiste === "no");
  }
  return new Set([...estado].filter(([, no]) => no).map(([id]) => id));
};

/** Encuestas abiertas (ni cerradas ni eliminadas) — candidatas a Pendientes. */
export const encuestasAbiertas = (encuestas, hoyStr) => encuestas.filter((e) => estaActiva(e, hoyStr));

/** La alerta más reciente de cada curso (las filas ya vienen de más nueva a más vieja). */
export const alertasUnaPorCurso = (alertas) => {
  const cursos = new Set();
  return alertas.filter((a) => (cursos.has(a.curso_id) ? false : cursos.add(a.curso_id)));
};

/**
 * Urgencia del chip "faltan N días" en la agenda: "hot" (lleno) si faltan
 * menos de 3 días (hoy, mañana, pasado), "soon" (teñido) hasta 7, "later"
 * (neutro) el resto. Una sola regla para web y mobile.
 */
export const nivelUrgencia = (dias) => (dias < 3 ? "hot" : dias <= 7 ? "soon" : "later");

/**
 * Quién gestiona una colecta (cerrar / reabrir) — mismo criterio que la RLS
 * (puede_gestionar_colecta): la Room Parent del curso, el responsable (quien
 * junta la plata) o quien la creó. El colegio lo hace desde su panel.
 */
export const gestionaColecta = (c, userId, cursosAdmin = []) =>
  !!c && !!userId && (cursosAdmin.includes(c.curso_id) || c.responsable_id === userId || c.creado_por === userId);

/**
 * Apoderados de los cursos en vista con sus cursos e hijos, a partir de
 * usuario_hijos (usuario_id, hijo_id) y los alumnos (id, nombre, curso_id).
 * → Map<usuario_id, { cursos: curso_id[], hijos: { nombre, curso_id }[] }>
 */
export const familiasPorUsuario = (usuarioHijos = [], alumnos = []) => {
  const alumno = new Map(alumnos.map((a) => [a.id, a]));
  const porUsuario = new Map();
  for (const r of usuarioHijos) {
    const a = alumno.get(r.hijo_id);
    if (!r.usuario_id || !a) continue;
    const f = porUsuario.get(r.usuario_id) || { cursos: [], hijos: [] };
    if (!f.cursos.includes(a.curso_id)) f.cursos.push(a.curso_id);
    const nombre = (a.nombre || "").split(" ")[0];
    if (nombre && !f.hijos.some((h) => h.nombre === nombre && h.curso_id === a.curso_id)) f.hijos.push({ nombre, curso_id: a.curso_id });
    porUsuario.set(r.usuario_id, f);
  }
  return porUsuario;
};

/**
 * Opciones de "Responsable" de una colecta: solo las familias del curso de esa
 * colecta (en la vista Todos venían las de todos los cursos), en orden
 * alfabético. `incluir` = ids que van igual (yo, el responsable actual).
 */
export const responsablesParaCurso = (usuarios = [], cursoId, incluir = []) =>
  usuarios
    .filter((u) => !cursoId || (u.cursos || []).includes(cursoId) || incluir.includes(u.id))
    .sort((a, b) => `${a.nombre || ""} ${a.apellido || ""}`.localeCompare(`${b.nombre || ""} ${b.apellido || ""}`, "es", { sensitivity: "base" }));

/** "Ana Pérez (Juan y Sofi)" — el apoderado con sus hijos de ese curso. */
export const etiquetaResponsable = (u, cursoId) => {
  const hijos = (u.hijos || []).filter((h) => !cursoId || h.curso_id === cursoId).map((h) => h.nombre);
  return `${u.nombre || ""}${u.apellido ? ` ${u.apellido}` : ""}${hijos.length ? ` (${hijos.join(" y ")})` : ""}`;
};

/**
 * Estado del pago de un alumno en una colecta (supabase/colectas-informar-pago.sql):
 * "pagado" (confirmado por quien recauda; es lo único que suma), "informado"
 * (la familia avisó que transfirió) o "pendiente".
 */
export const estadoPago = (pago) => (pago?.estado === "pagado" ? "pagado" : pago?.estado === "informado" ? "informado" : "pendiente");

/** A quién avisarle que una familia informó un pago: el responsable (o quien la creó). */
export const avisarPagoA = (c, userId) => [c?.responsable_id || c?.creado_por].filter((u) => u && u !== userId);

/** Colectas para listar: las abiertas primero y las cerradas al final (cada grupo en el orden que vino). */
export const ordenarColectas = (colectas = []) => [...colectas.filter((c) => c.activa), ...colectas.filter((c) => !c.activa)];

/** Días que pasaron desde la fecha límite (null si no tiene o no venció). */
export const diasVencida = (c, hoyStr) => {
  const lim = c.fecha_limite || c.vencimiento;
  if (!lim || lim >= hoyStr) return null;
  return Math.round((new Date(hoyStr + "T00:00:00") - new Date(lim + "T00:00:00")) / 86400000);
};

/** A los cuántos días de vencida se le sugiere a quien la gestiona cerrarla. */
export const DIAS_PARA_CERRAR = 15;

/**
 * Colectas abiertas que llevan DIAS_PARA_CERRAR días o más vencidas y que el
 * usuario gestiona → "¿Ya terminaste? Cerrala". No se cierran solas: siempre
 * hay quien paga tarde, lo decide quien junta la plata.
 */
export const colectasPorCerrar = (colectas, userId, cursosAdmin, hoyStr) =>
  colectas.filter((c) => c.activa && gestionaColecta(c, userId, cursosAdmin) && (diasVencida(c, hoyStr) ?? -1) >= DIAS_PARA_CERRAR);

// ── Inicio "Hoy" (rediseño según el prototipo de Figma, etapa 2) ──────────

/** "Tenés 1 respuesta pendiente" / "Tenés N respuestas pendientes" ("" con 0). */
export const textoRespuestasPendientes = (n) =>
  !n ? "" : n === 1 ? "Tenés 1 respuesta pendiente" : `Tenés ${n} respuestas pendientes`;

/**
 * Pendientes ordenados por vencimiento: lo que vence antes, primero; lo que no
 * tiene fecha (`vence` null), al final. Estable: a igual fecha respeta el orden
 * de entrada.
 */
export const ordenarPorVencimiento = (items = []) =>
  items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const va = a.it.vence || "9999-12-31";
      const vb = b.it.vence || "9999-12-31";
      return va < vb ? -1 : va > vb ? 1 : a.i - b.i;
    })
    .map((x) => x.it);

const fmtDiaSemanaCorto = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, "");

/** "Próximos días" del Inicio: de hoy a DIAS_PROXIMOS días adelante. */
export const DIAS_PROXIMOS = 5;

/** Hasta cuántos días antes un pendiente se marca como urgente (en rojo). */
export const DIAS_URGENTE = 2;

/**
 * Línea de urgencia de un pendiente cuando vence en DIAS_URGENTE días o menos
 * (si no, null) — en Hoy va en rojo:
 * avisoVencimiento("Respondé hasta", "2026-10-15", "2026-10-14") →
 * "Respondé hasta mañana, jue 15 oct".
 */
export const avisoVencimiento = (prefijo, fecha, hoyStr) => {
  if (!fecha || !hoyStr) return null;
  const dias = Math.round((new Date(fecha + "T00:00:00") - new Date(hoyStr + "T00:00:00")) / 86400000);
  if (dias === 0) return `${prefijo} hoy`;
  if (dias === 1) return `${prefijo} mañana, ${fmtDiaSemanaCorto(fecha)}`;
  if (dias > 1 && dias <= DIAS_URGENTE) return `${prefijo} el ${fmtDiaSemanaCorto(fecha)}`;
  return null;
};

/** "lun 19 oct" — fecha corta para los renglones de dato de Hoy. */
export const fechaCorta = (s) => (s ? fmtDiaSemanaCorto(s) : "");

/** Menú de hoy como tabla — mismas categorías que Comedor (@shared/menu). */
export { filasMenu } from "./menu";
