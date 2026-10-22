// Pestañas internas de una sección del bottom-bar que agrupa dos pantallas
// (Agenda = Calendario + Cumpleaños; Comunicaciones = Avisos + Mensajes).
// Cada pantalla sigue siendo su propia ruta (los deep-links de push no
// cambian); esto solo salta entre las dos.

import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { THEMES, BLUE, SLATE, RADIUS, SPACE, TYPE } from "@shared/tokens";
import { useNotificacionesCtx, avisosSinLeer } from "../features/notificaciones";
import { useMensajesCtx } from "../lib/useMensajesNoLeidos";
import { SelectorHijos } from "./SelectorHijos";

const t = THEMES.light;

export const SECCION_AGENDA = [
  { route: "calendario", label: "Calendario" },
  { route: "horario", label: "Horario" },
  { route: "cumples", label: "Cumpleaños" },
];
export const SECCION_COMUNICACIONES = [
  { route: "recordatorios", label: "Avisos" },
  { route: "mensajes", label: "Mensajes" },
];

export function SubTabs({ items, activo, badges = {} }) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <SelectorHijos style={{ marginBottom: SPACE.md }} />
      <View style={styles.bar}>
        {items.map((it) => {
          const on = it.route === activo;
          const n = badges[it.route] || 0;
          return (
            <Pressable
              key={it.route}
              onPress={() => (on ? null : router.navigate(`/(tabs)/${it.route}`))}
              style={[styles.item, on && styles.itemOn]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.lbl, on && styles.lblOn]}>{it.label}</Text>
              {n > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeTxt}>{n > 9 ? "9+" : n}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: t.bg, paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
  bar: { flexDirection: "row", backgroundColor: SLATE[100], borderRadius: RADIUS.full, padding: 4 },
  item: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", minHeight: 38, borderRadius: RADIUS.full },
  itemOn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  lbl: { fontSize: 13.5, fontWeight: "600", color: t.textMuted },
  lblOn: { color: BLUE[700], fontWeight: "800" },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: RADIUS.full, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" },
  panelScroll: { flexGrow: 0, marginBottom: SPACE.md },
  panelBar: { flexDirection: "row", backgroundColor: SLATE[100], borderRadius: RADIUS.full, padding: 4 },
  panelItem: { paddingHorizontal: 14, alignItems: "center", justifyContent: "center", minHeight: 38, borderRadius: RADIUS.full },
  badgeTxt: { ...TYPE.pill, fontSize: 10, fontWeight: "700", color: t.textInverse, lineHeight: 14 },
});

// Comunicaciones con los no leídos de cada lado (mismos contadores que el bottom-bar).
export function ComunicacionesTabs({ activo }) {
  const notif = useNotificacionesCtx();
  const { noLeidos } = useMensajesCtx() || {};
  return <SubTabs items={SECCION_COMUNICACIONES} activo={activo} badges={{ recordatorios: avisosSinLeer(notif), mensajes: noLeidos || 0 }} />;
}

// Pestañas del panel del colegio (mobile/features/superadmin): mismas
// pastillas, pero sin rutas — cada pestaña es un `sec` del panel — y con
// scroll de costado porque una sección puede tener 6 o 7 pantallas.
export function PestanasPanel({ items, activo, onIr }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelScroll} contentContainerStyle={styles.panelBar}>
      {items.map((it) => {
        const on = it.id === activo;
        return (
          <Pressable
            key={it.id}
            onPress={() => (on ? null : onIr(it.id))}
            style={[styles.panelItem, on && styles.itemOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.lbl, on && styles.lblOn]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
