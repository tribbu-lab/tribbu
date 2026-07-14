// ─────────────────────────────────────────────────────────────────────────────
// tribbu · Design tokens (sistema de diseño)
// Puro JS, sin dependencias de plataforma: lo consumen la web (Vite) y la app
// mobile (Metro, vía alias `@shared/tokens`). Extiende src/lib/theme.js — no lo
// reemplaza: `T`, ROL_* y HIJO_* siguen siendo la fuente de verdad de esos
// valores; acá se formalizan rampas, temas semánticos (light/dark), tipografía,
// espaciado, radios, sombras y helpers de theming por rol/hijo.
// Referencia de uso: mobile/DESIGN_SYSTEM.md
// ─────────────────────────────────────────────────────────────────────────────

import { T, ROL_LABEL, ROL_COLOR, ROL_BG, HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "./theme";

// ── Primitivas: rampas de color ──────────────────────────────────────────────
// Escala slate (la base neutra de toda la UI; T.primary = SLATE[900], etc.)
export const SLATE = {
  50: "#F8FAFC", 100: "#F1F5F9", 200: "#E2E8F0", 300: "#CBD5E1", 400: "#94A3B8",
  500: "#64748B", 600: "#475569", 700: "#334155", 800: "#1E293B", 900: "#0F172A",
};

// Azul de marca (T.accent = BLUE[500])
export const BLUE = {
  50: "#EFF6FF", 100: "#DBEAFE", 200: "#BFDBFE", 300: "#93C5FD",
  400: "#60A5FA", 500: "#3B82F6", 600: "#2563EB", 700: "#1D4ED8",
};

// ── Helper: hex → rgba (puro, sin dependencias) ──────────────────────────────
export function withAlpha(hex, alpha) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// ── Estados semánticos ────────────────────────────────────────────────────────
// `main` = color pleno · `soft` = fondo suave · `border` = borde sobre soft ·
// `onDark` = variante legible sobre fondo oscuro (login/header).
export const STATUS = {
  danger:  { main: T.red,    soft: "#FEF2F2", border: "#FCA5A5", onDark: "#FCA5A5" },
  success: { main: T.green,  soft: "#F0FDF4", border: "#A7F3D0", onDark: "#6EE7B7" },
  warning: { main: T.yellow, soft: "#FFFBEB", border: "#FDE68A", onDark: "#FCD34D" },
  info:    { main: T.accent, soft: BLUE[50],  border: BLUE[200], onDark: BLUE[300] },
  purple:  { main: T.purple, soft: "#F5F3FF", border: "#DDD6FE", onDark: "#C4B5FD" },
};

// ── Temas semánticos ──────────────────────────────────────────────────────────
// Mismas claves en ambos temas. `light` = la app (cards blancas sobre slate-50).
// `dark` = la superficie de marca (login, AppHeader): overlays blancos con alpha
// sobre slate-900 — el patrón exacto de features/auth y AppHeader.
export const THEMES = {
  light: {
    name: "light",
    // superficies
    bg: T.bg,                    // fondo de pantalla
    surface: T.card,             // cards
    surface2: SLATE[100],        // controles secundarios / hover
    surfaceActive: SLATE[200],   // chip/control activo
    surfaceSunken: SLATE[50],    // inputs sobre card
    surfaceRaised: T.card,       // modals / sheets
    // bordes
    border: T.border,            // borde de card (slate-100)
    borderStrong: SLATE[200],    // borde de input/control
    // texto
    text: T.text,                // slate-800
    textStrong: T.primary,       // slate-900 (títulos)
    textMuted: T.muted,          // slate-500
    textFaint: SLATE[400],       // etiquetas, placeholders
    textInverse: T.white,
    placeholder: SLATE[400],
    // marca
    accent: T.accent,
    accentSoft: BLUE[50],
    onAccent: T.white,
    // estados
    danger: STATUS.danger.main,   dangerSoft: STATUS.danger.soft,   dangerBorder: STATUS.danger.border,
    success: STATUS.success.main, successSoft: STATUS.success.soft, successBorder: STATUS.success.border,
    warning: STATUS.warning.main, warningSoft: STATUS.warning.soft, warningBorder: STATUS.warning.border,
    // interacción
    overlay: withAlpha(SLATE[900], 0.5),
    pressed: withAlpha(SLATE[900], 0.06),
  },
  dark: {
    name: "dark",
    // superficies
    bg: T.primary,                             // slate-900
    surface: "rgba(255,255,255,0.07)",         // card del login
    surface2: "rgba(255,255,255,0.10)",        // iconBtn del header
    surfaceActive: "rgba(255,255,255,0.20)",   // chip activo del header
    surfaceSunken: "rgba(255,255,255,0.08)",   // inputs del login
    surfaceRaised: SLATE[800],                 // modals/pickers sobre dark
    // bordes
    border: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.15)",
    // texto
    text: "rgba(255,255,255,0.92)",
    textStrong: T.white,
    textMuted: "rgba(255,255,255,0.60)",
    textFaint: "rgba(255,255,255,0.40)",
    textInverse: T.primary,
    placeholder: "rgba(255,255,255,0.40)",
    // marca
    accent: T.accent,
    accentSoft: withAlpha(T.accent, 0.18),
    onAccent: T.white,
    // estados
    danger: STATUS.danger.onDark,   dangerSoft: withAlpha(T.red, 0.16),    dangerBorder: withAlpha(STATUS.danger.border, 0.4),
    success: STATUS.success.onDark, successSoft: withAlpha(T.green, 0.16), successBorder: withAlpha(T.green, 0.35),
    warning: STATUS.warning.onDark, warningSoft: withAlpha(T.yellow, 0.16), warningBorder: withAlpha(T.yellow, 0.35),
    // interacción
    overlay: "rgba(0,0,0,0.50)",
    pressed: "rgba(255,255,255,0.08)",
  },
};

