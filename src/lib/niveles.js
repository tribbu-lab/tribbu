// src/lib/niveles.js — niveles del colegio (Inicial / Primaria / Secundaria) y
// rol "Secretaría" (nivel_admin). Puro, compartido por web y mobile
// (@shared/niveles). Ver specs/roles-por-nivel.md y supabase/roles-por-nivel.sql.

export const NIVELES = [
  { k: "inicial", l: "Inicial" },
  { k: "primaria", l: "Primaria" },
  { k: "secundaria", l: "Secundaria" },
];

export const nombreNivel = (k) => NIVELES.find((n) => n.k === k)?.l || "";

/** Niveles en el orden de NIVELES (Inicial, Primaria, Secundaria). */
export const ordenarNiveles = (lista) => NIVELES.map((n) => n.k).filter((k) => (lista || []).includes(k));

/** "Inicial y Primaria". */
export const textoNiveles = (lista) => {
  const nombres = ordenarNiveles(lista).map(nombreNivel);
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : nombres[0] || "";
};

/** Etiqueta del rol: "Secretaría · Primaria". */
export const textoSecretaria = (niveles) => {
  const t = textoNiveles(niveles);
  return t ? `Secretaría · ${t}` : "Secretaría";
};

/** Niveles presentes en una lista de cursos (para mostrar los chips solo si hay más de uno). */
export const nivelesDeCursos = (cursos) => ordenarNiveles([...new Set((cursos || []).map((c) => c.nivel).filter(Boolean))]);

/**
 * Menú del día para un nivel: el que nombra ese nivel; si no hay, el de todos
 * (niveles null/vacío). Sin nivel (curso sin nivel) = el de todos.
 * `filas`: menús de un mismo día (y colegio).
 */
export const menuParaNivel = (filas, nivel) => {
  const generales = (filas || []).filter((m) => !m.niveles?.length);
  const propio = nivel ? (filas || []).find((m) => m.niveles?.includes(nivel)) : null;
  return propio || generales[0] || null;
};

/** Varios días: un menú por fecha según el nivel (ordenado por fecha). */
export const menusParaNivel = (filas, nivel) => {
  const porFecha = new Map();
  for (const m of filas || []) porFecha.set(m.fecha, [...(porFecha.get(m.fecha) || []), m]);
  return [...porFecha.keys()].sort().map((f) => menuParaNivel(porFecha.get(f), nivel)).filter(Boolean);
};

/**
 * Nivel de lo que la familia está mirando (para el menú): el de los cursos en
 * vista si todos comparten uno; si no (vista "Todos" con hijos en Inicial y
 * Primaria) null = el menú general. `items` = "Mi acceso" (items[].cursos.nivel).
 */
export const nivelDeVista = (items, cursoIds) => {
  const niveles = [...new Set((cursoIds || []).map((id) => (items || []).find((i) => i.curso_id === id)?.cursos?.nivel || null))];
  return niveles.length === 1 ? niveles[0] : null;
};

/** Niveles para guardar en menu.niveles: null = todos (vacío o todos los del colegio). */
export const nivelesParaGuardar = (elegidos, delColegio) => {
  const e = ordenarNiveles(elegidos);
  return !e.length || (delColegio?.length && e.length >= delColegio.length) ? null : e;
};
