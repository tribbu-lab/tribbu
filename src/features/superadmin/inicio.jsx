// Inicio del panel del colegio (web): la primera pantalla al entrar. Mismo
// estilo que el Inicio "Hoy" del apoderado (src/features/muro): fecha y
// saludo, lo que hay para resolver (el primero destacado, el resto en una
// tarjeta con enlaces "… →"), los próximos días sin chips de color y accesos
// en filas con íconos de línea. Los datos que el panel ya tiene cargados
// (cursos, alumnos, apoderados, maestras) llegan por props; el resto se pide
// en UNA ronda de pedidos en paralelo.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";
import { hoyAR } from "../../lib/talleres";
import { Icono } from "../../components/Icono";
import { EmptyState } from "../../components/EmptyState";
import { useIsMobile } from "../../hooks/useIsMobile";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const masDias = (f, n) => { const d = new Date(f + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fechaLarga = (f) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const fechaCorta = (f) => { const d = new Date(f + "T12:00:00"); return `${DIAS[d.getDay()].slice(0, 3).toLowerCase()} ${d.getDate()}`; };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const card = { border: "1px solid #E2E8F0", borderRadius: 16, background: "white" };
const tituloSeccion = { fontSize: 18, fontWeight: 800, color: "#0F172A", letterSpacing: -0.2 };
const enlace = { display: "inline-flex", alignItems: "center", gap: 6, padding: 0, border: "none", background: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: "#2563EB", fontFamily: "inherit" };

const Enlace = ({ texto, onClick, style }) => (
  <button onClick={onClick} style={{ ...enlace, ...style }}>
    <span style={{ color: "#2563EB" }}>{texto}</span>
    <Icono nombre="flecha" size={15} color="#2563EB" />
  </button>
);
const Encabezado = ({ titulo, cuenta, derecha }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
    <div style={tituloSeccion}>{titulo}</div>
    {cuenta > 0 ? <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: "#F1F5F9", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#475569", boxSizing: "border-box" }}>{cuenta}</span> : null}
    <div style={{ flex: 1 }} />
    {derecha}
  </div>
);

export function InicioColegio({ usuario, colegioNombre, colegioId, cursos = [], hijos = [], usuarios = [], maestros = [], esColegioAdmin = false, ocultas = null, onIr }) {
  const [d, setD] = useState(null);
  const isMobile = useIsMobile();
  const hoy = hoyAR();
  const ids = useMemo(() => cursos.map((c) => c.id), [cursos]);
  const nombreCurso = useMemo(() => Object.fromEntries(cursos.map((c) => [c.id, c.nombre])), [cursos]);

  useEffect(() => {
    if (!colegioId) return undefined;
    let vivo = true;
    const vacio = { data: [], count: 0 };
    (async () => {
      const en7 = masDias(hoy, 7);
      const [adop, bandeja, denuncias, horarios, eventos, talleresPend, auts, menu, convs] = await Promise.all([
        ids.length ? supabase.rpc("adopcion_por_curso", { p_ids: ids }) : vacio,
        esColegioAdmin ? supabase.rpc("bandeja_colegio") : vacio,
        supabase.from("mensaje_denuncias").select("id", { count: "exact", head: true }).eq("estado", "pendiente").eq("colegio_id", colegioId),
        ids.length ? supabase.from("horarios").select("curso_id").in("curso_id", ids) : vacio,
        ids.length ? supabase.from("eventos").select("id,titulo,tipo,fecha,hora,curso_id,grupo_id").in("curso_id", ids).gte("fecha", hoy).lte("fecha", en7).not("tipo", "in", "(cumple,festejo)").order("fecha").order("hora", { nullsFirst: true }) : vacio,
        supabase.from("taller_inscripciones").select("id, talleres!inner(colegio_id)", { count: "exact", head: true }).eq("estado", "pendiente").eq("talleres.colegio_id", colegioId),
        ids.length ? supabase.from("autorizaciones").select("id,titulo,fecha_limite,grupo_id").in("curso_id", ids).or(`fecha_limite.is.null,fecha_limite.gte.${hoy}`) : vacio,
        supabase.from("menu").select("fecha").eq("colegio_id", colegioId).gte("fecha", hoy).lte("fecha", en7),
        // Mis chats (personal del colegio y soporte): solo el staff los tiene.
        esColegioAdmin ? supabase.rpc("mis_conversaciones") : vacio,
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
      const personal = (convs.data || []).filter((c) => c.tipo === "personal" && c.no_leidos > 0);
      setD({
        adopcion: a,
        sinLeer: b.reduce((s, r) => s + (r.no_leidos || 0), 0),
        sinResponder: b.filter((r) => r.sin_responder).length,
        personalSinLeer: personal.reduce((s, c) => s + c.no_leidos, 0),
        personalChats: personal.length,
        soporteSinLeer: (convs.data || []).filter((c) => c.tipo === "soporte").reduce((s, c) => s + (c.no_leidos || 0), 0),
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

  // Lo que espera algo del colegio, en orden de urgencia: primero lo que
  // escribió alguien, después lo que falta cargar.
  const pendientes = d ? [
    esColegioAdmin && d.sinLeer ? { sec: "mensajes_familias", tipo: "Mensajes de familias", titulo: plural(d.sinLeer, "mensaje sin leer", "mensajes sin leer"), dato: d.sinResponder ? `${plural(d.sinResponder, "conversación espera", "conversaciones esperan")} respuesta de Secretaría` : null, accion: "Leer y responder" } : null,
    esColegioAdmin && d.personalSinLeer ? { sec: "mensajes_personal", tipo: "Mensajes del personal", titulo: plural(d.personalSinLeer, "mensaje sin leer", "mensajes sin leer"), dato: d.personalChats > 1 ? `En ${d.personalChats} chats` : null, accion: "Leer mensajes" } : null,
    esColegioAdmin && d.soporteSinLeer ? { sec: "soporte_colegio", tipo: "Ayuda y soporte", titulo: "El equipo de tribbu te respondió", dato: null, accion: "Ver la respuesta" } : null,
    d.denuncias ? { sec: "denuncias", tipo: "Denuncias", titulo: plural(d.denuncias, "denuncia pendiente", "denuncias pendientes"), dato: "Mensajes que una familia reportó", accion: "Revisar" } : null,
    d.talleresPend ? { sec: "talleres", tipo: "Talleres", titulo: `${plural(d.talleresPend, "inscripción espera", "inscripciones esperan")} aprobación`, dato: null, accion: "Ver inscripciones" } : null,
    d.sinMenu.length ? { sec: "menu", tipo: "Menú", titulo: `Falta el menú de ${plural(d.sinMenu.length, "día", "días")} de esta semana`, dato: d.sinMenu.map(fechaCorta).join(", "), accion: "Cargar el menú" } : null,
    sinApoderado ? { sec: "alumnos", tipo: "Alumnos", titulo: `${plural(sinApoderado, "alumno", "alumnos")} sin apoderado vinculado`, dato: "Sus familias todavía no reciben nada", accion: "Ver alumnos" } : null,
    d.cursosSinHorario.length ? { sec: "horarios", tipo: "Horarios", titulo: `${plural(d.cursosSinHorario.length, "curso", "cursos")} sin horario cargado`, dato: d.cursosSinHorario.slice(0, 4).map((c) => c.nombre).join(", ") + (d.cursosSinHorario.length > 4 ? "…" : ""), accion: "Cargar horarios" } : null,
  ].filter((p) => p && !ocultas?.has(p.sec)) : [];
  const [destacado, ...resto] = pendientes;

  const accesos = [
    ["comunicaciones", "Nuevo comunicado", "comunicaciones"], ["agenda", "Nuevo evento", "eventos"], ["firma", "Pedir una autorización", "autorizaciones"],
    ["alerta", "Enviar una alerta", "alertas"], ["paleta", "Talleres", "talleres"], ["grafico", "Adopción de la app", "adopcion"],
  ].filter(([, , sec]) => !ocultas?.has(sec));

  const kpis = [
    { n: cursos.length, l: "Cursos" },
    { n: hijosAno.length, l: "Alumnos" },
    { n: familias, l: "Familias" },
    { n: maestros.filter((m) => m.activo !== false).length, l: "Docentes" },
    { n: pctApp == null ? "—" : `${pctApp}%`, l: "Usan la app", sub: d?.adopcion.familias ? `${d.adopcion.conApp} de ${d.adopcion.familias}` : null },
  ];

  const bloqueResolver = (
    <div style={{ marginBottom: 28 }}>
      {d === null ? <div style={{ fontSize: 13, color: "#64748B" }}>Cargando…</div> : null}
      {d && destacado ? (
        <>
          <div style={{ ...tituloSeccion, marginBottom: 12 }}>{pendientes.length === 1 ? "Tenés 1 cosa para resolver" : `Tenés ${pendientes.length} cosas para resolver`}</div>
          <div style={{ ...card, padding: "16px 18px", marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748B" }}>{destacado.tipo}</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginTop: 8, lineHeight: 1.3 }}>{destacado.titulo}</div>
            {destacado.dato ? <div style={{ fontSize: 13, color: "#64748B", marginTop: 6, lineHeight: 1.45, overflowWrap: "anywhere" }}>{destacado.dato}</div> : null}
            <Enlace texto={destacado.accion} onClick={() => onIr(destacado.sec)} style={{ marginTop: 12 }} />
          </div>
          {resto.length ? (
            <div style={card}>
              {resto.map((p, i) => (
                <div key={p.sec} style={{ padding: "14px 18px", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{p.tipo}</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginTop: 4, lineHeight: 1.3 }}>{p.titulo}</div>
                  {p.dato ? <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3, lineHeight: 1.45, overflowWrap: "anywhere" }}>{p.dato}</div> : null}
                  <Enlace texto={p.accion} onClick={() => onIr(p.sec)} style={{ marginTop: 10 }} />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {d && !destacado ? <EmptyState icono="check" titulo="Estás al día" nota="No hay nada para resolver. Cuando haya algo, aparece acá." /> : null}
    </div>
  );

  const bloqueNumeros = (
    <div style={{ marginBottom: 28 }}>
      <Encabezado titulo="El colegio en números" />
      {/* Separadores con gap + fondo gris: quedan bien en una fila o partidos en dos. */}
      <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 1, background: "#F1F5F9", overflow: "hidden" }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ padding: "14px 18px", background: "white" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{k.l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", marginTop: 4, lineHeight: 1.1 }}>{k.n ?? "—"}</div>
            {k.sub ? <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{k.sub}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );

  const bloqueProximos = (
    <div style={{ marginBottom: 28 }}>
      <Encabezado titulo="Próximos días" derecha={<button onClick={() => onIr("eventos")} style={{ ...enlace, fontSize: 13 }}><span style={{ color: "#2563EB" }}>Eventos</span></button>} />
      {d === null ? <div style={{ fontSize: 13, color: "#64748B" }}>Cargando…</div> : null}
      {d && !d.eventos.length ? <div style={{ fontSize: 13, color: "#64748B" }}>No hay eventos cargados para esta semana.</div> : null}
      {d?.eventos.length ? (
        <div style={card}>
          {d.eventos.slice(0, 8).map((e, i) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
              <div style={{ width: 34, textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#64748B" }}>{fechaCorta(e.fecha).split(" ")[0]}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", lineHeight: 1.1 }}>{fechaCorta(e.fecha).split(" ")[1]}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.titulo}</div>
                <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{[e.hora ? String(e.hora).slice(0, 5) : null, e._varios ? "Varios cursos" : nombreCurso[e.curso_id]].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {d?.autorizaciones.length ? (
        <Enlace texto={`${plural(d.autorizaciones.length, "autorización abierta", "autorizaciones abiertas")} esperando respuestas`} onClick={() => onIr("autorizaciones")} style={{ marginTop: 12 }} />
      ) : null}
    </div>
  );

  const bloqueAccesos = (
    <div style={{ marginBottom: 28 }}>
      <Encabezado titulo="Accesos rápidos" />
      <div style={{ ...card, overflow: "hidden" }}>
        {accesos.map(([ico, l, sec], i) => (
          <button key={sec} onClick={() => onIr(sec)} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 18px", border: "none", borderTop: i ? "1px solid #F1F5F9" : "none", background: "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
            <Icono nombre={ico} size={18} color="#475569" />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{l}</span>
            <Icono nombre="flecha" size={15} color="#94A3B8" />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, color: "#64748B" }}>{fechaLarga(hoy)}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", letterSpacing: -0.4, marginTop: 2 }}>Hola, {usuario?.nombre?.split(" ")[0] || ""}</div>
        {colegioNombre ? <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 4 }}>{colegioNombre}</div> : null}
      </div>
      <div style={isMobile ? undefined : { display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 28, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          {bloqueResolver}
          {bloqueNumeros}
          {isMobile ? bloqueProximos : null}
        </div>
        <div style={{ minWidth: 0 }}>
          {isMobile ? null : bloqueProximos}
          {bloqueAccesos}
        </div>
      </div>
    </div>
  );
}
