// Talleres extraprogramáticos (mobile) — catálogo por hijo para las familias
// (anotar / baja / lista de espera) y "Mis talleres" de la docente asignada
// como profe. Port de src/features/talleres con las mismas reglas
// (@shared/talleres); anotar y dar de baja van solo por RPC
// (supabase/talleres.sql). El panel del colegio está en ./colegio.jsx.
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush } from "../../lib/push";
import { useRecarga } from "../../lib/useRecarga";
import { useSession } from "../../context/Session";
import { useToast } from "../../components/Toast";
import { SignedImage } from "../../components/SignedImage";
import { fmtNombre } from "@shared/helpers";
import { THEMES, SLATE, SPACE, RADIUS } from "@shared/tokens";
import {
  MODOS, SELECT_TALLER, hoyAR, fmtFechaCorta, esElegible, textoLugares, textoHorario, textoProfe, estadoHijo, mensajeInscripcion,
} from "@shared/talleres";

const t = THEMES.light;
const TONO = {
  ok: { bg: "#F0FDF4", fg: "#047857" },
  espera: { bg: "#FFFBEB", fg: "#B45309" },
  pendiente: { bg: "#EFF6FF", fg: "#1D4ED8" },
  mal: { bg: "#FEF2F2", fg: "#B91C1C" },
  neutro: { bg: "#F1F5F9", fg: "#475569" },
};
const fechas = (x) => (x.fecha_inicio && x.fecha_fin ? `Del ${fmtFechaCorta(x.fecha_inicio)} al ${fmtFechaCorta(x.fecha_fin)}` : x.fecha_inicio ? `Empieza el ${fmtFechaCorta(x.fecha_inicio)}` : null);
const primerNombre = (h) => h?.nombre?.split(" ")[0] || "";

function Dato({ ico, children }) {
  if (!children) return null;
  return <Text style={s.dato}>{ico}  {children}</Text>;
}

