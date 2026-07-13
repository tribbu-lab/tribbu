// Controles de paginación — se integra con useListControls.
// hitSlop vertical para llegar al objetivo táctil sin agrandar el control.

import { View, Text, Pressable } from "react-native";
import { SLATE, TYPE, RADIUS, SPACE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: SPACE.lg,
  },
  btn: {
    minWidth: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: "center",
  },
  pressed: { opacity: 0.6 },
  btnTxt: { fontSize: 13, color: t.textStrong, fontWeight: "700" },
  btnTxtDisabled: { color: t.name === "dark" ? t.textFaint : SLATE[300] },
  label: { ...TYPE.caption, color: t.textMuted, paddingHorizontal: SPACE.sm },
}));

export function Paginador({ pagina, totalPag, setPagina }) {
  const s = useStyles();
  if (totalPag <= 1) return null;

  const Btn = ({ onPress, disabled, label }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 8, bottom: 8 }}
      style={({ pressed }) => [s.btn, pressed && !disabled && s.pressed]}
    >
      <Text style={[s.btnTxt, disabled && s.btnTxtDisabled]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={s.row}>
      <Btn onPress={() => setPagina(1)} disabled={pagina === 1} label="«" />
      <Btn onPress={() => setPagina((p) => p - 1)} disabled={pagina === 1} label="‹" />
      <Text style={s.label}>
        Pág. {pagina} de {totalPag}
      </Text>
      <Btn onPress={() => setPagina((p) => p + 1)} disabled={pagina === totalPag} label="›" />
      <Btn onPress={() => setPagina(totalPag)} disabled={pagina === totalPag} label="»" />
    </View>
  );
}
