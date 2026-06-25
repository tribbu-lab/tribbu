// Super Admin — pila propia (no las tabs de curso). El puerto completo de
// SuperAdmin (1.4k líneas: AlertasAdmin, HorariosAdmin, UniformesAdmin, cargas
// Excel) es trabajo de seguimiento; este milestone deja el flujo y el logout.

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";

export default function SuperHome() {
  const insets = useSafeAreaInsets();
  const { usuario, logout } = useSession();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.logo}>
          tribbu<Text style={styles.dot}>.</Text>
        </Text>
        <Pressable onPress={logout} style={styles.salirBtn} hitSlop={8}>
          <Text style={styles.salirTxt}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.emoji}>🛠️</Text>
        <Text style={styles.title}>Hola, {usuario?.nombre?.split(" ")[0]}</Text>
        <Text style={styles.note}>
          La consola de Super Admin se está portando a la app nativa. Mientras tanto, usá la
          versión web para gestionar cursos, alumnos, apoderados y horarios.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  header: {
    backgroundColor: T.primary,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { fontSize: 22, fontWeight: "900", color: "white", letterSpacing: -1 },
  dot: { color: T.accent },
  salirBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  salirTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "800", color: T.text, marginBottom: 8 },
  note: { fontSize: 14, color: "#94A3B8", textAlign: "center", lineHeight: 20 },
});
