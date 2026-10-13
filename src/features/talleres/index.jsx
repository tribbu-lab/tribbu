// Talleres extraprogramáticos — pantalla de las familias (catálogo por hijo,
// anotar / baja / lista de espera) y "Mis talleres" de la docente asignada como
// profe. Spec: specs/talleres-extraprogramaticos.md · SQL: supabase/talleres.sql.
//
// Anotar y dar de baja van SOLO por RPC (inscribir_en_taller / baja_de_taller):
// la base valida cupo, elegibilidad y fechas. Reglas para mostrar en
// src/lib/talleres.js (@shared/talleres, también en mobile).
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { fmtNombre } from "../../lib/helpers";
import { sendPush } from "../../lib/push";
import { THEMES, SLATE } from "../../lib/tokens";
import {
  MODOS, SELECT_TALLER, hoyAR, fmtFechaCorta, esElegible, textoLugares, textoHorario, textoProfe, estadoHijo,
  mensajeInscripcion, limiteBaja,
} from "../../lib/talleres";
import { SignedImg } from "../../components/SignedImg";
import { Spinner } from "../../components/Spinner";
import { useCargar } from "../../hooks/useCargar";
import { useToast } from "../../hooks/useToast";
import { useConfirmar } from "../../hooks/useConfirmar";

const C = THEMES.light;
const TONO = {
  ok: { bg: "#F0FDF4", fg: "#047857", bd: "#A7F3D0" },
  espera: { bg: "#FFFBEB", fg: "#B45309", bd: "#FDE68A" },
  pendiente: { bg: "#EFF6FF", fg: "#1D4ED8", bd: "#BFDBFE" },
  mal: { bg: "#FEF2F2", fg: "#B91C1C", bd: "#FECACA" },
  neutro: { bg: "#F1F5F9", fg: "#475569", bd: "#E2E8F0" },
};

function Dato({ ico, children }) {
  if (!children) return null;
  return <div style={{ display: "flex", gap: 7, fontSize: 12.5, color: C.textMuted, lineHeight: 1.45 }}><span style={{ width: 16, flexShrink: 0 }}>{ico}</span><span style={{ color: C.textMuted }}>{children}</span></div>;
}

function fechasTexto(t) {
  if (t.fecha_inicio && t.fecha_fin) return `Del ${fmtFechaCorta(t.fecha_inicio)} al ${fmtFechaCorta(t.fecha_fin)}`;
  if (t.fecha_inicio) return `Empieza el ${fmtFechaCorta(t.fecha_inicio)}`;
  return null;
}

