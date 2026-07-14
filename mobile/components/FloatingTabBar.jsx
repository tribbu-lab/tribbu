// Tab bar flotante (patrón A3 del sistema): píldora blanca con borde hairline
// y la única sombra de la pantalla (justificada: flota sobre el contenido).
// Íconos de trazo (@expo/vector-icons) — nada de emojis de UI. La tab activa
// se marca con una cápsula accentSoft. Reemplaza a la barra nativa vía la prop
// `tabBar` de <Tabs> (expo-router); las pantallas ocultas (href:null) no
// aparecen porque solo se renderiza la lista blanca de abajo.

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, BLUE, RADIUS, SHADOW, TYPE } from "@shared/tokens";

const t = THEMES.light;
const ACTIVE = BLUE[600];

// Espacio que cada pantalla debe reservar al final de su scroll para que el
// último ítem pase por detrás de la barra y quede alcanzable
// (alto de la píldora + safe area + respiro). Usar en contentContainerStyle.
export const TAB_BAR_SPACE = 112;

// "Recordatorios" se abrevia a "Avisos" solo en la barra (la pantalla conserva
// su nombre completo): 5 slots de ~66pt no soportan 13 caracteres con el
// escalado de fuente del sistema.
const TABS = [
  { name: "muro", label: "Inicio", icon: "home-outline" },
  { name: "calendario", label: "Calendario", icon: "calendar-month-outline" },
  { name: "cumples", label: "Cumpleaños", icon: "cake-variant-outline" },
  { name: "recordatorios", label: "Avisos", icon: "pin-outline" },
  { name: "mas", label: "Más", icon: "menu" },
];

export function FloatingTabBar({ state, navigation, badge = 0 }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const idx = state.routes.findIndex((r) => r.name === tab.name);
          if (idx === -1) return null;
          const route = state.routes[idx];
          const focused = state.index === idx;

          const onPress = () => {
            const ev = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !ev.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              style={[styles.item, focused && styles.itemOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
            >
              <View>
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={21}
                  color={focused ? ACTIVE : t.textFaint}
                />
                {tab.name === "recordatorios" && badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt} maxFontSizeMultiplier={1.1}>
                      {badge > 9 ? "9+" : badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              {/* El escalado de accesibilidad se limita a ×1.1: con más, las
                  etiquetas desbordan su slot y se truncan. */}
              <Text style={[styles.lbl, focused && styles.lblOn]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Overlay real: la barra flota sobre el contenido (que scrollea por detrás);
  // el wrapper es transparente y no captura toques fuera de la píldora.
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    backgroundColor: "transparent",
  },
  bar: {
    flexDirection: "row",
    backgroundColor: t.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: t.border,
    padding: 6,
    ...SHADOW.raised,
    shadowOpacity: 0.1,
  },
  item: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: RADIUS.full,
    paddingVertical: 6,
  },
  itemOn: { backgroundColor: t.accentSoft },
  lbl: { fontSize: 9.5, fontWeight: "600", color: t.textFaint },
  lblOn: { color: ACTIVE, fontWeight: "800" },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 15,
    paddingHorizontal: 3,
    borderRadius: RADIUS.full,
    backgroundColor: t.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: { ...TYPE.pill, fontSize: 9, color: t.textInverse, lineHeight: 13 },
});
