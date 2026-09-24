// Sheet — el patrón de modal del sistema (CRUD admin, pickers, detalle).
// position="bottom" (default): hoja deslizante con esquinas superiores
// redondeadas; position="center": diálogo centrado. Overlay tocable = cerrar.
// Para listas largas adentro, usar FlatList propia (el Sheet no scrollea solo).
// Un ScrollView de formulario adentro va con flexShrink: 1 (no maxHeight fijo):
// así se achica con la hoja cuando abre el teclado y se llega al botón final.

import { Modal, View, Text, Pressable, KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TYPE, RADIUS, SPACE, MIN_TOUCH, SHADOW } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  // El velo va en el KeyboardAvoidingView: así también cubre la franja del
  // padding que deja el teclado (si no, ahí se veía la pantalla de atrás).
  kav: { flex: 1, backgroundColor: t.overlay },
  overlay: { flex: 1 },
  bottom: { justifyContent: "flex-end" },
  center: { justifyContent: "center", padding: SPACE.xl },
  card: {
    backgroundColor: t.surfaceRaised,
    padding: SPACE.lg,
    maxHeight: "88%",
    ...SHADOW.raised,
  },
  cardBottom: { borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  cardCenter: { borderRadius: RADIUS.xl },
  header: { flexDirection: "row", alignItems: "center", marginBottom: SPACE.md },
  title: { ...TYPE.h2, color: t.textStrong, flex: 1 },
  close: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center", marginRight: -SPACE.md },
  closeTxt: { fontSize: 18, color: t.textMuted },
}));

export function Sheet({ visible, onClose, title, children, position = "bottom", style }) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const bottom = position === "bottom";

  return (
    <Modal
      visible={visible}
      transparent
      animationType={bottom ? "slide" : "fade"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.kav}
        // También en Android: con edge-to-edge (Expo 54) adjustResize ya no achica
        // la ventana y el teclado tapaba los inputs. KAV mide cuánto tapa de
        // verdad, así que si el sistema sí redimensiona no suma padding de más.
        behavior="padding"
      >
        <Pressable style={[s.overlay, bottom ? s.bottom : s.center]} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={[
              s.card,
              bottom ? s.cardBottom : s.cardCenter,
              bottom && { paddingBottom: insets.bottom + SPACE.lg },
              style,
            ]}
          >
            {title || onClose ? (
              <View style={s.header}>
                <Text style={s.title}>{title}</Text>
                {onClose ? (
                  <Pressable onPress={onClose} style={s.close} hitSlop={4} accessibilityRole="button" accessibilityLabel="Cerrar">
                    <Text style={s.closeTxt}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {children}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