function TallerCard({ taller, hijos, inscPorHijo, cupos, onAnotar, onBaja, ocupado, resaltado, conTag }) {
  const [verMas, setVerMas] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (resaltado) ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [resaltado]);
  const desc = taller.descripcion || "";
  const larga = desc.length > 160;
  return (
    <div ref={ref} style={{ background: C.surface, border: `1.5px solid ${resaltado ? C.accent : C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: resaltado ? "0 0 0 4px #DBEAFE" : "none", transition: "box-shadow .3s" }}>
      {taller.foto ? <SignedImg src={taller.foto} bucket="adjuntos" miniatura alt="" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} /> : null}
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: C.textStrong, letterSpacing: -0.3 }}>{taller.nombre}</div>
          {taller.estado === "cancelado" ? <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: TONO.mal.bg, color: TONO.mal.fg }}>CANCELADO</span> : null}
        </div>
        {desc ? (
          <div style={{ fontSize: 13, color: C.text, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {larga && !verMas ? desc.slice(0, 160) + "…" : desc}
            {larga ? <button onClick={() => setVerMas((v) => !v)} style={{ border: "none", background: "none", padding: 0, marginLeft: 4, color: C.accent, fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{verMas ? "Ver menos" : "Ver más"}</button> : null}
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
          <Dato ico="🕐">{textoHorario(taller.taller_horarios)}</Dato>
          <Dato ico="📅">{fechasTexto(taller)}</Dato>
          <Dato ico="👤">{textoProfe(taller, taller.profe)}</Dato>
          <Dato ico="📍">{taller.lugar}</Dato>
          <Dato ico="💲">{taller.costo_texto}</Dato>
          <Dato ico="🎟️">{[textoLugares(taller, cupos), MODOS[taller.modo_asignacion], taller.inscripcion_hasta ? `inscripción hasta el ${fmtFechaCorta(taller.inscripcion_hasta)}` : null].filter(Boolean).join(" · ")}</Dato>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {hijos.map((h) => {
            const est = estadoHijo(taller, inscPorHijo[h.id]);
            const tono = TONO[est.tono] || TONO.neutro;
            const k = `${taller.id}|${h.id}`;
            return (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: hijos.length > 1 || conTag ? "8px 10px" : 0, borderRadius: 12, background: hijos.length > 1 || conTag ? C.surfaceSunken : "transparent" }}>
                {hijos.length > 1 || conTag ? <span style={{ fontSize: 12.5, fontWeight: 700, color: C.textStrong }}>{h.nombre?.split(" ")[0]}</span> : null}
                {est.texto ? <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: tono.bg, color: tono.fg, border: `1px solid ${tono.bd}` }}>{est.texto}</span> : null}
                <span style={{ flex: 1 }} />
                {est.accion === "anotar" ? (
                  <button onClick={() => onAnotar(taller, h)} disabled={ocupado === k} style={{ minHeight: 40, padding: "0 16px", borderRadius: 10, border: "none", background: C.accent, color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer", opacity: ocupado === k ? 0.6 : 1 }}>
                    {ocupado === k ? "Anotando…" : `Anotar a ${h.nombre?.split(" ")[0]}`}
                  </button>
                ) : null}
                {est.accion === "baja" ? (
                  <button onClick={() => onBaja(taller, h)} disabled={ocupado === k} style={{ minHeight: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: C.surface, color: SLATE[600], fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
                    Darse de baja
                  </button>
                ) : null}
                {est.nota ? <div style={{ flexBasis: "100%", fontSize: 12, color: C.textMuted }}>{est.nota}</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── "Mis talleres" de la profe ───────────────────────────────────────────────

function TallerProfe({ taller }) {
  const [lista, setLista] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const abrir = async () => {
    setAbierto((a) => !a);
    if (lista) return;
    const { data } = await supabase.rpc("inscriptos_taller", { p_taller: taller.id });
    setLista((data || []).filter((r) => r.estado === "inscripto"));
  };
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.textStrong }}>{taller.nombre}</div>
      <div style={{ fontSize: 12.5, color: C.textMuted, marginTop: 3 }}>{[textoHorario(taller.taller_horarios), fechasTexto(taller), taller.lugar].filter(Boolean).join(" · ")}</div>
      <button onClick={abrir} style={{ marginTop: 10, border: "none", background: "none", padding: 0, color: C.accent, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{abierto ? "Ocultar inscriptos" : "Ver inscriptos"}</button>
      {abierto ? (
        <div style={{ marginTop: 8 }}>
          {lista === null ? <div style={{ fontSize: 12.5, color: C.textMuted }}>Cargando…</div> : null}
          {lista && !lista.length ? <div style={{ fontSize: 12.5, color: C.textMuted }}>Todavía no hay inscriptos.</div> : null}
          {(lista || []).map((r, i) => (
            <div key={r.hijo_id} style={{ fontSize: 13, color: C.text, padding: "5px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <span style={{ color: C.text }}>{fmtNombre(r)}</span> <span style={{ color: C.textMuted }}>· {r.curso}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export function Talleres({ items = [], esVistaTodos = false, hijoActivo = null, tagDeCurso = () => null, esDocente = false, openTaller = null }) {
  const [talleres, setTalleres] = useState(null);
  const [insc, setInsc] = useState([]);
  const [cupos, setCupos] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [resaltado, setResaltado] = useState(null);
  const { showToast, Toast } = useToast(4500);
  const [confirmar, confirmUI] = useConfirmar();

  const todosHijos = useMemo(() => items.filter((i) => i._tipo === "hijo"), [items]);
  const hijos = useMemo(() => (esVistaTodos || !hijoActivo ? todosHijos : todosHijos.filter((h) => h.id === hijoActivo)), [todosHijos, esVistaTodos, hijoActivo]);
  const hijoIds = useMemo(() => todosHijos.map((h) => h.id), [todosHijos]);

  const cargar = useCallback(async () => {
    const [t, i] = await Promise.all([
      supabase.from("talleres").select(SELECT_TALLER).neq("estado", "borrador").order("fecha_inicio", { ascending: true, nullsFirst: false }),
      hijoIds.length ? supabase.from("taller_inscripciones").select("taller_id,hijo_id,estado,posicion_espera,motivo").in("hijo_id", hijoIds) : { data: [] },
    ]);
    const lista = t.data || [];
    const ids = lista.map((x) => x.id);
    const c = ids.length ? await supabase.rpc("cupos_talleres", { p_ids: ids }) : { data: [] };
    setTalleres(lista); setInsc(i.data || []);
    setCupos(Object.fromEntries((c.data || []).map((r) => [r.taller_id, r])));
  }, [hijoIds]);
  useCargar(cargar);

  useEffect(() => {
    if (!openTaller?.id) return;
    Promise.resolve().then(() => setResaltado(openTaller.id));
    const tm = setTimeout(() => setResaltado(null), 4000);
    return () => clearTimeout(tm);
  }, [openTaller]);

  const anotar = async (taller, hijo) => {
    const k = `${taller.id}|${hijo.id}`;
    setOcupado(k);
    const { data, error } = await supabase.rpc("inscribir_en_taller", { p_taller: taller.id, p_hijo: hijo.id });
    setOcupado(null);
    if (error) { showToast(error.message, "error"); cargar(); return; }
    showToast(mensajeInscripcion(hijo.nombre?.split(" ")[0], taller.nombre, data), data?.estado === "inscripto" ? "ok" : "info");
    cargar();
  };
  const baja = async (taller, hijo) => {
    const ok = await confirmar({
      titulo: `¿Dar de baja a ${hijo.nombre?.split(" ")[0]} de ${taller.nombre}?`,
      detalle: limiteBaja(taller) ? `Podés volver a anotarte mientras la inscripción siga abierta, pero el lugar puede ocuparlo otra familia.` : "El lugar puede ocuparlo otra familia.",
      textoConfirmar: "Dar de baja",
    });
    if (!ok) return;
    const k = `${taller.id}|${hijo.id}`;
    setOcupado(k);
    const { data, error } = await supabase.rpc("baja_de_taller", { p_taller: taller.id, p_hijo: hijo.id });
    setOcupado(null);
    if (error) { showToast(error.message, "error"); return; }
    showToast(`${hijo.nombre?.split(" ")[0]} ya no está anotado/a en ${taller.nombre}`, "info");
    // si se liberó un lugar, avisarle a la familia que pasó de la lista de espera
    if (data?.avisar?.length) {
      sendPush({ type: "taller", payload: { userIds: data.avisar, tallerId: taller.id, titulo: taller.nombre, mensaje: `🎨 ¡Se liberó un lugar! Quedó inscripto/a en ${taller.nombre}` } }).catch(() => {});
    }
    cargar();
  };

  if (talleres === null) return <Spinner />;
  const hoy = hoyAR();
  const inscDe = (tid) => Object.fromEntries(insc.filter((i) => i.taller_id === tid).map((i) => [i.hijo_id, i]));
  const cursosDe = (t) => (t.taller_cursos || []).map((x) => x.curso_id);
  // talleres de un hijo: elegible o con alguna inscripción (aunque ya no sea elegible)
  const deHijo = (h) => talleres.filter((t) => esElegible(t, h, cursosDe(t), hoy) || insc.some((i) => i.taller_id === t.id && i.hijo_id === h.id && i.estado !== "baja"));
  const misTalleresProfe = esDocente ? talleres : [];

  // Con varios hijos, un taller al que pueden ir dos hermanos se muestra una sola
  // vez con una fila por hijo (vista Todos); por hijo, solo el elegido.
  const porTaller = new Map();
  for (const h of hijos) for (const t of deHijo(h)) {
    if (!porTaller.has(t.id)) porTaller.set(t.id, { taller: t, hijos: [] });
    porTaller.get(t.id).hijos.push(h);
  }
  const tarjetas = [...porTaller.values()];
  const abiertos = tarjetas.filter((x) => x.taller.estado === "publicado");
  const otros = tarjetas.filter((x) => x.taller.estado !== "publicado");

  return (
    <div>
      {confirmUI}
      <Toast />
      <div style={{ fontSize: 26, fontWeight: 900, color: C.textStrong, letterSpacing: -0.3 }}>🎨 Talleres</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 18 }}>Los talleres que ofrece el colegio fuera del horario de clase.</div>

      {esDocente ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textFaint, textTransform: "uppercase", marginBottom: 8 }}>Mis talleres</div>
          {!misTalleresProfe.length ? <div style={{ fontSize: 13, color: C.textMuted }}>No tenés talleres asignados.</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{misTalleresProfe.map((t) => <TallerProfe key={t.id} taller={t} />)}</div>
        </>
      ) : (
        <>
          {!tarjetas.length ? (
            <div style={{ textAlign: "center", padding: "40px 16px", border: `1.5px dashed ${C.borderStrong}`, borderRadius: 16, color: C.textMuted, fontSize: 13.5 }}>
              Por ahora no hay talleres para {hijos.length === 1 ? hijos[0].nombre?.split(" ")[0] : "tus hijos"}.<br />Cuando el colegio publique uno, te avisamos.
            </div>
          ) : null}
          {[["Disponibles", abiertos], ["Anteriores y cerrados", otros]].map(([titulo, lista]) => (lista.length ? (
            <div key={titulo} style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: C.textFaint, textTransform: "uppercase", marginBottom: 8 }}>{titulo}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
                {lista.map(({ taller, hijos: hs }) => (
                  <TallerCard key={taller.id} taller={taller} hijos={hs} inscPorHijo={inscDe(taller.id)} cupos={cupos[taller.id]}
                    onAnotar={anotar} onBaja={baja} ocupado={ocupado} resaltado={resaltado === taller.id}
                    conTag={esVistaTodos && !!tagDeCurso(hs[0]?.curso_id)} />
                ))}
              </div>
            </div>
          ) : null))}
        </>
      )}
    </div>
  );
}
