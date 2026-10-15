// Filtros en un solo botón: "Filtros (2)" abre una Sheet con cada grupo de
// opciones como chips. Más limpio que una fila de select-chips por filtro.
//
//   <BotonFiltros activos={n} onPress={() => setAbierto(true)} />
//   <FiltrosSheet visible={abierto} onClose={...} grupos={[{ key, label, options:[{value,label}], value, onChange }]} onLimpiar={...} />
//
// Un filtro está "activo" cuando su valor no es `defecto` (o, sin defecto, la
// primera opción).

import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, SPACE, RADIUS, SLATE, BLUE } from "@shared/tokens";
import { Sheet } from "./Sheet";

const t = THEMES.light;

export const filtrosActivos = (grupos) => grupos.filter((g) => g.value !== (g.defecto ?? g.options[0]?.value)).length;

export function BotonFiltros({ activos = 0, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.boton, activos > 0 && styles.botonOn]} accessibilityRole="button" accessibilityLabel={activos ? `Filtros, ${activos} activos` : "Filtros"} hitSlop={4}>
      <MaterialCommunityIcons name="tune-variant" size={16} color={activos ? BLUE[700] : SLATE[600]} />
      <Text style={[styles.botonTxt, activos > 0 && styles.botonTxtOn]}>Filtros</Text>
      {activos > 0 ? (
        <View style={styles.cuenta}><Text style={styles.cuentaTxt}>{activos}</Text></View>
      ) : null}
    </Pressable>
  );
}

export function FiltrosSheet({ visible, onClose, grupos, onLimpiar }) {
  const activos = filtrosActivos(grupos);
  return (
    <Sheet visible={visible} onClose={onClose} title="Filtros">
      {grupos.map((g) => (
        <View key={g.key} style={styles.grupo}>
          <Text style={styles.grupoLabel}>{g.label}</Text>
          <View style={styles.opciones}>
            {g.options.map((o) => {
              const on = g.value === o.value;
              return (
                <Pressable key={o.value} onPress={() => g.onChange(o.value)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.pie}>
        {activos > 0 ? (
          <Pressable onPress={onLimpiar || (() => grupos.forEach((g) => g.onChange(g.defecto ?? g.options[0].value)))} style={styles.limpiar} hitSlop={6}>
            <Text style={styles.limpiarTxt}>Limpiar filtros</Text>
          </Pressable>
        ) : <View style={styles.flex1} />}
        <Pressable onPress={onClose} style={styles.listo}>
          <Text style={styles.listoTxt}>Listo</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  boton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  botonOn: { borderColor: BLUE[200], backgroundColor: BLUE[50] },
  botonTxt: { fontSize: 13, fontWeight: "700", color: SLATE[700] },
  botonTxtOn: { color: BLUE[700] },
  cuenta: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: RADIUS.full, backgroundColor: BLUE[600], alignItems: "center", justifyContent: "center" },
  cuentaTxt: { fontSize: 11, fontWeight: "800", color: "white" },
  grupo: { marginBottom: SPACE.lg },
  grupoLabel: { fontSize: 13, fontWeight: "700", color: t.textMuted, marginBottom: SPACE.sm },
  opciones: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: "center", borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  chipOn: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  chipTxt: { fontSize: 13.5, fontWeight: "600", color: SLATE[700] },
  chipTxtOn: { color: "white" },
  pie: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACE.sm },
  flex1: { flex: 1 },
  limpiar: { paddingVertical: 10 },
  limpiarTxt: { fontSize: 14, fontWeight: "700", color: t.textMuted },
  listo: { minHeight: 44, paddingHorizontal: 22, borderRadius: RADIUS.md, backgroundColor: BLUE[600], alignItems: "center", justifyContent: "center" },
  listoTxt: { fontSize: 14.5, fontWeight: "800", color: "white" },
});
