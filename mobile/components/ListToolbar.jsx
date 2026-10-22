// Equivalente RN de src/components/ListToolbar.jsx — misma API (se usa con
// useListControls) y mismo aspecto que el resto de la app (2026-10-22): el
// Buscador con lupa y un solo botón "Filtros" que abre la Sheet con cada
// filtro como chips y, al final, el orden. Antes: botón de orden que ciclaba,
// filas de chips a la vista y un "Limpiar" rojo.

import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { THEMES, SPACE } from "@shared/tokens";
import { gruposFiltros } from "@shared/gruposFiltros";
import { Buscador } from "./Buscador";
import { BotonFiltros, FiltrosSheet, filtrosActivos } from "./Filtros";

const t = THEMES.light;

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
  total,
  placeholder = "Buscar...",
}) {
  const [abierto, setAbierto] = useState(false);
  const grupos = gruposFiltros({ filterOptions, filtros, setFiltro, sortOptions, sortKey, sortAsc, toggleSort });

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Buscador value={busqueda} onChange={setBusqueda} placeholder={placeholder} style={styles.buscador} />
        {grupos.length > 0 ? <BotonFiltros activos={filtrosActivos(grupos)} onPress={() => setAbierto(true)} /> : null}
      </View>
      <FiltrosSheet visible={abierto} onClose={() => setAbierto(false)} grupos={grupos} />
      <Text style={styles.count}>
        {total} resultado{total !== 1 ? "s" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  buscador: { flex: 1, marginBottom: 0 },
  count: { fontSize: 12.5, color: t.textMuted, marginTop: 8 },
});
