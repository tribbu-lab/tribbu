// Recordatorios (puerto RN de src/features/recordatorios). Lista con leídos/
// no-leídos, filtros por rango y prioridad, alta/edición y borrado. El admin que
// crea un recordatorio dispara un push al curso. Incluye historial de comunicados.

import { useState, useEffect, useCallback, memo } from "react";
import { View, Text, Pressable, TextInput, FlatList, Modal, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { sanitize } from "@shared/helpers";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { Paginador } from "../../components/Paginador";

const PRIO = {
  alta: { l: "Alta", c: "#EF4444", bg: "#FEF2F2" },
  media: { l: "Media", c: "#F59E0B", bg: "#FFFBEB" },
  baja: { l: "Baja", c: "#10B981", bg: "#F0FDF4" },
};
const POR_PAG = 10;
const RANGOS = [
  { value: "all", label: "Todos" },
  { value: "proximos", label: "Próximos" },
  { value: "pasados", label: "Pasados" },
];
const PRIOS = [
  { value: "all", label: "Todas" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

const Chip = ({ label, active, onPress }) => (
  <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{label}</Text>
  </Pressable>
);

const RecordatorioRow = memo(function RecordatorioRow({ r, esLeido, puedeEditar, onLeido, onEditar, onEliminar }) {
  const prio = PRIO[r.prioridad || "media"];
  const dias = r.fecha
    ? Math.round((new Date(r.fecha + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 86400000)
    : null;
  const diasLabel =
    dias === null ? null : dias === 0 ? "hoy" : dias === 1 ? "mañana" : dias < 0 ? `hace ${Math.abs(dias)}d` : `en ${dias}d`;

  return (
    <View style={[styles.row, { borderLeftColor: r.urgente ? "#EF4444" : prio.c }, esLeido && styles.rowLeido]}>
      <View style={styles.dateCol}>
        {r.fecha ? (
          <>
            <Text style={styles.dateDay}>{new Date(r.fecha + "T00:00:00").getDate()}</Text>
            <Text style={styles.dateMonth}>
              {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR", { month: "short" })}
            </Text>
            {diasLabel ? (
              <Text
                style={[
                  styles.dateRel,
                  { color: dias < 0 ? "#94A3B8" : dias <= 3 ? "#EF4444" : "#10B981" },
                ]}
              >
                {diasLabel}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.dateNone}>--</Text>
        )}
      </View>

      <View style={styles.flex1}>
        <Text style={[styles.rowTxt, esLeido && styles.rowTxtLeido]}>{r.texto}</Text>
        <View style={styles.tags}>
          <View style={[styles.tag, { backgroundColor: prio.bg }]}>
            <Text style={[styles.tagTxt, { color: prio.c }]}>{prio.l}</Text>
          </View>
          {r.urgente ? (
            <View style={[styles.tag, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.tagTxt, { color: "#EF4444" }]}>Urgente</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.rowActions}>
        <Pressable onPress={() => onLeido(r.id)} style={[styles.leidoBtn, esLeido && styles.leidoBtnOn]}>
          <Text style={[styles.leidoTxt, esLeido && styles.leidoTxtOn]}>Leído</Text>
        </Pressable>
        {puedeEditar ? (
          <View style={styles.editRow}>
            <Pressable onPress={() => onEditar(r)} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>Editar</Text>
            </Pressable>
            <Pressable onPress={() => onEliminar(r.id)} style={styles.smallBtn}>
              <Text style={styles.borrarTxt}>Borrar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

export function Recordatorios() {
  const { cursoId, usuario, isAdmin } = useSession();
  const userId = usuario?.id ?? null;

  const [recordatorios, setRecordatorios] = useState([]);
  const [leidosSet, setLeidosSet] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ texto: "", fecha: "", prioridad: "media", urgente: false });
  const [saving, setSaving] = useState(false);
  const [filtroRango, setFiltroRango] = useState("all");
  const [filtroPrio, setFiltroPrio] = useState("all");
  const [pagina, setPagina] = useState(1);

  const hoyStr = new Date().toISOString().split("T")[0];

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const [recs, leidos] = await Promise.all([
      supabase
        .from("recordatorios")
        .select("*")
        .eq("curso_id", cursoId)
        .order("fecha", { ascending: true, nullsFirst: false })
        .order("id", { ascending: false }),
      userId
        ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId)
        : Promise.resolve({ data: [] }),
    ]);
    setRecordatorios(recs.data || []);
    setLeidosSet(new Set((leidos.data || []).map((r) => r.recordatorio_id)));
  }, [cursoId, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form.texto?.trim()) return;
    setSaving(true);
    const payload = {
      texto: sanitize(form.texto),
      fecha: form.fecha || null,
      prioridad: form.prioridad || "media",
      urgente: form.urgente || false,
      curso_id: cursoId,
    };
    if (modal?.id) {
      await supabase.from("recordatorios").update(payload).eq("id", modal.id);
    } else {
      await supabase.from("recordatorios").insert({ ...payload, creado_por: userId });
      if (isAdmin) {
        const userIds = await getUserIdsByCurso(cursoId);
        await sendPush({ type: "recordatorio", payload: { titulo: form.texto, userIds } });
      }
    }
    setSaving(false);
    setModal(null);
    cargar();
  };

  const eliminar = useCallback(
    async (id) => {
      await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id", id);
      await supabase.from("recordatorios").delete().eq("id", id);
      cargar();
    },
    [cargar]
  );

  const marcarLeido = useCallback(
    async (id) => {
      if (!userId) return;
      if (leidosSet.has(id)) {
        await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id", id).eq("usuario_id", userId);
        setLeidosSet((p) => {
          const n = new Set(p);
          n.delete(id);
          return n;
        });
      } else {
        await supabase
          .from("recordatorio_leidos")
          .upsert({ recordatorio_id: id, usuario_id: userId }, { onConflict: "recordatorio_id,usuario_id" });
        setLeidosSet((p) => new Set([...p, id]));
      }
    },
    [userId, leidosSet]
  );

  const abrirNuevo = () => {
    setForm({ texto: "", fecha: "", prioridad: "media", urgente: false });
    setModal({});
  };
  const abrirEditar = useCallback((r) => {
    setForm({ texto: r.texto || "", fecha: r.fecha || "", prioridad: r.prioridad || "media", urgente: r.urgente || false });
    setModal(r);
  }, []);

  const filtrados = recordatorios
    .filter((r) => {
      if (r.tipo === "regalo_cumple" || r.tipo === "colecta_vence") return false;
      if (filtroRango === "proximos" && r.fecha && r.fecha < hoyStr) return false;
      if (filtroRango === "pasados" && (!r.fecha || r.fecha >= hoyStr)) return false;
      if (filtroPrio !== "all" && r.prioridad !== filtroPrio) return false;
      return true;
    })
    .sort((a, b) => (a.fecha && b.fecha ? a.fecha.localeCompare(b.fecha) : a.fecha ? -1 : b.fecha ? 1 : 0));

  const totalPags = Math.max(1, Math.ceil(filtrados.length / POR_PAG));
  const pagina_ = Math.min(pagina, totalPags);
  const visible = filtrados.slice((pagina_ - 1) * POR_PAG, pagina_ * POR_PAG);

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={visible}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item }) => (
          <RecordatorioRow
            r={item}
            esLeido={leidosSet.has(item.id)}
            puedeEditar={isAdmin || item.creado_por === userId}
            onLeido={marcarLeido}
            onEditar={abrirEditar}
            onEliminar={eliminar}
          />
        )}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <Text style={styles.h1}>Recordatorios</Text>
            <Text style={styles.subtitle}>Avisos y recordatorios del curso</Text>

            <View style={styles.filtersRow}>
              {RANGOS.map((o) => (
                <Chip key={o.value} label={o.label} active={filtroRango === o.value} onPress={() => { setFiltroRango(o.value); setPagina(1); }} />
              ))}
              <Pressable onPress={abrirNuevo} style={styles.nuevoBtn}>
                <Text style={styles.nuevoTxt}>+ Nuevo</Text>
              </Pressable>
            </View>
            <View style={styles.filtersRow}>
              {PRIOS.map((o) => (
                <Chip key={o.value} label={o.label} active={filtroPrio === o.value} onPress={() => { setFiltroPrio(o.value); setPagina(1); }} />
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>Sin recordatorios</Text>}
        ListFooterComponent={
          <View>
            <Paginador pagina={pagina_} totalPag={totalPags} setPagina={setPagina} />
            <HistorialComunicados cursoId={cursoId} />
          </View>
        }
      />

      <RecordatorioModal
        visible={modal !== null}
        form={form}
        setForm={setForm}
        saving={saving}
        editing={!!modal?.id}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />
    </View>
  );
}

function RecordatorioModal({ visible, form, setForm, saving, editing, onClose, onGuardar }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{editing ? "Editar recordatorio" : "Nuevo recordatorio"}</Text>

          <Text style={styles.modalLabel}>TEXTO</Text>
          <TextInput
            value={form.texto}
            onChangeText={(t) => setForm((p) => ({ ...p, texto: t }))}
            placeholder="Ej: Reunión de padres el viernes"
            placeholderTextColor="#94A3B8"
            multiline
            style={[styles.modalInput, styles.modalTextarea]}
          />

          <Text style={styles.modalLabel}>FECHA (opcional, AAAA-MM-DD)</Text>
          <TextInput
            value={form.fecha || ""}
            onChangeText={(t) => setForm((p) => ({ ...p, fecha: t }))}
            placeholder="2026-07-01"
            placeholderTextColor="#94A3B8"
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>PRIORIDAD</Text>
          <View style={styles.prioRow}>
            {["alta", "media", "baja"].map((p) => {
              const active = form.prioridad === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setForm((f) => ({ ...f, prioridad: p }))}
                  style={[styles.prioBtn, active && { borderColor: PRIO[p].c, backgroundColor: PRIO[p].bg }]}
                >
                  <Text style={[styles.prioTxt, active && { color: PRIO[p].c }]}>{PRIO[p].l}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setForm((p) => ({ ...p, urgente: !p.urgente }))}
            style={[styles.urgenteBtn, form.urgente && styles.urgenteOn]}
          >
            <Text style={[styles.urgenteTxt, form.urgente && styles.urgenteTxtOn]}>
              {form.urgente ? "✓ Urgente" : "Marcar urgente"}
            </Text>
          </Pressable>

          <View style={styles.modalBtns}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={onGuardar} disabled={saving} style={styles.saveBtn}>
              <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HistorialComunicados({ cursoId }) {
  const [alertas, setAlertas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("alertas")
      .select("*")
      .eq("curso_id", cursoId)
      .order("creado_en", { ascending: false })
      .limit(100);
    setAlertas(data || []);
    setCargando(false);
  };

  const toggle = () => {
    if (!abierto && alertas.length === 0) cargar();
    setAbierto((p) => !p);
  };

  const fmtFecha = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString("es-AR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

  return (
    <View style={styles.histWrap}>
      <Pressable onPress={toggle} style={styles.histToggle}>
        <Text style={styles.histToggleTxt}>📢 Historial de comunicados</Text>
        <Text style={styles.histChevron}>{abierto ? "▴" : "▾"}</Text>
      </Pressable>

      {abierto ? (
        <View style={styles.histList}>
          {cargando ? <Text style={styles.empty}>Cargando...</Text> : null}
          {!cargando && alertas.length === 0 ? <Text style={styles.empty}>Sin comunicados anteriores</Text> : null}
          {!cargando &&
            alertas.map((a) => (
              <View
                key={a.id}
                style={[styles.histItem, { borderLeftColor: a.activa ? "#EF4444" : "#CBD5E1" }, a.activa && styles.histItemActiva]}
              >
                <Text style={styles.histEmoji}>{a.activa ? "🚨" : "📢"}</Text>
                <View style={styles.flex1}>
                  <Text style={styles.histMsg}>{a.mensaje}</Text>
                  <Text style={styles.histDate}>{fmtFecha(a.creado_en)}</Text>
                </View>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 32 },
  headerWrap: { marginBottom: 4 },
  flex1: { flex: 1 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text, marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#94A3B8", marginBottom: 16 },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
  },
  chipActive: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTxtActive: { color: T.accent, fontWeight: "700" },
  nuevoBtn: { marginLeft: "auto", minHeight: 36, justifyContent: "center", paddingHorizontal: 16, borderRadius: 8, backgroundColor: T.accent },
  nuevoTxt: { color: "white", fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", paddingVertical: 32, color: "#94A3B8", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
  },
  rowLeido: { opacity: 0.55 },
  dateCol: { width: 64, alignItems: "center", marginRight: 12 },
  dateDay: { fontSize: 18, fontWeight: "900", color: T.text, lineHeight: 20 },
  dateMonth: { fontSize: 10, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase" },
  dateRel: { fontSize: 9, fontWeight: "700", marginTop: 2 },
  dateNone: { fontSize: 12, color: "#CBD5E1", fontWeight: "600" },
  rowTxt: { fontSize: 13, fontWeight: "600", color: T.text, lineHeight: 18 },
  rowTxtLeido: { fontWeight: "400", color: "#94A3B8" },
  tags: { flexDirection: "row", gap: 5, marginTop: 4, flexWrap: "wrap" },
  tag: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8 },
  tagTxt: { fontSize: 10, fontWeight: "700" },
  rowActions: { alignItems: "flex-end", marginLeft: 8, gap: 4 },
  leidoBtn: { minHeight: 32, justifyContent: "center", paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  leidoBtnOn: { borderColor: "#10B981", backgroundColor: "#F0FDF4" },
  leidoTxt: { fontSize: 11, fontWeight: "700", color: "#64748B" },
  leidoTxtOn: { color: "#10B981" },
  editRow: { flexDirection: "row", gap: 4 },
  smallBtn: { paddingVertical: 5, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0" },
  smallBtnTxt: { fontSize: 11, color: T.text },
  borrarTxt: { fontSize: 11, color: "#EF4444" },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: "white", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 15, fontWeight: "900", color: T.text, marginBottom: 14 },
  modalLabel: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginBottom: 5, marginTop: 6 },
  modalInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    fontSize: 13,
    color: T.text,
  },
  modalTextarea: { minHeight: 72, paddingTop: 10, textAlignVertical: "top" },
  prioRow: { flexDirection: "row", gap: 6 },
  prioBtn: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "white" },
  prioTxt: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  urgenteBtn: { alignSelf: "flex-start", marginTop: 12, minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 8, borderWidth: 1.5, borderColor: "#E2E8F0", backgroundColor: "white" },
  urgenteOn: { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  urgenteTxt: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  urgenteTxtOn: { color: "#EF4444" },
  modalBtns: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: 10, backgroundColor: T.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "white", fontSize: 13, fontWeight: "700" },
  // Historial
  histWrap: { marginTop: 24 },
  histToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
  },
  histToggleTxt: { fontSize: 13, fontWeight: "700", color: T.text },
  histChevron: { fontSize: 16, color: "#94A3B8" },
  histList: { marginTop: 8 },
  histItem: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderLeftWidth: 3,
  },
  histItemActiva: { backgroundColor: "#FEF2F2", borderColor: "#FCA5A5" },
  histEmoji: { fontSize: 18 },
  histMsg: { fontSize: 13, fontWeight: "600", color: T.text, lineHeight: 18, marginBottom: 4 },
  histDate: { fontSize: 11, color: "#94A3B8" },
});
