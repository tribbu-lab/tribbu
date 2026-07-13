// Estado vacío — un vacío es una invitación a actuar: emoji + título + nota
// y CTA opcional. Copy en español, directo ("Todavía no hay eventos.
// Creá el primero.").

import { View, Text } from "react-native";
import { TYPE, SPACE } from "@shared/tokens";
import { makeThemedStyles } from "../context/Theme";
import { Button } from "./Button";

const useStyles = makeThemedStyles((t) => ({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: SPACE.xxxl, paddingHorizontal: SPACE.xxl },
  compact: { paddingVertical: SPACE.xl },
  emoji: { fontSize: 44, marginBottom: SPACE.md },
  emojiCompact: { fontSize: 28, marginBottom: SPACE.sm },
  title: { ...TYPE.h3, color: t.text, marginBottom: SPACE.xs, textAlign: "center" },
  note: { ...TYPE.small, color: t.textMuted, textAlign: "center", maxWidth: 280 },
  action: { marginTop: SPACE.lg },
}));

export function EmptyState({
  emoji = "🗂️",
  title,
  note,
  actionLabel,     // ej. "Crear evento"
  onAction,
  compact = false, // versión reducida para usar dentro de una Card
  style,
}) {
  const s = useStyles();
  return (
    <View style={[s.wrap, compact && s.compact, style]}>
      <Text style={[s.emoji, compact && s.emojiCompact]}>{emoji}</Text>
      {title ? <Text style={s.title}>{title}</Text> : null}
      {note ? <Text style={s.note}>{note}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          title={actionLabel}
          onPress={onAction}
          variant="secondary"
          size="sm"
          full={false}
          style={s.action}
        />
      ) : null}
    </View>
  );
}
