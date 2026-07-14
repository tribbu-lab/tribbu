// Muro / Inicio — patrón A3 del sistema de diseño (ver mobile/DESIGN_SYSTEM.md
// y mobile/design-alternatives.html §A3). Tres bloques, en orden de urgencia:
//   1. Pendientes: carrusel de cards accionables (recordatorios sin leer,
//      colectas sin pagar, invitaciones sin responder) con empty state punteado.
//   2. Próximos 15 días: agenda unificada (eventos + cumpleaños por proximidad)
//      con countdown por urgencia (≤3 lleno · ≤7 teñido · resto neutro).
//   3. Comedor: menú de hoy o el próximo día con servicio.
// El admin conserva la alerta del curso (banner + publicar). Deep-links:
// colecta → Finanzas (openColecta), evento → Calendario (openFecha), resto → tab.

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { fmtNombre } from "@shared/helpers";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { SkeletonList } from "../../components/Skeleton";

const t = THEMES.light;

const TIPO_CONFIG = {
  cumple: { emoji: "🎂" },
  festejo: { emoji: "🎉" },
  paseo: { emoji: "🚌" },
  acto: { emoji: "🎭" },
  dia_especial: { emoji: "⭐" },
  comunicado: { emoji: "📢" },
  feriado: { emoji: "🚩" },
  vacaciones: { emoji: "🏖️" },
};

const CARD_W = 272;
const CARD_GAP = 10;

const fmtFechaCorta = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" });

const fmtDiaMesCorto = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }).replace(".", "");

const diasHasta = (fechaStr) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(fechaStr + "T00:00:00") - hoy) / 86400000);
};

// Countdown con urgencia (firma de la dirección A): ≤3 lleno, ≤7 teñido, resto neutro.
function DiasChip({ dias, prefijo = false }) {
  const label =
    dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : prefijo ? `en ${dias} días` : `${dias} días`;
  const nivel = dias <= 3 ? "hot" : dias <= 7 ? "soon" : "later";
  return (
    <View style={[styles.chip, styles[`chip_${nivel}`]]}>
      <Text style={[styles.chipTxt, styles[`chipTxt_${nivel}`]]}>{label}</Text>
    </View>
  );
}

