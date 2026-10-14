// "‹ Curso" arriba de las pantallas de la sección Curso (Autorizaciones,
// Comedor, Colectas, etc.): sin esto, la única forma de volver era la barra
// de abajo. Siempre va a Curso, aunque la pantalla se haya abierto desde Hoy
// o desde una notificación.

import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, BLUE, SPACE } from "@shared/tokens";

const t = THEMES.light;

export function ConVolverCurso({ children }) {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      <View style={styles.barra}>
        <Pressable onPress={() => router.navigate("/(tabs)/curso")} hitSlop={10} style={styles.boton} accessibilityRole="button" accessibilityLabel="Volver a Curso">
          <MaterialCommunityIcons name="chevron-left" size={22} color={BLUE[600]} />
          <Text style={styles.txt}>Curso</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: t.bg },
  barra: { paddingHorizontal: SPACE.md, paddingTop: SPACE.sm },
  boton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", minHeight: 36, paddingRight: 8 },
  txt: { fontSize: 15, fontWeight: "700", color: BLUE[600] },
});
