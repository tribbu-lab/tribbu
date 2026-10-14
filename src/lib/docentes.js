// src/lib/docentes.js — reglas puras del rol docente (specs/docentes-clases-y-
// grupos.md, Fase B), compartidas web/mobile (@shared/docentes).

/** "👩‍🏫 Laura Fernández · Inglés" (materias recortadas a la primera si son muchas). */
export function etiquetaDocente(info) {
  if (!info) return null;
  const materias = (info.materias || "").split(",").map((s) => s.trim()).filter(Boolean);
  const mat = materias.length > 2 ? `${materias[0]} y otras` : materias.join(", ");
  return `👩‍🏫 ${info.nombre}${mat ? ` · ${mat}` : ""}`;
}

/** Pestañas que ve una docente (ids de App.jsx). */
export const TABS_DOCENTE = ["muro", "clases", "cumples", "recordatorios", "mensajes", "alumnos", "encuestas", "autorizaciones", "talleres", "curso", "cuenta"];

/** ¿Este curso es de la docente? */
export const esCursoDocente = (cursosDocente, cursoId) => !!cursoId && (cursosDocente || []).includes(cursoId);
