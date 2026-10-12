// Materias del colegio + clases por curso (specs/docentes-clases-y-grupos.md,
// Fase A; SQL en supabase/materias-y-clases.sql).
//
//   · MateriasAdmin: catálogo del colegio (crear, renombrar, color, ocultar,
//     unificar duplicados con el RPC fusionar_materias).
//   · ClasesCurso:   las clases de un curso (materia + maestra opcional), en
//     Horarios — el horario se arma eligiendo de estas clases.
//   · ClasesMaestroEditor: las clases de una maestra, dentro de su ficha
//     (reemplaza al texto libre "Materia" + "Cursos asignados").
//
// maestro_cursos y maestros.materia los mantiene la base (triggers): acá
// solo se escribe en `materias` y `clases`.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";
import { fmtNombre, sanitize } from "../../lib/helpers";
import { THEMES, SLATE } from "../../lib/tokens";
import { Spinner } from "../../components/Spinner";
import { PALETA_MATERIAS, useMaterias, etiquetaClase } from "./clasesDatos";

const C = THEMES.light;
const inp = { padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, outline: "none", fontFamily: "inherit", background: C.surfaceSunken, boxSizing: "border-box", color: C.text };
const btnPri = { padding: "9px 14px", borderRadius: 10, border: "none", background: C.accent, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const btnMini = { padding: "4px 9px", borderRadius: 7, border: `1px solid ${C.borderStrong}`, background: C.surface, cursor: "pointer", fontSize: 11.5, color: SLATE[600], fontWeight: 600 };
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();


function PuntoColor({ color, onChange, label }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <span style={{ position: "relative" }}>
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-label={label} title="Cambiar color"
        style={{ width: 22, height: 22, borderRadius: "50%", background: color, border: "2px solid white", boxShadow: `0 0 0 1px ${C.borderStrong}`, cursor: "pointer", padding: 0 }} />
      {abierto ? (
        <>
          <span style={{ position: "fixed", inset: 0, zIndex: 20 }} onClick={() => setAbierto(false)} />
          <span style={{ position: "absolute", top: 28, left: 0, zIndex: 21, background: C.surface, border: `1px solid ${C.borderStrong}`, borderRadius: 10, padding: 8, display: "grid", gridTemplateColumns: "repeat(5, 24px)", gap: 6, boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}>
            {PALETA_MATERIAS.map((c) => (
              <button key={c} type="button" onClick={() => { onChange(c); setAbierto(false); }} aria-label={`Color ${c}`}
                style={{ width: 24, height: 24, borderRadius: 6, background: c, border: c === color ? "2px solid #0F172A" : "none", cursor: "pointer" }} />
            ))}
          </span>
        </>
      ) : null}
    </span>
  );
}

// ── Catálogo de materias ─────────────────────────────────────────────────────

export function MateriasAdmin({ colegioId, showToast }) {
  const { materias, recargar } = useMaterias(colegioId);
  const [usos, setUsos] = useState({}); // materia_id → nº de clases
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState(null); // {id, nombre}
  const [unificar, setUnificar] = useState(null); // materia origen
  const [destino, setDestino] = useState("");
  const [verOcultas, setVerOcultas] = useState(false);
  const [q, setQ] = useState("");
  const toast = (m, t) => (showToast ? showToast(m, t) : window.alert(m));

  useEffect(() => {
    if (!materias?.length) return;
    supabase.from("clases").select("materia_id").in("materia_id", materias.map((m) => m.id)).then(({ data }) => {
      const n = {};
      for (const r of data || []) n[r.materia_id] = (n[r.materia_id] || 0) + 1;
      setUsos(n);
    });
  }, [materias]);

  const duplicada = (nombre, exceptoId) => (materias || []).some((m) => m.id !== exceptoId && sinAcentos(m.nombre) === sinAcentos(nombre));

  const crear = async () => {
    const nombre = sanitize(nueva).trim();
    if (!nombre) return;
    if (duplicada(nombre)) { toast("Esa materia ya existe", "error"); return; }
    const color = PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length];
    const { error } = await supabase.from("materias").insert({ colegio_id: colegioId, nombre, color, orden: (materias?.length || 0) + 1 });
    if (error) { toast(`No se pudo crear: ${error.message}`, "error"); return; }
    setNueva(""); recargar();
  };
  const actualizar = async (id, cambios) => {
    const { error } = await supabase.from("materias").update(cambios).eq("id", id);
    if (error) { toast(`No se pudo guardar: ${error.message}`, "error"); return false; }
    recargar(); return true;
  };
  const guardarNombre = async () => {
    const nombre = sanitize(editando.nombre).trim();
    if (!nombre) return;
    if (duplicada(nombre, editando.id)) { toast("Ya hay otra materia con ese nombre. Usá “Unificar” si son la misma.", "error"); return; }
    if (await actualizar(editando.id, { nombre })) setEditando(null);
  };
  const confirmarUnificar = async () => {
    const d = materias.find((m) => m.id === destino);
    if (!d || !window.confirm(`¿Unificar “${unificar.nombre}” en “${d.nombre}”? Sus clases y horarios pasan a “${d.nombre}” y “${unificar.nombre}” desaparece.`)) return;
    const { error } = await supabase.rpc("fusionar_materias", { p_origen: unificar.id, p_destino: d.id });
    if (error) { toast(`No se pudo unificar: ${error.message}`, "error"); return; }
    toast(`✓ “${unificar.nombre}” ahora es “${d.nombre}”`, "success");
    setUnificar(null); setDestino(""); recargar();
  };

  if (!colegioId) return <div style={{ color: C.textMuted, fontSize: 13 }}>Elegí un colegio primero.</div>;
  if (materias === null) return <Spinner />;

  const visibles = materias.filter((m) => (verOcultas || m.activo) && (!q || sinAcentos(m.nombre).includes(sinAcentos(q))));
  const ocultas = materias.filter((m) => !m.activo).length;

  return (
    <div style={{ maxWidth: 720 }}>
      {unificar ? (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setUnificar(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="unif-t" style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
            <div id="unif-t" style={{ fontSize: 17, fontWeight: 800, color: C.textStrong, marginBottom: 6 }}>Unificar “{unificar.nombre}”</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>Si son la misma materia con distinto nombre, elegí con cuál se queda. Sus clases y horarios pasan a esa.</div>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 14 }} aria-label="Materia destino">
              <option value="">Elegí la materia…</option>
              {materias.filter((m) => m.id !== unificar.id).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setUnificar(null)} style={{ ...btnMini, flex: 1, padding: 10, fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarUnificar} disabled={!destino} style={{ ...btnPri, flex: 1, opacity: destino ? 1 : 0.5 }}>Unificar</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        Las clases se asignan en 🕐 Horarios o en la ficha de cada maestro. Si hay dos nombres para lo mismo (“Gym” y “Educación Física”), usá <b style={{ color: C.text }}>Unificar</b>.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(); }} placeholder="Nueva materia (ej: Inglés)" aria-label="Nueva materia" style={{ ...inp, flex: "1 1 220px" }} />
        <button onClick={crear} disabled={!nueva.trim()} style={{ ...btnPri, opacity: nueva.trim() ? 1 : 0.5 }}>+ Agregar</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar materia" style={{ ...inp, flex: "1 1 180px" }} />
        {ocultas ? (
          <label style={{ fontSize: 12.5, color: C.textMuted, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={verOcultas} onChange={(e) => setVerOcultas(e.target.checked)} />
            <span style={{ color: C.textMuted }}>Ver ocultas ({ocultas})</span>
          </label>
        ) : null}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
        {!visibles.length ? <div style={{ padding: 20, textAlign: "center", color: C.textMuted, fontSize: 13 }}>No hay materias{q ? " con ese nombre" : ""}.</div> : null}
        {visibles.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? `1px solid ${C.border}` : "none", opacity: m.activo ? 1 : 0.55, flexWrap: "wrap" }}>
            <PuntoColor color={m.color} label={`Color de ${m.nombre}`} onChange={(c) => actualizar(m.id, { color: c })} />
            {editando?.id === m.id ? (
              <>
                <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") guardarNombre(); if (e.key === "Escape") setEditando(null); }} aria-label="Nombre de la materia" style={{ ...inp, flex: "1 1 160px", padding: "6px 10px" }} />
                <button onClick={guardarNombre} style={btnMini}>Guardar</button>
                <button onClick={() => setEditando(null)} style={btnMini}>Cancelar</button>
              </>
            ) : (
              <>
                <span style={{ flex: "1 1 160px", fontSize: 14, fontWeight: 700, color: C.textStrong }}>{m.nombre}{m.activo ? "" : " (oculta)"}</span>
                <span style={{ fontSize: 12, color: C.textFaint, minWidth: 64 }}>{usos[m.id] ? `${usos[m.id]} ${usos[m.id] === 1 ? "clase" : "clases"}` : "sin clases"}</span>
                <button onClick={() => setEditando({ id: m.id, nombre: m.nombre })} style={btnMini}>✏️ Renombrar</button>
                <button onClick={() => { setUnificar(m); setDestino(""); }} style={btnMini}>Unificar…</button>
                <button onClick={() => actualizar(m.id, { activo: !m.activo })} style={btnMini}>{m.activo ? "Ocultar" : "Mostrar"}</button>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>“Ocultar” la saca de las listas para elegir, sin tocar las clases que ya la usan.</div>
    </div>
  );
}

// ── Clases de un curso ──────────────────────────────────────────────────────



export function ClasesCurso({ curso, colegioId, clases, maestros = [], onCambio, showToast }) {
  const { materias } = useMaterias(colegioId);
  const [materiaId, setMateriaId] = useState("");
  const [maestroId, setMaestroId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const toast = (m, t) => (showToast ? showToast(m, t) : window.alert(m));

  const agregar = async () => {
    if (!materiaId) return;
    setGuardando(true);
    const { error } = await supabase.from("clases").insert({ curso_id: curso.id, materia_id: materiaId, maestro_id: maestroId || null });
    setGuardando(false);
    if (error) { toast(error.code === "23505" ? "Esa clase ya existe en el curso" : `No se pudo agregar: ${error.message}`, "error"); return; }
    setMateriaId(""); setMaestroId(""); onCambio?.();
  };
  const cambiarMaestra = async (clase, nuevo) => {
    const { error } = await supabase.from("clases").update({ maestro_id: nuevo || null }).eq("id", clase.id);
    if (error) { toast(error.code === "23505" ? "Esa maestra ya tiene esa clase en el curso" : "No se pudo cambiar la maestra", "error"); return; }
    onCambio?.();
  };
  const quitar = async (clase, enUso) => {
    const msg = enUso
      ? `“${etiquetaClase(clase)}” tiene ${enUso} ${enUso === 1 ? "bloque" : "bloques"} en el horario: van a quedar sin clase (se siguen viendo con su texto). ¿Quitarla?`
      : `¿Quitar “${etiquetaClase(clase)}” de ${curso.nombre}?`;
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from("clases").delete().eq("id", clase.id);
    if (error) { toast("No se pudo quitar la clase", "error"); return; }
    onCambio?.();
  };

  const activas = (materias || []).filter((m) => m.activo);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Clases de {curso.nombre}</div>
      {!clases.length ? <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>Este curso todavía no tiene clases. Agregá las materias que se dan y quién las da.</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {clases.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.materias?.color || SLATE[400], flexShrink: 0 }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.textStrong, minWidth: 130 }}>{c.materias?.nombre}</span>
            <select value={c.maestro_id || ""} onChange={(e) => cambiarMaestra(c, e.target.value)} aria-label={`Maestra de ${c.materias?.nombre}`} style={{ ...inp, padding: "6px 10px", flex: "1 1 180px", maxWidth: 280 }}>
              <option value="">Sin maestra</option>
              {maestros.map((m) => <option key={m.id} value={m.id}>{fmtNombre(m)}</option>)}
            </select>
            <button onClick={() => quitar(c, c._usos || 0)} style={{ ...btnMini, color: C.danger, border: "none", background: "transparent" }} aria-label={`Quitar ${c.materias?.nombre}`}>🗑</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} aria-label="Materia" style={{ ...inp, flex: "1 1 160px" }}>
          <option value="">Materia…</option>
          {activas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <select value={maestroId} onChange={(e) => setMaestroId(e.target.value)} aria-label="Maestra" style={{ ...inp, flex: "1 1 180px" }}>
          <option value="">Sin maestra (ej: Recreo)</option>
          {maestros.map((m) => <option key={m.id} value={m.id}>{fmtNombre(m)}</option>)}
        </select>
        <button onClick={agregar} disabled={!materiaId || guardando} style={{ ...btnPri, opacity: materiaId ? 1 : 0.5 }}>+ Agregar clase</button>
      </div>
      {materias && !activas.length ? <div style={{ fontSize: 12, color: C.warning, marginTop: 8 }}>Primero cargá las materias del colegio en 📚 Materias.</div> : null}
    </div>
  );
}

// ── Clases de una maestra (ficha del maestro) ───────────────────────────────

/**
 * Editor "en borrador": value = [{ id?, curso_id, materia_id }]. Se guarda con
 * guardarClasesMaestro() al confirmar la ficha.
 */
export function ClasesMaestroEditor({ colegioId, cursos, value, onChange }) {
  const { materias } = useMaterias(colegioId);
  const [cursoId, setCursoId] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const nombreMateria = useMemo(() => Object.fromEntries((materias || []).map((m) => [m.id, m])), [materias]);
  const nombreCurso = useMemo(() => Object.fromEntries((cursos || []).map((c) => [c.id, c.nombre])), [cursos]);
  const agregar = () => {
    if (!cursoId || !materiaId) return;
    if (value.some((v) => v.curso_id === cursoId && v.materia_id === materiaId)) return;
    onChange([...value, { curso_id: cursoId, materia_id: materiaId }]);
    setMateriaId("");
  };
  const activas = (materias || []).filter((m) => m.activo);
  return (
    <div>
      {!value.length ? <div style={{ fontSize: 12.5, color: C.textMuted, marginBottom: 8 }}>Sin clases asignadas.</div> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {value.map((v) => (
          <span key={`${v.curso_id}-${v.materia_id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 10px", borderRadius: 999, background: C.surface2, fontSize: 12.5, color: C.text }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: nombreMateria[v.materia_id]?.color || SLATE[400] }} />
            <span style={{ color: C.text }}>{nombreMateria[v.materia_id]?.nombre || "…"} · {nombreCurso[v.curso_id] || "otro año"}</span>
            <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Quitar clase" style={{ border: "none", background: "transparent", cursor: "pointer", color: SLATE[500], fontSize: 12, padding: "0 4px" }}>✕</button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} aria-label="Curso" style={{ ...inp, flex: "1 1 130px" }}>
          <option value="">Curso…</option>
          {(cursos || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} aria-label="Materia" style={{ ...inp, flex: "1 1 130px" }}>
          <option value="">Materia…</option>
          {activas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <button type="button" onClick={agregar} disabled={!cursoId || !materiaId} style={{ ...btnPri, padding: "8px 12px", opacity: cursoId && materiaId ? 1 : 0.5 }}>Agregar</button>
      </div>
    </div>
  );
}


