// Monto es-AR — usa fmtM (helpers compartidos) + tabular-nums para que las
// columnas de montos alineen en listas (Finanzas/Colectas).
// tone: default (fuerte) · success (pagado) · danger (deuda) · muted (secundario)

import { Text } from "react-native";
import { fmtM } from "@shared/helpers";
import { TYPE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  base: { ...TYPE.money },
  sm: { fontSize: 13 },
  lg: { fontSize: 18 },
  default: { color: t.textStrong },
  success: { color: t.success },
  danger: { color: t.danger },
  muted: { color: t.textMuted },
}));

export function Money({ value = 0, tone = "default", size = "md", style }) {
  const s = useStyles();
  return (
    <Text style={[s.base, size === "sm" && s.sm, size === "lg" && s.lg, s[tone] || s.default, style]}>
      {value < 0 ? "-" : ""}{fmtM(value)}
    </Text>
  );
}
