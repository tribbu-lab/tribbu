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
import { Buscador } from "../../components/Buscador";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";

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
// Lista sobria (2026-10-22): nombre + "nivel · N clases" en gris y un solo
// "Editar" por fila; todo lo demás (nombre, nivel, color, clases, unificar,
// ocultar, eliminar) va adentro de Editar.
export function MateriasAdmin({ colegioId, anoActual = null, showToast, niveles = [], nivelesPropios = null }) {
  const { materias, recargar } = useMaterias(colegioId);
  const conNiveles = (niveles || []).length > 1;
  const nivelesElegibles = NIVELES.filter((n) => (niveles || []).includes(n.k) && (!nivelesPropios || nivelesPropios.includes(n.k)));
  const puede = (m) => puedeEditarMateria(m, nivelesPropios);
  const [usos, setUsos] = useState({}); // materia_id → nº de clases
  const [clasesDe, setClasesDe] = useState({}); // materia_id → [{id, cursos, maestros}]
  const [editor, setEditor] = useState(null); // { id|null, nombre, nivel, color, activo }
  const [guardando, setGuardando] = useState(false);
  const [unificar, setUnificar] = useState(null); // materia origen
  const [destino, setDestino] = useState("");
  const [unificando, setUnificando] = useState(false);
  const [errorUnificar, setErrorUnificar] = useState("");
  const [verOcultas, setVerOcultas] = useState(false);
  const [q, setQ] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("");
  const [confirmar, confirmUI] = useConfirmar();
  const toast = (m, t) => (showToast ? showToast(m, t) : window.alert(m));

  useEffect(() => {
    if (!materias?.length) return;
    cargarClases();
  }, [materias]); // eslint-disable-line react-hooks/exhaustive-deps

  // Las clases de cada materia con su curso y maestra (se ven adentro de Editar).
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
  const abrirNueva = () => setEditor({ id: null, nombre: "", nivel: nivelesPropios?.[0] || null, color: PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length], activo: true });
  const abrir = (m) => setEditor({ id: m.id, nombre: m.nombre, nivel: m.nivel || null, color: m.color, activo: m.activo });

  const guardarEditor = async () => {
    const nombre = sanitize(editor.nombre).trim();
    if (!nombre) return;
    const nivel = conNiveles ? editor.nivel || null : null;
    if (duplicada(nombre, editor.id, nivel)) { toast(editor.id ? "Ya hay otra materia con ese nombre en ese nivel. Usá “Unificar” si son la misma." : "Esa materia ya existe en ese nivel", "error"); return; }
    setGuardando(true);
    const datos = { nombre, nivel, color: editor.color };
    const { error } = editor.id
      ? await supabase.from("materias").update(datos).eq("id", editor.id)
      : await supabase.from("materias").insert({ ...datos, colegio_id: colegioId, orden: (materias?.length || 0) + 1 });
    setGuardando(false);
    if (error) { toast(`No se pudo guardar: ${error.message}`, "error"); return; }
    setEditor(null); recargar();
  };
  const cambiarVisible = async (m) => {
    const { error } = await supabase.from("materias").update({ activo: !m.activo }).eq("id", m.id);
    if (error) { toast(`No se pudo guardar: ${error.message}`, "error"); return; }
    setEditor(null); recargar();
  };
  // El modal de Unificar ya es la confirmación (explica qué pasa antes del botón).
  const confirmarUnificar = async () => {
    const d = materias.find((m) => m.id === destino);
    if (!d) return;
    setUnificando(true); setErrorUnificar("");
    const { error } = await supabase.rpc("fusionar_materias", { p_origen: unificar.id, p_destino: d.id });
    setUnificando(false);
    if (error) { setErrorUnificar(`No se pudo unificar: ${error.message}`); return; }
    toast(`“${unificar.nombre}” ahora es “${d.nombre}”`, "success");
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
    setEditor(null); recargar();
  };

  if (!colegioId) return <div style={{ color: C.textMuted, fontSize: 13 }}>Elegí un colegio primero.</div>;
  if (materias === null) return <Spinner />;

  const visibles = materias.filter((m) => (verOcultas || m.activo) && (!q || sinAcentos(m.nombre).includes(sinAcentos(q)))
    && (!filtroNivel || (filtroNivel === "todos" ? !m.nivel : m.nivel === filtroNivel)));
  const ocultas = materias.filter((m) => !m.activo).length;
  const dest = materias.find((m) => m.id === destino);
  const actual = editor?.id ? materias.find((m) => m.id === editor.id) : null;
  const textoNivel = (m) => (m.nivel ? nombreNivel(m.nivel) : "Todos los niveles");
  const lblEd = { fontSize: 12.5, fontWeight: 600, color: C.textMuted, margin: "14px 0 6px" };
  const btnSecEd = { padding: "9px 14px", borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.surface, cursor: "pointer", fontSize: 13, fontWeight: 700, color: SLATE[700], fontFamily: "inherit" };

  return (
    <div style={{ maxWidth: 720 }}>
      {confirmUI}

      {/* Editar / nueva materia */}
      {editor ? (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !guardando && setEditor(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editor.id ? "Editar materia" : "Nueva materia"} style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.textStrong }}>{editor.id ? "Editar materia" : "Nueva materia"}</div>
            <div style={lblEd}>Nombre</div>
            <input autoFocus value={editor.nombre} onChange={(e) => setEditor({ ...editor, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") guardarEditor(); }}
              placeholder="Ej: Inglés" aria-label="Nombre de la materia" style={{ ...inp, width: "100%" }} />
            {conNiveles ? (
              <>
                <div style={lblEd}>Nivel</div>
                <select value={editor.nivel || ""} onChange={(e) => setEditor({ ...editor, nivel: e.target.value || null })} aria-label="Nivel" style={{ ...inp, width: "100%" }}>
                  {!nivelesPropios ? <option value="">Todos los niveles</option> : null}
                  {nivelesElegibles.map((n) => <option key={n.k} value={n.k}>{n.l}</option>)}
                </select>
              </>
            ) : null}
            <div style={lblEd}>Color en el horario</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PALETA_MATERIAS.map((c) => (
                <button key={c} type="button" onClick={() => setEditor({ ...editor, color: c })} aria-label={`Color ${c}`}
                  style={{ width: 24, height: 24, borderRadius: "50%", background: c, border: "2px solid white", boxShadow: `0 0 0 ${editor.color === c ? 2 : 1}px ${editor.color === c ? C.textStrong : C.borderStrong}`, cursor: "pointer", padding: 0 }} />
              ))}
            </div>

            {actual ? (
              <>
                <div style={lblEd}>Dónde se da ({clasesDe[actual.id]?.length || 0})</div>
                {!clasesDe[actual.id]?.length ? <div style={{ fontSize: 13, color: C.textMuted }}>Ningún curso la tiene todavía.</div> : (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
                    {clasesDe[actual.id].map((c, i) => {
                      const otroAno = anoActual && c.cursos?.año_lectivo && c.cursos.año_lectivo !== anoActual;
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: i ? `1px solid ${C.border}` : "none", fontSize: 13 }}>
                          <span style={{ flex: 1, minWidth: 0, color: C.text }}>
                            <b style={{ color: C.textStrong }}>{c.cursos?.nombre || "Curso eliminado"}</b>
                            <span style={{ color: C.textMuted }}>{otroAno ? ` · ${c.cursos.año_lectivo}` : ""} · {c.maestros ? fmtNombre(c.maestros) : "sin maestra"}</span>
                          </span>
                          <button type="button" onClick={() => quitarClase(actual, c)} aria-label={`Quitar ${actual.nombre} de ${c.cursos?.nombre || "este curso"}`} title="Quitar esta clase"
                            style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}><Icono nombre="papelera" size={15} color={C.danger} /></button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 14 }}>
                  <button type="button" onClick={() => { setUnificar(actual); setDestino(""); setErrorUnificar(""); setEditor(null); }} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>Unificar con otra…</button>
                  <button type="button" onClick={() => cambiarVisible(actual)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>{actual.activo ? "Ocultar de las listas" : "Volver a mostrar"}</button>
                  <button type="button" onClick={() => eliminar(actual)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.danger, fontFamily: "inherit" }}>Eliminar</button>
                </div>
              </>
            ) : null}

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button type="button" onClick={() => setEditor(null)} disabled={guardando} style={{ ...btnSecEd, flex: 1 }}>Cancelar</button>
              <button type="button" onClick={guardarEditor} disabled={guardando || !editor.nombre.trim()} style={{ ...btnPri, flex: 2, opacity: guardando || !editor.nombre.trim() ? 0.5 : 1 }}>{guardando ? "Guardando…" : editor.id ? "Guardar" : "Crear materia"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Unificar */}
      {unificar ? (
        <div style={{ position: "fixed", inset: 0, background: C.overlay, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => !unificando && setUnificar(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="unif-t" style={{ background: C.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 }}>
            <div id="unif-t" style={{ fontSize: 18, fontWeight: 800, color: C.textStrong, marginBottom: 6 }}>Unificar “{unificar.nombre}”</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>Si son la misma materia con distinto nombre, elegí con cuál se queda.</div>
            <select value={destino} onChange={(e) => { setDestino(e.target.value); setErrorUnificar(""); }} style={{ ...inp, width: "100%", marginBottom: 12 }} aria-label="Materia con la que se queda">
              <option value="">Se queda como…</option>
              {materias.filter((m) => m.id !== unificar.id && puede(m)).map((m) => <option key={m.id} value={m.id}>{m.nombre}{conNiveles ? ` · ${textoNivel(m)}` : ""}</option>)}
            </select>
            {dest ? (
              <div style={{ fontSize: 13, color: C.text, marginBottom: 12, lineHeight: 1.45 }}>
                {usos[unificar.id] ? `Sus ${usos[unificar.id]} ${usos[unificar.id] === 1 ? "clase pasa" : "clases pasan"}` : "Sus clases pasan"} a “{dest.nombre}”, igual que sus horarios, y “{unificar.nombre}” desaparece. No se puede deshacer.
              </div>
            ) : null}
            {errorUnificar ? <div role="alert" style={{ fontSize: 13, color: C.danger, marginBottom: 10 }}>{errorUnificar}</div> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setUnificar(null)} disabled={unificando} style={{ ...btnSecEd, flex: 1 }}>Cancelar</button>
              <button onClick={confirmarUnificar} disabled={!destino || unificando} style={{ ...btnPri, flex: 1, opacity: destino && !unificando ? 1 : 0.5 }}>{unificando ? "Unificando…" : "Unificar"}</button>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Buscador value={q} onChange={setQ} placeholder="Buscar materia…" style={{ flex: "1 1 200px", minWidth: 0, marginBottom: 0 }} />
        {conNiveles ? (
          <select value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)} aria-label="Ver materias de" style={{ ...inp, flex: "0 1 190px" }}>
            <option value="">Todos los niveles</option>
            <option value="todos">Solo las compartidas</option>
            {NIVELES.filter((n) => (niveles || []).includes(n.k)).map((n) => <option key={n.k} value={n.k}>{n.l}</option>)}
          </select>
        ) : null}
        <BotonNuevo onClick={abrirNueva} ariaLabel="Nueva materia" />
      </div>
      {ocultas ? (
        <label style={{ fontSize: 13, color: C.textMuted, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", marginBottom: 10 }}>
          <input type="checkbox" checked={verOcultas} onChange={(e) => setVerOcultas(e.target.checked)} />
          <span style={{ color: C.textMuted }}>Ver ocultas ({ocultas})</span>
        </label>
      ) : null}

      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
        {!visibles.length ? <EmptyState sinBorde icono="lupa" titulo={q ? "Ninguna materia con ese nombre" : "No hay materias"} style={{ padding: 16 }} /> : null}
        {visibles.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${C.border}` : "none", opacity: m.activo ? 1 : 0.55 }}>
            <span style={{ flex: 1, minWidth: 0, display: "block" }}>
              <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: C.textStrong }}>{m.nombre}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.textMuted, marginTop: 1 }}>
                {[conNiveles ? textoNivel(m) : null, usos[m.id] ? `${usos[m.id]} ${usos[m.id] === 1 ? "clase" : "clases"}` : "sin clases", m.activo ? null : "oculta", puede(m) ? null : "solo lectura"].filter(Boolean).join(" · ")}
              </span>
            </span>
            {puede(m) ? (
              <button type="button" onClick={() => abrir(m)} style={{ border: "none", background: "none", padding: "4px 0", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: C.accent, fontFamily: "inherit" }}>Editar</button>
            ) : null}
          </div>
        ))}
      </div>
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


