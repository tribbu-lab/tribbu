// @ts-nocheck
// Encuestas — sondeos rápidos por curso (ver specs/encuestas.md). A diferencia
// del resto de los "+" de tribbu, cualquier rol (padre o admin) puede crear
// una encuesta; el voto es por apoderado (un voto por usuario_id, no por
// hijo) y los resultados se ven en vivo para cualquier miembro del curso,
// haya votado o no. Cerrar/borrar es de quien la creó, un admin del curso, o
// Super Admin.
import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { T } from "../../lib/theme";
import { sanitize } from "../../lib/helpers";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { Card } from "../../components/Card";

const MAX_OPCIONES = 6;
const MIN_OPCIONES = 2;

export function Encuestas({ cursoId, cursoIds = [], esVistaTodos = false, tagDeCurso = null, cursosAdmin = [], userId, isAdmin }) {
  const [encuestas, setEncuestas] = useState([]);
  const [opciones,  setOpciones]  = useState([]);
  const [votos,     setVotos]     = useState([]);
  const [cargando,  setCargando]  = useState(true);
  const [filtro,    setFiltro]    = useState("activas");
  const [modal,     setModal]     = useState(false);
  const [form,      setForm]      = useState({ pregunta: "", opciones: ["", ""], fecha_cierre: "", curso_id: null });
  const [saving,    setSaving]    = useState(false);

  const hoyStr = new Date().toISOString().split("T")[0];
  const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };

  // Opciones de curso destino para el alta en vista "Todos" (mismo patrón que Recordatorios).
  const cursosOpciones = esVistaTodos
    ? cursoIds.map(cid => ({ curso_id: cid, tag: tagDeCurso?.(cid) })).filter(o => o.tag)
    : [];

  const cargar = async () => {
    if (!cursoIds?.length) { setCargando(false); return; }
    setCargando(true);
    const { data: encs } = await supabase.from("encuestas").select("*").in("curso_id", cursoIds).order("creado_en", { ascending: false });
    const ids = (encs || []).map(e => e.id);
    const [ops, vts] = await Promise.all([
      ids.length ? supabase.from("encuesta_opciones").select("*").in("encuesta_id", ids).order("orden", { ascending: true }) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("encuesta_votos").select("*, usuarios(nombre,apellido)").in("encuesta_id", ids) : Promise.resolve({ data: [] }),
    ]);
    setEncuestas(encs || []);
    setOpciones(ops.data || []);
    setVotos(vts.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [cursoIds]);

  const opcionesDe = (eid) => opciones.filter(o => o.encuesta_id === eid);
  const votosDe    = (eid) => votos.filter(v => v.encuesta_id === eid);
  const miVoto     = (eid) => votos.find(v => v.encuesta_id === eid && v.usuario_id === userId)?.opcion_id || null;
  const estaCerrada = (e) => e.cerrada_manual || (e.fecha_cierre && e.fecha_cierre < hoyStr);
  const puedeGestionar = (e) => e.creado_por === userId || (esVistaTodos ? cursosAdmin.includes(e.curso_id) : isAdmin);

  const abrirModal = () => {
    setForm({ pregunta: "", opciones: ["", ""], fecha_cierre: "", curso_id: cursoId || cursoIds[0] || null });
    setModal(true);
  };

  const setOpcionTexto = (i, val) => setForm(p => ({ ...p, opciones: p.opciones.map((o, idx) => idx === i ? val : o) }));
  const agregarOpcion  = () => setForm(p => p.opciones.length >= MAX_OPCIONES ? p : { ...p, opciones: [...p.opciones, ""] });
  const quitarOpcion   = (i) => setForm(p => p.opciones.length <= MIN_OPCIONES ? p : { ...p, opciones: p.opciones.filter((_, idx) => idx !== i) });

  const crear = async () => {
    const cursoDestino = cursoId || form.curso_id;
    const opcionesLimpias = form.opciones.map(o => o.trim()).filter(Boolean);
    if (!form.pregunta?.trim() || opcionesLimpias.length < MIN_OPCIONES || !cursoDestino) return;
    setSaving(true);
    try {
      const { data: enc, error } = await supabase
        .from("encuestas")
        .insert({ pregunta: sanitize(form.pregunta), curso_id: cursoDestino, creado_por: userId, fecha_cierre: form.fecha_cierre || null })
        .select().single();
      if (error) throw error;
      const { error: opError } = await supabase
        .from("encuesta_opciones")
        .insert(opcionesLimpias.map((texto, i) => ({ encuesta_id: enc.id, texto: sanitize(texto), orden: i })));
      if (opError) throw opError;
      const userIds = await getUserIdsByCurso(cursoDestino);
      if (userIds.length) await sendPush({ type: "encuesta", payload: { titulo: form.pregunta, userIds } });
      setModal(false);
      cargar();
    } catch (e) {
      console.error("Encuestas.crear:", e);
    } finally {
      setSaving(false);
    }
  };

  const votar = async (eid, oid) => {
    if (!userId) return;
    // Actualización optimista: se ve el voto propio al instante, sin esperar el roundtrip.
    setVotos(p => [...p.filter(v => !(v.encuesta_id === eid && v.usuario_id === userId)), { encuesta_id: eid, opcion_id: oid, usuario_id: userId }]);
    await supabase.from("encuesta_votos").upsert({ encuesta_id: eid, opcion_id: oid, usuario_id: userId }, { onConflict: "encuesta_id,usuario_id" });
    cargar();
  };

  const cerrar = async (id) => { await supabase.from("encuestas").update({ cerrada_manual: true }).eq("id", id); cargar(); };
  const eliminar = async (id) => { await supabase.from("encuestas").delete().eq("id", id); cargar(); };

  const visibles = encuestas.filter(e => filtro === "activas" ? !estaCerrada(e) : estaCerrada(e));

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Encuestas 📊</div>
      <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 16 }}>Sondeos rápidos del curso — un voto por apoderado</div>

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box" }}>
            <Card style={{ padding: 24, width: "100%", maxWidth: 420 }}>
              <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 14 }}>Nueva encuesta</div>

              {cursosOpciones.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 }}>PARA EL CURSO DE</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {cursosOpciones.map(o => {
                      const act = form.curso_id === o.curso_id;
                      return (
                        <button key={o.curso_id} onClick={() => setForm(p => ({ ...p, curso_id: o.curso_id }))} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${act ? T.accent : "#E2E8F0"}`, background: act ? "#EFF6FF" : "white", cursor: "pointer", fontSize: 12, fontWeight: 700, color: act ? T.accent : "#94A3B8" }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.tag.color, display: "inline-block" }} />
                          {o.tag.nombre}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 }}>PREGUNTA</div>
                <textarea value={form.pregunta} onChange={e => setForm(p => ({ ...p, pregunta: e.target.value }))} placeholder="Ej: ¿Quién trae la torta el viernes?" rows={2} style={{ ...inp, resize: "vertical" }} />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 }}>OPCIONES</div>
                {form.opciones.map((op, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input value={op} onChange={e => setOpcionTexto(i, e.target.value)} placeholder={`Opción ${i + 1}`} style={inp} />
                    {form.opciones.length > MIN_OPCIONES && (
                      <button onClick={() => quitarOpcion(i)} style={{ padding: "0 10px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", color: "#94A3B8", fontSize: 14 }}>✕</button>
                    )}
                  </div>
                ))}
                {form.opciones.length < MAX_OPCIONES && (
                  <button onClick={agregarOpcion} style={{ padding: "6px 12px", borderRadius: 8, border: "1px dashed #CBD5E1", background: "white", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#94A3B8" }}>+ Agregar opción</button>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 }}>FECHA DE CIERRE (opcional)</div>
                <input type="date" value={form.fecha_cierre || ""} onChange={e => setForm(p => ({ ...p, fecha_cierre: e.target.value }))} style={inp} />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setModal(false)} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#94A3B8" }}>Cancelar</button>
                <button onClick={crear} disabled={saving} style={{ flex: 2, padding: 11, borderRadius: 10, border: "none", background: saving ? "#93C5FD" : T.accent, color: "white", cursor: saving ? "default" : "pointer", fontSize: 13, fontWeight: 700 }}>{saving ? "Publicando..." : "Publicar encuesta"}</button>
              </div>
            </Card>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {[{ id: "activas", l: "Activas" }, { id: "cerradas", l: "Cerradas" }].map(t => (
          <button key={t.id} onClick={() => setFiltro(t.id)} style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: filtro === t.id ? "#0F172A" : "white", color: filtro === t.id ? "white" : "#94A3B8", boxShadow: filtro === t.id ? "0 3px 12px rgba(0,0,0,0.15)" : "0 1px 6px rgba(0,0,0,0.06)" }}>{t.l}</button>
        ))}
        <button onClick={abrirModal} style={{ marginLeft: "auto", padding: "7px 16px", borderRadius: 8, border: "none", background: T.accent, color: "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>+ Nueva encuesta</button>
      </div>

      {cargando && <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>Cargando...</div>}
      {!cargando && visibles.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>
          {filtro === "activas" ? "Sin encuestas activas" : "Sin encuestas cerradas"}
        </div>
      )}

      {!cargando && visibles.map(e => {
        const ops = opcionesDe(e.id);
        const vts = votosDe(e.id);
        const total = vts.length;
        const mio = miVoto(e.id);
        const cerrada = estaCerrada(e);
        const tag = tagDeCurso?.(e.curso_id);

        return (
          <Card key={e.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", lineHeight: 1.4 }}>{e.pregunta}</div>
              <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: cerrada ? "#F1F5F9" : "#F0FDF4", color: cerrada ? "#94A3B8" : "#10B981" }}>{cerrada ? "Cerrada" : "Abierta"}</span>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              {tag && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: "#F1F5F9", color: "#64748B" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color, display: "inline-block" }} />
                  {tag.nombre}
                </span>
              )}
              {e.fecha_cierre && <span style={{ fontSize: 11, color: "#94A3B8" }}>Cierra {new Date(e.fecha_cierre + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}</span>}
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{total} voto{total !== 1 ? "s" : ""}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {ops.map(o => {
                const votantes = vts.filter(v => v.opcion_id === o.id);
                const cuenta = votantes.length;
                const pct = total ? Math.round((cuenta / total) * 100) : 0;
                const esMiVoto = mio === o.id;
                const nombres = votantes.map(v => v.usuarios?.nombre?.split(" ")[0] || "Apoderado").join(", ");
                return (
                  <div key={o.id}>
                    <button
                      onClick={() => !cerrada && votar(e.id, o.id)}
                      disabled={cerrada}
                      style={{ width: "100%", position: "relative", overflow: "hidden", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${esMiVoto ? T.accent : "#E2E8F0"}`, background: "white", cursor: cerrada ? "default" : "pointer", textAlign: "left" }}
                    >
                      <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: esMiVoto ? "#EFF6FF" : "#F8FAFC", transition: "width 0.3s ease" }} />
                      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: esMiVoto ? 700 : 500, color: "#0F172A" }}>{esMiVoto ? "✓ " : ""}{o.texto}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B", flexShrink: 0 }}>{cuenta} · {pct}%</span>
                      </div>
                    </button>
                    {cuenta > 0 && <div style={{ fontSize: 11, color: "#94A3B8", padding: "3px 12px 0" }}>{nombres}</div>}
                  </div>
                );
              })}
            </div>

            {puedeGestionar(e) && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {!cerrada && <button onClick={() => cerrar(e.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#64748B" }}>Cerrar encuesta</button>}
                <button onClick={() => eliminar(e.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#EF4444" }}>Eliminar</button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
