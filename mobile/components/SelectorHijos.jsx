// Selector de "Mi acceso" (Todos mis hijos / un hijo / un curso), como en el
// prototipo: un desplegable sobrio arriba de cada sección (en Hoy, debajo del
// saludo) en vez de la fila de botones del header. Solo aparece con más de un
// acceso. En la hoja también se cambia el color del hijo elegido.

import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, SLATE, BLUE, RADIUS, SPACE, HIJO_COLORS_CUSTOM } from "@shared/tokens";
import { ROL_LABEL } from "@shared/theme";
import { useSession } from "../context/Session";
import { Sheet } from "./Sheet";

const t = THEMES.light;

export const nombreItem = (item, esDocente) =>
  item._tipo === "todos" ? (esDocente ? "Todos mis cursos" : "Todos mis hijos")
  : item._tipo === "hijo" ? item.nombre?.split(" ")[0]
  : item.nombre;

export function SelectorHijos({ style }) {
  const { items, cursoIdx, setCursoIdx, colorDeItem, colorCustomDeItem, setColorHijo, esDocente } = useSession();
  const [abierto, setAbierto] = useState(false);
  if (!items || items.length < 2) return null;
  const actual = items[cursoIdx] || items[0];

  return (
    <>
      <Pressable
        onPress={() => setAbierto(true)}
        style={[styles.boton, style]}
        accessibilityRole="button"
        accessibilityLabel={`Ver: ${nombreItem(actual, esDocente)}. Cambiar`}
      >
        <Marca item={actual} color={colorDeItem(actual)} />
        <Text style={styles.botonTxt} numberOfLines={1}>{nombreItem(actual, esDocente)}</Text>
        <MaterialCommunityIcons name="chevron-down" size={18} color={SLATE[500]} />
      </Pressable>

      <Sheet visible={abierto} onClose={() => setAbierto(false)} title="Ver">
        <ScrollView style={styles.scroll}>
          <View style={styles.card}>
            {items.map((item, i) => {
              const on = i === cursoIdx;
              return (
                <Pressable
                  key={item.id ?? i}
                  onPress={() => {
                    setCursoIdx(i);
                    setAbierto(false);
                  }}
                  style={[styles.fila, i > 0 && styles.filaBorde]}
                >
                  <Marca item={item} color={colorDeItem(item)} />
                  <View style={styles.flex1}>
                    <Text style={[styles.filaTxt, on && styles.filaTxtOn]}>{nombreItem(item, esDocente)}</Text>
                    {item._tipo === "hijo" && item.rolEfectivo && item.rolEfectivo !== "padre" ? (
                      <Text style={styles.filaMeta}>{ROL_LABEL[item.rolEfectivo] || item.rolEfectivo}</Text>
                    ) : null}
                  </View>
                  {on ? <MaterialCommunityIcons name="check" size={20} color={BLUE[600]} /> : null}
                </Pressable>
              );
            })}
          </View>

          {actual._tipo === "hijo" ? (
            <>
              <Text style={styles.label}>Color de {nombreItem(actual)}</Text>
              <View style={styles.swatches}>
                {HIJO_COLORS_CUSTOM.map((col) => (
                  <Pressable
                    key={col}
                    onPress={() => setColorHijo(actual, col)}
                    style={[styles.swatch, { backgroundColor: col }, colorCustomDeItem(actual) === col && styles.swatchOn]}
                    accessibilityLabel={`Color ${col}`}
                  />
                ))}
              </View>
              {colorCustomDeItem(actual) ? (
                <Pressable onPress={() => setColorHijo(actual, null)} style={styles.reset}>
                  <Text style={styles.resetTxt}>Restablecer color</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Sheet>
    </>
  );
}

function Marca({ item, color }) {
  if (item._tipo === "todos") return <MaterialCommunityIcons name="account-multiple-outline" size={18} color={SLATE[600]} />;
  if (item._tipo === "hijo") return <View style={[styles.dot, { backgroundColor: color || SLATE[400] }]} />;
  return <MaterialCommunityIcons name="school-outline" size={17} color={SLATE[600]} />;
}

const styles = StyleSheet.create({
  boton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    maxWidth: "100%",
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
  },
  botonTxt: { fontSize: 14, fontWeight: "700", color: t.textStrong, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: RADIUS.full },
  scroll: { flexShrink: 1 },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.xl, overflow: "hidden" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, minHeight: 52 },
  filaBorde: { borderTopWidth: 1, borderTopColor: t.border },
  flex1: { flex: 1 },
  filaTxt: { fontSize: 15, fontWeight: "600", color: t.text },
  filaTxtOn: { fontWeight: "800", color: t.textStrong },
  filaMeta: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: RADIUS.full, borderWidth: 3, borderColor: "transparent" },
  swatchOn: { borderColor: t.textStrong },
  reset: { marginTop: SPACE.md, alignSelf: "flex-start", paddingVertical: 8 },
  resetTxt: { fontSize: 13, fontWeight: "700", color: BLUE[600] },
});
