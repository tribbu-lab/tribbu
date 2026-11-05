// Pagos al colegio (specs/pagos-colegio.md): excursiones, visitas y otros cobros
// por curso. La familia avisa "Ya pagué" y el colegio confirma cuando recibe el
// dinero. Aparte de las colectas entre familias (features/finanzas).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { useCargar } from "../../hooks/useCargar";
import { useConfirmar } from "../../hooks/useConfirmar";
import { useToast } from "../../hooks/useToast";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { Icono } from "../../components/Icono";
import { fmtF, sanitize, uuidLite } from "../../lib/helpers";
import { sendPush } from "../../lib/push";
import { ESTADO_PAGO, celularesAvisados, cuentasActivasDeAlumno, textoAvisoPago, textoDestinatariosPago, textoResumenPago, errorFormularioPago, filasAlumnosDePago, montoDeFormulario, montoPago, resumenPago } from "../../lib/pagosColegio";

const tarjeta = { border: "1px solid #E2E8F0", borderRadius: 16, background: "white", padding: 16, marginBottom: 12 };
const inp = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box", color: "#0F172A" };
const etiqueta = { display: "block", fontSize: 12.5, fontWeight: 700, color: "#475569", margin: "12px 0 5px" };
const btnPrincipal = { padding: "10px 14px", borderRadius: 10, border: "none", background: "#2563EB", color: "white", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnSecundario = { padding: "10px 14px", borderRadius: 10, border: "1px solid #CBD5E1", background: "white", color: "#334155", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

function Estado({ estado }) {
  const e = ESTADO_PAGO[estado] || ESTADO_PAGO.pendiente;
  return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, background: e.bg, color: e.c, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{e.l}</span>;
}

// ── Familias ─────────────────────────────────────────────────────────────────
export function PagosFamilia({ cursoIds = [], items = [], misHijos = [], tagDeCurso }) {
  const [filas, setFilas] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const { showToast, Toast } = useToast();
  const nombreDe = useMemo(() => new Map(items.filter((i) => i._tipo === "hijo").map((i) => [i.id, i.nombre?.split(" ")[0]])), [items]);

  const cargar = useCallback(async () => {
    if (!misHijos.length) { setFilas([]); return; }
    const { data } = await supabase.from("pago_colegio_alumnos").select("pago_id,hijo_id,estado,pagos_colegio(*)").in("hijo_id", misHijos);
    setFilas(data || []);
  }, [misHijos]);
  useCargar(cargar);

  const pagos = useMemo(() => {
    const m = new Map();
    for (const f of filas || []) {
      const p = f.pagos_colegio;
      if (!p || !cursoIds.includes(p.curso_id)) continue;
      if (!m.has(p.id)) m.set(p.id, { ...p, filas: [] });
      m.get(p.id).filas.push(f);
    }
    return [...m.values()].sort((a, b) => (a.fecha_limite || "9999").localeCompare(b.fecha_limite || "9999"));
  }, [filas, cursoIds]);

  const avisar = async (f, pague) => {
    setGuardando(`${f.pago_id}-${f.hijo_id}`);
    const { error } = await supabase.rpc("avisar_pago_colegio", { p_pago: f.pago_id, p_hijo: f.hijo_id, p_pague: pague });
    setGuardando(null);
    if (error) { showToast(error.message || "No se pudo guardar.", "error"); return; }
    showToast(pague ? "Le avisamos al colegio. Lo confirma cuando reciba el dinero." : "Listo, quedó como pendiente.", "ok");
    cargar();
  };
  const copiar = async (texto) => {
    try { await navigator.clipboard.writeText(texto); showToast("Copiado.", "ok"); }
    catch { showToast("No se pudo copiar: copialo a mano.", "error"); }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <Toast />
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Pagos al colegio</div>
      <div style={{ fontSize: 13.5, color: "#64748B", margin: "4px 0 18px" }}>Excursiones, visitas y otros pagos que pide el colegio. tribbu no maneja el dinero.</div>
      {filas === null ? <div style={{ fontSize: 13, color: "#64748B" }}>Cargando…</div> : !pagos.length ? <EmptyState icono="moneda" titulo="No hay pagos del colegio" nota="Cuando el colegio pida uno, aparece acá." /> : null}
      {pagos.map((p) => {
        const tag = tagDeCurso?.(p.curso_id);
        return (
          <div key={p.id} style={tarjeta}>
            {tag ? <div style={{ fontSize: 12, fontWeight: 700, color: tag.color || "#475569", marginBottom: 4 }}>{tag.nombre}</div> : null}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{p.titulo}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", whiteSpace: "nowrap" }}>{montoPago(p)}</span>
            </div>
            {p.fecha_limite ? <div style={{ fontSize: 13, color: "#64748B", marginTop: 3 }}>Pagar hasta el {fmtF(p.fecha_limite)}</div> : null}
            {p.descripcion ? <div style={{ fontSize: 13.5, color: "#334155", marginTop: 8, whiteSpace: "pre-wrap" }}>{p.descripcion}</div> : null}
            {p.datos_pago ? (
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#F8FAFC", display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#0F172A", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{p.datos_pago}</span>
                <button onClick={() => copiar(p.datos_pago)} aria-label="Copiar los datos para pagar" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" }}><Icono nombre="copiar" size={17} color="#475569" /></button>
              </div>
            ) : null}
            <div style={{ marginTop: 10 }}>
              {p.filas.map((f) => {
                const clave = `${f.pago_id}-${f.hijo_id}`;
                return (
                  <div key={clave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #F1F5F9", flexWrap: "wrap" }}>
                    <span style={{ flex: 1, minWidth: 90, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{nombreDe.get(f.hijo_id) || "Tu hijo"}</span>
                    <Estado estado={f.estado} />
                    {f.estado === "pendiente" ? <button onClick={() => avisar(f, true)} disabled={guardando === clave} style={btnPrincipal}>Ya pagué</button> : null}
                    {f.estado === "informado" ? <button onClick={() => avisar(f, false)} disabled={guardando === clave} style={btnSecundario}>Deshacer</button> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Panel del colegio ────────────────────────────────────────────────────────
function NuevoPago({ cursos, userId, onClose, onCreado }) {
  const [form, setForm] = useState({ titulo: "", monto: "", fecha_limite: "", datos_pago: "", descripcion: "" });
  const [cursosSel, setCursosSel] = useState([]);
  const [excluidos, setExcluidos] = useState([]);
  const [alumnosCargados, setAlumnos] = useState([]);
  const alumnos = useMemo(() => alumnosCargados.filter((a) => cursosSel.includes(a.curso_id)), [alumnosCargados, cursosSel]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cursosSel.length) return undefined;
    let vivo = true;
    supabase.from("hijos").select("id,nombre,apellido,curso_id").in("curso_id", cursosSel).order("nombre").then(({ data }) => { if (vivo) setAlumnos(data || []); });
    return () => { vivo = false; };
  }, [cursosSel]);

  const toggle = (lista, set, id) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const crear = async () => {
    const err = errorFormularioPago(form, cursosSel);
    if (err) { setError(err); return; }
    setGuardando(true);
    setError("");
    const grupo = uuidLite();
    const creados = [];
    try {
      for (const cursoId of cursosSel) {
        const id = uuidLite();
        const { error: e1 } = await supabase.from("pagos_colegio").insert({
          id, grupo_id: grupo, curso_id: cursoId, titulo: sanitize(form.titulo).trim(), monto: montoDeFormulario(form.monto),
          fecha_limite: form.fecha_limite || null, datos_pago: sanitize(form.datos_pago).trim() || null, descripcion: sanitize(form.descripcion).trim() || null, creado_por: userId || null,
        });
        if (e1) throw e1;
        const filas = filasAlumnosDePago(id, alumnos.filter((a) => a.curso_id === cursoId), excluidos);
        if (filas.length) {
          const { error: e2 } = await supabase.from("pago_colegio_alumnos").insert(filas);
          if (e2) throw e2;
        }
        creados.push(id);
      }
      const destinos = await Promise.all(creados.map((id) => supabase.rpc("familias_pendientes_pago_colegio", { p_pago: id })));
      const userIds = [...new Set(destinos.flatMap((r) => (r.data || []).map((x) => x?.familias_pendientes_pago_colegio ?? x)))];
      const res = destinos.some((r) => r.error) ? null
        : userIds.length ? await sendPush({ type: "pago_colegio", payload: { titulo: form.titulo.trim(), userIds } })
        : { ok: true, sent: 0 };
      onCreado(textoAvisoPago(res, "Pago creado"));
    } catch (e) {
      setError(e?.message || "No se pudo crear el pago.");
      setGuardando(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Nuevo pago" style={{ width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", background: "white", borderRadius: 16, padding: 20, boxSizing: "border-box" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Nuevo pago</div>
        <label style={etiqueta} htmlFor="pago-titulo">Título</label>
        <input id="pago-titulo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Excursión al Planetario" style={inp} />
        <label style={etiqueta} htmlFor="pago-monto">Monto</label>
        <input id="pago-monto" inputMode="decimal" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} placeholder="15000" style={inp} />
        <label style={etiqueta} htmlFor="pago-fecha">Fecha límite (opcional)</label>
        <input id="pago-fecha" type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} style={inp} />
        <label style={etiqueta} htmlFor="pago-datos">Datos para pagar (opcional)</label>
        <textarea id="pago-datos" rows={2} value={form.datos_pago} onChange={(e) => setForm({ ...form, datos_pago: e.target.value })} placeholder="Alias, CBU o dónde pagar" style={{ ...inp, resize: "vertical" }} />
        <label style={etiqueta} htmlFor="pago-desc">Descripción (opcional)</label>
        <textarea id="pago-desc" rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={{ ...inp, resize: "vertical" }} />
        <div style={etiqueta}>Cursos</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {cursos.map((c) => {
            const on = cursosSel.includes(c.id);
            return <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(cursosSel, setCursosSel, c.id)} style={{ padding: "7px 12px", borderRadius: 999, border: `1px solid ${on ? "#3B82F6" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "white", color: on ? "#1D4ED8" : "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{c.nombre}</button>;
          })}
        </div>
        {alumnos.length ? (
          <>
            <div style={etiqueta}>Alumnos que tienen que pagar ({alumnos.length - excluidos.filter((id) => alumnos.some((a) => a.id === id)).length} de {alumnos.length})</div>
            <div style={{ maxHeight: 170, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 10, padding: "4px 10px" }}>
              {alumnos.map((a) => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13.5, color: "#0F172A", cursor: "pointer" }}>
                  <input type="checkbox" checked={!excluidos.includes(a.id)} onChange={() => toggle(excluidos, setExcluidos, a.id)} />
                  <span style={{ color: "#0F172A" }}>{[a.nombre, a.apellido].filter(Boolean).join(" ")}</span>
                </label>
              ))}
            </div>
          </>
        ) : null}
        {error ? <div role="alert" style={{ fontSize: 13, color: "#DC2626", marginTop: 10 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ ...btnSecundario, flex: 1 }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando} style={{ ...btnPrincipal, flex: 2, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Creando…" : "Crear y avisar"}</button>
        </div>
      </div>
    </div>
  );
}

function DetallePago({ pago, curso, userId, onVolver, onCambio }) {
  const [filas, setFilas] = useState(null);
  const [fuera, setFuera] = useState([]);
  const [confirmar, confirmUI] = useConfirmar();
  const { showToast, Toast } = useToast();
  const [ultimo, setUltimo] = useState(pago.ultimo_recordatorio);

  const cargar = useCallback(async () => {
    const [{ data: f }, { data: todos }] = await Promise.all([
      supabase.from("pago_colegio_alumnos").select("pago_id,hijo_id,estado,confirmado_en,hijos(nombre,apellido)").eq("pago_id", pago.id),
      supabase.from("hijos").select("id,nombre,apellido").eq("curso_id", pago.curso_id).order("nombre"),
    ]);
    const lista = (f || []).sort((a, b) => (a.hijos?.nombre || "").localeCompare(b.hijos?.nombre || ""));
    setFilas(lista);
    const dentro = new Set(lista.map((x) => x.hijo_id));
    setFuera((todos || []).filter((h) => !dentro.has(h.id)));
  }, [pago.id, pago.curso_id]);
  useCargar(cargar);

  const nombre = (h) => [h?.nombre, h?.apellido].filter(Boolean).join(" ");
  const cambiar = async (f, estado) => {
    const { error } = await supabase.from("pago_colegio_alumnos").update(estado === "pagado"
      ? { estado, confirmado_por: userId || null, confirmado_en: new Date().toISOString() }
      : { estado, confirmado_por: null, confirmado_en: null }).eq("pago_id", f.pago_id).eq("hijo_id", f.hijo_id);
    if (error) { showToast(error.message, "error"); return; }
    cargar(); onCambio();
  };
  const quitar = async (f) => {
    if (!(await confirmar({ titulo: "¿Sacar a este alumno del pago?", detalle: nombre(f.hijos), textoConfirmar: "Sacar" }))) return;
    const { error } = await supabase.from("pago_colegio_alumnos").delete().eq("pago_id", f.pago_id).eq("hijo_id", f.hijo_id);
    if (error) { showToast(error.message, "error"); return; }
    cargar(); onCambio();
  };
  const sumar = async (h) => {
    const { error } = await supabase.from("pago_colegio_alumnos").insert({ pago_id: pago.id, hijo_id: h.id });
    if (error) { showToast(error.message, "error"); return; }
    cargar(); onCambio();
    if (!pago.activo) return;
    const { data, error: e2 } = await supabase.from("usuario_hijos").select("usuario_id,usuarios(activo)").eq("hijo_id", h.id);
    const userIds = cuentasActivasDeAlumno(data);
    const res = e2 ? null
      : userIds.length ? await sendPush({ type: "pago_colegio", payload: { titulo: pago.titulo, userIds } })
      : { ok: true, sent: 0 };
    const aviso = textoAvisoPago(res, "Alumno sumado");
    showToast(aviso.texto, aviso.tipo);
  };
  const recordar = async () => {
    const { data, error } = await supabase.rpc("familias_pendientes_pago_colegio", { p_pago: pago.id });
    if (error) { showToast(error.message, "error"); return; }
    const userIds = (data || []).map((x) => x?.familias_pendientes_pago_colegio ?? x);
    if (!userIds.length) { showToast("No hay familias pendientes con cuenta.", "info"); return; }
    if (!(await confirmar({ titulo: "¿Enviar recordatorio?", detalle: textoDestinatariosPago(r.pendiente, userIds.length), textoConfirmar: "Enviar", colorAccion: "#2563EB" }))) return;
    const res = await sendPush({ type: "pago_colegio", payload: { titulo: pago.titulo, recordatorio: true, userIds } });
    const celulares = celularesAvisados(res);
    if (celulares === null) { showToast("No se pudo enviar. Probá de nuevo.", "error"); return; }
    if (!celulares) { showToast("Ninguna familia pendiente tiene un celular con notificaciones activadas.", "info"); return; }
    const ahora = new Date().toISOString();
    await supabase.from("pagos_colegio").update({ ultimo_recordatorio: ahora }).eq("id", pago.id);
    setUltimo(ahora);
    showToast("Recordatorio enviado.", "ok");
    onCambio();
  };
  const cerrar = async () => {
    const abierto = pago.activo;
    if (!(await confirmar({ titulo: abierto ? "¿Cerrar este pago?" : "¿Volver a abrir este pago?", detalle: abierto ? "Las familias dejan de verlo." : "Las familias lo vuelven a ver.", textoConfirmar: abierto ? "Cerrar" : "Abrir" }))) return;
    const { error } = await supabase.from("pagos_colegio").update({ activo: !abierto }).eq("id", pago.id);
    if (error) { showToast(error.message, "error"); return; }
    onCambio(); onVolver();
  };

  const r = resumenPago(filas);
  return (
    <div style={{ maxWidth: 720 }}>
      <Toast />
      {confirmUI}
      <button onClick={onVolver} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#2563EB", fontSize: 13.5, fontWeight: 700, padding: 0, marginBottom: 10, fontFamily: "inherit" }}>‹ Pagos</button>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{pago.titulo}</div>
      <div style={{ fontSize: 13.5, color: "#64748B", margin: "3px 0 12px" }}>{[curso?.nombre, montoPago(pago), pago.fecha_limite ? `Hasta el ${fmtF(pago.fecha_limite)}` : null].filter(Boolean).join(" · ")}</div>
      <div style={{ fontSize: 13.5, color: "#334155", marginBottom: 12 }}>{textoResumenPago(r)}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        {pago.activo ? <button onClick={recordar} disabled={!r.pendiente} style={{ ...btnPrincipal, opacity: r.pendiente ? 1 : 0.5 }}>Enviar recordatorio</button> : null}
        <button onClick={cerrar} style={btnSecundario}>{pago.activo ? "Cerrar pago" : "Volver a abrir"}</button>
      </div>
      {ultimo ? <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 10 }}>Último recordatorio: {new Date(ultimo).toLocaleDateString("es-AR")}</div> : null}
      <div style={{ ...tarjeta, padding: "2px 14px", marginTop: 10 }}>
        {filas === null ? <div style={{ padding: 14, fontSize: 13, color: "#64748B" }}>Cargando…</div> : null}
        {filas?.length === 0 ? <div style={{ padding: 14, fontSize: 13, color: "#64748B" }}>Este pago no tiene alumnos.</div> : null}
        {(filas || []).map((f, i) => (
          <div key={f.hijo_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid #F1F5F9" : "none", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 130, fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{nombre(f.hijos)}</span>
            <Estado estado={f.estado} />
            {f.estado === "pagado"
              ? <button onClick={() => cambiar(f, "pendiente")} style={{ ...btnSecundario, padding: "7px 11px", fontSize: 12.5 }}>Deshacer</button>
              : <button onClick={() => cambiar(f, "pagado")} style={{ ...btnPrincipal, padding: "7px 11px", fontSize: 12.5 }}>Confirmar</button>}
            {f.estado !== "pagado" ? <button onClick={() => quitar(f)} aria-label={`Sacar a ${nombre(f.hijos)} del pago`} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" }}><Icono nombre="cerrar" size={15} color="#94A3B8" /></button> : null}
          </div>
        ))}
      </div>
      {fuera.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Alumnos del curso fuera de este pago</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {fuera.map((h) => <button key={h.id} onClick={() => sumar(h)} style={{ padding: "6px 11px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", color: "#475569", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ {nombre(h)}</button>)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PagosColegio({ cursos = [], userId, abrirNuevo = null, onCambio }) {
  const [pagos, setPagos] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const cursoIds = useMemo(() => cursos.map((c) => c.id), [cursos]);
  const cursoDe = useMemo(() => new Map(cursos.map((c) => [c.id, c])), [cursos]);
  const { showToast, Toast } = useToast();

  const cargar = useCallback(async () => {
    if (!cursoIds.length) { setPagos([]); return; }
    const { data } = await supabase.from("pagos_colegio").select("*, pago_colegio_alumnos(estado)").in("curso_id", cursoIds).order("creado_en", { ascending: false });
    setPagos(data || []);
  }, [cursoIds]);
  useCargar(cargar);

  useEffect(() => {
    if (!abrirNuevo) return undefined;
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) setNuevo(true); });
    return () => { vivo = false; };
  }, [abrirNuevo]);

  if (detalle) return <DetallePago key={detalle.id} pago={detalle} curso={cursoDe.get(detalle.curso_id)} userId={userId} onVolver={() => setDetalle(null)} onCambio={() => { cargar(); onCambio?.(); }} />;

  return (
    <div style={{ maxWidth: 720 }}>
      <Toast />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <BotonNuevo ariaLabel="Nuevo pago" onClick={() => setNuevo(true)} />
      </div>
      {pagos === null ? <div style={{ fontSize: 13, color: "#64748B" }}>Cargando…</div> : null}
      {pagos?.length === 0 ? <EmptyState icono="moneda" titulo="Todavía no hay pagos" nota="Creá uno para una excursión o una visita." /> : null}
      {(pagos || []).map((p) => {
        const r = resumenPago(p.pago_colegio_alumnos);
        return (
          <button key={p.id} onClick={() => setDetalle(p)} style={{ ...tarjeta, display: "block", width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box", opacity: p.activo ? 1 : 0.65 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{p.titulo}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", whiteSpace: "nowrap" }}>{montoPago(p)}</span>
            </span>
            <span style={{ display: "block", fontSize: 13, color: "#64748B", marginTop: 3 }}>{[cursoDe.get(p.curso_id)?.nombre, p.fecha_limite ? `Hasta el ${fmtF(p.fecha_limite)}` : null, p.activo ? null : "Cerrado"].filter(Boolean).join(" · ")}</span>
            <span style={{ display: "block", fontSize: 13, color: "#334155", marginTop: 6 }}>{r.pagado} de {r.total} confirmados{r.informado ? ` · ${r.informado} por confirmar` : ""}</span>
          </button>
        );
      })}
      {nuevo ? <NuevoPago cursos={cursos} userId={userId} onClose={() => setNuevo(false)} onCreado={(aviso) => { setNuevo(false); cargar(); showToast(aviso.texto, aviso.tipo); }} /> : null}
    </div>
  );
}
