// Autorizaciones digitales (ver specs/autorizaciones.md). El colegio (desde el
// Super Admin, a uno o varios cursos) o el Room Parent (a su curso) publica una
// autorización; cada familia responde por hijo: Autorizo / No autorizo, quién
// lo retira y un comentario. Quien la creó, el Room Parent del curso y el
// colegio ven todas las respuestas y las exportan a Excel. La fecha límite
// (opcional) también la hace cumplir la RLS (supabase/autorizaciones.sql).
import { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../supabase";
import { sanitize, fmtLocalDate, fmtNombre, uuidLite } from "../../lib/helpers";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { estaAbierta, estadoPorAlumno, resumenRespuestas, hijosSinResponder } from "../../lib/autorizaciones";
import { Card } from "../../components/Card";
import { useCargar } from "../../hooks/useCargar";

const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };
const label = { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 };
const fmtFecha = (s) => new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const fmtCuando = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Lista para imprimir el día de la salida.
function exportarExcel(titulo, filas) {
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
  const pill = (n, txt, bg, c) => <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: bg, color: c }}>{n} {txt}</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {pill(r.autorizados, r.autorizados === 1 ? "autorizado" : "autorizados", "#F0FDF4", "#047857")}
      {pill(r.noAutorizados, "no", "#FEF2F2", "#B91C1C")}
      {pill(r.sinResponder, "sin responder", "#F1F5F9", "#475569")}
    </div>
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
        <button onClick={() => setAbierto((p) => !p)} style={{ border: "none", background: "none", color: "#3B82F6", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>
          {abierto ? "Ocultar respuestas" : "Ver respuestas"}
        </button>
        <button onClick={() => exportarExcel(titulo, filas)} style={{ border: "1px solid #E2E8F0", background: "white", color: "#475569", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 8 }}>
          ⬇ Exportar Excel
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
    onGuardado?.();
  };

  const nombre = hijo.nombre;
  if (!editando && respuesta) {
    return (
      <div style={{ padding: "10px 12px", borderRadius: 10, background: respuesta.autoriza ? "#F0FDF4" : "#FEF2F2", marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: respuesta.autoriza ? "#047857" : "#B91C1C" }}>
            {respuesta.autoriza ? "✅" : "❌"} {nombre}: {respuesta.autoriza ? "autorizado" : "no autorizado"}
          </div>
          {abierta && <button onClick={() => setEditando(true)} style={{ border: "none", background: "none", color: "#3B82F6", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cambiar</button>}
        </div>
        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 3, lineHeight: 1.45 }}>
          {respuesta.retira && <>Retira: <b>{respuesta.retira}</b> · </>}
          {respuesta.comentario && <>“{respuesta.comentario}” · </>}
          Respondido {fmtCuando(respuesta.respondido_en)}
        </div>
      </div>
    );
  }
  if (!abierta) return <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>{nombre}: sin responder · la fecha límite ya pasó.</div>;
  const opcion = (valor, txt, color, bg) => {
    const act = form.autoriza === valor;
    return (
      <button onClick={() => setForm((p) => ({ ...p, autoriza: valor }))} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${act ? color : "#E2E8F0"}`, background: act ? bg : "white", color: act ? color : "#64748B", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
        {txt}
      </button>
    );
  };
  return (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", marginTop: 8 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>{nombre}</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {opcion(true, "✅ Autorizo", "#047857", "#F0FDF4")}
        {opcion(false, "❌ No autorizo", "#B91C1C", "#FEF2F2")}
      </div>
      <input value={form.retira} onChange={(e) => setForm((p) => ({ ...p, retira: e.target.value }))} placeholder="¿Quién lo retira? (ej: la mamá, Juana Pérez)" style={{ ...inp, marginBottom: 8 }} />
      <textarea value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} placeholder="Comentario (opcional)" rows={2} style={{ ...inp, resize: "vertical", marginBottom: 8 }} />
      {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 6 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        {respuesta && <button onClick={() => setEditando(false)} style={{ flex: 1, padding: 9, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, color: "#94A3B8" }}>Cancelar</button>}
        <button onClick={guardar} disabled={guardando} style={{ flex: 2, padding: 9, borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? "Guardando…" : "Enviar respuesta"}
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
            <div style={label}>CURSOS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {cursosDestino.map((c) => {
                const act = form.cursos.includes(c.id);
                return <button key={c.id} onClick={() => toggleCurso(c.id)} style={{ padding: "6px 11px", borderRadius: 8, border: `1.5px solid ${act ? "#3B82F6" : "#E2E8F0"}`, background: act ? "#EFF6FF" : "white", color: act ? "#1D4ED8" : "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{act ? "✓ " : ""}{c.nombre}</button>;
              })}
            </div>
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
export function Autorizaciones({ cursoId, cursoIds = [], esVistaTodos = false, tagDeCurso = null, cursosAdmin = [], userId, isAdmin, misHijos = [] }) {
  const [datos, setDatos] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [cursosInfo, setCursosInfo] = useState([]);
  const hoyStr = fmtLocalDate();
  // cursoIds y misHijos llegan memoizados desde App.jsx.
  const cargar = useCallback(async () => {
    if (!cursoIds.length) return;
    setDatos(await cargarDatos(cursoIds, { misHijosIds: misHijos }));
  }, [cursoIds, misHijos]);
  useCargar(cargar);

  // Cursos donde puede crear: Room Parent (en Todos, los de cursosAdmin).
  const cursosQueGestiona = esVistaTodos ? cursosAdmin : (isAdmin && cursoId ? [cursoId] : []);
  useEffect(() => {
    if (!cursosQueGestiona.length) return;
    supabase.from("cursos").select("id,nombre").in("id", cursosQueGestiona).then(({ data }) => setCursosInfo(data || []));
  }, [cursosQueGestiona.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const gestiona = (a) => a.creado_por === userId || cursosQueGestiona.includes(a.curso_id);

  if (!datos) return <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div>;
  const { autorizaciones, respuestas, alumnos } = datos;
  const abiertas = autorizaciones.filter((a) => estaAbierta(a, hoyStr));
  const cerradas = autorizaciones.filter((a) => !estaAbierta(a, hoyStr));

  const tarjeta = (a) => {
    const tag = tagDeCurso?.(a.curso_id);
    const misDelCurso = datos.misHijos.filter((h) => h.curso_id === a.curso_id);
    const respDe = respuestas.filter((r) => r.autorizacion_id === a.id);
    const pendientes = hijosSinResponder(a, datos.misHijos, respuestas).length;
    const abierta = estaAbierta(a, hoyStr);
    return (
      <Card key={a.id} style={{ padding: 18, marginBottom: 12, borderLeft: `3px solid ${pendientes && abierta ? "#F59E0B" : "#E2E8F0"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", lineHeight: 1.35 }}>✍️ {a.titulo}</div>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: abierta ? "#F0FDF4" : "#F1F5F9", color: abierta ? "#10B981" : "#94A3B8" }}>{abierta ? "Abierta" : "Cerrada"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 5 }}>
          {tag && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: "#F1F5F9", color: "#64748B" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color }} />{tag.nombre}</span>}
          {a.grupo_id && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: "#EEF2FF", color: "#6366F1" }}>🏫 Del colegio</span>}
          {a.fecha_evento && <span style={{ fontSize: 11.5, color: "#64748B" }}>📅 {fmtFecha(a.fecha_evento)}</span>}
          {a.fecha_limite && <span style={{ fontSize: 11.5, color: abierta ? "#B45309" : "#94A3B8" }}>⏰ Responder hasta el {fmtFecha(a.fecha_limite)}</span>}
        </div>
        {a.descripcion && <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.descripcion}</div>}
        {misDelCurso.map((h) => (
          <FormRespuesta key={`${h.id}-${respDe.find((r) => r.hijo_id === h.id)?.respondido_en || "nueva"}`} autorizacion={a} hijo={h} respuesta={respDe.find((r) => r.hijo_id === h.id) || null} userId={userId} onGuardado={cargar} />
        ))}
        {gestiona(a) && (
          <>
            <DetalleRespuestas titulo={a.titulo} grupos={[{ nombreCurso: tag?.nombre || "", alumnos: alumnos.filter((h) => h.curso_id === a.curso_id), respuestas: respDe }]} />
            <button onClick={async () => { if (!confirm("¿Eliminar esta autorización y todas sus respuestas?")) return; await supabase.from("autorizaciones").delete().eq("id", a.id); cargar(); }} style={{ marginTop: 10, border: "none", background: "none", color: "#EF4444", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }}>Eliminar</button>
          </>
        )}
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {nueva && <NuevaAutorizacion cursosDestino={cursosInfo} userId={userId} onClose={() => setNueva(false)} onCreada={cargar} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3 }}>Autorizaciones</div>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>Salidas y actividades que necesitan tu permiso</div>
        </div>
        {cursosInfo.length > 0 && <button onClick={() => setNueva(true)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>+ Nueva</button>}
      </div>
      {!autorizaciones.length && (
        <Card style={{ padding: 30, textAlign: "center" }}>
          <div style={{ fontSize: 28 }}>✍️</div>
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
export function AutorizacionesColegio({ cursos, userId }) {
  const [datos, setDatos] = useState(null);
  const [nueva, setNueva] = useState(false);
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
      <button onClick={() => setNueva(true)} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 14 }}>+ Nueva autorización</button>
      {!datos ? <div style={{ color: "#94A3B8", fontSize: 13 }}>Cargando…</div> : !grupos.length ? (
        <div style={{ color: "#94A3B8", fontSize: 13 }}>Todavía no hay autorizaciones en este colegio.</div>
      ) : grupos.map((g) => (
        <Card key={g.grupo_id || g.id} style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>✍️ {g.titulo}</div>
            <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: estaAbierta(g, hoyStr) ? "#F0FDF4" : "#F1F5F9", color: estaAbierta(g, hoyStr) ? "#10B981" : "#94A3B8", flexShrink: 0 }}>{estaAbierta(g, hoyStr) ? "Abierta" : "Cerrada"}</span>
          </div>
          <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 4 }}>
            {g.filas.map((f) => nombreCurso.get(f.curso_id)).filter(Boolean).join(", ")}
            {g.fecha_evento ? ` · 📅 ${fmtFecha(g.fecha_evento)}` : ""}
            {g.fecha_limite ? ` · ⏰ hasta el ${fmtFecha(g.fecha_limite)}` : ""}
          </div>
          <DetalleRespuestas titulo={g.titulo} grupos={g.filas.map((f) => ({
            nombreCurso: nombreCurso.get(f.curso_id) || "",
            alumnos: datos.alumnos.filter((h) => h.curso_id === f.curso_id),
            respuestas: datos.respuestas.filter((r) => r.autorizacion_id === f.id),
          }))} />
          <button onClick={async () => { if (!confirm("¿Eliminar esta autorización (en todos sus cursos) y sus respuestas?")) return; await supabase.from("autorizaciones").delete().in("id", g.filas.map((f) => f.id)); cargar(); }} style={{ marginTop: 10, border: "none", background: "none", color: "#EF4444", cursor: "pointer", fontSize: 11.5, fontWeight: 700, padding: 0 }}>Eliminar</button>
        </Card>
      ))}
    </div>
  );
}
