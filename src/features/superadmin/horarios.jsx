// Editor del horario semanal de un curso (web). Lo usan Super Admin →
// Horarios (puedeEditarClases: crea clases, talleres y copia de otro curso) y
// el panel del Room Parent (solo arma bloques con las clases que ya existen).
//
//   · Grilla Lun–Vie (+ Sábado si hay algo o se pide), horas según lo cargado:
//     tocás un hueco para agregar ahí, tocás un bloque para editarlo.
//   · Un bloque se guarda en varios días a la vez; al editar uno que se repite
//     (misma clase y hora en otros días) se elige si va solo ese día o todos.
//   · Clase con buscador; si no existe se crea ahí mismo (materia + maestra).
//   · Talleres optativos: clase con `optativa` + alumnos anotados
//     (clase_alumnos, supabase/horarios-talleres.sql).
//   · Atajos: copiar un día a otros, copiar el horario de otro curso.
// Reglas puras en src/lib/horarios.js (@shared/horarios, también en mobile).
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabase";
import { fmtNombre, sanitize } from "../../lib/helpers";
import { THEMES, SLATE } from "../../lib/tokens";
import {
  DIAS_HORARIO, DIAS_HABILES, DIA_CORTO, normalizarDia, aMin, deMin, hhmm, validarBloque, superposiciones,
  serieDe, planGuardarBloque, planCopiarDia, planCopiarCurso, diasVisibles, rangoGrilla, carriles,
} from "../../lib/horarios";
import { PALETA_MATERIAS, useMaterias, cargarClasesCurso, etiquetaClase } from "./clasesDatos";
import { useConfirmar } from "../../hooks/useConfirmar";

