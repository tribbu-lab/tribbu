// SelectChip — filtro colapsado del sistema (patrón A3): un chip que abre un
// Sheet con las opciones (48pt por fila, check en la activa). Con `icon` (nombre
// MaterialCommunityIcons) muestra "icono + Valor" y el label queda para el Sheet
// y accesibilidad (Recordatorios); con `prefix` muestra "Label: Valor"; sin
// ninguno muestra el label como placeholder y el valor corto cuando hay filtro
// activo (Cumpleaños). El chip se tiñe (accentSoft) cuando el valor ≠ "all".

import { useState } from "react";
import { Text, Pressable, ScrollView } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { RADIUS, BLUE } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";
import { Sheet } from "./Sheet";

const useStyles = makeThemedStyles((t) => ({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  chipOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  lbl: { fontSize: 12, fontWeight: "600", color: t.textFaint },
  val: { fontSize: 12, fontWeight: "700", color: t.text },
  valOn: { color: BLUE[600] },
  opts: { maxHeight: 420 },
  optRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  optTxt: { fontSize: 14, color: t.text },
  optTxtOn: { fontWeight: "800", color: BLUE[600] },
}));

export function SelectChip({ label, value, options, onChange, prefix = true, icon, style }) {
  const [open, setOpen] = useState(false);
  const s = useStyles();
  const t = useTheme();
  const actual = options.find((o) => o.value === value);
  const activo = value != null && value !== "all";
  const display = icon || prefix ? actual?.label : activo ? actual?.short || actual?.label : label;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[s.chip, activo && s.chipOn, style]}
        accessibilityRole="button"
        accessibilityLabel={`Filtro ${label}`}
      >
        {icon ? (
          <MaterialCommunityIcons name={icon} size={15} color={activo ? BLUE[600] : t.textFaint} />
        ) : prefix ? (
          <Text style={s.lbl}>{label}:</Text>
        ) : null}
        <Text style={[s.val, activo && s.valOn]}>{display}</Text>
        <MaterialCommunityIcons name="chevron-down" size={14} color={activo ? BLUE[600] : t.textFaint} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <ScrollView style={s.opts}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={s.optRow}
              >
                <Text style={[s.optTxt, on && s.optTxtOn]}>{o.label}</Text>
                {on ? <MaterialCommunityIcons name="check" size={18} color={BLUE[600]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}
