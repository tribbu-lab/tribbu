// Badge — superset temable de Pill: tonos semánticos, dot opcional y tamaños.
// Para roles usar <RoleBadge rol/>; para estados, tone. Pill (legacy) sigue
// disponible para código existente.

import { View, Text } from "react-native";
import { BLUE, STATUS, TYPE, RADIUS, withAlpha, roleTheme } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => {
  const dark = t.name === "dark";
  return {
    base: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", borderRadius: RADIUS.full },
    sm: { paddingVertical: 4, paddingHorizontal: 12 },
    md: { paddingVertical: 6, paddingHorizontal: 12 },
    txtSm: { ...TYPE.pill },
    txtMd: { ...TYPE.chip, fontWeight: "700" },
    dot: { width: 7, height: 7, borderRadius: RADIUS.full },

    // tonos: fondo suave + texto pleno (dark usa las variantes onDark/alpha)
    accent: { backgroundColor: t.accentSoft },
    accentTxt: { color: dark ? BLUE[300] : t.accent },
    accentDot: { backgroundColor: dark ? BLUE[300] : t.accent },
    success: { backgroundColor: t.successSoft },
    successTxt: { color: t.success },
    successDot: { backgroundColor: t.success },
    warning: { backgroundColor: t.warningSoft },
    warningTxt: { color: dark ? t.warning : "#B45309" }, // amber-700: legible sobre soft
    warningDot: { backgroundColor: t.warning },
    danger: { backgroundColor: t.dangerSoft },
    dangerTxt: { color: t.danger },
    dangerDot: { backgroundColor: t.danger },
    purple: { backgroundColor: dark ? withAlpha(STATUS.purple.main, 0.18) : STATUS.purple.soft },
    purpleTxt: { color: dark ? STATUS.purple.onDark : STATUS.purple.main },
    purpleDot: { backgroundColor: dark ? STATUS.purple.onDark : STATUS.purple.main },
    neutral: { backgroundColor: t.surface2 },
    neutralTxt: { color: t.textMuted },
    neutralDot: { backgroundColor: t.textMuted },
  };
});

export function Badge({
  label,
  tone = "accent",   // accent | success | warning | danger | purple | neutral
  size = "sm",       // sm (píldora 10pt upper) | md (chip 12pt)
  dot = false,       // true → dot del tono; string → dot de ese color (ej. color de hijo)
  color,             // override: color de texto (+ dot); genera bg con alpha si no hay bg
  bg,                // override: color de fondo
  style,
  textStyle,
}) {
  const s = useStyles();
  const custom = !!(color || bg);
  return (
    <View style={[s.base, s[size] || s.sm, custom ? { backgroundColor: bg || withAlpha(color, 0.12) } : s[tone] || s.accent, style]}>
      {dot ? (
        <View
          style={[
            s.dot,
            typeof dot === "string"
              ? { backgroundColor: dot }
              : custom
                ? { backgroundColor: color }
                : s[`${tone}Dot`] || s.accentDot,
          ]}
        />
      ) : null}
      <Text
        style={[
          size === "md" ? s.txtMd : s.txtSm,
          color ? { color } : s[`${tone}Txt`] || s.accentTxt,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/** Badge de rol — padre/admin/super con su color y label canónicos (ROL_*). */
export function RoleBadge({ rol, size = "sm", style }) {
  const rt = roleTheme(rol);
  return <Badge label={rt.label} color={rt.main} bg={rt.soft} size={size} style={style} />;
}
