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

// Room Parent → nombrar a otro: apoderados del curso que todavía no son Room
// Parent, con sus hijos para distinguirlos. `hijosCurso` = hijos del curso con
// usuario_hijos(usuarios(...)) embebido. Sin datos de contacto.
export function candidatosRoomParent(hijosCurso, idsRoom) {
  const yaSon = new Set(idsRoom || []);
  const porUsuario = new Map();
  for (const h of hijosCurso || []) {
    for (const uh of h.usuario_hijos || []) {
      const u = uh.usuarios;
      if (!u || yaSon.has(u.id) || u.activo === false || !["padre", "room"].includes(u.rol)) continue;
      const c = porUsuario.get(u.id) || { id: u.id, nombre: u.nombre, apellido: u.apellido, hijos: [] };
      c.hijos.push(h.nombre);
      porUsuario.set(u.id, c);
    }
  }
  return [...porUsuario.values()].sort((a, b) =>
    `${a.apellido || ""} ${a.nombre || ""}`.localeCompare(`${b.apellido || ""} ${b.nombre || ""}`, "es"));
}

// "lau" → encuentra por nombre, apellido o nombre del hijo, sin importar tildes.
const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function filtrarCandidatos(candidatos, busqueda) {
  const q = sinTildes(busqueda).trim();
  if (!q) return candidatos;
  return candidatos.filter((c) => sinTildes(`${c.nombre} ${c.apellido} ${c.hijos.join(" ")}`).includes(q));
}
