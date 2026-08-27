// Wordmark de marca ("tribbu.") — antes hardcodeado en 4 lugares (AppHeader,
// Login/Registro de auth, BiometricGate), cada uno con su propio tamaño/color
// pero el mismo patrón: serif + punto en el color de acento. Un solo
// componente parametrizable por tamaño/color en vez de 4 copias.

import { Text, Platform } from "react-native";
import { T } from "@shared/theme";

const fontFamily = Platform.select({ ios: "Georgia", default: "serif" });

export function Wordmark({ size = 22, color = "#fff", dotColor = T.accent, weight = "900", letterSpacing, style }) {
  return (
    <Text
      style={[
        {
          fontSize: size,
          fontWeight: weight,
          color,
          letterSpacing: letterSpacing ?? -size * 0.045,
          fontFamily,
        },
        style,
      ]}
    >
      tribbu<Text style={{ color: dotColor }}>.</Text>
    </Text>
  );
}
