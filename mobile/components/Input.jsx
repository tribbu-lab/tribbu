// Input del sistema — label + error + hint integrados, 44pt, temable.
// En light replica ui.input (sunken sobre card); en dark replica el authInput
// del login (overlay blanco con alpha sobre slate-900).

import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { TYPE, RADIUS, SPACE, MIN_TOUCH, STATUS } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 5 },
  input: {
    width: "100%",
    minHeight: MIN_TOUCH,
    paddingVertical: 11,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    fontSize: 14,
    backgroundColor: t.surfaceSunken,
    color: t.name === "dark" ? t.textStrong : t.text,
  },
  multiline: { minHeight: 88, paddingTop: 11, textAlignVertical: "top" },
  focused: { borderColor: t.accent },
  error: { borderColor: t.name === "dark" ? STATUS.danger.onDark : t.danger },
  withRight: { paddingRight: 44 },
  right: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  errorTxt: { ...TYPE.caption, color: t.danger, marginTop: SPACE.xs },
  hintTxt: { ...TYPE.caption, color: t.textFaint, marginTop: SPACE.xs },
}));

export function Input({
  label,
  error,          // string — pinta borde y mensaje
  hint,           // string — ayuda debajo (se oculta si hay error)
  right,          // nodo opcional a la derecha (ej. botón 👁 para contraseña)
  style,          // contenedor
  inputStyle,     // TextInput
  onFocus,
  onBlur,
  ...rest         // resto de props de TextInput (value, onChangeText, multiline…)
}) {
  const s = useStyles();
  const t = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View>
        <TextInput
          placeholderTextColor={t.placeholder}
          style={[
            s.input,
            rest.multiline && s.multiline,
            focused && s.focused,
            !!error && s.error,
            right && s.withRight,
            inputStyle,
          ]}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          {...rest}
        />
        {right ? <View style={s.right}>{right}</View> : null}
      </View>
      {error ? (
        <Text style={s.errorTxt}>{error}</Text>
      ) : hint ? (
        <Text style={s.hintTxt}>{hint}</Text>
      ) : null}
    </View>
  );
}
