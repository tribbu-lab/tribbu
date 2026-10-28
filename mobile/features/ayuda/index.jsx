// Ayuda (Mi cuenta → Ayuda y soporte): preguntas frecuentes de cada perfil
// (familias, docentes, panel del colegio), con buscador, botón a cada
// pantalla y al final "Escribile al equipo de tribbu". Puerto de
// src/features/ayuda; contenido en @shared/ayuda. PreguntasFrecuentes (sin
// ScrollView propio) la usa también el panel del colegio.
import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { buscarPreguntas, preguntasPara, PREGUNTAS_FRECUENTES } from "@shared/ayuda";
import { THEMES, SLATE, BLUE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { EmptyState } from "../../components/EmptyState";
import { useSession } from "../../context/Session";

const t = THEMES.light;

/**
 * Buscador + preguntas + "Escribile al equipo de tribbu". `destino`: qué
 * clave de `ir` usa el botón ("mobile" = ruta, "panel" = sección del panel);
 * `puedeIr(valor)` descarta destinos que esta pantalla no tiene.
 */
export function PreguntasFrecuentes({ lista = PREGUNTAS_FRECUENTES, destino = "mobile", onIr, puedeIr = () => true, onSoporte }) {
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState(null);
  const grupos = buscarPreguntas(busqueda, lista);
  return (
    <View>
      <View style={s.buscar}>
        <MaterialCommunityIcons name="magnify" size={18} color={SLATE[400]} />
        <TextInput value={busqueda} onChangeText={setBusqueda} placeholder={lista === PREGUNTAS_FRECUENTES ? "Buscar: colecta, autorización…" : "Buscar: comunicado, mensaje…"} placeholderTextColor={t.placeholder} style={s.buscarInput} accessibilityLabel="Buscar en la ayuda" />
      </View>

      {grupos.length === 0 ? (
        <EmptyState icon="magnify" title="No encontramos nada con esa búsqueda" note="Probá con otra palabra o escribile al equipo de tribbu." actionLabel="Escribirnos" onAction={onSoporte} />
      ) : grupos.map((g) => (
        <View key={g.tema} style={s.grupo}>
          <Text style={s.tema}>{g.tema.toUpperCase()}</Text>
          <View style={s.card}>
            {g.items.map((p, i) => {
              const open = abierta === p.id || (!!busqueda.trim() && g.items.length === 1);
              const ir = p.ir?.[destino];
              return (
                <View key={p.id} style={i ? s.borde : null}>
                  <Pressable onPress={() => setAbierta((a) => (a === p.id ? null : p.id))} style={s.fila} accessibilityRole="button" accessibilityState={{ expanded: open }}>
                    <Text style={s.pregunta}>{p.pregunta}</Text>
                    <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={20} color={SLATE[400]} />
                  </Pressable>
                  {open ? (
                    <View style={s.respuestaCaja}>
                      <Text style={s.respuesta}>{p.respuesta}</Text>
                      {ir && onIr && puedeIr(ir) ? (
                        <Pressable onPress={() => onIr(ir)} hitSlop={6} style={s.irBtn}>
                          <Text style={s.irTxt}>{p.ir.label} →</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}

      <Pressable onPress={onSoporte} style={[s.card, s.soporte]} accessibilityRole="button">
        <View style={s.soporteIcono}><MaterialCommunityIcons name="lifebuoy" size={20} color={t.textMuted} /></View>
        <View style={s.flex1}>
          <Text style={s.soporteTitulo}>¿No encontraste lo que buscabas?</Text>
          <Text style={s.soporteSub}>Escribile al equipo de tribbu</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
      </Pressable>
    </View>
  );
}

export function Ayuda() {
  const router = useRouter();
  const { usuario } = useSession();
  const soporte = () => router.push({ pathname: "/(tabs)/mensajes", params: { soporte: "1", t: String(Date.now()) } });

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.push("/(tabs)/cuenta")} style={s.volver} hitSlop={8} accessibilityRole="button">
        <MaterialCommunityIcons name="chevron-left" size={20} color={BLUE[600]} />
        <Text style={s.volverTxt}>Mi cuenta</Text>
      </Pressable>
      <Text style={s.titulo}>Ayuda</Text>
      <Text style={s.sub}>Cómo hacer lo básico en tribbu. Si no encontrás lo que buscás, escribinos.</Text>
      <PreguntasFrecuentes lista={preguntasPara(usuario?.rol)} onIr={(ruta) => router.push(ruta)} onSoporte={soporte} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: 16, paddingBottom: TAB_BAR_SPACE + 16 },
  volver: { flexDirection: "row", alignItems: "center", marginBottom: 8, alignSelf: "flex-start" },
  volverTxt: { fontSize: 14, fontWeight: "700", color: BLUE[600] },
  titulo: { fontSize: 21, fontWeight: "800", color: t.textStrong },
  sub: { fontSize: 13.5, color: t.textMuted, marginTop: 4, marginBottom: 14 },
  buscar: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 12, backgroundColor: "white", marginBottom: 16 },
  buscarInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: t.text },
  grupo: { marginBottom: 16 },
  tema: { fontSize: 11.5, fontWeight: "800", color: SLATE[400], letterSpacing: 0.7, marginBottom: 8, marginLeft: 2 },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: t.borderStrong || "#E7ECF3", borderRadius: 16, overflow: "hidden" },
  borde: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  pregunta: { flex: 1, fontSize: 14.5, fontWeight: "700", color: t.textStrong, lineHeight: 20 },
  respuestaCaja: { paddingHorizontal: 16, paddingBottom: 16 },
  respuesta: { fontSize: 14, color: t.text, lineHeight: 21 },
  irBtn: { marginTop: 10, alignSelf: "flex-start" },
  irTxt: { fontSize: 13.5, fontWeight: "700", color: BLUE[600] },
  soporte: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginTop: 4 },
  soporteIcono: { width: 38, height: 38, borderRadius: 19, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  flex1: { flex: 1 },
  soporteTitulo: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  soporteSub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
});
