// Inicio del panel del colegio (web): la primera pantalla al entrar.
// Resumen del colegio, lo que hay para resolver (cada item lleva a su
// sección), lo que viene en la semana y accesos rápidos. Los datos que el
// panel ya tiene cargados (cursos, alumnos, apoderados, maestras) llegan por
// props; el resto se pide en UNA ronda de pedidos en paralelo.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";
import { THEMES, SLATE } from "../../lib/tokens";
import { hoyAR } from "../../lib/talleres";

const C = THEMES.light;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const masDias = (f, n) => { const d = new Date(f + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fechaLarga = (f) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fechaCorta = (f) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()].slice(0, 3).toLowerCase()} ${d.getDate()}`; };

function Kpi({ n, l, sub, color }) {
  return (
    <div style={{ flex: "1 1 150px", minWidth: 140, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 18px" }}>
      <div style={{ fontSize: 10.5, color: C.textFaint, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 900, color: color || C.textStrong, lineHeight: 1 }}>{n ?? "—"}</span>
        {sub ? <span style={{ fontSize: 12, color: C.textFaint, fontWeight: 600 }}>{sub}</span> : null}
      </div>
    </div>
  );
}

function Bloque({ titulo, children, accion }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 11, fontWeight: 800, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>{titulo}</div>
        {accion}
      </div>
      {children}
    </div>
  );
}

export function InicioColegio({ usuario, colegioNombre, colegioId, cursos = [], hijos = [], usuarios = [], maestros = [], esColegioAdmin = false, ocultas = null, onIr }) {
  const [d, setD] = useState(null);
  const hoy = hoyAR();
  const ids = useMemo(() => cursos.map((c) => c.id), [cursos]);
  const nombreCurso = useMemo(() => Object.fromEntries(cursos.map((c) => [c.id, c.nombre])), [cursos]);

  useEffect(() => {
    if (!colegioId) return undefined;
    let vivo = true;
    const vacio = { data: [], count: 0 };
    (async () => {
      const en7 = masDias(hoy, 7);
      const [adop, bandeja, denuncias, horarios, eventos, talleresPend, auts, menu] = await Promise.all([
        ids.length ? supabase.rpc("adopcion_por_curso", { p_ids: ids }) : vacio,
        esColegioAdmin ? supabase.rpc("bandeja_colegio") : vacio,
        supabase.from("mensaje_denuncias").select("id", { count: "exact", head: true }).eq("estado", "pendiente").eq("colegio_id", colegioId),
        ids.length ? supabase.from("horarios").select("curso_id").in("curso_id", ids) : vacio,
        ids.length ? supabase.from("eventos").select("id,titulo,tipo,fecha,hora,curso_id,grupo_id").in("curso_id", ids).gte("fecha", hoy).lte("fecha", en7).not("tipo", "in", "(cumple,festejo)").order("fecha").order("hora", { nullsFirst: true }) : vacio,
        supabase.from("taller_inscripciones").select("id, talleres!inner(colegio_id)", { count: "exact", head: true }).eq("estado", "pendiente").eq("talleres.colegio_id", colegioId),
        ids.length ? supabase.from("autorizaciones").select("id,titulo,fecha_limite,grupo_id").in("curso_id", ids).or(`fecha_limite.is.null,fecha_limite.gte.${hoy}`) : vacio,
        supabase.from("menu").select("fecha").eq("colegio_id", colegioId).gte("fecha", hoy).lte("fecha", en7),
      ]);
      if (!vivo) return;
      const a = (adop.data || []).reduce((s, r) => ({ familias: s.familias + (r.familias || 0), conApp: s.conApp + (r.con_app || 0), activas: s.activas + (r.activas_30d || 0) }), { familias: 0, conApp: 0, activas: 0 });
      const b = bandeja.data || [];
      const conHorario = new Set((horarios.data || []).map((h) => h.curso_id));
      // eventos multi-curso: una fila por grupo
      const vistos = new Set();
      const ev = [];
      for (const e of eventos.data || []) {
        const k = e.grupo_id || e.id;
        if (vistos.has(k)) { const x = ev.find((y) => (y.grupo_id || y.id) === k); if (x) x._varios = true; continue; }
        vistos.add(k); ev.push({ ...e });
      }
      const autsUnicas = [...new Map((auts.data || []).map((x) => [x.grupo_id || x.id, x])).values()];
      const conMenu = new Set((menu.data || []).map((m) => m.fecha));
      const habiles = [];
      for (let i = 0; i <= 7 && habiles.length < 5; i++) { const f = masDias(hoy, i); const dow = new Date(f + "T12:00:00").getDay(); if (dow >= 1 && dow <= 5) habiles.push(f); }
      setD({
        adopcion: a,
        sinLeer: b.reduce((s, r) => s + (r.no_leidos || 0), 0),
        sinResponder: b.filter((r) => r.sin_responder).length,
        denuncias: denuncias.count || 0,
        cursosSinHorario: cursos.filter((c) => !conHorario.has(c.id)),
        eventos: ev,
        talleresPend: talleresPend.count || 0,
        autorizaciones: autsUnicas,
        sinMenu: habiles.filter((f) => !conMenu.has(f)),
      });
    })();
    return () => { vivo = false; };
  }, [colegioId, ids, esColegioAdmin, hoy, cursos]);

  const idsSet = new Set(ids);
  const hijosAno = hijos.filter((h) => idsSet.has(h.curso_id));
  const conApoderado = new Set(usuarios.flatMap((u) => u.hijos || []));
  const sinApoderado = hijosAno.filter((h) => !conApoderado.has(h.id)).length;
  const familias = usuarios.filter((u) => u.rol !== "super" && u.rol !== "colegio_admin" && u.rol !== "nivel_admin" && u.rol !== "docente" && u.activo !== false).length;
  const pctApp = d?.adopcion.familias ? Math.round((d.adopcion.conApp / d.adopcion.familias) * 100) : null;

  const pendientes = d ? [
    esColegioAdmin && d.sinLeer ? { ico: "💬", txt: `${d.sinLeer} ${d.sinLeer === 1 ? "mensaje sin leer" : "mensajes sin leer"} de familias`, sub: d.sinResponder ? `${d.sinResponder} ${d.sinResponder === 1 ? "conversación espera" : "conversaciones esperan"} respuesta de Secretaría` : null, sec: "mensajes_familias", color: "#2563EB" } : null,
    d.denuncias ? { ico: "🚩", txt: `${d.denuncias} ${d.denuncias === 1 ? "denuncia pendiente" : "denuncias pendientes"}`, sub: "Mensajes que una familia reportó", sec: "denuncias", color: "#DC2626" } : null,
    d.talleresPend ? { ico: "🎨", txt: `${d.talleresPend} ${d.talleresPend === 1 ? "inscripción a talleres espera" : "inscripciones a talleres esperan"} aprobación`, sec: "talleres", color: "#7C3AED" } : null,
    d.sinMenu.length ? { ico: "🍽️", txt: `Falta el menú de ${d.sinMenu.length === 1 ? "1 día" : `${d.sinMenu.length} días`} de esta semana`, sub: d.sinMenu.map(fechaCorta).join(", "), sec: "menu", color: "#B45309" } : null,
    sinApoderado ? { ico: "🎒", txt: `${sinApoderado} ${sinApoderado === 1 ? "alumno sin" : "alumnos sin"} apoderado vinculado`, sub: "Sus familias todavía no reciben nada", sec: "alumnos", color: "#B45309" } : null,
    d.cursosSinHorario.length ? { ico: "🕐", txt: `${d.cursosSinHorario.length} ${d.cursosSinHorario.length === 1 ? "curso sin" : "cursos sin"} horario cargado`, sub: d.cursosSinHorario.slice(0, 4).map((c) => c.nombre).join(", ") + (d.cursosSinHorario.length > 4 ? "…" : ""), sec: "horarios", color: "#475569" } : null,
  ].filter((p) => p && !ocultas?.has(p.sec)) : [];

  const accesos = [
    ["📢", "Nueva comunicación", "comunicaciones"], ["📅", "Nuevo evento", "eventos"], ["✍️", "Pedir autorización", "autorizaciones"],
    ["🚨", "Alerta urgente", "alertas"], ["🎨", "Talleres", "talleres"], ["📈", "Adopción", "adopcion"],
  ].filter(([, , sec]) => !ocultas?.has(sec));

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.textFaint, textTransform: "uppercase", letterSpacing: 0.8 }}>{fechaLarga(hoy)}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: C.textStrong, letterSpacing: -0.6, marginTop: 4 }}>Hola, {usuario?.nombre?.split(" ")[0] || ""}</div>
        <div style={{ fontSize: 13.5, color: C.textMuted, marginTop: 4 }}>{colegioNombre ? `Así está ${colegioNombre} hoy.` : "Así está el colegio hoy."}</div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <Kpi n={cursos.length} l="Cursos" sub="este año" />
        <Kpi n={hijosAno.length} l="Alumnos" />
        <Kpi n={familias} l="Familias" sub="apoderados" />
        <Kpi n={maestros.filter((m) => m.activo !== false).length} l="Docentes" />
        <Kpi n={pctApp == null ? "—" : `${pctApp}%`} l="Usan la app" sub={d?.adopcion.familias ? `${d.adopcion.conApp} de ${d.adopcion.familias}` : null} color={pctApp == null ? undefined : pctApp >= 70 ? "#059669" : pctApp >= 40 ? "#B45309" : "#DC2626"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 14, marginBottom: 14 }}>
        <Bloque titulo={`Para resolver${pendientes.length ? ` · ${pendientes.length}` : ""}`}>
          {d === null ? <div style={{ fontSize: 13, color: C.textMuted }}>Cargando…</div> : null}
          {d && !pendientes.length ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "14px 14px", border: `1.5px dashed ${C.borderStrong}`, borderRadius: 12 }}>
              <span style={{ fontSize: 22 }}>✓</span>
              <div><b style={{ fontSize: 14, color: C.textStrong, display: "block" }}>Todo al día</b><span style={{ fontSize: 12.5, color: C.textMuted }}>No hay nada pendiente por ahora.</span></div>
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendientes.map((p) => (
              <button key={p.sec} onClick={() => onIr(p.sec)} style={{ display: "flex", gap: 12, alignItems: "flex-start", textAlign: "left", padding: "12px 14px", border: `1px solid ${C.border}`, borderLeft: `4px solid ${p.color}`, borderRadius: 12, background: C.surface, cursor: "pointer" }}>
                <span style={{ fontSize: 18, lineHeight: 1.2 }}>{p.ico}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13.5, color: C.textStrong, display: "block" }}>{p.txt}</b>
                  {p.sub ? <span style={{ fontSize: 12, color: C.textMuted, display: "block", marginTop: 2, overflowWrap: "anywhere" }}>{p.sub}</span> : null}
                </span>
                <span style={{ color: C.textFaint, fontSize: 16 }}>›</span>
              </button>
            ))}
          </div>
        </Bloque>

        <Bloque titulo="Próximos 7 días" accion={<button onClick={() => onIr("eventos")} style={{ border: "none", background: "none", color: C.accent, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0 }}>Ver eventos</button>}>
          {d === null ? <div style={{ fontSize: 13, color: C.textMuted }}>Cargando…</div> : null}
          {d && !d.eventos.length ? <div style={{ fontSize: 13, color: C.textMuted }}>No hay eventos cargados para esta semana.</div> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {(d?.eventos || []).slice(0, 8).map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <div style={{ width: 44, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: C.textFaint, textTransform: "uppercase" }}>{fechaCorta(e.fecha).split(" ")[0]}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.textStrong, lineHeight: 1.1 }}>{fechaCorta(e.fecha).split(" ")[1]}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textStrong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titulo}</div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{[e.hora ? String(e.hora).slice(0, 5) : null, e._varios ? "🏫 varios cursos" : nombreCurso[e.curso_id]].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
          {d?.autorizaciones.length ? (
            <button onClick={() => onIr("autorizaciones")} style={{ marginTop: 12, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceSunken, cursor: "pointer", fontSize: 12.5, color: C.text }}>
              <span style={{ color: C.text }}>✍️ {d.autorizaciones.length} {d.autorizaciones.length === 1 ? "autorización abierta" : "autorizaciones abiertas"} esperando respuestas</span>
            </button>
          ) : null}
        </Bloque>
      </div>

      <Bloque titulo="Accesos rápidos">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {accesos.map(([ico, l, sec]) => (
            <button key={sec} onClick={() => onIr(sec)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: 14, borderRadius: 14, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 22 }}>{ico}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: SLATE[800] }}>{l}</span>
            </button>
          ))}
        </div>
      </Bloque>
    </div>
  );
}
