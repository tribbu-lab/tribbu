// Contenedor del sistema (patrón A3): borde hairline, sin sombra, radio 16.
// Temable: en light es la card blanca clásica; dentro de un
// <ThemeScope theme="dark"> adopta el overlay del login. Estilos pre-creados
// por tema (seguro para FlatList).

import { View } from "react-native";
import { RADIUS, SPACE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
    marginBottom: SPACE.lg,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
}));

export function Card({ children, style }) {
  const s = useStyles();
  return <View style={[s.card, style]}>{children}</View>;
}
