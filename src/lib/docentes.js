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
export const TABS_DOCENTE = ["muro", "clases", "horario", "cumples", "recordatorios", "mensajes", "alumnos", "encuestas", "autorizaciones", "talleres", "curso", "cuenta"];

/**
 * Cumpleaños para una docente: la RLS no le deja leer `hijos` ni `maestros`,
 * así que el Inicio y el Calendario usan la RPC cumples_para_docente(cursos)
 * (la misma que la pestaña Cumpleaños). Esto separa sus filas en las dos
 * listas con la forma de las consultas de las familias
 * (hijos: {id,nombre,apellido,fecha_nacimiento,color,curso_id};
 *  maestros: {…, maestro_cursos:[{curso_id}]}).
 */
export function separarCumplesDocente(filas) {
  const hijos = [];
  const maestros = [];
  for (const r of filas || []) {
    const base = { id: r.id, nombre: r.nombre, apellido: r.apellido, fecha_nacimiento: r.fecha_nacimiento };
    if (r.tipo === "alumno") hijos.push({ ...base, color: r.color, curso_id: r.curso_id });
    else maestros.push({ ...base, maestro_cursos: [{ curso_id: r.curso_id }] });
  }
  return { hijos, maestros };
}

/** ¿Este curso es de la docente? */
export const esCursoDocente = (cursosDocente, cursoId) => !!cursoId && (cursosDocente || []).includes(cursoId);
