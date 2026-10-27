// Cambios en la salida (supabase/cambios-salida.sql, reglas en
// @shared/cambiosSalida). La familia avisa que su hijo se retira distinto a
// lo habitual (día, horario, motivo, con quién y un comentario); le llega a
// la Secretaría del nivel del curso, que lo marca como visto. La docente del
// curso los ve en solo lectura. CambiosSalidaColegio es la sección del panel.
import { useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabase";
import { useCargar } from "../../hooks/useCargar";
import { useConfirmar } from "../../hooks/useConfirmar";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { BotonFiltros, FiltrosModal } from "../../components/Filtros";
import { sanitize, fmtLocalDate, fmtNombre } from "../../lib/helpers";
import { sendPush } from "../../lib/push";
import {
  MOTIVOS, opcionesRetiro, formVacio, validarCambioSalida, filaCambioSalida, textoMotivo, textoRetira,
  estadoCambio, sePuedeCancelar, separarCambios, pendientesDeVer, fechaCambio, cargarCambiosSalida,
  avisarCambioSalida, textoPushCambio,
} from "../../lib/cambiosSalida";

const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box", color: "#0F172A" };
const label = { fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6, marginTop: 14 };
const linkBtn = { border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" };
const tituloLista = { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "20px 0 8px" };
const fmtCuando = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TONO = { pendiente: "#B45309", visto: "#047857", cancelado: "#94A3B8", pasado: "#94A3B8" };

function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{ padding: "8px 14px", borderRadius: 999, border: `1px solid ${on ? "#0F172A" : "#E2E8F0"}`, background: on ? "#0F172A" : "white", cursor: "pointer", fontFamily: "inherit", minHeight: 36 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: on ? "white" : "#334155" }}>{children}</span>
    </button>
  );
}

