// Campo de búsqueda de las listas (Avisos, Mensajes…): lupa + texto + ✕ para
// borrar. Mismo aspecto en todas las pantallas. Espejo web: src/components/Buscador.jsx.
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, RADIUS, SPACE } from "@shared/tokens";

const t = THEMES.light;

export function Buscador({ value, onChange, placeholder = "Buscar…", style }) {
  return (
    <View style={[styles.wrap, style]}>
      <MaterialCommunityIcons name="magnify" size={18} color={t.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.placeholder}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value ? (
        <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Borrar búsqueda">
          <MaterialCommunityIcons name="close-circle" size={17} color={t.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 42, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, marginBottom: SPACE.md },
  input: { flex: 1, fontSize: 14, color: t.text, paddingVertical: 0 },
});
