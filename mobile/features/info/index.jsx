// Info Útil (puerto RN de src/features/info). Sub-pestañas: Útiles, Uniformes,
// Libros y Alumnos. Checklists "adquirido" por usuario; el admin agrega/edita
// ítems (texto). Links de descarga abren con Linking + safeUrl. Las cargas por
// imagen (tapa de libro) y la exportación a PDF de la web quedan para más
// adelante (necesitan image-picker / generación de PDF nativa).

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Image,
  Linking,
  StyleSheet,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { safeUrl } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Alumnos } from "../contacto";

const t = THEMES.light;

const abrir = async (url) => {
  const safe = safeUrl(url);
  if (!safe) return;
  try {
    await Linking.openURL(safe);
  } catch {
    /* esquema no soportado */
  }
};

const SUBS = [
  { id: "utiles", l: "Útiles" },
  { id: "uniformes", l: "Uniformes" },
  { id: "libros", l: "Libros" },
  { id: "alumnos", l: "Alumnos" },
];

export function InfoUtil() {
  const { cursoId, usuario, isAdmin } = useSession();
  const userId = usuario?.id ?? null;
  const [sec, setSec] = useState("utiles");

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <Text style={styles.h1}>Info Útil</Text>
        <Text style={styles.subtitle}>Listas y uniformes del curso</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabs}>
          {SUBS.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSec(s.id)}
              style={[styles.subTab, sec === s.id && styles.subTabActive]}
            >
              <Text style={[styles.subTabTxt, sec === s.id && styles.subTabTxtActive]}>{s.l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {sec === "utiles" ? <Utiles cursoId={cursoId} userId={userId} isAdmin={isAdmin} /> : null}
      {sec === "uniformes" ? <Uniformes cursoId={cursoId} userId={userId} /> : null}
      {sec === "libros" ? <Libros cursoId={cursoId} userId={userId} isAdmin={isAdmin} /> : null}
      {sec === "alumnos" ? <Alumnos /> : null}
    </View>
  );
}

