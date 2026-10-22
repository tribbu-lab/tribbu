// Talleres extraprogramáticos — panel del colegio (Super Admin → Comunidad →
// 🎨 Talleres). Crear/editar talleres, publicar, cerrar, cancelar, sortear y
// gestionar inscriptos (aprobar, rechazar, mover de la espera, anotar a mano,
// quitar), exportar a Excel y avisar por push. Spec:
// specs/talleres-extraprogramaticos.md · SQL: supabase/talleres.sql.
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../supabase";
import { fmtNombre, sanitize } from "../../lib/helpers";
import { sendPush } from "../../lib/push";
import { subirImagen } from "../../lib/imagenesWeb";
import { THEMES, SLATE } from "../../lib/tokens";
import {
  MODOS, ESTADOS_TALLER, SELECT_TALLER, hoyAR, fmtFechaCorta, textoLugares, textoHorario, textoProfe,
  textoElegibilidad, inscripcionAbierta,
} from "../../lib/talleres";
import { DIAS_HORARIO, DIA_CORTO, aMin } from "../../lib/horarios";
import { SignedImg } from "../../components/SignedImg";
import { Spinner } from "../../components/Spinner";
import { ListToolbar } from "../../components/ListToolbar";
import { Paginador } from "../../components/Paginador";
import { CursoListSelector } from "../../components/CursoListSelector";
import { useListControls } from "../../hooks/useListControls";
import { useConfirmar } from "../../hooks/useConfirmar";
import { useToast } from "../../hooks/useToast";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";