/** Formulario: hijos = items "hijo" de Mi acceso (con cursos.nivel). */
function NuevoCambio({ hijos, hijoInicial, userId, onClose, onEnviado }) {
  const hoy = fmtLocalDate();
  const [form, setForm] = useState(() => ({ ...formVacio(), hijoId: hijoInicial || (hijos.length === 1 ? hijos[0].id : null), fecha: hoy }));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const hijo = hijos.find((h) => h.id === form.hijoId);
  const retiros = opcionesRetiro(hijo?.cursos?.nivel);

  const enviar = async () => {
    const err = validarCambioSalida(form, hoy);
    if (err) { setError(err); return; }
    setGuardando(true); setError(null);
    const fila = filaCambioSalida(form, { cursoId: hijo.curso_id, userId, sanitize });
    const { data, error: e } = await supabase.from("cambios_salida").insert(fila).select("id").single();
    if (e) { setGuardando(false); setError("No se pudo enviar. Revisá los datos y probá de nuevo."); return; }
    await avisarCambioSalida(supabase, sendPush, { id: data.id, type: "cambio_salida", titulo: textoPushCambio(fila, fmtNombre(hijo), hoy) });
    setGuardando(false);
    onEnviado(hijo.nombre);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Avisar un cambio en la salida" onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>Avisar un cambio en la salida</div>
        <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.45 }}>Le llega a la Secretaría del nivel. Vas a ver acá cuando lo hayan visto.</div>

        {hijos.length > 1 && (
          <>
            <div style={label}>¿Quién se retira?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {hijos.map((h) => <Chip key={h.id} on={form.hijoId === h.id} onClick={() => setForm((p) => ({ ...p, hijoId: h.id, retira: p.retira === "solo" && h.cursos?.nivel !== "secundaria" ? null : p.retira }))}>{h.nombre?.split(" ")[0]}</Chip>)}
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={label}>Día</div>
            <input type="date" min={hoy} value={form.fecha} onChange={(e) => set("fecha", e.target.value)} style={inp} />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <div style={label}>Horario de salida</div>
            <input type="time" value={form.hora} onChange={(e) => set("hora", e.target.value)} style={inp} />
          </div>
        </div>

        <div style={label}>Motivo</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOTIVOS.map((m) => <Chip key={m.id} on={form.motivo === m.id} onClick={() => set("motivo", m.id)}>{m.label}</Chip>)}
        </div>
        {form.motivo === "otro" && <input value={form.motivoDetalle} onChange={(e) => set("motivoDetalle", e.target.value)} placeholder="Contanos el motivo" maxLength={120} style={{ ...inp, marginTop: 8 }} />}

        <div style={label}>¿Con quién se retira?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {retiros.map((r) => <Chip key={r.id} on={form.retira === r.id} onClick={() => set("retira", r.id)}>{r.label}</Chip>)}
        </div>
        {form.retira === "otro_adulto" && (
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input value={form.retiraNombre} onChange={(e) => set("retiraNombre", e.target.value)} placeholder="Nombre y apellido" maxLength={80} style={{ ...inp, flex: "2 1 180px" }} />
            <input value={form.retiraDni} onChange={(e) => set("retiraDni", e.target.value)} placeholder="DNI" inputMode="numeric" maxLength={15} style={{ ...inp, flex: "1 1 110px" }} />
          </div>
        )}
        {form.retira === "transporte" && <input value={form.retiraNombre} onChange={(e) => set("retiraNombre", e.target.value)} placeholder="¿Cuál? (opcional)" maxLength={80} style={{ ...inp, marginTop: 8 }} />}

        <div style={label}>Comentario (opcional)</div>
        <textarea value={form.comentario} onChange={(e) => set("comentario", e.target.value)} rows={2} maxLength={500} placeholder="Algo más que el colegio tenga que saber" style={{ ...inp, resize: "vertical" }} />

        {error && <div role="alert" style={{ fontSize: 12.5, color: "#DC2626", marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}><span style={{ fontSize: 13.5, fontWeight: 600, color: "#64748B" }}>Cancelar</span></button>
          <button onClick={enviar} disabled={guardando} style={{ flex: 2, padding: 11, borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", opacity: guardando ? 0.6 : 1, fontFamily: "inherit" }}><span style={{ fontSize: 13.5, fontWeight: 800, color: "white" }}>{guardando ? "Enviando…" : "Enviar aviso"}</span></button>
        </div>
      </div>
    </div>
  );
}

/** Una tarjeta. `colegio`: muestra quién avisó y el botón "Marcar como visto". */
function Tarjeta({ c, hoy, tag, colegio = false, onVisto, onCancelar }) {
  const est = estadoCambio(c, hoy);
  const cancelado = est.id === "cancelado";
  const nombreHijo = fmtNombre(c.hijos) || "Alumno";
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 14, background: "white", padding: "14px 16px", marginBottom: 10, opacity: cancelado ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", textDecoration: cancelado ? "line-through" : "none" }}>
            <span style={{ color: "#0F172A" }}>{fechaCambio(c.fecha, hoy)} · {(c.hora || "").slice(0, 5)}</span>
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {tag && <span style={{ width: 8, height: 8, borderRadius: 999, background: tag.color, flexShrink: 0 }} />}
            <span style={{ fontWeight: 700, color: "#334155" }}>{nombreHijo}</span>
            {colegio && c.cursos?.nombre && <span style={{ color: "#94A3B8" }}>· {c.cursos.nombre}</span>}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: TONO[est.id], whiteSpace: "nowrap", flexShrink: 0 }}>{colegio && est.id === "pendiente" ? "Sin ver" : est.label}</span>
      </div>
      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 4, fontSize: 13 }}>
        <span style={{ color: "#64748B" }}>Motivo</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{textoMotivo(c)}</span>
        <span style={{ color: "#64748B" }}>Se retira con</span><span style={{ color: "#0F172A", fontWeight: 600 }}>{textoRetira(c)}</span>
        {c.comentario && <><span style={{ color: "#64748B" }}>Comentario</span><span style={{ color: "#334155", whiteSpace: "pre-wrap" }}>{c.comentario}</span></>}
      </div>
      <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
        {[
          `Avisado ${c.creador ? `por ${fmtNombre(c.creador)} ` : ""}el ${fmtCuando(c.creado_en)}`,
          c.visto_en ? `Visto${c.visto ? ` por ${fmtNombre(c.visto)}` : ""} el ${fmtCuando(c.visto_en)}` : null,
          c.cancelado_en ? `Cancelado el ${fmtCuando(c.cancelado_en)}` : null,
        ].filter(Boolean).join(" · ")}
      </div>
      {(onVisto || onCancelar) && (
        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
          {onVisto && <button onClick={() => onVisto(c)} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", fontFamily: "inherit" }}><span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>Marcar como visto</span></button>}
          {onCancelar && <button onClick={() => onCancelar(c)} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>Cancelar aviso</span></button>}
        </div>
      )}
    </div>
  );
}

