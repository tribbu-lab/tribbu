// El botón "+ Nuevo" de todas las pantallas (Avisos, Mensajes, Calendario,
// Colectas, Encuestas, Autorizaciones, Lost & Found, Marketplace): mismo
// tamaño, color y texto en todas. Espejo web: src/components/BotonNuevo.jsx.
import { Pressable, Text, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { BLUE, RADIUS } from "@shared/tokens";

export function BotonNuevo({ onPress, label = "Nuevo", accessibilityLabel, style }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed, style]}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
    >
      <MaterialCommunityIcons name="plus" size={16} color="white" />
      <Text style={styles.txt}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingLeft: 11, paddingRight: 14, borderRadius: RADIUS.md, backgroundColor: BLUE[600] },
  pressed: { opacity: 0.85 },
  txt: { color: "white", fontSize: 13, fontWeight: "800" },
});
