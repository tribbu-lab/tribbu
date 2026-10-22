// Super Admin — pila propia (no las tabs de curso). Header con logo + logout
// sobre la consola completa (SuperAdmin), que gestiona usuarios, cursos,
// maestros, alumnos, códigos, horarios, uniformes, alertas y menú.

import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { SuperAdmin } from "../../features/superadmin";
import { useMensajesNoLeidos } from "../../lib/useMensajesNoLeidos";
import { useNotificationRouting } from "../../push/useNotificationRouting";
import { ANCHO_MAX_CONTENIDO, columnaCentrada } from "../../lib/layout";

export default function SuperHome() {
  const insets = useSafeAreaInsets();
  const { usuario } = useSession();
  // Canal Realtime de mensajes: la bandeja de soporte y Ayuda y soporte se
  // actualizan en vivo (sin badge en el panel).
  useMensajesNoLeidos(usuario?.id ?? null, { contar: false });
  // Tocar un push abre la sección del panel (no las tabs de la familia).
  useNotificationRouting(true, { panel: true });

  return (
    <View style={styles.screen}>
      {/* Fondo de borde a borde; en tablet/plegable el contenido va en la
          columna centrada (lib/layout), con los insets laterales en horizontal. */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingLeft: 20 + insets.left, paddingRight: 20 + insets.right }]}>
        <View style={styles.headerFila}>
          <Text style={styles.logo}>
            tribbu<Text style={styles.dot}>.</Text>
          </Text>
          {/* Cerrar sesión está en el panel → Mi cuenta, como en la app de la familia. */}
        </View>
      </View>
      <View style={[styles.flex1, { paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={styles.columna}>
          <SuperAdmin />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  header: {
    backgroundColor: T.primary,
    paddingBottom: 14,
  },
  headerFila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: ANCHO_MAX_CONTENIDO - 40,
    alignSelf: "center",
  },
  flex1: { flex: 1 },
  columna: { flex: 1, ...columnaCentrada },
  logo: { fontSize: 22, fontWeight: "900", color: "white", letterSpacing: -1, fontFamily: Platform.select({ ios: "Georgia", default: "serif" }) },
  dot: { color: T.accent },
  salirBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  salirTxt: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
});