const C = THEMES.light;
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, outline: "none", fontFamily: "inherit", background: C.surfaceSunken, boxSizing: "border-box", color: C.text };
const btnPri = { padding: "9px 16px", borderRadius: 10, border: "none", background: C.accent, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnSec = { padding: "8px 13px", borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.surface, cursor: "pointer", fontSize: 12.5, color: SLATE[700], fontWeight: 700, whiteSpace: "nowrap" };
const lbl = { fontSize: 12.5, fontWeight: 600, color: C.textMuted, marginBottom: 6 };
// Estados en gris; solo "cancelado" se marca (es lo que hay que ver).
const COLOR_ESTADO = { borrador: ["#F8FAFC", "#64748B"], publicado: ["#F1F5F9", "#334155"], cerrado: ["#F1F5F9", "#64748B"], cancelado: ["#FEF2F2", "#B91C1C"] };
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function Modal({ titulo, subtitulo, onClose, children, pie, ancho = 640 }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderRadius: 18, width: "100%", maxWidth: ancho, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(15,23,42,0.25)" }}>
        <div style={{ padding: "20px 22px 8px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.textStrong }}>{titulo}</div>
          {subtitulo ? <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>{subtitulo}</div> : null}
        </div>
        <div style={{ padding: "8px 22px 16px", overflowY: "auto", flex: 1 }}>{children}</div>
        {pie ? <div style={{ padding: "12px 22px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{pie}</div> : null}
      </div>
    </div>
  );
}

const avisar = (userIds, taller, mensaje) => {
  if (!userIds?.length) return Promise.resolve();
  return sendPush({ type: "taller", payload: { userIds, tallerId: taller.id, titulo: taller.nombre, mensaje } }).catch(() => {});
};

function EstadoPill({ estado }) {
  const [bg, fg] = COLOR_ESTADO[estado] || COLOR_ESTADO.borrador;
  return <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: bg, color: fg }}>{(ESTADOS_TALLER[estado] || estado).toUpperCase()}</span>;
}

// ── Formulario ──────────────────────────────────────────────────────────────

function Campo({ titulo, children, span }) {
  return <div style={{ gridColumn: span ? "1 / -1" : undefined }}><div style={lbl}>{titulo}</div>{children}</div>;
}

const vacio = {
  nombre: "", descripcion: "", foto: null, profeTipo: "externo", profe_maestro_id: "", profe_texto: "", lugar: "", costo_texto: "",
  cupo: "", modo_asignacion: "orden_llegada", elegibilidad: "cursos", cursos: [], edad_min: "", edad_max: "",
  horarios: [], inscripcion_desde: "", inscripcion_hasta: "", fecha_inicio: "", fecha_fin: "", baja_hasta: "",
};

function TallerForm({ taller, colegioId, cursos, anoActual, maestros, onClose, onGuardado }) {
  const [f, setF] = useState(() => taller ? {
    ...vacio, ...Object.fromEntries(Object.entries(taller).map(([k, v]) => [k, v ?? ""])),
    foto: taller.foto || null,
    profeTipo: taller.profe_maestro_id ? "maestra" : "externo",
    cursos: (taller.taller_cursos || []).map((x) => x.curso_id),
    horarios: (taller.taller_horarios || []).map((h) => ({ dia: h.dia, hora_inicio: String(h.hora_inicio).slice(0, 5), hora_fin: String(h.hora_fin).slice(0, 5) })),
    cupo: taller.cupo ?? "",
  } : vacio);
  const [archivo, setArchivo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dias, setDias] = useState([]);
  const [hIni, setHIni] = useState("17:00");
  const [hFin, setHFin] = useState("18:00");
  const [qMae, setQMae] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (p) => { setF((x) => ({ ...x, ...p })); setError(""); };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const agregarHorario = () => {
    if (!dias.length) { setError("Elegí los días del horario."); return; }
    if (aMin(hFin) <= aMin(hIni)) { setError("La hora de fin tiene que ser después de la de inicio."); return; }
    const nuevos = dias.filter((d) => !f.horarios.some((h) => h.dia === d && h.hora_inicio === hIni)).map((d) => ({ dia: d, hora_inicio: hIni, hora_fin: hFin }));
    set({ horarios: [...f.horarios, ...nuevos].sort((a, b) => DIAS_HORARIO.indexOf(a.dia) - DIAS_HORARIO.indexOf(b.dia) || a.hora_inicio.localeCompare(b.hora_inicio)) });
    setDias([]);
  };

  const validar = () => {
    if (!f.nombre.trim()) return "Poné el nombre del taller.";
    if (f.profeTipo === "maestra" && !f.profe_maestro_id) return "Elegí la maestra que lo da (o cambiá a profe externo).";
    if (f.elegibilidad === "cursos" && !f.cursos.length) return "Elegí al menos un curso que pueda anotarse.";
    if (f.elegibilidad === "edad" && f.edad_min === "" && f.edad_max === "") return "Poné la edad mínima, la máxima o las dos.";
    if (f.edad_min !== "" && f.edad_max !== "" && Number(f.edad_min) > Number(f.edad_max)) return "La edad mínima no puede ser mayor que la máxima.";
    if (f.cupo !== "" && !(Number(f.cupo) > 0)) return "El cupo tiene que ser un número mayor a 0 (o vacío = sin límite).";
    if (f.modo_asignacion === "sorteo" && f.cupo === "") return "Para sortear hace falta un cupo.";
    if (f.modo_asignacion === "sorteo" && !f.inscripcion_hasta) return "Para sortear, poné hasta cuándo es la inscripción.";
    if (f.inscripcion_desde && f.inscripcion_hasta && f.inscripcion_desde > f.inscripcion_hasta) return "La inscripción termina antes de empezar.";
    if (f.fecha_inicio && f.fecha_fin && f.fecha_inicio > f.fecha_fin) return "El taller termina antes de empezar.";
    return null;
  };

  const guardar = async (publicar) => {
    const err = validar();
    if (err) { setError(err); return; }
    setGuardando(true);
    let foto = f.foto || null;
    if (archivo) {
      const r = await subirImagen(supabase, "adjuntos", `talleres/${colegioId}/${Date.now()}`, archivo);
      if (r.error) { setGuardando(false); setError(`No se pudo subir la foto: ${r.error.message}`); return; }
      foto = r.path;
    }
    const nul = (v) => (v === "" || v == null ? null : v);
    const datos = {
      colegio_id: colegioId, nombre: sanitize(f.nombre).trim(), descripcion: nul(sanitize(f.descripcion || "").trim()), foto,
      profe_maestro_id: f.profeTipo === "maestra" ? f.profe_maestro_id : null,
      profe_texto: f.profeTipo === "externo" ? nul(sanitize(f.profe_texto || "").trim()) : null,
      lugar: nul(sanitize(f.lugar || "").trim()), costo_texto: nul(sanitize(f.costo_texto || "").trim()),
      cupo: f.cupo === "" ? null : Number(f.cupo), modo_asignacion: f.modo_asignacion, elegibilidad: f.elegibilidad,
      edad_min: f.elegibilidad === "edad" ? (f.edad_min === "" ? null : Number(f.edad_min)) : null,
      edad_max: f.elegibilidad === "edad" ? (f.edad_max === "" ? null : Number(f.edad_max)) : null,
      inscripcion_desde: nul(f.inscripcion_desde), inscripcion_hasta: nul(f.inscripcion_hasta),
      fecha_inicio: nul(f.fecha_inicio), fecha_fin: nul(f.fecha_fin), baja_hasta: nul(f.baja_hasta),
      año_lectivo: taller?.año_lectivo ?? anoActual ?? null,
      ...(publicar ? { estado: "publicado" } : taller ? {} : { estado: "borrador" }),
    };
    const r = taller
      ? await supabase.from("talleres").update(datos).eq("id", taller.id).select("id").single()
      : await supabase.from("talleres").insert(datos).select("id").single();
    if (r.error) { setGuardando(false); setError(`No se pudo guardar: ${r.error.message}`); return; }
    const id = r.data.id;
    // cursos y horarios: se reemplazan enteros
    const [dc, dh] = await Promise.all([
      supabase.from("taller_cursos").delete().eq("taller_id", id),
      supabase.from("taller_horarios").delete().eq("taller_id", id),
    ]);
    const cursosIns = f.elegibilidad === "cursos" ? f.cursos.map((c) => ({ taller_id: id, curso_id: c })) : [];
    const [ic, ih] = await Promise.all([
      cursosIns.length ? supabase.from("taller_cursos").insert(cursosIns) : { error: null },
      f.horarios.length ? supabase.from("taller_horarios").insert(f.horarios.map((h) => ({ taller_id: id, ...h }))) : { error: null },
    ]);
    setGuardando(false);
    const e2 = dc.error || dh.error || ic.error || ih.error;
    if (e2) { setError(`El taller se guardó, pero no sus cursos u horarios: ${e2.message}`); return; }
    if (archivo && taller?.foto && taller.foto !== foto) supabase.storage.from("adjuntos").remove([taller.foto]).catch(() => {});
    onGuardado({ id, publicado: publicar && taller?.estado !== "publicado", nombre: datos.nombre, inscripcion_desde: datos.inscripcion_desde, inscripcion_hasta: datos.inscripcion_hasta });
  };

  const maeF = maestros.filter((m) => !qMae || sinAcentos(fmtNombre(m)).includes(sinAcentos(qMae)));
  const esBorrador = !taller || taller.estado === "borrador";

  return (
    <Modal titulo={taller ? "Editar taller" : "Nuevo taller"} subtitulo="Lo publica el colegio; puede darlo una maestra o un profe/empresa externa." onClose={onClose} ancho={720}
      pie={<>
        {error ? <div role="alert" style={{ flexBasis: "100%", fontSize: 13, color: C.danger, fontWeight: 600 }}>{error}</div> : null}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        {esBorrador ? <button onClick={() => guardar(false)} disabled={guardando} style={btnSec}>Guardar borrador</button> : null}
        <button onClick={() => guardar(esBorrador)} disabled={guardando} style={{ ...btnPri, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : esBorrador ? "Publicar" : "Guardar cambios"}</button>
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <Campo titulo="Nombre *" span><input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Ej: Robótica" style={inp} /></Campo>
        <Campo titulo="Descripción" span><textarea value={f.descripcion} onChange={(e) => set({ descripcion: e.target.value })} rows={3} placeholder="Qué hacen, qué tienen que llevar…" style={{ ...inp, resize: "vertical" }} /></Campo>
        <Campo titulo="Foto" span>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {preview ? <img src={preview} alt="" style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 10 }} />
              : f.foto ? <SignedImg src={f.foto} bucket="adjuntos" miniatura style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 10 }} /> : null}
            <label style={{ ...btnSec, display: "inline-block" }}>
              {f.foto || preview ? "Cambiar foto" : "Elegir foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; setArchivo(file); setPreview(URL.createObjectURL(file)); }} />
            </label>
            {f.foto || preview ? <button type="button" onClick={() => { setArchivo(null); setPreview(null); set({ foto: null }); }} style={{ ...btnSec, color: C.danger }}>Quitar</button> : null}
          </div>
        </Campo>

        <Campo titulo="Quién lo da" span>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["externo", "Profe o empresa externa"], ["maestra", "Una maestra del colegio"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set({ profeTipo: v })} style={{ ...btnSec, background: f.profeTipo === v ? C.textStrong : C.surface, color: f.profeTipo === v ? "white" : SLATE[600], borderColor: f.profeTipo === v ? C.textStrong : C.borderStrong }}>{l}</button>
            ))}
          </div>
          {f.profeTipo === "externo" ? (
            <input value={f.profe_texto} onChange={(e) => set({ profe_texto: e.target.value })} placeholder="Ej: Prof. Juan Pérez · Robotix" style={inp} />
          ) : (
            <>
              <input value={qMae} onChange={(e) => setQMae(e.target.value)} placeholder="Buscar maestra…" style={inp} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, maxHeight: 110, overflowY: "auto" }}>
                {maeF.map((m) => (
                  <button key={m.id} type="button" onClick={() => set({ profe_maestro_id: m.id })} style={{ ...btnSec, padding: "5px 11px", borderRadius: 999, background: f.profe_maestro_id === m.id ? C.textStrong : C.surface, color: f.profe_maestro_id === m.id ? "white" : SLATE[600] }}>{fmtNombre(m)}</button>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6 }}>Si tiene cuenta de docente, va a ver el taller y la lista de inscriptos.</div>
            </>
          )}
        </Campo>
        <Campo titulo="Lugar"><input value={f.lugar} onChange={(e) => set({ lugar: e.target.value })} placeholder="Ej: Gimnasio" style={inp} /></Campo>
        <Campo titulo="Costo (informativo)"><input value={f.costo_texto} onChange={(e) => set({ costo_texto: e.target.value })} placeholder="Ej: $25.000 por mes · Gratis" style={inp} /></Campo>

        <Campo titulo="Horario" span>
          {f.horarios.length ? (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {f.horarios.map((h, i) => (
                <span key={`${h.dia}-${h.hora_inicio}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px", borderRadius: 999, background: C.surfaceSunken, fontSize: 12.5, color: C.text }}>
                  <span style={{ color: C.text }}>{DIA_CORTO[h.dia]} {h.hora_inicio}–{h.hora_fin}</span>
                  <button type="button" aria-label="Quitar horario" onClick={() => set({ horarios: f.horarios.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", cursor: "pointer", color: SLATE[500] }}>✕</button>
                </span>
              ))}
            </div>
          ) : <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 8 }}>Todavía sin horario.</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {DIAS_HORARIO.map((d) => {
              const on = dias.includes(d);
              return <button key={d} type="button" onClick={() => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} style={{ ...btnSec, padding: "6px 10px", background: on ? C.textStrong : C.surface, color: on ? "white" : SLATE[600], borderColor: on ? C.textStrong : C.borderStrong }}>{DIA_CORTO[d]}</button>;
            })}
            <input type="time" value={hIni} onChange={(e) => setHIni(e.target.value)} aria-label="Desde" style={{ ...inp, width: 120 }} />
            <input type="time" value={hFin} onChange={(e) => setHFin(e.target.value)} aria-label="Hasta" style={{ ...inp, width: 120 }} />
            <button type="button" onClick={agregarHorario} style={btnSec}>+ Agregar</button>
          </div>
        </Campo>

        <Campo titulo="¿Quién puede anotarse?" span>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[["cursos", "Por curso"], ["edad", "Por edad"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => set({ elegibilidad: v })} style={{ ...btnSec, background: f.elegibilidad === v ? C.textStrong : C.surface, color: f.elegibilidad === v ? "white" : SLATE[600], borderColor: f.elegibilidad === v ? C.textStrong : C.borderStrong }}>{l}</button>
            ))}
          </div>
          {f.elegibilidad === "cursos" ? (
            <CursoListSelector cursos={cursos} seleccionados={f.cursos} onToggle={(id) => set({ cursos: f.cursos.includes(id) ? f.cursos.filter((x) => x !== id) : [...f.cursos, id] })} maxHeight={200} />
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.text }}>De</span>
              <input type="number" min="0" max="25" value={f.edad_min} onChange={(e) => set({ edad_min: e.target.value })} style={{ ...inp, width: 80 }} aria-label="Edad mínima" />
              <span style={{ fontSize: 13, color: C.text }}>a</span>
              <input type="number" min="0" max="25" value={f.edad_max} onChange={(e) => set({ edad_max: e.target.value })} style={{ ...inp, width: 80 }} aria-label="Edad máxima" />
              <span style={{ fontSize: 13, color: C.text }}>años</span>
              <div style={{ flexBasis: "100%", fontSize: 11.5, color: C.textMuted }}>Se cuenta la edad al día de inicio del taller. Los alumnos sin fecha de nacimiento cargada no pueden anotarse solos.</div>
            </div>
          )}
        </Campo>

        <Campo titulo="Cupo"><input type="number" min="1" value={f.cupo} onChange={(e) => set({ cupo: e.target.value })} placeholder="Vacío = sin límite" style={inp} /></Campo>
        <Campo titulo="Cómo se asignan los lugares" span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            {[["orden_llegada", "Los primeros que se anotan entran; el resto queda en lista de espera."], ["aprobacion", "Todos quedan pendientes y el colegio aprueba o rechaza."], ["sorteo", "Al cerrar la inscripción, el colegio sortea los lugares."]].map(([v, d]) => {
              const on = f.modo_asignacion === v;
              return (
                <button key={v} type="button" onClick={() => set({ modo_asignacion: v })} style={{ textAlign: "left", padding: 12, borderRadius: 12, border: `1.5px solid ${on ? C.accent : C.borderStrong}`, background: on ? C.accentSoft : C.surface, cursor: "pointer" }}>
                  <b style={{ display: "block", fontSize: 13, color: C.textStrong }}>{MODOS[v]}</b>
                  <span style={{ fontSize: 12, color: C.textMuted }}>{d}</span>
                </button>
              );
            })}
          </div>
        </Campo>

        <Campo titulo="Inscripción desde"><input type="date" value={f.inscripcion_desde} onChange={(e) => set({ inscripcion_desde: e.target.value })} style={inp} /></Campo>
        <Campo titulo="Inscripción hasta"><input type="date" value={f.inscripcion_hasta} onChange={(e) => set({ inscripcion_hasta: e.target.value })} style={inp} /></Campo>
        <Campo titulo="Empieza"><input type="date" value={f.fecha_inicio} onChange={(e) => set({ fecha_inicio: e.target.value })} style={inp} /></Campo>
        <Campo titulo="Termina"><input type="date" value={f.fecha_fin} onChange={(e) => set({ fecha_fin: e.target.value })} style={inp} /></Campo>
        <Campo titulo="Bajas hasta" span>
          <input type="date" value={f.baja_hasta} onChange={(e) => set({ baja_hasta: e.target.value })} style={{ ...inp, maxWidth: 240 }} />
          <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 4 }}>Vacío = hasta el día que empieza. Después, la baja la hace el colegio.</div>
        </Campo>
      </div>
    </Modal>
  );
}

// ── Detalle e inscriptos ────────────────────────────────────────────────────

const GRUPOS = [["inscripto", "Inscriptos"], ["pendiente", "Pendientes"], ["espera", "Lista de espera"], ["rechazado", "Rechazados"], ["baja", "Bajas"]];

function TallerDetalle({ taller, cupos, onClose, onEditar, onCambio, showToast }) {
  const [lista, setLista] = useState(null);
  const [elegibles, setElegibles] = useState(null);
  const [qEl, setQEl] = useState("");
  const [grupo, setGrupo] = useState("inscripto");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmar, confirmUI] = useConfirmar();

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("inscriptos_taller", { p_taller: taller.id });
    setLista(data || []);
  }, [taller.id]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  const accion = async (r, acc, extra = {}) => {
    const motivo = null;
    if (acc === "rechazar") {
      const ok = await confirmar({ titulo: `¿Rechazar a ${fmtNombre(r)}?`, detalle: "La familia recibe un aviso. Si querés explicar el motivo, escribile por Mensajes.", textoConfirmar: "Rechazar" });
      if (!ok) return;
    }
    if (acc === "quitar") {
      const ok = await confirmar({ titulo: `¿Quitar a ${fmtNombre(r)} del taller?`, detalle: r.estado === "inscripto" ? "Si hay lista de espera, entra el primero." : "", textoConfirmar: "Quitar" });
      if (!ok) return;
    }
    setOcupado(true);
    const { data, error } = await supabase.rpc("resolver_inscripcion_taller", { p_taller: taller.id, p_hijo: r.hijo_id, p_accion: acc, p_motivo: motivo });
    setOcupado(false);
    if (error) { showToast(error.message, "error"); return; }
    const nombre = r.nombre?.split(" ")[0] || "Tu hijo/a";
    if (acc === "aprobar" || acc === "inscribir") avisar(data?.avisar, taller, `✓ ${nombre} quedó inscripto/a en ${taller.nombre}`);
    if (acc === "rechazar") avisar(data?.avisar, taller, `${nombre} no quedó inscripto/a en ${taller.nombre}`);
    if (acc === "quitar" && data?.avisar?.length) avisar(data.avisar, taller, `🎨 ¡Se liberó un lugar! Quedó inscripto/a en ${taller.nombre}`);
    if (extra.cerrar) setElegibles(null);
    cargar(); onCambio();
  };

  const sortear = async () => {
    const ok = await confirmar({ titulo: `¿Sortear ${taller.nombre}?`, detalle: `Se sortean ${taller.cupo} lugares entre los anotados; el resto queda en lista de espera en el orden del sorteo. Se hace una sola vez y avisa a todas las familias.`, textoConfirmar: "Sortear", colorAccion: C.accent });
    if (!ok) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("sortear_taller", { p_taller: taller.id });
    setOcupado(false);
    if (error) { showToast(error.message, "error"); return; }
    avisar(data.avisar_inscriptos, taller, `🎉 ¡Salió en el sorteo! Quedó inscripto/a en ${taller.nombre}`);
    avisar(data.avisar_espera, taller, `Sorteo de ${taller.nombre}: quedó en lista de espera. Si se libera un lugar te avisamos.`);
    showToast(`✓ Sorteo hecho: ${data.inscriptos} inscriptos, ${data.espera} en espera`, "ok");
    cargar(); onCambio();
  };

  const cambiarEstado = async (estado) => {
    const textos = {
      cerrado: ["¿Cerrar la inscripción?", "Las familias ya no pueden anotarse. Podés reabrirla después."],
      publicado: ["¿Reabrir la inscripción?", "Las familias vuelven a poder anotarse (dentro de las fechas)."],
      cancelado: [`¿Cancelar ${taller.nombre}?`, "Se avisa a todas las familias anotadas. No se puede deshacer."],
    }[estado];
    const ok = await confirmar({ titulo: textos[0], detalle: textos[1], textoConfirmar: estado === "cancelado" ? "Cancelar taller" : "Confirmar" });
    if (!ok) return;
    const anotados = estado === "cancelado" ? (await supabase.rpc("usuarios_taller", { p_taller: taller.id, p_modo: "anotados" })).data : null;
    const { error } = await supabase.from("talleres").update({ estado }).eq("id", taller.id);
    if (error) { showToast(error.message, "error"); return; }
    if (estado === "cancelado") avisar(anotados, taller, `El taller ${taller.nombre} se canceló.`);
    onCambio();
  };

  const enviarAviso = async () => {
    const texto = sanitize(msg).trim();
    if (!texto) return;
    const { data } = await supabase.rpc("usuarios_taller", { p_taller: taller.id, p_modo: "inscriptos" });
    if (!data?.length) { showToast("No hay familias inscriptas para avisar", "info"); return; }
    await avisar(data, taller, `🎨 ${taller.nombre}: ${texto}`);
    setMsg(""); showToast(`✓ Aviso enviado a ${data.length} ${data.length === 1 ? "familia" : "familias"}`, "ok");
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const nombreEstado = Object.fromEntries(GRUPOS);
    const rows = (lista || []).filter((r) => r.estado !== "baja").map((r) => ({
      Alumno: fmtNombre(r), Curso: r.curso || "", Estado: nombreEstado[r.estado] || r.estado,
      "Puesto en espera": r.posicion_espera || "", Apoderados: r.apoderados || "",
      Anotado: new Date(r.creado_en).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inscriptos");
    XLSX.writeFile(wb, `${taller.nombre.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "taller"}.xlsx`);
  };

  const abrirElegibles = async () => {
    const { data } = await supabase.rpc("elegibles_taller", { p_taller: taller.id });
    setElegibles(data || []);
  };

  const filas = (lista || []).filter((r) => r.estado === grupo);
  const cuenta = (e) => (lista || []).filter((r) => r.estado === e).length;
  const abierta = inscripcionAbierta(taller, hoyAR());
  const puedeSortear = taller.modo_asignacion === "sorteo" && !taller.sorteado_en && !abierta && taller.estado !== "cancelado" && cuenta("pendiente") > 0;
  const lleno = taller.cupo != null && cuenta("inscripto") >= taller.cupo;
  const elF = (elegibles || []).filter((e) => !qEl || sinAcentos(fmtNombre(e) + " " + e.curso).includes(sinAcentos(qEl)));

  return (
    <Modal titulo={taller.nombre} subtitulo={[textoHorario(taller.taller_horarios), taller.lugar, textoLugares(taller, cupos)].filter(Boolean).join(" · ")} onClose={onClose} ancho={760}
      pie={<>
        <button onClick={onEditar} style={btnSec}>Editar</button>
        {taller.estado === "publicado" ? <button onClick={() => cambiarEstado("cerrado")} style={btnSec}>Cerrar inscripción</button> : null}
        {taller.estado === "cerrado" ? <button onClick={() => cambiarEstado("publicado")} style={btnSec}>Reabrir inscripción</button> : null}
        {taller.estado !== "cancelado" && taller.estado !== "borrador" ? <button onClick={() => cambiarEstado("cancelado")} style={{ ...btnSec, color: C.danger }}>Cancelar taller</button> : null}
        <span style={{ flex: 1 }} />
        <button onClick={exportar} disabled={!lista?.length} style={btnSec}>Exportar Excel</button>
        {puedeSortear ? <button onClick={sortear} disabled={ocupado} style={btnPri}>Sortear</button> : null}
      </>}>
      {confirmUI}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <EstadoPill estado={taller.estado} />
        <span style={{ fontSize: 12.5, color: C.textMuted }}>{MODOS[taller.modo_asignacion]}</span>
        {taller.sorteado_en ? <span style={{ fontSize: 12.5, color: C.textMuted }}>· sorteado el {new Date(taller.sorteado_en).toLocaleDateString("es-AR")}</span> : null}
        {taller.modo_asignacion === "sorteo" && !taller.sorteado_en && abierta ? <span style={{ fontSize: 12.5, color: "#B45309" }}>· el sorteo se habilita cuando cierra la inscripción</span> : null}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {GRUPOS.map(([e, l]) => (
          <button key={e} onClick={() => setGrupo(e)} style={{ ...btnSec, padding: "6px 12px", borderRadius: 999, background: grupo === e ? C.textStrong : C.surface, color: grupo === e ? "white" : SLATE[600], borderColor: grupo === e ? C.textStrong : C.borderStrong }}>
            {l} · {cuenta(e)}
          </button>
        ))}
      </div>
      {lista === null ? <Spinner /> : null}
      {lista && !filas.length ? <div style={{ fontSize: 13, color: C.textMuted, padding: "12px 0" }}>Nadie en este grupo.</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {filas.map((r) => (
          <div key={r.hijo_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textStrong }}>{r.posicion_espera ? `${r.posicion_espera}. ` : ""}{fmtNombre(r)} <span style={{ fontWeight: 500, color: C.textMuted }}>· {r.curso}</span></div>
              {r.apoderados ? <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 2 }}>{r.apoderados}</div> : null}
            </div>
            {r.estado === "pendiente" && taller.modo_asignacion !== "sorteo" ? <>
              <button onClick={() => accion(r, "aprobar")} disabled={ocupado || lleno} title={lleno ? "Cupo completo" : ""} style={{ ...btnPri, padding: "6px 12px", opacity: lleno ? 0.5 : 1 }}>Aprobar</button>
              <button onClick={() => accion(r, "rechazar")} disabled={ocupado} style={{ ...btnSec, padding: "6px 12px" }}>Rechazar</button>
            </> : null}
            {r.estado === "espera" ? <>
              <button onClick={() => accion(r, "inscribir")} disabled={ocupado} title={lleno ? "Pasa el cupo" : ""} style={{ ...btnSec, padding: "6px 12px" }}>Pasar a inscripto{lleno ? " (pasa el cupo)" : ""}</button>
              <button onClick={() => accion(r, "rechazar")} disabled={ocupado} style={{ ...btnSec, padding: "6px 12px" }}>Rechazar</button>
            </> : null}
            {r.estado === "inscripto" ? <button onClick={() => accion(r, "quitar")} disabled={ocupado} style={{ ...btnSec, padding: "6px 12px", color: C.danger }}>Quitar</button> : null}
            {(r.estado === "baja" || r.estado === "rechazado") && taller.estado !== "cancelado" ? <button onClick={() => accion(r, "inscribir")} disabled={ocupado} style={{ ...btnSec, padding: "6px 12px" }}>Volver a inscribir</button> : null}
          </div>
        ))}
      </div>

      {taller.estado !== "cancelado" ? (
        <div style={{ marginTop: 16 }}>
          {elegibles === null ? (
            <button onClick={abrirElegibles} style={{ border: "none", background: "none", padding: 0, color: C.accent, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Anotar a un alumno a mano</button>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input value={qEl} onChange={(e) => setQEl(e.target.value)} placeholder="Buscar alumno…" style={inp} />
                <button onClick={() => setElegibles(null)} style={btnSec}>Cerrar</button>
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {!elF.length ? <div style={{ fontSize: 12.5, color: C.textMuted, padding: 6 }}>No hay alumnos elegibles sin anotar.</div> : null}
                {elF.map((e) => (
                  <div key={e.hijo_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px" }}>
                    <span style={{ flex: 1, fontSize: 13, color: C.text }}>{fmtNombre(e)} <span style={{ color: C.textMuted }}>· {e.curso}</span>{e.sin_fecha_nacimiento ? <span style={{ color: "#B45309" }}> · sin fecha de nacimiento</span> : null}</span>
                    <button onClick={() => accion(e, "inscribir", { cerrar: false })} disabled={ocupado} style={{ ...btnSec, padding: "4px 10px" }}>Anotar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {taller.estado !== "borrador" && taller.estado !== "cancelado" ? (
        <div style={{ marginTop: 18 }}>
          <div style={lbl}>Avisar a las familias inscriptas</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ej: Hoy no hay robótica por la jornada docente" style={inp} />
            <button onClick={enviarAviso} disabled={!msg.trim()} style={{ ...btnPri, opacity: msg.trim() ? 1 : 0.5 }}>Enviar</button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

const ORDEN = [
  { key: "reciente", label: "Más reciente", val: (t) => -new Date(t.creado_en).getTime() },
  { key: "nombre", label: "Nombre", val: (t) => t.nombre },
  { key: "inicio", label: "Fecha de inicio", val: (t) => t.fecha_inicio || "9999" },
];

export function TalleresColegio({ colegioId, cursos = [], anoActual = null }) {
  const [talleres, setTalleres] = useState(null);
  const [cupos, setCupos] = useState({});
  const [maestros, setMaestros] = useState([]);
  const [form, setForm] = useState(null);       // { taller? }
  const [detalleId, setDetalleId] = useState(null);
  const { showToast, Toast } = useToast(4500);

  const cargar = useCallback(async () => {
    if (!colegioId) return;
    const [t, mc] = await Promise.all([
      supabase.from("talleres").select(SELECT_TALLER).eq("colegio_id", colegioId).order("creado_en", { ascending: false }),
      supabase.from("maestro_cursos").select("maestro_id,cursos!inner(colegio_id)").eq("cursos.colegio_id", colegioId),
    ]);
    const lista = (t.data || []).filter((x) => !anoActual || x.año_lectivo == null || x.año_lectivo === anoActual);
    const ids = [...new Set((mc.data || []).map((r) => r.maestro_id))];
    const [c, mae] = await Promise.all([
      lista.length ? supabase.rpc("cupos_talleres", { p_ids: lista.map((x) => x.id) }) : { data: [] },
      ids.length ? supabase.from("maestros").select("id,nombre,apellido").eq("activo", true).in("id", ids).order("nombre") : { data: [] },
    ]);
    setTalleres(lista); setCupos(Object.fromEntries((c.data || []).map((r) => [r.taller_id, r]))); setMaestros(mae.data || []);
  }, [colegioId, anoActual]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  const nombresCursos = useMemo(() => Object.fromEntries(cursos.map((c) => [c.id, c.nombre])), [cursos]);
  const ctrl = useListControls(talleres || [], {
    searchFn: (t, q) => sinAcentos(`${t.nombre} ${t.profe_texto || ""} ${t.lugar || ""}`).includes(sinAcentos(q)),
    sortOptions: ORDEN,
    filterOptions: [
      { key: "estado", label: "Estado", options: Object.entries(ESTADOS_TALLER).map(([value, label]) => ({ value, label })), match: (t, v) => t.estado === v },
    ],
    pageSize: 12,
  });

  const detalle = (talleres || []).find((t) => t.id === detalleId);

  const guardado = async (r) => {
    setForm(null);
    if (r.publicado) {
      // aviso a las familias con algún hijo elegible
      const { data } = await supabase.rpc("usuarios_taller", { p_taller: r.id, p_modo: "elegibles" });
      const abre = r.inscripcion_desde && r.inscripcion_desde > hoyAR() ? ` La inscripción abre el ${fmtFechaCorta(r.inscripcion_desde)}.` : r.inscripcion_hasta ? ` Inscripción hasta el ${fmtFechaCorta(r.inscripcion_hasta)}.` : "";
      await avisar(data, { id: r.id, nombre: r.nombre }, `🎨 Nuevo taller: ${r.nombre}.${abre}`);
      showToast(`✓ Publicado${data?.length ? ` · avisamos a ${data.length} ${data.length === 1 ? "familia" : "familias"}` : ""}`, "ok");
    } else showToast("✓ Guardado", "ok");
    cargar();
  };

  if (!colegioId) return <div style={{ color: C.textMuted, fontSize: 13 }}>Elegí un colegio primero.</div>;
  if (talleres === null) return <Spinner />;

  return (
    <div>
      <Toast />
      {/* La explicación ya está en el encabezado del panel. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <BotonNuevo ariaLabel="Nuevo taller" onClick={() => setForm({})} />
      </div>
      <ListToolbar {...ctrl} sortOptions={ORDEN} placeholder="Buscar taller, profe o lugar…" />
      {!talleres.length ? (
        <EmptyState icono="paleta" titulo="Todavía no hay talleres" nota="Publicá uno para los cursos o las edades que elijas; las familias lo ven en la app y anotan a sus hijos." accion="Nuevo taller" onAccion={() => setForm({})} style={{ marginTop: 12 }} />
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 12, marginTop: 12 }}>
        {ctrl.items.map((t) => {
          const cu = cupos[t.id] || {};
          return (
            <button key={t.id} onClick={() => setDetalleId(t.id)} style={{ textAlign: "left", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 0, overflow: "hidden", cursor: "pointer" }}>
              {t.foto ? <SignedImg src={t.foto} bucket="adjuntos" miniatura style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }} /> : null}
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: C.textStrong }}>{t.nombre}</div>
                  <EstadoPill estado={t.estado} />
                </div>
                <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 4 }}>{[textoHorario(t.taller_horarios), textoProfe(t, t.profe)].filter(Boolean).join(" · ") || "Sin horario"}</div>
                <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 2 }}>{textoElegibilidad(t, (t.taller_cursos || []).map((x) => nombresCursos[x.curso_id]).filter(Boolean))}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, marginTop: 8 }}>
                  {[`${cu.inscriptos || 0}${t.cupo ? `/${t.cupo}` : ""} inscriptos`, cu.pendientes ? `${cu.pendientes} pendientes` : null, cu.espera ? `${cu.espera} en espera` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <Paginador pagina={ctrl.pagina} totalPag={ctrl.totalPag} setPagina={ctrl.setPagina} />

      {form ? <TallerForm taller={form.taller} colegioId={colegioId} cursos={cursos} anoActual={anoActual} maestros={maestros} onClose={() => setForm(null)} onGuardado={guardado} /> : null}
      {detalle && !form ? (
        <TallerDetalle taller={detalle} cupos={cupos[detalle.id]} showToast={showToast} onClose={() => setDetalleId(null)}
          onEditar={() => setForm({ taller: detalle })} onCambio={cargar} />
      ) : null}
    </div>
  );
}
