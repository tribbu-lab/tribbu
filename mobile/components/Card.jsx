// Contenedor con sombra suave y bordes redondeados. Temable: en light es la
// card blanca clásica; dentro de un <ThemeScope theme="dark"> adopta el
// overlay del login. Estilos pre-creados por tema (seguro para FlatList).

import { View } from "react-native";
import { RADIUS, SPACE, SHADOW } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.xxl,
    padding: SPACE.xl,
    marginBottom: SPACE.lg,
    borderWidth: 1,
    borderColor: t.border,
    ...SHADOW.card,
  },
}));

export function Card({ children, style }) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}
