// src/lib/listasCurso.js — Útiles y libros de cada curso (web y app,
// @shared/listasCurso). Los carga el colegio desde su panel; las familias los
// ven, los descargan y marcan lo que ya tienen (supabase/listas-solo-colegio.sql).
// Cada curso es de un año lectivo, así que la lista es por curso y ciclo.

export const LISTAS = {
  utiles: {
    tabla: "utiles",
    clave: "item",
    grupo: "categoria",
    sinGrupo: "Sin categoría",
    titulo: "Lista de útiles",
    columnas: "item,obligatorio,categoria,cantidad,comentario",
  },
  libros: {
    tabla: "libros",
    clave: "nombre",
    grupo: "materia",
    sinGrupo: "Sin materia",
    titulo: "Lista de libros",
    columnas: "nombre,obligatorio,editorial,materia,imagen_url,url_descarga",
  },
};

/** Fila de `utiles` a partir del formulario. */
export const armarUtil = (form, cursoId) => ({
  item: (form.item || "").trim(),
  categoria: form.categoria || null,
  cantidad: form.cantidad || null,
  comentario: form.comentario || null,
  curso_id: form.curso_id || cursoId,
});

/** Fila de `libros` a partir del formulario (la tapa la sube cada plataforma). */
export const armarLibro = (form, cursoId, imagen_url = form.imagen_url || null) => ({
  nombre: (form.nombre || "").trim(),
  editorial: form.editorial || null,
  materia: form.materia || null,
  url_descarga: form.url_descarga || null,
  imagen_url,
  curso_id: form.curso_id || cursoId,
});

const normalizar = (s) => String(s || "").trim().toLowerCase();

/**
 * Filas a insertar al copiar una lista a otros cursos: una por cada curso de
 * destino, sin repetir lo que ese curso ya tiene (mismo nombre, sin distinguir
 * mayúsculas). `existentes`: filas de los destinos, con curso_id y la clave.
 */
export function filasParaCopiar(tipo, origen, existentes, destinoIds) {
  const { clave } = LISTAS[tipo];
  const yaEstan = new Set((existentes || []).map((f) => `${f.curso_id}|${normalizar(f[clave])}`));
  return destinoIds.flatMap((curso_id) =>
    (origen || [])
      .filter((f) => !yaEstan.has(`${curso_id}|${normalizar(f[clave])}`))
      .map((f) => ({ ...f, curso_id }))
  );
}

/** Copia la lista de un curso a otros. Devuelve { agregados, error }. */
export async function copiarLista(supabase, tipo, origenId, destinoIds) {
  const { tabla, clave, columnas } = LISTAS[tipo];
  const [origen, destinos] = await Promise.all([
    supabase.from(tabla).select(columnas).eq("curso_id", origenId),
    supabase.from(tabla).select(`curso_id,${clave}`).in("curso_id", destinoIds),
  ]);
  const error = origen.error || destinos.error;
  if (error) return { agregados: 0, error };
  const filas = filasParaCopiar(tipo, origen.data, destinos.data, destinoIds);
  if (!filas.length) return { agregados: 0, error: null };
  const res = await supabase.from(tabla).insert(filas);
  return { agregados: res.error ? 0 : filas.length, error: res.error || null };
}

/** Años lectivos con cursos, el más nuevo primero. */
export const aniosDeCursos = (cursos) =>
  [...new Set((cursos || []).map((c) => c.año_lectivo).filter(Boolean))].sort((a, b) => b - a);

/**
 * Cursos a los que se puede copiar: los del mismo año o de años siguientes (la
 * lista del año pasado sirve de base para el nuevo; al revés no tiene sentido).
 * Si el curso es de otro año, el año va en el nombre para no confundirlos.
 */
export const destinosDeCopia = (cursos, origen) =>
  (cursos || [])
    .filter((c) => c.id !== origen?.id && c.año_lectivo >= origen?.año_lectivo)
    .sort((a, b) => a.año_lectivo - b.año_lectivo || String(a.nombre).localeCompare(String(b.nombre), "es"))
    .map((c) => (c.año_lectivo === origen?.año_lectivo ? c : { ...c, nombre: `${c.nombre} · ${c.año_lectivo}` }));

const lineaDe = (tipo, f) =>
  tipo === "utiles"
    ? [f.item, f.cantidad, f.comentario].filter(Boolean).join(" · ")
    : [f.nombre, f.editorial, f.url_descarga].filter(Boolean).join(" · ");

/**
 * La lista en texto, agrupada, para descargarla desde la app. `nombreCurso`
 * (curso_id → nombre o null): si devuelve nombres de más de un curso (vista
 * "Todos"), separa también por curso.
 */
export function textoLista(tipo, filas, nombreCurso) {
  const { grupo, sinGrupo, titulo } = LISTAS[tipo];
  const bloque = (lista) => {
    const grupos = {};
    lista.forEach((f) => { (grupos[f[grupo] || sinGrupo] ||= []).push(f); });
    return Object.keys(grupos)
      .sort((a, b) => (a === sinGrupo ? 1 : b === sinGrupo ? -1 : a.localeCompare(b, "es")))
      .map((g) => `${g.toUpperCase()}\n${grupos[g].map((f) => `- ${lineaDe(tipo, f)}`).join("\n")}`)
      .join("\n\n");
  };
  const cursoIds = [...new Set((filas || []).map((f) => f.curso_id))];
  const cuerpo = cursoIds
    .map((id) => {
      const nombre = nombreCurso?.(id);
      return nombre ? `${nombre}\n\n${bloque(filas.filter((f) => f.curso_id === id))}` : bloque(filas.filter((f) => f.curso_id === id));
    })
    .join("\n\n\n");
  return `${titulo}\n\n${cuerpo}\n`;
}
