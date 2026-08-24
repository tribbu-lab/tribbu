// Centro de notificaciones in-app (puerto RN de src/features/notificaciones).
// La lógica del hook es idéntica a la web; el panel se reescribe con Modal + FlatList.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { T } from "@shared/theme";

export function useNotificaciones({ cursoIds, userId, active }) {
  const [notifs, setNotifs] = useState([]);
  const [leidos, setLeidos] = useState(new Set());
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length || !userId) return;
    setCargando(true);
    const hoy = new Date().toISOString().split("T")[0];
    const [recs, leidosData, alertas] = await Promise.all([
      supabase
        .from("recordatorios")
        .select("*")
        .in("curso_id", cursoIds)
        .or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`)
        .or(`fecha.is.null,fecha.gte.${hoy}`)
        .order("fecha", { ascending: true, nullsFirst: false })
        .limit(30),
      supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId),
      supabase
        .from("alertas")
        .select("*")
        .in("curso_id", cursoIds)
        .eq("activa", true)
        .order("creado_en", { ascending: false })
        .limit(3),
    ]);

    setLeidos(new Set((leidosData.data || []).map((r) => r.recordatorio_id)));

    const alertasNotifs = (alertas.data || []).map((a) => ({
      id: `alerta-${a.id}`,
      _tipo: "alerta",
      texto: a.mensaje,
      urgente: true,
      creado_en: a.creado_en,
      curso_id: a.curso_id,
      emoji: "🚨",
    }));
    const recsNotifs = (recs.data || []).map((r) => ({ ...r, _tipo: "recordatorio" }));
    setNotifs([...alertasNotifs, ...recsNotifs]);
    setCargando(false);
  }, [cursoIds, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  useEffect(() => {
    if (active) cargar();
  }, [active, cargar]);

  const marcarLeido = useCallback(
    async (id) => {
      if (typeof id === "string" && id.startsWith("alerta-")) return;
      if (leidos.has(id)) return;
      setLeidos((p) => new Set([...p, id]));
      await supabase
        .from("recordatorio_leidos")
        .upsert({ recordatorio_id: id, usuario_id: userId }, { onConflict: "recordatorio_id,usuario_id" });
    },
    [leidos, userId]
  );

  const noLeidos = notifs.filter((n) => n._tipo === "alerta" || !leidos.has(n.id)).length;

  return { notifs, leidos, cargando, noLeidos, marcarLeido, recargar: cargar };
}

const PRIO = {
  alta: { c: "#EF4444", bg: "#FEF2F2" },
  media: { c: "#F59E0B", bg: "#FFFBEB" },
  baja: { c: "#10B981", bg: "#F0FDF4" },
};

const fmtRelativo = (fecha) => {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((d - hoy) / 86400000);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  if (dias < 0) return `hace ${Math.abs(dias)}d`;
  return `en ${dias}d`;
};

function NotifRow({ item, leido, tag, onPress }) {
  const esAlerta = item._tipo === "alerta";
  const prio = PRIO[item.prioridad || "media"];
  const relativo = item.fecha ? fmtRelativo(item.fecha) : null;
  const emoji =
    item.emoji ||
    (esAlerta
      ? "🚨"
      : item.tipo === "regalo_cumple"
      ? "🎁"
      : item.tipo === "colecta_vence"
      ? "💳"
      : "📌");

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      disabled={leido}
      style={[
        styles.notif,
        { borderLeftColor: esAlerta || item.urgente ? "#EF4444" : prio.c },
        esAlerta && styles.notifAlerta,
        leido && styles.notifLeido,
      ]}
    >
      <View style={styles.notifInner}>
        <Text style={styles.notifEmoji}>{emoji}</Text>
        <View style={styles.flex1}>
          <Text style={[styles.notifTxt, leido && styles.notifTxtLeido]}>{item.texto}</Text>
          <View style={styles.notifMeta}>
            {relativo ? (
              <View style={[styles.tag, { backgroundColor: prio.bg }]}>
                <Text style={[styles.tagTxt, { color: prio.c }]}>{relativo}</Text>
              </View>
            ) : null}
            {item.urgente && !esAlerta ? (
              <View style={[styles.tag, { backgroundColor: "#FEF2F2" }]}>
                <Text style={[styles.tagTxt, { color: "#EF4444" }]}>Urgente</Text>
              </View>
            ) : null}
            {tag ? (
              <View style={styles.hijoTag}>
                <View style={[styles.hijoDot, { backgroundColor: tag.color }]} />
                <Text style={styles.hijoTxt} numberOfLines={1}>{tag.nombre}</Text>
              </View>
            ) : null}
            {!leido && !esAlerta ? <View style={styles.dot} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function NotificacionesPanel({ visible, notifs, leidos, cargando, tagDeCurso, onMarcarLeido, onCerrar }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCerrar}>
      <Pressable style={styles.overlay} onPress={onCerrar}>
        <Pressable style={[styles.panel, { paddingTop: insets.top }]} onPress={() => {}}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Notificaciones</Text>
            <Pressable onPress={onCerrar} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {cargando ? (
            <Text style={styles.empty}>Cargando...</Text>
          ) : (
            <FlatList
              data={notifs}
              keyExtractor={(n) => String(n.id)}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <NotifRow
                  item={item}
                  leido={item._tipo !== "alerta" && leidos.has(item.id)}
                  tag={tagDeCurso ? tagDeCurso(item.curso_id) : null}
                  onPress={onMarcarLeido}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyEmoji}>🔔</Text>
                  <Text style={styles.emptyTitle}>Sin notificaciones</Text>
                  <Text style={styles.empty}>Acá vas a ver recordatorios y alertas del curso.</Text>
                </View>
              }
            />
          )}

          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.footerTxt}>Tocá una notificación para marcarla como leída</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.3)", flexDirection: "row", justifyContent: "flex-end" },
  panel: { width: "85%", maxWidth: 380, height: "100%", backgroundColor: "white" },
  panelHeader: {
    padding: 16,
    backgroundColor: T.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: { fontSize: 15, fontWeight: "800", color: "white" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: { color: "white", fontSize: 16 },
  list: { padding: 16 },
  flex1: { flex: 1 },
  notif: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
    backgroundColor: "white",
  },
  notifAlerta: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  notifLeido: { opacity: 0.6, backgroundColor: "#FAFAFA" },
  notifInner: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  notifEmoji: { fontSize: 18 },
  notifTxt: { fontSize: 13, fontWeight: "600", color: T.text, lineHeight: 19, marginBottom: 4 },
  notifTxtLeido: { fontWeight: "400", color: "#94A3B8" },
  notifMeta: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
  tag: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
  tagTxt: { fontSize: 10, fontWeight: "700" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.accent },
  hijoTag: { flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 130 },
  hijoDot: { width: 8, height: 8, borderRadius: 4 },
  hijoTxt: { fontSize: 10, fontWeight: "700", color: "#94A3B8" },
  emptyWrap: { alignItems: "center", paddingVertical: 40 },
  emptyEmoji: { fontSize: 32, marginBottom: 12 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: T.text, marginBottom: 4 },
  empty: { textAlign: "center", color: "#94A3B8", fontSize: 13, paddingVertical: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  footerTxt: { fontSize: 11, color: "#94A3B8", textAlign: "center" },
});
