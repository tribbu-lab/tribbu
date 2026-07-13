// Pantalla provisional para features aún no portadas a RN (milestone 1).
// La lógica web equivalente ya existe en src/features/<name>; el puerto RN es
// trabajo de seguimiento. Para vacíos de datos dentro de una feature usar
// <EmptyState/> (acepta CTA).

import { View, Text } from "react-native";
import { TYPE, SPACE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  wrap: { flex: 1, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", padding: SPACE.xxxl },
  emoji: { fontSize: 44, marginBottom: SPACE.md },
  title: { ...TYPE.h2, color: t.text, marginBottom: 6 },
  note: { ...TYPE.body, color: t.textFaint, textAlign: "center" },
}));

export function Placeholder({ emoji = "🚧", title, note }) {
  const s = useStyles();
  return (
    <View style={s.wrap}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={s.title}>{title}</Text>
      <Text style={s.note}>{note || "Esta sección se está portando a la app nativa."}</Text>
    </View>
  );
}
