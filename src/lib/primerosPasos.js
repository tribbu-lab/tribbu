// "Primeros pasos" del panel del colegio (web + mobile, @shared/primerosPasos):
// la lista para dejar un colegio andando, en orden, con el estado de cada
// paso calculado con lo que ya hay. Puro: cada plataforma cuenta y pasa `d`.
//
// d = { cursos, materias, maestros, cursosSinHorario, alumnos,
//       alumnosSinApoderado, familias, familiasConApp }  (null = sin dato todavía)

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Pasos en orden: [{ id, titulo, detalle, hecho, sec, accion }]. */
export function pasosPrimerosPasos(d = {}) {
  const hayCursos = d.cursos > 0;
  return [
    {
      id: "cursos", sec: "cursos", accion: "Crear cursos", titulo: "Crear los cursos del año",
      hecho: hayCursos, detalle: hayCursos ? plural(d.cursos, "curso", "cursos") : "Todavía no hay cursos este año",
    },
    {
      id: "materias", sec: "materias", accion: "Cargar materias", titulo: "Cargar las materias",
      hecho: d.materias > 0, detalle: d.materias > 0 ? plural(d.materias, "materia", "materias") : "Matemática, Inglés, Recreo, Almuerzo…",
    },
    {
      id: "maestros", sec: "maestros", accion: "Cargar maestras", titulo: "Cargar a las maestras",
      hecho: d.maestros > 0, detalle: d.maestros > 0 ? plural(d.maestros, "docente", "docentes") : "Con su mail, para darles acceso",
    },
    {
      id: "horarios", sec: "horarios", accion: "Cargar horarios", titulo: "Armar el horario de cada curso",
      hecho: hayCursos && d.cursosSinHorario === 0,
      detalle: !hayCursos ? "Primero los cursos" : d.cursosSinHorario == null ? "" : d.cursosSinHorario ? plural(d.cursosSinHorario, "curso sin horario", "cursos sin horario") : "Todos los cursos tienen horario",
    },
    {
      id: "familias", sec: "importar", accion: "Importar alumnos", titulo: "Cargar alumnos y familias",
      hecho: d.alumnos > 0 && d.alumnosSinApoderado === 0,
      detalle: !(d.alumnos > 0) ? "Desde un Excel, con sus apoderados" : d.alumnosSinApoderado ? plural(d.alumnosSinApoderado, "alumno sin apoderado", "alumnos sin apoderado") : plural(d.alumnos, "alumno con su familia", "alumnos con su familia"),
    },
    {
      id: "invitar", sec: "adopcion", accion: "Ver quién entró", titulo: "Que las familias entren a la app",
      // Hecho cuando entró al menos la mitad: el resto suele llegar solo.
      hecho: d.familias > 0 && d.familiasConApp * 2 >= d.familias,
      detalle: !(d.familias > 0) ? "Cuando estén cargadas, avisales que bajen tribbu y entren con “¿Olvidaste tu contraseña?”"
        : `${d.familiasConApp || 0} de ${d.familias} familias ya tienen la app`,
    },
  ];
}

/** { hechos, total, completo } */
export function progresoPasos(pasos) {
  const hechos = pasos.filter((p) => p.hecho).length;
  return { hechos, total: pasos.length, completo: hechos === pasos.length };
}

/** Clave para "Ocultar" la tarjeta (por usuario y colegio, en el almacenamiento local). */
export const CLAVE_PASOS_OCULTOS = (userId, colegioId) => `primeros_pasos_ocultos_${userId}_${colegioId}`;
