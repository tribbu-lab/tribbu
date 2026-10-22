// Lista de cursos con casilla (o radio si multi=false) para elegir uno o
// varios — Comunicaciones, Alertas, Uniformes del panel del colegio y
// Autorizaciones. Con muchos cursos queda una lista con scroll en vez de
// botones que ocupan media pantalla. Puerto de src/components/CursoListSelector.jsx.
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { T } from "@shared/theme";
import { nivelesDeCursos, nombreNivel } from "@shared/niveles";

const COLOR_DEFECTO = "#3B82F6";

// Con cursos de más de un nivel (roles-por-nivel), chips "Todo Primaria"
// arriba: tildan o destildan todos los cursos de ese nivel.
export function CursoListSelector({ cursos, seleccionados, onToggle, multi = true, maxHeight = 200 }) {
  const niveles = multi ? nivelesDeCursos(cursos) : [];
  const toggleNivel = (k) => {
    const delNivel = cursos.filter((c) => c.nivel === k);
    const todos = delNivel.every((c) => seleccionados.includes(c.id));
    delNivel.filter((c) => (todos ? seleccionados.includes(c.id) : !seleccionados.includes(c.id))).forEach((c) => onToggle(c.id));
  };
  return (
    <>
    {niveles.length > 1 ? (
      <View style={cursoSelectorStyles.niveles}>
        {niveles.map((k) => {
          const on = cursos.filter((c) => c.nivel === k).every((c) => seleccionados.includes(c.id));
          return (
            <Pressable key={k} onPress={() => toggleNivel(k)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[cursoSelectorStyles.nivelChip, on && cursoSelectorStyles.nivelChipOn]}>
              <Text style={[cursoSelectorStyles.nivelTxt, on && cursoSelectorStyles.nivelTxtOn]}>{on ? "✓ " : ""}Todo {nombreNivel(k)}</Text>
            </Pressable>
          );
        })}
      </View>
    ) : null}
    <ScrollView style={[cursoSelectorStyles.list, { maxHeight }]} nestedScrollEnabled>
      {cursos.map((c, i) => {
        const sel = seleccionados.includes(c.id);
        const color = c.color || COLOR_DEFECTO; // los cursos de "Mi acceso" no traen color
        return (
          <Pressable
            key={c.id}
            onPress={() => onToggle(c.id)}
            style={[cursoSelectorStyles.row, i > 0 && cursoSelectorStyles.rowBorder, sel && { backgroundColor: "#F8FAFC" }]}
          >
            {multi ? (
              <View style={[cursoSelectorStyles.checkbox, sel && { borderColor: "#2563EB", backgroundColor: "#2563EB" }]}>
                {sel ? <Text style={cursoSelectorStyles.checkboxTick}>✓</Text> : null}
              </View>
            ) : (
              <View style={[cursoSelectorStyles.dot, { backgroundColor: color }]} />
            )}
            <Text style={[cursoSelectorStyles.rowTxt, sel && { fontWeight: "700", color: T.text }]}>
              {c.nombre}
            </Text>
            {!multi && sel ? <Text style={[cursoSelectorStyles.check, { color: "#2563EB" }]}>✓</Text> : null}
          </Pressable>
        );
      })}
      {cursos.length === 0 ? <Text style={cursoSelectorStyles.vacio}>Sin cursos</Text> : null}
    </ScrollView>
    </>
  );
}

export const cursoSelectorStyles = StyleSheet.create({
  niveles: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  nivelChip: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  nivelChipOn: { borderColor: "#3B82F6", backgroundColor: "#EFF6FF" },
  nivelTxt: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  nivelTxtOn: { color: "#1D4ED8" },
  list: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  checkbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  checkboxTick: { fontSize: 11, color: "white", fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowTxt: { fontSize: 13, fontWeight: "500", color: "#475569", flex: 1 },
  check: { fontSize: 14, fontWeight: "700" },
  vacio: { fontSize: 13, color: "#94A3B8", padding: 14, textAlign: "center" },
});
