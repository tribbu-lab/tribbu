// Estado vacío, sobrio (mismo formato que "Estás al día" del Inicio): un
// círculo gris con un ícono de línea, título, nota y una acción opcional como
// enlace azul ("Crear la primera →"). Sin emojis.

import { View, Text, Pressable } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { SPACE, RADIUS, SLATE, BLUE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";

const useStyles = makeThemedStyles((t) => ({
  card: {
    flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 16,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 16,
  },
  sinBorde: { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4 },
  icono: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  flex1: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: t.textStrong },
  note: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },
  accion: { marginTop: 8, alignSelf: "flex-start", minHeight: 28, justifyContent: "center" },
  accionTxt: { fontSize: 14, fontWeight: "700", color: BLUE[600] },
}));

export function EmptyState({
  icon = "tray",
  title,
  note,
  actionLabel,     // ej. "Crear la primera"
  onAction,
  compact = false, // sin tarjeta, para usar dentro de otra Card
  style,
}) {
  const s = useStyles();
  return (
    <View style={[s.card, compact && s.sinBorde, style]}>
      <View style={s.icono}>
        <MaterialCommunityIcons name={icon} size={19} color={SLATE[600]} />
      </View>
      <View style={s.flex1}>
        {title ? <Text style={s.title}>{title}</Text> : null}
        {note ? <Text style={s.note}>{note}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} hitSlop={8} style={s.accion} accessibilityRole="button">
            <Text style={s.accionTxt}>{actionLabel} →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
