// Modelo del Excel del menú del comedor (web + mobile, @shared/menuExcel):
// las mismas columnas que lee la carga (UploadMenuExcel en
// src/features/comedor y mobile/features/comedor). Prellenado con el menú ya
// cargado del mes o, si no hay nada, con una semana de ejemplo.

export const COLUMNAS_MENU = ["Fecha", "Entrada", "Plato 1", "Plato 2", "Plato 3", "Postre 1", "Postre 2", "Etiquetas", "Notas"];

const dd = (n) => String(n).padStart(2, "0");
const aTexto = (ymd) => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${y}`; };
const ymdDe = (d) => `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;

/** Primer y último día del mes de `hoy` ("aaaa-mm-dd"). */
export function rangoMes(hoy) {
  const [y, m] = hoy.split("-").map(Number);
  return { desde: `${y}-${dd(m)}-01`, hasta: ymdDe(new Date(y, m, 0)) };
}

const EJEMPLO = [
  ["Ensalada de zanahoria", "Milanesa de pollo", "Tarta de verdura", "Puré de calabaza", "Fruta de estación", "", "", ""],
  ["", "Fideos con salsa", "Fideos con manteca", "", "Flan", "Gelatina", "Vegetariano", ""],
  ["Sopa de verduras", "Pastel de papa", "", "Ensalada mixta", "Fruta de estación", "", "", "Contiene huevo"],
  ["", "Pollo al horno", "Omelette", "Arroz", "Yogur", "", "Sin TACC", ""],
  ["Ensalada de tomate", "Pizza casera", "", "", "Fruta de estación", "", "", ""],
];

/**
 * Filas del modelo: el menú cargado (`menus` = filas de la tabla menu) o, si
 * no hay, la semana hábil siguiente a `hoy` con platos de ejemplo.
 */
export function filasModeloMenu(menus = [], hoy) {
  if (menus.length) {
    const porFecha = new Map();
    for (const m of [...menus].sort((a, b) => a.fecha.localeCompare(b.fecha))) if (!porFecha.has(m.fecha)) porFecha.set(m.fecha, m);
    return [...porFecha.values()].map((m) => ({
      Fecha: aTexto(m.fecha), Entrada: m.entrada || "", "Plato 1": m.plato || "", "Plato 2": m.plato2 || "", "Plato 3": m.acompanamiento || "",
      "Postre 1": m.postre || "", "Postre 2": m.postre2 || "", Etiquetas: (m.etiquetas || []).join("; "), Notas: m.notas || "",
    }));
  }
  const [y, mo, d] = hoy.split("-").map(Number);
  const lunes = new Date(y, mo - 1, d);
  lunes.setDate(lunes.getDate() + ((8 - lunes.getDay()) % 7 || 7)); // próximo lunes
  return EJEMPLO.map((e, i) => {
    const f = new Date(lunes); f.setDate(lunes.getDate() + i);
    const [entrada, p1, p2, p3, po1, po2, etiq, notas] = e;
    return { Fecha: aTexto(ymdDe(f)), Entrada: entrada, "Plato 1": p1, "Plato 2": p2, "Plato 3": p3, "Postre 1": po1, "Postre 2": po2, Etiquetas: etiq, Notas: notas };
  });
}

const claveNiveles = (n) => (n && n.length ? [...n].sort().join(",") : "");

/**
 * Lee el menú del mes de `hoy` del colegio (los mismos niveles si los hay) y
 * devuelve las filas del modelo. `supabase` se inyecta por plataforma.
 */
export async function filasModeloMenuDe(supabase, { colegioId, niveles = null, hoy }) {
  if (!colegioId) return filasModeloMenu([], hoy);
  const { desde, hasta } = rangoMes(hoy);
  const { data } = await supabase.from("menu")
    .select("fecha, niveles, entrada, plato, plato2, acompanamiento, postre, postre2, etiquetas, notas")
    .eq("colegio_id", colegioId).gte("fecha", desde).lte("fecha", hasta);
  const todos = data || [];
  const mismos = todos.filter((m) => claveNiveles(m.niveles) === claveNiveles(niveles));
  return filasModeloMenu(mismos.length ? mismos : todos, hoy);
}
