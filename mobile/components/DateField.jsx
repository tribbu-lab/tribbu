// DateField — campo de fecha que abre el calendario nativo (reemplaza los
// TextInput libres "AAAA-MM-DD"). value es un string "AAAA-MM-DD" (o vacío);
// onChange recibe el string ya formateado, así los forms existentes no cambian.
// Android: diálogo nativo de calendario. iOS: calendario inline en un Modal propio.

import { useState } from "react";
import { View, Text, Pressable, Platform, Modal, StyleSheet } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SPACE, RADIUS } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

const parseYmd = (v) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((v || "").trim());
  // new Date(y, m, d) usa hora local — new Date("AAAA-MM-DD") sería UTC y
  // correría la fecha un día en UTC-3.
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
};
const fmtYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const useStyles = makeThemedStyles((t) => ({
  value: { flex: 1, fontSize: 14, color: t.name === "dark" ? t.textStrong : t.text },
  placeholder: { color: t.placeholder },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: SPACE.lg,
  },
  sheet: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
  },
  doneBtn: {
    alignSelf: "flex-end",
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    minHeight: 44,
    justifyContent: "center",
  },
  doneTxt: { color: t.accent, fontWeight: "700", fontSize: 15 },
}));

export function DateField({
  value,
  onChange,          // (str "AAAA-MM-DD" | "") => void
  placeholder = "Elegir fecha",
  clearable = false, // muestra ✕ para vaciar (campos opcionales)
  style,             // estilo del input del modal que lo usa (styles.input)
}) {
  const s = useStyles();
  const t = useTheme();
  const [open, setOpen] = useState(false);

  const onPicked = (event, date) => {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "set" && date) onChange(fmtYmd(date));
    } else if (date) {
      onChange(fmtYmd(date));
    }
  };

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={[style, inner.row]}>
        <Text style={[s.value, !value && s.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {clearable && value ? (
          <Pressable hitSlop={10} onPress={() => onChange("")} style={inner.clear}>
            <MaterialCommunityIcons name="close-circle" size={18} color={t.textFaint} />
          </Pressable>
        ) : null}
        <MaterialCommunityIcons name="calendar-month-outline" size={18} color={t.textFaint} />
      </Pressable>

      {open && Platform.OS === "android" ? (
        <DateTimePicker value={parseYmd(value)} mode="date" display="default" onChange={onPicked} />
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.overlay} onPress={() => setOpen(false)}>
            <Pressable style={s.sheet}>
              <DateTimePicker
                value={parseYmd(value)}
                mode="date"
                display="inline"
                locale="es"
                themeVariant={t.name === "dark" ? "dark" : "light"}
                accentColor={t.accent}
                onChange={onPicked}
              />
              <Pressable
                style={s.doneBtn}
                onPress={() => {
                  if (!value) onChange(fmtYmd(new Date()));
                  setOpen(false);
                }}
              >
                <Text style={s.doneTxt}>Listo</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const inner = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  clear: { alignItems: "center", justifyContent: "center" },
});
