// Autorizaciones digitales (ver specs/autorizaciones.md). El colegio (desde el
// Super Admin, a uno o varios cursos) o el Room Parent (a su curso) publica una
// autorización; cada familia responde por hijo: Autorizo / No autorizo, quién
// lo retira y un comentario. Quien la creó, el Room Parent del curso y el
// colegio ven todas las respuestas y las exportan a Excel. La fecha límite
// (opcional) también la hace cumplir la RLS (supabase/autorizaciones.sql).
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../supabase";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { sanitize, fmtLocalDate, fmtNombre, uuidLite } from "../../lib/helpers";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { estaAbierta, estadoPorAlumno, resumenRespuestas, estadoConvocatoria, limiteCercano, textoConfirmacion, textoRespuesta, fechaAut } from "../../lib/autorizaciones";
import { Icono } from "../../components/Icono";
import { useConfirmar } from "../../hooks/useConfirmar";
import { Card } from "../../components/Card";
import { useCargar } from "../../hooks/useCargar";
import { CursoListSelector } from "../../components/CursoListSelector";

const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };
const label = { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 };
const fmtFecha = (s) => new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const fmtCuando = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Lista para imprimir el día de la salida.
async function exportarExcel(titulo, filas) {
  // xlsx (~400 KB) se carga recién al exportar/importar, no con la app.
  const XLSX = await import("xlsx");
  const rows = filas.map(({ hijo, respuesta, curso }) => ({
    ...(curso ? { Curso: curso } : {}),
    Alumno: fmtNombre(hijo),
    Respuesta: !respuesta ? "Sin responder" : respuesta.autoriza ? "Autorizado" : "No autorizado",
    "Quién retira": respuesta?.retira || "",
    Comentario: respuesta?.comentario || "",
    "Respondió": respuesta ? fmtNombre(respuesta.usuarios) : "",
    Fecha: respuesta ? fmtCuando(respuesta.respondido_en) : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Respuestas");
  XLSX.writeFile(wb, `${titulo.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "autorizacion"}.xlsx`);
}

function Resumen({ alumnos, respuestas }) {
  const r = resumenRespuestas(alumnos, respuestas);
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#334155" }}>
      {r.autorizados} {r.autorizados === 1 ? "autorizado" : "autorizados"}
      <span style={{ color: r.noAutorizados ? "#B91C1C" : "#334155" }}> · {r.noAutorizados} no</span>
      <span style={{ color: "#64748B" }}> · {r.sinResponder} sin responder</span>
    </span>
  );
}

/** Detalle por alumno (creador / Room Parent / colegio). `grupos`: [{ nombreCurso, alumnos, respuestas }] */
function DetalleRespuestas({ titulo, grupos }) {
  const [abierto, setAbierto] = useState(false);
  const filas = grupos.flatMap((g) => estadoPorAlumno(g.alumnos, g.respuestas).map((f) => ({ ...f, curso: grupos.length > 1 ? g.nombreCurso : null })));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Resumen alumnos={grupos.flatMap((g) => g.alumnos)} respuestas={grupos.flatMap((g) => g.respuestas)} />
        <button onClick={() => setAbierto((p) => !p)} style={{ border: "none", background: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0, fontFamily: "inherit" }}>
          {abierto ? "Ocultar respuestas" : "Ver respuestas"}
        </button>
        <button onClick={() => exportarExcel(titulo, filas)} style={{ border: "none", background: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0, fontFamily: "inherit" }}>
          Exportar Excel
        </button>
      </div>
      {abierto && (
        <div style={{ marginTop: 10, borderTop: "1px solid #F1F5F9" }}>
          {filas.map(({ hijo, respuesta, curso }) => (
            <div key={hijo.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #F1F5F9", alignItems: "flex-start" }}>
              <span style={{ fontSize: 14, lineHeight: "20px" }}>{!respuesta ? "⏳" : respuesta.autoriza ? "✅" : "❌"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{fmtNombre(hijo)}{curso && <span style={{ fontWeight: 400, color: "#94A3B8" }}> · {curso}</span>}</div>
                {respuesta ? (
                  <div style={{ fontSize: 11.5, color: "#64748B", lineHeight: 1.45 }}>
                    {respuesta.retira && <>Retira: <b>{respuesta.retira}</b> · </>}
                    {respuesta.comentario && <>“{respuesta.comentario}” · </>}
                    {fmtNombre(respuesta.usuarios)}, {fmtCuando(respuesta.respondido_en)}
                  </div>
                ) : <div style={{ fontSize: 11.5, color: "#94A3B8" }}>Sin responder</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Respuesta de UN hijo (rediseño etapa 3): separada del estado de la
// convocatoria. Sin responder y abierta → formulario; respondida → "Autorizada"
// / "No autorizada" con quién retira y "Cambiar" mientras siga abierta.
function FormRespuesta({ autorizacion, hijo, respuesta, userId, onGuardado }) {
  const [editando, setEditando] = useState(!respuesta);
  const [form, setForm] = useState({ autoriza: respuesta?.autoriza ?? null, retira: respuesta?.retira || "", comentario: respuesta?.comentario || "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const abierta = estaAbierta(autorizacion, fmtLocalDate());

  const guardar = async () => {
    if (form.autoriza === null) { setError("Elegí Autorizo o No autorizo."); return; }
    setGuardando(true); setError(null);
    const { error: err } = await supabase.from("autorizacion_respuestas").upsert({
      autorizacion_id: autorizacion.id, hijo_id: hijo.id, usuario_id: userId, autoriza: form.autoriza,
      retira: sanitize(form.retira) || null, comentario: sanitize(form.comentario) || null, respondido_en: new Date().toISOString(),
    }, { onConflict: "autorizacion_id,hijo_id" });
    setGuardando(false);
    if (err) { setError(abierta ? "No se pudo guardar. Probá de nuevo." : "La fecha límite ya pasó."); return; }
    setEditando(false);
    onGuardado?.({ autoriza: form.autoriza, nombre: hijo.nombre });
  };

  const nombre = hijo.nombre;
  if (!editando && respuesta) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderTop: "1px solid #F1F5F9" }}>
        <span style={{ marginTop: 1 }}><Icono nombre={respuesta.autoriza ? "check" : "cerrar"} size={18} color={respuesta.autoriza ? "#047857" : "#B91C1C"} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
            <span style={{ color: "#0F172A" }}>{nombre}: </span>
            <span style={{ color: respuesta.autoriza ? "#047857" : "#B91C1C" }}>{textoRespuesta(respuesta)}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2, lineHeight: 1.45 }}>
            {[respuesta.retira ? `Retira: ${respuesta.retira}` : null, respuesta.comentario ? `“${respuesta.comentario}”` : null, `Respondido el ${fmtCuando(respuesta.respondido_en)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        {abierta && <button onClick={() => setEditando(true)} style={{ border: "none", background: "none", color: "#2563EB", cursor: "pointer", fontSize: 13, fontWeight: 700, padding: 0, fontFamily: "inherit" }}>Cambiar</button>}
      </div>
    );
  }
  if (!abierta) {
    return (
      <div style={{ padding: "12px 0", borderTop: "1px solid #F1F5F9", fontSize: 13, color: "#64748B" }}>
        <b style={{ color: "#0F172A" }}>{nombre}:</b> sin responder · la fecha límite ya pasó.
      </div>
    );
  }
  const opcion = (valor, txt) => {
    const act = form.autoriza === valor;
    return (
      <button onClick={() => setForm((p) => ({ ...p, autoriza: valor }))} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${act ? "#0F172A" : "#E2E8F0"}`, background: act ? "#F8FAFC" : "white", cursor: "pointer", fontFamily: "inherit" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: act ? "#0F172A" : "#64748B" }}>{txt}</span>
      </button>
    );
  };
  return (
    <div style={{ padding: "12px 0", borderTop: "1px solid #F1F5F9" }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
        <span style={{ color: "#0F172A" }}>{nombre}: </span><span style={{ color: "#64748B", fontWeight: 600 }}>{respuesta ? "cambiar respuesta" : "falta tu respuesta"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {opcion(true, "Autorizo")}
        {opcion(false, "No autorizo")}
      </div>
      <input value={form.retira} onChange={(e) => setForm((p) => ({ ...p, retira: e.target.value }))} placeholder="¿Quién lo retira? (ej: la mamá, Juana Pérez)" style={{ ...inp, marginBottom: 8 }} />
      <textarea value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} placeholder="Comentario (opcional)" rows={2} style={{ ...inp, resize: "vertical", marginBottom: 8 }} />
      {error && <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {respuesta && <button onClick={() => setEditando(false)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, color: "#64748B", fontFamily: "inherit" }}>Cancelar</button>}
        <button onClick={guardar} disabled={guardando} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", opacity: guardando ? 0.6 : 1, fontFamily: "inherit" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "white" }}>{guardando ? "Enviando…" : "Enviar respuesta"}</span>
        </button>
      </div>
    </div>
  );
}

/** Alta de una autorización en uno o varios cursos (Room Parent: su curso; colegio: varios). */
function NuevaAutorizacion({ cursosDestino, userId, onClose, onCreada }) {
  const [form, setForm] = useState({ titulo: "", descripcion: "", fecha_evento: "", fecha_limite: "", cursos: cursosDestino.length === 1 ? [cursosDestino[0].id] : [] });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const toggleCurso = (id) => setForm((p) => ({ ...p, cursos: p.cursos.includes(id) ? p.cursos.filter((x) => x !== id) : [...p.cursos, id] }));

  const publicar = async () => {
    if (!form.titulo.trim()) { setError("Falta el título."); return; }
    if (!form.cursos.length) { setError("Elegí al menos un curso."); return; }
    if (form.fecha_limite && form.fecha_evento && form.fecha_limite > form.fecha_evento) { setError("La fecha límite no puede ser posterior a la salida."); return; }
    setGuardando(true); setError(null);
    const grupo_id = form.cursos.length > 1 ? uuidLite() : null;
    const rows = form.cursos.map((curso_id) => ({
      curso_id, grupo_id, titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null,
      fecha_evento: form.fecha_evento || null, fecha_limite: form.fecha_limite || null, creado_por: userId,
    }));
    const { error: err } = await supabase.from("autorizaciones").insert(rows);
    if (err) { setGuardando(false); setError("No se pudo publicar: " + err.message); return; }
    const userIds = [...new Set((await Promise.all(form.cursos.map(getUserIdsByCurso))).flat())].filter((u) => u !== userId);
    await sendPush({ type: "autorizacion", payload: { titulo: form.titulo.trim(), userIds } });
    setGuardando(false);
    onCreada?.();
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>Nueva autorización</div>
        {cursosDestino.length > 1 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={label}>CURSOS{form.cursos.length ? ` · ${form.cursos.length} ${form.cursos.length === 1 ? "ELEGIDO" : "ELEGIDOS"}` : ""}</div>
              <button type="button" onClick={() => setForm((p) => ({ ...p, cursos: p.cursos.length === cursosDestino.length ? [] : cursosDestino.map((c) => c.id) }))} style={{ border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>{form.cursos.length === cursosDestino.length ? "Ninguno" : "Seleccionar todos"}</span>
              </button>
            </div>
            {/* Lista con casillas y scroll (y "Todo Primaria" si hay niveles): con muchos cursos, los botones ocupaban medio formulario. */}
            <CursoListSelector cursos={cursosDestino} seleccionados={form.cursos} onToggle={toggleCurso} maxHeight={200} />
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <div style={label}>TÍTULO</div>
          <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} placeholder="Ej: Salida a la Granja Educativa" style={inp} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={label}>DETALLE (opcional)</div>
          <textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Horario, lugar, qué llevar, costo…" rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            <div style={label}>FECHA DE LA SALIDA (opcional)</div>
            <input type="date" value={form.fecha_evento} onChange={(e) => setForm((p) => ({ ...p, fecha_evento: e.target.value }))} style={inp} />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <div style={label}>RESPONDER HASTA (opcional)</div>
            <input type="date" value={form.fecha_limite} onChange={(e) => setForm((p) => ({ ...p, fecha_limite: e.target.value }))} style={inp} />
          </div>
        </div>
        <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 12, lineHeight: 1.45 }}>
          Cada familia va a responder por hijo si autoriza o no, quién lo retira y un comentario. Les llega una notificación.
        </div>
        {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, color: "#94A3B8" }}>Cancelar</button>
          <button onClick={publicar} disabled={guardando} style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Publicando…" : "Publicar"}</button>
        </div>
      </div>
    </div>
  );
}

async function cargarDatos(cursoIds, { soloGestion = false, misHijosIds = [] } = {}) {
  const { data: auts } = await supabase.from("autorizaciones").select("*").in("curso_id", cursoIds).order("creado_en", { ascending: false });
  const ids = (auts || []).map((a) => a.id);
  const [resp, alumnos, misHijos] = await Promise.all([
    ids.length ? supabase.from("autorizacion_respuestas").select("*, usuarios(nombre,apellido)").in("autorizacion_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("hijos").select("id,nombre,apellido,curso_id").in("curso_id", cursoIds),
    !soloGestion && misHijosIds.length ? supabase.from("hijos").select("id,nombre,apellido,curso_id").in("id", misHijosIds) : Promise.resolve({ data: [] }),
  ]);
  return { autorizaciones: auts || [], respuestas: resp.data || [], alumnos: alumnos.data || [], misHijos: misHijos.data || [] };
}

/** Pestaña de las familias / Room Parent. */
export function Autorizaciones({ cursoId, cursoIds = [], esVistaTodos = false, tagDeCurso = null, cursosAdmin = [], userId, isAdmin, misHijos = [], cursosDocente = [], abrir = null }) {
  const [datos, setDatos] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [cursosInfo, setCursosInfo] = useState([]);
  const [confirmaciones, setConfirmaciones] = useState({}); // autorizacion_id → "Respuesta enviada: …"
  const [resaltar, setResaltar] = useState(null);
  const [confirmar, confirmUI] = useConfirmar();
  const hoyStr = fmtLocalDate();
  // Desde Hoy ("Responder autorización"): llevar a esa tarjeta y resaltarla un
  // momento (el formulario del hijo sin responder ya está abierto adentro).
  const listo = !!datos;
  useEffect(() => {
    if (!abrir?.id || !listo) return undefined;
    const id = abrir.id;
    const t1 = setTimeout(() => {
      document.getElementById(`aut-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setResaltar(id);
    }, 60);
    const t2 = setTimeout(() => setResaltar(null), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [abrir?.id, abrir?.n, listo]);
  // cursoIds y misHijos llegan memoizados desde App.jsx.
  const cargar = useCallback(async () => {
    if (!cursoIds.length) return;
    setDatos(await cargarDatos(cursoIds, { misHijosIds: misHijos }));
  }, [cursoIds, misHijos]);
  useCargar(cargar);

  // Cursos donde puede crear: Room Parent (en Todos, los de cursosAdmin).
  // Room Parent: gestiona todo lo del curso. Docente: crea en sus cursos, pero
  // gestiona solo lo suyo (RLS: puede_ver_lecturas = creador o colegio).
  const cursosRoom = esVistaTodos ? cursosAdmin : (isAdmin && cursoId ? [cursoId] : []);
  const cursosDoc = esVistaTodos ? cursosDocente : (cursoId && cursosDocente.includes(cursoId) ? [cursoId] : []);
  const cursosQueGestiona = [...new Set([...cursosRoom, ...cursosDoc])];
  useEffect(() => {
    if (!cursosQueGestiona.length) return;
    supabase.from("cursos").select("id,nombre").in("id", cursosQueGestiona).then(({ data }) => setCursosInfo(data || []));
  }, [cursosQueGestiona.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const gestiona = (a) => a.creado_por === userId || cursosRoom.includes(a.curso_id);

  if (!datos) return <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div>;
  const { autorizaciones, respuestas, alumnos } = datos;
  const abiertas = autorizaciones.filter((a) => estaAbierta(a, hoyStr));
  const cerradas = autorizaciones.filter((a) => !estaAbierta(a, hoyStr));

  const tarjeta = (a) => {
    const tag = tagDeCurso?.(a.curso_id);
    const misDelCurso = datos.misHijos.filter((h) => h.curso_id === a.curso_id);
    const respDe = respuestas.filter((r) => r.autorizacion_id === a.id);
    const urgente = limiteCercano(a, hoyStr);
    const resaltada = resaltar === a.id;
    const confirm = confirmaciones[a.id];
    return (
      <div key={a.id} id={`aut-${a.id}`} style={{ border: `1px solid ${resaltada ? "#93C5FD" : "#E2E8F0"}`, boxShadow: resaltada ? "0 0 0 3px #DBEAFE" : "none", borderRadius: 16, background: "white", padding: "16px 18px", marginBottom: 12, transition: "box-shadow .3s, border-color .3s" }}>
        {/* Convocatoria: de quién es y hasta cuándo está abierta. */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "#64748B" }}>
            {tag && <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: tag.color }} /><span style={{ color: "#475569" }}>{tag.nombre}</span></span>}
            {a.grupo_id && <span style={{ color: "#64748B" }}>{tag ? "· " : ""}Del colegio</span>}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748B", whiteSpace: "nowrap" }}>{estadoConvocatoria(a, hoyStr)}</span>
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", lineHeight: 1.35, marginTop: 8 }}>{a.titulo}</div>
        {/* Fecha de la salida y fecha límite, bien diferenciadas. */}
        {(a.fecha_evento || a.fecha_limite) && (
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, rowGap: 4, fontSize: 13 }}>
            {a.fecha_evento && <><span style={{ color: "#64748B" }}>Salida</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{fechaAut(a.fecha_evento)}</span></>}
            {a.fecha_limite && <><span style={{ color: "#64748B" }}>Responder hasta</span><span style={{ color: urgente ? "#B45309" : "#0F172A", fontWeight: 600 }}>{fechaAut(a.fecha_limite)}</span></>}
          </div>
        )}
        {a.descripcion && <div style={{ fontSize: 13, color: "#475569", marginTop: 10, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.descripcion}</div>}
        {confirm && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "9px 12px", borderRadius: 10, background: "#F0FDF4" }}>
            <Icono nombre="check" size={16} color="#047857" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>{confirm}</span>
          </div>
        )}
        {/* Tu respuesta: una por hijo. */}
        {misDelCurso.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 2 }}>{misDelCurso.length > 1 ? "Tus respuestas" : "Tu respuesta"}</div>
            {misDelCurso.map((h) => (
              <FormRespuesta key={`${h.id}-${respDe.find((r) => r.hijo_id === h.id)?.respondido_en || "nueva"}`} autorizacion={a} hijo={h} respuesta={respDe.find((r) => r.hijo_id === h.id) || null} userId={userId}
                onGuardado={(r) => { setConfirmaciones((p) => ({ ...p, [a.id]: textoConfirmacion(r.autoriza, r.nombre) })); cargar(); }} />
            ))}
          </div>
        )}
        {gestiona(a) && (
          <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 12 }}>
            <DetalleRespuestas titulo={a.titulo} grupos={[{ nombreCurso: tag?.nombre || "", alumnos: alumnos.filter((h) => h.curso_id === a.curso_id), respuestas: respDe }]} />
            <button onClick={async () => { if (!(await confirmar({ titulo: "Eliminar autorización", detalle: "Se borran también todas sus respuestas.", textoConfirmar: "Eliminar" }))) return; await supabase.from("autorizaciones").delete().eq("id", a.id); cargar(); }} style={{ marginTop: 10, border: "none", background: "none", color: "#DC2626", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, fontFamily: "inherit" }}>Eliminar</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {confirmUI}
      {nueva && <NuevaAutorizacion cursosDestino={cursosInfo} userId={userId} onClose={() => setNueva(false)} onCreada={cargar} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3 }}>Autorizaciones</div>
          <div style={{ fontSize: 13, color: "#64748B" }}>Salidas y actividades que necesitan tu permiso</div>
        </div>
        {cursosInfo.length > 0 && <BotonNuevo onClick={() => setNueva(true)} ariaLabel="Nueva autorización" />}
      </div>
      {!autorizaciones.length && (
        <Card style={{ padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>No hay autorizaciones</div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>Cuando el colegio o el Room Parent pida permiso para una salida, aparece acá.</div>
        </Card>
      )}
      {abiertas.map(tarjeta)}
      {cerradas.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "18px 0 8px" }}>Cerradas</div>}
      {cerradas.map(tarjeta)}
    </div>
  );
}

/** Sección del Super Admin: publicar en varios cursos y ver las respuestas por grupo. */
export function AutorizacionesColegio({ cursos, userId, abrirNuevo = null }) {
  const [datos, setDatos] = useState(null);
  const [nueva, setNueva] = useState(false);
  // "+ Crear → Autorización" del panel: abrir el alta al llegar (abrirNuevo = nonce).
  useEffect(() => { if (abrirNuevo) Promise.resolve().then(() => setNueva(true)); }, [abrirNuevo]);
  const [confirmar, confirmUI] = useConfirmar();
  // `cursos` se recalcula en cada render del Super Admin: ids estables por clave.
  const clave = cursos.map((c) => c.id).join(",");
  const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);
  const cargar = useCallback(async () => { if (ids.length) setDatos(await cargarDatos(ids, { soloGestion: true })); }, [ids]);
  useCargar(cargar);

  const nombreCurso = new Map(cursos.map((c) => [c.id, c.nombre]));
  // Agrupar las filas multi-curso (mismo grupo_id) en una sola tarjeta.
  const grupos = [];
  const porGrupo = new Map();
  for (const a of datos?.autorizaciones || []) {
    const k = a.grupo_id || a.id;
    if (!porGrupo.has(k)) { porGrupo.set(k, { ...a, filas: [] }); grupos.push(porGrupo.get(k)); }
    porGrupo.get(k).filas.push(a);
  }
  const hoyStr = fmtLocalDate();

  return (
    <div>
      {nueva && <NuevaAutorizacion cursosDestino={cursos} userId={userId} onClose={() => setNueva(false)} onCreada={cargar} />}
      {confirmUI}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <BotonNuevo onClick={() => setNueva(true)} ariaLabel="Nueva autorización" />
      </div>
      {!datos ? <div style={{ color: "#94A3B8", fontSize: 13 }}>Cargando…</div> : !grupos.length ? (
        <EmptyState icono="firma" titulo="Todavía no hay autorizaciones" nota="Pedí permiso para una salida o actividad a uno o varios cursos; cada familia responde por hijo." accion="Nueva autorización" onAccion={() => setNueva(true)} />
      ) : grupos.map((g) => (
        <Card key={g.grupo_id || g.id} style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{g.titulo}</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: "#F1F5F9", color: estaAbierta(g, hoyStr) ? "#334155" : "#94A3B8", flexShrink: 0 }}>{estaAbierta(g, hoyStr) ? "Abierta" : "Cerrada"}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4 }}>
            {g.filas.map((f) => nombreCurso.get(f.curso_id)).filter(Boolean).join(", ")}
            {g.fecha_evento ? ` · Salida ${fmtFecha(g.fecha_evento)}` : ""}
            {g.fecha_limite ? ` · Responder hasta el ${fmtFecha(g.fecha_limite)}` : ""}
          </div>
          <DetalleRespuestas titulo={g.titulo} grupos={g.filas.map((f) => ({
            nombreCurso: nombreCurso.get(f.curso_id) || "",
            alumnos: datos.alumnos.filter((h) => h.curso_id === f.curso_id),
            respuestas: datos.respuestas.filter((r) => r.autorizacion_id === f.id),
          }))} />
          <button onClick={async () => { if (!(await confirmar({ titulo: "Eliminar autorización", detalle: "Se borra en todos sus cursos, con sus respuestas.", textoConfirmar: "Eliminar" }))) return; await supabase.from("autorizaciones").delete().in("id", g.filas.map((f) => f.id)); cargar(); }} style={{ marginTop: 10, border: "none", background: "none", color: "#EF4444", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }}>Eliminar</button>
        </Card>
      ))}
    </div>
  );
}
