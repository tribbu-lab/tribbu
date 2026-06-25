// Equivalente RN de src/components/ListToolbar.jsx — misma API (se usa con
// useListControls). Sin <select> nativo: el orden cicla con un botón y los
// filtros se muestran como chips horizontales, idiomático en mobile.

import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { T } from "@shared/theme";

export function ListToolbar({
  busqueda,
  setBusqueda,
  sortOptions,
  sortKey,
  sortAsc,
  toggleSort,
  filterOptions,
  filtros,
  setFiltro,
  resetFiltros,
  total,
  placeholder = "Buscar...",
}) {
  const hayFiltros = !!busqueda || Object.values(filtros).some((v) => v && v !== "all");
  const sortActual = sortOptions?.find((o) => o.key === sortKey);

  const cycleSort = () => {
    if (!sortOptions?.length) return;
    const idx = sortOptions.findIndex((o) => o.key === sortKey);
    // primer toque invierte; si ya invertido, pasa al siguiente criterio
    if (sortAsc) {
      toggleSort(sortKey); // asc -> desc
    } else {
      const next = sortOptions[(idx + 1) % sortOptions.length];
      toggleSort(next.key); // siguiente criterio (vuelve a asc)
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          style={styles.search}
        />
        {sortOptions?.length > 0 && (
          <Pressable onPress={cycleSort} style={styles.sortBtn}>
            <Text style={styles.sortTxt} numberOfLines={1}>
              {sortActual?.label || "Orden"} {sortAsc ? "↑" : "↓"}
            </Text>
          </Pressable>
        )}
        {hayFiltros && (
          <Pressable onPress={resetFiltros} style={styles.clearBtn}>
            <Text style={styles.clearTxt}>Limpiar</Text>
          </Pressable>
        )}
      </View>

      {filterOptions?.length > 0 &&
        filterOptions.map((f) => (
          <ScrollView
            key={f.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
          >
            {[{ value: "all", label: "Todos" }, ...f.options].map((o) => {
              const active = (filtros[f.key] || "all") === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setFiltro(f.key, o.value)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ))}

      <Text style={styles.count}>
        {total} resultado{total !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  row: { flexDirection: "row", gap: 8, marginBottom: 8 },
  search: {
    flex: 2,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontSize: 13,
    backgroundColor: "white",
    color: T.text,
  },
  sortBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
  },
  sortTxt: { fontSize: 12, color: T.text, fontWeight: "600" },
  clearBtn: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  clearTxt: { fontSize: 12, color: "#EF4444", fontWeight: "700" },
  chipsRow: { flexGrow: 0, marginBottom: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
    marginRight: 6,
  },
  chipActive: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  chipTxtActive: { color: T.accent, fontWeight: "700" },
  count: { fontSize: 11, color: "#94A3B8", marginTop: 6 },
});
