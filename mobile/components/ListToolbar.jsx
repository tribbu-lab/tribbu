// Equivalente RN de src/components/ListToolbar.jsx — misma API (se usa con
// useListControls). Sin <select> nativo: el orden cicla con un botón y los
// filtros se muestran como chips horizontales, idiomático en mobile.

import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { TYPE, RADIUS, SPACE, MIN_TOUCH } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  wrap: { marginBottom: 14 },
  row: { flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.sm },
  search: {
    flex: 2,
    minHeight: MIN_TOUCH,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    fontSize: 13,
    backgroundColor: t.surface,
    color: t.text,
  },
  sortBtn: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  sortTxt: { ...TYPE.chip, color: t.text },
  clearBtn: {
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.dangerBorder,
    backgroundColor: t.dangerSoft,
  },
  clearTxt: { fontSize: 12, color: t.danger, fontWeight: "700" },
  chipsRow: { flexGrow: 0, marginBottom: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    marginRight: 6,
  },
  chipActive: { borderColor: t.accent, backgroundColor: t.accentSoft },
  chipTxt: { ...TYPE.chip, color: t.textMuted },
  chipTxtActive: { color: t.accent, fontWeight: "700" },
  count: { fontSize: 11, color: t.textFaint, marginTop: 6 },
}));

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
  const s = useStyles();
  const t = useTheme();
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
    <View style={s.wrap}>
      <View style={s.row}>
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder={placeholder}
          placeholderTextColor={t.placeholder}
          style={s.search}
        />
        {sortOptions?.length > 0 && (
          <Pressable onPress={cycleSort} style={s.sortBtn}>
            <Text style={s.sortTxt} numberOfLines={1}>
              {sortActual?.label || "Orden"} {sortAsc ? "↑" : "↓"}
            </Text>
          </Pressable>
        )}
        {hayFiltros && (
          <Pressable onPress={resetFiltros} style={s.clearBtn}>
            <Text style={s.clearTxt}>Limpiar</Text>
          </Pressable>
        )}
      </View>

      {filterOptions?.length > 0 &&
        filterOptions.map((f) => (
          <ScrollView
            key={f.key}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipsRow}
          >
            {[{ value: "all", label: "Todos" }, ...f.options].map((o) => {
              const active = (filtros[f.key] || "all") === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setFiltro(f.key, o.value)}
                  style={[s.chip, active && s.chipActive]}
                >
                  <Text style={[s.chipTxt, active && s.chipTxtActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ))}

      <Text style={s.count}>
        {total} resultado{total !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}
