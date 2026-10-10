// Docente (specs/mensajes.md): pila propia con solo Mensajes — chats con las
// familias de sus cursos + soporte. Sin "Mi acceso" ni las tabs de apoderado.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { THEMES, TYPE, SPACE } from "@shared/tokens";
import { useSession } from "../../context/Session";
import { Wordmark } from "../../components/Wordmark";
import { Mensajes } from "../../features/mensajes";
import { useMensajesNoLeidos, MensajesProvider } from "../../lib/useMensajesNoLeidos";

const dk = THEMES.dark;

export default function DocenteHome() {
  const insets = useSafeAreaInsets();
  const { usuario, logout } = useSession();
  const mensajes = useMensajesNoLeidos(usuario?.id ?? null);
  return (
    <MensajesProvider value={mensajes}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Wordmark size={TYPE.h1.fontSize} color={dk.textStrong} dotColor={dk.accent} letterSpacing={-1} />
          <View style={styles.derecha}>
            <Text style={styles.nombre} numberOfLines={1}>{usuario?.nombre} · Docente</Text>
            <Pressable onPress={logout} style={styles.salirBtn} hitSlop={8} accessibilityRole="button">
              <Text style={styles.salirTxt}>Salir</Text>
            </Pressable>
          </View>
        </View>
        <Mensajes esDocente />
      </View>
    </MensajesProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEMES.light.bg },
  header: { backgroundColor: dk.bg, paddingHorizontal: SPACE.lg, paddingBottom: SPACE.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  derecha: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, flexShrink: 1 },
  nombre: { color: dk.textMuted, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  salirBtn: { backgroundColor: dk.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  salirTxt: { color: dk.textMuted, fontSize: 12, fontWeight: "700" },
});
