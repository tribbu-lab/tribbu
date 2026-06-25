import { View, StyleSheet } from "react-native";
import { T } from "@shared/theme";

/** Contenedor con sombra suave y bordes redondeados (equivalente RN de la web). */
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
    // sombra: elevation (Android) + shadow* (iOS)
    elevation: 2,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
});
