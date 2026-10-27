// Cambios en la salida (web + mobile, @shared/cambiosSalida): una familia
// avisa que su hijo se retira de forma distinta a la habitual. Puro: opciones,
// validación, textos y estados. Tabla y permisos en supabase/cambios-salida.sql.

export const MOTIVOS = [
  { id: "medico", label: "Turno médico" },
  { id: "actividad", label: "Actividad extraescolar" },
  { id: "familiar", label: "Viaje o tema familiar" },
  { id: "otro", label: "Otro" },
];

const RETIROS = [
  { id: "familia", label: "Madre o padre" },
  { id: "otro_adulto", label: "Otro adulto" },
  { id: "transporte", label: "Transporte escolar" },
  { id: "solo", label: "Se va solo", soloSecundaria: true },
];

/** Opciones de "con quién se retira" para el nivel del curso ("Se va solo" solo en Secundaria). */
export const opcionesRetiro = (nivel) => RETIROS.filter((r) => !r.soloSecundaria || nivel === "secundaria");

/** "1630", "16.30", "9:5" → "16:30" / "09:05"; null si no es una hora válida. */
export function normalizarHora(txt) {
  const s = String(txt || "").trim();
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(s) || /^(\d{1,2})[:.](\d)$/.exec(s) || /^(\d{1,2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export const formVacio = () => ({ hijoId: null, fecha: "", hora: "", motivo: null, motivoDetalle: "", retira: null, retiraNombre: "", retiraDni: "", comentario: "" });

/** Primer error del formulario (texto para mostrar) o null. */
export function validarCambioSalida(form, hoy) {
  if (!form.hijoId) return "Elegí a tu hijo.";
  if (!form.fecha) return "Elegí el día.";
  if (form.fecha < hoy) return "El día no puede ser anterior a hoy.";
  if (!normalizarHora(form.hora)) return "Escribí el horario de salida (por ejemplo, 14:30).";
  if (!form.motivo) return "Elegí el motivo.";
  if (form.motivo === "otro" && !form.motivoDetalle.trim()) return "Contanos el motivo.";
  if (!form.retira) return "Elegí con quién se retira.";
  if (form.retira === "otro_adulto" && (!form.retiraNombre.trim() || !form.retiraDni.trim())) return "Completá el nombre y el DNI de quien lo retira.";
  return null;
}

/** Fila para insertar (sanitize lo pasa cada plataforma). */
export function filaCambioSalida(form, { cursoId, userId, sanitize }) {
  const limpio = (v) => sanitize(v || "").trim() || null;
  return {
    hijo_id: form.hijoId,
    curso_id: cursoId,
    fecha: form.fecha,
    hora: normalizarHora(form.hora),
    motivo: form.motivo,
    motivo_detalle: form.motivo === "otro" ? limpio(form.motivoDetalle) : null,
    retira: form.retira,
    retira_nombre: form.retira === "otro_adulto" || form.retira === "transporte" ? limpio(form.retiraNombre) : null,
    retira_dni: form.retira === "otro_adulto" ? limpio(form.retiraDni) : null,
    comentario: limpio(form.comentario),
    creado_por: userId,
  };
}

export const textoMotivo = (c) =>
  c.motivo === "otro" ? c.motivo_detalle || "Otro" : MOTIVOS.find((m) => m.id === c.motivo)?.label || c.motivo;

/** "Otro adulto: Juana Pérez (DNI 30.123.456)" / "Transporte escolar: Combi Sol". */
export function textoRetira(c) {
  const base = RETIROS.find((r) => r.id === c.retira)?.label || c.retira;
  if (c.retira === "otro_adulto") return `${c.retira_nombre || "Otro adulto"}${c.retira_dni ? ` (DNI ${c.retira_dni})` : ""}`;
  if (c.retira === "transporte" && c.retira_nombre) return `${base}: ${c.retira_nombre}`;
  return base;
}

/** Estado para mostrar: { id, label } — cancelado / visto / pasado / pendiente. */
export function estadoCambio(c, hoy) {
  if (c.cancelado_en) return { id: "cancelado", label: "Cancelado" };
  if (c.visto_en) return { id: "visto", label: "Visto por el colegio" };
  if (c.fecha < hoy) return { id: "pasado", label: "Sin ver" };
  return { id: "pendiente", label: "Enviado, falta que lo vea el colegio" };
}

/** La familia puede cancelarlo hasta ese mismo día. */
export const sePuedeCancelar = (c, hoy) => !c.cancelado_en && c.fecha >= hoy;

/** Hoy y los próximos (más cercano primero) y el historial (más reciente primero). */
export function separarCambios(lista, hoy) {
  const orden = (a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || ""));
  return {
    proximos: lista.filter((c) => c.fecha >= hoy && !c.cancelado_en).sort(orden),
    historial: lista.filter((c) => c.fecha < hoy || c.cancelado_en).sort((a, b) => orden(b, a)),
  };
}

/** Para el colegio: cuántos de hoy en adelante falta ver. */
export const pendientesDeVer = (lista, hoy) => lista.filter((c) => c.fecha >= hoy && !c.visto_en && !c.cancelado_en).length;

// Nombre de hijo, curso y quién avisó / quién lo vio (lo que RLS deje leer).
export const SELECT_CAMBIO_SALIDA =
  "*, hijos(nombre,apellido), cursos(nombre), creador:usuarios!cambios_salida_creado_por_fkey(nombre,apellido), visto:usuarios!cambios_salida_visto_por_fkey(nombre,apellido)";

/**
 * Cambios de esos cursos (recibe el cliente, como cargarGestiones). `desde`:
 * solo de esa fecha en adelante. `docente`: la docente no lee `hijos` por RLS,
 * así que los nombres salen de alumnos_de_curso_docente (en el mismo lote).
 */
export async function cargarCambiosSalida(supabase, { cursoIds = [], desde = null, limite = 300, docente = false }) {
  if (!cursoIds.length) return [];
  let q = supabase.from("cambios_salida").select(SELECT_CAMBIO_SALIDA).in("curso_id", cursoIds);
  if (desde) q = q.gte("fecha", desde);
  const [{ data, error }, ...alumnos] = await Promise.all([
    q.order("fecha", { ascending: false }).order("hora", { ascending: false }).limit(limite),
    ...(docente ? cursoIds.map((cid) => supabase.rpc("alumnos_de_curso_docente", { p_curso: cid })) : []),
  ]);
  if (error) throw error;
  if (!docente) return data || [];
  const nombres = new Map(alumnos.flatMap((r) => r.data || []).map((a) => [a.hijo_id, { nombre: a.nombre, apellido: a.apellido }]));
  return (data || []).map((c) => (c.hijos ? c : { ...c, hijos: nombres.get(c.hijo_id) || null }));
}

/** "Juan · Mañana 14:30 · Turno médico · Retira: Juana Pérez (DNI …)". */
export const textoPushCambio = (c, nombreHijo, hoy) =>
  [nombreHijo, `${fechaCambio(c.fecha, hoy)} ${(c.hora || "").slice(0, 5)}`, textoMotivo(c), `Retira: ${textoRetira(c)}`].filter(Boolean).join(" · ");

/**
 * Push del cambio (destinatarios por RPC: a la familia le resuelve la
 * Secretaría del nivel; al colegio, las familias del hijo). Nunca tira: el
 * aviso ya quedó guardado.
 */
export async function avisarCambioSalida(supabase, sendPush, { id, type, titulo }) {
  try {
    const { data } = await supabase.rpc("destinatarios_cambio_salida", { p_id: id });
    const userIds = [...new Set((data || []).map((r) => (typeof r === "string" ? r : r.destinatarios_cambio_salida)))];
    if (userIds.length) await sendPush({ type, payload: { titulo, userIds, cambioId: id } });
  } catch {
    // sin push: el cambio sigue registrado
  }
}

/** "hoy" / "mañana" / "jueves 30 de octubre". */
export function fechaCambio(fecha, hoy) {
  if (fecha === hoy) return "Hoy";
  const d = new Date(fecha + "T00:00:00");
  const h = new Date(hoy + "T00:00:00");
  if (Math.round((d - h) / 86400000) === 1) return "Mañana";
  const txt = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
