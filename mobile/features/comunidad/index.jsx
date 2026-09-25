// Comunidad (puerto RN de src/features/comunidad): Marketplace, Lost&Found y
// Servicios (próximamente) bajo un mismo ítem de "Más". La sub-sección llega
// por param (?sub=marketplace|perdidos|servicios) desde el Muro y los push.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { THEMES, TYPE, SPACE } from "@shared/tokens";
import { Marketplace } from "../marketplace";
import { Perdidos } from "../perdidos";

const t = THEMES.light;
const SUBSECCIONES = [
  { id: "marketplace", label: "🛍️ Marketplace" },
  { id: "perdidos", label: "🧦 Lost&Found" },
  { id: "servicios", label: "🧑‍🏫 Servicios" },
];

function Proximamente() {
  return (
    <ScrollView contentContainerStyle={styles.proxWrap}>
      <View style={styles.proxCard}>
        <Text style={styles.proxEmoji}>🧑‍🏫</Text>
        <Text style={styles.proxBadge}>PRÓXIMAMENTE</Text>
        <Text style={styles.proxTitulo}>Servicios de la comunidad</Text>
        <Text style={styles.proxTxt}>En breve vas a poder ofrecer tus servicios en Tribbu: clases particulares, apoyo escolar, animación de cumpleaños, fotografía y más.</Text>
      </View>
    </ScrollView>
  );
}

export function Comunidad({ sub: subParam }) {
  const [sub, setSub] = useState(subParam || "marketplace");
  // Un deep-link nuevo (otro ?sub=) con la pantalla ya montada: ajustar en el render.
  const [ultimoParam, setUltimoParam] = useState(subParam);
  if (subParam !== ultimoParam) {
    setUltimoParam(subParam);
    if (subParam) setSub(subParam);
  }
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.h1}>Comunidad</Text>
        <Text style={styles.subtitulo}>Lo que las familias del colegio comparten entre ellas</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {SUBSECCIONES.map((s) => {
            const on = sub === s.id;
            return (
              <Pressable key={s.id} onPress={() => setSub(s.id)} style={[styles.tab, on && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.tabTxt, on && styles.tabTxtOn]}>{s.label}</Text>
                {s.id === "servicios" ? <Text style={[styles.pronto, on && styles.prontoOn]}>PRONTO</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={styles.flex1}>
        {sub === "marketplace" ? <Marketplace /> : null}
        {sub === "perdidos" ? <Perdidos embebido /> : null}
        {sub === "servicios" ? <Proximamente /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  flex1: { flex: 1 },
  header: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
  h1: { ...TYPE.h1, color: t.text },
  subtitulo: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  tabs: { gap: 8, paddingVertical: SPACE.md },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0" },
  tabOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  tabTxt: { fontSize: 13, fontWeight: "700", color: t.textMuted },
  tabTxtOn: { color: "white" },
  pronto: { fontSize: 9, fontWeight: "800", color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, overflow: "hidden" },
  prontoOn: { color: "white", backgroundColor: "rgba(255,255,255,0.18)" },
  proxWrap: { padding: SPACE.lg },
  proxCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 16, padding: 28, alignItems: "center" },
  proxEmoji: { fontSize: 38 },
  proxBadge: { marginTop: 10, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: "#92400E", backgroundColor: "#FEF3C7", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: "hidden" },
  proxTitulo: { fontSize: 17, fontWeight: "800", color: t.textStrong, marginTop: 12 },
  proxTxt: { fontSize: 13.5, color: t.textMuted, textAlign: "center", lineHeight: 20, marginTop: 6 },
});
