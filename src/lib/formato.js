// src/lib/formato.js — formato liviano para comunicados (specs/comunicados-con-formato.md).
// Puro, compartido por web y mobile (@shared/formato). El texto se guarda como
// Markdown acotado en recordatorios.texto (sigue siendo texto: un aviso viejo
// se ve igual) y se dibuja desde NODOS, nunca como HTML.
//
// Soportado: **negrita**, _cursiva_, "## Título", listas "- " / "1. ",
// [texto](https://…) y links sueltos https://…; saltos de línea.

const RE_TITULO = /^#{1,3}\s+(.*)$/;
const RE_VINETA = /^\s*[-*•]\s+(.*)$/;
const RE_NUMERO = /^\s*(\d+)[.)]\s+(.*)$/;

const finPalabra = (c) => c === undefined || /[\s.,;:!?)\]"'»]/.test(c);
const inicioPalabra = (c) => c === undefined || /[\s(["'«]/.test(c);

/**
 * Una línea → partes: [{ t: "texto", v, b?, i? } | { t: "link", v, url, b?, i? }].
 * `b` = negrita, `i` = cursiva. Las marcas sin cerrar quedan como texto.
 */
export function partesDeLinea(linea, estilo = {}) {
  const partes = [];
  let buf = "";
  const volcar = () => { if (buf) { partes.push({ t: "texto", v: buf, ...estilo }); buf = ""; } };
  let i = 0;
  while (i < linea.length) {
    const resto = linea.slice(i);
    // **negrita**
    if (resto.startsWith("**")) {
      const fin = linea.indexOf("**", i + 2);
      if (fin > i + 2) {
        volcar();
        partes.push(...partesDeLinea(linea.slice(i + 2, fin), { ...estilo, b: true }));
        i = fin + 2;
        continue;
      }
    }
    // _cursiva_ (solo entre límites de palabra: "nombre_de_usuario" no se toca)
    if (linea[i] === "_" && inicioPalabra(linea[i - 1])) {
      const fin = linea.indexOf("_", i + 1);
      if (fin > i + 1 && finPalabra(linea[fin + 1]) && !/\s/.test(linea[i + 1])) {
        volcar();
        partes.push(...partesDeLinea(linea.slice(i + 1, fin), { ...estilo, i: true }));
        i = fin + 1;
        continue;
      }
    }
    // [texto](url)
    const m = resto.match(/^\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/i);
    if (m) {
      volcar();
      partes.push({ t: "link", v: m[1], url: m[2], ...estilo });
      i += m[0].length;
      continue;
    }
    // https://… suelto
    const u = inicioPalabra(linea[i - 1]) ? resto.match(/^https?:\/\/[^\s<>]+[^\s<>.,;:!?)\]"']/i) : null;
    if (u) {
      volcar();
      partes.push({ t: "link", v: u[0], url: u[0], ...estilo });
      i += u[0].length;
      continue;
    }
    buf += linea[i];
    i += 1;
  }
  volcar();
  return partes;
}

/**
 * Texto → bloques: { tipo: "titulo" | "parrafo", partes } y
 * { tipo: "lista", numerada, inicio, items: [partes] }. Un párrafo junta las
 * líneas seguidas (cada una en `lineas`, para respetar los saltos).
 */
export function bloquesDeTexto(texto) {
  const bloques = [];
  let actual = null;
  for (const cruda of String(texto || "").replace(/\r\n?/g, "\n").split("\n")) {
    const linea = cruda.replace(/\s+$/, "");
    if (!linea.trim()) { actual = null; continue; }
    const t = linea.match(RE_TITULO);
    if (t) { bloques.push({ tipo: "titulo", partes: partesDeLinea(t[1]) }); actual = null; continue; }
    const v = linea.match(RE_VINETA);
    const n = v ? null : linea.match(RE_NUMERO);
    if (v || n) {
      const numerada = !!n;
      if (!actual || actual.tipo !== "lista" || actual.numerada !== numerada) {
        actual = { tipo: "lista", numerada, inicio: n ? Number(n[1]) : 1, items: [] };
        bloques.push(actual);
      }
      actual.items.push(partesDeLinea(v ? v[1] : n[2]));
      continue;
    }
    if (!actual || actual.tipo !== "parrafo") {
      actual = { tipo: "parrafo", lineas: [] };
      bloques.push(actual);
    }
    actual.lineas.push(partesDeLinea(linea));
  }
  return bloques;
}

/** ¿Tiene alguna marca de formato? (para no cambiar nada en los avisos viejos). */
export const tieneFormato = (texto) => {
  const s = String(texto || "");
  return /\*\*[^*]+\*\*/.test(s) || /(^|\s)_[^_\s][^_]*_(?=$|[\s.,;:!?)])/.test(s) || /\[[^\]]+\]\([^)]+\)/.test(s) || /^#{1,3}\s/m.test(s) || /^\s*([-*•]|\d+[.)])\s/m.test(s);
};

