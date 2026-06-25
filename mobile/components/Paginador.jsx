import { View, Text, Pressable, StyleSheet } from "react-native";

/** Controles de paginación — se integra con useListControls. */
export function Paginador({ pagina, totalPag, setPagina }) {
  if (totalPag <= 1) return null;

  const Btn = ({ onPress, disabled, label }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, pressed && !disabled && styles.pressed]}
    >
      <Text style={[styles.btnTxt, disabled && styles.btnTxtDisabled]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.row}>
      <Btn onPress={() => setPagina(1)} disabled={pagina === 1} label="«" />
      <Btn onPress={() => setPagina((p) => p - 1)} disabled={pagina === 1} label="‹" />
      <Text style={styles.label}>
        Pág. {pagina} de {totalPag}
      </Text>
      <Btn onPress={() => setPagina((p) => p + 1)} disabled={pagina === totalPag} label="›" />
      <Btn onPress={() => setPagina(totalPag)} disabled={pagina === totalPag} label="»" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
  },
  btn: {
    minWidth: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
    alignItems: "center",
  },
  pressed: { opacity: 0.6 },
  btnTxt: { fontSize: 13, color: "#0F172A", fontWeight: "700" },
  btnTxtDisabled: { color: "#CBD5E1" },
  label: { fontSize: 12, color: "#64748B", paddingHorizontal: 8 },
});
