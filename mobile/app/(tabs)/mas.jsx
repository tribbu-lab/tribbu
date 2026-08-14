// "Más" — accesos a las features secundarias y a la cuenta. Las de admin
// (Alumnos, Admin) solo aparecen si el item activo es Room Parent
// (rolEfectivo === "admin"). Las acciones de cuenta (cambiar contraseña /
// cerrar sesión) viven acá desde el patrón A3 (el header quedó solo con
// notificaciones + chip del hijo).

import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { CambiarPasswordModal } from "../../features/auth";
import { deleteMyAccount } from "../../lib/authAdmin";

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
  const [eliminando, setEliminando] = useState(false);
  const opciones = isAdmin ? [...BASE, ...ADMIN] : BASE;

  // Apple 5.1.1(v): la eliminación de cuenta debe poder iniciarse en la app.
  // Doble confirmación destructiva → Edge Function delete-account → signOut.
  const confirmarEliminar = () => {
    if (eliminando) return;
    Alert.alert(
      "Eliminar mi cuenta",
      "Se eliminarán tu cuenta y tus datos personales (accesos, confirmaciones y tokens de notificaciones). Los datos del curso no se ven afectados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "¿Estás seguro?",
              "Esta acción es permanente y no se puede deshacer.",
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar definitivamente", style: "destructive", onPress: eliminarCuenta },
              ],
            ),
        },
      ],
    );
  };

  const eliminarCuenta = async () => {
    setEliminando(true);
    try {
      await deleteMyAccount();
      // La cuenta ya no existe: signOut solo limpia la sesión local y el
      // gate de auth vuelve al login.
      try {
        await logout();
      } catch {
        // la sesión puede estar ya invalidada del lado del servidor
      }
    } catch (e) {
      Alert.alert("No se pudo eliminar la cuenta", e.message || "Probá de nuevo en unos minutos.");
      setEliminando(false);
    }
  };

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
        <Pressable onPress={confirmarEliminar} style={[styles.crow, styles.crowBorde]} disabled={eliminando}>
          <MaterialCommunityIcons name="account-remove-outline" size={19} color={t.danger} />
          <View style={styles.flex1}>
            <Text style={[styles.crowTitulo, { color: t.danger }]}>Eliminar mi cuenta</Text>
            <Text style={styles.crowMeta}>Borra tu cuenta y tus datos de forma permanente</Text>
          </View>
          {eliminando ? <ActivityIndicator size="small" color={t.danger} /> : null}
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
