// src/lib/avisosLista.js
//
// Formato de la lista de Avisos (web + mobile, @shared/avisosLista):
// "Requiere tu atención" arriba (prioridad alta o urgente, sin leer, no vencido) y
// "Recientes" abajo, en tarjetas con prioridad, de quién viene, hace cuánto se
// mandó, miniatura de la foto adjunta y una cajita con la fecha del aviso.
// Puro: sin supabase ni APIs de plataforma.

const DIA = 86400000;
const soloFecha = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const hoyISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * ¿Va en "Requiere tu atención"? Sin leer, de prioridad alta (o marcado
 * urgente) y que no haya pasado: un aviso cuya fecha ya pasó queda en
 * "Recientes" (sin leer igual). Los avisos sin fecha no vencen.
 */
export const requiereAtencion = (r, leido, hoy = hoyISO()) =>
  !leido && (r?.prioridad === "alta" || !!r?.urgente) && !(r?.fecha && r.fecha < hoy);

/** Separa los avisos (ya filtrados y ordenados) en { atencion, recientes }. */
export const separarAvisos = (avisos = [], leidosSet = new Set()) => {
  const atencion = [];
  const recientes = [];
  for (const r of avisos) (requiereAtencion(r, leidosSet.has(r.id)) ? atencion : recientes).push(r);
  return { atencion, recientes };
};

/** Hace cuánto se mandó: "recién", "hace 3 h", "ayer", "hace 9 días", "hace 2 meses". */
export const haceCuanto = (iso, ahora = new Date()) => {
  if (!iso) return "";
  const d = new Date(iso);
  const min = Math.round((ahora - d) / 60000);
  if (min < 60) return min <= 1 ? "recién" : `hace ${min} min`;
  const dias = Math.round((soloFecha(ahora) - soloFecha(d)) / DIA);
  if (dias <= 0) return `hace ${Math.max(1, Math.round(min / 60))} h`;
  if (dias === 1) return "ayer";
  if (dias < 45) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses <= 1 ? "hace un mes" : `hace ${meses} meses`;
};

/** "Mar 6 oct" — día de envío o de un aviso. */
export const fechaCortaAviso = (d) =>
  capital(new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }).replace(/[.,]/g, ""));

/**
 * Cajita de fecha de un aviso con día: { texto: "Sáb 17 oct · 10:30", rel: "En 2 días" }
 * (rel: "Hoy" / "Mañana" / "Ayer" / "En N días" / "Hace N días").
 */
export const fechaDelAviso = (fecha, horaInicio, ahora = new Date()) => {
  if (!fecha) return null;
  const f = new Date(fecha + "T00:00:00");
  const dias = Math.round((f - soloFecha(ahora)) / DIA);
  const rel = dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias === -1 ? "Ayer" : dias > 1 ? `En ${dias} días` : `Hace ${-dias} días`;
  const hora = horaInicio ? String(horaInicio).slice(0, 5) : null;
  return { texto: [fechaCortaAviso(f), hora].filter(Boolean).join(" · "), rel };
};

/** "4°B - Primaria" → "4°B". */
export const nombreCortoCurso = (nombre) => (nombre || "").split(" - ")[0].trim();

/**
 * De quién viene el aviso: "Colegio" (comunicación multi-curso), la docente
 * ("Laura · Inglés") o el curso ("4°B").
 */
export const origenAviso = (r, { docente = null, curso = null } = {}) => {
  if (r?.grupo_id) return "Colegio";
  if (docente) return String(docente).replace(/^👩‍🏫\s*/, "");
  return curso ? nombreCortoCurso(curso) : "Curso";
};

/** Primera foto adjunta (para la miniatura de la tarjeta), o null. */
export const fotoDelAviso = (r) => (r?.adjuntos || []).find((a) => a?.tipo === "imagen") || null;