function TallerCard({ taller, hijos, inscPorHijo, cupos, onAnotar, onBaja, ocupado, resaltado, onLayout }) {
  const [verMas, setVerMas] = useState(false);
  const desc = taller.descripcion || "";
  const larga = desc.length > 160;
  const conFilas = hijos.length > 1;
  return (
    <View onLayout={onLayout} style={[s.card, resaltado && s.cardResaltada]}>
      {taller.foto ? <SignedImage src={taller.foto} bucket="adjuntos" miniatura style={s.foto} /> : null}
      <View style={{ padding: SPACE.md }}>
        <View style={s.row}>
          <Text style={[s.titulo, s.flex1]}>{taller.nombre}</Text>
          {taller.estado === "cancelado" ? <Text style={[s.pill, { backgroundColor: TONO.mal.bg, color: TONO.mal.fg }]}>CANCELADO</Text> : null}
        </View>
        {desc ? (
          <Text style={s.desc}>
            {larga && !verMas ? desc.slice(0, 160) + "… " : desc + " "}
            {larga ? <Text style={s.link} onPress={() => setVerMas((v) => !v)}>{verMas ? "Ver menos" : "Ver más"}</Text> : null}
          </Text>
        ) : null}
        <View style={{ gap: 3, marginTop: 8 }}>
          <Dato ico="🕐">{textoHorario(taller.taller_horarios)}</Dato>
          <Dato ico="📅">{fechas(taller)}</Dato>
          <Dato ico="👤">{textoProfe(taller, taller.profe)}</Dato>
          <Dato ico="📍">{taller.lugar}</Dato>
          <Dato ico="💲">{taller.costo_texto}</Dato>
          <Dato ico="🎟️">{[textoLugares(taller, cupos), MODOS[taller.modo_asignacion], taller.inscripcion_hasta ? `hasta el ${fmtFechaCorta(taller.inscripcion_hasta)}` : null].filter(Boolean).join(" · ")}</Dato>
        </View>
        <View style={{ gap: 8, marginTop: 12 }}>
          {hijos.map((h) => {
            const est = estadoHijo(taller, inscPorHijo[h.id]);
            const tono = TONO[est.tono] || TONO.neutro;
            const k = `${taller.id}|${h.id}`;
            return (
              <View key={h.id} style={[s.filaHijo, conFilas && s.filaHijoFondo]}>
                {conFilas ? <Text style={s.hijoNombre}>{primerNombre(h)}</Text> : null}
                {est.texto ? <Text style={[s.pill, { backgroundColor: tono.bg, color: tono.fg }]}>{est.texto}</Text> : null}
                <View style={s.flex1} />
                {est.accion === "anotar" ? (
                  <Pressable onPress={() => onAnotar(taller, h)} disabled={ocupado === k} style={[s.btnPri, ocupado === k && { opacity: 0.6 }]} accessibilityRole="button">
                    <Text style={s.btnPriTxt}>{ocupado === k ? "Anotando…" : `Anotar a ${primerNombre(h)}`}</Text>
                  </Pressable>
                ) : null}
                {est.accion === "baja" ? (
                  <Pressable onPress={() => onBaja(taller, h)} disabled={ocupado === k} style={s.btnSec} accessibilityRole="button">
                    <Text style={s.btnSecTxt}>Darse de baja</Text>
                  </Pressable>
                ) : null}
                {est.nota ? <Text style={[s.muted, { flexBasis: "100%" }]}>{est.nota}</Text> : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

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
    <View style={[s.card, { padding: SPACE.md }]}>
      <Text style={s.titulo}>{taller.nombre}</Text>
      <Text style={s.muted}>{[textoHorario(taller.taller_horarios), fechas(taller), taller.lugar].filter(Boolean).join(" · ")}</Text>
      <Pressable onPress={abrir} hitSlop={6}><Text style={[s.link, { marginTop: 8 }]}>{abierto ? "Ocultar inscriptos" : "Ver inscriptos"}</Text></Pressable>
      {abierto ? (
        <View style={{ marginTop: 6 }}>
          {lista === null ? <ActivityIndicator color={t.accent} /> : null}
          {lista && !lista.length ? <Text style={s.muted}>Todavía no hay inscriptos.</Text> : null}
          {(lista || []).map((r) => <Text key={r.hijo_id} style={s.dato}>{fmtNombre(r)} · {r.curso}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

export function Talleres({ openTaller = null, nonce = null }) {
  const { items = [], esVistaTodos, hijoActivoId, esDocente } = useSession();
  const [talleres, setTalleres] = useState(null);
  const [insc, setInsc] = useState([]);
  const [cupos, setCupos] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [resaltado, setResaltado] = useState(null);
  const { showToast, toast } = useToast();
  const scrollRef = useRef(null);
  const posiciones = useRef({});

  const todosHijos = useMemo(() => items.filter((i) => i._tipo === "hijo"), [items]);
  const hijos = useMemo(() => (esVistaTodos || !hijoActivoId ? todosHijos : todosHijos.filter((h) => h.id === hijoActivoId)), [todosHijos, esVistaTodos, hijoActivoId]);
  const hijoIds = useMemo(() => todosHijos.map((h) => h.id), [todosHijos]);

  const cargar = useCallback(async () => {
    const [tl, i] = await Promise.all([
      supabase.from("talleres").select(SELECT_TALLER).neq("estado", "borrador").order("fecha_inicio", { ascending: true, nullsFirst: false }),
      hijoIds.length ? supabase.from("taller_inscripciones").select("taller_id,hijo_id,estado,posicion_espera,motivo").in("hijo_id", hijoIds) : { data: [] },
    ]);
    const lista = tl.data || [];
    const c = lista.length ? await supabase.rpc("cupos_talleres", { p_ids: lista.map((x) => x.id) }) : { data: [] };
    setTalleres(lista); setInsc(i.data || []);
    setCupos(Object.fromEntries((c.data || []).map((r) => [r.taller_id, r])));
  }, [hijoIds]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  // push "taller" → resaltar y llevar a la tarjeta
  useEffect(() => {
    if (!openTaller || !talleres) return undefined;
    Promise.resolve().then(() => setResaltado(openTaller));
    const y = posiciones.current[openTaller];
    if (y != null) setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true }), 250);
    const tm = setTimeout(() => setResaltado(null), 4000);
    return () => clearTimeout(tm);
  }, [openTaller, nonce, talleres]);

  const anotar = async (taller, hijo) => {
    const k = `${taller.id}|${hijo.id}`;
    setOcupado(k);
    const { data, error } = await supabase.rpc("inscribir_en_taller", { p_taller: taller.id, p_hijo: hijo.id });
    setOcupado(null);
    if (error) { Alert.alert("No se pudo anotar", error.message); cargar(); return; }
    showToast(mensajeInscripcion(primerNombre(hijo), taller.nombre, data));
    cargar();
  };
  const baja = (taller, hijo) => {
    Alert.alert(`¿Dar de baja a ${primerNombre(hijo)}?`, `De ${taller.nombre}. El lugar puede ocuparlo otra familia.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Dar de baja", style: "destructive", onPress: async () => {
        const k = `${taller.id}|${hijo.id}`;
        setOcupado(k);
        const { data, error } = await supabase.rpc("baja_de_taller", { p_taller: taller.id, p_hijo: hijo.id });
        setOcupado(null);
        if (error) { Alert.alert("No se pudo dar de baja", error.message); return; }
        if (data?.avisar?.length) {
          sendPush({ type: "taller", payload: { userIds: data.avisar, tallerId: taller.id, titulo: taller.nombre, mensaje: `🎨 ¡Se liberó un lugar! Quedó inscripto/a en ${taller.nombre}` } }).catch(() => {});
        }
        showToast(`${primerNombre(hijo)} ya no está anotado/a`);
        cargar();
      } },
    ]);
  };

  if (talleres === null) return <View style={s.screen}><ActivityIndicator color={t.accent} style={{ marginTop: 40 }} /></View>;
  const hoy = hoyAR();
  const inscDe = (tid) => Object.fromEntries(insc.filter((i) => i.taller_id === tid).map((i) => [i.hijo_id, i]));
  const cursosDe = (x) => (x.taller_cursos || []).map((c) => c.curso_id);
  const porTaller = new Map();
  for (const h of hijos) for (const x of talleres) {
    const anotado = insc.some((i) => i.taller_id === x.id && i.hijo_id === h.id && i.estado !== "baja");
    if (!esElegible(x, h, cursosDe(x), hoy) && !anotado) continue;
    if (!porTaller.has(x.id)) porTaller.set(x.id, { taller: x, hijos: [] });
    porTaller.get(x.id).hijos.push(h);
  }
  const tarjetas = [...porTaller.values()];
  const grupos = [["DISPONIBLES", tarjetas.filter((x) => x.taller.estado === "publicado")], ["ANTERIORES Y CERRADOS", tarjetas.filter((x) => x.taller.estado !== "publicado")]];

  return (
    <View style={s.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}>
        <Text style={s.h1}>🎨 Talleres</Text>
        <Text style={[s.muted, { marginBottom: SPACE.lg }]}>Los talleres que ofrece el colegio fuera del horario de clase.</Text>
        {esDocente ? (
          <>
            <Text style={s.label}>MIS TALLERES</Text>
            {!talleres.length ? <Text style={s.muted}>No tenés talleres asignados.</Text> : null}
            <View style={{ gap: 10 }}>{talleres.map((x) => <TallerProfe key={x.id} taller={x} />)}</View>
          </>
        ) : (
          <>
            {!tarjetas.length ? (
              <View style={s.vacio}>
                <Text style={[s.muted, { textAlign: "center" }]}>Por ahora no hay talleres para {hijos.length === 1 ? primerNombre(hijos[0]) : "tus hijos"}.{"\n"}Cuando el colegio publique uno, te avisamos.</Text>
              </View>
            ) : null}
            {grupos.map(([titulo, lista]) => (lista.length ? (
              <View key={titulo} style={{ marginBottom: SPACE.lg }}>
                <Text style={s.label}>{titulo}</Text>
                <View style={{ gap: 12 }}>
                  {lista.map(({ taller, hijos: hs }) => (
                    <TallerCard key={taller.id} taller={taller} hijos={hs} inscPorHijo={inscDe(taller.id)} cupos={cupos[taller.id]}
                      onAnotar={anotar} onBaja={baja} ocupado={ocupado} resaltado={resaltado === taller.id}
                      onLayout={(e) => { posiciones.current[taller.id] = e.nativeEvent.layout.y; }} />
                  ))}
                </View>
              </View>
            ) : null))}
          </>
        )}
      </ScrollView>
      {toast}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: 16, paddingBottom: 112 },
  h1: { fontSize: 22, fontWeight: "900", color: t.textStrong },
  label: { fontSize: 11, fontWeight: "800", color: t.textFaint, letterSpacing: 0.6, marginBottom: 8 },
  muted: { fontSize: 13, color: t.textMuted },
  link: { fontSize: 13, fontWeight: "700", color: t.accent },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex1: { flex: 1 },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 16, overflow: "hidden" },
  cardResaltada: { borderColor: t.accent, borderWidth: 2 },
  foto: { width: "100%", height: 150 },
  titulo: { fontSize: 16, fontWeight: "800", color: t.textStrong },
  desc: { fontSize: 13.5, color: t.text, marginTop: 6, lineHeight: 19 },
  dato: { fontSize: 13, color: t.textMuted, lineHeight: 18 },
  pill: { fontSize: 12, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, overflow: "hidden" },
  filaHijo: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filaHijoFondo: { backgroundColor: t.surfaceSunken, padding: 10, borderRadius: 12 },
  hijoNombre: { fontSize: 13, fontWeight: "700", color: t.textStrong },
  btnPri: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 42, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  btnPriTxt: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnSec: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, minHeight: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  btnSecTxt: { color: SLATE[600], fontSize: 13, fontWeight: "700" },
  vacio: { borderWidth: 1.5, borderStyle: "dashed", borderColor: t.borderStrong, borderRadius: 16, padding: 28 },
});
