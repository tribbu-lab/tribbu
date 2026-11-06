// src/lib/listasCurso.js — Útiles y libros de cada curso (web y app,
// @shared/listasCurso). Los carga el colegio desde su panel; las familias los
// ven, los descargan y marcan lo que ya tienen (supabase/listas-solo-colegio.sql).
// Cada curso es de un año lectivo, así que la lista es por curso y ciclo.
import { safeUrl } from "./helpers";

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

// ── Carga por Excel (web y app): cada plataforma lee el archivo y dibuja la
// vista previa; qué entra y qué se escribe se decide acá.

// Columna del Excel → campo de la tabla. "Nombre" es la clave: una fila con el
// mismo nombre que un ítem del curso lo actualiza (y conserva las marcas de las
// familias y la tapa del libro).
const CAMPOS_EXCEL = {
  utiles: { "Categoría": "categoria", Nombre: "item", Cantidad: "cantidad", Comentario: "comentario" },
  libros: { Materia: "materia", Nombre: "nombre", Editorial: "editorial", "Link de descarga": "url_descarga" },
};
export const COLUMNAS_LISTA = {
  utiles: ["Curso", ...Object.keys(CAMPOS_EXCEL.utiles)],
  libros: ["Curso", ...Object.keys(CAMPOS_EXCEL.libros)],
};
const EJEMPLOS = {
  utiles: [
    { "Categoría": "Papelería", Nombre: "Cuaderno rayado", Cantidad: "2", Comentario: "Tapa dura, forrado" },
    { "Categoría": "Cartuchera", Nombre: "Lápiz negro", Cantidad: "3", Comentario: "" },
  ],
  libros: [
    { Materia: "Matemática", Nombre: "Matemática 3", Editorial: "Santillana", "Link de descarga": "" },
    { Materia: "Lengua", Nombre: "Prácticas del lenguaje 3", Editorial: "Kapelusz", "Link de descarga": "" },
  ],
};

const textoCelda = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const claveTexto = (v) => textoCelda(v).toLowerCase();
const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Modelo: lo ya cargado en esos cursos o, si no hay nada, un ejemplo. */
export function filasModeloLista(tipo, filas, cursos) {
  const { grupo, clave } = LISTAS[tipo];
  const campos = Object.entries(CAMPOS_EXCEL[tipo]);
  const nombre = new Map((cursos || []).map((c) => [c.id, c.nombre]));
  const orden = (f) => [nombre.get(f.curso_id) || "", f[grupo] || "", f[clave] || ""];
  const propias = (filas || [])
    .filter((f) => nombre.has(f.curso_id))
    .sort((a, b) => {
      const [x, y] = [orden(a), orden(b)];
      return x[0].localeCompare(y[0], "es") || x[1].localeCompare(y[1], "es") || x[2].localeCompare(y[2], "es");
    });
  if (!propias.length) return EJEMPLOS[tipo].map((e) => ({ Curso: cursos?.[0]?.nombre || "", ...e }));
  return propias.map((f) => ({
    Curso: nombre.get(f.curso_id),
    ...Object.fromEntries(campos.map(([col, campo]) => [col, f[campo] || ""])),
  }));
}

/** Lo que ya tienen esos cursos, para el modelo y para comparar al subir. */
export async function existentesDeLista(supabase, tipo, cursoIds) {
  if (!cursoIds.length) return [];
  const columnas = `id,curso_id,${Object.values(CAMPOS_EXCEL[tipo]).join(",")}`;
  const { data, error } = await supabase.from(LISTAS[tipo].tabla).select(columnas).in("curso_id", cursoIds);
  if (error) throw error;
  return data || [];
}

/**
 * Lee las filas del Excel. Devuelve { nuevos, actualizar, sobran, sinCambios,
 * errores, cursoIds }: `sobran` son los ítems de esos cursos que no están en el
 * archivo (solo se borran si el colegio lo elige). `cursoPorDefecto`: el curso
 * para las filas sin columna Curso.
 */
