// Página de Configuración del panel del colegio (web + mobile,
// @shared/configuracionPanel). En vez de 10 pestañas en fila, tarjetas
// agrupadas con una línea de estado; al entrar a una se vuelve con
// "‹ Configuración". Puro: cada plataforma cuenta los datos y los pasa.

export const GRUPOS_CONFIG = [
  { titulo: "Estructura del año", items: ["importar", "cursos", "horarios", "materias"] },
  { titulo: "Personal", items: ["maestros", "directivos"] },
  { titulo: "Colegio", items: ["colegio", "menu", "uniformes"] },
  { titulo: "Otros", items: ["adopcion", "promocion"] },
];

export const DESC_CONFIG = {
  importar: "Cargar alumnos y familias, horarios o menú desde Excel",
  cursos: "Los cursos de cada año lectivo",
  horarios: "El horario semanal de cada curso",
  materias: "Las materias que se dan en el colegio",
  maestros: "Docentes, sus clases y su acceso a tribbu",
  directivos: "Administradores y directivos por nivel",
  colegio: "Contacto del colegio y membrete de los comunicados",
  menu: "El menú del comedor, desde un Excel mensual",
  uniformes: "Las prendas del uniforme por curso",
  adopcion: "Cuántas familias usan la app",
  promocion: "Pasar a los alumnos al año siguiente (una vez por año)",
};

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Línea de estado de una tarjeta. `d`: { cursos, cursosSinHorario (null =
 * cargando), maestros, directivos, membreteListo }. Devuelve { texto, alerta }
 * o null si esa tarjeta no muestra estado.
 */
export function estadoConfig(id, d = {}) {
  switch (id) {
    case "cursos":
      return d.cursos == null ? null : d.cursos ? { texto: plural(d.cursos, "curso este año", "cursos este año") } : { texto: "Todavía no hay cursos", alerta: true };
    case "horarios":
      if (d.cursosSinHorario == null || !d.cursos) return null;
      return d.cursosSinHorario ? { texto: plural(d.cursosSinHorario, "curso sin horario", "cursos sin horario"), alerta: true } : { texto: "Todos los cursos tienen horario" };
    case "maestros":
      return d.maestros == null ? null : d.maestros ? { texto: plural(d.maestros, "docente", "docentes") } : { texto: "Todavía no hay docentes", alerta: true };
    case "directivos":
      return d.directivos == null ? null : { texto: plural(d.directivos, "persona", "personas") };
    case "colegio":
      return d.membreteListo == null ? null : d.membreteListo ? { texto: "Membrete listo" } : { texto: "Falta el membrete", alerta: true };
    default:
      return null;
  }
}

/** Grupos con solo las pantallas que esta persona puede ver (`visibles`: Set de ids). */
export const gruposVisibles = (visibles) =>
  GRUPOS_CONFIG.map((g) => ({ ...g, items: g.items.filter((id) => visibles.has(id)) })).filter((g) => g.items.length);
