// Header persistente de la app (sobre las tabs), patrón A3: logo, campana con
// punto de no-leídas y chip del hijo activo (dot de color + nombre; tocar abre
// el selector de color). Con múltiples hijos/cursos, el selector horizontal se
// mantiene debajo. Las acciones de cuenta (contraseña / salir) viven en "Más".
// Superficie de marca fija en dark: se estila con THEMES.dark (igual que el login).

import { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, STATUS, TYPE, RADIUS, SPACE, MIN_TOUCH, HIJO_COLORS_CUSTOM } from "@shared/tokens";
import { useSession } from "../context/Session";
import { useNotificaciones, NotificacionesPanel } from "../features/notificaciones";

const dk = THEMES.dark; // superficie de marca fija (misma paleta que el login)

export function AppHeader() {
  const insets = useSafeAreaInsets();
  const {
    usuario,
    items,
    cursoIdx,
    setCursoIdx,
    cursoId,
    colorDeItem,
    setColorHijo,
  } = useSession();

  const [panelNotifs, setPanelNotifs] = useState(false);
  const [colorPickerItem, setColorPickerItem] = useState(null);

  const { notifs, leidos, cargando, noLeidos, marcarLeido, recargar } = useNotificaciones({
    cursoId,
    userId: usuario?.id ?? null,
    active: true,
  });

  const abrirNotifs = () => {
    recargar();
    setPanelNotifs(true);
  };

  const unicoHijo = items.length === 1 && items[0]?._tipo === "hijo" ? items[0] : null;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topRow}>
        <Text style={styles.logo}>
          tribbu<Text style={styles.logoDot}>.</Text>
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={abrirNotifs} style={styles.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notificaciones">
            <MaterialCommunityIcons name="bell-outline" size={18} color="rgba(255,255,255,0.85)" />
            {noLeidos > 0 ? <View style={styles.notifDot} /> : null}
          </Pressable>
          {unicoHijo ? (
            <Pressable
              onPress={() => setColorPickerItem(unicoHijo)}
              style={styles.kidChip}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Color de ${unicoHijo.nombre}`}
            >
              <View style={[styles.kidDot, { backgroundColor: colorDeItem(unicoHijo) }]} />
              <Text style={styles.kidName}>{unicoHijo.nombre?.split(" ")[0]}</Text>
              <MaterialCommunityIcons name="palette-outline" size={13} color="rgba(255,255,255,0.55)" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Selector de hijos/cursos (solo con más de un acceso) */}
      {items.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selector}
        >
          {items.map((item, i) => {
            const active = i === cursoIdx;
            const dot = colorDeItem(item);
            return (
              <View key={item.id ?? i} style={styles.selItemWrap}>
                <Pressable
                  onPress={() => setCursoIdx(i)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  {item._tipo === "hijo" ? (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: active ? dot : dk.textFaint },
                      ]}
                    />
                  ) : null}
                  <Text style={styles.chipTxt}>
                    {item._tipo === "hijo" ? item.nombre : `${item.avatar || ""} ${item.nombre}`}
                  </Text>
                </Pressable>
                {item._tipo === "hijo" && active ? (
                  <Pressable onPress={() => setColorPickerItem(item)} style={styles.paintBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Color de ${item.nombre}`}>
                    <MaterialCommunityIcons name="palette-outline" size={14} color="rgba(255,255,255,0.7)" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      <NotificacionesPanel
        visible={panelNotifs}
        notifs={notifs}
        leidos={leidos}
        cargando={cargando}
        onMarcarLeido={marcarLeido}
        onCerrar={() => setPanelNotifs(false)}
      />
      <ColorPicker
        item={colorPickerItem}
        currentColor={colorPickerItem ? colorDeItem(colorPickerItem) : null}
        onPick={(color) => {
          setColorHijo(colorPickerItem, color);
          setColorPickerItem(null);
        }}
        onClose={() => setColorPickerItem(null)}
      />
    </View>
  );
}

function ColorPicker({ item, currentColor, onPick, onClose }) {
  if (!item) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.pickerOverlay} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={() => {}}>
          <Text style={styles.pickerTitle}>Color de {item.nombre}</Text>
          <View style={styles.swatches}>
            {HIJO_COLORS_CUSTOM.map((col) => (
              <Pressable
                key={col}
                onPress={() => onPick(col)}
                style={[
                  styles.swatch,
                  { backgroundColor: col },
                  currentColor === col && styles.swatchActive,
                ]}
              />
            ))}
          </View>
          <Pressable onPress={() => onPick(null)} style={styles.resetBtn}>
            <Text style={styles.resetTxt}>Restablecer color</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// El header es la superficie de marca: siempre dark, estilado con THEMES.dark
// (el mismo set de tokens del login).
const styles = StyleSheet.create({
  header: { backgroundColor: dk.bg, paddingHorizontal: SPACE.lg, paddingBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { ...TYPE.h1, color: dk.textStrong, letterSpacing: -1 },
  logoDot: { color: dk.accent },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  iconBtn: {
    minWidth: 34,
    minHeight: 34,
    borderRadius: RADIUS.md,
    backgroundColor: dk.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
    backgroundColor: STATUS.danger.border,
    borderWidth: 1.5,
    borderColor: dk.bg,
  },
  kidChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 34,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    backgroundColor: dk.surface2,
  },
  kidDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  kidName: { ...TYPE.chip, fontWeight: "700", color: dk.textStrong },
  selector: { gap: 6, paddingTop: 10, alignItems: "center" },
  selItemWrap: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, marginRight: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    backgroundColor: dk.surface,
  },
  chipActive: { backgroundColor: dk.surfaceActive },
  chipTxt: { ...TYPE.chip, color: dk.textStrong },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full },
  paintBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    backgroundColor: dk.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerOverlay: { flex: 1, backgroundColor: dk.overlay, justifyContent: "flex-start" },
  pickerCard: {
    backgroundColor: dk.surfaceRaised,
    padding: SPACE.lg,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
  },
  pickerTitle: { ...TYPE.label, color: dk.textMuted, marginBottom: 10 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginBottom: 10 },
  swatch: { width: 40, height: 40, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: "transparent" },
  swatchActive: { borderColor: dk.textStrong },
  resetBtn: {
    minHeight: MIN_TOUCH,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: dk.borderStrong,
    backgroundColor: dk.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  resetTxt: { ...TYPE.chip, color: dk.textMuted, fontWeight: "700" },
});
