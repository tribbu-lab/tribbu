// Botón del sistema — variantes, tamaños, loading/disabled, 44pt garantizado.
// Variantes: primary (acción principal) · secondary (acento suave) ·
// outline (neutro con borde) · ghost (texto) · danger (destructivo).
// Temable: en dark (login/header) outline y ghost adoptan la paleta inversa.

import { Pressable, Text, ActivityIndicator } from "react-native";
import { BLUE, STATUS, TYPE, RADIUS, SPACE, MIN_TOUCH } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
  },
  md: { minHeight: 48, paddingVertical: 13 },
  sm: { minHeight: 36, paddingVertical: 7, paddingHorizontal: SPACE.md, borderRadius: RADIUS.md, alignSelf: "flex-start" },
  full: { alignSelf: "stretch" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },

  primary: { backgroundColor: t.accent },
  primaryTxt: { color: t.onAccent },
  secondary: { backgroundColor: t.accentSoft },
  secondaryTxt: { color: t.name === "dark" ? BLUE[300] : t.accent },
  outline: {
    backgroundColor: t.name === "dark" ? "transparent" : t.surface,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
  },
  outlineTxt: { color: t.name === "dark" ? t.textMuted : t.text },
  ghost: { backgroundColor: "transparent" },
  ghostTxt: { color: t.name === "dark" ? t.textMuted : t.accent },
  danger: { backgroundColor: STATUS.danger.main },
  dangerTxt: { color: "#FFFFFF" },

  txt: { ...TYPE.btn },
  txtSm: { fontSize: 13, fontWeight: "700" },
}));

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",          // "md" (48pt) | "sm" (36pt + hitSlop → 44pt efectivos)
  loading = false,
  disabled = false,
  icon,                 // emoji string opcional, ej. "📎"
  full,                 // default: md ocupa el ancho, sm es inline
  style,
  textStyle,
}) {
  const s = useStyles();
  const t = useTheme();
  const off = disabled || loading;
  const solid = variant === "primary" || variant === "danger";
  const isFull = full ?? size === "md";

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      hitSlop={size === "sm" ? (MIN_TOUCH - 36) / 2 : 0}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      style={({ pressed }) => [
        s.base,
        s[size],
        s[variant] || s.primary,
        isFull && s.full,
        off && s.disabled,
        pressed && !off && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={solid ? t.onAccent : t.accent} />
      ) : icon ? (
        <Text style={{ fontSize: size === "sm" ? 12 : 14 }}>{icon}</Text>
      ) : null}
      <Text style={[s.txt, size === "sm" && s.txtSm, s[`${variant}Txt`] || s.primaryTxt, textStyle]}>
        {title}
      </Text>
    </Pressable>
  );
}