/** Sin marcas (push, calendario, vistas previas, búsqueda). Los links quedan como su texto. */
export function textoPlano(texto) {
  return String(texto || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/gm, "$1$2")
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, "$1");
}

// ── Editor: botones que insertan la marca alrededor de lo seleccionado ──────

/**
 * Aplica una marca al texto con la selección [desde, hasta). Devuelve
 * { texto, desde, hasta } con la selección nueva (sobre lo marcado).
 * tipo: "negrita" | "cursiva" | "titulo" | "lista" | "numerada" | "link".
 */
export function aplicarMarca(texto, desde, hasta, tipo, url = "") {
  const s = String(texto || "");
  const a = Math.max(0, Math.min(desde ?? s.length, s.length));
  const b = Math.max(a, Math.min(hasta ?? a, s.length));
  const sel = s.slice(a, b);
  const envolver = (izq, der, relleno) => {
    const medio = sel || relleno;
    return { texto: s.slice(0, a) + izq + medio + der + s.slice(b), desde: a + izq.length, hasta: a + izq.length + medio.length };
  };
  if (tipo === "negrita") return envolver("**", "**", "texto");
  if (tipo === "cursiva") return envolver("_", "_", "texto");
  if (tipo === "link") {
    const medio = sel || "texto del link";
    const destino = url || "https://";
    const nuevo = `[${medio}](${destino})`;
    // Sin url: queda seleccionada la dirección, para escribirla ahí mismo.
    const iniUrl = a + medio.length + 3;
    return url
      ? { texto: s.slice(0, a) + nuevo + s.slice(b), desde: a + 1, hasta: a + 1 + medio.length }
      : { texto: s.slice(0, a) + nuevo + s.slice(b), desde: iniUrl, hasta: iniUrl + destino.length };
  }
  // Por línea: título y listas se aplican a cada línea tocada por la selección.
  const ini = s.lastIndexOf("\n", a - 1) + 1;
  const finIdx = s.indexOf("\n", b);
  const fin = finIdx === -1 ? s.length : finIdx;
  const lineas = s.slice(ini, fin).split("\n");
  const limpiar = (l) => l.replace(RE_TITULO, "$1").replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+[.)]\s+/, "");
  const nuevas = lineas.map((l, k) => {
    const base = limpiar(l);
    if (tipo === "titulo") return RE_TITULO.test(l) ? base : `## ${base}`;
    if (tipo === "lista") return RE_VINETA.test(l) ? base : `- ${base}`;
    if (tipo === "numerada") return RE_NUMERO.test(l) ? base : `${k + 1}. ${base}`;
    return l;
  });
  const bloque = nuevas.join("\n");
  return { texto: s.slice(0, ini) + bloque + s.slice(fin), desde: ini, hasta: ini + bloque.length };
}

export const BOTONES_FORMATO = [
  { tipo: "negrita", l: "B", etiqueta: "Negrita" },
  { tipo: "cursiva", l: "I", etiqueta: "Cursiva" },
  { tipo: "titulo", l: "Título", etiqueta: "Título" },
  { tipo: "lista", l: "• Lista", etiqueta: "Lista con viñetas" },
  { tipo: "numerada", l: "1. Lista", etiqueta: "Lista numerada" },
  { tipo: "link", l: "Link", etiqueta: "Link" },
];

// ── Membrete ────────────────────────────────────────────────────────────────

/**
 * Membrete de un comunicado del colegio: { nombre, logo, linea, firma }.
 * `colegio` = fila de colegios (nombre, logo_url, membrete_linea,
 * membrete_firma, membrete_niveles = { primaria: { linea, firma } }); `nivel`
 * = el del curso del aviso. Lo del nivel pisa lo general cuando está cargado.
 */
export function membreteDe(colegio, nivel) {
  if (!colegio) return null;
  const delNivel = (nivel && colegio.membrete_niveles?.[nivel]) || {};
  const limpio = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    nombre: colegio.nombre || "",
    logo: colegio.logo_url || null,
    linea: limpio(delNivel.linea) || limpio(colegio.membrete_linea),
    firma: limpio(delNivel.firma) || limpio(colegio.membrete_firma),
  };
}
