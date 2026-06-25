// Muro / Inicio (puerto RN de src/features/muro). Feed del curso: alerta activa,
// menú de hoy, recordatorios no leídos, colectas pendientes, eventos próximos y
// próximos cumpleaños. Deep-links a Calendario/Colectas/Cumpleaños. El admin
// puede publicar/descartar la alerta del curso.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, Modal, TextInput, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { fmtNombre } from "@shared/helpers";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { Spinner } from "../../components/Spinner";

const TIPO_CONFIG = {
  cumple: { emoji: "🎂", color: "#EC4899", bg: "#FDF2F8" },
  festejo: { emoji: "🎉", color: "#F59E0B", bg: "#FFFBEB" },
  paseo: { emoji: "🚌", color: "#3B82F6", bg: "#EFF6FF" },
  acto: { emoji: "🎭", color: "#8B5CF6", bg: "#F5F3FF" },
  dia_especial: { emoji: "⭐", color: "#10B981", bg: "#F0FDF4" },
  comunicado: { emoji: "📢", color: "#F97316", bg: "#FFF7ED" },
  feriado: { emoji: "🚩", color: "#EF4444", bg: "#FEF2F2" },
  vacaciones: { emoji: "🏖️", color: "#06B6D4", bg: "#ECFEFF" },
};

const diasLabel = (dias) =>
  dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : dias < 0 ? "Pasado" : `${dias}d`;

const fmtFechaCorta = (s) =>
  new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" });

