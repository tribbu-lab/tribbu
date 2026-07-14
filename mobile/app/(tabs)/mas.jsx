// "Más" — accesos a las features secundarias y a la cuenta. Las de admin
// (Alumnos, Admin) solo aparecen si el item activo es Room Parent
// (rolEfectivo === "admin"). Las acciones de cuenta (cambiar contraseña /
// cerrar sesión) viven acá desde el patrón A3 (el header quedó solo con
// notificaciones + chip del hijo).

import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { CambiarPasswordModal } from "../../features/auth";

const t = THEMES.light;

const BASE = [
  { id: "comedor", label: "Comedor", emoji: "🍽️" },
  { id: "finanzas", label: "Colectas", emoji: "💳" },
  { id: "info", label: "Info Útil", emoji: "📋" },
  { id: "contacto", label: "Contacto", emoji: "📞" },
];
const ADMIN = [
  { id: "alumnos", label: "Alumnos", emoji: "🎒" },
  { id: "admin", label: "Admin", emoji: "⚙️" },
];

export default function MasScreen() {
  const router = useRouter();
  const { isAdmin, usuario, logout } = useSession();
  const [cambiarPass, setCambiarPass] = useState(false);
  const opciones = isAdmin ? [...BASE, ...ADMIN] : BASE;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Más</Text>
      <View style={styles.grid}>
        {opciones.map((o) => (
          <Pressable key={o.id} onPress={() => router.push(`/(tabs)/${o.id}`)} style={styles.tile}>
            <Text style={styles.tileEmoji}>{o.emoji}</Text>
            <Text style={styles.tileLabel}>{o.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Cuenta</Text>
      <View style={styles.card}>
        <Pressable onPress={() => setCambiarPass(true)} style={styles.crow}>
          <MaterialCommunityIcons name="key-outline" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Cambiar contraseña</Text>
            {usuario?.email ? <Text style={styles.crowMeta}>{usuario.email}</Text> : null}
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
        <Pressable onPress={logout} style={[styles.crow, styles.crowBorde]}>
          <MaterialCommunityIcons name="logout" size={19} color={t.danger} />
          <View style={styles.flex1}>
            <Text style={[styles.crowTitulo, { color: t.danger }]}>Cerrar sesión</Text>
          </View>
        </Pressable>
      </View>

      <CambiarPasswordModal visible={cambiarPass} onClose={() => setCambiarPass(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3, marginBottom: SPACE.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    minHeight: 96,
    backgroundColor: t.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: t.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: SPACE.lg,
  },
  tileEmoji: { fontSize: 30 },
  tileLabel: { fontSize: 13, fontWeight: "700", color: t.text },
  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  card: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
  },
  crow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 13, minHeight: 52 },
  crowBorde: { borderTopWidth: 1, borderTopColor: t.border },
  crowTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  crowMeta: { fontSize: 12, color: t.textMuted, marginTop: 1 },
});