export function Muro() {
  const router = useRouter();
  const { cursoId, cursoNombre, isAdmin, usuario, misHijos } = useSession();
  const userId = usuario?.id ?? null;
  const userName = usuario?.nombre?.split(" ")[0] || "";

  const [datos, setDatos] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [alertaModal, setAlertaModal] = useState(false);
  const [dotIdx, setDotIdx] = useState(0);

  const hoyLabel = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const fechaHoy = new Date().toISOString().split("T")[0];
    const fecha15 = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const misHijosIds = (misHijos || []).filter((h) => h && typeof h === "string");

    const [
      alerta,
      menu,
      menuProx,
      recordatorios,
      cuotas,
      hijosData,
      maestrosData,
      eventosData,
      leidosData,
      invitacionesData,
    ] = await Promise.all([
      supabase.from("alertas").select("*").eq("curso_id", cursoId).eq("activa", true).order("creado_en", { ascending: false }).limit(1),
      supabase.from("menu").select("*").eq("fecha", fechaHoy).maybeSingle(),
      supabase.from("menu").select("*").gt("fecha", fechaHoy).order("fecha").limit(1),
      supabase.from("recordatorios").select("*").eq("curso_id", cursoId),
      supabase.from("colectas").select("*").eq("curso_id", cursoId),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id", cursoId),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id", cursoId),
      supabase.from("eventos").select("*").eq("curso_id", cursoId).gte("fecha", fechaHoy).lte("fecha", fecha15).order("fecha"),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId) : Promise.resolve({ data: [] }),
      userId && misHijosIds.length
        ? supabase
            .from("evento_asistencia")
            .select("id, asiste, alumno_invitado_id, evento:evento_id(id,titulo,fecha,tipo)")
            .in("alumno_invitado_id", misHijosIds)
            .eq("asiste", "pendiente")
        : Promise.resolve({ data: [] }),
    ]);

    // Próxima ocurrencia de un cumpleaños: días restantes + fecha concreta.
    const nextBday = (fecha) => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const d = new Date(fecha + "T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
      const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      return { dias: Math.round((next - hoy) / 86400000), fecha: iso };
    };

    const bdayList = [
      ...(hijosData.data || []).filter((a) => a.fecha_nacimiento).map((a) => ({
        id: `a-${a.id}`,
        esMio: misHijosIds.includes(a.id),
        nombre: fmtNombre(a),
        tipo: "Alumno",
        ...nextBday(a.fecha_nacimiento),
      })),
      ...(maestrosData.data || []).filter((m) => m.fecha_nacimiento).map((m) => ({
        id: `m-${m.id}`,
        esMio: false,
        nombre: m.nombre,
        tipo: "Maestro",
        ...nextBday(m.fecha_nacimiento),
      })),
    ]
      .filter((a) => a.dias <= 15)
      .sort((a, b) => a.dias - b.dias);

    const leidosIds = new Set((leidosData.data || []).map((l) => l.recordatorio_id));

    const recsNoLeidos = (recordatorios.data || [])
      .filter((r) => {
        if (r.tipo === "regalo_cumple" || r.tipo === "colecta_vence") return false;
        if (leidosIds.has(r.id)) return false;
        if (r.para_usuario_id && r.para_usuario_id !== userId) return false;
        if (r.fecha && r.fecha < fechaHoy) return false;
        if (r.fecha && r.fecha > fecha15) return false;
        return true;
      })
      .sort((a, b) => (a.fecha && b.fecha ? a.fecha.localeCompare(b.fecha) : a.fecha ? -1 : b.fecha ? 1 : 0));

    const hijosDelCurso = (hijosData.data || []).map((h) => h.id);
    const misHijosEnCurso = misHijosIds.filter((hid) => hijosDelCurso.includes(hid));
    let colectasPend = [];
    if (misHijosEnCurso.length && (cuotas.data || []).length) {
      const colIds = (cuotas.data || [])
        .filter((c) => c.activa && (!c.vencimiento || c.vencimiento <= fecha15))
        .map((c) => c.id);
      const { data: pagosData } = colIds.length
        ? await supabase.from("colecta_pagos").select("*").in("colecta_id", colIds).in("alumno_id", misHijosEnCurso)
        : { data: [] };
      const pagados = new Set((pagosData || []).filter((p) => p.estado === "pagado").map((p) => `${p.colecta_id}-${p.alumno_id}`));
      colectasPend = (cuotas.data || []).filter(
        (c) => c.activa && (!c.vencimiento || c.vencimiento <= fecha15) && misHijosEnCurso.some((hid) => !pagados.has(`${c.id}-${hid}`))
      );
    }

    // Invitaciones a festejos futuros sin responder (una card por festejo).
    const invitaciones = [];
    const vistos = new Set();
    for (const inv of invitacionesData.data || []) {
      const ev = inv.evento;
      if (!ev || !ev.fecha || ev.fecha < fechaHoy || vistos.has(ev.id)) continue;
      vistos.add(ev.id);
      invitaciones.push(ev);
    }

    setDatos({
      alerta: alerta.data?.[0] || null,
      menu: menu.data || null,
      menuProx: menuProx.data?.[0] || null,
      recordatorios: recsNoLeidos,
      bdayList,
      colectasPend,
      invitaciones,
      eventos: (eventosData.data || []).filter((e) => e.tipo !== "cumple" && e.tipo !== "festejo"),
    });
  }, [cursoId, userId, misHijos]);

  useEffect(() => {
    setDatos(null);
    cargar();
  }, [cargar]);

  const onRefresh = async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  };

  const marcarLeidoMuro = async (recId) => {
    if (!userId) return;
    await supabase
      .from("recordatorio_leidos")
      .upsert({ recordatorio_id: recId, usuario_id: userId }, { onConflict: "recordatorio_id,usuario_id" });
    setDatos((d) => (d ? { ...d, recordatorios: d.recordatorios.filter((r) => r.id !== recId) } : d));
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({ activa: false }).eq("curso_id", cursoId);
    await supabase.from("alertas").insert({ curso_id: cursoId, mensaje: msg, hora: "Ahora", activa: true });
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type: "alerta", payload: { mensaje: msg, userIds } });
    setAlertaModal(false);
    cargar();
  };

  const dismissAlerta = async () => {
    if (datos?.alerta) {
      await supabase.from("alertas").update({ activa: false }).eq("id", datos.alerta.id);
      cargar();
    }
  };

  // Cargando: el saludo es inmediato (dato local) y la lista llega como skeleton.
  if (!datos)
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.eyebrow}>{hoyLabel.replace(",", "")}</Text>
        <Text style={styles.hello}>Hola{userName ? `, ${userName}` : ""}</Text>
        <Text style={styles.label}>Pendientes</Text>
        <SkeletonList rows={3} />
      </View>
    );

  const recsVisibles = datos.recordatorios.filter(
    (r) => !r.tipo || r.tipo === "recordatorio" || r.tipo === "general"
  );

  // ── Pendientes: cards accionables del carrusel ──
  const pendientes = [
    ...recsVisibles.map((r) => ({
      key: `r-${r.id}`,
      tipo: "Recordatorio",
      dot: t.danger,
      titulo: r.texto,
      meta: `Sin leer${r.fecha ? ` · ${fmtFechaCorta(r.fecha)}` : ""}`,
      accion: "Marcar leído",
      onAccion: () => marcarLeidoMuro(r.id),
      derecha: r.fecha ? { dias: diasHasta(r.fecha) } : null,
    })),
    ...datos.colectasPend.map((c) => ({
      key: `c-${c.id}`,
      tipo: "Colecta",
      dot: T.yellow,
      titulo: c.titulo,
      meta: "Tu aporte todavía no está registrado",
      accion: "Registrar pago",
      onAccion: () => router.push({ pathname: "/(tabs)/finanzas", params: { openColecta: String(c.id) } }),
      derecha: c.monto_sugerido
        ? { monto: `${c.moneda || "$"} ${Number(c.monto_sugerido).toLocaleString("es-AR")}` }
        : null,
    })),
    ...datos.invitaciones.map((ev) => ({
      key: `i-${ev.id}`,
      tipo: "Invitación",
      dot: T.green,
      titulo: ev.titulo,
      meta: "Falta confirmar asistencia",
      accion: "Responder",
      onAccion: () => router.push({ pathname: "/(tabs)/cumples", params: { openFestejo: String(ev.id) } }),
      derecha: { fecha: fmtDiaMesCorto(ev.fecha) },
    })),
  ];

  // ── Agenda unificada: eventos + cumpleaños por proximidad ──
  const agenda = [
    ...datos.eventos.map((e) => ({
      key: `e-${e.id}`,
      fecha: e.fecha,
      dias: diasHasta(e.fecha),
      titulo: `${e.titulo} ${(TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto).emoji}`,
      meta: e.lugar ? `📍 ${e.lugar}` : "Todo el curso",
      onPress: () => router.push({ pathname: "/(tabs)/calendario", params: { openFecha: e.fecha } }),
    })),
    ...datos.bdayList.map((b) => ({
      key: b.id,
      fecha: b.fecha,
      dias: b.dias,
      titulo: `Cumple de ${b.nombre} 🎂`,
      meta: b.esMio ? `${b.tipo} · tu hijo/a` : b.tipo,
      onPress: () => router.push("/(tabs)/cumples"),
    })),
  ]
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 6);

  const platoProx =
    datos.menuProx &&
    ([datos.menuProx.plato, datos.menuProx.plato2, datos.menuProx.entrada, datos.menuProx.acompanamiento].filter(Boolean)[0] ||
      "menú publicado");
  const diaProx =
    datos.menuProx &&
    new Date(datos.menuProx.fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric" });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.eyebrow}>{hoyLabel.replace(",", "")}</Text>
      <Text style={styles.hello}>Hola{userName ? `, ${userName}` : ""}</Text>

      {isAdmin ? (
        <Pressable onPress={() => setAlertaModal(true)} style={styles.alertaCta}>
          <Text style={styles.alertaCtaTxt}>🚨 Publicar alerta al curso</Text>
        </Pressable>
      ) : null}

      {datos.alerta ? (
        <View style={styles.alerta}>
          <Text style={styles.alertaEmoji}>🚨</Text>
          <View style={styles.flex1}>
            <Text style={styles.alertaMeta}>
              {cursoNombre} · {datos.alerta.hora}
            </Text>
            <Text style={styles.alertaMsg}>{datos.alerta.mensaje}</Text>
          </View>
          {isAdmin ? (
            <Pressable onPress={dismissAlerta} hitSlop={8} style={styles.alertaClose}>
              <Text style={styles.alertaCloseTxt}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── Pendientes ── */}
      <Text style={styles.label}>
        Pendientes{pendientes.length ? ` · ${pendientes.length}` : ""}
      </Text>
      {pendientes.length === 0 ? (
        <View style={styles.alDia}>
          <View style={styles.alDiaIcon}>
            <MaterialCommunityIcons name="check" size={19} color="#059669" />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.alDiaTitulo}>Estás al día ✨</Text>
            <Text style={styles.alDiaTxt}>
              No tenés pendientes. Cuando haya algo para resolver, aparece acá.
            </Text>
          </View>
        </View>
      ) : (
        <>
          <FlatList
            horizontal
            data={pendientes}
            keyExtractor={(p) => p.key}
            renderItem={({ item }) => <PendienteCard p={item} />}
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + CARD_GAP}
            decelerationRate="fast"
            onMomentumScrollEnd={(e) =>
              setDotIdx(Math.min(pendientes.length - 1, Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP))))
            }
            style={styles.carrusel}
            contentContainerStyle={styles.carruselContent}
          />
          {pendientes.length > 1 ? (
            <View style={styles.dots}>
              {pendientes.map((p, i) => (
                <View key={p.key} style={[styles.dot, i === dotIdx && styles.dotOn]} />
              ))}
            </View>
          ) : null}
        </>
      )}

      {/* ── Próximos 15 días ── */}
      <Text style={styles.label}>Próximos 15 días</Text>
      <View style={styles.card}>
        {agenda.length === 0 ? (
          <Text style={styles.agendaVacia}>Sin eventos ni cumpleaños en los próximos 15 días</Text>
        ) : (
          agenda.map((item, i) => {
            const f = new Date(item.fecha + "T00:00:00");
            const dow = f.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
            return (
              <Pressable key={item.key} onPress={item.onPress} style={[styles.arow, i > 0 && styles.arowBorde]}>
                <View style={styles.fechaCol}>
                  <Text style={styles.fechaDow}>{dow}</Text>
                  <Text style={styles.fechaNum}>{f.getDate()}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.arowTitulo} numberOfLines={1}>{item.titulo}</Text>
                  <Text style={styles.arowMeta} numberOfLines={1}>{item.meta}</Text>
                </View>
                <DiasChip dias={item.dias} />
              </Pressable>
            );
          })
        )}
        <Pressable onPress={() => router.push("/(tabs)/calendario")} style={styles.cardFooter}>
          <Text style={styles.cardFooterTxt}>Ver calendario completo</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={BLUE[600]} />
        </Pressable>
      </View>

      {/* ── Comedor ── */}
      {datos.menu || datos.menuProx ? (
        <>
          <Text style={styles.label}>Comedor</Text>
          <Pressable onPress={() => router.push("/(tabs)/comedor")} style={[styles.card, styles.comedor]}>
            <View style={styles.tile}>
              <Text style={styles.tileTxt}>🍽️</Text>
            </View>
            <View style={styles.flex1}>
              {datos.menu ? (
                <>
                  <Text style={styles.arowTitulo}>Menú de hoy</Text>
                  <Text style={styles.arowMeta} numberOfLines={2}>
                    {[datos.menu.entrada, datos.menu.plato, datos.menu.plato2, datos.menu.acompanamiento, datos.menu.postre, datos.menu.postre2]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.arowTitulo}>Hoy no hay servicio</Text>
                  <Text style={styles.arowMeta} numberOfLines={1}>
                    {diaProx ? `${diaProx.charAt(0).toUpperCase()}${diaProx.slice(1)}: ${platoProx}` : ""}
                  </Text>
                </>
              )}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
          </Pressable>
        </>
      ) : null}

      <AlertaModal visible={alertaModal} onClose={() => setAlertaModal(false)} onEnviar={enviarAlerta} />
    </ScrollView>
  );
}

