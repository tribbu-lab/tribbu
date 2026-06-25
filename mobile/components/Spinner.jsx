import { View, ActivityIndicator, StyleSheet } from "react-native";
import { T } from "@shared/theme";

/** Indicador de carga centrado. */
export function Spinner({ style }) {
  return (
    <View style={[styles.wrap, style]}>
      <ActivityIndicator size="large" color={T.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 60,
  },
});
