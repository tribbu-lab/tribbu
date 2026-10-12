// Vista de la docente — puerto RN de src/features/docente (specs/docentes-
// clases-y-grupos.md, Fase B). Alumnos de sus cursos con los NOMBRES de sus
// apoderados (RPC alumnos_de_curso_docente — nunca teléfono ni email) y
// "Escribir a la familia", que abre el hilo alumno × maestra en Mensajes.
import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Pressable, TextInput, FlatList, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { useRecarga } from "../../lib/useRecarga";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";

const t = THEMES.light;
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AlumnosDocente() {
  const { cursoIds, esVistaTodos, tagDeCurso, usuario } = useSession();
  const router = useRouter();
  const [porCurso, setPorCurso] = useState(null);
  const [q, setQ] = useState("");
  const maestroId = usuario?.maestros?.[0]?.id ?? null;

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) { setPorCurso({}); return; }
    const res = await Promise.all(cursoIds.map((cid) => supabase.rpc("alumnos_de_curso_docente", { p_curso: cid })));
    setPorCurso(Object.fromEntries(cursoIds.map((cid, i) => [cid, res[i].data || []])));
  }, [cursoIds]);
  useEffect(() => { cargar(); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  // Lista plana con encabezados de curso (en "Todos").
  const filas = useMemo(() => {
    if (!porCurso) return [];
    const tq = sinAcentos(q).trim();
    const out = [];
    for (const cid of cursoIds || []) {
      const lista = (porCurso[cid] || []).filter((a) => !tq || sinAcentos(`${a.nombre} ${a.apellido} ${(a.apoderados || []).map((p) => p.nombre).join(" ")}`).includes(tq));
      if (!lista.length) continue;
      if (esVistaTodos) out.push({ key: `h-${cid}`, tipo: "curso", cid });
      for (const a of lista) out.push({ key: a.hijo_id, tipo: "alumno", a, cid });
    }
    return out;
  }, [porCurso, q, cursoIds, esVistaTodos]);

  const escribir = (a, cid) => router.push({
    pathname: "/(tabs)/mensajes",
    params: { hijo: a.hijo_id, maestro: maestroId, alumnoNombre: `${a.nombre} ${a.apellido || ""}`.trim(), curso: cid, t: String(Date.now()) },
  });

  if (porCurso === null) return <ActivityIndicator style={{ marginTop: SPACE.xl }} color={t.accent} />;
  return (
    <FlatList
      style={s.screen}
      data={filas}
      keyExtractor={(f) => f.key}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <Text style={s.h1}>Alumnos</Text>
          <Text style={s.sub}>Escribile a la familia sin compartir teléfonos. El colegio puede ver estos chats.</Text>
          <TextInput value={q} onChangeText={setQ} placeholder="Buscar alumno o familia…" placeholderTextColor={t.placeholder} style={s.input} accessibilityLabel="Buscar alumno" />
        </View>
      }
      ListEmptyComponent={<Text style={s.vacio}>{q ? "No encontramos a ese alumno." : "Todavía no tenés alumnos: pedile al colegio que te asigne tus clases."}</Text>}
      renderItem={({ item: f }) => {
        if (f.tipo === "curso") {
          const tag = tagDeCurso?.(f.cid);
          return (
            <View style={s.cursoRow}>
              <View style={[s.dot, { backgroundColor: tag?.color || SLATE[400] }]} />
              <Text style={s.cursoTxt}>{tag?.nombre || "Curso"}</Text>
            </View>
          );
        }
        const { a } = f;
        const tieneFamilia = (a.apoderados || []).length > 0;
        return (
          <View style={s.card}>
            <View style={s.flex1}>
              <Text style={s.nombre}>{a.apellido ? `${a.apellido}, ${a.nombre}` : a.nombre}</Text>
              <Text style={s.familia} numberOfLines={2}>{tieneFamilia ? a.apoderados.map((p) => p.nombre).join(" · ") : "Sin apoderados con cuenta"}</Text>
            </View>
            {tieneFamilia && maestroId ? (
              <Pressable onPress={() => escribir(a, f.cid)} style={s.btn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Escribir a la familia de ${a.nombre}`}>
                <MaterialCommunityIcons name="message-outline" size={15} color={BLUE[700]} />
                <Text style={s.btnTxt}>Escribir</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong },
  sub: { ...TYPE.caption, color: t.textMuted, marginBottom: SPACE.md },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: 10, fontSize: 15, color: t.text, backgroundColor: t.surface, marginBottom: SPACE.md },
  vacio: { textAlign: "center", color: t.textMuted, padding: SPACE.xl, fontSize: 13 },
  cursoRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.sm },
  cursoTxt: { ...TYPE.label, color: t.textMuted },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { flexDirection: "row", alignItems: "center", gap: SPACE.md, backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: SPACE.md, marginBottom: SPACE.sm },
  flex1: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: "700", color: t.textStrong },
  familia: { fontSize: 12.5, color: t.textMuted, marginTop: 2 },
  btn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, minHeight: 36, borderRadius: RADIUS.full, borderWidth: 1, borderColor: BLUE[200], backgroundColor: BLUE[50] },
  btnTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[700] },
});
