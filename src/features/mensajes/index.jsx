// Mensajes (specs/mensajes.md) — chat 1 a 1 entre apoderados que comparten
// curso y el hilo de soporte con el equipo de tribbu. Fases 2/3 (grupo del
// curso, familia ↔ colegio) usan las mismas tablas y este mismo chat.
//
// Datos: RPC mis_conversaciones() (una request para toda la lista), tabla
// mensajes (RLS: solo miembros), conversacion_miembros (leído/silenciado por
// usuario). Tiempo real: App abre UNA suscripción (useMensajesNoLeidos) y
// reenvía cada cambio como evento de ventana tribbu:mensaje.
// Privacidad: nunca se muestra teléfono ni email de otra familia; el colegio
// no lee estos chats (solo lo denunciado, en Super Admin → 🚩 Denuncias).
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../supabase";
import { safeUrl, uuidLite } from "../../lib/helpers";
import { THEMES, SLATE, BLUE, withAlpha } from "../../lib/tokens";
import { borrarArchivos } from "../../lib/storageUrl";
import { subirImagen } from "../../lib/imagenesWeb";
import { SignedImg } from "../../components/SignedImg";
import { Spinner } from "../../components/Spinner";
import { useCargar } from "../../hooks/useCargar";
import { EVENTO_MENSAJE, EVENTO_RESYNC } from "../../hooks/useMensajesNoLeidos";
import {
  MAX_TEXTO, MAX_FOTOS_MENSAJE, PAGINA_MENSAJES, MOTIVOS_DENUNCIA, motivoDenuncia, NORMAS_CHAT,
  AVISO_RETENCION, AVISO_SOPORTE, AVISO_DIAGNOSTICO, vistaPrevia, horaCorta, horaMensaje,
  fusionarMensajes, agruparPorDia, puedeEditar, firmaMensaje, limpiarTexto, filtrarFamilias,
  hijosDeFamilia, metaSoporte, pathFotoMensaje,
} from "../../lib/mensajes";

const C = THEMES.light;
const MAX_FOTO_BYTES = 10 * 1024 * 1024;
const btnPri = { padding: "9px 16px", borderRadius: 10, border: "none", background: C.accent, color: C.onAccent, cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSec = { padding: "9px 16px", borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.surface, color: SLATE[600], cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnIcon = { width: 40, height: 40, borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: SLATE[500], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
const overlay = { position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 };
const modalCard = { background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" };

// ── Utilidades de UI ────────────────────────────────────────────────────────

const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
function TextoConLinks({ texto, color, colorLink }) {
  const partes = texto.split(URL_RE);
  return partes.map((p, i) => {
    if (i % 2 === 1) {
      const href = safeUrl(p);
      return href
        ? <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ color: colorLink, textDecoration: "underline", wordBreak: "break-all" }}>{p}</a>
        : <span key={i} style={{ color }}>{p}</span>;
    }
    return <span key={i} style={{ color }}>{p}</span>;
  });
}

function Avatar({ texto, emoji, color = BLUE[500], size = 40 }) {
  const ini = (texto || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div aria-hidden="true" style={{ width: size, height: size, borderRadius: "50%", background: withAlpha(color, 0.14), color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: emoji ? size * 0.5 : size * 0.36, flexShrink: 0 }}>
      {emoji || ini}
    </div>
  );
}

function VisorFoto({ path, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} role="dialog" aria-label="Foto" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: "56px 16px" }}>
      <SignedImg src={path} bucket="adjuntos" alt="Foto del mensaje" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8, display: "block" }} />
      <button onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", top: 12, right: 14, width: 40, height: 40, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "white", fontSize: 18, cursor: "pointer" }}>✕</button>
    </div>
  );
}

// ── Normas de convivencia (Apple 1.2): aceptar antes de escribir a familias ──

