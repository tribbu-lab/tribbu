// Estilos utilitarios compartidos de la app mobile (tema light).
// Compuestos desde los tokens de @shared/tokens — no hardcodear hex acá.
// Para estilos que cambian con el tema usar makeThemedStyles (context/Theme).
// Referencia: mobile/DESIGN_SYSTEM.md

import { StyleSheet } from "react-native";
import { THEMES, TYPE, SPACE, RADIUS, MIN_TOUCH } from "@shared/tokens";

const t = THEMES.light;

export const ui = StyleSheet.create({
  // layout
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: SPACE.xxxl },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  // tipografía
  h1: { ...TYPE.h1, color: t.text },
  h2: { ...TYPE.h2, color: t.text },
  body: { ...TYPE.body, color: t.text },
  subtle: { ...TYPE.small, color: t.textFaint },
  sectionLabel: { ...TYPE.label, color: t.textFaint, marginBottom: SPACE.sm },
  errorTxt: { ...TYPE.caption, color: t.danger },

  // input (label arriba con sectionLabel; para label+error integrados usar <Input/>)
  input: {
    width: "100%",
    paddingVertical: 11,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    fontSize: 14,
    backgroundColor: t.surfaceSunken,
    color: t.text,
  },

  // botón primario (para variantes/loading/disabled usar <Button/>)
  btnPrimary: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnPrimaryTxt: { ...TYPE.btn, color: t.onAccent },

  // toque mínimo cómodo (44pt)
  hit44: { minHeight: MIN_TOUCH, justifyContent: "center" },
});
