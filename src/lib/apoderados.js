// Panel del colegio → Personas → Apoderados: filtro por curso (web y app).
// Puro. `u` = usuario del panel ({ cursos: [curso_id de usuario_cursos],
// hijos: [hijo_id] }); `hijos` = alumnos del colegio ({ id, curso_id }).

// Un apoderado "está" en un curso si tiene fila en usuario_cursos (Room Parent
// o apoderado) o un hijo en ese curso — lo mismo que muestran sus chips de acceso.
export function apoderadoEnCurso(u, cursoId, hijos) {
  if ((u.cursos || []).some((c) => String(c) === cursoId)) return true;
  const ids = new Set(u.hijos || []);
  return (hijos || []).some((h) => ids.has(h.id) && String(h.curso_id) === cursoId);
}

// Opciones del filtro: solo los cursos del año lectivo vigente (sin año
// cargado, todos), ordenados por nombre.
export function opcionesCursoApoderados(cursos, anoActual) {
  return (cursos || [])
    .filter((c) => !anoActual || c.año_lectivo === anoActual)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }))
    .map((c) => ({ value: String(c.id), label: c.nombre }));
}