// ── Theming por rol (first-class) ─────────────────────────────────────────────
// padre=azul · admin=verde · super=violeta. Deriva de ROL_* (theme.js).
export function roleTheme(rol) {
  return {
    label: ROL_LABEL[rol] || rol,
    main: ROL_COLOR[rol] || T.accent,
    soft: ROL_BG[rol] || BLUE[50],
    border: withAlpha(ROL_COLOR[rol] || T.accent, 0.35),
  };
}

// ── Theming por hijo (first-class) ────────────────────────────────────────────
// Cada hijo tiene un color de identidad (HIJO_COLORS_CUSTOM) usado en dots,
// avatares, bordes y acentos de sus cards. `childTheme` da las variantes seguras.
export function childTheme(color) {
  const c = color || HIJO_COLOR_DEFAULT;
  return {
    main: c,                       // dot, avatar, acentos
    soft: withAlpha(c, 0.14),      // fondos suaves (chips, avatar bg)
    border: withAlpha(c, 0.35),    // bordes de card/indicadores
  };
}
export { HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT };

// ── Tipografía ────────────────────────────────────────────────────────────────
// Pesos fuertes (700–900) para jerarquía: es la voz visual de tribbu.
// `money` usa tabular-nums para alinear montos es-AR en listas (Finanzas).
export const TYPE = {
  display:  { fontSize: 26, fontWeight: "900", letterSpacing: -1 },   // logo / números grandes
  h1:       { fontSize: 22, fontWeight: "900" },                      // título de pantalla
  h2:       { fontSize: 18, fontWeight: "800" },                      // título de sección/card
  h3:       { fontSize: 15, fontWeight: "800" },                      // título de fila
  body:     { fontSize: 14, fontWeight: "400", lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: "700" },
  small:    { fontSize: 13, fontWeight: "400", lineHeight: 18 },      // secundario
  caption:  { fontSize: 12, fontWeight: "400" },                      // metadatos
  label:    { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }, // section label
  chip:     { fontSize: 12, fontWeight: "600" },
  pill:     { fontSize: 10, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  money:    { fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  btn:      { fontSize: 14, fontWeight: "800" },
};

// ── Espaciado (grilla de 4pt) ─────────────────────────────────────────────────
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

// ── Radios ────────────────────────────────────────────────────────────────────
// input/control=md · botón=lg · sheet/modal=xl · card=xxl · pill/dot=full
export const RADIUS = { xs: 6, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, full: 999 };

// ── Elevación (sombras RN: shadow* iOS + elevation Android) ──────────────────
// Objetos puros: la web puede ignorarlos o mapearlos a box-shadow.
export const SHADOW = {
  none: {},
  card: {
    shadowColor: SLATE[900], shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  raised: {
    shadowColor: SLATE[900], shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
};

// ── Interacción / accesibilidad ───────────────────────────────────────────────
export const MIN_TOUCH = 44;   // objetivo táctil mínimo (pt)
export const HIT_SLOP = 8;     // hitSlop por defecto para íconos chicos
export const DURATION = { fast: 120, base: 200, slow: 300 }; // ms
