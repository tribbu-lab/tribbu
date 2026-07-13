// Header persistente de la app (sobre las tabs). Reemplaza el header móvil de la
// web: logo, nombre del usuario, campana de notificaciones con badge, acciones
// (cambiar contraseña / salir) y el selector horizontal de hijos/cursos con
// color personalizado por hijo.

import { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { THEMES, STATUS, TYPE, RADIUS, SPACE, MIN_TOUCH, HIJO_COLORS_CUSTOM } from "@shared/tokens";
import { useSession } from "../context/Session";
import { useNotificaciones, NotificacionesPanel } from "../features/notificaciones";
import { CambiarPasswordModal } from "../features/auth";

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
  const [cambiarPass, setCambiarPass] = useState(false);
  const [colorPickerItem, setColorPickerItem] = useState(null);

  const { notifs, leidos, cargando, noLeidos, marcarLeido } = useNotificaciones({
    cursoId,
    userId: usuario?.id ?? null,
    active: panelNotifs,
  });

  const firstName = usuario?.nombre?.split(" ")[0] || "";

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <View style={styles.topRow}>
        <Text style={styles.logo}>
          tribbu<Text style={styles.logoDot}>.</Text>
        </Text>
        <View style={styles.actions}>
          <Text style={styles.userName}>{firstName}</Text>
          <Pressable onPress={() => setPanelNotifs(true)} style={styles.iconBtn} hitSlop={8}>
            <Text style={styles.icon}>🔔</Text>
            {noLeidos > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{noLeidos > 9 ? "9+" : noLeidos}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => setCambiarPass(true)} style={styles.iconBtn} hitSlop={8}>
            <Text style={styles.icon}>🔑</Text>
          </Pressable>
          <LogoutButton />
        </View>
      </View>

      {/* Selector de hijos/cursos */}
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
                  <Pressable onPress={() => setColorPickerItem(item)} style={styles.paintBtn} hitSlop={6}>
                    <Text style={styles.icon}>🎨</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : items.length === 1 && items[0]?._tipo === "hijo" ? (
        <View style={styles.singleRow}>
          <Text style={styles.singleName}>{items[0].nombre}</Text>
          <Pressable onPress={() => setColorPickerItem(items[0])} style={styles.paintBtn} hitSlop={6}>
            <Text style={styles.icon}>🎨</Text>
          </Pressable>
        </View>
      ) : null}

      <NotificacionesPanel
        visible={panelNotifs}
        notifs={notifs}
        leidos={leidos}
        cargando={cargando}
        onMarcarLeido={marcarLeido}
        onCerrar={() => setPanelNotifs(false)}
      />
      <CambiarPasswordModal visible={cambiarPass} onClose={() => setCambiarPass(false)} />
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

function LogoutButton() {
  const { logout } = useSession();
  return (
    <Pressable onPress={logout} style={styles.iconBtn} hitSlop={8}>
      <Text style={styles.salir}>Salir</Text>
    </Pressable>
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
// (el mismo set de tokens del login). `dk` se define arriba del componente.
const styles = StyleSheet.create({
  header: { backgroundColor: dk.bg, paddingHorizontal: SPACE.lg, paddingBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { ...TYPE.h1, color: dk.textStrong, letterSpacing: -1 },
  logoDot: { color: dk.accent },
  actions: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  userName: { fontSize: 11, color: dk.textMuted, fontWeight: "600" },
  iconBtn: {
    minWidth: 32,
    minHeight: 32,
    paddingHorizontal: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: dk.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: { width: 0, height: 0 },
  icon: { fontSize: 15 },
  salir: { color: dk.textMuted, fontSize: 11, fontWeight: "600" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: STATUS.danger.main,
    borderRadius: RADIUS.md,
    minWidth: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: { color: dk.textStrong, fontSize: 9, fontWeight: "800", lineHeight: 14 },
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
  singleRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingTop: 10 },
  singleName: { ...TYPE.chip, color: dk.textMuted },
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
