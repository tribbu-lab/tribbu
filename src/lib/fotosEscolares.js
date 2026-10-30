// Fotos escolares (web + mobile, @shared/fotosEscolares): la Secretaría arma
// una sesión de fotos por curso (como el sobre de la fotógrafa: opciones con
// precio, copias adicionales por tamaño, vencimiento, datos de pago) y cada
// familia hace su pedido. Puro: armado de la sesión, validación, totales,
// estados y qué foto se puede descargar. Tablas, permisos y RPCs en
// supabase/fotos-escolares.sql (el total que vale es el que calcula la base;
// totalPedido es la misma cuenta para mostrarla mientras se elige).

export const BUCKET_FOTOS = "fotos";

const idCorto = () => Math.random().toString(36).slice(2, 8);

/** Opciones del sobre de ejemplo, para no arrancar de cero. */
export const sesionVacia = () => ({
  titulo: "Fotos escolares",
  vence: "",
  datos_pago: "",
  opciones: [
    { id: idCorto(), nombre: "Opción A", incluye: ["1 carpeta contenedora", "1 foto grupal (15x21 cm)", "1 foto individual (15x21 cm)", "4 fotos individuales (5x7 cm)"], precio: 30000, precio_digital: "" },
    { id: idCorto(), nombre: "Opción B", incluye: ["1 carpeta contenedora", "1 foto grupal (15x21 cm)", "1 foto individual (15x21 cm)"], precio: 27000, precio_digital: "" },
  ],
  copias: [
    { id: idCorto(), tamano: "4 x (5x7)", precio: 4000 },
    { id: idCorto(), tamano: "15x21", precio: 5000 },
    { id: idCorto(), tamano: "20x25", precio: 7000 },
  ],
});

export const opcionVacia = (n) => ({ id: idCorto(), nombre: `Opción ${String.fromCharCode(65 + n)}`, incluye: [], precio: "", precio_digital: "" });

const vacio = (v) => v === null || v === undefined || String(v).trim() === "";

/**
 * Precios de una opción por formato: { papel, digital } (null = no se ofrece
 * en ese formato). Con los dos, la familia elige. Las sesiones de antes
 * tenían una casilla `digital` y un solo precio: esas son solo digitales.
 */
export function preciosOpcion(o) {
  if (!o) return { papel: null, digital: null };
  const legado = o.digital && !("precio_digital" in o);
  const num = (v) => (vacio(v) ? null : Number(v));
  return legado ? { papel: null, digital: num(o.precio) } : { papel: num(o.precio), digital: num(o.precio_digital) };
}

/** Formatos que ofrece una opción, para elegir: [{ digital, label, precio }]. */
export const formatosOpcion = (o) => {
  const p = preciosOpcion(o);
  return [
    ...(p.papel !== null ? [{ digital: false, label: "En papel", precio: p.papel }] : []),
    ...(p.digital !== null ? [{ digital: true, label: "Digital", precio: p.digital }] : []),
  ];
};

/** ¿La sesión ofrece algo digital? (para los textos de la familia). */
export const ofreceDigital = (sesion) => (sesion?.opciones || []).some((o) => preciosOpcion(o).digital !== null);

/** Formato del pedido para una opción: el elegido, o el único que hay (null si falta elegir). */
export function formatoDe(opcion, digital) {
  const p = preciosOpcion(opcion);
  if (p.papel !== null && p.digital !== null) return digital === true || digital === false ? digital : null;
  if (p.digital !== null) return true;
  return p.papel !== null ? false : null;
}
export const copiaVacia = () => ({ id: idCorto(), tamano: "", precio: 0 });

/** Copia la configuración (precios, opciones) de otra sesión con ids nuevos. */
export const copiarConfiguracion = (s) => ({
  titulo: s.titulo || "Fotos escolares",
  vence: s.vence || "",
  datos_pago: s.datos_pago || "",
  opciones: (s.opciones || []).map((o) => { const p = preciosOpcion(o); return { id: idCorto(), nombre: o.nombre, incluye: [...(o.incluye || [])], precio: p.papel ?? "", precio_digital: p.digital ?? "" }; }),
  copias: (s.copias || []).map((c) => ({ ...c, id: idCorto() })),
});

const precioValido = (p) => Number.isFinite(Number(p)) && Number(p) >= 0;

