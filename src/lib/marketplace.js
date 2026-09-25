// src/lib/marketplace.js — Marketplace de cosas usadas (sección Comunidad),
// lógica pura compartida por web y mobile (@shared/marketplace). Ver
// specs/marketplace.md y supabase/marketplace.sql.

export const CATEGORIAS = [
  { k: "uniformes", l: "Uniformes", e: "👕" },
  { k: "libros", l: "Libros", e: "📚" },
  { k: "utiles", l: "Útiles", e: "✏️" },
  { k: "ropa", l: "Ropa", e: "🧥" },
  { k: "disfraces", l: "Disfraces", e: "🎭" },
  { k: "juguetes", l: "Juguetes", e: "🧸" },
  { k: "otro", l: "Otro", e: "📦" },
];
export const categoria = (k) => CATEGORIAS.find((c) => c.k === k) || CATEGORIAS[CATEGORIAS.length - 1];

export const CONDICIONES = [
  { k: "nuevo", l: "Nuevo" },
  { k: "como_nuevo", l: "Como nuevo" },
  { k: "usado", l: "Usado" },
];
export const condicion = (k) => CONDICIONES.find((c) => c.k === k) || CONDICIONES[CONDICIONES.length - 1];

export const DIAS_VIGENCIA = 60;
/** Lo vendido se sigue mostrando unos días (marcado) para que se vea que salió. */
export const DIAS_VENDIDO_VISIBLE = 7;
export const MAX_FOTOS = 3;

const DIA = 86400000;

/** Disponible y sin vencer: se puede marcar "Me interesa". */
export const estaDisponible = (a, ahora = new Date()) => a.estado === "disponible" && new Date(a.vence_en) > ahora;

/** Se lista: disponible y vigente, o vendido hace menos de DIAS_VENDIDO_VISIBLE. */
export const estaVisible = (a, ahora = new Date()) =>
  a.estado === "vendido"
    ? !!a.vendido_en && ahora - new Date(a.vendido_en) <= DIAS_VENDIDO_VISIBLE * DIA
    : new Date(a.vence_en) > ahora;

/** Disponibles primero (más nuevos arriba), vendidos al final. */
export const ordenar = (articulos) =>
  [...articulos].sort((a, b) => (a.estado === "vendido") - (b.estado === "vendido") || new Date(b.creado_en) - new Date(a.creado_en));

/** "$ 15.000" o "🎁 Lo regalo". */
export const fmtPrecio = (a) =>
  a.es_regalo ? "🎁 Lo regalo" : `${a.moneda || "$"} ${Number(a.precio || 0).toLocaleString("es-AR")}`;

/** Días que le quedan antes de vencer (para "vence en N días" al que publicó). */
export const diasParaVencer = (a, ahora = new Date()) => Math.ceil((new Date(a.vence_en) - ahora) / DIA);

/** Búsqueda simple sin acentos sobre título, descripción y talle. */
const normalizar = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const coincideBusqueda = (a, q) => {
  const n = normalizar(q).trim();
  if (!n) return true;
  return normalizar(`${a.titulo} ${a.descripcion || ""} ${a.talle || ""}`).includes(n);
};

/** Filtro .or() de PostgREST: lo de estos cursos + lo de alcance colegio en sus colegios. */
export const filtroAlcance = (cursoIds, colegioIds) =>
  [`curso_id.in.(${cursoIds.join(",")})`, ...(colegioIds.length ? [`and(alcance.eq.colegio,colegio_id.in.(${colegioIds.join(",")}))`] : [])].join(",");