// Card del carrusel de pendientes: tipo + título + vencimiento + acción primaria.
function PendienteCard({ p }) {
  return (
    <View style={styles.pcard}>
      <View style={styles.ptop}>
        <View style={[styles.pdot, { backgroundColor: p.dot }]} />
        <Text style={styles.ptipo}>{p.tipo}</Text>
      </View>
      <Text style={styles.ptitulo} numberOfLines={1}>{p.titulo}</Text>
      <Text style={styles.pmeta} numberOfLines={1}>{p.meta}</Text>
      <View style={styles.pact}>
        <Pressable onPress={p.onAccion} hitSlop={8} style={styles.hit36}>
          <Text style={styles.paccion}>{p.accion}</Text>
        </Pressable>
        {p.derecha?.dias != null ? (
          <DiasChip dias={p.derecha.dias} prefijo />
        ) : p.derecha?.monto ? (
          <Text style={styles.pmonto}>{p.derecha.monto}</Text>
        ) : p.derecha?.fecha ? (
          <View style={[styles.chip, styles.chip_later]}>
            <Text style={[styles.chipTxt, styles.chipTxt_later]}>{p.derecha.fecha}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AlertaModal({ visible, onClose, onEnviar }) {
  const [msg, setMsg] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Publicar alerta</Text>
          <Text style={styles.modalSub}>Se envía como push a toda la comunidad del curso.</Text>
          <TextInput
            value={msg}
            onChangeText={setMsg}
            placeholder="Ej: Mañana no hay clases"
            placeholderTextColor={t.placeholder}
            multiline
            style={styles.modalInput}
          />
          <View style={styles.modalBtns}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={() => msg.trim() && onEnviar(msg.trim())} style={styles.saveBtn}>
              <Text style={styles.saveTxt}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Estilos A3: sin sombras, borde hairline, radio 16, countdown protagonista.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },

  eyebrow: { ...TYPE.label, color: t.textFaint },
  hello: { fontSize: 21, fontWeight: "800", color: t.textStrong, marginTop: 6, letterSpacing: -0.3 },

  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.xl, marginBottom: SPACE.sm },

  // carrusel de pendientes
  carrusel: { marginHorizontal: -SPACE.lg },
  carruselContent: { paddingHorizontal: SPACE.lg, gap: CARD_GAP },
  pcard: {
    width: CARD_W,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    padding: 13,
  },
  ptop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 },
  pdot: { width: 7, height: 7, borderRadius: RADIUS.full },
  ptipo: { fontSize: 9.5, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase", color: t.textFaint },
  ptitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  pmeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  pact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 11 },
  paccion: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  pmonto: { ...TYPE.money, fontSize: 13, color: t.textStrong },
  hit36: { minHeight: 30, justifyContent: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 9 },
  dot: { width: 5, height: 5, borderRadius: RADIUS.full, backgroundColor: SLATE[300] },
  dotOn: { width: 14, backgroundColor: t.accent },

  // empty state de pendientes
  alDia: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    backgroundColor: t.surface,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: SLATE[200],
    borderRadius: RADIUS.xl,
    padding: SPACE.lg - 2,
  },
  alDiaIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: t.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  alDiaTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  alDiaTxt: { fontSize: 12, color: t.textMuted, marginTop: 2, lineHeight: 17 },

  // agenda unificada
  card: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
  },
  arow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 13 },
  arowBorde: { borderTopWidth: 1, borderTopColor: t.border },
  fechaCol: { width: 42, alignItems: "center" },
  fechaDow: { fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: t.textFaint },
  fechaNum: { fontSize: 17, fontWeight: "800", color: t.textStrong, fontVariant: ["tabular-nums"] },
  arowTitulo: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  arowMeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  agendaVacia: { fontSize: 12.5, color: t.textFaint, textAlign: "center", padding: SPACE.xl },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 13,
    borderTopWidth: 1,
    borderTopColor: t.border,
    minHeight: 44,
  },
  cardFooterTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },

  // countdown chips
  chip: { borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 10 },
  chipTxt: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  chip_hot: { backgroundColor: t.accent },
  chipTxt_hot: { color: t.onAccent },
  chip_soon: { backgroundColor: t.accentSoft },
  chipTxt_soon: { color: BLUE[600] },
  chip_later: { backgroundColor: SLATE[100] },
  chipTxt_later: { color: t.textMuted },

  // comedor
  comedor: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 13 },
  tile: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md + 1,
    backgroundColor: SLATE[100],
    alignItems: "center",
    justifyContent: "center",
  },
  tileTxt: { fontSize: 18 },

  // alerta del curso (se conserva del muro anterior)
  alertaCta: {
    minHeight: 44,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    backgroundColor: t.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.lg,
  },
  alertaCtaTxt: { color: t.danger, fontSize: 13, fontWeight: "700" },
  alerta: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#DC2626",
    borderRadius: RADIUS.lg,
    padding: 14,
    marginTop: SPACE.lg,
  },
  alertaEmoji: { fontSize: 22 },
  alertaMeta: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 3 },
  alertaMsg: { fontSize: 13, fontWeight: "700", color: t.textInverse, lineHeight: 19 },
  alertaClose: { width: 28, height: 28, borderRadius: RADIUS.sm, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  alertaCloseTxt: { color: t.textInverse, fontSize: 14 },

  // modal de alerta
  modalOverlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xxl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "900", color: t.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: t.textFaint, marginBottom: 14 },
  modalInput: {
    minHeight: 80,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surfaceSunken,
    padding: SPACE.md,
    fontSize: 14,
    color: t.text,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  modalBtns: { flexDirection: "row", gap: SPACE.sm },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textFaint, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
});
