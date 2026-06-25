// "Más" — accesos a las features secundarias. Las de admin (Alumnos, Admin) solo
// aparecen si el item activo es Room Parent (rolEfectivo === "admin").

import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";

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
  const { isAdmin } = useSession();
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text, marginBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47%",
    minHeight: 96,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  },
  tileEmoji: { fontSize: 30 },
  tileLabel: { fontSize: 13, fontWeight: "700", color: T.text },
});
