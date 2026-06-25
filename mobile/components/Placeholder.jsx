// Pantalla provisional para features aún no portadas a RN (milestone 1).
// La lógica web equivalente ya existe en src/features/<name>; el puerto RN es
// trabajo de seguimiento.

import { View, Text, StyleSheet } from "react-native";
import { T } from "@shared/theme";

export function Placeholder({ emoji = "🚧", title, note }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>{note || "Esta sección se está portando a la app nativa."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: T.bg, alignItems: "center", justifyContent: "center", padding: 32 },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: T.text, marginBottom: 6 },
  note: { fontSize: 14, color: "#94A3B8", textAlign: "center", lineHeight: 20 },
});