// ── Checklist genérica (Útiles) ─────────────────────────────────────────────
function Utiles({ cursoId, userId, isAdmin }) {
  const [utiles, setUtiles] = useState([]);
  const [adquiridos, setAdquiridos] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});

  const cargar = useCallback(async () => {
    const [ut, adq] = await Promise.all([
      supabase.from("utiles").select("*").eq("curso_id", cursoId).order("categoria").order("item"),
      userId
        ? supabase.from("util_adquirido").select("util_id").eq("usuario_id", userId)
        : Promise.resolve({ data: [] }),
    ]);
    setUtiles(ut.data || []);
    setAdquiridos(new Set((adq.data || []).map((r) => r.util_id)));
  }, [cursoId, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggle = async (id) => {
    if (!userId) return;
    if (adquiridos.has(id)) {
      await supabase.from("util_adquirido").delete().eq("util_id", id).eq("usuario_id", userId);
      setAdquiridos((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    } else {
      await supabase.from("util_adquirido").insert({ util_id: id, usuario_id: userId });
      setAdquiridos((p) => new Set([...p, id]));
    }
  };

  const guardar = async () => {
    if (!form.item?.trim()) return;
    const payload = {
      item: form.item.trim(),
      categoria: form.categoria || null,
      cantidad: form.cantidad || null,
      comentario: form.comentario || null,
      curso_id: cursoId,
    };
    if (modal?.id) await supabase.from("utiles").update(payload).eq("id", modal.id);
    else await supabase.from("utiles").insert(payload);
    setModal(null);
    setForm({});
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("util_adquirido").delete().eq("util_id", id);
    await supabase.from("utiles").delete().eq("id", id);
    cargar();
  };

  const filtrados = utiles.filter((u) => {
    const q = busqueda.toLowerCase();
    return !q || u.item?.toLowerCase().includes(q) || (u.categoria || "").toLowerCase().includes(q);
  });
  const agrupados = filtrados.reduce((acc, u) => {
    const k = u.categoria || "Sin categoría";
    (acc[k] = acc[k] || []).push(u);
    return acc;
  }, {});
  const adqCount = utiles.filter((u) => adquiridos.has(u.id)).length;

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <Text style={styles.progressTxt}>
          {adqCount} de {utiles.length} adquiridos
        </Text>
        {isAdmin ? (
          <Pressable
            onPress={() => {
              setForm({});
              setModal({});
            }}
            style={styles.addBtn}
          >
            <Text style={styles.addTxt}>+ Agregar</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por nombre o categoría..."
        placeholderTextColor={t.textFaint}
        autoCorrect={false}
        style={styles.search}
      />

      {filtrados.length === 0 ? <Text style={styles.empty}>Sin útiles para mostrar</Text> : null}

      {Object.entries(agrupados)
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([cat, items]) => (
          <View key={cat} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{cat}</Text>
              <Text style={styles.groupCount}>
                {items.filter((u) => adquiridos.has(u.id)).length}/{items.length}
              </Text>
            </View>
            {items.map((u) => {
              const adq = adquiridos.has(u.id);
              return (
                <View key={u.id} style={[styles.itemRow, adq && styles.itemRowOn]}>
                  <Pressable onPress={() => toggle(u.id)} style={[styles.check, adq && styles.checkOn]}>
                    {adq ? <MaterialCommunityIcons name="check-bold" size={16} color="#FFFFFF" /> : null}
                  </Pressable>
                  <View style={styles.flex1}>
                    <Text style={[styles.itemName, adq && styles.itemNameOn]}>{u.item}</Text>
                    {u.comentario ? <Text style={styles.itemSub}>{u.comentario}</Text> : null}
                  </View>
                  {u.cantidad ? <Text style={styles.cantidad}>{u.cantidad}</Text> : null}
                  {isAdmin ? (
                    <View style={styles.itemActions}>
                      <Pressable
                        onPress={() => {
                          setForm({ ...u });
                          setModal(u);
                        }}
                        style={styles.miniBtn}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={t.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => eliminar(u.id)} style={styles.miniBtn}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={t.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}

      <ItemFormModal
        visible={modal !== null}
        title={modal?.id ? "Editar útil" : "Nuevo útil"}
        fields={[
          { l: "Nombre", k: "item", ph: "Ej: Cartuchera" },
          { l: "Categoría", k: "categoria", ph: "Ej: Papelería" },
          { l: "Cantidad", k: "cantidad", ph: "Ej: 2 unidades" },
          { l: "Comentario", k: "comentario", ph: "Ej: Con cierre doble" },
        ]}
        form={form}
        setForm={setForm}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />
    </ScrollView>
  );
}

// ── Libros ───────────────────────────────────────────────────────────────
function Libros({ cursoId, userId, isAdmin }) {
  const [libros, setLibros] = useState([]);
  const [adquiridos, setAdquiridos] = useState(new Set());
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [preview, setPreview] = useState(null);

  const cargar = useCallback(async () => {
    const [lb, adq] = await Promise.all([
      supabase.from("libros").select("*").eq("curso_id", cursoId).order("materia").order("nombre"),
      userId
        ? supabase.from("libro_adquirido").select("libro_id").eq("usuario_id", userId)
        : Promise.resolve({ data: [] }),
    ]);
    setLibros(lb.data || []);
    setAdquiridos(new Set((adq.data || []).map((r) => r.libro_id)));
  }, [cursoId, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggle = async (id) => {
    if (!userId) return;
    if (adquiridos.has(id)) {
      await supabase.from("libro_adquirido").delete().eq("libro_id", id).eq("usuario_id", userId);
      setAdquiridos((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    } else {
      await supabase.from("libro_adquirido").insert({ libro_id: id, usuario_id: userId });
      setAdquiridos((p) => new Set([...p, id]));
    }
  };

  const guardar = async () => {
    if (!form.nombre?.trim()) return;
    const payload = {
      nombre: form.nombre.trim(),
      editorial: form.editorial || null,
      materia: form.materia || null,
      curso_id: cursoId,
      url_descarga: form.url_descarga || null,
    };
    if (modal?.id) await supabase.from("libros").update(payload).eq("id", modal.id);
    else await supabase.from("libros").insert(payload);
    setModal(null);
    setForm({});
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("libro_adquirido").delete().eq("libro_id", id);
    await supabase.from("libros").delete().eq("id", id);
    cargar();
  };

  const filtrados = libros.filter((l) => {
    const q = busqueda.toLowerCase();
    return (
      !q ||
      l.nombre?.toLowerCase().includes(q) ||
      (l.materia || "").toLowerCase().includes(q) ||
      (l.editorial || "").toLowerCase().includes(q)
    );
  });
  const agrupados = filtrados.reduce((acc, l) => {
    const k = l.materia || "Sin materia";
    (acc[k] = acc[k] || []).push(l);
    return acc;
  }, {});
  const adqCount = libros.filter((l) => adquiridos.has(l.id)).length;

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
      <View style={styles.toolbar}>
        <Text style={styles.progressTxt}>
          {adqCount} de {libros.length} adquiridos
        </Text>
        {isAdmin ? (
          <Pressable
            onPress={() => {
              setForm({});
              setModal({});
            }}
            style={styles.addBtn}
          >
            <Text style={styles.addTxt}>+ Agregar</Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar por nombre, materia o editorial..."
        placeholderTextColor={t.textFaint}
        autoCorrect={false}
        style={styles.search}
      />

      {filtrados.length === 0 ? <Text style={styles.empty}>Sin libros para mostrar</Text> : null}

      {Object.entries(agrupados)
        .sort(([a], [b]) => a.localeCompare(b, "es"))
        .map(([materia, items]) => (
          <View key={materia} style={styles.group}>
            <Text style={styles.materiaLabel}>{materia}</Text>
            {items.map((l) => {
              const adq = adquiridos.has(l.id);
              return (
                <Card key={l.id} style={[styles.libroCard, { borderLeftColor: adq ? t.success : t.borderStrong }]}>
                  <Pressable onPress={() => toggle(l.id)} style={[styles.check, adq && styles.checkOn]}>
                    {adq ? <MaterialCommunityIcons name="check-bold" size={16} color="#FFFFFF" /> : null}
                  </Pressable>
                  <View style={styles.flex1}>
                    <Text style={[styles.itemName, adq && styles.itemNameOn]}>{l.nombre}</Text>
                    {l.editorial ? <Text style={styles.itemSub}>{l.editorial}</Text> : null}
                    {l.url_descarga ? (
                      <Pressable onPress={() => abrir(l.url_descarga)}>
                        <Text style={styles.link}>Descargar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {l.imagen_url ? (
                    <Pressable onPress={() => setPreview({ url: l.imagen_url, nombre: l.nombre })}>
                      <Image source={{ uri: l.imagen_url }} style={styles.cover} />
                    </Pressable>
                  ) : null}
                  {isAdmin ? (
                    <View style={styles.itemActions}>
                      <Pressable
                        onPress={() => {
                          setForm({ ...l });
                          setModal(l);
                        }}
                        style={styles.miniBtn}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={16} color={t.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => eliminar(l.id)} style={styles.miniBtn}>
                        <MaterialCommunityIcons name="trash-can-outline" size={16} color={t.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ))}

      <ItemFormModal
        visible={modal !== null}
        title={modal?.id ? "Editar libro" : "Nuevo libro"}
        fields={[
          { l: "Nombre", k: "nombre", ph: "Ej: Matemáticas 3" },
          { l: "Editorial", k: "editorial", ph: "Ej: Santillana" },
          { l: "Materia", k: "materia", ph: "Ej: Matemáticas" },
          { l: "Link de descarga", k: "url_descarga", ph: "https://drive.google.com/..." },
        ]}
        form={form}
        setForm={setForm}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <Pressable style={styles.previewOverlay} onPress={() => setPreview(null)}>
          {preview ? <Image source={{ uri: preview.url }} style={styles.previewImg} resizeMode="contain" /> : null}
          <Text style={styles.previewName}>{preview?.nombre}</Text>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ── Uniformes (solo checklist adquirido) ────────────────────────────────────
function Uniformes({ cursoId, userId }) {
  const [uniformes, setUniformes] = useState([]);
  const [adquiridos, setAdquiridos] = useState(new Set());

  const cargar = useCallback(async () => {
    const { data: links } = await supabase
      .from("uniforme_cursos")
      .select("uniforme_id")
      .eq("curso_id", cursoId);
    const ids = (links || []).map((r) => r.uniforme_id);
    if (!ids.length) {
      setUniformes([]);
      return;
    }
    const [uni, adq] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").in("id", ids),
      userId
        ? supabase.from("uniforme_adquirido").select("uniforme_item_id").eq("usuario_id", userId)
        : Promise.resolve({ data: [] }),
    ]);
    setUniformes((uni.data || []).sort((a, b) => (a.tipo || "").localeCompare(b.tipo || "", "es")));
    setAdquiridos(new Set((adq.data || []).map((r) => r.uniforme_item_id)));
  }, [cursoId, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const toggle = async (itemId) => {
    if (!userId) return;
    if (adquiridos.has(itemId)) {
      await supabase
        .from("uniforme_adquirido")
        .delete()
        .eq("uniforme_item_id", itemId)
        .eq("usuario_id", userId);
      setAdquiridos((p) => {
        const n = new Set(p);
        n.delete(itemId);
        return n;
      });
    } else {
      await supabase.from("uniforme_adquirido").insert({ uniforme_item_id: itemId, usuario_id: userId });
      setAdquiridos((p) => new Set([...p, itemId]));
    }
  };

  const allItems = uniformes.flatMap((u) => u.uniforme_items || []);
  const total = allItems.length;
  const adqCount = allItems.filter((it) => adquiridos.has(it.id)).length;
  const pct = total ? Math.round((adqCount / total) * 100) : 0;

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={styles.content}>
      {total > 0 ? (
        <View style={styles.uniProgress}>
          <View style={styles.progressTop}>
            <Text style={styles.progressLabel}>Adquiridos</Text>
            <Text style={styles.progressLabel}>
              {adqCount} / {total} ({pct}%)
            </Text>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
        </View>
      ) : null}

      {uniformes.length === 0 ? (
        <Text style={styles.empty}>No hay uniformes asignados a este curso.</Text>
      ) : null}

      {uniformes.map((u) => {
        const items = u.uniforme_items || [];
        return (
          <Card key={u.id} style={styles.uniCard}>
            <View style={styles.uniHeader}>
              <Text style={styles.uniEmoji}>{u.emoji || "👕"}</Text>
              <Text style={styles.uniTipo}>{u.tipo}</Text>
            </View>
            {items.length === 0 ? <Text style={styles.itemSub}>Sin ítems cargados.</Text> : null}
            {[...items]
              .sort((a, b) => (a.item || "").localeCompare(b.item || "", "es"))
              .map((it) => {
                const adq = adquiridos.has(it.id);
                return (
                  <View key={it.id} style={[styles.itemRow, adq && styles.itemRowOn]}>
                    <Pressable onPress={() => toggle(it.id)} style={[styles.check, adq && styles.checkOn]}>
                      {adq ? <MaterialCommunityIcons name="check-bold" size={16} color="#FFFFFF" /> : null}
                    </Pressable>
                    <Text style={[styles.itemName, styles.flex1, adq && styles.itemNameOn]}>{it.item}</Text>
                  </View>
                );
              })}
          </Card>
        );
      })}
    </ScrollView>
  );
}

// ── Modal reutilizable de alta/edición (campos de texto) ────────────────────
function ItemFormModal({ visible, title, fields, form, setForm, onClose, onGuardar }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>{title}</Text>
            {fields.map((f) => (
              <View key={f.k}>
                <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                <TextInput
                  value={form[f.k] || ""}
                  onChangeText={(t) => setForm((p) => ({ ...p, [f.k]: t }))}
                  placeholder={f.ph}
                  placeholderTextColor={t.textFaint}
                  style={styles.input}
                />
              </View>
            ))}
            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={onGuardar} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>Guardar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  headerWrap: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
  content: { padding: SPACE.lg, paddingBottom: SPACE.xxxl },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: 14 },
  subTabs: { gap: 7, paddingBottom: 4 },
  subTab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.full, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.borderStrong, minHeight: 36, justifyContent: "center" },
  subTabActive: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  subTabTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  subTabTxtActive: { color: "#FFFFFF", fontWeight: "700" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  progressTxt: { fontSize: 13, color: t.textMuted },
  addBtn: { backgroundColor: t.accent, borderRadius: RADIUS.lg, paddingVertical: 8, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  addTxt: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  search: { minHeight: 44, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface, fontSize: 13, color: t.text, marginBottom: 12 },
  empty: { textAlign: "center", paddingVertical: 32, color: t.textMuted, fontSize: 13 },
  group: { marginBottom: 14 },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: t.surface2, borderRadius: RADIUS.sm },
  groupTitle: { flex: 1, ...TYPE.label, color: t.textFaint },
  groupCount: { fontSize: 10, color: t.textFaint },
  materiaLabel: { ...TYPE.label, color: t.textFaint, marginBottom: 6 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.surface },
  itemRowOn: { backgroundColor: t.successSoft },
  check: { width: 24, height: 24, borderRadius: RADIUS.xs, borderWidth: 2, borderColor: SLATE[300], backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  checkOn: { borderColor: t.success, backgroundColor: t.success },
  itemName: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  itemNameOn: { color: t.textFaint, textDecorationLine: "line-through" },
  itemSub: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  cantidad: { fontSize: 12, color: t.textMuted, fontWeight: "600" },
  itemActions: { flexDirection: "row", gap: 4 },
  miniBtn: { padding: 6, borderRadius: RADIUS.xs },
  link: { fontSize: 12, fontWeight: "700", color: BLUE[600], marginTop: 3 },
  libroCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 7, borderLeftWidth: 3, borderRadius: RADIUS.xl, borderColor: t.borderStrong, elevation: 0, shadowOpacity: 0 },
  cover: { width: 44, height: 60, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: t.borderStrong },
  previewOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  previewImg: { width: "100%", height: "70%", borderRadius: RADIUS.lg },
  previewName: { color: "#FFFFFF", fontSize: 14, fontWeight: "700", marginTop: 14 },
  uniProgress: { marginBottom: 14 },
  progressTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  progressLabel: { fontSize: 11, fontWeight: "700", color: t.textMuted },
  bar: { height: 6, borderRadius: RADIUS.full, backgroundColor: SLATE[200], overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: t.success, borderRadius: RADIUS.full },
  uniCard: { padding: 0, marginBottom: 12, overflow: "hidden", borderRadius: RADIUS.xl, borderColor: t.borderStrong, elevation: 0, shadowOpacity: 0 },
  uniHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, backgroundColor: t.accentSoft, borderBottomWidth: 1, borderBottomColor: t.border },
  uniEmoji: { fontSize: 18 },
  uniTipo: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, flex: 1 },
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, maxHeight: "85%", backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: 20 },
  modalTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginBottom: 12 },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 5, marginTop: 6 },
  input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, paddingHorizontal: 12, fontSize: 13, color: t.text },
  modalBtns: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textMuted, fontSize: 13, fontWeight: "700" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.lg, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
