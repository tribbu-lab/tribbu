// Contexto de tema (light/dark) para la app mobile.
// La app es light por defecto; las superficies de marca (login, AppHeader)
// envuelven su árbol en <ThemeScope theme="dark">. Los tokens viven en
// @shared/tokens (THEMES.light / THEMES.dark, mismas claves).
//
// Patrón de estilos temables — `makeThemedStyles`:
// pre-crea AMBOS StyleSheets en tiempo de módulo (uno por tema) y devuelve un
// hook que solo elige entre los dos. Cero allocations por render → seguro para
// renderItem de FlatList (no rompe la virtualización).

import { createContext, useContext } from "react";
import { StyleSheet } from "react-native";
import { THEMES } from "@shared/tokens";

const ThemeCtx = createContext(THEMES.light);

/** Envuelve un subárbol con un tema. Uso: <ThemeScope theme="dark">…</ThemeScope> */
export function ThemeScope({ theme = "light", children }) {
  return <ThemeCtx.Provider value={THEMES[theme] || THEMES.light}>{children}</ThemeCtx.Provider>;
}

/** Tokens semánticos del tema activo (light si no hay ThemeScope). */
export function useTheme() {
  return useContext(ThemeCtx);
}

/**
 * Crea estilos temables sin costo por render.
 * @param {(t: typeof THEMES.light) => object} make — recibe los tokens del tema
 * @returns hook `useStyles()` que devuelve el StyleSheet del tema activo
 *
 * const useStyles = makeThemedStyles((t) => ({ card: { backgroundColor: t.surface } }));
 * function MiCard() { const s = useStyles(); return <View style={s.card} />; }
 */
export function makeThemedStyles(make) {
  const sheets = {
    light: StyleSheet.create(make(THEMES.light)),
    dark: StyleSheet.create(make(THEMES.dark)),
  };
  return function useStyles() {
    const t = useTheme();
    return sheets[t.name] || sheets.light;
  };
}
