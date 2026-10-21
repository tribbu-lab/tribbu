// Reglas de Talleres extraprogramáticos, compartidas por web y mobile
// (@shared/talleres). Puro: sin supabase ni React. La base hace cumplir lo
// mismo (supabase/talleres.sql: cupo, elegibilidad, fechas); acá se calcula
// para mostrar el catálogo y los estados sin pedidos extra.
//
// Fechas como "AAAA-MM-DD" en hora de Argentina (hoyAR()).

export const MODOS = {
  orden_llegada: "Por orden de llegada",
  aprobacion: "Con aprobación del colegio",
  sorteo: "Por sorteo",
};
export const ESTADOS_TALLER = { borrador: "Borrador", publicado: "Publicado", cerrado: "Inscripción cerrada", cancelado: "Cancelado" };
const DIA_CORTO = { Lunes: "Lun", Martes: "Mar", "Miércoles": "Mié", Jueves: "Jue", Viernes: "Vie", "Sábado": "Sáb", Domingo: "Dom" };
const ORDEN_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Hoy en Argentina, "AAAA-MM-DD". */
export function hoyAR(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** "2026-10-20" → "20 oct" */
export function fmtFechaCorta(f) {
  if (!f) return "";
  const [, m, d] = String(f).split("-").map(Number);
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** Años cumplidos a una fecha ("AAAA-MM-DD"). */
export function edadA(fechaNac, fecha) {
  if (!fechaNac || !fecha) return null;
  const [ay, am, ad] = String(fechaNac).split("-").map(Number);
  const [by, bm, bd] = String(fecha).split("-").map(Number);
  let e = by - ay;
  if (bm < am || (bm === am && bd < ad)) e -= 1;
  return e;
}

/** ¿El hijo puede anotarse? Igual que hijo_elegible_taller() en la base. */
export function esElegible(taller, hijo, cursosTaller = [], hoy = hoyAR()) {
  if (!taller || !hijo) return false;
  if (taller.elegibilidad === "edad") {
    const e = edadA(hijo.fecha_nacimiento, taller.fecha_inicio || hoy);
    if (e == null) return false;
    if (taller.edad_min != null && e < taller.edad_min) return false;
    if (taller.edad_max != null && e > taller.edad_max) return false;
    return true;
  }
  return cursosTaller.includes(hijo.curso_id);
}

/** Texto de a quién está dirigido: "1°B, 2°A" / "De 6 a 8 años". */
export function textoElegibilidad(taller, nombresCursos = []) {
  if (taller.elegibilidad === "edad") {
    const { edad_min: a, edad_max: b } = taller;
    if (a != null && b != null) return a === b ? `${a} años` : `De ${a} a ${b} años`;
    if (a != null) return `Desde ${a} años`;
    if (b != null) return `Hasta ${b} años`;
    return "Todas las edades";
  }
  return nombresCursos.length ? nombresCursos.join(", ") : "Sin cursos elegidos";
}

export function inscripcionAbierta(taller, hoy = hoyAR()) {
  return taller?.estado === "publicado"
    && (!taller.inscripcion_desde || taller.inscripcion_desde <= hoy)
    && (!taller.inscripcion_hasta || taller.inscripcion_hasta >= hoy);
}
/** Todavía no abrió (publicado con inscripción futura). */
export const inscripcionPorAbrir = (taller, hoy = hoyAR()) =>
  taller?.estado === "publicado" && !!taller.inscripcion_desde && taller.inscripcion_desde > hoy;

/** Último día para darse de baja (null = sin límite). */
export const limiteBaja = (taller) => taller?.baja_hasta || taller?.fecha_inicio || null;
export const puedeDarseDeBaja = (taller, hoy = hoyAR()) => !limiteBaja(taller) || hoy <= limiteBaja(taller);

/** Lugares libres (null = sin cupo). `cupos` = fila de cupos_talleres(). */
export function lugaresLibres(taller, cupos) {
  if (taller?.cupo == null) return null;
  return Math.max(0, taller.cupo - (cupos?.inscriptos || 0));
}

/** "Quedan 3 lugares" / "Sin cupo · lista de espera" / "Cupo libre". */
export function textoLugares(taller, cupos) {
  const libres = lugaresLibres(taller, cupos);
  if (libres == null) return "Sin límite de cupo";
  if (libres === 0) return taller.modo_asignacion === "orden_llegada" ? "Cupo completo · lista de espera" : "Cupo completo";
  return libres === 1 ? "Queda 1 lugar" : `Quedan ${libres} lugares`;
}

/** "Lun y Mié 17:00–18:00" (agrupa los días con el mismo horario). */
export function textoHorario(horarios = []) {
  const grupos = new Map();
  for (const h of [...horarios].sort((a, b) => ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia))) {
    const k = `${hhmm(h.hora_inicio)}–${hhmm(h.hora_fin)}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(DIA_CORTO[h.dia] || h.dia);
  }
  return [...grupos].map(([hora, dias]) => `${dias.length > 1 ? dias.slice(0, -1).join(", ") + " y " + dias[dias.length - 1] : dias[0]} ${hora}`).join(" · ");
}

export function textoProfe(taller, maestro) {
  if (maestro) return [maestro.nombre, maestro.apellido].filter(Boolean).join(" ");
  return taller?.profe_texto || "";
}

/**
 * Estado de un hijo en un taller, para la tarjeta del catálogo:
 *   { texto, tono: "ok"|"espera"|"pendiente"|"mal"|"neutro", accion: "anotar"|"baja"|null, nota }
 */
export function estadoHijo(taller, inscripcion, { hoy = hoyAR() } = {}) {
  const abierta = inscripcionAbierta(taller, hoy);
  const e = inscripcion?.estado;
  const baja = puedeDarseDeBaja(taller, hoy) ? "baja" : null;
  const notaBaja = baja ? null : "Para darte de baja, escribile al colegio.";
  if (taller.estado === "cancelado") return { texto: e === "inscripto" ? "Taller cancelado" : "Cancelado", tono: "mal", accion: null };
  if (e === "inscripto") return { texto: "Inscripto ✓", tono: "ok", accion: baja, nota: notaBaja };
  if (e === "espera") return { texto: `En lista de espera${inscripcion.posicion_espera ? ` (puesto ${inscripcion.posicion_espera})` : ""}`, tono: "espera", accion: baja, nota: notaBaja };
  if (e === "pendiente") return {
    texto: taller.modo_asignacion === "sorteo" ? "Anotado para el sorteo" : "Pendiente de aprobación",
    tono: "pendiente", accion: baja, nota: notaBaja,
  };
  if (e === "rechazado") return { texto: "No quedó inscripto", tono: "mal", accion: null, nota: inscripcion.motivo || null };
  if (abierta) return { texto: null, tono: "neutro", accion: "anotar" };
  if (inscripcionPorAbrir(taller, hoy)) return { texto: `La inscripción abre el ${fmtFechaCorta(taller.inscripcion_desde)}`, tono: "neutro", accion: null };
  return { texto: "Inscripción cerrada", tono: "neutro", accion: null };
}

/** Lo que pasó al anotar (respuesta de inscribir_en_taller) → mensaje para la familia. */
export function mensajeInscripcion(nombreHijo, nombreTaller, r) {
  if (r?.estado === "inscripto") return `✓ ${nombreHijo} quedó inscripto/a en ${nombreTaller}`;
  if (r?.estado === "espera") return `${nombreHijo} quedó en lista de espera${r.posicion ? ` (puesto ${r.posicion})` : ""}. Si se libera un lugar te avisamos.`;
  if (r?.estado === "pendiente") return `${nombreHijo} quedó anotado/a. Te avisamos cuando el colegio confirme.`;
  return "Listo";
}

/**
 * Para el Muro: talleres con inscripción abierta y algún hijo elegible que
 * todavía no se anotó. → [{ taller, hijos: [hijo] }], los que cierran antes primero.
 */
export function talleresParaAnotarse(talleres, hijos, { cursosPorTaller = {}, inscripciones = [], hoy = hoyAR() } = {}) {
  const anotados = new Set(inscripciones.filter((i) => i.estado !== "baja").map((i) => `${i.taller_id}|${i.hijo_id}`));
  return talleres
    .filter((t) => inscripcionAbierta(t, hoy))
    .map((t) => ({ taller: t, hijos: hijos.filter((h) => esElegible(t, h, cursosPorTaller[t.id] || [], hoy) && !anotados.has(`${t.id}|${h.id}`)) }))
    .filter((x) => x.hijos.length)
    .sort((a, b) => (a.taller.inscripcion_hasta || "9999").localeCompare(b.taller.inscripcion_hasta || "9999"));
}

/**
 * Bloques de horario de los talleres en los que alguno de `hijoIds` está
 * inscripto y que se dictan hoy (entre fecha_inicio y fecha_fin), con la forma
 * de una fila de `horarios` para que Calendario → Horario los dibuje igual.
 * `curso_id` = el del hijo (para la vista Todos, que agrupa por curso).
 */
export function bloquesDeTalleres(talleres, { horarios = [], inscripciones = [], hijos = [], hoy = hoyAR() } = {}) {
  const res = [];
  for (const t of talleres) {
    if (t.estado === "cancelado" || t.estado === "borrador") continue;
    if (t.fecha_fin && t.fecha_fin < hoy) continue;
    const delTaller = hijos.filter((h) => inscripciones.some((i) => i.taller_id === t.id && i.hijo_id === h.id && i.estado === "inscripto"));
    const cursos = [...new Set(delTaller.map((h) => h.curso_id))];
    for (const curso_id of cursos) {
      for (const h of horarios.filter((x) => x.taller_id === t.id)) {
        res.push({ id: `taller-${h.id}-${curso_id}`, dia: h.dia, hora_inicio: h.hora_inicio, hora_fin: h.hora_fin, materia: t.nombre,
          docente: t._profe || t.profe_texto || null, color: "#7C3AED", curso_id, clases: { optativa: true }, _taller: t.id });
      }
    }
  }
  return res;
}

/** select de un taller con lo que muestran las tarjetas (cursos, horarios, profe). */
export const SELECT_TALLER = "*, taller_cursos(curso_id), taller_horarios(id,dia,hora_inicio,hora_fin), profe:maestros(nombre,apellido)";

// ── Novedades del Inicio: un taller con inscripción abierta se informa ahí
// hasta que la familia lo mira ("Ver el taller"). Lo visto se guarda en el
// dispositivo (como "No es de mi hijo" en Lost & Found), sin viaje al servidor.
export const claveTalleresVistos = (userId) => `talleres_vistos_${userId}`;

/** Texto guardado → Set de ids de talleres vistos. */
export const leerTalleresVistos = (guardado) => {
  try { return new Set(JSON.parse(guardado || "[]")); } catch { return new Set(); }
};

/** Agrega un taller a lo visto (guarda los últimos 50) → texto para guardar. */
export const marcarTallerVisto = (guardado, id) => {
  const lista = [...leerTalleresVistos(guardado)].filter((x) => x !== id);
  return JSON.stringify([...lista, id].slice(-50));
};