/** Primer error del formulario de la sesión (texto para mostrar) o null. */
export function validarSesion(s, hoy) {
  if (!String(s.titulo || "").trim()) return "Poné un título.";
  if (!s.vence) return "Elegí hasta cuándo se pueden pedir.";
  if (hoy && s.vence < hoy) return "El vencimiento no puede ser anterior a hoy.";
  if (!s.opciones?.length && !s.copias?.length) return "Cargá al menos una opción o un tamaño de copia.";
  for (const o of s.opciones || []) {
    if (!String(o.nombre || "").trim()) return "Cada opción necesita un nombre.";
    const p = preciosOpcion(o);
    if (p.papel === null && p.digital === null) return `Poné el precio en papel o digital de ${o.nombre}.`;
    if ((p.papel !== null && !precioValido(p.papel)) || (p.digital !== null && !precioValido(p.digital))) return `Revisá el precio de ${o.nombre}.`;
  }
  for (const c of s.copias || []) {
    if (!String(c.tamano || "").trim()) return "Cada copia adicional necesita un tamaño.";
    if (!precioValido(c.precio)) return `Revisá el precio de la copia ${c.tamano}.`;
  }
  return null;
}

/** Fila para guardar (sanitize lo pasa cada plataforma). */
export function filaSesion(s, { sanitize }) {
  const limpio = (v) => sanitize(String(v || "")).trim();
  return {
    titulo: limpio(s.titulo) || "Fotos escolares",
    vence: s.vence,
    datos_pago: limpio(s.datos_pago) || null,
    opciones: (s.opciones || []).map((o) => {
      const p = preciosOpcion(o);
      return { id: o.id, nombre: limpio(o.nombre), incluye: (o.incluye || []).map(limpio).filter(Boolean), precio: p.papel, precio_digital: p.digital };
    }),
    copias: (s.copias || []).map((c) => ({ id: c.id, tamano: limpio(c.tamano), precio: Number(c.precio) || 0 })),
  };
}

/** ¿Ya pasó el vencimiento? (hoy = "AAAA-MM-DD" local). */
export const sesionVencida = (s, hoy) => !!s?.vence && s.vence < hoy;

/** Total de un pedido en armado: { opcionId, digital, copias: [{copia_id, cantidad}] }. */
export function totalPedido(sesion, { opcionId, digital, copias }) {
  const op = (sesion.opciones || []).find((o) => o.id === opcionId);
  const f = formatoDe(op, digital);
  const p = preciosOpcion(op);
  let total = op && f !== null ? (f ? p.digital : p.papel) || 0 : 0;
  for (const c of copias || []) {
    const cp = (sesion.copias || []).find((x) => x.id === c.copia_id);
    if (cp) total += (Number(cp.precio) || 0) * (Number(c.cantidad) || 0);
  }
  return total;
}

/** Primer error del pedido o null. */
export function validarPedido(sesion, { opcionId, fotoId, digital, copias }) {
  const conCopias = (copias || []).some((c) => Number(c.cantidad) > 0);
  if (!opcionId && !conCopias) return "Elegí una opción o copias adicionales.";
  if (opcionId && !fotoId) return "Elegí la foto para la opción.";
  for (const c of copias || []) {
    if (Number(c.cantidad) > 20) return "Hasta 20 copias de cada una.";
  }
  const op = (sesion.opciones || []).find((o) => o.id === opcionId);
  if (opcionId && !op) return "Elegí una opción válida.";
  if (op && formatoDe(op, digital) === null) return "Elegí si la querés en papel o digital.";
  return null;
}

/** Copias para el RPC: solo las que tienen cantidad. */
export const copiasParaGuardar = (copias) =>
  (copias || []).filter((c) => Number(c.cantidad) > 0).map((c) => ({ foto_id: c.foto_id, copia_id: c.copia_id, cantidad: Number(c.cantidad) }));

/** Estado del pedido para mostrar: { clave, texto }. */
export function estadoPedido(p) {
  if (!p) return { clave: "sin_pedido", texto: "Sin pedido" };
  if (p.pagado_en && p.digital) return { clave: "listo", texto: "Pagado · descarga habilitada" };
  if (p.entregado_en) return { clave: "entregado", texto: "Pagado · entregado" };
  if (p.pagado_en) return { clave: "pagado", texto: "Pagado · se entrega en papel" };
  if (p.informado_pago_en) return { clave: "informado", texto: "Pago informado" };
  return { clave: "pendiente", texto: "Falta pagar" };
}

/** Formulario de la familia armado desde su pedido (o vacío). `propias`: fotos del alumno. */
export const formDePedido = (pedido, propias = []) => ({
  opcionId: pedido?.opcion_id || null,
  digital: pedido?.opcion_id ? !!pedido.digital : null,
  fotoId: pedido?.foto_id || (propias.length === 1 ? propias[0].id : null),
  copias: (pedido?.copias || []).map((c) => ({ foto_id: c.foto_id, copia_id: c.copia_id, cantidad: c.cantidad })),
  comentario: pedido?.comentario || "",
});

