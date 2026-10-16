// Menú de un día como tabla (Entrada / Plato principal / Postre), el mismo en
// el Inicio y en Comedor. Categorías en @shared/menu.
import { View, Text, StyleSheet } from "react-native";
import { filasMenu, platoCortable } from "@shared/menu";
import { THEMES, RADIUS } from "@shared/tokens";

const t = THEMES.light;

export function TablaMenu({ menu, style }) {
  const filas = filasMenu(menu);
  if (!filas.length) return null;
  return (
    <View style={[styles.card, style]}>
      {filas.map((f, i) => (
        <View key={f.label} style={[styles.fila, i > 0 && styles.borde]}>
          <Text style={styles.label}>{f.label}</Text>
          <View style={styles.platos}>
            {f.platos.map((p, j) => (
              <Text key={j} style={[styles.plato, j > 0 && styles.platoSig]}>{platoCortable(p)}</Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.xl, paddingHorizontal: 16, paddingVertical: 4 },
  fila: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 10 },
  borde: { borderTopWidth: 1, borderTopColor: t.border },
  label: { width: 112, fontSize: 13, lineHeight: 20, color: t.textMuted },
  platos: { flex: 1, minWidth: 0 },
  plato: { fontSize: 14.5, lineHeight: 20, fontWeight: "600", color: t.textStrong },
  platoSig: { marginTop: 4 },
});
