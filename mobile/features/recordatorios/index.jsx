// Recordatorios — patrón A3 (ver mobile/DESIGN_SYSTEM.md §7). Lista con leídos/
// no-leídos, filtros colapsados en select-chips (Sheet), alta/edición y borrado.
// El admin que crea un recordatorio dispara un push al curso. Incluye historial
// de comunicados. La prioridad/urgencia vive en el dot de la fila; leído = dot
// hueco + texto apagado.

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { View, Text, Pressable, TextInput, FlatList, Modal, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { sanitize } from "@shared/helpers";
import { THEMES, STATUS, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Paginador } from "../../components/Paginador";
import { SelectChip } from "../../components/SelectChip";
import { EmptyState } from "../../components/EmptyState";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { DateField } from "../../components/DateField";

const t = THEMES.light;

const PRIO = {
  alta: { l: "Alta", c: t.danger, bg: t.dangerSoft },
  media: { l: "Media", c: t.warning, bg: t.warningSoft },
  baja: { l: "Baja", c: t.success, bg: t.successSoft },
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
const LEIDOS = [
  { value: "all", label: "Todos" },
  { value: "noleidos", label: "No leídos" },
  { value: "leidos", label: "Leídos" },
];

const RecordatorioRow = memo(function RecordatorioRow({ r, esLeido, puedeEditar, tag, onLeido, onEditar, onEliminar }) {
  const prio = PRIO[r.prioridad || "media"];
  const dias = r.fecha
    ? Math.round((new Date(r.fecha + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / 86400000)
    : null;
  const rel =
    dias === null ? null : dias === 0 ? "hoy" : dias === 1 ? "mañana" : dias < 0 ? `hace ${Math.abs(dias)} días` : `en ${dias} días`;
  const fechaCorta = r.fecha
    ? new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" })
    : null;
  const meta = [fechaCorta, rel, prio.l, r.urgente ? "Urgente" : null].filter(Boolean).join(" · ") || "Sin fecha";
  const dotColor = r.urgente ? t.danger : prio.c;

  return (
    <View style={styles.row}>
      <View style={[styles.rdot, esLeido ? styles.rdotLeido : { backgroundColor: dotColor }]} />
      <View style={styles.flex1}>
        <Text style={[styles.rowTxt, esLeido && styles.rowTxtLeido]}>{r.texto}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
        {tag ? (
          <View style={styles.tagRow}>
            <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
            <Text style={styles.tagTxt} numberOfLines={1}>{tag.nombre}</Text>
          </View>
        ) : null}
        <AdjuntosList adjuntos={r.adjuntos} />
      </View>
      <View style={styles.rowActions}>
        {esLeido ? (
          <Pressable onPress={() => onLeido(r.id)} hitSlop={8} style={styles.checkBtn} accessibilityLabel="Marcar no leído">
            <MaterialCommunityIcons name="check" size={17} color={t.textFaint} />
          </Pressable>
        ) : (
          <Pressable onPress={() => onLeido(r.id)} hitSlop={8} style={styles.leerBtn}>
            <Text style={styles.leerTxt}>Marcar leído</Text>
          </Pressable>
        )}
        {puedeEditar ? (
          <View style={styles.editRow}>
            <Pressable onPress={() => onEditar(r)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Editar">
              <MaterialCommunityIcons name="pencil-outline" size={15} color={t.textMuted} />
            </Pressable>
            <Pressable onPress={() => onEliminar(r.id)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Borrar">
              <MaterialCommunityIcons name="trash-can-outline" size={15} color={t.danger} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

export function Recordatorios() {
  const { cursoId, cursoIds, esVistaTodos, usuario, isAdmin, items, tagDeCurso } = useSession();
  const userId = usuario?.id ?? null;

  const [recordatorios, setRecordatorios] = useState([]);
  const [leidosSet, setLeidosSet] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ texto: "", fecha: "", prioridad: "media", urgente: false, adjuntos: [], curso_id: null });
  const [saving, setSaving] = useState(false);
  const [filtroRango, setFiltroRango] = useState("all");
  const [filtroPrio, setFiltroPrio] = useState("all");
  const [filtroLeido, setFiltroLeido] = useState("all");
  const [pagina, setPagina] = useState(1);

  const hoyStr = new Date().toISOString().split("T")[0];

  // En vista "Todos" el permiso de edición se resuelve contra el rol en el curso
  // de cada fila, no contra el isAdmin de sesión (que en Todos es false).
  const cursosAdmin = useMemo(
    () => new Set((items || []).filter((i) => i.rolEfectivo === "admin").map((i) => i.curso_id)),
    [items]
  );

  // Opciones de curso destino para el alta en vista "Todos" (label = hijo/s).
  const cursosOpciones = useMemo(
    () => (esVistaTodos ? cursoIds.map((cid) => ({ curso_id: cid, tag: tagDeCurso(cid) })).filter((o) => o.tag) : []),
    [esVistaTodos, cursoIds, tagDeCurso]
  );

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const [recs, leidos] = await Promise.all([
      supabase
        .from("recordatorios")
        .select("*")
        .in("curso_id", cursoIds)
        .order("fecha", { ascending: true, nullsFirst: false })
        .order("id", { ascending: false }),
      userId
        ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId)
        : Promise.resolve({ data: [] }),
    ]);
    setRecordatorios(recs.data || []);
    setLeidosSet(new Set((leidos.data || []).map((r) => r.recordatorio_id)));
  }, [cursoIds, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async () => {
    if (!form.texto?.trim()) return;
    // En vista "Todos" el alta exige un curso destino elegido en el modal.
    const cursoDestino = cursoId || form.curso_id;
    if (!modal?.id && !cursoDestino) return;
    setSaving(true);
    const payload = {
      texto: sanitize(form.texto),
      fecha: form.fecha || null,
      prioridad: form.prioridad || "media",
      urgente: form.urgente || false,
      adjuntos: form.adjuntos || [],
      curso_id: cursoDestino,
    };
    if (modal?.id) {
      // Al editar no se pisa curso_id: en vista "Todos" la fila puede ser de
      // otro curso y el payload lo movería.
      const { curso_id: _cid, ...upd } = payload;
      await supabase.from("recordatorios").update(upd).eq("id", modal.id);
    } else {
      await supabase.from("recordatorios").insert({ ...payload, creado_por: userId });
      if (isAdmin) {
        const userIds = await getUserIdsByCurso(cursoDestino);
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
    setForm({
      texto: "",
      fecha: "",
      prioridad: "media",
      urgente: false,
      adjuntos: [],
      // En vista "Todos" arranca en el primer curso; el modal muestra el selector.
      curso_id: cursoId || cursoIds[0] || null,
    });
    setModal({});
  };
  const abrirEditar = useCallback((r) => {
    setForm({
      texto: r.texto || "",
      fecha: r.fecha || "",
      prioridad: r.prioridad || "media",
      urgente: r.urgente || false,
      adjuntos: r.adjuntos || [],
      curso_id: r.curso_id || null,
    });
    setModal(r);
  }, []);

  // Ocultar solo los de regalo (se manejan aparte). Los de colecta (colecta_vence)
  // SÍ se muestran, igual que en la web.
  const visiblesTipo = recordatorios.filter((r) => r.tipo !== "regalo_cumple");
  const sinLeer = visiblesTipo.filter((r) => !leidosSet.has(r.id)).length;

  const filtrados = visiblesTipo
    .filter((r) => {
      if (filtroRango === "proximos" && r.fecha && r.fecha < hoyStr) return false;
      if (filtroRango === "pasados" && (!r.fecha || r.fecha >= hoyStr)) return false;
      if (filtroPrio !== "all" && r.prioridad !== filtroPrio) return false;
      if (filtroLeido === "leidos" && !leidosSet.has(r.id)) return false;
      if (filtroLeido === "noleidos" && leidosSet.has(r.id)) return false;
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
            // Los de colecta no se editan/borran acá: viven y mueren con su colecta (igual que la web)
            puedeEditar={
              (esVistaTodos ? item.creado_por === userId || cursosAdmin.has(item.curso_id) : isAdmin || item.creado_por === userId) &&
              item.tipo !== "colecta_vence"
            }
            tag={tagDeCurso(item.curso_id)}
            onLeido={marcarLeido}
            onEditar={abrirEditar}
            onEliminar={eliminar}
          />
        )}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.h1}>Recordatorios</Text>
              <Pressable onPress={abrirNuevo} style={styles.nuevoBtn}>
                <MaterialCommunityIcons name="plus" size={14} color={t.onAccent} />
                <Text style={styles.nuevoTxt}>Nuevo</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>
              {sinLeer === 0 ? "Todo leído" : sinLeer === 1 ? "1 sin leer" : `${sinLeer} sin leer`}
            </Text>

            <View style={styles.filtersRow}>
              <SelectChip
                label="Rango"
                icon="calendar-range-outline"
                value={filtroRango}
                options={RANGOS}
                onChange={(v) => {
                  setFiltroRango(v);
                  setPagina(1);
                }}
              />
              <SelectChip
                label="Prioridad"
                icon="flag-outline"
                value={filtroPrio}
                options={PRIOS}
                onChange={(v) => {
                  setFiltroPrio(v);
                  setPagina(1);
                }}
              />
              <SelectChip
                label="Estado"
                icon="check-circle-outline"
                value={filtroLeido}
                options={LEIDOS}
                onChange={(v) => {
                  setFiltroLeido(v);
                  setPagina(1);
                }}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            emoji="📌"
            title="Sin recordatorios"
            note="Cuando el curso tenga avisos o recordatorios, aparecen acá."
            compact
          />
        }
        ListFooterComponent={
          <View>
            <Paginador pagina={pagina_} totalPag={totalPags} setPagina={setPagina} />
            <HistorialComunicados cursoIds={cursoIds} tagDeCurso={tagDeCurso} />
          </View>
        }
      />

      <RecordatorioModal
        visible={modal !== null}
        form={form}
        setForm={setForm}
        saving={saving}
        editing={!!modal?.id}
        cursoId={cursoId || form.curso_id}
        // En vista "Todos" el alta pide elegir el curso destino.
        cursosOpciones={esVistaTodos && !modal?.id ? cursosOpciones : []}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />
    </View>
  );
}

function RecordatorioModal({ visible, form, setForm, saving, editing, cursoId, cursosOpciones = [], onClose, onGuardar }) {
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{editing ? "Editar recordatorio" : "Nuevo recordatorio"}</Text>
          {cursosOpciones.length > 0 ? (
            <>
              <Text style={styles.modalLabel}>Para el curso de</Text>
              <View style={styles.cursoRow}>
                {cursosOpciones.map((o) => {
                  const active = form.curso_id === o.curso_id;
                  return (
                    <Pressable
                      key={o.curso_id}
                      onPress={() => setForm((p) => ({ ...p, curso_id: o.curso_id }))}
                      style={[styles.cursoBtn, active && styles.cursoBtnOn]}
                    >
                      <View style={[styles.tagDot, { backgroundColor: o.tag.color }]} />
                      <Text style={[styles.cursoTxt, active && styles.cursoTxtOn]} numberOfLines={1}>
                        {o.tag.nombre}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.modalLabel}>Texto</Text>
          <TextInput
            value={form.texto}
            onChangeText={(v) => setForm((p) => ({ ...p, texto: v }))}
            placeholder="Ej: Reunión de padres el viernes"
            placeholderTextColor={t.placeholder}
            multiline
            style={[styles.modalInput, styles.modalTextarea]}
          />

          <Text style={styles.modalLabel}>Fecha (opcional)</Text>
          <DateField
            value={form.fecha || ""}
            onChange={(v) => setForm((p) => ({ ...p, fecha: v }))}
            clearable
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>Prioridad</Text>
          <View style={styles.prioRow}>
            {["alta", "media", "baja"].map((p) => {
              const active = form.prioridad === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setForm((f) => ({ ...f, prioridad: p }))}
                  style={[styles.prioBtn, active && { borderColor: PRIO[p].c, backgroundColor: PRIO[p].bg }]}
                >
                  <Text style={[styles.prioTxt, active && { color: p === "media" ? "#B45309" : PRIO[p].c }]}>
                    {PRIO[p].l}
                  </Text>
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

          <Text style={styles.modalLabel}>Adjuntos (opcional)</Text>
          <AdjuntosInput
            adjuntos={form.adjuntos || []}
            onChange={(adj) => setForm((p) => ({ ...p, adjuntos: adj }))}
            cursoId={cursoId}
            onUploadingChange={setSubiendoAdj}
          />

          <View style={styles.modalBtns}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelTxt}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={onGuardar} disabled={saving || subiendoAdj} style={[styles.saveBtn, subiendoAdj && styles.saveBtnOff]}>
              <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HistorialComunicados({ cursoIds, tagDeCurso }) {
  const [alertas, setAlertas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    if (!cursoIds?.length) return;
    setCargando(true);
    const { data } = await supabase
      .from("alertas")
      .select("*")
      .in("curso_id", cursoIds)
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
      <Text style={styles.label}>Comunicados</Text>
      <Pressable onPress={toggle} style={styles.histToggle}>
        <Text style={styles.histToggleTxt}>📢 Historial de comunicados</Text>
        <MaterialCommunityIcons name={abierto ? "chevron-up" : "chevron-down"} size={18} color={t.textFaint} />
      </Pressable>

      {abierto ? (
        <View style={styles.histList}>
          {cargando ? <Text style={styles.empty}>Cargando...</Text> : null}
          {!cargando && alertas.length === 0 ? <Text style={styles.empty}>Sin comunicados anteriores</Text> : null}
          {!cargando &&
            alertas.map((a) => (
              <View key={a.id} style={[styles.histItem, a.activa && styles.histItemActiva]}>
                <Text style={styles.histEmoji}>{a.activa ? "🚨" : "📢"}</Text>
                <View style={styles.flex1}>
                  <Text style={styles.histMsg}>{a.mensaje}</Text>
                  {tagDeCurso?.(a.curso_id) ? (
                    <View style={styles.tagRow}>
                      <View style={[styles.tagDot, { backgroundColor: tagDeCurso(a.curso_id).color }]} />
                      <Text style={styles.tagTxt} numberOfLines={1}>{tagDeCurso(a.curso_id).nombre}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.histDate}>{fmtFecha(a.creado_en)}</Text>
                </View>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

// Estilos A3: sin sombras, borde hairline, radio 16, dot de estado como ancla.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  headerWrap: { marginBottom: SPACE.xs },
  flex1: { flex: 1 },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 4 },
  nuevoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    backgroundColor: t.accent,
  },
  nuevoTxt: { color: t.onAccent, fontSize: 12.5, fontWeight: "800" },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: SPACE.sm },

  // filtros colapsados (SelectChip del sistema, con icono en vez de label para
  // entrar en una fila); wrap de respaldo: con fuentes grandes o pantallas muy
  // angostas un chip baja de línea en vez de cortarse contra el borde
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.md },

  // fila de recordatorio
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: 13,
    marginBottom: SPACE.sm,
    borderRadius: RADIUS.xl,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  rdot: { width: 8, height: 8, borderRadius: RADIUS.full },
  rdotLeido: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: SLATE[300] },
  rowTxt: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, lineHeight: 19 },
  rowTxtLeido: { fontWeight: "500", color: t.textMuted },
  rowMeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  // tag de hijo en modo "Todos": dot con el color de identidad + primer(os) nombre(s)
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  tagDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  tagTxt: { fontSize: 11.5, fontWeight: "700", color: t.textMuted },
  rowActions: { alignItems: "flex-end", gap: 6 },
  leerBtn: { minHeight: 30, justifyContent: "center" },
  leerTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  checkBtn: { minHeight: 30, minWidth: 30, alignItems: "center", justifyContent: "center" },
  editRow: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { textAlign: "center", paddingVertical: SPACE.xl, color: t.textFaint, fontSize: 13 },

  // modal
  modalOverlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginBottom: 14 },
  // selector de curso destino (solo vista "Todos")
  cursoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cursoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  cursoBtnOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  cursoTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  cursoTxtOn: { color: BLUE[600] },
  modalLabel: { ...TYPE.label, color: t.textFaint, marginBottom: 5, marginTop: 6 },
  modalInput: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surfaceSunken,
    paddingHorizontal: SPACE.md,
    fontSize: 13,
    color: t.text,
  },
  modalTextarea: { minHeight: 72, paddingTop: 10, textAlignVertical: "top" },
  prioRow: { flexDirection: "row", gap: 6 },
  prioBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  prioTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  urgenteBtn: {
    alignSelf: "flex-start",
    marginTop: SPACE.md,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  urgenteOn: { borderColor: t.danger, backgroundColor: t.dangerSoft },
  urgenteTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  urgenteTxtOn: { color: t.danger },
  modalBtns: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.lg },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textFaint, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveBtnOff: { opacity: 0.5 },
  saveTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },

  // historial
  histWrap: { marginTop: SPACE.xl },
  histToggle: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  histToggleTxt: { fontSize: 13.5, fontWeight: "700", color: t.text },
  histList: { marginTop: SPACE.sm },
  histItem: {
    flexDirection: "row",
    gap: 10,
    padding: SPACE.md,
    marginBottom: 6,
    borderRadius: RADIUS.xl,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  histItemActiva: { backgroundColor: t.dangerSoft, borderColor: STATUS.danger.border },
  histEmoji: { fontSize: 18 },
  histMsg: { fontSize: 13, fontWeight: "600", color: t.text, lineHeight: 18, marginBottom: 4 },
  histDate: { fontSize: 11, color: t.textFaint },
});
