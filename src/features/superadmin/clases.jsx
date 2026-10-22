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
import { NIVELES, nombreNivel, materiaDelNivel, puedeEditarMateria } from "../../lib/niveles";
import { THEMES, SLATE } from "../../lib/tokens";
import { Spinner } from "../../components/Spinner";
import { PALETA_MATERIAS, useMaterias, etiquetaClase } from "./clasesDatos";
import { useConfirmar } from "../../hooks/useConfirmar";
import { Icono } from "../../components/Icono";

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

// niveles: los del colegio (con más de uno, cada materia lleva nivel o "Todos").
// nivelesPropios: los de la Secretaría/Dirección por nivel (edita solo esas); null = administrador.
export function MateriasAdmin({ colegioId, anoActual = null, showToast, niveles = [], nivelesPropios = null }) {
  const { materias, recargar } = useMaterias(colegioId);
  const conNiveles = (niveles || []).length > 1;
  const nivelesElegibles = NIVELES.filter((n) => (niveles || []).includes(n.k) && (!nivelesPropios || nivelesPropios.includes(n.k)));
  const [nivelNueva, setNivelNueva] = useState(nivelesPropios?.[0] || "");
  const [filtroNivel, setFiltroNivel] = useState("");
  const puede = (m) => puedeEditarMateria(m, nivelesPropios);
  const [usos, setUsos] = useState({}); // materia_id → nº de clases
  const [clasesDe, setClasesDe] = useState({}); // materia_id → [{id, cursos, maestros}]
  const [abierta, setAbierta] = useState(null); // materia con la lista de clases desplegada
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState(null); // {id, nombre}
  const [unificar, setUnificar] = useState(null); // materia origen
  const [destino, setDestino] = useState("");
  const [unificando, setUnificando] = useState(false);
  const [errorUnificar, setErrorUnificar] = useState("");
  const [verOcultas, setVerOcultas] = useState(false);
  const [q, setQ] = useState("");
  const [confirmar, confirmUI] = useConfirmar();
  const toast = (m, t) => (showToast ? showToast(m, t) : window.alert(m));

  useEffect(() => {
    if (!materias?.length) return;
    cargarClases();
  }, [materias]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las clases de cada materia con su curso y maestra, para poder ver
  // quién la da (antes solo se mostraba "2 clases").
  async function cargarClases() {
    if (!materias?.length) return;
    const { data } = await supabase.from("clases")
      .select("id,materia_id,maestro_id,cursos(nombre,año_lectivo),maestros(nombre,apellido)")
      .in("materia_id", materias.map((m) => m.id));
    const n = {}, de = {};
    for (const r of data || []) {
      n[r.materia_id] = (n[r.materia_id] || 0) + 1;
      (de[r.materia_id] ||= []).push(r);
    }
    for (const k in de) de[k].sort((a, b) => (b.cursos?.año_lectivo || 0) - (a.cursos?.año_lectivo || 0) || (a.cursos?.nombre || "").localeCompare(b.cursos?.nombre || "", "es"));
    setUsos(n); setClasesDe(de);
  }
  const quitarClase = async (m, c) => {
    const quien = c.maestros ? fmtNombre(c.maestros) : "sin maestra";
    const ok = await confirmar({
      titulo: `¿Quitar ${m.nombre} de ${c.cursos?.nombre || "este curso"}?`,
      detalle: `Se borra la clase (${quien}). Los bloques de horario que la usaban se siguen viendo con su texto, pero sin clase.`,
      textoConfirmar: "Quitar clase",
    });
    if (!ok) return;
    const { error } = await supabase.from("clases").delete().eq("id", c.id);
    if (error) { toast(`No se pudo quitar: ${error.message}`, "error"); return; }
    cargarClases();
  };

  const duplicada = (nombre, exceptoId, nivel) => (materias || []).some((m) => m.id !== exceptoId && (m.nivel || "") === (nivel || "") && sinAcentos(m.nombre) === sinAcentos(nombre));

  const crear = async () => {
    const nombre = sanitize(nueva).trim();
    if (!nombre) return;
    const nivel = conNiveles ? (nivelNueva || null) : null;
    if (duplicada(nombre, null, nivel)) { toast("Esa materia ya existe en ese nivel", "error"); return; }
    const color = PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length];
    const { error } = await supabase.from("materias").insert({ colegio_id: colegioId, nombre, color, orden: (materias?.length || 0) + 1, nivel });
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
    if (duplicada(nombre, editando.id, (materias || []).find((m) => m.id === editando.id)?.nivel)) { toast("Ya hay otra materia con ese nombre. Usá “Unificar” si son la misma.", "error"); return; }
    if (await actualizar(editando.id, { nombre })) setEditando(null);
  };
  // El modal de Unificar ya es la confirmación (explica qué pasa antes del
  // botón). Antes pedía además window.confirm, que en algunos navegadores
  // embebidos devuelve false sin mostrarse: "Unificar no hacía nada".
  const confirmarUnificar = async () => {
    const d = materias.find((m) => m.id === destino);
    if (!d) return;
    setUnificando(true); setErrorUnificar("");
    const { error } = await supabase.rpc("fusionar_materias", { p_origen: unificar.id, p_destino: d.id });
    setUnificando(false);
    if (error) { setErrorUnificar(`No se pudo unificar: ${error.message}`); return; }
    toast(`✓ “${unificar.nombre}” ahora es “${d.nombre}”`, "success");
    setUnificar(null); setDestino(""); recargar();
  };
  const eliminar = async (m) => {
    const n = usos[m.id] || 0;
    const ok = await confirmar({
      titulo: `¿Eliminar “${m.nombre}”?`,
      detalle: n
        ? `Se quitan sus ${n} ${n === 1 ? "clase" : "clases"} de los cursos. Los bloques de horario que la usaban se siguen viendo con su texto, pero sin clase. Si es la misma que otra materia, usá “Unificar” en vez de eliminar.`
        : "No la usa ningún curso.",
      textoConfirmar: "Eliminar materia",
    });
    if (!ok) return;
    const { error } = await supabase.from("materias").delete().eq("id", m.id);
    if (error) { toast(`No se pudo eliminar: ${error.message}`, "error"); return; }
    toast(`Materia “${m.nombre}” eliminada`, "success");
    recargar();
  };

  if (!colegioId) return <div style={{ color: C.textMuted, fontSize: 13 }}>Elegí un colegio primero.</div>;
  if (materias === null) return <Spinner />;

  const visibles = materias.filter((m) => (verOcultas || m.activo) && (!q || sinAcentos(m.nombre).includes(sinAcentos(q)))
    && (!filtroNivel || (filtroNivel === "todos" ? !m.nivel : m.nivel === filtroNivel)));
  const ocultas = materias.filter((m) => !m.activo).length;
  const dest = materias.find((m) => m.id === destino);

  return (
    <div style={{ maxWidth: 720 }}>
      {confirmUI}
      {unificar ? (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !unificando && setUnificar(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="unif-t" style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
            <div id="unif-t" style={{ fontSize: 17, fontWeight: 800, color: C.textStrong, marginBottom: 6 }}>Unificar “{unificar.nombre}”</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>Si son la misma materia con distinto nombre, elegí con cuál se queda.</div>
            <select value={destino} onChange={(e) => { setDestino(e.target.value); setErrorUnificar(""); }} style={{ ...inp, width: "100%", marginBottom: 12 }} aria-label="Materia con la que se queda">
              <option value="">Se queda como…</option>
              {materias.filter((m) => m.id !== unificar.id && puede(m)).map((m) => <option key={m.id} value={m.id}>{m.nombre}{conNiveles ? ` · ${m.nivel ? nombreNivel(m.nivel) : "Todos los niveles"}` : ""}</option>)}
            </select>
            {dest ? (
              <div style={{ fontSize: 12.5, color: C.text, background: C.warningSoft, border: `1px solid ${C.warningBorder}`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, lineHeight: 1.45 }}>
                {usos[unificar.id] ? `Sus ${usos[unificar.id]} ${usos[unificar.id] === 1 ? "clase pasa" : "clases pasan"}` : "Sus clases pasan"} a “{dest.nombre}”, igual que sus horarios, y “{unificar.nombre}” desaparece. No se puede deshacer.
              </div>
            ) : null}
            {errorUnificar ? <div role="alert" style={{ fontSize: 12.5, color: C.danger, marginBottom: 10 }}>{errorUnificar}</div> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setUnificar(null)} disabled={unificando} style={{ ...btnMini, flex: 1, padding: 10, fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarUnificar} disabled={!destino || unificando} style={{ ...btnPri, flex: 1, opacity: destino && !unificando ? 1 : 0.5 }}>{unificando ? "Unificando…" : "Unificar"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
        Las clases se asignan en Horarios o en la ficha de cada maestro. Si hay dos nombres para lo mismo (“Gym” y “Educación Física”), usá <b style={{ color: C.text }}>Unificar</b>.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") crear(); }} placeholder="Nueva materia (ej: Inglés)" aria-label="Nueva materia" style={{ ...inp, flex: "1 1 220px" }} />
        {conNiveles ? (
          <select value={nivelNueva} onChange={(e) => setNivelNueva(e.target.value)} aria-label="Nivel de la materia nueva" style={{ ...inp, flex: "0 1 180px" }}>
            {!nivelesPropios ? <option value="">Todos los niveles</option> : null}
            {nivelesElegibles.map((n) => <option key={n.k} value={n.k}>{n.l}</option>)}
          </select>
        ) : null}
        <button onClick={crear} disabled={!nueva.trim()} style={{ ...btnPri, opacity: nueva.trim() ? 1 : 0.5 }}>+ Agregar</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" aria-label="Buscar materia" style={{ ...inp, flex: "1 1 180px" }} />
        {conNiveles ? (
          <select value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)} aria-label="Ver materias de" style={{ ...inp, flex: "0 1 180px" }}>
            <option value="">Todas</option>
            <option value="todos">De todos los niveles</option>
            {NIVELES.filter((n) => (niveles || []).includes(n.k)).map((n) => <option key={n.k} value={n.k}>{n.l}</option>)}
          </select>
        ) : null}
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
            {puede(m) ? <PuntoColor color={m.color} label={`Color de ${m.nombre}`} onChange={(c) => actualizar(m.id, { color: c })} /> : <span style={{ width: 14, height: 14, borderRadius: "50%", background: m.color || SLATE[400], margin: "0 4px", flexShrink: 0 }} />}
            {editando?.id === m.id ? (
              <>
                <input autoFocus value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") guardarNombre(); if (e.key === "Escape") setEditando(null); }} aria-label="Nombre de la materia" style={{ ...inp, flex: "1 1 160px", padding: "6px 10px" }} />
                <button onClick={guardarNombre} style={btnMini}>Guardar</button>
                <button onClick={() => setEditando(null)} style={btnMini}>Cancelar</button>
              </>
            ) : (
              <>
                <span style={{ flex: "1 1 160px", display: "block", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.textStrong }}>{m.nombre}{m.activo ? "" : " (oculta)"}</span>
                  {conNiveles ? <span style={{ display: "block", fontSize: 12, color: C.textMuted }}>{m.nivel ? nombreNivel(m.nivel) : "Todos los niveles"}{puede(m) ? "" : " · solo lectura"}</span> : null}
                </span>
                {usos[m.id] ? (
                  <button onClick={() => setAbierta(abierta === m.id ? null : m.id)} aria-expanded={abierta === m.id} title="Ver en qué cursos y quién la da"
                    style={{ ...btnMini, minWidth: 64, color: C.accent, borderColor: abierta === m.id ? C.accent : C.borderStrong }}>
                    {usos[m.id]} {usos[m.id] === 1 ? "clase" : "clases"} {abierta === m.id ? "▴" : "▾"}
                  </button>
                ) : <span style={{ fontSize: 12, color: C.textFaint, minWidth: 64 }}>sin clases</span>}
                {puede(m) && conNiveles ? (
                  <select value={m.nivel || ""} onChange={(e) => actualizar(m.id, { nivel: e.target.value || null })} aria-label={`Nivel de ${m.nombre}`} style={{ ...inp, padding: "5px 8px", fontSize: 12.5 }}>
                    {!nivelesPropios ? <option value="">Todos los niveles</option> : null}
                    {nivelesElegibles.map((n) => <option key={n.k} value={n.k}>{n.l}</option>)}
                  </select>
                ) : null}
                {puede(m) ? <>
                <button onClick={() => setEditando({ id: m.id, nombre: m.nombre })} style={btnMini}>Renombrar</button>
                <button onClick={() => { setUnificar(m); setDestino(""); setErrorUnificar(""); }} style={btnMini}>Unificar…</button>
                <button onClick={() => actualizar(m.id, { activo: !m.activo })} style={btnMini}>{m.activo ? "Ocultar" : "Mostrar"}</button>
                <button onClick={() => eliminar(m)} style={{ ...btnMini, color: C.danger }} aria-label={`Eliminar ${m.nombre}`} title="Eliminar"><Icono nombre="papelera" size={15} color={C.danger}/></button>
                </> : null}
              </>
            )}
            {abierta === m.id && clasesDe[m.id]?.length ? (
              <div style={{ flexBasis: "100%", margin: "4px 0 2px 32px", display: "flex", flexDirection: "column", gap: 4 }}>
                {clasesDe[m.id].map((c) => {
                  const otroAno = anoActual && c.cursos?.año_lectivo && c.cursos.año_lectivo !== anoActual;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "6px 10px", borderRadius: 8, background: C.surfaceSunken }}>
                      <span style={{ flex: "1 1 auto", color: C.text }}>
                        <b style={{ color: C.textStrong }}>{c.cursos?.nombre || "Curso eliminado"}</b>
                        <span style={{ color: C.textMuted }}> · {c.cursos?.año_lectivo || "—"}</span>
                        {otroAno ? <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: C.warningSoft, color: "#B45309" }}>otro año</span> : null}
                        <span style={{ color: C.textMuted }}> — </span>
                        <span style={{ color: c.maestros ? C.text : C.textFaint }}>{c.maestros ? fmtNombre(c.maestros) : "Sin maestra"}</span>
                      </span>
                      <button onClick={() => quitarClase(m, c)} style={{ ...btnMini, color: C.danger, border: "none", background: "transparent" }} aria-label={`Quitar ${m.nombre} de ${c.cursos?.nombre || "este curso"}`} title="Quitar esta clase"><Icono nombre="papelera" size={15} color={C.danger}/></button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: C.textFaint, marginTop: 8 }}>“Ocultar” la saca de las listas para elegir, sin tocar las clases que ya la usan. La papelera la elimina junto con sus clases.</div>
    </div>
  );
}

// ── Clases de un curso ──────────────────────────────────────────────────────



export function ClasesCurso({ curso, colegioId, clases, maestros = [], onCambio, showToast }) {
  const { materias } = useMaterias(colegioId);
  const [materiaId, setMateriaId] = useState("");
  const [maestroId, setMaestroId] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, confirmUI] = useConfirmar();
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
  // "Renombrar" una clase = cambiarle la materia (los horarios de la clase
  // pasan a mostrar la materia nueva; lo actualiza la base).
  const cambiarMateria = async (clase, nueva) => {
    if (!nueva || nueva === clase.materia_id) return;
    const { error } = await supabase.from("clases").update({ materia_id: nueva }).eq("id", clase.id);
    if (error) { toast(error.code === "23505" ? "Ese curso ya tiene esa materia con esa maestra" : `No se pudo cambiar: ${error.message}`, "error"); return; }
    onCambio?.();
  };
  const quitar = async (clase, enUso) => {
    const ok = await confirmar({
      titulo: `¿Quitar “${etiquetaClase(clase)}” de ${curso.nombre}?`,
      detalle: enUso
        ? `Tiene ${enUso} ${enUso === 1 ? "bloque" : "bloques"} en el horario: se siguen viendo con su texto, pero quedan sin clase.`
        : "No está en el horario.",
      textoConfirmar: "Quitar clase",
    });
    if (!ok) return;
    const { error } = await supabase.from("clases").delete().eq("id", clase.id);
    if (error) { toast("No se pudo quitar la clase", "error"); return; }
    onCambio?.();
  };

  const activas = (materias || []).filter((m) => m.activo && materiaDelNivel(m, curso.nivel));
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      {confirmUI}
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.textMuted, marginBottom: 8 }}>Clases de {curso.nombre}</div>
      {!clases.length ? <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 10 }}>Este curso todavía no tiene clases. Agregá las materias que se dan y quién las da.</div> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {clases.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.materias?.color || SLATE[400], flexShrink: 0 }} />
            <select value={c.materia_id} onChange={(e) => cambiarMateria(c, e.target.value)} aria-label={`Materia de la clase ${c.materias?.nombre}`} title="Cambiar la materia de esta clase"
              style={{ ...inp, padding: "6px 10px", flex: "1 1 150px", maxWidth: 220, fontWeight: 700, color: C.textStrong }}>
              {(materias || []).filter((m) => (m.activo && materiaDelNivel(m, curso.nivel)) || m.id === c.materia_id).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              {!(materias || []).some((m) => m.id === c.materia_id) ? <option value={c.materia_id}>{c.materias?.nombre}</option> : null}
            </select>
            <select value={c.maestro_id || ""} onChange={(e) => cambiarMaestra(c, e.target.value)} aria-label={`Maestra de ${c.materias?.nombre}`} style={{ ...inp, padding: "6px 10px", flex: "1 1 180px", maxWidth: 280 }}>
              <option value="">Sin maestra</option>
              {maestros.map((m) => <option key={m.id} value={m.id}>{fmtNombre(m)}</option>)}
            </select>
            <button onClick={() => quitar(c, c._usos || 0)} style={{ ...btnMini, color: C.danger, border: "none", background: "transparent" }} aria-label={`Quitar ${c.materias?.nombre}`}><Icono nombre="papelera" size={15} color={C.danger}/></button>
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
  const nivelCurso = (cursos || []).find((c) => c.id === cursoId)?.nivel || null;
  const activas = (materias || []).filter((m) => m.activo && materiaDelNivel(m, nivelCurso));
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


