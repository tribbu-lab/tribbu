// src/lib/mensajes.js — reglas puras de Mensajes (specs/mensajes.md),
// compartidas web/mobile (@shared/mensajes). Sin supabase: cada pantalla hace
// sus queries (RPC mis_conversaciones, tabla mensajes) y pasa las filas.

export const MAX_TEXTO = 2000;
export const MAX_FOTOS_MENSAJE = 3;
export const PAGINA_MENSAJES = 50;

export const MOTIVOS_DENUNCIA = [
  { k: "acoso", label: "Acoso o agresión" },
  { k: "inapropiado", label: "Contenido inapropiado" },
  { k: "spam", label: "Spam o publicidad" },
  { k: "otro", label: "Otro motivo" },
];
export const motivoDenuncia = (k) => MOTIVOS_DENUNCIA.find((m) => m.k === k)?.label || k;

export const NORMAS_CHAT = [
  "Tratá a todas las familias con respeto. No se permiten insultos, acoso ni discriminación.",
  "No compartas fotos ni datos de chicos que no sean tuyos sin permiso de su familia.",
  "Nada de publicidad, cadenas ni spam.",
  "Si un mensaje te incomoda, podés bloquear a quien lo mandó y denunciarlo: lo revisa el colegio.",
  "Los mensajes se borran al terminar el año lectivo.",
];

export const AVISO_RETENCION = "Los mensajes se borran al terminar el año lectivo.";
export const AVISO_SOPORTE = "Te respondemos lo antes posible, normalmente en menos de 24 hs hábiles.";
export const AVISO_DIAGNOSTICO = "Incluimos datos de tu dispositivo para ayudarte.";

/** Texto de vista previa del último mensaje en la lista. */
export function vistaPrevia(c, userId) {
  if (!c) return "";
  if (c.ultimo_borrado) return "Mensaje eliminado";
  const propio = c.ultimo_autor_id && c.ultimo_autor_id === userId ? "Vos: " : "";
  const t = (c.ultimo_texto || "").trim();
  if (t) return propio + t.replace(/\s+/g, " ");
  if (c.ultimo_fotos > 0) return propio + (c.ultimo_fotos > 1 ? `📷 ${c.ultimo_fotos} fotos` : "📷 Foto");
  return "";
}

/** "14:05" hoy, "ayer", "lun", "12/9" */
export function horaCorta(iso, ahora = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, ahora)) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return "ayer";
  const dias = (ahora - d) / 86400000;
  if (dias < 7) return d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export const horaMensaje = (iso) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

/** Etiqueta del separador de día: "Hoy", "Ayer", "lunes 6 de octubre". */
export function etiquetaDia(iso, ahora = new Date()) {
  const d = new Date(iso);
  const clave = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ayer = new Date(ahora); ayer.setDate(ayer.getDate() - 1);
  if (clave(d) === clave(ahora)) return "Hoy";
  if (clave(d) === clave(ayer)) return "Ayer";
  const s = d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long",
    ...(d.getFullYear() !== ahora.getFullYear() ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Une mensajes de varias fuentes (fetch, Realtime, envío optimista) sin
 * duplicar. El cliente genera el id del mensaje antes de insertarlo, así el
 * optimista y el real comparten id: lo que llega del servidor (sin `_estado`)
 * pisa al optimista. Devuelve orden cronológico ascendente.
 */
export function fusionarMensajes(actuales, nuevos) {
  const porId = new Map();
  for (const m of actuales) porId.set(m.id, m);
  for (const m of nuevos) {
    if (!m?.id) continue;
    const previo = porId.get(m.id);
    porId.set(m.id, previo ? { ...previo, ...m, _estado: m._estado } : m);
  }
  return [...porId.values()].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
}

/**
 * Lista con separadores de día para renderizar: [{tipo:"dia", key, label} |
 * {tipo:"msg", key, m, primeroDelGrupo}]. `primeroDelGrupo` = cambia el autor
 * respecto del anterior (o hay corte de día): ahí va el nombre en el grupo.
 */
export function agruparPorDia(mensajes, ahora = new Date()) {
  const out = [];
  let diaPrev = null;
  let autorPrev = null;
  for (const m of mensajes) {
    const d = new Date(m.creado_en);
    const dia = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dia !== diaPrev) {
      out.push({ tipo: "dia", key: `dia-${dia}`, label: etiquetaDia(m.creado_en, ahora) });
      diaPrev = dia;
      autorPrev = null;
    }
    const autorKey = `${m.autor_id}|${m.rol_autor}`;
    out.push({ tipo: "msg", key: m.id, m, primeroDelGrupo: autorKey !== autorPrev });
    autorPrev = autorKey;
  }
  return out;
}

/** Puede editar = autor, no borrado, no pendiente de envío. */
export const puedeEditar = (m, userId) => !!m && m.autor_id === userId && !m.borrado_en && !m._estado;

/** Quién firma un mensaje en la UI. */
export function firmaMensaje(m, { userId, nombres = {}, colegioNombre } = {}) {
  if (m.autor_id === userId) return "Vos";
  if (m.rol_autor === "soporte") return "Soporte tribbu";
  if (m.rol_autor === "colegio") return colegioNombre || "Secretaría";
  return nombres[m.autor_id] || "Alguien";
}

/** Normaliza texto antes de mandar: recorta espacios y largo máximo. */
export const limpiarTexto = (t) => (t || "").replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, MAX_TEXTO);

/** Familias del buscador "Nuevo mensaje": filtra por nombre o hijo, sin acentos. */
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function filtrarFamilias(familias, q) {
  const t = sinAcentos(q).trim();
  if (!t) return familias;
  return familias.filter((f) => {
    const campos = [f.nombre, f.apellido, ...(f.hijos || []).flatMap((h) => [h.nombre, h.apellido])];
    return sinAcentos(campos.join(" ")).includes(t);
  });
}

/** "Juan y Sofía" */
export const hijosDeFamilia = (f) => [...new Set((f?.hijos || []).map((h) => h.nombre).filter(Boolean))].join(" y ");

/**
 * Datos de diagnóstico para soporte. Cada plataforma pasa lo que sabe; acá
 * solo se arma el objeto con forma estable.
 */
export function metaSoporte({ plataforma, version, sistema, dispositivo, pantalla, colegio, cursos } = {}) {
  return {
    plataforma: plataforma || null,
    version: version || null,
    sistema: sistema || null,
    dispositivo: dispositivo || null,
    pantalla: pantalla || null,
    colegio: colegio || null,
    cursos: cursos || [],
    enviado: new Date().toISOString(),
  };
}

/** Path de una foto: mensajes/<conversacion>/<ts>-<i> (sin extensión). */
export const pathFotoMensaje = (conversacionId, i, ts = Date.now()) => `mensajes/${conversacionId}/${ts}-${i}`;
