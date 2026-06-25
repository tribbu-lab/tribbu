// Tokens de estilo reutilizables para la app mobile.
// Los colores salen de @shared/theme (T); acá solo se componen estilos comunes.

import { StyleSheet } from "react-native";
import { T } from "@shared/theme";

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 32 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text },
  subtle: { fontSize: 13, color: "#94A3B8" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    width: "100%",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontSize: 14,
    backgroundColor: "#F8FAFC",
    color: T.text,
  },
  // Botón primario
  btnPrimary: {
    backgroundColor: T.accent,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnPrimaryTxt: { color: "white", fontSize: 14, fontWeight: "800" },
  // Toque mínimo cómodo
  hit44: { minHeight: 44, justifyContent: "center" },
});
