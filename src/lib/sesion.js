// Consulta y armado del usuario de la sesión, compartidos por el login web
// (features/auth), la sesión restaurada (App.jsx) y mobile (context/Session,
// vía @shared/sesion). Puro: sin supabase.
//
// Trae en el mismo viaje los hijos con su curso (para "Mi acceso"): antes
// App.jsx los pedía después con otra consulta a usuario_hijos, una espera más
// (~400 ms a us-east-1) en cada ingreso. Para una docente trae además sus
// clases con el curso (specs/docentes-clases-y-grupos.md, Fase B).

export const SELECT_USUARIO_SESION =
  "*, usuario_hijos(hijo_id, hijos(*, cursos(nombre,color,avatar,colegio_id))), usuario_cursos(curso_id, rol), " +
  "maestros(id, clases(curso_id, materias(nombre), cursos(id,nombre,color,avatar,colegio_id,año_lectivo)))";

/**
 * Cursos de una docente (uno por curso, con las materias que da ahí). Solo
 * los del año lectivo más nuevo entre sus cursos: al duplicar un curso para
 * el año siguiente, las clases del año anterior siguen existiendo.
 */
export const cursosDeDocente = (data) => {
  const porCurso = new Map();
  for (const m of data?.maestros || []) {
    for (const c of m.clases || []) {
      if (!c.cursos) continue;
      const prev = porCurso.get(c.cursos.id) || { ...c.cursos, materias: [] };
      if (c.materias?.nombre && !prev.materias.includes(c.materias.nombre)) prev.materias.push(c.materias.nombre);
      porCurso.set(c.cursos.id, prev);
    }
  }
  const cursos = [...porCurso.values()];
  const ultimo = Math.max(0, ...cursos.map((c) => c["año_lectivo"] || 0));
  return cursos.filter((c) => !ultimo || c["año_lectivo"] === ultimo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
};

export const armarUsuario = (data) => ({
  ...data,
  hijos:  [...new Set((data.usuario_hijos||[]).map(r=>r.hijo_id))],
  cursos: (data.usuario_cursos||[]).map(r=>r.curso_id),
  cursosConRol: (data.usuario_cursos||[]).map(r=>({curso_id:r.curso_id, rol:r.rol||"padre"})),
  cursosDocente: data.rol === "docente" ? cursosDeDocente(data) : [],
});

/**
 * "Mi acceso" de una docente: un item por curso (como los hijos de un
 * apoderado), con "Todos" primero si tiene más de uno.
 */
export const itemsDeDocente = (cursosDocente = []) => {
  const items = cursosDocente.map((c) => ({
    _tipo: "curso", id: c.id, curso_id: c.id, nombre: c.nombre, color: c.color, avatar: c.avatar,
    cursos: c, materias: c.materias || [], rolEfectivo: "docente",
  }));
  return items.length > 1 ? [{ _tipo: "todos", id: "__todos__", nombre: "Todos" }, ...items] : items;
};
