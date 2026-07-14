// Avatar con iniciales sobre el color de identidad del hijo/usuario, o foto.
// ChildDot: el indicador mínimo de identidad (selector del header, filas de listas).
// El color viene de childTheme(getHijoColor(...)) — nunca hardcodear.

import { View, Text, Image, StyleSheet } from "react-native";
import { childTheme } from "@shared/tokens";

function initials(nombre = "", apellido = "") {
  const a = (nombre.trim()[0] || "").toUpperCase();
  const b = (apellido.trim()[0] || nombre.trim().split(/\s+/)[1]?.[0] || "").toUpperCase();
  return a + b || "?";
}

export function Avatar({ nombre = "", apellido = "", color, uri, size = 36, style }) {
  const ct = childTheme(color);
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[shape, style]} />;
  return (
    <View style={[styles.wrap, shape, { backgroundColor: ct.soft, borderColor: ct.border }, style]}>
      <Text style={[styles.txt, { color: ct.main, fontSize: Math.round(size * 0.36) }]}>
        {initials(nombre, apellido)}
      </Text>
    </View>
  );
}

/** Punto de color de identidad (8pt por defecto). */
export function ChildDot({ color, size = 8, style }) {
  const ct = childTheme(color);
  return (
    <View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: ct.main }, style]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  txt: { fontWeight: "800" },
});
