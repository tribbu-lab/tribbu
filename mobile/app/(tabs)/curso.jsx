// "Curso" — reemplaza a "Más": filas compactas agrupadas por quién lo
// organiza (Del colegio / De la comunidad, + "Room Parent" para quien
// administra el curso). Autorizaciones, Colectas y Encuestas muestran cuántas esperan algo de la familia
// (@shared/gestiones). La cuenta y las notificaciones viven en Mi cuenta
// (círculo con las iniciales del header).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, TYPE, SPACE, RADIUS, SLATE, BLUE } from "@shared/tokens";
import { fmtLocalDate } from "@shared/helpers";
import { cargarGestiones } from "@shared/gestiones";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { useRecarga } from "../../lib/useRecarga";
import { SelectorHijos } from "../../components/SelectorHijos";
import { supabase } from "../../lib/supabase";

const t = THEMES.light;

// Agrupado por quién lo organiza: el colegio o las familias del curso.
const GRUPOS_FAMILIA = [
  { titulo: "Del colegio", items: [
    { id: "autorizaciones", label: "Autorizaciones", desc: "Salidas y permisos", icon: "file-sign" },
    { id: "comedor", label: "Comedor", desc: "Menú y servicio de comedor", icon: "silverware-fork-knife" },
    { id: "fotos", label: "Fotos escolares", desc: "Elegí y pedí las fotos de tu hijo", icon: "camera-outline" },
    { id: "talleres", label: "Talleres", desc: "Actividades e inscripciones", icon: "palette-outline" },
    { id: "info", label: "Info útil", desc: "Útiles, uniformes, libros y alumnos", icon: "information-outline" },
    { id: "contacto", label: "Contacto", desc: "Secretaría y equipo del colegio", icon: "phone-outline" },
  ] },
  { titulo: "De la comunidad", items: [
    { id: "finanzas", label: "Colectas", desc: "Aportes y registro de pagos", icon: "hand-coin-outline", cuenta: "colectas" },
    { id: "encuestas", label: "Encuestas", desc: "Consultas entre las familias", icon: "chart-box-outline" },
    { id: "comunidad", label: "Marketplace", desc: "Comprá, vendé o regalá cosas usadas", icon: "shopping-outline" },
    { id: "perdidos", label: "Lost & Found", desc: "Objetos perdidos y encontrados", icon: "magnify-scan" },
  ] },
];
const GRUPO_ROOM = { titulo: "Room Parent", items: [
  { id: "admin", label: "Administrar el curso", desc: "Room Parent: datos del curso y horarios", icon: "cog-outline" },
] };
const GRUPOS_DOCENTE = [
  { titulo: "Mis cursos", items: [
    { id: "alumnos", label: "Alumnos", desc: "Tus alumnos y sus familias", icon: "account-school-outline" },
    { id: "autorizaciones", label: "Autorizaciones", desc: "Salidas y permisos", icon: "file-sign" },
    { id: "encuestas", label: "Encuestas", desc: "Consultas a las familias", icon: "chart-box-outline" },
    { id: "talleres", label: "Mis talleres", desc: "Inscriptos y avisos", icon: "palette-outline" },
  ] },
];

export default function CursoScreen() {
  const router = useRouter();
  const { isAdmin, esDocente, usuario, items, cursoIds } = useSession();
  const [cuentas, setCuentas] = useState({});
  const userId = usuario?.id ?? null;

  const cargar = useCallback(async () => {
    if (esDocente || !cursoIds?.length) return;
    const misHijos = (items || []).filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)).map((i) => ({ id: i.id, curso_id: i.curso_id }));
    try {
      setCuentas(await cargarGestiones(supabase, { cursoIds, misHijos, userId, hoy: fmtLocalDate() }));
    } catch {
      // sin contadores: las filas siguen andando
    }
  }, [esDocente, cursoIds, items, userId]);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const grupos = esDocente ? GRUPOS_DOCENTE : isAdmin ? [...GRUPOS_FAMILIA, GRUPO_ROOM] : GRUPOS_FAMILIA;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={!!refrescando} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Curso</Text>
      <Text style={styles.sub}>{esDocente ? "Tus alumnos y lo que publicás para sus familias." : "Lo del colegio y lo que organizan las familias."}</Text>
      <SelectorHijos style={{ marginTop: SPACE.md }} />
      {grupos.map((g) => (
        <View key={g.titulo}>
          <Text style={styles.grupo}>{g.titulo}</Text>
          <View style={styles.card}>
            {g.items.map((o, i) => {
              const n = cuentas[o.cuenta || o.id] || 0;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => router.push(`/(tabs)/${o.id}`)}
                  style={({ pressed }) => [styles.fila, i > 0 && styles.filaBorde, pressed && styles.filaPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={n ? `${o.label}: ${n} pendiente${n === 1 ? "" : "s"}` : o.label}
                >
                  <View style={styles.icono}>
                    <MaterialCommunityIcons name={o.icon} size={19} color={SLATE[600]} />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.filaTitulo}>{o.label}</Text>
                    <Text style={styles.filaDesc} numberOfLines={1}>{o.desc}</Text>
                  </View>
                  {n > 0 ? (
                    <View style={styles.cuenta}>
                      <Text style={styles.cuentaTxt}>{n}</Text>
                    </View>
                  ) : null}
                  <MaterialCommunityIcons name="chevron-right" size={20} color={SLATE[400]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: t.textMuted, marginTop: 4 },
  grupo: { ...TYPE.h3, fontSize: 15, fontWeight: "700", color: t.textStrong, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.xl, overflow: "hidden" },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  filaBorde: { borderTopWidth: 1, borderTopColor: t.border },
  filaPressed: { backgroundColor: SLATE[50] },
  icono: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  filaTitulo: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  filaDesc: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  cuenta: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: RADIUS.full, backgroundColor: t.accentSoft, alignItems: "center", justifyContent: "center" },
  cuentaTxt: { fontSize: 12, fontWeight: "800", color: BLUE[700] },
});
