// mobile/components/Lecturas.jsx — puerto RN de src/components/Lecturas.jsx.
// Chip "👁 5 de 40 leyeron" + Sheet con quién falta y quién leyó.
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { Sheet } from "./Sheet";

const t = THEMES.light;

export function ChipLecturas({ filas, onPress }) {
  if (!filas?.length) return null;
  const leyeron = filas.filter((f) => f.leido_en).length;
  const todos = leyeron === filas.length;
  return (
    <Pressable onPress={onPress} hitSlop={6} style={[styles.chip, todos && styles.chipOk]} accessibilityLabel="Ver quién lo leyó">
      <Text style={[styles.chipTxt, todos && styles.chipTxtOk]}>
        👁 {leyeron} de {filas.length} leyeron
      </Text>
    </Pressable>
  );
}

const fmtCuando = (iso) =>
  new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function LecturasSheet({ visible, titulo, filas, onClose }) {
  const lista = filas || [];
  const faltan = lista.filter((f) => !f.leido_en);
  const leyeron = lista.filter((f) => f.leido_en).sort((a, b) => (a.leido_en < b.leido_en ? 1 : -1));
  const sinApp = faltan.filter((f) => !f.tiene_app).length;
  const persona = (f) => (
    <View key={`${f.recordatorio_id}-${f.usuario_id}`} style={styles.persona}>
      <View style={styles.flex1}>
        <Text style={styles.nombre}>{[f.nombre, f.apellido].filter(Boolean).join(" ")}</Text>
        {f.hijos ? <Text style={styles.hijos}>Familia de {f.hijos}</Text> : null}
      </View>
      {f.leido_en ? (
        <Text style={styles.cuando}>{fmtCuando(f.leido_en)}</Text>
      ) : !f.tiene_app ? (
        <View style={styles.sinApp}>
          <Text style={styles.sinAppTxt}>Sin app</Text>
        </View>
      ) : null}
    </View>
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="¿Quién lo leyó?">
      {titulo ? (
        <Text style={styles.titulo} numberOfLines={2}>
          {titulo}
        </Text>
      ) : null}
      <Text style={styles.resumen}>
        {leyeron.length} de {lista.length} familias lo leyeron
        {sinApp > 0 ? <Text style={styles.resumenSinApp}> · {sinApp} de las que faltan no tienen la app</Text> : null}
      </Text>
      <ScrollView style={styles.lista}>
        {faltan.length ? <Text style={styles.label}>Faltan ({faltan.length})</Text> : null}
        {faltan.map(persona)}
        {leyeron.length ? <Text style={[styles.label, styles.labelSep]}>Leyeron ({leyeron.length})</Text> : null}
        {leyeron.map(persona)}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.sm, backgroundColor: "#F1F5F9" },
  chipOk: { backgroundColor: "#F0FDF4" },
  chipTxt: { fontSize: 11, fontWeight: "700", color: "#475569" },
  chipTxtOk: { color: "#047857" },
  titulo: { fontSize: 12, color: t.textMuted, marginBottom: SPACE.sm },
  resumen: { fontSize: 13, fontWeight: "700", color: t.text, marginBottom: SPACE.sm },
  resumenSinApp: { fontWeight: "500", color: "#B45309" },
  lista: { maxHeight: 420 },
  label: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, color: t.textFaint, textTransform: "uppercase", marginBottom: 2 },
  labelSep: { marginTop: SPACE.md },
  persona: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  flex1: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 14, fontWeight: "600", color: t.text },
  hijos: { fontSize: 11, color: t.textFaint },
  cuando: { fontSize: 11, color: t.textMuted },
  sinApp: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: "#FFFBEB" },
  sinAppTxt: { fontSize: 10, fontWeight: "700", color: "#B45309" },
});