const C = THEMES.light;
const PX = 1.15; // px por minuto en la grilla
const DUR_DEFAULT = 40;
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, outline: "none", fontFamily: "inherit", background: C.surfaceSunken, boxSizing: "border-box", color: C.text };
const btnPri = { padding: "9px 16px", borderRadius: 10, border: "none", background: C.accent, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnSec = { padding: "8px 13px", borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.surface, cursor: "pointer", fontSize: 12.5, color: SLATE[700], fontWeight: 700, whiteSpace: "nowrap" };
const lbl = { fontSize: 11, fontWeight: 800, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function aplicarPlan({ actualizar = [], insertar = [], borrar = [] }) {
  const ops = [
    ...actualizar.map((u) => supabase.from("horarios").update(u.datos).eq("id", u.id)),
    insertar.length ? supabase.from("horarios").insert(insertar) : null,
    borrar.length ? supabase.from("horarios").delete().in("id", borrar) : null,
  ].filter(Boolean);
  const res = await Promise.all(ops);
  return res.find((r) => r.error)?.error || null;
}

function Modal({ titulo, subtitulo, onClose, children, pie, ancho = 560 }) {
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
        {pie ? <div style={{ padding: "12px 22px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center" }}>{pie}</div> : null}
      </div>
    </div>
  );
}

function PillsDias({ dias, setDias, mostrar = DIAS_HORARIO }) {
  const toggle = (d) => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {mostrar.map((d) => {
          const on = dias.includes(d);
          return (
            <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={on}
              style={{ minWidth: 54, minHeight: 40, padding: "0 12px", borderRadius: 10, border: `1.5px solid ${on ? C.textStrong : C.borderStrong}`, background: on ? C.textStrong : C.surface, color: on ? "white" : SLATE[600], fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {DIA_CORTO[d]}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
        {[["Lun a Vie", DIAS_HABILES], ["Todos", mostrar], ["Ninguno", []]].map(([t, v]) => (
          <button key={t} type="button" onClick={() => setDias(v)} style={{ border: "none", background: "none", padding: 0, color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t}</button>
        ))}
      </div>
    </div>
  );
}

/** Lista de clases con buscador. Recreo/Almuerzo (sin maestra) van aparte. */
function BuscadorClase({ clases, value, onChange, onCrear }) {
  const [q, setQ] = useState("");
  const filtradas = clases.filter((c) => !q || sinAcentos(etiquetaClase(c)).includes(sinAcentos(q)));
  const con = filtradas.filter((c) => c.maestro_id), sin = filtradas.filter((c) => !c.maestro_id);
  const fila = (c) => {
    const on = c.id === value;
    return (
      <button key={c.id} type="button" onClick={() => onChange(c.id)} aria-pressed={on}
        style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${on ? C.accent : "transparent"}`, background: on ? C.accentSoft || "#EFF6FF" : "transparent", cursor: "pointer" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.materias?.color || SLATE[400], flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, color: C.text }}>
          <b style={{ color: C.textStrong }}>{c.materias?.nombre}</b>
          {c.maestros ? <span style={{ color: C.textMuted }}> · {fmtNombre(c.maestros)}</span> : null}
        </span>
        {c.optativa ? <span style={{ fontSize: 10.5, fontWeight: 800, color: "#7C3AED", background: "#F5F3FF", borderRadius: 999, padding: "2px 7px" }}>TALLER</span> : null}
        {on ? <span style={{ color: C.accent, fontWeight: 800 }}>✓</span> : null}
      </button>
    );
  };
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar materia o maestra…" aria-label="Buscar clase" style={inp} />
      <div style={{ marginTop: 8, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, maxHeight: 230, overflowY: "auto" }}>
        {!filtradas.length ? <div style={{ padding: 12, fontSize: 12.5, color: C.textMuted }}>No hay clases con “{q}”.</div> : null}
        {con.map(fila)}
        {sin.length ? <div style={{ ...lbl, margin: "8px 10px 4px" }}>Sin maestra (recreo, almuerzo…)</div> : null}
        {sin.map(fila)}
      </div>
      {onCrear ? (
        <button type="button" onClick={() => onCrear(q)} style={{ marginTop: 8, border: "none", background: "none", padding: 0, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          + Crear una clase nueva{q ? ` (“${q}”)` : ""}
        </button>
      ) : null}
    </div>
  );
}

// ── Bloque: agregar / editar en varios días ─────────────────────────────────

function BloqueModal({ curso, inicial, alcance, horarios, clases, conSabado, onClose, onGuardado, onCrearClase, showToast }) {
  const [dias, setDias] = useState(inicial.dias);
  const [ini, setIni] = useState(inicial.hora_inicio);
  const [fin, setFin] = useState(inicial.hora_fin);
  const [claseId, setClaseId] = useState(inicial.clase_id || "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, confirmUI] = useConfirmar();


  const choques = superposiciones(horarios, { dias, hora_inicio: ini, hora_fin: fin }, alcance.map((h) => h.id));
  const durar = (min) => { const a = aMin(ini); if (a != null) setFin(deMin(a + min)); };
  const mostrarDias = conSabado || dias.includes("Sábado") ? DIAS_HORARIO : DIAS_HABILES;

  const guardar = async () => {
    const err = validarBloque({ dias, hora_inicio: ini, hora_fin: fin, clase_id: claseId });
    if (err) { setError(err); return; }
    setGuardando(true);
    const e = await aplicarPlan(planGuardarBloque({ alcance, dias, hora_inicio: ini, hora_fin: fin, clase_id: claseId, curso_id: curso.id }));
    setGuardando(false);
    if (e) { setError(`No se pudo guardar: ${e.message}`); return; }
    onGuardado();
  };
  const quitar = async () => {
    const ok = await confirmar({
      titulo: alcance.length > 1 ? `¿Quitar este bloque de ${alcance.length} días?` : "¿Quitar este bloque del horario?",
      detalle: `${etiquetaClase(clases.find((c) => c.id === claseId) || {})} — ${alcance.map((h) => DIA_CORTO[normalizarDia(h.dia)]).join(", ")} ${hhmm(alcance[0].hora_inicio)} a ${hhmm(alcance[0].hora_fin)}.`,
      textoConfirmar: "Quitar",
    });
    if (!ok) return;
    const e = await aplicarPlan({ borrar: alcance.map((h) => h.id) });
    if (e) { showToast?.(`No se pudo quitar: ${e.message}`, "error"); return; }
    onGuardado();
  };

  const editando = alcance.length > 0;
  return (
    <Modal titulo={editando ? "Editar bloque" : "Agregar al horario"} subtitulo={curso.nombre} onClose={onClose}
      pie={<>
        {editando ? <button onClick={quitar} style={{ ...btnSec, color: C.danger, borderColor: C.dangerBorder || "#FECACA" }}>Quitar</button> : null}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btnPri, opacity: guardando ? 0.6 : 1 }}>
          {guardando ? "Guardando…" : dias.length > 1 ? `Guardar en ${dias.length} días` : "Guardar"}
        </button>
      </>}>
      {confirmUI}
      <div style={lbl}>Días</div>
      <PillsDias dias={dias} setDias={(v) => { setDias(v); setError(""); }} mostrar={mostrarDias} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div><div style={lbl}>Empieza</div><input type="time" value={ini} onChange={(e) => { setIni(e.target.value); setError(""); }} style={inp} aria-label="Hora de inicio" /></div>
        <div><div style={lbl}>Termina</div><input type="time" value={fin} onChange={(e) => { setFin(e.target.value); setError(""); }} style={inp} aria-label="Hora de fin" /></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.textMuted }}>Dura:</span>
        {[30, 40, 45, 60, 80, 90].map((m) => {
          const on = aMin(fin) - aMin(ini) === m;
          return <button key={m} type="button" onClick={() => durar(m)} style={{ ...btnSec, padding: "4px 10px", fontSize: 12, background: on ? C.textStrong : C.surface, color: on ? "white" : SLATE[600], borderColor: on ? C.textStrong : C.borderStrong }}>{m} min</button>;
        })}
      </div>

      <div style={{ ...lbl, marginTop: 18 }}>Clase</div>
      <BuscadorClase clases={clases} value={claseId} onChange={(id) => { setClaseId(id); setError(""); }}
        onCrear={onCrearClase ? (q) => onCrearClase(q, (nueva) => setClaseId(nueva.id)) : null} />

      {choques.length ? (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "#92400E", background: C.warningSoft, border: `1px solid ${C.warningBorder}`, borderRadius: 10, padding: "8px 12px", lineHeight: 1.45 }}>
          ⚠️ Se superpone con {choques.slice(0, 3).map((h) => `${h.materia} (${DIA_CORTO[normalizarDia(h.dia)]} ${hhmm(h.hora_inicio)}–${hhmm(h.hora_fin)})`).join(", ")}{choques.length > 3 ? ` y ${choques.length - 3} más` : ""}. Si es un taller optativo puede estar bien.
        </div>
      ) : null}
      {error ? <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.danger, fontWeight: 600 }}>{error}</div> : null}
    </Modal>
  );
}

// ── Clase: materia + maestra (+ taller optativo con alumnos) ─────────────────

function ClaseModal({ curso, colegioId, clase, textoInicial = "", maestros, usos = 0, onClose, onGuardada, showToast }) {
  const { materias, recargar } = useMaterias(colegioId);
  const [materiaId, setMateriaId] = useState(clase?.materia_id || "");
  const [qMat, setQMat] = useState(clase ? "" : textoInicial);
  const [maestroId, setMaestroId] = useState(clase?.maestro_id || "");
  const [qMae, setQMae] = useState("");
  const [optativa, setOptativa] = useState(!!clase?.optativa);
  const [alumnos, setAlumnos] = useState(null);
  const [anotados, setAnotados] = useState(new Set());
  const [anotadosOrig, setAnotadosOrig] = useState(new Set());
  const [qAl, setQAl] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, confirmUI] = useConfirmar();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [al, an] = await Promise.all([
        supabase.from("hijos").select("id,nombre,apellido").eq("curso_id", curso.id).order("nombre"),
        clase ? supabase.from("clase_alumnos").select("hijo_id").eq("clase_id", clase.id) : { data: [] },
      ]);
      if (!vivo) return;
      const s = new Set((an.data || []).map((r) => r.hijo_id));
      setAlumnos(al.data || []); setAnotados(s); setAnotadosOrig(new Set(s));
    })();
    return () => { vivo = false; };
  }, [curso.id, clase]);

  const activas = (materias || []).filter((m) => m.activo || m.id === materiaId);
  const matFiltradas = activas.filter((m) => !qMat || sinAcentos(m.nombre).includes(sinAcentos(qMat)));
  const existeExacta = activas.some((m) => sinAcentos(m.nombre) === sinAcentos(qMat));
  const maeFiltradas = maestros.filter((m) => !qMae || sinAcentos(fmtNombre(m)).includes(sinAcentos(qMae)));
  const alFiltrados = (alumnos || []).filter((a) => !qAl || sinAcentos(fmtNombre(a)).includes(sinAcentos(qAl)));

  const crearMateria = async () => {
    const nombre = sanitize(qMat).trim();
    if (!nombre) return;
    const { data, error: e } = await supabase.from("materias")
      .insert({ colegio_id: colegioId, nombre, color: PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length], orden: (materias?.length || 0) + 1 })
      .select("id").single();
    if (e) { setError(`No se pudo crear la materia: ${e.message}`); return; }
    await recargar(); setMateriaId(data.id); setQMat("");
  };

  const guardar = async () => {
    if (!materiaId) { setError("Elegí la materia."); return; }
    if (optativa && !anotados.size) { setError("Anotá al menos un alumno en el taller (o destildá “optativo”)."); return; }
    setGuardando(true); setError("");
    const datos = { curso_id: curso.id, materia_id: materiaId, maestro_id: maestroId || null, optativa };
    const r = clase
      ? await supabase.from("clases").update(datos).eq("id", clase.id).select("id").single()
      : await supabase.from("clases").insert(datos).select("id").single();
    if (r.error) {
      setGuardando(false);
      setError(r.error.code === "23505" ? "Ese curso ya tiene esa materia con esa maestra." : `No se pudo guardar: ${r.error.message}`);
      return;
    }
    const id = r.data.id;
    // alumnos del taller: si deja de ser optativa, se vacía la lista
    const quedan = optativa ? anotados : new Set();
    const sacar = [...anotadosOrig].filter((h) => !quedan.has(h));
    const poner = [...quedan].filter((h) => !anotadosOrig.has(h));
    const ops = await Promise.all([
      sacar.length ? supabase.from("clase_alumnos").delete().eq("clase_id", id).in("hijo_id", sacar) : { error: null },
      poner.length ? supabase.from("clase_alumnos").insert(poner.map((h) => ({ clase_id: id, hijo_id: h }))) : { error: null },
    ]);
    setGuardando(false);
    const e2 = ops.find((o) => o.error)?.error;
    if (e2) { setError(`La clase se guardó, pero no la lista de alumnos: ${e2.message}`); return; }
    onGuardada({ id });
  };

  const eliminar = async () => {
    const ok = await confirmar({
      titulo: `¿Quitar “${etiquetaClase(clase)}” de ${curso.nombre}?`,
      detalle: usos ? `Está en ${usos} ${usos === 1 ? "bloque" : "bloques"} del horario: se siguen viendo con su texto, pero quedan sin clase.` : "No está en el horario.",
      textoConfirmar: "Quitar clase",
    });
    if (!ok) return;
    const { error: e } = await supabase.from("clases").delete().eq("id", clase.id);
    if (e) { showToast?.(`No se pudo quitar: ${e.message}`, "error"); return; }
    onGuardada(null);
  };

  const toggleAl = (id) => setAnotados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Modal titulo={clase ? "Editar clase" : "Nueva clase"} subtitulo={curso.nombre} onClose={onClose} ancho={600}
      pie={<>
        {clase ? <button onClick={eliminar} style={{ ...btnSec, color: C.danger }}>Quitar clase</button> : null}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btnPri, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Guardando…" : "Guardar clase"}</button>
      </>}>
      {confirmUI}
      <div style={lbl}>Materia</div>
      <input value={qMat} onChange={(e) => setQMat(e.target.value)} placeholder={materiaId ? (materias || []).find((m) => m.id === materiaId)?.nombre : "Buscar o escribir una materia nueva…"} aria-label="Materia" style={inp} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, maxHeight: 132, overflowY: "auto" }}>
        {matFiltradas.map((m) => {
          const on = m.id === materiaId;
          return (
            <button key={m.id} type="button" onClick={() => { setMateriaId(m.id); setQMat(""); setError(""); }} aria-pressed={on}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999, border: `1.5px solid ${on ? C.textStrong : C.borderStrong}`, background: on ? C.textStrong : C.surface, color: on ? "white" : C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
              <span style={{ color: on ? "white" : C.text }}>{m.nombre}</span>
            </button>
          );
        })}
        {qMat.trim() && !existeExacta ? (
          <button type="button" onClick={crearMateria} style={{ padding: "6px 11px", borderRadius: 999, border: `1.5px dashed ${C.accent}`, background: C.surface, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
            + Crear materia “{qMat.trim()}”
          </button>
        ) : null}
      </div>

      <div style={{ ...lbl, marginTop: 18 }}>Maestra</div>
      <input value={qMae} onChange={(e) => setQMae(e.target.value)} placeholder="Buscar maestra…" aria-label="Buscar maestra" style={inp} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, maxHeight: 132, overflowY: "auto" }}>
        {[{ id: "", _sin: true }, ...maeFiltradas].map((m) => {
          const on = (maestroId || "") === m.id;
          return (
            <button key={m.id || "sin"} type="button" onClick={() => setMaestroId(m.id)} aria-pressed={on}
              style={{ padding: "6px 11px", borderRadius: 999, border: `1.5px solid ${on ? C.textStrong : C.borderStrong}`, background: on ? C.textStrong : C.surface, color: on ? "white" : C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <span style={{ color: on ? "white" : m._sin ? C.textMuted : C.text }}>{m._sin ? "Sin maestra (recreo, almuerzo…)" : fmtNombre(m)}</span>
            </button>
          );
        })}
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, padding: 12, border: `1px solid ${optativa ? "#DDD6FE" : C.border}`, background: optativa ? "#F5F3FF" : C.surface, borderRadius: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={optativa} onChange={(e) => setOptativa(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <b style={{ fontSize: 13.5, color: C.textStrong, display: "block" }}>Es un taller optativo</b>
          <span style={{ fontSize: 12.5, color: C.textMuted }}>Solo lo hacen algunos alumnos. Cada familia lo ve en su horario si su hijo está anotado.</span>
        </span>
      </label>
      {optativa ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ ...lbl, margin: 0, flex: 1 }}>Alumnos anotados · {anotados.size}</div>
            <button type="button" onClick={() => setAnotados(new Set((alumnos || []).map((a) => a.id)))} style={{ border: "none", background: "none", color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Todos</button>
            <button type="button" onClick={() => setAnotados(new Set())} style={{ border: "none", background: "none", color: C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Ninguno</button>
          </div>
          <input value={qAl} onChange={(e) => setQAl(e.target.value)} placeholder="Buscar alumno…" aria-label="Buscar alumno" style={inp} />
          <div style={{ marginTop: 6, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 200, overflowY: "auto", padding: 4 }}>
            {alumnos === null ? <div style={{ padding: 10, fontSize: 12.5, color: C.textMuted }}>Cargando…</div> : null}
            {alumnos && !alumnos.length ? <div style={{ padding: 10, fontSize: 12.5, color: C.textMuted }}>Este curso no tiene alumnos cargados.</div> : null}
            {alFiltrados.map((a) => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 8px", fontSize: 13, color: C.text, cursor: "pointer" }}>
                <input type="checkbox" checked={anotados.has(a.id)} onChange={() => toggleAl(a.id)} />
                <span style={{ color: C.text }}>{fmtNombre(a)}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {error ? <div role="alert" style={{ marginTop: 12, fontSize: 13, color: C.danger, fontWeight: 600 }}>{error}</div> : null}
    </Modal>
  );
}

// ── Atajos ──────────────────────────────────────────────────────────────────

function CopiarDiaModal({ horarios, dias: diasGrilla, onClose, onHecho }) {
  const conBloques = diasGrilla.filter((d) => horarios.some((h) => normalizarDia(h.dia) === d));
  const [origen, setOrigen] = useState(conBloques[0] || "Lunes");
  const [destinos, setDestinos] = useState([]);
  const [reemplazar, setReemplazar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const plan = planCopiarDia(horarios, origen, destinos, { reemplazar });
  const copiar = async () => {
    setGuardando(true);
    const e = await aplicarPlan(plan);
    setGuardando(false);
    if (e) { setError(`No se pudo copiar: ${e.message}`); return; }
    onHecho(`✓ Copiado a ${destinos.length} ${destinos.length === 1 ? "día" : "días"}`);
  };
  return (
    <Modal titulo="Copiar un día a otros" subtitulo="Armás un día y lo repetís en el resto" onClose={onClose} ancho={480}
      pie={<><span style={{ flex: 1, fontSize: 12.5, color: C.textMuted }}>{destinos.length ? `${plan.insertar.length} bloques nuevos${plan.borrar.length ? `, ${plan.borrar.length} se reemplazan` : ""}` : ""}</span>
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={copiar} disabled={!destinos.length || guardando || (!plan.insertar.length && !plan.borrar.length)} style={{ ...btnPri, opacity: destinos.length && !guardando ? 1 : 0.5 }}>Copiar</button></>}>
      <div style={lbl}>Copiar el</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {conBloques.map((d) => (
          <button key={d} type="button" onClick={() => { setOrigen(d); setDestinos((x) => x.filter((y) => y !== d)); }}
            style={{ ...btnSec, background: origen === d ? C.textStrong : C.surface, color: origen === d ? "white" : SLATE[600], borderColor: origen === d ? C.textStrong : C.borderStrong }}>{d}</button>
        ))}
      </div>
      <div style={{ ...lbl, marginTop: 16 }}>A estos días</div>
      <PillsDias dias={destinos} setDias={(v) => setDestinos(v.filter((d) => d !== origen))} mostrar={diasGrilla.filter((d) => d !== origen)} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, fontSize: 13, color: C.text, cursor: "pointer" }}>
        <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
        <span style={{ color: C.text }}>Borrar lo que ya hay en esos días antes de copiar</span>
      </label>
      {error ? <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.danger }}>{error}</div> : null}
    </Modal>
  );
}

function CopiarCursoModal({ curso, cursos, horarios, clases, onClose, onHecho }) {
  const otros = cursos.filter((c) => c.id !== curso.id);
  const [origenId, setOrigenId] = useState("");
  const [datos, setDatos] = useState(null); // { horarios, clases } del curso origen
  const [reemplazar, setReemplazar] = useState(false); // borrar lo actual tiene que ser una decisión explícita
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!origenId) return;
    let vivo = true;
    Promise.all([
      supabase.from("horarios").select("*").eq("curso_id", origenId),
      cargarClasesCurso(origenId),
    ]).then(([h, cl]) => { if (vivo) setDatos({ horarios: h.data || [], clases: cl }); });
    return () => { vivo = false; };
  }, [origenId]);

  const claveClase = (c) => `${c.materia_id}|${c.maestro_id || ""}`;
  const resumen = useMemo(() => {
    if (!datos) return null;
    const destPorClave = new Map(clases.map((c) => [claveClase(c), c.id]));
    const origPorId = new Map(datos.clases.map((c) => [c.id, c]));
    const faltan = datos.clases.filter((c) => !destPorClave.has(claveClase(c)) && datos.horarios.some((h) => h.clase_id === c.id));
    return { destPorClave, origPorId, faltan };
  }, [datos, clases]);

  const copiar = async () => {
    setGuardando(true); setError("");
    // 1) crear en este curso las clases que faltan (misma materia y maestra)
    const destPorClave = new Map(resumen.destPorClave);
    if (resumen.faltan.length) {
      const { data, error: e } = await supabase.from("clases")
        .insert(resumen.faltan.map((c) => ({ curso_id: curso.id, materia_id: c.materia_id, maestro_id: c.maestro_id, optativa: !!c.optativa })))
        .select("id,materia_id,maestro_id");
      if (e) { setGuardando(false); setError(`No se pudieron crear las clases: ${e.message}`); return; }
      for (const c of data) destPorClave.set(claveClase(c), c.id);
    }
    // 2) copiar los bloques
    const plan = planCopiarCurso(datos.horarios, horarios, curso.id,
      (h) => { const c = resumen.origPorId.get(h.clase_id); return c ? destPorClave.get(claveClase(c)) : undefined; }, { reemplazar });
    const e = await aplicarPlan(plan);
    setGuardando(false);
    if (e) { setError(`No se pudo copiar: ${e.message}`); return; }
    onHecho(`✓ ${plan.insertar.length} bloques copiados`);
  };

  return (
    <Modal titulo="Copiar el horario de otro curso" subtitulo={`A ${curso.nombre}`} onClose={onClose} ancho={500}
      pie={<><span style={{ flex: 1 }} />
        <button onClick={onClose} style={btnSec}>Cancelar</button>
        <button onClick={copiar} disabled={!datos?.horarios.length || guardando} style={{ ...btnPri, opacity: datos?.horarios.length && !guardando ? 1 : 0.5 }}>{guardando ? "Copiando…" : "Copiar"}</button></>}>
      <div style={lbl}>Desde</div>
      <select value={origenId} onChange={(e) => { setOrigenId(e.target.value); setDatos(null); }} aria-label="Curso origen" style={inp}>
        <option value="">Elegí un curso…</option>
        {otros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      {origenId && !datos ? <div style={{ marginTop: 10, fontSize: 12.5, color: C.textMuted }}>Cargando…</div> : null}
      {datos ? (
        <div style={{ marginTop: 12, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
          {!datos.horarios.length ? "Ese curso no tiene horario cargado." : (
            <>
              <div style={{ color: C.text }}>Se copian <b>{datos.horarios.length} bloques</b> con sus días y horas.</div>
              {resumen.faltan.length ? <div style={{ color: C.text, marginTop: 4 }}>Se crean en {curso.nombre} las clases que faltan: {resumen.faltan.map((c) => etiquetaClase(c)).join(", ")}.</div> : null}
              <div style={{ color: C.textMuted, marginTop: 4 }}>Los talleres se copian sin alumnos anotados.</div>
            </>
          )}
        </div>
      ) : null}
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, fontSize: 13, color: C.text, cursor: "pointer" }}>
        <input type="checkbox" checked={reemplazar} onChange={(e) => setReemplazar(e.target.checked)} />
        <span style={{ color: C.text }}>Borrar el horario actual de {curso.nombre} antes de copiar{horarios.length ? ` (${horarios.length} bloques)` : ""}</span>
      </label>
      {error ? <div role="alert" style={{ marginTop: 10, fontSize: 13, color: C.danger }}>{error}</div> : null}
    </Modal>
  );
}

// ── Grilla ──────────────────────────────────────────────────────────────────

function Grilla({ horarios, dias, optativas, onHueco, onBloque }) {
  const { desde, hasta } = rangoGrilla(horarios);
  const alto = (hasta - desde) * PX;
  const horas = [];
  for (let m = desde; m <= hasta; m += 60) horas.push(m);
  const porDia = useMemo(() => Object.fromEntries(dias.map((d) => {
    const bs = horarios.filter((h) => normalizarDia(h.dia) === d && aMin(h.hora_inicio) != null);
    return [d, { bs, car: carriles(bs) }];
  })), [horarios, dias]);

  const clickHueco = (dia, e) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const m = Math.round((desde + y / PX) / 5) * 5;
    onHueco(dia, deMin(Math.max(desde, Math.min(m, hasta - DUR_DEFAULT))));
  };

  return (
    <div style={{ overflowX: "auto", overflowY: "hidden", border: `1px solid ${C.border}`, borderRadius: 14, background: C.surface }}>
      <div style={{ minWidth: 120 + dias.length * 110, display: "grid", gridTemplateColumns: `52px repeat(${dias.length}, minmax(0, 1fr))` }}>
        <div style={{ borderBottom: `1px solid ${C.border}` }} />
        {dias.map((d) => (
          <div key={d} style={{ padding: "10px 6px", textAlign: "center", fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: SLATE[600], borderBottom: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}` }}>{d}</div>
        ))}
        <div style={{ position: "relative", height: alto }}>
          {horas.map((m) => (
            <div key={m} style={{ position: "absolute", top: (m - desde) * PX - 7, right: 8, fontSize: 10.5, fontWeight: 700, color: C.textFaint }}>{deMin(m)}</div>
          ))}
        </div>
        {dias.map((d) => (
          <div key={d} onClick={(e) => clickHueco(d, e)} title="Tocá un espacio libre para agregar"
            style={{ position: "relative", height: alto, borderLeft: `1px solid ${C.border}`, cursor: "copy",
              backgroundImage: `repeating-linear-gradient(to bottom, ${C.border} 0, ${C.border} 1px, transparent 1px, transparent ${60 * PX}px)` }}>
            {porDia[d].bs.map((h) => {
              const a = aMin(h.hora_inicio), b = aMin(h.hora_fin) ?? a + DUR_DEFAULT;
              const { carril, carriles: n } = porDia[d].car.get(h.id) || { carril: 0, carriles: 1 };
              const col = h.color || "#3B82F6";
              const opt = h.clase_id && optativas.has(h.clase_id);
              const altoB = Math.max((b - a) * PX - 2, 18);
              return (
                <button key={h.id} type="button" onClick={() => onBloque(h)} title={`${h.materia}${h.docente ? ` · ${h.docente}` : ""} — ${hhmm(h.hora_inicio)} a ${hhmm(h.hora_fin)}`}
                  style={{ position: "absolute", top: (a - desde) * PX + 1, height: altoB, left: `calc(${(carril / n) * 100}% + 3px)`, width: `calc(${100 / n}% - 6px)`,
                    background: col + "1F", border: `1.5px ${opt ? "dashed" : "solid"} ${col}66`, borderLeft: `4px solid ${col}`, borderRadius: 8, padding: "3px 6px",
                    textAlign: "left", cursor: "pointer", overflow: "hidden", boxSizing: "border-box" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: SLATE[800], lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opt ? "✦ " : ""}{h.materia}</div>
                  {altoB > 34 ? <div style={{ fontSize: 10.5, color: SLATE[600], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hhmm(h.hora_inicio)}–{hhmm(h.hora_fin)}{h.docente ? ` · ${h.docente}` : ""}</div> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export function HorarioCurso({ curso, colegioId, cursos = [], maestros = [], puedeEditarClases = true, showToast, onCambio }) {
  const [horarios, setHorarios] = useState(null);
  const [clases, setClases] = useState([]);
  const [anotadosPorClase, setAnotadosPorClase] = useState({});
  const [conSabado, setConSabado] = useState(false);
  const [bloque, setBloque] = useState(null);     // { inicial, alcance }
  const [alcanceDe, setAlcanceDe] = useState(null); // bloque clickeado que se repite: elegir alcance
  const [claseEd, setClaseEd] = useState(null);   // { clase?, texto?, alCrear? }
  const [copia, setCopia] = useState(null);       // "dia" | "curso"
  const toast = (m, t) => (showToast ? showToast(m, t) : window.alert(m));

  const cargar = useCallback(async () => {
    const [hor, cls] = await Promise.all([
      supabase.from("horarios").select("*").eq("curso_id", curso.id).order("hora_inicio"),
      cargarClasesCurso(curso.id),
    ]);
    const opt = cls.filter((c) => c.optativa).map((c) => c.id);
    const an = opt.length ? await supabase.from("clase_alumnos").select("clase_id").in("clase_id", opt) : { data: [] };
    const n = {};
    for (const r of an.data || []) n[r.clase_id] = (n[r.clase_id] || 0) + 1;
    setHorarios(hor.data || []); setClases(cls); setAnotadosPorClase(n);
  }, [curso.id]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]); // se monta con key=curso.id

  const refrescar = () => { cargar(); onCambio?.(); };
  const optativas = useMemo(() => new Set(clases.filter((c) => c.optativa).map((c) => c.id)), [clases]);
  const usos = useMemo(() => { const u = {}; for (const h of horarios || []) if (h.clase_id) u[h.clase_id] = (u[h.clase_id] || 0) + 1; return u; }, [horarios]);

  if (horarios === null) return <div style={{ padding: 30, textAlign: "center", color: C.textMuted, fontSize: 13 }}>Cargando horario…</div>;
  const dias = diasVisibles(horarios, conSabado);

  const nuevo = (dia, hora) => setBloque({ inicial: { dias: dia ? [dia] : [], hora_inicio: hora || "08:00", hora_fin: deMin((aMin(hora || "08:00")) + DUR_DEFAULT), clase_id: "" }, alcance: [] });
  const editar = (h, alcance) => setBloque({ inicial: { dias: alcance.map((x) => normalizarDia(x.dia)), hora_inicio: hhmm(h.hora_inicio), hora_fin: hhmm(h.hora_fin), clase_id: h.clase_id || "" }, alcance });
  const abrirBloque = (h) => {
    const serie = serieDe(horarios, h);
    if (serie.length > 1) setAlcanceDe({ h, serie }); else editar(h, [h]);
  };
  const crearClaseDesdeBloque = puedeEditarClases ? (texto, alCrear) => setClaseEd({ texto, alCrear }) : null;

  return (
    <div>
      {/* Clases del curso */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ ...lbl, margin: 0, flex: 1 }}>Clases de {curso.nombre} · {clases.length}</div>
          {puedeEditarClases ? <button onClick={() => setClaseEd({})} style={btnSec}>+ Nueva clase</button> : null}
        </div>
        {!clases.length ? (
          <div style={{ fontSize: 13, color: C.textMuted }}>
            {puedeEditarClases ? "Todavía no hay clases. Creá las materias que se dan y quién las da (también Recreo y Almuerzo, sin maestra)." : "El colegio todavía no cargó las clases de este curso."}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {clases.map((c) => (
              <button key={c.id} type="button" onClick={puedeEditarClases ? () => setClaseEd({ clase: c }) : undefined} disabled={!puedeEditarClases}
                title={puedeEditarClases ? "Editar clase" : undefined}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, border: `1px ${c.optativa ? "dashed" : "solid"} ${c.optativa ? "#C4B5FD" : C.borderStrong}`, background: c.optativa ? "#F5F3FF" : C.surfaceSunken, cursor: puedeEditarClases ? "pointer" : "default", fontSize: 12.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.materias?.color || SLATE[400] }} />
                <b style={{ color: C.textStrong }}>{c.materias?.nombre}</b>
                <span style={{ color: c.maestros ? C.textMuted : C.textFaint }}>{c.maestros ? fmtNombre(c.maestros) : "sin maestra"}</span>
                {c.optativa ? <span style={{ fontSize: 10.5, fontWeight: 800, color: "#7C3AED" }}>✦ TALLER · {anotadosPorClase[c.id] || 0}</span> : null}
                <span style={{ fontSize: 11, color: usos[c.id] ? C.textFaint : "#B45309" }}>{usos[c.id] ? `${usos[c.id]} bl.` : "sin bloques"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Barra */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.textStrong, flex: "1 1 160px" }}>Horario semanal</div>
        {!dias.includes("Sábado") ? <button onClick={() => setConSabado(true)} style={btnSec}>+ Sábado</button> : null}
        {horarios.length ? <button onClick={() => setCopia("dia")} style={btnSec}>Copiar un día…</button> : null}
        {puedeEditarClases && cursos.length > 1 ? <button onClick={() => setCopia("curso")} style={btnSec}>Copiar de otro curso…</button> : null}
        <button onClick={() => nuevo(null, null)} disabled={!clases.length} title={clases.length ? "" : "Primero creá las clases del curso"} style={{ ...btnPri, opacity: clases.length ? 1 : 0.5 }}>+ Agregar al horario</button>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
        Tocá un espacio libre para agregar ahí, o un bloque para editarlo. Un bloque se puede guardar en varios días a la vez.{optativas.size ? " ✦ = taller optativo (solo lo ven las familias de los anotados)." : ""}
      </div>

      <Grilla horarios={horarios} dias={dias} optativas={optativas} onHueco={clases.length ? (d, h) => nuevo(d, h) : () => toast("Primero creá las clases del curso", "error")} onBloque={abrirBloque} />

      {/* Modales */}
      {alcanceDe ? (
        <Modal titulo={`${alcanceDe.h.materia} · ${hhmm(alcanceDe.h.hora_inicio)}–${hhmm(alcanceDe.h.hora_fin)}`} subtitulo={`Está los ${alcanceDe.serie.map((x) => DIA_CORTO[normalizarDia(x.dia)]).join(", ")} a la misma hora. ¿Qué querés editar?`} onClose={() => setAlcanceDe(null)} ancho={440}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => { const { h, serie } = alcanceDe; setAlcanceDe(null); editar(h, serie); }} style={{ ...btnPri, padding: 13 }}>Todos los días ({alcanceDe.serie.length})</button>
            <button onClick={() => { const { h } = alcanceDe; setAlcanceDe(null); editar(h, [h]); }} style={{ ...btnSec, padding: 12 }}>Solo el {normalizarDia(alcanceDe.h.dia).toLowerCase()}</button>
          </div>
        </Modal>
      ) : null}
      {bloque ? (
        <BloqueModal curso={curso} inicial={bloque.inicial} alcance={bloque.alcance} horarios={horarios} clases={clases} conSabado={dias.includes("Sábado")}
          onClose={() => setBloque(null)} onGuardado={() => { setBloque(null); refrescar(); }} onCrearClase={crearClaseDesdeBloque} showToast={toast} />
      ) : null}
      {claseEd ? (
        <ClaseModal curso={curso} colegioId={colegioId} clase={claseEd.clase} textoInicial={claseEd.texto || ""} maestros={maestros} usos={claseEd.clase ? usos[claseEd.clase.id] || 0 : 0} showToast={toast}
          onClose={() => setClaseEd(null)}
          onGuardada={async (r) => {
            const alCrear = claseEd.alCrear;
            setClaseEd(null);
            const cls = await cargarClasesCurso(curso.id);
            setClases(cls);
            if (r && alCrear) {
              const nueva = cls.find((c) => c.id === r.id);
              if (nueva) alCrear(nueva);
            }
            refrescar();
          }} />
      ) : null}
      {copia === "dia" ? <CopiarDiaModal horarios={horarios} dias={dias} onClose={() => setCopia(null)} onHecho={(m) => { setCopia(null); toast(m, "success"); refrescar(); }} /> : null}
      {copia === "curso" ? <CopiarCursoModal curso={curso} cursos={cursos} horarios={horarios} clases={clases} onClose={() => setCopia(null)} onHecho={(m) => { setCopia(null); toast(m, "success"); refrescar(); }} /> : null}
    </div>
  );
}

// ── Semana de una maestra (ficha del maestro) ───────────────────────────────

/** Todos sus bloques en los cursos dados (los del año vigente), por día. */
export function SemanaMaestra({ maestroId, cursos = [] }) {
  const [bloques, setBloques] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: cl } = await supabase.from("clases").select("id").eq("maestro_id", maestroId);
      const ids = (cl || []).map((c) => c.id);
      const { data } = ids.length
        ? await supabase.from("horarios").select("id,dia,hora_inicio,hora_fin,materia,color,curso_id").in("clase_id", ids)
        : { data: [] };
      if (vivo) setBloques(data || []);
    })();
    return () => { vivo = false; };
  }, [maestroId]);
  const nombre = Object.fromEntries(cursos.map((c) => [c.id, c.nombre]));
  if (bloques === null) return <div style={{ fontSize: 12.5, color: C.textFaint }}>Cargando su semana…</div>;
  const delAno = bloques.filter((h) => nombre[h.curso_id]);
  if (!delAno.length) return <div style={{ fontSize: 12.5, color: C.textMuted }}>Todavía no está en ningún horario de este año.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {DIAS_HORARIO.map((d) => {
        const bs = delAno.filter((h) => normalizarDia(h.dia) === d).sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio));
        if (!bs.length) return null;
        return (
          <div key={d} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 34, fontSize: 11, fontWeight: 800, color: SLATE[500], textTransform: "uppercase", paddingTop: 4 }}>{DIA_CORTO[d]}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
              {bs.map((h) => (
                <span key={h.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: (h.color || "#3B82F6") + "1A", fontSize: 12, color: C.text }}>
                  <span style={{ color: SLATE[600] }}>{hhmm(h.hora_inicio)}–{hhmm(h.hora_fin)}</span>
                  <b style={{ color: C.textStrong }}>{h.materia}</b>
                  <span style={{ color: C.textMuted }}>{nombre[h.curso_id]}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