/** Pantalla de las familias (y de la docente, en solo lectura). */
export function CambiosSalida({ cursoIds = [], items = [], userId, tagDeCurso = null, esDocente = false, hijoActivo = null }) {
  const [lista, setLista] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [confirmar, confirmUI] = useConfirmar();
  const hoy = fmtLocalDate();
  const misHijos = useMemo(() => items.filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)), [items, cursoIds]);

  const cargar = useCallback(async () => {
    if (!cursoIds.length) return;
    try {
      const filas = await cargarCambiosSalida(supabase, { cursoIds, docente: esDocente, desde: esDocente ? fmtLocalDate(new Date(Date.now() - 30 * 86400000)) : null });
      // La familia ve los de sus hijos (RLS); en Todos o con hermanos, solo los de los hijos en vista.
      const ids = new Set(misHijos.map((h) => h.id));
      setLista(esDocente ? filas : filas.filter((c) => ids.has(c.hijo_id)));
    } catch {
      setLista((p) => p || []);
    }
  }, [cursoIds, misHijos, esDocente]);
  useCargar(cargar);

  const cancelar = async (c) => {
    if (!(await confirmar({ titulo: "Cancelar el aviso", detalle: `El colegio va a ver que ${c.hijos?.nombre || "tu hijo"} se retira como siempre.`, textoConfirmar: "Cancelar aviso" }))) return;
    const { data } = await supabase.rpc("cancelar_cambio_salida", { p_id: c.id });
    if (data) await avisarCambioSalida(supabase, sendPush, { id: c.id, type: "cambio_salida_cancelado", titulo: textoPushCambio(c, fmtNombre(c.hijos), hoy) });
    setAviso(data ? "Aviso cancelado." : "Ya no se puede cancelar.");
    cargar();
  };

  const { proximos, historial } = separarCambios(lista || [], hoy);
  return (
    <div style={{ maxWidth: 720 }}>
      {confirmUI}
      {nuevo && <NuevoCambio hijos={misHijos} hijoInicial={misHijos.some((h) => h.id === hijoActivo) ? hijoActivo : null} userId={userId} onClose={() => setNuevo(false)} onEnviado={(n) => { setNuevo(false); setAviso(`Listo: le avisamos a la Secretaría el cambio de ${n}.`); cargar(); }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Cambios en la salida</div>
          <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 2 }}>{esDocente ? "Los avisos de las familias de tus cursos." : "Avisale al colegio si tu hijo se retira distinto a lo habitual."}</div>
        </div>
        {!esDocente && misHijos.length > 0 && <BotonNuevo onClick={() => setNuevo(true)} ariaLabel="Avisar un cambio en la salida" />}
      </div>
      {aviso && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", marginBottom: 12 }}><span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>{aviso}</span></div>}
      {!lista ? <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div> : !lista.length ? (
        esDocente
          ? <EmptyState icono="reloj" titulo="No hay cambios en la salida" nota="Cuando una familia de tus cursos avise que un alumno se retira distinto, aparece acá." />
          : <EmptyState icono="reloj" titulo="Todavía no avisaste ningún cambio" nota="Si un día tu hijo se va más temprano o lo retira otra persona, avisale a la Secretaría desde acá." accion="Avisar un cambio" onAccion={() => setNuevo(true)} />
      ) : (
        <>
          <div style={tituloLista}>Hoy y próximos</div>
          {proximos.length ? proximos.map((c) => <Tarjeta key={c.id} c={c} hoy={hoy} tag={tagDeCurso?.(c.curso_id)} colegio={esDocente} onCancelar={!esDocente && sePuedeCancelar(c, hoy) ? cancelar : null} />)
            : <div style={{ fontSize: 13, color: "#94A3B8" }}>No hay cambios para hoy ni para los próximos días.</div>}
          {historial.length > 0 && <div style={tituloLista}>Historial</div>}
          {historial.map((c) => <Tarjeta key={c.id} c={c} hoy={hoy} tag={tagDeCurso?.(c.curso_id)} colegio={esDocente} />)}
        </>
      )}
    </div>
  );
}

