import { coincideTexto } from "./helpers";
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

// Chats entre el personal del colegio (supabase/mensajes-personal.sql):
// tipo "personal", 1 a 1 (con otro_id) o grupo (con nombre, sin otro_id).
export const ROLES_PERSONAL = ["docente", "colegio_admin", "nivel_admin"];
export const esGrupoPersonal = (c) => c?.tipo === "personal" && !c.otro_id;
/** Grupo con participantes elegidos: de familias ("grupo") o del personal. */
export const esGrupoPropio = (c) => c?.tipo === "grupo" || esGrupoPersonal(c);
/** Personal del buscador: por nombre o cargo, sin acentos. */
export function filtrarPersonal(personal, q) {
  const t = sinAcentos(q).trim();
  if (!t) return personal;
  return personal.filter((p) => sinAcentos(`${p.nombre} ${p.cargo || ""}`).includes(t));
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

/**
 * "Escribir por tribbu" en Contacto: Secretaría (un chat por hijo) y las
 * maestras que usan tribbu en los cursos en vista. `docentes` = filas de
 * docentes_para_mensaje(); `hijos` = items "hijo" de Mi acceso.
 */
export const contactosPorTribbu = (docentes = [], hijos = [], cursoIds = []) => {
  const enVista = (cid) => !cursoIds.length || cursoIds.includes(cid);
  const secretaria = hijos.filter((h) => enVista(h.curso_id)).map((h) => ({ id: h.id, nombre: (h.nombre || "").split(" ")[0] }));
  const maestras = docentes
    .filter((d) => d.tiene_cuenta && enVista(d.curso_id))
    .sort((a, b) => `${a.nombre} ${a.apellido || ""}`.localeCompare(`${b.nombre} ${b.apellido || ""}`, "es") || (a.hijo_nombre || "").localeCompare(b.hijo_nombre || "", "es"));
  return { secretaria, maestras };
};

/** Buscador de la lista de Mensajes: por nombre, descripción o último mensaje. */
export const filtrarConversaciones = (convs, q) =>
  (convs || []).filter((c) => coincideTexto(q, c.titulo, c.subtitulo, c.ultimo_texto));

/**
 * Edición de un mensaje propio: texto nuevo + las fotos que quedan.
 * Devuelve { cambios, quitadas } para el update y el borrado del Storage, o
 * null si quedaría vacío (sin texto ni fotos: para eso está "Eliminar").
 */
export function planEdicion(m, texto, fotosQueQuedan) {
  const t = limpiarTexto(texto);
  const antes = m?.fotos || [];
  const quedan = (fotosQueQuedan || antes).filter((p) => antes.includes(p));
  if (!t && !quedan.length) return null;
  const quitadas = antes.filter((p) => !quedan.includes(p));
  const cambios = { texto: t || null };
  if (quitadas.length) cambios.fotos = quedan;
  return { cambios, quitadas };
}

// Grupos: cada persona con su color en el nombre, siempre el mismo
// para el mismo autor, para distinguir quién dice qué de un vistazo.
const COLORES_AUTOR = ["#2563EB", "#DB2777", "#059669", "#D97706", "#7C3AED", "#0891B2", "#DC2626", "#4D7C0F"];
// Con `autores` (los ids de la conversación) los colores no se repiten hasta
// el 9º autor; sin la lista, sale de un hash del id.
export function colorAutor(id, autores = null) {
  const lista = autores ? [...autores].sort() : null;
  const i = lista ? lista.indexOf(id) : -1;
  if (i >= 0) return COLORES_AUTOR[i % COLORES_AUTOR.length];
  const s = String(id || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return COLORES_AUTOR[h % COLORES_AUTOR.length];
}

