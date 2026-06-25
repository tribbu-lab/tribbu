import { View, Text, StyleSheet } from "react-native";
import { T } from "@shared/theme";

/** Etiqueta en cápsula — roles, estados, prioridades, etc. */
export function Pill({ label, color, bg }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg || "rgba(59,130,246,0.08)" }]}>
      <Text style={[styles.text, { color: color || T.accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 100,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
});