export function NormasModal({ userId, onAceptar, onCerrar }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const aceptar = async () => {
    setGuardando(true);
    const { error: e } = await supabase.from("normas_chat_aceptadas").upsert({ usuario_id: userId }, { onConflict: "usuario_id" });
    setGuardando(false);
    if (e) { setError("No se pudo guardar. Probá de nuevo."); return; }
    onAceptar();
  };
  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="normas-titulo">
        <div id="normas-titulo" style={{ fontSize: 17, fontWeight: 800, color: C.textStrong, marginBottom: 6 }}>Normas de convivencia</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>Antes de escribirle a otras familias, leé y aceptá estas reglas.</div>
        <ul style={{ margin: "0 0 16px", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {NORMAS_CHAT.map((n) => <li key={n} style={{ fontSize: 13.5, color: C.text, lineHeight: 1.45 }}>{n}</li>)}
        </ul>
        {error ? <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCerrar} style={{ ...btnSec, flex: 1 }}>Ahora no</button>
          <button onClick={aceptar} disabled={guardando} style={{ ...btnPri, flex: 1, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : "Acepto"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Denunciar un mensaje ────────────────────────────────────────────────────

function DenunciarModal({ mensaje, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const enviar = async () => {
    if (!motivo) { setError("Elegí un motivo."); return; }
    setEnviando(true);
    const { error: e } = await supabase.from("mensaje_denuncias").insert({ mensaje_id: mensaje.id, motivo, detalle: detalle.trim() || null });
    setEnviando(false);
    if (e) {
      setError(e.code === "23505" ? "Ya denunciaste este mensaje." : "No se pudo enviar la denuncia.");
      return;
    }
    onListo();
  };
  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="den-titulo">
        <div id="den-titulo" style={{ fontSize: 17, fontWeight: 800, color: C.textStrong, marginBottom: 6 }}>Denunciar mensaje</div>
        <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, lineHeight: 1.45 }}>
          Lo revisa el colegio. Solo ve este mensaje, no el resto de la conversación. Quien lo escribió no se entera de que lo denunciaste.
        </div>
        {mensaje.texto ? <div style={{ fontSize: 13, color: C.text, background: C.surfaceSunken, borderRadius: 10, padding: "8px 12px", marginBottom: 14, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto" }}>{mensaje.texto}</div> : null}
        <div role="radiogroup" aria-label="Motivo" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {MOTIVOS_DENUNCIA.map((m) => (
            <label key={m.k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${motivo === m.k ? C.accent : C.borderStrong}`, background: motivo === m.k ? C.accentSoft : C.surface, cursor: "pointer", fontSize: 13.5, color: C.text }}>
              <input type="radio" name="motivo" checked={motivo === m.k} onChange={() => { setMotivo(m.k); setError(""); }} />
              {m.label}
            </label>
          ))}
        </div>
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value.slice(0, 500))} placeholder="Contanos más (opcional)" rows={3}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 10, background: C.surfaceSunken }} />
        {error ? <div style={{ fontSize: 12.5, color: C.danger, marginBottom: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCerrar} style={{ ...btnSec, flex: 1 }}>Cancelar</button>
          <button onClick={enviar} disabled={enviando} style={{ ...btnPri, flex: 1, background: C.danger, opacity: enviando ? 0.6 : 1 }}>{enviando ? "Enviando…" : "Denunciar"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Nuevo mensaje: Familias · Maestras · Secretaría (o Alumnos, para la docente) ──

function FilaOpcion({ titulo, sub, avatar, onClick, deshabilitada, abriendo, nota }) {
  return (
    <button onClick={onClick} disabled={deshabilitada || abriendo}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", background: abriendo ? C.surface2 : "transparent", borderRadius: 12, cursor: deshabilitada ? "default" : "pointer", textAlign: "left", minHeight: 56, opacity: deshabilitada ? 0.55 : 1 }}>
      {avatar}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.textStrong }}>{titulo}</div>
        {sub ? <div style={{ fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div> : null}
      </div>
      {abriendo ? <span style={{ fontSize: 12, color: C.textMuted }}>Abriendo…</span> : nota ? <span style={{ fontSize: 11.5, color: C.textFaint, flexShrink: 0 }}>{nota}</span> : null}
    </button>
  );
}

const PESTANAS_NUEVO = [
  { k: "familias", l: "Familias" },
  { k: "maestras", l: "Maestras" },
  { k: "secretaria", l: "Secretaría" },
];

function NuevoMensajeModal({ esDocente, hijos = [], onFamilia, onDocente, onSecretaria, onAlumno, onCerrar, tagDeCurso }) {
  const [pestana, setPestana] = useState(esDocente ? "alumnos" : "familias");
  const [datos, setDatos] = useState({}); // por pestaña
  const [q, setQ] = useState("");
  const [abriendo, setAbriendo] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const rpc = { familias: "familias_para_mensaje", maestras: "docentes_para_mensaje", alumnos: "alumnos_para_docente" }[pestana];
    if (!rpc || datos[pestana]) return undefined;
    let vivo = true;
    supabase.rpc(rpc).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError("No se pudo cargar la lista.");
      setDatos((d) => ({ ...d, [pestana]: data || [] }));
    });
    return () => { vivo = false; };
  }, [pestana, datos]);

  const abrir = async (clave, fn) => {
    setAbriendo(clave);
    setError("");
    const ok = await fn();
    if (!ok) { setAbriendo(null); setError("No se pudo abrir la conversación."); }
  };

  const t = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const coincide = (...campos) => !t || campos.join(" ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t);
  const cargando = pestana !== "secretaria" && !datos[pestana];

  let contenido = null;
  if (pestana === "familias" && datos.familias) {
    const lista = filtrarFamilias(datos.familias, q);
    contenido = lista.length ? lista.map((f) => {
      const tag = tagDeCurso?.(f.curso_ids?.[0]);
      return (
        <FilaOpcion key={f.usuario_id} titulo={`${f.nombre} ${f.apellido || ""}`} abriendo={abriendo === f.usuario_id}
          avatar={<Avatar texto={`${f.nombre} ${f.apellido || ""}`} color={tag?.color || BLUE[500]} />}
          sub={hijosDeFamilia(f) ? `Familia de ${hijosDeFamilia(f)}` : "Room Parent"}
          onClick={() => abrir(f.usuario_id, () => onFamilia(f))} />
      );
    }) : <Vacio texto="No encontramos a nadie con ese nombre." />;
  } else if (pestana === "maestras" && datos.maestras) {
    const lista = datos.maestras.filter((d) => coincide(d.nombre, d.apellido, d.materia, d.hijo_nombre));
    const porHijo = [...new Set(lista.map((d) => d.hijo_id))];
    contenido = lista.length ? porHijo.map((hid) => {
      const deHijo = lista.filter((d) => d.hijo_id === hid);
      return (
        <div key={hid}>
          {hijos.length > 1 ? <div style={{ fontSize: 11, fontWeight: 800, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.6, padding: "10px 12px 4px" }}>Maestras de {deHijo[0].hijo_nombre}</div> : null}
          {deHijo.map((d) => (
            <FilaOpcion key={`${d.hijo_id}-${d.maestro_id}`} titulo={`${d.nombre} ${d.apellido || ""}`}
              avatar={<Avatar emoji="👩‍🏫" color={SLATE[600]} />}
              sub={[d.materia, `Sobre ${d.hijo_nombre}`].filter(Boolean).join(" · ")}
              deshabilitada={!d.tiene_cuenta} nota={d.tiene_cuenta ? null : "Todavía no usa tribbu"}
              abriendo={abriendo === `${d.hijo_id}-${d.maestro_id}`}
              onClick={() => abrir(`${d.hijo_id}-${d.maestro_id}`, () => onDocente(d))} />
          ))}
        </div>
      );
    }) : <Vacio texto={t ? "No encontramos a nadie con ese nombre." : "Tu colegio todavía no cargó las maestras de este curso."} />;
  } else if (pestana === "secretaria") {
    contenido = hijos.length ? hijos.map((h) => (
      <FilaOpcion key={h.id} titulo={`Secretaría · sobre ${h.nombre}`} abriendo={abriendo === h.id}
        avatar={<Avatar emoji="🏫" color={SLATE[600]} />} sub={h.curso || null}
        onClick={() => abrir(h.id, () => onSecretaria(h))} />
    )) : <Vacio texto="No tenés hijos cargados." />;
  } else if (pestana === "alumnos" && datos.alumnos) {
    const lista = datos.alumnos.filter((a) => coincide(a.nombre, a.apellido, a.curso_nombre));
    contenido = lista.length ? lista.map((a) => (
      <FilaOpcion key={`${a.hijo_id}-${a.maestro_id}`} titulo={`Familia de ${a.nombre} ${a.apellido || ""}`}
        avatar={<Avatar texto={`${a.nombre} ${a.apellido || ""}`} />} sub={a.curso_nombre}
        abriendo={abriendo === `${a.hijo_id}-${a.maestro_id}`}
        onClick={() => abrir(`${a.hijo_id}-${a.maestro_id}`, () => onAlumno(a))} />
    )) : <Vacio texto={t ? "No encontramos a ese alumno." : "No tenés cursos asignados todavía."} />;
  }

  const ayuda = {
    familias: "Podés escribirle a las familias de los cursos de tus hijos.",
    maestras: "Un chat por cada hijo con cada maestra. El colegio puede leer estas conversaciones.",
    secretaria: "Un chat por cada hijo con la secretaría del colegio.",
    alumnos: "Escribile a la familia de un alumno. El colegio puede leer estas conversaciones.",
  }[pestana];

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={{ ...modalCard, padding: 0, display: "flex", flexDirection: "column", height: "min(640px, 85vh)" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="nuevo-titulo">
        <div style={{ padding: "18px 20px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div id="nuevo-titulo" style={{ fontSize: 17, fontWeight: 800, color: C.textStrong }}>Nuevo mensaje</div>
            <button onClick={onCerrar} aria-label="Cerrar" style={btnIcon}>✕</button>
          </div>
          {!esDocente ? (
            <div role="tablist" style={{ display: "flex", gap: 4, background: C.surface2, borderRadius: 10, padding: 3, marginBottom: 10 }}>
              {PESTANAS_NUEVO.map((p) => (
                <button key={p.k} role="tab" aria-selected={pestana === p.k} onClick={() => { setPestana(p.k); setQ(""); setError(""); }}
                  style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: "none", background: pestana === p.k ? C.surface : "transparent", color: pestana === p.k ? C.textStrong : C.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: pestana === p.k ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>{p.l}</button>
              ))}
            </div>
          ) : null}
          {pestana !== "secretaria" ? (
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={pestana === "alumnos" ? "Buscar alumno" : "Buscar por nombre"} aria-label="Buscar"
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 14, fontFamily: "inherit", outline: "none", background: C.surfaceSunken }} />
          ) : null}
          <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>{ayuda}</div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 8px 12px", flex: 1, minHeight: 120 }}>
          {cargando ? <Spinner /> : null}
          {error ? <div role="alert" style={{ fontSize: 13, color: C.danger, padding: 12 }}>{error}</div> : null}
          {contenido}
        </div>
      </div>
    </div>
  );
}

const Vacio = ({ texto }) => <div style={{ fontSize: 13, color: C.textMuted, padding: 16, textAlign: "center" }}>{texto}</div>;

// ── Chat de una conversación (familia o equipo de soporte) ──────────────────

/**
 * conv: { id, tipo, titulo, subtitulo, otro_id, silenciado, bloqueado, estado }
 * modo: "familia" (apoderado / colegio_admin escribiendo a soporte) | "staff"
 *       (super respondiendo en la bandeja de soporte).
 */
// rolPropio: del lado institucional, qué rol_autor cuenta como "mío" ("soporte"
// en la bandeja de soporte, "colegio" en la de Secretaría). soloLectura: el
// colegio leyendo un hilo familia ↔ docente.
export function ChatConversacion({ conv, userId, modo = "familia", rolPropio = null, soloLectura = false, normasOk = true, onPedirNormas, onVolver, onCambio, meta, encabezadoExtra, alto }) {
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState([]); // [{file, url}]
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [editando, setEditando] = useState(null); // {id, texto}
  const [denunciar, setDenunciar] = useState(null);
  const [visor, setVisor] = useState(null);
  const [menu, setMenu] = useState(false);
  const [aviso, setAviso] = useState("");
  const [silenciado, setSilenciado] = useState(!!conv.silenciado);
  const [bloqueado, setBloqueado] = useState(!!conv.bloqueado);
  const [estado, setEstado] = useState(conv.estado || "abierta");
  const fondo = useRef(null);
  const inputRef = useRef(null);
  const mensajesRef = useRef([]);
  const staff = modo === "staff";
  const rolStaff = rolPropio || (staff ? "soporte" : null);
  const esSoporte = conv.tipo === "soporte";
  // Hilos con más de dos personas: cada mensaje lleva quién lo firmó.
  const multi = conv.tipo === "curso" || conv.tipo === "colegio" || conv.tipo === "docente";
  const [nombres, setNombres] = useState({});
  const cargarNombres = useCallback(async () => {
    const { data } = await supabase.rpc("autores_conversacion", { p_conv: conv.id });
    setNombres(Object.fromEntries((data || []).map((a) => [a.usuario_id, a.nombre])));
  }, [conv.id]);
  useEffect(() => { if (multi) Promise.resolve().then(cargarNombres); }, [multi, cargarNombres]);
  const nombresRef = useRef(nombres);
  useEffect(() => { nombresRef.current = nombres; }, [nombres]);
  const necesitaNormas = !staff && (conv.tipo === "directo" || conv.tipo === "curso") && !normasOk;

  const bajar = useCallback((suave) => {
    requestAnimationFrame(() => fondo.current?.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "end" }));
  }, []);

  const marcarLeido = useCallback(async (lista) => {
    const ultimo = lista.length ? new Date(lista[lista.length - 1].creado_en).getTime() : 0;
    const en = new Date(Math.max(Date.now(), ultimo + 1)).toISOString();
    await supabase.from("conversacion_miembros").upsert(
      { conversacion_id: conv.id, usuario_id: userId, ultimo_leido_en: en },
      { onConflict: "conversacion_id,usuario_id" },
    );
    onCambio?.();
  }, [conv.id, userId, onCambio]);

  // Carga inicial (últimos N) — al cambiar de conversación.
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setMensajes([]);
      setSeleccionado(null); setEditando(null); setError(""); setTexto(""); setFotos([]);
      const { data, error: e } = await supabase.from("mensajes").select("*")
        .eq("conversacion_id", conv.id).order("creado_en", { ascending: false }).limit(PAGINA_MENSAJES);
      if (!vivo) return;
      if (e) { setError("No se pudieron cargar los mensajes."); setCargando(false); return; }
      const lista = (data || []).reverse();
      setMensajes(lista);
      setHayMas((data || []).length === PAGINA_MENSAJES);
      setCargando(false);
      bajar(false);
      marcarLeido(lista);
    })();
    return () => { vivo = false; };
  }, [conv.id, bajar, marcarLeido]);

  useEffect(() => { mensajesRef.current = mensajes; }, [mensajes]);

  // Tiempo real (un solo canal en App) + resync al volver a la pestaña.
  useEffect(() => {
    const onMensaje = (e) => {
      const row = e.detail?.row;
      if (!row || row.conversacion_id !== conv.id) return;
      const nuevo = !mensajesRef.current.some((m) => m.id === row.id);
      setMensajes((prev) => fusionarMensajes(prev, [row]));
      if (nuevo) {
        bajar(true);
        if (document.visibilityState === "visible" && row.autor_id !== userId) marcarLeido([row]);
        if (multi && row.autor_id && !nombresRef.current[row.autor_id]) cargarNombres();
      }
    };
    const onResync = async () => {
      const lista = mensajesRef.current;
      const desde = lista.length ? lista[lista.length - 1].creado_en : null;
      let q = supabase.from("mensajes").select("*").eq("conversacion_id", conv.id).order("creado_en", { ascending: true }).limit(200);
      if (desde) q = q.gte("creado_en", desde);
      const { data } = await q;
      if (data?.length) setMensajes((prev) => fusionarMensajes(prev, data));
    };
    window.addEventListener(EVENTO_MENSAJE, onMensaje);
    window.addEventListener(EVENTO_RESYNC, onResync);
    return () => {
      window.removeEventListener(EVENTO_MENSAJE, onMensaje);
      window.removeEventListener(EVENTO_RESYNC, onResync);
    };
  }, [conv.id, userId, bajar, marcarLeido, multi, cargarNombres]);

  const cargarAnteriores = async () => {
    const primero = mensajes[0];
    if (!primero) return;
    const { data } = await supabase.from("mensajes").select("*").eq("conversacion_id", conv.id)
      .lt("creado_en", primero.creado_en).order("creado_en", { ascending: false }).limit(PAGINA_MENSAJES);
    setHayMas((data || []).length === PAGINA_MENSAJES);
    if (data?.length) setMensajes((prev) => fusionarMensajes(prev, data));
  };

  const agregarFotos = (lista) => {
    const nuevas = [...lista].filter((f) => f.type.startsWith("image/"));
    if (nuevas.some((f) => f.size > MAX_FOTO_BYTES)) { setError("Cada foto puede pesar hasta 10 MB."); return; }
    setFotos((prev) => [...prev, ...nuevas.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_FOTOS_MENSAJE));
    setError("");
  };
  const quitarFoto = (i) => setFotos((prev) => { URL.revokeObjectURL(prev[i]?.url); return prev.filter((_, j) => j !== i); });

  const enviarMensaje = async (id, t, archivos) => {
    let paths = [];
    if (archivos.length) {
      const subidas = await Promise.all(archivos.map((f, i) => subirImagen(supabase, "adjuntos", pathFotoMensaje(conv.id, i), f)));
      paths = subidas.filter((s) => !s.error).map((s) => s.path);
      if (paths.length !== archivos.length) {
        borrarArchivos(paths, "adjuntos");
        return { error: "No se pudo subir una de las fotos." };
      }
    }
    const { data, error: e } = await supabase.from("mensajes")
      .insert({ id, conversacion_id: conv.id, texto: t || null, fotos: paths }).select().single();
    if (e) {
      borrarArchivos(paths, "adjuntos");
      return { error: bloqueado ? "Desbloqueá a esta persona para escribirle." : "No se pudo enviar el mensaje." };
    }
    if (esSoporte && !staff && meta) {
      await supabase.from("soporte_diagnosticos").insert({ mensaje_id: id, conversacion_id: conv.id, datos: meta() });
    }
    return { data };
  };

  const enviar = async (reintento) => {
    const t = reintento ? reintento.texto : limpiarTexto(texto);
    const archivos = reintento ? reintento.archivos : fotos.map((f) => f.file);
    if (!t && !archivos.length) return;
    if (necesitaNormas) { onPedirNormas?.(); return; }
    const id = reintento?.id || uuidLite();
    const optimista = {
      id, conversacion_id: conv.id, autor_id: userId, rol_autor: rolStaff || "usuario",
      texto: t || null, fotos: [], creado_en: reintento?.creado_en || new Date().toISOString(), _estado: "enviando",
      _previews: reintento?._previews || fotos.map((f) => f.url), _reintento: { id, texto: t, archivos },
    };
    setMensajes((prev) => fusionarMensajes(prev, [optimista]));
    if (!reintento) { setTexto(""); setFotos([]); }
    setError("");
    bajar(true);
    inputRef.current?.focus();
    const r = await enviarMensaje(id, t, archivos);
    if (r.error) {
      setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, _estado: "error" } : m)));
      setError(r.error);
      return;
    }
    setMensajes((prev) => fusionarMensajes(prev, [{ ...r.data, _previews: undefined, _reintento: undefined }]));
    onCambio?.();
  };

  const guardarEdicion = async () => {
    const t = limpiarTexto(editando.texto);
    const m = mensajes.find((x) => x.id === editando.id);
    if (!t && !(m?.fotos || []).length) return;
    const { data, error: e } = await supabase.from("mensajes").update({ texto: t || null }).eq("id", editando.id).select().single();
    if (e) { setError("No se pudo editar el mensaje."); return; }
    setMensajes((prev) => fusionarMensajes(prev, [data]));
    setEditando(null); setSeleccionado(null);
  };

  const eliminar = async (m) => {
    if (!window.confirm("¿Eliminar este mensaje? Se va a ver como \"Mensaje eliminado\".")) return;
    const { data, error: e } = await supabase.from("mensajes").update({ borrado_en: new Date().toISOString() }).eq("id", m.id).select().single();
    if (e) { setError("No se pudo eliminar el mensaje."); return; }
    borrarArchivos(m.fotos || [], "adjuntos");
    setMensajes((prev) => fusionarMensajes(prev, [data]));
    setSeleccionado(null);
    onCambio?.();
  };

  const toggleSilencio = async () => {
    setMenu(false);
    const nuevo = !silenciado;
    const { error: e } = await supabase.from("conversacion_miembros").upsert(
      { conversacion_id: conv.id, usuario_id: userId, silenciado: nuevo }, { onConflict: "conversacion_id,usuario_id" });
    if (e) { setError("No se pudo cambiar."); return; }
    setSilenciado(nuevo);
    setAviso(nuevo ? "Silenciaste esta conversación: no te van a llegar notificaciones." : "Vas a recibir notificaciones de esta conversación.");
    onCambio?.();
  };

  const toggleBloqueo = async () => {
    setMenu(false);
    if (!conv.otro_id) return;
    if (!bloqueado && !window.confirm(`¿Bloquear a ${conv.titulo}? No va a poder escribirte y no vas a ver sus mensajes en grupos. No se le avisa.`)) return;
    const { error: e } = bloqueado
      ? await supabase.from("usuario_bloqueos").delete().eq("usuario_id", userId).eq("bloqueado_id", conv.otro_id)
      : await supabase.from("usuario_bloqueos").insert({ usuario_id: userId, bloqueado_id: conv.otro_id });
    if (e) { setError("No se pudo cambiar el bloqueo."); return; }
    setBloqueado(!bloqueado);
    setAviso(bloqueado ? `Desbloqueaste a ${conv.titulo}.` : `Bloqueaste a ${conv.titulo}.`);
    onCambio?.();
  };

  const cambiarEstadoSoporte = async () => {
    setMenu(false);
    const nuevo = estado === "resuelta" ? "abierta" : "resuelta";
    const { error: e } = await supabase.rpc("marcar_soporte", { p_conv: conv.id, p_estado: nuevo });
    if (e) { setError("No se pudo cambiar el estado."); return; }
    setEstado(nuevo);
    onCambio?.();
  };

  const filas = useMemo(() => agruparPorDia(mensajes), [mensajes]);
  const puedeEscribir = !(conv.tipo === "directo" && bloqueado);
  const largo = texto.length;

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) { e.preventDefault(); enviar(); }
  };

  const avatarConv = esSoporte && !staff
    ? <Avatar emoji="🛟" color={SLATE[700]} />
    : <Avatar texto={conv.titulo} color={esSoporte ? SLATE[700] : BLUE[500]} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: alto || "100%", minHeight: 0, background: C.bg, position: "relative" }}>
      {visor ? <VisorFoto path={visor} onClose={() => setVisor(null)} /> : null}
      {denunciar ? <DenunciarModal mensaje={denunciar} onCerrar={() => setDenunciar(null)} onListo={() => { setDenunciar(null); setSeleccionado(null); setAviso("Gracias. El colegio va a revisar el mensaje."); }} /> : null}

      {/* Cabecera */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {onVolver ? <button onClick={onVolver} aria-label="Volver a la lista" style={btnIcon}>←</button> : null}
        {avatarConv}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {conv.titulo}{silenciado ? <span title="Silenciada" style={{ marginLeft: 6, fontSize: 13 }}>🔕</span> : null}
          </div>
          {conv.subtitulo ? <div style={{ fontSize: 12, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.subtitulo}</div> : null}
          {staff && esSoporte ? <div style={{ fontSize: 12, color: estado === "resuelta" ? C.success : C.warning, fontWeight: 700 }}>{estado === "resuelta" ? "✓ Resuelto" : "Abierto"}</div> : null}
        </div>
        <div style={{ position: "relative" }}>
          <button onClick={() => setMenu((m) => !m)} aria-label="Opciones de la conversación" aria-expanded={menu} style={btnIcon}>⋯</button>
          {menu ? (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setMenu(false)} />
              <div role="menu" style={{ position: "absolute", right: 0, top: 44, zIndex: 21, background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.12)", minWidth: 220, overflow: "hidden" }}>
                {!staff ? <MenuItem onClick={toggleSilencio}>{silenciado ? "🔔 Activar notificaciones" : "🔕 Silenciar"}</MenuItem> : null}
                {conv.tipo === "directo" ? <MenuItem onClick={toggleBloqueo} peligro={!bloqueado}>{bloqueado ? "Desbloquear" : "🚫 Bloquear"}</MenuItem> : null}
                {staff && esSoporte ? <MenuItem onClick={cambiarEstadoSoporte}>{estado === "resuelta" ? "↩︎ Reabrir" : "✓ Marcar resuelto"}</MenuItem> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
      {encabezadoExtra}

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px", minHeight: 0 }} onClick={() => setSeleccionado(null)}>
        <div style={{ fontSize: 11.5, color: C.textFaint, textAlign: "center", margin: "0 auto 10px", maxWidth: 360, lineHeight: 1.4 }}>
          {esSoporte ? (staff ? "Respondés como “Soporte tribbu”." : AVISO_SOPORTE) : AVISO_RETENCION}
        </div>
        {hayMas ? <div style={{ textAlign: "center", marginBottom: 10 }}><button onClick={cargarAnteriores} style={{ ...btnSec, padding: "6px 12px", fontSize: 12 }}>Ver mensajes anteriores</button></div> : null}
        {cargando ? <Spinner /> : null}
        {!cargando && !mensajes.length ? (
          <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, padding: "32px 12px" }}>
            {esSoporte && !staff ? "Contanos qué te pasa. Si podés, mandá una captura de pantalla." : "Todavía no hay mensajes. ¡Escribí el primero!"}
          </div>
        ) : null}
        {filas.map((f) => f.tipo === "dia" ? (
          <div key={f.key} style={{ textAlign: "center", margin: "14px 0 8px" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: C.textMuted, background: C.surface2, borderRadius: 999, padding: "3px 10px" }}>{f.label}</span>
          </div>
        ) : (
          <Burbuja key={f.key} m={f.m} userId={userId} staff={staff} rolStaff={rolStaff} multi={multi} nombres={nombres} conv={conv} primero={f.primeroDelGrupo}
            seleccionado={seleccionado === f.m.id}
            onSeleccionar={() => setSeleccionado((s) => (s === f.m.id ? null : f.m.id))}
            editando={editando?.id === f.m.id ? editando : null}
            onEditar={() => setEditando({ id: f.m.id, texto: f.m.texto || "" })}
            onCambiarEdicion={(t) => setEditando((e) => ({ ...e, texto: t }))}
            onGuardarEdicion={guardarEdicion}
            onCancelarEdicion={() => setEditando(null)}
            onEliminar={() => eliminar(f.m)}
            onDenunciar={() => setDenunciar(f.m)}
            onReintentar={() => enviar({ ...f.m._reintento, creado_en: f.m.creado_en, _previews: f.m._previews })}
            onVerFoto={setVisor} />
        ))}
        <div ref={fondo} />
      </div>

      {aviso ? (
        <div role="status" style={{ margin: "0 12px 6px", padding: "8px 12px", borderRadius: 10, background: C.accentSoft, color: BLUE[700], fontSize: 12.5, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ flex: 1, color: BLUE[700] }}>{aviso}</span>
          <button onClick={() => setAviso("")} aria-label="Cerrar aviso" style={{ border: "none", background: "transparent", cursor: "pointer", color: BLUE[700] }}>✕</button>
        </div>
      ) : null}
      {error ? <div role="alert" style={{ margin: "0 12px 6px", fontSize: 12.5, color: C.danger }}>{error}</div> : null}

      {/* Composer */}
      {soloLectura ? (
        <div style={{ padding: 14, background: C.surface, borderTop: `1px solid ${C.border}`, textAlign: "center", fontSize: 13, color: C.textMuted }}>
          Solo lectura: esta conversación es entre la familia y la docente.
        </div>
      ) : !puedeEscribir ? (
        <div style={{ padding: 14, background: C.surface, borderTop: `1px solid ${C.border}`, textAlign: "center", fontSize: 13, color: C.textMuted }}>
          Bloqueaste a {conv.titulo}. <button onClick={toggleBloqueo} style={{ border: "none", background: "none", color: C.accent, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Desbloquear</button>
        </div>
      ) : necesitaNormas ? (
        <div style={{ padding: 14, background: C.surface, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 8 }}>Para escribir, aceptá las normas de convivencia.</div>
          <button onClick={onPedirNormas} style={btnPri}>Leer normas</button>
        </div>
      ) : (
        <div style={{ background: C.surface, borderTop: `1px solid ${C.border}`, padding: "8px 10px calc(8px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
          {fotos.length ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {fotos.map((f, i) => (
                <div key={f.url} style={{ position: "relative" }}>
                  <img src={f.url} alt={`Foto ${i + 1} para enviar`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, display: "block" }} />
                  <button onClick={() => quitarFoto(i)} aria-label={`Quitar foto ${i + 1}`} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: SLATE[800], color: "white", fontSize: 11, cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
          ) : null}
          {esSoporte && !staff && !mensajes.length ? <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 6 }}>{AVISO_DIAGNOSTICO}</div> : null}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            <label aria-label="Adjuntar foto" title="Adjuntar foto" style={{ ...btnIcon, cursor: fotos.length >= MAX_FOTOS_MENSAJE ? "not-allowed" : "pointer", opacity: fotos.length >= MAX_FOTOS_MENSAJE ? 0.4 : 1 }}>
              📷
              <input type="file" accept="image/*" multiple disabled={fotos.length >= MAX_FOTOS_MENSAJE} onChange={(e) => { agregarFotos(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            <textarea ref={inputRef} value={texto} onChange={(e) => setTexto(e.target.value.slice(0, MAX_TEXTO))} onKeyDown={onKeyDown}
              placeholder="Escribí un mensaje" aria-label="Mensaje" rows={1}
              style={{ flex: 1, minWidth: 0, resize: "none", maxHeight: 120, minHeight: 40, padding: "10px 12px", borderRadius: 20, border: `1.5px solid ${C.borderStrong}`, fontSize: 14, fontFamily: "inherit", outline: "none", background: C.surfaceSunken, boxSizing: "border-box", fieldSizing: "content" }} />
            <button onClick={() => enviar()} disabled={!texto.trim() && !fotos.length} aria-label="Enviar"
              style={{ width: 40, height: 40, borderRadius: "50%", border: "none", background: (!texto.trim() && !fotos.length) ? SLATE[300] : C.accent, color: "white", cursor: "pointer", fontSize: 16, flexShrink: 0 }}>➤</button>
          </div>
          {largo > MAX_TEXTO - 200 ? <div style={{ fontSize: 11, color: largo >= MAX_TEXTO ? C.danger : C.textFaint, textAlign: "right", marginTop: 4 }}>{largo}/{MAX_TEXTO}</div> : null}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, peligro }) {
  return (
    <button role="menuitem" onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: 13.5, color: peligro ? C.danger : C.text, fontWeight: 600 }}>{children}</button>
  );
}

function Burbuja({ m, userId, staff, rolStaff, multi, nombres, conv, primero, seleccionado, onSeleccionar, editando, onEditar, onCambiarEdicion, onGuardarEdicion, onCancelarEdicion, onEliminar, onDenunciar, onReintentar, onVerFoto }) {
  // En una bandeja institucional, "mío" = lo que escribió ese lado (cualquier
  // super en soporte, cualquier admin del colegio en Secretaría).
  const mio = rolStaff ? m.rol_autor === rolStaff : m.autor_id === userId;
  const borrado = !!m.borrado_en;
  const firma = !mio && primero && (multi || (staff && m.rol_autor === "soporte"))
    ? firmaMensaje(m, { userId, nombres }) : null;
  const fondo = mio ? C.accent : C.surface;
  const color = mio ? C.onAccent : C.text;
  const previews = m._previews || [];
  const fotos = m.fotos || [];
  const acciones = seleccionado && !borrado && !m._estado;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: mio ? "flex-end" : "flex-start", marginTop: primero ? 8 : 2 }}>
      {firma ? <div style={{ fontSize: 11.5, fontWeight: 700, color: C.textMuted, margin: "0 8px 2px" }}>{firma}</div> : null}
      <div onClick={(e) => { e.stopPropagation(); if (!borrado && !editando) onSeleccionar(); }}
        style={{ maxWidth: "min(78%, 520px)", background: borrado ? "transparent" : fondo, color: borrado ? C.textFaint : color, border: borrado ? `1px dashed ${C.borderStrong}` : mio ? "none" : `1px solid ${C.border}`, borderRadius: 16, borderTopRightRadius: mio && primero ? 4 : 16, borderTopLeftRadius: !mio && primero ? 4 : 16, padding: (fotos.length || previews.length) && !m.texto ? 4 : "8px 12px", cursor: borrado ? "default" : "pointer", opacity: m._estado === "enviando" ? 0.7 : 1, outline: seleccionado ? `2px solid ${BLUE[300]}` : "none" }}>
        {borrado ? <span style={{ fontSize: 13, fontStyle: "italic", color: C.textFaint }}>Mensaje eliminado</span> : (
          <>
            {fotos.length || previews.length ? (
              <div style={{ display: "grid", gridTemplateColumns: (fotos.length || previews.length) > 1 ? "1fr 1fr" : "1fr", gap: 4, marginBottom: m.texto ? 6 : 0 }}>
                {fotos.length ? fotos.map((p, i) => (
                  <button key={p} onClick={(e) => { e.stopPropagation(); onVerFoto(p); }} aria-label={`Ver foto ${i + 1}`} style={{ border: "none", padding: 0, background: "transparent", cursor: "zoom-in" }}>
                    <SignedImg src={p} bucket="adjuntos" miniatura alt={`Foto ${i + 1}`} style={{ width: fotos.length > 1 ? 120 : 220, height: fotos.length > 1 ? 120 : 220, maxWidth: "100%", objectFit: "cover", borderRadius: 12, display: "block" }} />
                  </button>
                )) : previews.map((u, i) => <img key={u} src={u} alt={`Foto ${i + 1}`} style={{ width: previews.length > 1 ? 120 : 220, height: previews.length > 1 ? 120 : 220, maxWidth: "100%", objectFit: "cover", borderRadius: 12, display: "block" }} />)}
              </div>
            ) : null}
            {editando ? (
              <div onClick={(e) => e.stopPropagation()} style={{ minWidth: 220 }}>
                <textarea autoFocus value={editando.texto} onChange={(e) => onCambiarEdicion(e.target.value.slice(0, MAX_TEXTO))} rows={3} aria-label="Editar mensaje"
                  style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, border: "none", padding: 8, fontSize: 14, fontFamily: "inherit", color: C.text }} />
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
                  <button onClick={onCancelarEdicion} style={{ ...btnSec, padding: "5px 10px", fontSize: 12 }}>Cancelar</button>
                  <button onClick={onGuardarEdicion} style={{ ...btnPri, padding: "5px 10px", fontSize: 12, background: BLUE[700] }}>Guardar</button>
                </div>
              </div>
            ) : m.texto ? (
              <div style={{ fontSize: 14, lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-word", color, padding: (fotos.length || previews.length) ? "0 8px 4px" : 0 }}>
                <TextoConLinks texto={m.texto} color={color} colorLink={mio ? "white" : C.accent} />
              </div>
            ) : null}
          </>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: C.textFaint, margin: "2px 8px 0", display: "flex", gap: 6, alignItems: "center" }}>
        {m._estado === "error" ? (
          <button onClick={onReintentar} style={{ border: "none", background: "none", color: C.danger, fontWeight: 700, fontSize: 11, cursor: "pointer", padding: 0 }}>No se envió · Reintentar</button>
        ) : m._estado === "enviando" ? "Enviando…" : (
          <>{horaMensaje(m.creado_en)}{m.editado_en && !borrado ? " · editado" : ""}</>
        )}
      </div>
      {acciones ? (
        <div style={{ display: "flex", gap: 6, margin: "4px 4px 0" }} onClick={(e) => e.stopPropagation()}>
          {puedeEditar(m, userId) ? (
            <>
              {m.texto ? <button onClick={onEditar} style={{ ...btnSec, padding: "6px 12px", fontSize: 12 }}>✏️ Editar</button> : null}
              <button onClick={onEliminar} style={{ ...btnSec, padding: "6px 12px", fontSize: 12, color: C.danger }}>🗑 Eliminar</button>
            </>
          ) : !staff && m.rol_autor === "usuario" && conv.tipo !== "soporte" ? (
            <button onClick={onDenunciar} style={{ ...btnSec, padding: "6px 12px", fontSize: 12, color: C.danger }}>🚩 Denunciar</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Pantalla Mensajes (tab) ─────────────────────────────────────────────────

function FilaConversacion({ c, activa, userId, onClick, tagDeCurso, esDocente }) {
  const esSoporte = c.tipo === "soporte";
  const tag = c.tipo === "directo" ? tagDeCurso?.(c.curso_id) : null;
  return (
    <button onClick={onClick} aria-current={activa ? "true" : undefined}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", background: activa ? C.accentSoft : "transparent", borderRadius: 12, cursor: "pointer", textAlign: "left", minHeight: 64 }}>
      {esSoporte ? <Avatar emoji="🛟" color={SLATE[700]} /> : c.tipo === "colegio" ? <Avatar emoji="🏫" color={SLATE[600]} /> : c.tipo === "docente" && !esDocente ? <Avatar emoji="👩‍🏫" color={SLATE[600]} /> : <Avatar texto={c.titulo} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: c.no_leidos ? 800 : 700, color: C.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.titulo}{c.silenciado ? " 🔕" : ""}
          </span>
          <span style={{ fontSize: 11, color: c.no_leidos ? C.accent : C.textFaint, fontWeight: c.no_leidos ? 700 : 400, flexShrink: 0 }}>{horaCorta(c.ultimo_en)}</span>
        </div>
        {c.subtitulo ? (
          <div style={{ fontSize: 11.5, color: C.textMuted, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
            {tag ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color, flexShrink: 0 }} /> : null}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.subtitulo}</span>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: c.no_leidos ? C.text : C.textMuted, fontWeight: c.no_leidos ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.bloqueado ? "Bloqueado" : vistaPrevia(c, userId) || (esSoporte ? "¿Tenés un problema con la app? Escribinos" : "")}
          </span>
          {c.no_leidos ? <span aria-label={`${c.no_leidos} sin leer`} style={{ background: C.accent, color: "white", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{c.no_leidos > 99 ? "99+" : c.no_leidos}</span> : null}
        </div>
      </div>
    </button>
  );
}

const SOPORTE_VACIO = { id: null, tipo: "soporte", titulo: "Soporte tribbu", ultimo_en: null, no_leidos: 0 };

/**
 * abrir: { conversacionId?, soporte?, usuarioId?, n } — pedido de navegación
 * (deep link de push, "Ayuda y soporte", "💬 Escribir" en Alumnos).
 */
export function Mensajes({ userId, items = [], tagDeCurso, isMobile, abrir, onCambio, pantallaOrigen, esDocente = false }) {
  const [convs, setConvs] = useState(null);
  const [normasOk, setNormasOk] = useState(true);
  const [activa, setActiva] = useState(null); // objeto conversación
  const [nuevo, setNuevo] = useState(false);
  const [normas, setNormas] = useState(null); // callback tras aceptar
  const [error, setError] = useState("");
  const abrirVisto = useRef(null);
  const recargaTimer = useRef(null);

  const cargar = useCallback(async () => {
    const [{ data, error: e }, { data: normasRow }] = await Promise.all([
      supabase.rpc("mis_conversaciones"),
      supabase.from("normas_chat_aceptadas").select("usuario_id").eq("usuario_id", userId).maybeSingle(),
    ]);
    if (e) { setError("No se pudieron cargar tus mensajes."); setConvs((c) => c || []); return null; }
    setError("");
    setConvs(data || []);
    setNormasOk(!!normasRow);
    return data || [];
  }, [userId]);
  useCargar(cargar);

  const recargar = useCallback(() => {
    clearTimeout(recargaTimer.current);
    recargaTimer.current = setTimeout(() => { cargar(); onCambio?.(); }, 400);
  }, [cargar, onCambio]);

  useEffect(() => {
    window.addEventListener(EVENTO_MENSAJE, recargar);
    return () => { window.removeEventListener(EVENTO_MENSAJE, recargar); clearTimeout(recargaTimer.current); };
  }, [recargar]);

  const conNormas = (fn) => { if (normasOk) fn(); else setNormas(() => fn); };

  const abrirSoporte = useCallback(async () => {
    const existente = (convs || []).find((c) => c.tipo === "soporte");
    if (existente) { setActiva(existente); return; }
    const { data: id, error: e } = await supabase.rpc("abrir_conversacion_soporte");
    if (e || !id) { setError("No se pudo abrir el chat de soporte."); return; }
    setActiva({ ...SOPORTE_VACIO, id });
  }, [convs]);

  const abrirDirecta = useCallback(async (f) => {
    const { data: id, error: e } = await supabase.rpc("abrir_conversacion_directa", { p_usuario: f.usuario_id });
    if (e || !id) return false;
    const existente = (convs || []).find((c) => c.id === id);
    setActiva(existente || {
      id, tipo: "directo", otro_id: f.usuario_id,
      titulo: `${f.nombre} ${f.apellido || ""}`.trim(),
      subtitulo: hijosDeFamilia(f) ? `familia de ${hijosDeFamilia(f)}` : null,
    });
    setNuevo(false);
    return true;
  }, [convs]);

  // Abre un hilo institucional por RPC; si todavía no está en la lista (sin
  // mensajes), se muestra con los datos que ya tenemos.
  const abrirPorRpc = useCallback(async (rpc, params, provisoria) => {
    const { data: id, error: e } = await supabase.rpc(rpc, params);
    if (e || !id) return false;
    setActiva((convs || []).find((c) => c.id === id) || { id, ...provisoria });
    setNuevo(false);
    return true;
  }, [convs]);

  const hijos = useMemo(() => items.filter((i) => i._tipo === "hijo").map((i) => ({ id: i.id, nombre: i.nombre?.split(" ")[0], curso: i.cursos?.nombre })), [items]);
  const onFamilia = (f) => {
    if (normasOk) return abrirDirecta(f);
    setNuevo(false);
    setNormas(() => () => abrirDirecta(f));
    return Promise.resolve(true);
  };
  const onDocente = (d) => abrirPorRpc("abrir_conversacion_docente", { p_hijo: d.hijo_id, p_maestro: d.maestro_id },
    { tipo: "docente", titulo: `${d.nombre} ${d.apellido || ""}`.trim(), subtitulo: [d.materia, `Sobre ${d.hijo_nombre}`].filter(Boolean).join(" · ") });
  const onSecretaria = (h) => abrirPorRpc("abrir_conversacion_colegio", { p_hijo: h.id },
    { tipo: "colegio", titulo: "Secretaría", subtitulo: `Sobre ${h.nombre}` });
  const onAlumno = (a) => abrirPorRpc("abrir_conversacion_docente", { p_hijo: a.hijo_id, p_maestro: a.maestro_id },
    { tipo: "docente", titulo: `Familia de ${a.nombre} ${a.apellido || ""}`.trim(), subtitulo: a.curso_nombre });

  // Pedidos de navegación (push, soporte, Alumnos). Se procesan una vez por `n`.
  useEffect(() => {
    if (!abrir || !convs || abrirVisto.current === abrir.n) return;
    abrirVisto.current = abrir.n;
    Promise.resolve().then(async () => {
      if (abrir.soporte) { abrirSoporte(); return; }
      if (abrir.conversacionId) {
        const c = convs.find((x) => x.id === abrir.conversacionId);
        if (c) setActiva(c);
        return;
      }
      if (abrir.usuarioId) {
        const { data } = await supabase.rpc("familias_para_mensaje");
        const f = (data || []).find((x) => x.usuario_id === abrir.usuarioId);
        if (f) conNormas(() => abrirDirecta(f));
      }
    });
  });

  // La conversación abierta toma los datos frescos de la lista (no leídos, bloqueo).
  const activaFresca = activa ? (convs || []).find((c) => c.id === activa.id) || activa : null;

  const lista = convs || [];
  const soporte = lista.find((c) => c.tipo === "soporte") || SOPORTE_VACIO;
  const otras = lista.filter((c) => c.tipo !== "soporte");

  const meta = useCallback(() => metaSoporte({
    plataforma: "web",
    sistema: navigator.userAgent.slice(0, 200),
    dispositivo: `${window.innerWidth}x${window.innerHeight}`,
    pantalla: pantallaOrigen || "mensajes",
    colegio: items.find((i) => i._tipo === "hijo")?.cursos?.colegio_id || null,
    cursos: [...new Set(items.filter((i) => i._tipo === "hijo").map((i) => i.cursos?.nombre).filter(Boolean))],
  }), [items, pantallaOrigen]);

  const panelLista = (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: isMobile ? "0 0 12px" : "4px 4px 12px" }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: C.textStrong }}>Mensajes</div>
          <div style={{ fontSize: 12.5, color: C.textMuted }}>{esDocente ? "Con las familias de tus alumnos" : "Con familias, maestras y Secretaría"}</div>
        </div>
        <button onClick={() => setNuevo(true)} style={{ ...btnPri, whiteSpace: "nowrap", minHeight: 40 }}>+ Nuevo</button>
      </div>
      {error ? <div role="alert" style={{ fontSize: 13, color: C.danger, marginBottom: 8 }}>{error}</div> : null}
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <FilaConversacion c={soporte} activa={activa?.tipo === "soporte"} userId={userId} onClick={abrirSoporte} />
        <div style={{ height: 1, background: C.border, margin: "6px 12px" }} />
        {convs === null ? <Spinner /> : null}
        {convs && !otras.length ? (
          <div style={{ border: `1.5px dashed ${C.borderStrong}`, borderRadius: 16, padding: "24px 16px", textAlign: "center", margin: "8px 4px" }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.textStrong, marginBottom: 4 }}>Todavía no tenés conversaciones</div>
            <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 12 }}>{esDocente ? "Escribile a la familia de un alumno sin compartir tu teléfono." : "Escribile a otra familia, a una maestra o a Secretaría sin compartir tu teléfono."}</div>
            <button onClick={() => setNuevo(true)} style={btnPri}>Escribir un mensaje</button>
          </div>
        ) : null}
        {otras.map((c) => (
          <FilaConversacion key={c.id} c={c} activa={activa?.id === c.id} userId={userId} tagDeCurso={tagDeCurso} esDocente={esDocente} onClick={() => setActiva(c)} />
        ))}
      </div>
    </div>
  );

  const chat = activaFresca ? (
    <ChatConversacion key={activaFresca.id} conv={activaFresca} userId={userId} normasOk={normasOk}
      onPedirNormas={() => setNormas(() => () => {})}
      onVolver={isMobile ? () => setActiva(null) : undefined}
      onCambio={recargar} meta={activaFresca.tipo === "soporte" ? meta : undefined} />
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14, textAlign: "center", padding: 24 }}>
      Elegí una conversación o escribí un mensaje nuevo.
    </div>
  );

  return (
    <>
      {nuevo ? (
        <NuevoMensajeModal esDocente={esDocente} hijos={hijos} tagDeCurso={tagDeCurso} onCerrar={() => setNuevo(false)}
          onFamilia={onFamilia} onDocente={onDocente} onSecretaria={onSecretaria} onAlumno={onAlumno} />
      ) : null}
      {normas ? <NormasModal userId={userId} onCerrar={() => setNormas(null)} onAceptar={() => { const fn = normas; setNormas(null); setNormasOk(true); fn(); }} /> : null}
      {isMobile ? (
        activaFresca ? (
          // Pantalla completa sobre el layout mobile (cubre header y barra inferior).
          <div style={{ position: "fixed", inset: 0, zIndex: 250, paddingTop: "env(safe-area-inset-top)", background: C.bg }}>{chat}</div>
        ) : panelLista
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, height: "calc(100vh - 110px)", minHeight: 480 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, minHeight: 0, overflow: "hidden" }}>{panelLista}</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", minHeight: 0 }}>{chat}</div>
        </div>
      )}
    </>
  );
}

// ── Super Admin: bandeja de soporte (solo super) ────────────────────────────

const FILTROS_SOPORTE = [
  { k: "sin_responder", label: "Sin responder" },
  { k: "abiertos", label: "Abiertos" },
  { k: "resueltos", label: "Resueltos" },
  { k: "todos", label: "Todos" },
];

export function BandejaSoporte({ userId, isMobile }) {
  const [hilos, setHilos] = useState(null);
  const [filtro, setFiltro] = useState("sin_responder");
  const [q, setQ] = useState("");
  const [activa, setActiva] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("bandeja_soporte");
    setHilos(data || []);
  }, []);
  useEffect(() => {
    Promise.resolve().then(cargar);
    const onMsg = () => { clearTimeout(timer.current); timer.current = setTimeout(cargar, 500); };
    window.addEventListener(EVENTO_MENSAJE, onMsg);
    return () => { window.removeEventListener(EVENTO_MENSAJE, onMsg); clearTimeout(timer.current); };
  }, [cargar]);

  // Datos del usuario + último diagnóstico al abrir un hilo.
  useEffect(() => {
    if (!activa) return undefined;
    let vivo = true;
    Promise.all([
      supabase.from("usuarios").select("nombre,apellido,email,telefono,rol,creado_en,usuario_hijos(hijos(nombre,apellido,cursos(nombre))),usuario_cursos(rol,cursos(nombre))").eq("id", activa.usuario_id).maybeSingle(),
      supabase.from("soporte_diagnosticos").select("datos,creado_en").eq("conversacion_id", activa.id).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([{ data: u }, { data: d }]) => { if (vivo) setDetalle({ u, d }); });
    return () => { vivo = false; setDetalle(null); };
  }, [activa]);

  const visibles = useMemo(() => {
    const t = (q || "").toLowerCase().trim();
    return (hilos || []).filter((h) => {
      if (filtro === "sin_responder" && !(h.sin_responder && h.estado !== "resuelta")) return false;
      if (filtro === "abiertos" && h.estado !== "abierta") return false;
      if (filtro === "resueltos" && h.estado !== "resuelta") return false;
      if (t && !`${h.nombre} ${h.email} ${h.colegio || ""}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [hilos, filtro, q]);

  const conv = activa ? { id: activa.id, tipo: "soporte", titulo: activa.nombre, subtitulo: [activa.email, activa.colegio].filter(Boolean).join(" · "), estado: activa.estado } : null;

  const panelUsuario = detalle ? (
    <div style={{ padding: "10px 14px", background: C.surfaceSunken, borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
      <div><b style={{ color: C.text }}>Rol:</b> {detalle.u?.rol || "—"} · <b style={{ color: C.text }}>Tel:</b> {detalle.u?.telefono || "—"}</div>
      <div><b style={{ color: C.text }}>Hijos:</b> {(detalle.u?.usuario_hijos || []).map((r) => `${r.hijos?.nombre} (${r.hijos?.cursos?.nombre || "sin curso"})`).join(", ") || "—"}</div>
      {(detalle.u?.usuario_cursos || []).some((r) => r.rol === "room") ? <div><b style={{ color: C.text }}>Room Parent:</b> {(detalle.u.usuario_cursos).filter((r) => r.rol === "room").map((r) => r.cursos?.nombre).join(", ")}</div> : null}
      {detalle.d ? (
        <div><b style={{ color: C.text }}>Dispositivo:</b> {[detalle.d.datos?.plataforma, detalle.d.datos?.version && `v${detalle.d.datos.version}`, detalle.d.datos?.sistema, detalle.d.datos?.dispositivo, detalle.d.datos?.pantalla && `desde ${detalle.d.datos.pantalla}`].filter(Boolean).join(" · ")}</div>
      ) : null}
    </div>
  ) : null;

  const lista = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS_SOPORTE.map((f) => {
          const n = f.k === "sin_responder" ? (hilos || []).filter((h) => h.sin_responder && h.estado !== "resuelta").length : null;
          return (
            <button key={f.k} onClick={() => setFiltro(f.k)} aria-pressed={filtro === f.k}
              style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${filtro === f.k ? C.accent : C.borderStrong}`, background: filtro === f.k ? C.accentSoft : C.surface, color: filtro === f.k ? BLUE[700] : SLATE[600], fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {f.label}{n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, email o colegio" aria-label="Buscar"
        style={{ padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {hilos === null ? <Spinner /> : null}
        {hilos && !visibles.length ? <div style={{ fontSize: 13, color: C.textMuted, padding: 16, textAlign: "center" }}>No hay consultas acá. 🎉</div> : null}
        {visibles.map((h) => (
          <button key={h.id} onClick={() => setActiva(h)}
            style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "none", borderRadius: 12, background: activa?.id === h.id ? C.accentSoft : "transparent", cursor: "pointer", minHeight: 60 }}>
            <Avatar texto={h.nombre} color={SLATE[600]} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: C.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.nombre}</span>
                <span style={{ fontSize: 11, color: C.textFaint, flexShrink: 0 }}>{horaCorta(h.ultimo_en)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.colegio || "Sin colegio"} · {h.estado === "resuelta" ? "✓ resuelto" : h.sin_responder ? "sin responder" : "respondido"}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.ultimo_rol_autor === "soporte" ? "Vos: " : ""}{h.ultimo_texto || (h.ultimo_fotos ? "📷 Foto" : "")}
                </span>
                {h.no_leidos ? <span style={{ background: C.danger, color: "white", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{h.no_leidos}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const chat = conv ? (
    <ChatConversacion key={conv.id} conv={conv} userId={userId} modo="staff" onCambio={cargar}
      onVolver={isMobile ? () => setActiva(null) : undefined} encabezadoExtra={panelUsuario} />
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14 }}>Elegí una consulta.</div>
  );

  if (isMobile) {
    return conv
      ? <div style={{ position: "fixed", inset: 0, zIndex: 250, background: C.bg }}>{chat}</div>
      : <div style={{ height: "70vh" }}>{lista}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, height: "calc(100vh - 200px)", minHeight: 480 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, minHeight: 0, overflow: "hidden" }}>{lista}</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", minHeight: 0 }}>{chat}</div>
    </div>
  );
}

// ── Super Admin: soporte del lado del colegio_admin (escribir a tribbu) ─────

export function SoporteColegioAdmin({ userId, colegioNombre, isMobile }) {
  const [conv, setConv] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let vivo = true;
    supabase.rpc("abrir_conversacion_soporte").then(({ data, error: e }) => {
      if (!vivo) return;
      if (e || !data) { setError("No se pudo abrir el chat de soporte."); return; }
      setConv({ ...SOPORTE_VACIO, id: data });
    });
    return () => { vivo = false; };
  }, []);
  const meta = useCallback(() => metaSoporte({
    plataforma: "web", sistema: navigator.userAgent.slice(0, 200),
    dispositivo: `${window.innerWidth}x${window.innerHeight}`, pantalla: "panel colegio", colegio: colegioNombre || null,
  }), [colegioNombre]);
  if (error) return <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{error}</div>;
  if (!conv) return <Spinner />;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", height: isMobile ? "70vh" : "calc(100vh - 220px)", minHeight: 420 }}>
      <ChatConversacion conv={conv} userId={userId} meta={meta} />
    </div>
  );
}

// ── Super Admin: denuncias (colegio_admin de su colegio, o super) ───────────

export function DenunciasColegio({ colegioId }) {
  const [denuncias, setDenuncias] = useState(null);
  const [filtro, setFiltro] = useState("pendiente");
  const [trabajando, setTrabajando] = useState(null);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    let q = supabase.from("mensaje_denuncias").select("*").order("creado_en", { ascending: false }).limit(200);
    if (colegioId) q = q.eq("colegio_id", colegioId);
    const { data, error: e } = await q;
    if (e) setError("No se pudieron cargar las denuncias.");
    const lista = data || [];
    // Nombre de quien denunció (lo ve el colegio; el autor del mensaje no).
    const ids = [...new Set(lista.map((d) => d.denunciante_id).filter(Boolean))];
    const { data: us } = ids.length ? await supabase.from("usuarios").select("id,nombre,apellido").in("id", ids) : { data: [] };
    const nombre = Object.fromEntries((us || []).map((u) => [u.id, `${u.nombre} ${u.apellido || ""}`.trim()]));
    setDenuncias(lista.map((d) => ({ ...d, denunciante: nombre[d.denunciante_id] || "—" })));
  }, [colegioId]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  const resolver = async (d, eliminar) => {
    if (eliminar && !window.confirm("¿Eliminar el mensaje? Se va a ver como \"Mensaje eliminado\" para todos.")) return;
    setTrabajando(d.id);
    const { error: e } = await supabase.rpc("resolver_denuncia", { p_denuncia: d.id, p_eliminar: eliminar });
    setTrabajando(null);
    if (e) { setError("No se pudo resolver la denuncia."); return; }
    cargar();
  };

  const visibles = (denuncias || []).filter((d) => filtro === "todas" || d.estado === filtro);
  const pendientes = (denuncias || []).filter((d) => d.estado === "pendiente").length;

  return (
    <div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12, lineHeight: 1.5, maxWidth: 640 }}>
        Acá ves <b>solo</b> los mensajes que una familia denunció — nunca el resto de las conversaciones. Podés eliminar el mensaje (queda como “Mensaje eliminado”) o marcar la denuncia como resuelta sin hacer nada.
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[{ k: "pendiente", l: `Pendientes${pendientes ? ` · ${pendientes}` : ""}` }, { k: "resuelta", l: "Resueltas" }, { k: "todas", l: "Todas" }].map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)} aria-pressed={filtro === f.k}
            style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${filtro === f.k ? C.accent : C.borderStrong}`, background: filtro === f.k ? C.accentSoft : C.surface, color: filtro === f.k ? BLUE[700] : SLATE[600], fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{f.l}</button>
        ))}
      </div>
      {error ? <div role="alert" style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {denuncias === null ? <Spinner /> : null}
      {denuncias && !visibles.length ? (
        <div style={{ border: `1.5px dashed ${C.borderStrong}`, borderRadius: 16, padding: 24, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
          {filtro === "pendiente" ? "No hay denuncias pendientes." : "No hay denuncias."}
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibles.map((d) => (
          <div key={d.id} style={{ background: C.surface, border: `1px solid ${d.estado === "pendiente" ? C.dangerBorder : C.border}`, borderRadius: 16, padding: 14 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: d.estado === "pendiente" ? C.dangerSoft : C.successSoft, color: d.estado === "pendiente" ? C.danger : C.success }}>
                {d.estado === "pendiente" ? "Pendiente" : d.accion === "mensaje_eliminado" ? "Mensaje eliminado" : "Resuelta"}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{motivoDenuncia(d.motivo)}</span>
              <span style={{ fontSize: 11.5, color: C.textFaint, marginLeft: "auto" }}>{new Date(d.creado_en).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 6 }}>Escribió: <b style={{ color: C.text }}>{d.autor_snapshot || "—"}</b> · Denunció: <b style={{ color: C.text }}>{d.denunciante}</b></div>
            <div style={{ fontSize: 13.5, color: C.text, background: C.surfaceSunken, borderRadius: 10, padding: "10px 12px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {d.texto_snapshot || <i style={{ color: C.textFaint }}>(sin texto)</i>}
            </div>
            {(d.fotos_snapshot || []).length ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {d.fotos_snapshot.map((p) => <SignedImg key={p} src={p} bucket="adjuntos" miniatura alt="Foto denunciada" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />)}
              </div>
            ) : null}
            {d.detalle ? <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 8 }}>Comentario: “{d.detalle}”</div> : null}
            {d.estado === "pendiente" ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={() => resolver(d, true)} disabled={trabajando === d.id || !d.mensaje_id} style={{ ...btnPri, background: C.danger, opacity: trabajando === d.id ? 0.6 : 1 }}>🗑 Eliminar mensaje</button>
                <button onClick={() => resolver(d, false)} disabled={trabajando === d.id} style={btnSec}>Marcar resuelta</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Super Admin (colegio_admin): Secretaría + chats familia ↔ docente ───────
// Secretaría: el colegio responde (firma "Secretaría"). Hilos con docentes:
// el colegio solo lee (decisión 2026-10-10: son conversaciones institucionales).

const FILTROS_COLEGIO = [
  { k: "sin_responder", label: "Sin responder" },
  { k: "secretaria", label: "Secretaría" },
  { k: "docentes", label: "Con maestras" },
];

export function BandejaColegio({ userId, isMobile }) {
  const [hilos, setHilos] = useState(null);
  const [filtro, setFiltro] = useState("sin_responder");
  const [q, setQ] = useState("");
  const [activa, setActiva] = useState(null);
  const [error, setError] = useState("");
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc("bandeja_colegio");
    if (e) setError("No se pudieron cargar los mensajes.");
    setHilos(data || []);
  }, []);
  useEffect(() => {
    Promise.resolve().then(cargar);
    const onMsg = () => { clearTimeout(timer.current); timer.current = setTimeout(cargar, 500); };
    window.addEventListener(EVENTO_MENSAJE, onMsg);
    return () => { window.removeEventListener(EVENTO_MENSAJE, onMsg); clearTimeout(timer.current); };
  }, [cargar]);

  const visibles = useMemo(() => {
    const t = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    return (hilos || []).filter((h) => {
      if (filtro === "sin_responder" && !h.sin_responder) return false;
      if (filtro === "secretaria" && h.tipo !== "colegio") return false;
      if (filtro === "docentes" && h.tipo !== "docente") return false;
      if (t && !`${h.alumno} ${h.curso} ${h.docente || ""}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(t)) return false;
      return true;
    });
  }, [hilos, filtro, q]);

  const conv = activa ? {
    id: activa.id, tipo: activa.tipo,
    titulo: activa.tipo === "docente" ? `${activa.docente} ↔ familia de ${activa.alumno}` : `Familia de ${activa.alumno}`,
    subtitulo: activa.curso,
  } : null;

  const lista = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0, height: "100%" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS_COLEGIO.map((f) => {
          const n = f.k === "sin_responder" ? (hilos || []).filter((h) => h.sin_responder).length : null;
          return (
            <button key={f.k} onClick={() => setFiltro(f.k)} aria-pressed={filtro === f.k}
              style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${filtro === f.k ? C.accent : C.borderStrong}`, background: filtro === f.k ? C.accentSoft : C.surface, color: filtro === f.k ? BLUE[700] : SLATE[600], fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {f.label}{n ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por alumno, curso o maestra" aria-label="Buscar"
        style={{ padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
      {error ? <div role="alert" style={{ color: C.danger, fontSize: 13 }}>{error}</div> : null}
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
        {hilos === null ? <Spinner /> : null}
        {hilos && !visibles.length ? <Vacio texto={filtro === "sin_responder" ? "No hay mensajes sin responder. 🎉" : "No hay conversaciones acá."} /> : null}
        {visibles.map((h) => (
          <button key={h.id} onClick={() => setActiva(h)}
            style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", border: "none", borderRadius: 12, background: activa?.id === h.id ? C.accentSoft : "transparent", cursor: "pointer", minHeight: 60 }}>
            <Avatar emoji={h.tipo === "docente" ? "👩‍🏫" : "🏫"} color={SLATE[600]} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: C.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Familia de {h.alumno}</span>
                <span style={{ fontSize: 11, color: C.textFaint, flexShrink: 0 }}>{horaCorta(h.ultimo_en)}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {h.curso} · {h.tipo === "docente" ? `con ${h.docente} (solo lectura)` : h.sin_responder ? "Secretaría · sin responder" : "Secretaría"}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.ultimo_rol_autor === "colegio" ? "Secretaría: " : h.ultimo_rol_autor === "docente" ? "Docente: " : ""}{h.ultimo_texto || (h.ultimo_fotos ? "📷 Foto" : "")}
                </span>
                {h.no_leidos ? <span style={{ background: C.danger, color: "white", borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: "0 6px", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{h.no_leidos}</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const chat = conv ? (
    <ChatConversacion key={conv.id} conv={conv} userId={userId} modo="staff" rolPropio="colegio" soloLectura={conv.tipo === "docente"}
      onCambio={cargar} onVolver={isMobile ? () => setActiva(null) : undefined} />
  ) : (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 14 }}>Elegí una conversación.</div>
  );

  if (isMobile) {
    return conv
      ? <div style={{ position: "fixed", inset: 0, zIndex: 250, background: C.bg }}>{chat}</div>
      : <div style={{ height: "70vh" }}>{lista}</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, height: "calc(100vh - 200px)", minHeight: 480 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 12, minHeight: 0, overflow: "hidden" }}>{lista}</div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", minHeight: 0 }}>{chat}</div>
    </div>
  );
}
