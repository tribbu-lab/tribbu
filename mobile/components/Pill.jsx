// Etiqueta en cápsula — roles, estados, prioridades, etc.
// API legacy estable (color/bg explícitos). Para tonos semánticos, dot y
// tamaños usar <Badge/>; para roles, <RoleBadge/>.

import { View, Text } from "react-native";
import { TYPE, RADIUS, withAlpha } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

const useStyles = makeThemedStyles(() => ({
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    alignSelf: "flex-start",
  },
  text: { ...TYPE.pill },
}));

export function Pill({ label, color, bg }) {
  const s = useStyles();
  const t = useTheme();
  return (
    <View style={[s.pill, { backgroundColor: bg || withAlpha(t.accent, 0.08) }]}>
      <Text style={[s.text, { color: color || t.accent }]}>{label}</Text>
    </View>
  );
}
