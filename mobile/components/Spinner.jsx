// Indicador de carga centrado. Para listas con forma conocida preferir
// <SkeletonList/> (percepción de carga más suave).

import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "../context/Theme";

export function Spinner({ style }) {
  const t = useTheme();
  return (
    <View style={[styles.wrap, style]}>
      <ActivityIndicator size="large" color={t.accent} />
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
