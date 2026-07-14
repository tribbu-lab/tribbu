// Admin (puerto RN de src/features/admin · AdminPanel). Solo visible cuando el
// item activo es Room Parent (rolEfectivo === "admin"). Dos sub-secciones:
// - General: monto/moneda de regalo del curso (tabla `cursos`).
// - Horarios: alta/edición/baja de clases (tabla `horarios`) con selector de
//   docente desde `maestros`. La AlertaModal de admin ya vive en el Muro.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const COLORES = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#6366F1"];

export function AdminPanel() {
  const { cursoId, cursoNombre } = useSession();
  const [tab, setTab] = useState("general");
  const [form, setForm] = useState({ monto_regalo: "", moneda_regalo: "$" });
  const [saving, setSaving] = useState(false);
  const [horarios, setHorarios] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [horForm, setHorForm] = useState(null);
  const [horSaving, setHorSaving] = useState(false);

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const [c, hor, mae] = await Promise.all([
      supabase.from("cursos").select("*").eq("id", cursoId).single(),
      supabase.from("horarios").select("*").eq("curso_id", cursoId).order("dia").order("hora_inicio"),
      supabase.from("maestros").select("id,nombre,materia").eq("activo", true),
    ]);
    setForm({ monto_regalo: c.data?.monto_regalo ? String(c.data.monto_regalo) : "", moneda_regalo: c.data?.moneda_regalo || "$" });
    setHorarios(hor.data || []);
    setMaestros(mae.data || []);
  }, [cursoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarGeneral = async () => {
    setSaving(true);
    await supabase
      .from("cursos")
      .update({
        monto_regalo: form.monto_regalo ? Number(form.monto_regalo) : null,
        moneda_regalo: form.moneda_regalo || "$",
      })
      .eq("id", cursoId);
    setSaving(false);
    cargar();
  };

  const guardarHorario = async () => {
    if (!horForm?.materia?.trim() || !horForm?.dia || !horForm?.hora_inicio || !horForm?.hora_fin) return;
    setHorSaving(true);
    const payload = {
      materia: horForm.materia.trim(),
      dia: horForm.dia,
      hora_inicio: horForm.hora_inicio,
      hora_fin: horForm.hora_fin,
      docente: horForm.docente || null,
      color: horForm.color || "#3B82F6",
      curso_id: cursoId,
    };
    if (horForm.id) await supabase.from("horarios").update(payload).eq("id", horForm.id);
    else await supabase.from("horarios").insert(payload);
    setHorSaving(false);
    setHorForm(null);
    cargar();
  };

  const eliminarHorario = async (id) => {
    await supabase.from("horarios").delete().eq("id", id);
    cargar();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Admin</Text>
      <Text style={styles.subtitle}>{cursoNombre}</Text>

      <View style={styles.tabs}>
        {[
          { id: "general", l: "General" },
          { id: "horarios", l: "Horarios" },
        ].map((t) => (
          <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabActive]}>
            <Text style={[styles.tabTxt, tab === t.id && styles.tabTxtActive]}>{t.l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "general" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configuración de regalos</Text>
          <Text style={styles.label}>MONEDA</Text>
          <View style={styles.row}>
            {["$", "USD"].map((m) => (
              <Pressable
                key={m}
                onPress={() => setForm((p) => ({ ...p, moneda_regalo: m }))}
                style={[styles.monedaBtn, form.moneda_regalo === m && styles.monedaBtnOn]}
              >
                <Text style={[styles.monedaTxt, form.moneda_regalo === m && { color: T.accent }]}>{m}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>MONTO SUGERIDO POR FAMILIA</Text>
          <TextInput
            value={form.monto_regalo}
            onChangeText={(t) => setForm((p) => ({ ...p, monto_regalo: t }))}
            placeholder="Ej: 2000"
            placeholderTextColor="#94A3B8"
            keyboardType="numeric"
            style={styles.input}
          />
          <Pressable onPress={guardarGeneral} disabled={saving} style={styles.saveBtnFull}>
            <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {tab === "horarios" ? (
        <View>
          <View style={styles.horHeader}>
            <Text style={styles.cardTitle}>Horario de clases</Text>
            <Pressable
              onPress={() => setHorForm({ dia: "Lunes", hora_inicio: "08:00", hora_fin: "09:00", materia: "", docente: "", color: "#3B82F6" })}
              style={styles.addBtn}
            >
              <Text style={styles.addTxt}>+ Nueva clase</Text>
            </Pressable>
          </View>
          {horarios.length === 0 ? <Text style={styles.muted}>Sin clases cargadas</Text> : null}
          {DIAS.map((dia) => {
            const items = horarios.filter((h) => h.dia === dia);
            if (!items.length) return null;
            return (
              <View key={dia} style={styles.diaGroup}>
                <Text style={styles.diaLabel}>{dia}</Text>
                {items.map((h) => (
                  <View key={h.id} style={styles.horRow}>
                    <View style={[styles.dot, { backgroundColor: h.color || "#3B82F6" }]} />
                    <View style={styles.flex1}>
                      <Text style={styles.horMateria}>{h.materia}</Text>
                      {h.docente ? <Text style={styles.horDocente}>{h.docente}</Text> : null}
                    </View>
                    <Text style={styles.horHora}>
                      {h.hora_inicio?.slice(0, 5)} – {h.hora_fin?.slice(0, 5)}
                    </Text>
                    <Pressable onPress={() => setHorForm({ ...h })} style={styles.horEdit}>
                      <Text style={styles.horEditTxt}>✏️</Text>
                    </Pressable>
                    <Pressable onPress={() => eliminarHorario(h.id)} style={styles.horDel}>
                      <Text style={styles.horDelTxt}>🗑</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}

      {horForm !== null ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setHorForm(null)}>
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <ScrollView>
                <Text style={styles.modalTitle}>{horForm?.id ? "Editar clase" : "Nueva clase"}</Text>

                <Text style={styles.label}>DÍA</Text>
                <View style={styles.chipsWrap}>
                  {DIAS.map((d) => (
                    <Pressable
                      key={d}
                      onPress={() => setHorForm((p) => ({ ...p, dia: d }))}
                      style={[styles.chip, horForm.dia === d && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, horForm.dia === d && styles.chipTxtOn]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.row}>
                  <View style={styles.flex1}>
                    <Text style={styles.label}>HORA INICIO</Text>
                    <TextInput
                      value={horForm.hora_inicio}
                      onChangeText={(t) => setHorForm((p) => ({ ...p, hora_inicio: t }))}
                      placeholder="08:00"
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.label}>HORA FIN</Text>
                    <TextInput
                      value={horForm.hora_fin}
                      onChangeText={(t) => setHorForm((p) => ({ ...p, hora_fin: t }))}
                      placeholder="09:00"
                      placeholderTextColor="#94A3B8"
                      style={styles.input}
                    />
                  </View>
                </View>

                <Text style={styles.label}>MATERIA</Text>
                <TextInput
                  value={horForm.materia}
                  onChangeText={(t) => setHorForm((p) => ({ ...p, materia: t }))}
                  placeholder="Ej: Matemáticas"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />

                <Text style={styles.label}>DOCENTE</Text>
                <View style={styles.chipsWrap}>
                  <Pressable
                    onPress={() => setHorForm((p) => ({ ...p, docente: "" }))}
                    style={[styles.chip, !horForm.docente && styles.chipOn]}
                  >
                    <Text style={[styles.chipTxt, !horForm.docente && styles.chipTxtOn]}>Sin asignar</Text>
                  </Pressable>
                  {maestros.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setHorForm((p) => ({ ...p, docente: m.nombre }))}
                      style={[styles.chip, horForm.docente === m.nombre && styles.chipOn]}
                    >
                      <Text style={[styles.chipTxt, horForm.docente === m.nombre && styles.chipTxtOn]}>
                        {m.nombre}
                        {m.materia ? ` · ${m.materia}` : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>COLOR</Text>
                <View style={styles.chipsWrap}>
                  {COLORES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setHorForm((p) => ({ ...p, color: c }))}
                      style={[styles.colorDot, { backgroundColor: c }, horForm.color === c && styles.colorDotOn]}
                    />
                  ))}
                </View>

                <View style={styles.modalBtns}>
                  <Pressable onPress={() => setHorForm(null)} style={styles.cancelBtn}>
                    <Text style={styles.cancelTxt}>Cancelar</Text>
                  </Pressable>
                  <Pressable onPress={guardarHorario} disabled={horSaving} style={styles.saveBtn}>
                    <Text style={styles.saveTxt}>{horSaving ? "Guardando..." : "Guardar clase"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 112 /* barra flotante */ },
  flex1: { flex: 1 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text },
  subtitle: { fontSize: 13, color: "#94A3B8", marginBottom: 16 },
  muted: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 24 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#F1F5F9", minHeight: 38, justifyContent: "center" },
  tabActive: { backgroundColor: T.primary },
  tabTxt: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  tabTxtActive: { color: "white" },

  card: { backgroundColor: "white", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#E2E8F0" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: T.text, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.6, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: { minHeight: 44, borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: T.text, backgroundColor: "#F8FAFC" },
  monedaBtn: { borderWidth: 2, borderColor: "#E2E8F0", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 20, minHeight: 40, justifyContent: "center" },
  monedaBtnOn: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  monedaTxt: { fontSize: 13, fontWeight: "700", color: "#94A3B8" },
  saveBtnFull: { minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center", marginTop: 16 },
  saveTxt: { fontSize: 14, fontWeight: "700", color: "white" },

  horHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  addBtn: { backgroundColor: T.accent, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  addTxt: { color: "white", fontSize: 12, fontWeight: "700" },
  diaGroup: { marginBottom: 12 },
  diaLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", letterSpacing: 0.6, marginBottom: 5 },
  horRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F8FAFC", borderRadius: 9, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  horMateria: { fontSize: 13, fontWeight: "600", color: T.text },
  horDocente: { fontSize: 11, color: "#94A3B8", marginTop: 1 },
  horHora: { fontSize: 11, color: "#64748B" },
  horEdit: { padding: 4 },
  horEditTxt: { fontSize: 13 },
  horDel: { padding: 4 },
  horDelTxt: { fontSize: 13, color: "#EF4444" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "white", borderRadius: 20, padding: 20, maxHeight: "88%" },
  modalTitle: { fontSize: 16, fontWeight: "900", color: T.text, marginBottom: 4 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "white" },
  chipOn: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTxtOn: { color: T.accent, fontWeight: "700" },
  colorDot: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  colorDotOn: { borderColor: T.primary },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  cancelTxt: { fontSize: 13, fontWeight: "600", color: "#94A3B8" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
});