/** Sección del panel del colegio (administrador, Secretaría, super): RLS acota a sus cursos. */
export function CambiosSalidaColegio({ cursos = [] }) {
  const [lista, setLista] = useState(null);
  const [filtros, setFiltros] = useState(false);
  const [curso, setCurso] = useState("todos");
  const [vista, setVista] = useState("proximos");
  const [buscar, setBuscar] = useState("");
  const hoy = fmtLocalDate();
  const clave = cursos.map((c) => c.id).join(",");
  const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);

  const cargar = useCallback(async () => {
    if (!ids.length) { setLista([]); return; }
    try { setLista(await cargarCambiosSalida(supabase, { cursoIds: ids, limite: 500 })); } catch { setLista((p) => p || []); }
  }, [ids]);
  useCargar(cargar);

  const marcarVisto = async (c) => {
    const { data, error } = await supabase.rpc("marcar_cambio_salida_visto", { p_id: c.id });
    if (!error && data) await avisarCambioSalida(supabase, sendPush, { id: c.id, type: "cambio_salida_visto", titulo: textoPushCambio(c, c.hijos?.nombre, hoy) });
    cargar();
  };

  const grupos = [
    { key: "vista", label: "Mostrar", value: vista, onChange: setVista, options: [{ value: "proximos", label: "Hoy y próximos" }, { value: "historial", label: "Historial" }, { value: "todos", label: "Todos" }] },
    ...(cursos.length > 1 ? [{ key: "curso", label: "Curso", value: curso, onChange: setCurso, options: [{ value: "todos", label: "Todos los cursos" }, ...cursos.map((c) => ({ value: c.id, label: c.nombre }))] }] : []),
  ];
  const q = buscar.trim().toLowerCase();
  const filtrada = (lista || []).filter((c) => (curso === "todos" || c.curso_id === curso) && (!q || fmtNombre(c.hijos).toLowerCase().includes(q)));
  const { proximos, historial } = separarCambios(filtrada, hoy);
  const visibles = vista === "proximos" ? proximos : vista === "historial" ? historial : [...proximos, ...historial];
  const sinVer = pendientesDeVer(lista || [], hoy);

  return (
    <div style={{ maxWidth: 760 }}>
      {filtros && <FiltrosModal grupos={grupos} onClose={() => setFiltros(false)} />}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar alumno" aria-label="Buscar alumno" style={{ ...inp, flex: "1 1 200px", width: "auto" }} />
        <BotonFiltros grupos={grupos} onClick={() => setFiltros(true)} />
      </div>
      {sinVer > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#B45309", marginBottom: 10 }}>{sinVer === 1 ? "1 cambio sin ver" : `${sinVer} cambios sin ver`}</div>}
      {!lista ? <div style={{ color: "#94A3B8", fontSize: 13 }}>Cargando…</div> : !visibles.length ? (
        <EmptyState icono="reloj" titulo={vista === "historial" ? "No hay cambios anteriores" : "No hay cambios en la salida"} nota="Cuando una familia avise que su hijo se retira distinto a lo habitual, aparece acá y te llega una notificación." />
      ) : visibles.map((c) => (
        <Tarjeta key={c.id} c={c} hoy={hoy} colegio onVisto={!c.visto_en && !c.cancelado_en ? marcarVisto : null} />
      ))}
    </div>
  );
}