export function leerLista(tipo, filas, { cursos = [], existentes = [], cursoPorDefecto = null } = {}) {
  const campos = Object.entries(CAMPOS_EXCEL[tipo]);
  const { clave } = LISTAS[tipo];
  const cursoDe = new Map(cursos.flatMap((c) => [[claveTexto(String(c.nombre).split(" - ")[0]), c.id], [claveTexto(c.nombre), c.id]]));
  const previos = new Map(existentes.map((e) => [`${e.curso_id}|${claveTexto(e[clave])}`, e]));
  const nuevos = [], actualizar = [], errores = [];
  const enArchivo = new Set(), cursoIds = new Set();
  let sinCambios = 0;

  filas.forEach((r, i) => {
    const fila = i + 2; // fila 1 = encabezados
    const v = (k) => textoCelda(r[k] ?? r[sinTildes(k)] ?? "");
    if (!COLUMNAS_LISTA[tipo].some((k) => v(k))) return; // fila vacía
    const nombreCurso = v("Curso");
    const curso_id = nombreCurso ? cursoDe.get(claveTexto(nombreCurso)) : cursoPorDefecto;
    const nombre = v("Nombre");
    const claveFila = `${curso_id}|${claveTexto(nombre)}`;
    const repetida = enArchivo.has(claveFila);
    // Se anota aunque la fila tenga otro error: un ítem con el link mal escrito
    // no cuenta como "no está en el archivo" y no se ofrece para borrar.
    if (curso_id && nombre) enArchivo.add(claveFila);

    const item = { curso_id };
    campos.forEach(([col, campo]) => { item[campo] = v(col) || null; });
    const link = item.url_descarga ? safeUrl(item.url_descarga) : null;
    const motivo = !nombreCurso && !cursoPorDefecto ? "Falta el curso"
      : !curso_id ? `No existe el curso "${nombreCurso}" en este ciclo lectivo`
      : !nombre ? "Falta el nombre"
      : repetida ? "Está repetido en el archivo"
      : item.url_descarga && !link ? "El link de descarga no es válido"
      : null;
    if (motivo) { errores.push({ fila, motivo }); return; }
    if (item.url_descarga) item.url_descarga = link;

    cursoIds.add(curso_id);
    const previo = previos.get(claveFila);
    if (!previo) nuevos.push(item);
    else if (campos.some(([, campo]) => (previo[campo] || null) !== item[campo])) actualizar.push({ ...item, id: previo.id });
    else sinCambios += 1;
  });

  const sobran = existentes
    .filter((e) => cursoIds.has(e.curso_id) && !enArchivo.has(`${e.curso_id}|${claveTexto(e[clave])}`))
    .map((e) => e.id);
  return { nuevos, actualizar, sobran, sinCambios, errores, cursoIds: [...cursoIds] };
}

/** Escribe lo leído. Devuelve el error o null; borrar va último, por si algo falla antes. */
export async function aplicarLista(supabase, tipo, leido, { borrarSobrantes = false } = {}) {
  const t = () => supabase.from(LISTAS[tipo].tabla);
  if (leido.nuevos.length) {
    const { error } = await t().insert(leido.nuevos);
    if (error) return error;
  }
  if (leido.actualizar.length) {
    const { error } = await t().upsert(leido.actualizar, { onConflict: "id" });
    if (error) return error;
  }
  if (borrarSobrantes && leido.sobran.length) {
    const { error } = await t().delete().in("id", leido.sobran);
    if (error) return error;
  }
  return null;
}

const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Resumen para la vista previa, igual en web y app. */
export const resumenLectura = (leido) =>
  [
    leido.nuevos.length ? cuantos(leido.nuevos.length, "nuevo", "nuevos") : null,
    leido.actualizar.length ? `${leido.actualizar.length} para actualizar` : null,
    leido.sinCambios ? `${leido.sinCambios} sin cambios` : null,
  ].filter(Boolean).join(" · ");

/** Hay algo para escribir (con o sin borrar lo que sobra). */
export const hayParaCargar = (leido, borrarSobrantes) =>
  !!leido && (leido.nuevos.length > 0 || leido.actualizar.length > 0 || (borrarSobrantes && leido.sobran.length > 0));

/** Mensaje al terminar. */
export const textoCargado = (leido, borrarSobrantes) => {
  const borrados = borrarSobrantes ? leido.sobran.length : 0;
  return [
    leido.nuevos.length ? cuantos(leido.nuevos.length, "ítem nuevo", "ítems nuevos") : null,
    leido.actualizar.length ? cuantos(leido.actualizar.length, "actualizado", "actualizados") : null,
    borrados ? cuantos(borrados, "borrado", "borrados") : null,
  ].filter(Boolean).join(", ");
};
