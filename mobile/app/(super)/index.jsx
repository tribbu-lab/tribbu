// Super Admin — pila propia (no las tabs de curso). Header con logo + logout
// sobre la consola completa (SuperAdmin), que gestiona usuarios, cursos,
// maestros, alumnos, códigos, horarios, uniformes, alertas y menú.

import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { SuperAdmin } from "../../features/superadmin";

export default function SuperHome() {
  const insets = useSafeAreaInsets();
  const { logout } = useSession();

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
      <SuperAdmin />
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
  logo: { fontSize: 22, fontWeight: "900", color: "white", letterSpacing: -1, fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) },
  dot: { color: T.accent },
  salirBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  salirTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
});
