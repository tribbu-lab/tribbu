// src/lib/perdidos.js — Perdidos y encontrados, lógica pura compartida por web
// y mobile (@shared/perdidos). Ver specs/perdidos-y-encontrados.md.

export const CATEGORIAS = [
  { k: "ropa", l: "Ropa", e: "🧥" },
  { k: "mochila", l: "Mochila", e: "🎒" },
  { k: "lonchera", l: "Lonchera", e: "🍱" },
  { k: "botella", l: "Botella", e: "🧴" },
  { k: "utiles", l: "Útiles", e: "✏️" },
  { k: "anteojos", l: "Anteojos", e: "👓" },
  { k: "juguete", l: "Juguete", e: "🧸" },
  { k: "otro", l: "Otro", e: "📦" },
];
export const categoria = (k) => CATEGORIAS.find((c) => c.k === k) || CATEGORIAS[CATEGORIAS.length - 1];

export const DIAS_VIGENCIA = 30;

/** Abierta y sin vencer. */
export const estaVigente = (o, ahora = new Date()) => o.estado === "abierto" && new Date(o.vence_en) > ahora;

// Categorías tan específicas que coincidir en la categoría ya alcanza para
// sugerir (una lonchera es una lonchera); en ropa/útiles/otro hace falta
// además alguna palabra en común ("campera", "azul", un nombre...).
const CATEGORIAS_ESPECIFICAS = new Set(["mochila", "lonchera", "botella", "anteojos"]);
const VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "con", "sin", "y", "o", "en", "del", "al", "a",
  "que", "se", "mi", "su", "tu", "es", "por", "para", "muy", "mas", "perdi", "perdida", "perdido", "encontre",
  "encontrada", "encontrado", "hijo", "hija", "nene", "nena", "talle",
]);

/** "Campera AZUL, talle 8" → ["campera", "azul", "8"] (sin tildes ni palabras vacías). */
export const palabrasClave = (texto) =>
  (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca tildes (marcas combinantes tras NFD)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => (p.length >= 2 || /^\d+$/.test(p)) && !VACIAS.has(p)); // los números (talle, edad) sí cuentan

// ¿Las dos publicaciones las ve la misma gente? Mismo curso, o alguna es de
// alcance colegio dentro del mismo colegio.
const alcanceCompartido = (a, b) =>
  a.colegio_id === b.colegio_id && (a.alcance === "colegio" || b.alcance === "colegio" || (a.curso_id && a.curso_id === b.curso_id));

const fechaDe = (o) => new Date(o.fecha ? `${o.fecha}T12:00:00` : o.creado_en);

/**
 * Candidatos del tipo opuesto que podrían ser el mismo objeto, del más al
 * menos probable (máximo `max`). Criterio simple y explicable: misma categoría,
 * alcance compartido, fechas a menos de 21 días, y palabras en común (salvo
 * categorías específicas, donde la categoría ya alcanza).
 */
export const coincidencias = (objeto, candidatos, { max = 3, ahora = new Date() } = {}) => {
  const propias = new Set(palabrasClave(`${objeto.titulo} ${objeto.descripcion || ""}`));
  return candidatos
    .filter((c) => c.id !== objeto.id && c.tipo !== objeto.tipo && estaVigente(c, ahora))
    .filter((c) => c.categoria === objeto.categoria && alcanceCompartido(objeto, c))
    .filter((c) => Math.abs(fechaDe(c) - fechaDe(objeto)) <= 21 * 86400000)
    .map((c) => {
      const comunes = palabrasClave(`${c.titulo} ${c.descripcion || ""}`).filter((p) => propias.has(p));
      return { objeto: c, comunes: [...new Set(comunes)] };
    })
    .filter((x) => x.comunes.length > 0 || CATEGORIAS_ESPECIFICAS.has(objeto.categoria))
    .sort((a, b) => b.comunes.length - a.comunes.length || fechaDe(b.objeto) - fechaDe(a.objeto))
    .slice(0, max);
};

/**
 * Filtro .or() de PostgREST para "lo que se ve desde estos cursos": lo de esos
 * cursos + lo de alcance colegio en sus colegios. (La RLS igual lo acota.)
 */
export const filtroAlcance = (cursoIds, colegioIds) =>
  [`curso_id.in.(${cursoIds.join(",")})`, ...(colegioIds.length ? [`and(alcance.eq.colegio,colegio_id.in.(${colegioIds.join(",")}))`] : [])].join(",");

/**
 * Encontrados de la última semana que no publicó el usuario y que nadie
 * reclamó todavía (tarjeta del Muro). `reclamados` = Set de ids con algún
 * "¡Es mío!" (RPC objetos_reclamados): si el dueño ya apareció, no tiene
 * sentido seguir preguntando "¿es de tu hijo?".
 */
export const encontradosDeLaSemana = (objetos, userId, { reclamados = new Set(), ahora = new Date() } = {}) =>
  objetos.filter((o) => o.tipo === "encontrado" && estaVigente(o, ahora) && o.publicado_por !== userId
    && !reclamados.has(o.id) && ahora - new Date(o.creado_en) <= 7 * 86400000).length;

/** Ids (Set) de los objetos que ya tienen algún aviso, sin revelar de quién. */
export async function cargarReclamados(supabase, ids) {
  if (!ids.length) return new Set();
  const { data } = await supabase.rpc("objetos_reclamados", { p_ids: ids });
  return new Set(data || []);
}
