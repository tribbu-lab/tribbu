// Círculo del usuario: su foto de perfil o, si no tiene, las iniciales.
// `oscuro` = sobre el header (fondo de marca). Espejo web: src/components/AvatarPerfil.jsx.
import { View, Text, StyleSheet } from "react-native";
import { iniciales } from "@shared/helpers";
import { SignedImage } from "./SignedImage";

export function AvatarPerfil({ usuario, foto, size = 34, oscuro = false }) {
  const redondo = { width: size, height: size, borderRadius: size / 2 };
  if (foto) {
    return <SignedImage src={foto} bucket="adjuntos" miniatura={size <= 64} style={[redondo, oscuro && styles.bordeOscuro]} />;
  }
  return (
    <View style={[redondo, styles.base, oscuro ? styles.fondoOscuro : styles.fondoClaro]}>
      <Text style={[styles.txt, { fontSize: Math.round(size * 0.37) }]}>{iniciales(usuario)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  fondoOscuro: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  fondoClaro: { backgroundColor: "#1E293B" },
  bordeOscuro: { borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  txt: { fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
});