export function Muro() {
  const router = useRouter();
  const { cursoId, cursoNombre, isAdmin, usuario, misHijos } = useSession();
  const userId = usuario?.id ?? null;
  const userName = usuario?.nombre?.split(" ")[0] || "";

  const [datos, setDatos] = useState(null);
  const [leidosMuro, setLeidosMuro] = useState(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [alertaModal, setAlertaModal] = useState(false);

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

    const [alerta, menu, recordatorios, cuotas, hijosData, maestrosData, eventosData, leidosData] =
      await Promise.all([
        supabase.from("alertas").select("*").eq("curso_id", cursoId).eq("activa", true).order("creado_en", { ascending: false }).limit(1),
        supabase.from("menu").select("*").eq("fecha", fechaHoy).maybeSingle(),
        supabase.from("recordatorios").select("*").eq("curso_id", cursoId),
        supabase.from("colectas").select("*").eq("curso_id", cursoId),
        supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id", cursoId),
        supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id", cursoId),
        supabase.from("eventos").select("*").eq("curso_id", cursoId).gte("fecha", fechaHoy).lte("fecha", fecha15).order("fecha"),
        userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId) : Promise.resolve({ data: [] }),
      ]);

    const nextBday = (fecha) => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const d = new Date(fecha + "T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
      return Math.round((next - hoy) / 86400000);
    };

    const bdayList = [
      ...(hijosData.data || []).filter((a) => a.fecha_nacimiento).map((a) => ({
        id: `a-${a.id}`,
        nombre: fmtNombre(a),
        tipo: "Alumno",
        fecha_nacimiento: a.fecha_nacimiento,
      })),
      ...(maestrosData.data || []).filter((m) => m.fecha_nacimiento).map((m) => ({
        id: `m-${m.id}`,
        nombre: m.nombre,
        tipo: "Maestro",
        fecha_nacimiento: m.fecha_nacimiento,
      })),
    ]
      .filter((a) => nextBday(a.fecha_nacimiento) <= 15)
      .sort((a, b) => nextBday(a.fecha_nacimiento) - nextBday(b.fecha_nacimiento));

    const leidosIds = new Set((leidosData.data || []).map((l) => l.recordatorio_id));
    setLeidosMuro(leidosIds);

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

    setDatos({
      alerta: alerta.data?.[0] || null,
      menu: menu.data || null,
      recordatorios: recsNoLeidos,
      bdayList,
      colectasPend,
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
    setLeidosMuro((p) => new Set([...p, recId]));
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

  if (!datos) return <Spinner />;

  const recsVisibles = datos.recordatorios.filter(
    (r) => !r.tipo || r.tipo === "recordatorio" || r.tipo === "general"
  );
  const vacio =
    !datos.alerta && !datos.menu && !recsVisibles.length && !datos.colectasPend.length && !datos.eventos.length;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.hello}>Hola{userName ? `, ${userName}` : ""} 👋</Text>
      <Text style={styles.date}>{hoyLabel}</Text>

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

      {datos.menu ? (
        <View style={styles.menu}>
          <Text style={styles.menuEmoji}>🍽️</Text>
          <View style={styles.flex1}>
            <Text style={styles.menuLabel}>MENÚ DE HOY</Text>
            <Text style={styles.menuTxt}>
              {[datos.menu.entrada, datos.menu.plato, datos.menu.plato2, datos.menu.acompanamiento, datos.menu.postre, datos.menu.postre2]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        </View>
      ) : null}

      {recsVisibles.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Recordatorios</Text>
          {recsVisibles.map((r) => {
            const prioColor = { alta: "#EF4444", media: "#F59E0B", baja: "#10B981" }[r.prioridad || "media"];
            return (
              <View key={r.id} style={[styles.row, { borderLeftColor: r.urgente ? "#EF4444" : prioColor }]}>
                <View style={styles.flex1}>
                  <Text style={[styles.rowTitle, r.urgente && styles.bold]}>{r.texto}</Text>
                  {r.fecha ? <Text style={styles.rowMeta}>{fmtFechaCorta(r.fecha)}</Text> : null}
                </View>
                <Pressable onPress={() => marcarLeidoMuro(r.id)} style={styles.leidoBtn}>
                  <Text style={styles.leidoTxt}>Leído</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : null}

      {datos.colectasPend.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Pendiente de pago</Text>
          {datos.colectasPend.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push("/(tabs)/finanzas")}
              style={[styles.row, { borderLeftColor: "#F59E0B" }]}
            >
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>{c.titulo}</Text>
                {c.monto_sugerido ? (
                  <Text style={styles.rowMeta}>
                    {(c.moneda || "$")} {Number(c.monto_sugerido).toLocaleString("es-AR")}
                  </Text>
                ) : null}
              </View>
              <View style={styles.pendTag}>
                <Text style={styles.pendTagTxt}>Pendiente</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {datos.eventos.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Eventos del mes</Text>
          {datos.eventos.map((e) => {
            const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
            const hoyD = new Date();
            hoyD.setHours(0, 0, 0, 0);
            const dias = Math.round((new Date(e.fecha + "T00:00:00") - hoyD) / 86400000);
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push("/(tabs)/calendario")}
                style={[styles.card, { borderLeftColor: cfg.color }]}
              >
                <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
                  <Text style={styles.iconBoxTxt}>{cfg.emoji}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowTitle}>{e.titulo}</Text>
                  <Text style={styles.rowMeta}>
                    {fmtFechaCorta(e.fecha)}
                    {e.lugar ? ` · 📍${e.lugar}` : ""}
                  </Text>
                </View>
                <View style={styles.diasTag}>
                  <Text style={styles.diasTagTxt}>{diasLabel(dias)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {vacio ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>Todo tranquilo por acá</Text>
          <Text style={styles.emptyTxt}>
            El Room Parent publicará los avisos, eventos y novedades del curso acá.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Próximos cumpleaños</Text>
      {datos.bdayList.length === 0 ? (
        <Text style={styles.noBday}>Sin cumpleaños registrados</Text>
      ) : (
        datos.bdayList.slice(0, 3).map((a) => {
          const hoy = new Date();
          hoy.setHours(0, 0, 0, 0);
          const d = new Date(a.fecha_nacimiento + "T00:00:00");
          let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
          if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
          const dias = Math.round((next - hoy) / 86400000);
          const isAlumno = a.tipo === "Alumno";
          return (
            <Pressable key={a.id} onPress={() => router.push("/(tabs)/cumples")} style={styles.card}>
              <View style={styles.flex1}>
                <Text style={styles.rowTitle}>{a.nombre}</Text>
                <View style={styles.bdayMeta}>
                  <View style={[styles.miniTag, { backgroundColor: isAlumno ? "#EFF6FF" : "#F5F3FF" }]}>
                    <Text style={[styles.miniTagTxt, { color: isAlumno ? "#3B82F6" : "#8B5CF6" }]}>
                      {isAlumno ? "🎒 Alumno" : "👨‍🏫 Maestro"}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {new Date(a.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                    })}
                  </Text>
                </View>
              </View>
              <View style={styles.diasTag}>
                <Text style={styles.diasTagTxt}>{diasLabel(dias)}</Text>
              </View>
            </Pressable>
          );
        })
      )}

      <AlertaModal visible={alertaModal} onClose={() => setAlertaModal(false)} onEnviar={enviarAlerta} />
    </ScrollView>
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
            placeholderTextColor="#94A3B8"
            multiline
            style={styles.modalInput}
          />
          <View style={styles.modalBtns}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => msg.trim() && onEnviar(msg.trim())}
              style={styles.saveBtn}
            >
              <Text style={styles.saveTxt}>Enviar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 32 },
  flex1: { flex: 1 },
  bold: { fontWeight: "700" },
  hello: { fontSize: 22, fontWeight: "900", color: T.text },
  date: { fontSize: 13, color: "#94A3B8", textTransform: "capitalize", marginBottom: 16 },
  alertaCta: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FCA5A5",
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  alertaCtaTxt: { color: "#EF4444", fontSize: 13, fontWeight: "700" },
  alerta: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#DC2626",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  alertaEmoji: { fontSize: 22 },
  alertaMeta: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 3 },
  alertaMsg: { fontSize: 13, fontWeight: "700", color: "white", lineHeight: 19 },
  alertaClose: { width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  alertaCloseTxt: { color: "white", fontSize: 14 },
  menu: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  menuEmoji: { fontSize: 20 },
  menuLabel: { fontSize: 9, fontWeight: "700", color: "#D97706", letterSpacing: 0.5, marginBottom: 3 },
  menuTxt: { fontSize: 12, color: T.text, lineHeight: 19 },
  section: { marginBottom: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 7,
  },
  rowTitle: { fontSize: 13, fontWeight: "600", color: T.text },
  rowMeta: { fontSize: 11, color: "#94A3B8", marginTop: 3 },
  leidoBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
  },
  leidoTxt: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  pendTag: { backgroundColor: "#FFFBEB", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  pendTagTxt: { fontSize: 11, fontWeight: "700", color: "#F59E0B" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "white",
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  iconBoxTxt: { fontSize: 20 },
  diasTag: { backgroundColor: "#F1F5F9", borderRadius: 12, paddingVertical: 3, paddingHorizontal: 8 },
  diasTagTxt: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  bdayMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  miniTag: { borderRadius: 20, paddingVertical: 2, paddingHorizontal: 7 },
  miniTagTxt: { fontSize: 10, fontWeight: "700" },
  noBday: { fontSize: 12, color: "#94A3B8", textAlign: "center", paddingVertical: 16 },
  empty: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "white",
    borderRadius: 16,
    marginBottom: 14,
  },
  emptyEmoji: { fontSize: 32, marginBottom: 10 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: T.text, marginBottom: 4 },
  emptyTxt: { fontSize: 13, color: "#94A3B8", textAlign: "center", lineHeight: 19 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: "white", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: T.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: "#94A3B8", marginBottom: 14 },
  modalInput: {
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    padding: 12,
    fontSize: 14,
    color: T.text,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  modalBtns: { flexDirection: "row", gap: 8 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "white", fontSize: 13, fontWeight: "700" },
});
