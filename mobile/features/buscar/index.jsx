// Buscador global (handoff Tribbu App.dc.html, Parte 1 #3): con más de un
// curso el volumen de recordatorios/eventos/colectas ya justifica poder
// buscar en vez de solo scrollear. Consulta recordatorios/eventos/hijos/
// colectas del alcance actual (cursoIds — respeta "Mi acceso"/vista Todos),
// con filtros por tipo. No hay Edge Function ni tabla nueva: todo se resuelve
// con `.ilike` sobre las tablas existentes, acotado a cursoIds.

import { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../context/Session";
import { THEMES, TYPE, SPACE, RADIUS, BLUE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";

const t = THEMES.light;

const FILTROS = [
  { key: "todos", label: "Todo" },
  { key: "recordatorio", label: "Recordatorios" },
  { key: "evento", label: "Eventos" },
  { key: "familia", label: "Familias" },
  { key: "colecta", label: "Colectas" },
];

const ICONS = {
  recordatorio: "pin-outline",
  evento: "calendar-month-outline",
  familia: "account-outline",
  colecta: "cash-multiple",
};

export function Buscar() {
  const { cursoIds, tagDeCurso, esVistaTodos } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const debounceRef = useRef(null);

  const buscar = useCallback(
    async (q) => {
      const texto = q.trim();
      if (!cursoIds?.length || texto.length < 2) {
        setResultados([]);
        return;
      }
      setCargando(true);
      const like = `%${texto}%`;
      const [recs, evs, hijos, cols] = await Promise.all([
        supabase.from("recordatorios").select("id,texto,fecha,curso_id").in("curso_id", cursoIds).ilike("texto", like).limit(15),
        supabase.from("eventos").select("id,titulo,fecha,tipo,curso_id").in("curso_id", cursoIds).ilike("titulo", like).limit(15),
        supabase
          .from("hijos")
          .select("id,nombre,apellido,curso_id")
          .in("curso_id", cursoIds)
          .or(`nombre.ilike.${like},apellido.ilike.${like}`)
          .limit(15),
        supabase.from("colectas").select("id,titulo,monto,curso_id").in("curso_id", cursoIds).ilike("titulo", like).limit(15),
      ]);

      const items = [
        ...(recs.data || []).map((r) => ({ _tipo: "recordatorio", id: `rec-${r.id}`, raw: r, titulo: r.texto, meta: r.fecha, curso_id: r.curso_id })),
        ...(evs.data || []).map((e) => ({ _tipo: "evento", id: `ev-${e.id}`, raw: e, titulo: e.titulo, meta: e.fecha, curso_id: e.curso_id })),
        ...(hijos.data || []).map((h) => ({
          _tipo: "familia",
          id: `hijo-${h.id}`,
          raw: h,
          titulo: `${h.nombre} ${h.apellido || ""}`.trim(),
          meta: null,
          curso_id: h.curso_id,
        })),
        ...(cols.data || []).map((c) => ({
          _tipo: "colecta",
          id: `col-${c.id}`,
          raw: c,
          titulo: c.titulo,
          meta: c.monto ? `$ ${Number(c.monto).toLocaleString("es-AR")}` : null,
          curso_id: c.curso_id,
        })),
      ];
      setResultados(items);
      setCargando(false);
    },
    [cursoIds]
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(query), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, buscar]);

  const filtrados = tipo === "todos" ? resultados : resultados.filter((r) => r._tipo === tipo);

  const abrir = (item) => {
    if (item._tipo === "recordatorio") router.push("/(tabs)/recordatorios");
    else if (item._tipo === "evento") router.push({ pathname: "/(tabs)/calendario", params: { openFecha: item.raw.fecha } });
    else if (item._tipo === "colecta") router.push({ pathname: "/(tabs)/finanzas", params: { openColecta: String(item.raw.id) } });
    // familia: sin pantalla propia navegable para apoderados (Alumnos es
    // solo para admin) — el resultado queda informativo, sin acción.
  };

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <MaterialCommunityIcons name="magnify" size={18} color={t.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar recordatorios, eventos, familias, colectas..."
          placeholderTextColor={t.textFaint}
          style={styles.input}
          autoFocus
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Limpiar búsqueda">
            <MaterialCommunityIcons name="close-circle" size={16} color={t.textFaint} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chips}>
        {FILTROS.map((f) => (
          <Pressable key={f.key} onPress={() => setTipo(f.key)} style={[styles.chip, tipo === f.key && styles.chipOn]}>
            <Text style={[styles.chipTxt, tipo === f.key && styles.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {query.trim().length < 2 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="magnify" size={40} color={t.borderStrong} />
          <Text style={styles.emptyTxt}>Escribí al menos 2 letras para buscar</Text>
        </View>
      ) : cargando ? (
        <Text style={styles.muted}>Buscando...</Text>
      ) : (
        <FlatList
          data={filtrados}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: SPACE.lg, paddingBottom: TAB_BAR_SPACE }}
          renderItem={({ item }) => {
            const tag = esVistaTodos && tagDeCurso ? tagDeCurso(item.curso_id) : null;
            const navegable = item._tipo !== "familia";
            return (
              <Pressable onPress={() => abrir(item)} disabled={!navegable} style={styles.row}>
                <View style={styles.rowIcon}>
                  <MaterialCommunityIcons name={ICONS[item._tipo]} size={16} color={BLUE[600]} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.rowTitulo} numberOfLines={2}>
                    {item.titulo}
                  </Text>
                  <View style={styles.rowMetaRow}>
                    {item.meta ? <Text style={styles.rowMeta}>{item.meta}</Text> : null}
                    {tag ? <Text style={[styles.rowMeta, { color: tag.color, fontWeight: "700" }]}>{tag.nombre}</Text> : null}
                  </View>
                </View>
                {navegable ? <MaterialCommunityIcons name="chevron-right" size={18} color={t.textFaint} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="magnify-close" size={40} color={t.borderStrong} />
              <Text style={styles.emptyTxt}>Sin resultados para "{query.trim()}"</Text>
              <Pressable onPress={() => setQuery("")} style={styles.limpiarBtn}>
                <Text style={styles.limpiarTxt}>Limpiar búsqueda</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg, paddingTop: SPACE.lg },
  flex1: { flex: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    marginHorizontal: SPACE.lg,
    minHeight: 46,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  input: { flex: 1, fontSize: 14, color: t.textStrong, paddingVertical: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginHorizontal: SPACE.lg, marginTop: SPACE.md, marginBottom: SPACE.sm },
  chip: { minHeight: 32, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  chipTxtOn: { color: "#FFFFFF" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 56,
    padding: SPACE.md,
    marginBottom: 8,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  rowIcon: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  rowTitulo: { fontSize: 13.5, fontWeight: "700", color: t.textStrong, marginBottom: 3 },
  rowMetaRow: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  rowMeta: { fontSize: 11, color: t.textFaint, fontWeight: "600" },
  emptyWrap: { alignItems: "center", paddingTop: 56, paddingHorizontal: SPACE.xl },
  emptyTxt: { fontSize: 13, color: t.textFaint, textAlign: "center", marginTop: 10 },
  limpiarBtn: { marginTop: 14, minHeight: 40, paddingHorizontal: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  limpiarTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  muted: { textAlign: "center", color: t.textFaint, fontSize: 13, marginTop: 40 },
});