/**
 * Cambia cuando el pedido cambia (guardado, pago informado o confirmado,
 * entregado). La pantalla rearma el formulario al recargar si cambió: si no,
 * quedaba mostrando lo que había al abrirla.
 */
export const firmaPedido = (p) =>
  p ? [p.id, p.actualizado_en, p.informado_pago_en, p.pagado_en, p.entregado_en].join("|") : "";

/** La familia puede cambiar el pedido mientras no venza ni esté pagado. */
export const puedeEditarPedido = (sesion, pedido, hoy) => !sesionVencida(sesion, hoy) && !pedido?.pagado_en;

/** Fotos que la familia ve de un alumno: las suyas primero y después las grupales. */
export const fotosDeAlumno = (fotos, hijoId) => [
  ...(fotos || []).filter((f) => f.tipo === "alumno" && f.hijo_id === hijoId),
  ...(fotos || []).filter((f) => f.tipo === "grupal"),
];

/** ¿Se puede descargar el original? Pagado + opción digital: la elegida y las grupales. */
export const fotoDescargable = (foto, pedido) =>
  !!(pedido?.pagado_en && pedido.digital && (pedido.foto_id === foto.id || foto.tipo === "grupal"));

/** Rutas en el bucket: <curso>/<sesion>/<id>.jpg, .muestra.jpg y .muestra.thumb.jpg */
export function pathsFoto(cursoId, sesionId, id) {
  const base = `${cursoId}/${sesionId}/${id}`;
  return { path: `${base}.jpg`, path_muestra: `${base}.muestra.jpg`, path_miniatura: `${base}.muestra.thumb.jpg` };
}

/**
 * Texto de una copia del pedido: "2 × 15x21 de K3Ants09.JPG". `conArchivo`
 * (Excel de la fotógrafa): la grupal también con su archivo.
 */
export function textoCopia(c, fotos, { conArchivo = false } = {}) {
  const f = (fotos || []).find((x) => x.id === c.foto_id);
  const nombre = !f ? "una foto" : f.tipo !== "grupal" ? f.archivo : conArchivo ? `${f.archivo} (grupal)` : "la grupal";
  return `${c.cantidad} × ${c.tamano} de ${nombre}`;
}

// ── Globitos (reciben el cliente, como contarNovedadesSalidas) ──

/** Fecha (ISO) de la última vez que la familia abrió Fotos escolares. */
export const CLAVE_FOTOS_VISTAS = (userId) => `fotos_vistas_${userId}`;

/**
 * Familia: novedades desde `desde` (ISO) — sesiones publicadas con fotos de
 * sus hijos, y pedidos suyos que el colegio marcó pagados o entregados.
 * Un solo viaje (dos consultas en paralelo).
 */
export async function contarNovedadesFotos(supabase, { cursoIds = [], hijoIds = [], desde }) {
  if (!cursoIds.length || !hijoIds.length || !desde) return 0;
  const [s, p] = await Promise.all([
    supabase.from("fotos_sesiones").select("id, fotos!inner(hijo_id)").in("curso_id", cursoIds)
      .gt("publicada_en", desde).in("fotos.hijo_id", hijoIds),
    supabase.from("fotos_pedidos").select("id", { count: "exact", head: true }).in("hijo_id", hijoIds)
      .or(`pagado_en.gt.${desde},entregado_en.gt.${desde}`),
  ]);
  const sesiones = new Set((s.data || []).map((x) => x.id)).size;
  return sesiones + (p.count || 0);
}

/** Panel del colegio: pedidos con "Ya pagué" que todavía no se marcaron pagados (RLS acota a sus cursos). */
export async function contarPagosFotosInformados(supabase) {
  const { count } = await supabase.from("fotos_pedidos").select("id", { count: "exact", head: true })
    .not("informado_pago_en", "is", null).is("pagado_en", null);
  return count || 0;
}

/** Filas para el Excel de la fotógrafa (una por alumno con pedido). */
export function filasExcelPedidos({ pedidos, hijos, fotos, curso }) {
  const porId = new Map((hijos || []).map((h) => [h.id, h]));
  const foto = (id) => (fotos || []).find((f) => f.id === id);
  return (pedidos || []).map((p) => {
    const h = porId.get(p.hijo_id) || {};
    return {
      Curso: curso || "",
      Alumno: [h.apellido, h.nombre].filter(Boolean).join(", "),
      "Opción": p.opcion_nombre || "",
      "Foto elegida": foto(p.foto_id)?.archivo || "",
      Digital: p.digital ? "Sí" : "No",
      "Copias adicionales": (p.copias || []).map((c) => textoCopia(c, fotos, { conArchivo: true })).join("; "),
      Total: Number(p.total) || 0,
      Estado: estadoPedido(p).texto,
      Comentario: p.comentario || "",
    };
  });
}
