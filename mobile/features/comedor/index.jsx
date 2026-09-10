// Comedor (puerto RN de src/features/comedor). Rediseño 2026-09: navegación
// día por día como vista principal (fecha grande + flechas, hoy por defecto,
// salta fines de semana), platos en tarjetas elevadas agrupadas por tiempo
// (entrada / principal / postre), etiquetas rápidas (Sin TACC, etc.) y notas
// de alérgenos por día. Vista "semana" consolidada como toggle secundario.
// El admin carga el menú desde un Excel (expo-document-picker + xlsx).

import { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { MESES, T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";

const t = THEMES.light;

// Los 6 campos de `menu`, agrupados por momento de la comida. Cada grupo se
// pinta como una sección con sus platos en tarjetas.
const GRUPOS = [
  { label: "Entrada", icon: "bowl-mix-outline", color: "#8B5CF6", campos: [{ key: "entrada" }] },
  { label: "Plato principal", icon: "silverware-fork-knife", color: "#3B82F6", campos: [{ key: "plato" }, { key: "plato2" }, { key: "acompanamiento" }] },
  { label: "Postre", icon: "food-apple-outline", color: "#10B981", campos: [{ key: "postre" }, { key: "postre2" }] },
];
const CAMPOS_ORDEN = ["entrada", "plato", "plato2", "acompanamiento", "postre", "postre2"];

// Vocabulario fijo de etiquetas rápidas (nivel día). El admin las tilda en el
// modal; el apoderado las escanea de un vistazo. Strings que no matcheen se
// muestran igual, en gris.
const ETIQUETAS = [
  { id: "Sin TACC", color: "#B45309", bg: "#FEF3C7" },
  { id: "Sin lactosa", color: "#0369A1", bg: "#E0F2FE" },
  { id: "Opción vegetariana", color: "#15803D", bg: "#DCFCE7" },
  { id: "Opción vegana", color: "#166534", bg: "#DCFCE7" },
  { id: "Sin frutos secos", color: "#9333EA", bg: "#F3E8FF" },
];
const etiquetaStyle = (id) => ETIQUETAS.find((e) => e.id === id) || { id, color: t.textMuted, bg: t.surfaceSunken };

const iso = (d) => d.toISOString().split("T")[0];
const parseISO = (s) => new Date(s + "T00:00:00");
const esFinde = (d) => d.getDay() === 0 || d.getDay() === 6;
// Mueve la fecha al día hábil más cercano en la dirección dada (para no
// aterrizar nunca en sábado/domingo, que no tienen menú).
const snapHabil = (d, dir = 1) => {
  const x = new Date(d);
  while (esFinde(x)) x.setDate(x.getDate() + dir);
  return x;
};

// puedeEditar/mostrarUpload permiten embeber este mismo componente en el
// Menú de Super Admin (puedeEditar=true, mostrarUpload=false).
export function Comedor({ puedeEditar = false, mostrarUpload = true } = {}) {
  const { isAdmin } = useSession();
  const [menu, setMenu] = useState([]);
  const [vista, setVista] = useState("dia"); // "dia" | "semana"
  const [fechaSel, setFechaSel] = useState(iso(snapHabil(new Date())));
  const [editModal, setEditModal] = useState(null);

  // Multi-colegio: menu.colegio_id es NOT NULL. Mobile todavía no tiene
  // selector de colegio — se resuelve al único/primer colegio existente.
  const [colegioId, setColegioId] = useState(null);
  useEffect(() => {
    supabase.from("colegios").select("id").order("creado_en").limit(1).single().then((r) => setColegioId(r.data?.id ?? null));
  }, []);

  const cargarMenu = useCallback(() => {
    supabase.from("menu").select("*").order("fecha").then((r) => setMenu(r.data || []));
  }, []);
  useEffect(() => { cargarMenu(); }, [cargarMenu]);

  const menuPorFecha = useMemo(() => {
    const map = {};
    for (const m of menu) map[m.fecha] = m;
    return map;
  }, [menu]);

  const hoyIso = iso(new Date());
  const dSel = parseISO(fechaSel);
  const menuSel = menuPorFecha[fechaSel] || null;

  const navDia = (dir) => {
    const d = parseISO(fechaSel);
    d.setDate(d.getDate() + dir);
    setFechaSel(iso(snapHabil(d, dir)));
  };

  // ── Semana (lunes a viernes de la semana de fechaSel) ──
  const semanaBase = useMemo(() => {
    const d = parseISO(fechaSel);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
  }, [fechaSel]);
  const diasSemana = useMemo(
    () => Array.from({ length: 5 }, (_, i) => { const d = new Date(semanaBase); d.setDate(d.getDate() + i); return iso(d); }),
    [semanaBase]
  );
  const navSemana = (dir) => { const d = parseISO(fechaSel); d.setDate(d.getDate() + dir * 7); setFechaSel(iso(d)); };
  const semanaLabel = () => {
    const ini = parseISO(diasSemana[0]);
    const fin = parseISO(diasSemana[4]);
    return `${ini.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]}`;
  };

  const abrirEdicion = (fecha) => {
    const e = menuPorFecha[fecha];
    setEditModal(e
      ? { ...e, etiquetas: Array.isArray(e.etiquetas) ? e.etiquetas : [] }
      : { fecha, colegio_id: colegioId, entrada: "", plato: "", plato2: "", acompanamiento: "", postre: "", postre2: "", etiquetas: [], notas: "" });
  };
  const guardarDia = async (form) => {
    const { error } = await supabase.from("menu").upsert(
      { ...form, colegio_id: form.colegio_id || colegioId },
      { onConflict: "colegio_id,fecha" }
    );
    if (error) { console.warn("Comedor.guardarDia:", error?.message); return error; }
    setEditModal(null);
    cargarMenu();
  };
  const borrarDia = async (fecha) => {
    const { error } = await supabase.from("menu").delete().eq("fecha", fecha).eq("colegio_id", colegioId);
    if (error) { console.warn("Comedor.borrarDia:", error?.message); return; }
    setEditModal(null);
    cargarMenu();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <View style={styles.flex1}>
          <Text style={styles.h1}>Comedor</Text>
          <Text style={styles.subtitle}>Menú cargado por el colegio</Text>
        </View>
        <Pressable
          onPress={() => setVista((v) => (v === "dia" ? "semana" : "dia"))}
          style={styles.toggleBtn}
          hitSlop={8}
        >
          <MaterialCommunityIcons
            name={vista === "dia" ? "calendar-week" : "calendar-today"}
            size={15}
            color={BLUE[600]}
          />
          <Text style={styles.toggleTxt}>{vista === "dia" ? "Ver semana" : "Ver día"}</Text>
        </Pressable>
      </View>

      {mostrarUpload && isAdmin ? <UploadMenuExcel onDone={cargarMenu} colegioId={colegioId} /> : null}

      {vista === "dia" ? (
        <View>
          {/* Cabecera con fecha grande + flechas */}
          <View style={styles.dayNav}>
            <Pressable onPress={() => navDia(-1)} style={styles.navBtn} hitSlop={6}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={t.textMuted} />
            </Pressable>
            <View style={styles.dayNavCenter}>
              <Text style={styles.dayNavDow}>
                {fechaSel === hoyIso ? "HOY" : parseISO(fechaSel).toLocaleDateString("es-AR", { weekday: "long" }).toUpperCase()}
              </Text>
              <Text style={styles.dayNavDate}>
                {dSel.getDate()} de {MESES[dSel.getMonth()].toLowerCase()}
              </Text>
            </View>
            <Pressable onPress={() => navDia(1)} style={styles.navBtn} hitSlop={6}>
              <MaterialCommunityIcons name="chevron-right" size={22} color={t.textMuted} />
            </Pressable>
          </View>
          {fechaSel !== hoyIso ? (
            <Pressable onPress={() => setFechaSel(iso(snapHabil(new Date())))} style={styles.volverHoy} hitSlop={6}>
              <Text style={styles.volverHoyTxt}>← Volver a hoy</Text>
            </Pressable>
          ) : null}

          <DiaDetalle
            m={menuSel}
            puedeEditar={puedeEditar}
            onEditar={() => abrirEdicion(fechaSel)}
          />
        </View>
      ) : (
        <View>
          <View style={styles.weekNav}>
            <Pressable onPress={() => navSemana(-1)} style={styles.navBtn} hitSlop={6}>
              <MaterialCommunityIcons name="chevron-left" size={20} color={t.textMuted} />
            </Pressable>
            <Text style={styles.weekLabel}>{semanaLabel()}</Text>
            <Pressable onPress={() => navSemana(1)} style={styles.navBtn} hitSlop={6}>
              <MaterialCommunityIcons name="chevron-right" size={20} color={t.textMuted} />
            </Pressable>
          </View>

          {diasSemana.map((fecha) => {
            const d = parseISO(fecha);
            const m = menuPorFecha[fecha];
            const principal = m ? [m.plato, m.plato2, m.acompanamiento].filter(Boolean) : [];
            const extras = m ? CAMPOS_ORDEN.filter((k) => m[k]).length - (principal[0] ? 1 : 0) : 0;
            const isHoy = fecha === hoyIso;
            const etiquetas = Array.isArray(m?.etiquetas) ? m.etiquetas : [];
            return (
              <Pressable
                key={fecha}
                onPress={() => { setFechaSel(fecha); setVista("dia"); }}
                style={[styles.weekRow, isHoy && styles.weekRowHoy]}
              >
                <View style={styles.weekDate}>
                  <Text style={[styles.weekDow, isHoy && styles.weekHoyTxt]}>
                    {d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")}
                  </Text>
                  <Text style={[styles.weekDay, isHoy && styles.weekHoyTxt]}>{d.getDate()}</Text>
                </View>
                <View style={styles.flex1}>
                  {m ? (
                    <>
                      <Text style={styles.weekPrincipal} numberOfLines={1}>
                        {principal[0] || m.entrada || m.postre || "Menú cargado"}
                      </Text>
                      <View style={styles.weekMetaRow}>
                        {extras > 0 ? <Text style={styles.weekResto}>+{extras} opcion{extras !== 1 ? "es" : ""}</Text> : null}
                        {etiquetas.slice(0, 3).map((e) => {
                          const s = etiquetaStyle(e);
                          return <View key={e} style={[styles.weekDot, { backgroundColor: s.color }]} />;
                        })}
                      </View>
                    </>
                  ) : (
                    <Text style={styles.sinMenu}>Sin menú</Text>
                  )}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={t.textFaint} />
              </Pressable>
            );
          })}
          <Text style={styles.hint}>Tocá un día para ver el detalle completo</Text>
        </View>
      )}

      {editModal ? (
        <MenuDiaModal dia={editModal} onClose={() => setEditModal(null)} onSave={guardarDia} onBorrar={borrarDia} />
      ) : null}
    </ScrollView>
  );
}

// ── Detalle de un día: etiquetas + notas + platos en tarjetas por grupo ──
function DiaDetalle({ m, puedeEditar, onEditar }) {
  const etiquetas = Array.isArray(m?.etiquetas) ? m.etiquetas : [];
  const tieneAlgo = m && CAMPOS_ORDEN.some((k) => m[k]);

  if (!tieneAlgo) {
    return (
      <View style={styles.emptyBox}>
        <MaterialCommunityIcons name="silverware-clean" size={28} color={t.textFaint} />
        <Text style={styles.emptyTitle}>Sin menú para este día</Text>
        <Text style={styles.emptySub}>Todavía no está cargado. Probá con otro día.</Text>
        {puedeEditar ? (
          <Pressable onPress={onEditar} style={styles.editarDiaBtn}>
            <Text style={styles.editarDiaTxt}>+ Cargar día</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {etiquetas.length ? (
        <View style={styles.badgeRow}>
          {etiquetas.map((e) => {
            const s = etiquetaStyle(e);
            return (
              <View key={e} style={[styles.badge, { backgroundColor: s.bg }]}>
                <Text style={[styles.badgeTxt, { color: s.color }]}>{e}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {m.notas ? (
        <View style={styles.notasCard}>
          <MaterialCommunityIcons name="information-outline" size={16} color="#B45309" />
          <Text style={styles.notasTxt}>{m.notas}</Text>
        </View>
      ) : null}

      {GRUPOS.map((g) => {
        const platos = g.campos.map((c) => m[c.key]).filter(Boolean);
        if (!platos.length) return null;
        return (
          <View key={g.label} style={styles.grupo}>
            <View style={styles.grupoHead}>
              <MaterialCommunityIcons name={g.icon} size={14} color={g.color} />
              <Text style={[styles.grupoLabel, { color: g.color }]}>{g.label.toUpperCase()}</Text>
            </View>
            {platos.map((p, i) => (
              <View key={i} style={styles.platoCard}>
                <Text style={styles.platoNombre}>{p}</Text>
              </View>
            ))}
          </View>
        );
      })}

      {puedeEditar ? (
        <Pressable onPress={onEditar} style={styles.editarDiaBtnFull}>
          <MaterialCommunityIcons name="pencil-outline" size={15} color={BLUE[600]} />
          <Text style={styles.editarDiaTxt}>Editar día</Text>
        </Pressable>
      ) : (
        <Text style={styles.alergiasNota}>¿Alergias o intolerancias? Consultalas en Contacto.</Text>
      )}
    </View>
  );
}

function MenuDiaModal({ dia, onClose, onSave, onBorrar }) {
  const [form, setForm] = useState({ ...dia, etiquetas: Array.isArray(dia.etiquetas) ? dia.etiquetas : [] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const esNuevo = !CAMPOS_ORDEN.some((k) => dia[k]);
  const camposForm = [
    { key: "entrada", label: "Entrada" },
    { key: "plato", label: "Plato principal 1" },
    { key: "plato2", label: "Plato principal 2" },
    { key: "acompanamiento", label: "Plato principal 3" },
    { key: "postre", label: "Postre 1" },
    { key: "postre2", label: "Postre 2" },
  ];
  const toggleEtiqueta = (id) =>
    setForm((p) => ({
      ...p,
      etiquetas: p.etiquetas.includes(id) ? p.etiquetas.filter((x) => x !== id) : [...p.etiquetas, id],
    }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Cargar día" : "Editar día"}</Text>
            <Text style={styles.modalSub}>
              {parseISO(dia.fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </Text>
            {camposForm.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label.toUpperCase()}</Text>
                <TextInput
                  value={form[f.key] || ""}
                  onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  style={styles.input}
                  placeholder="—"
                  placeholderTextColor={t.textFaint}
                />
              </View>
            ))}

            <Text style={[styles.label, { marginTop: SPACE.md }]}>ETIQUETAS</Text>
            <View style={styles.chipWrap}>
              {ETIQUETAS.map((e) => {
                const on = form.etiquetas.includes(e.id);
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => toggleEtiqueta(e.id)}
                    style={[styles.chip, on && { backgroundColor: e.bg, borderColor: e.color }]}
                  >
                    <Text style={[styles.chipTxt, on && { color: e.color, fontWeight: "800" }]}>{e.id}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { marginTop: SPACE.md }]}>NOTAS / ALÉRGENOS</Text>
            <TextInput
              value={form.notas || ""}
              onChangeText={(v) => setForm((p) => ({ ...p, notas: v }))}
              style={[styles.input, styles.inputMulti]}
              multiline
              placeholder="Aclaraciones sobre alérgenos, opción sin TACC, etc."
              placeholderTextColor={t.textFaint}
            />

            {err ? <Text style={styles.modalErr}>{err}</Text> : null}

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              {!esNuevo ? (
                <Pressable onPress={() => onBorrar(dia.fecha)} style={styles.borrarBtn}>
                  <Text style={styles.borrarTxt}>Borrar</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={async () => {
                  setSaving(true); setErr("");
                  const e = await onSave(form);
                  setSaving(false);
                  if (e) setErr(e.message || "No se pudo guardar.");
                }}
                disabled={saving}
                style={styles.saveBtn}
              >
                <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Carga de menú en 4 estados: idle → leyendo → error | preview. El upsert real
// solo corre al confirmar el preview.
export function UploadMenuExcel({ onDone, colegioId: colegioIdProp = null }) {
  const [stage, setStage] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState([]);
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState("");

  const parseFecha = (val) => {
    if (!val) return null;
    if (val instanceof Date) return iso(val);
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      const [d, m, y] = s.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    const n = Number(s);
    if (!isNaN(n) && n > 40000) {
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      return iso(d);
    }
    return s;
  };
  const parseEtiquetas = (val) => {
    if (!val) return [];
    return String(val).split(/[;,/]/).map((s) => s.trim()).filter(Boolean);
  };

  const handlePick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "*/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setStage("leyendo");
      setMsg("");
      const uri = res.assets[0].uri;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      const wb = XLSX.read(b64, { type: "base64", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: true });
      if (rows.length === 0) throw new Error("El archivo está vacío.");

      const keys = Object.keys(rows[0]);
      const colFecha = keys.find((k) => k.toLowerCase().includes("fech"));
      const colEntrada = keys.find((k) => k.toLowerCase().includes("entrada"));
      const colPlato1 = keys.find((k) => k.toLowerCase().includes("plato") && k.includes("1"));
      const colPlato2 = keys.find((k) => k.toLowerCase().includes("plato") && k.includes("2"));
      const colPlato3 = keys.find((k) => k.toLowerCase().includes("plato") && k.includes("3"));
      const colAcomp = keys.find((k) => k.toLowerCase().includes("acomp"));
      const colPostre1 = keys.find((k) => k.toLowerCase().includes("postre") && k.includes("1"));
      const colPostre2 = keys.find((k) => k.toLowerCase().includes("postre") && k.includes("2"));
      const colEtiq = keys.find((k) => k.toLowerCase().includes("etiqueta") || k.toLowerCase().includes("tacc"));
      const colNotas = keys.find((k) => k.toLowerCase().includes("nota") || k.toLowerCase().includes("aclarac") || k.toLowerCase().includes("alerg"));
      if (!colFecha) throw new Error(`No encontré columna de fecha. Renombrá esa columna a "fecha". Columnas encontradas: ${keys.join(", ")}`);

      let colegioDestino = colegioIdProp;
      if (!colegioDestino) {
        const { data: col } = await supabase.from("colegios").select("id").order("creado_en").limit(1).single();
        colegioDestino = col?.id;
      }
      const inserts = rows
        .map((r) => ({
          fecha: parseFecha(r[colFecha]),
          colegio_id: colegioDestino,
          entrada: colEntrada ? r[colEntrada] || null : null,
          plato: colPlato1 ? r[colPlato1] || null : null,
          plato2: colPlato2 ? r[colPlato2] || null : null,
          acompanamiento: colPlato3 ? r[colPlato3] || null : colAcomp ? r[colAcomp] || null : null,
          postre: colPostre1 ? r[colPostre1] || null : null,
          postre2: colPostre2 ? r[colPostre2] || null : null,
          etiquetas: colEtiq ? parseEtiquetas(r[colEtiq]) : [],
          notas: colNotas ? String(r[colNotas] || "").trim() || null : null,
        }))
        .filter((r) => r.fecha);
      if (inserts.length === 0) throw new Error("Columna fecha encontrada pero ningún valor válido. Revisá el formato de las fechas.");

      const { data: existentes } = await supabase.from("menu").select("fecha").eq("colegio_id", colegioDestino).in("fecha", inserts.map((r) => r.fecha));
      const existentesSet = new Set((existentes || []).map((r) => r.fecha));
      const conEstado = inserts.map((r) => {
        const vacio = !r.entrada && !r.plato && !r.plato2 && !r.acompanamiento && !r.postre && !r.postre2;
        return { ...r, estado: vacio ? "vacio" : existentesSet.has(r.fecha) ? "reemplaza" : "nuevo" };
      });
      setPreview(conEstado);
      setStage("preview");
    } catch (err) {
      setErrorMsg(err.message || "Error al leer el archivo.");
      setStage("error");
      console.warn("UploadMenuExcel:", err);
    }
  };

  const confirmarCarga = async () => {
    const aCargar = preview.filter((r) => r.estado !== "vacio").map((r) => {
      const { estado, ...rest } = r; void estado;
      return rest;
    });
    if (aCargar.length === 0) { setStage("idle"); return; }
    setConfirmando(true);
    const { error } = await supabase.from("menu").upsert(aCargar, { onConflict: "colegio_id,fecha" });
    setConfirmando(false);
    if (error) {
      setErrorMsg(error.message || "No se pudo guardar el menú.");
      setStage("error");
      return;
    }
    setMsg(`✅ ${aCargar.length} día${aCargar.length !== 1 ? "s" : ""} actualizado${aCargar.length !== 1 ? "s" : ""}`);
    setStage("idle");
    setPreview([]);
    onDone?.();
  };

  const ESTADO_INFO = {
    nuevo: { label: "Nuevo", color: T.green },
    reemplaza: { label: "Reemplaza", color: "#D97706" },
    vacio: { label: "Sin entrada", color: t.textFaint },
  };

  return (
    <View style={styles.uploadWrap}>
      <Text style={styles.uploadLabel}>Cargar menú desde Excel</Text>

      {stage === "preview" ? (
        <View style={styles.previewBox}>
          <Text style={styles.previewTitle}>
            {preview.length} día{preview.length !== 1 ? "s" : ""} encontrado{preview.length !== 1 ? "s" : ""} — revisá antes de confirmar
          </Text>
          <ScrollView style={styles.previewList} nestedScrollEnabled>
            {preview.map((r) => {
              const info = ESTADO_INFO[r.estado];
              return (
                <View key={r.fecha} style={styles.previewRow}>
                  <Text style={styles.previewFecha} numberOfLines={1}>
                    {parseISO(r.fecha).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                  <View style={[styles.previewPill, { backgroundColor: `${info.color}1A` }]}>
                    <Text style={[styles.previewPillTxt, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.previewActions}>
            <Pressable onPress={() => { setStage("idle"); setPreview([]); }} disabled={confirmando} style={[styles.previewBtn, styles.previewBtnCancelar]}>
              <Text style={styles.previewBtnCancelarTxt}>Cancelar</Text>
            </Pressable>
            <Pressable onPress={confirmarCarga} disabled={confirmando} style={[styles.previewBtn, styles.previewBtnConfirmar]}>
              <Text style={styles.previewBtnConfirmarTxt}>{confirmando ? "Guardando..." : "Confirmar carga"}</Text>
            </Pressable>
          </View>
        </View>
      ) : stage === "error" ? (
        <View style={styles.previewBox}>
          <Text style={[styles.uploadMsg, { color: T.red }]}>{errorMsg}</Text>
          <Pressable onPress={() => setStage("idle")} style={[styles.previewBtn, styles.previewBtnCancelar, { marginTop: SPACE.sm }]}>
            <Text style={styles.previewBtnCancelarTxt}>Volver a intentar</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={handlePick} disabled={stage === "leyendo"} style={styles.uploadBtn}>
          <MaterialCommunityIcons name="tray-arrow-up" size={18} color={BLUE[600]} />
          <View>
            <Text style={styles.uploadTitle}>{stage === "leyendo" ? "Leyendo archivo..." : "Subir archivo Excel"}</Text>
            <Text style={styles.uploadHint}>Columnas: fecha, plato 1-3, postre, etiquetas, notas</Text>
          </View>
        </Pressable>
      )}

      {msg ? <Text style={[styles.uploadMsg, { color: T.green }]}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACE.lg },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  toggleBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, marginTop: 2 },
  toggleTxt: { fontSize: 12, fontWeight: "700", color: BLUE[600] },

  navBtn: { width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },

  // Día
  dayNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.sm },
  dayNavCenter: { flex: 1, alignItems: "center" },
  dayNavDow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: BLUE[600] },
  dayNavDate: { fontSize: 19, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3, marginTop: 1 },
  volverHoy: { alignSelf: "center", paddingVertical: 4, marginBottom: SPACE.xs },
  volverHoyTxt: { fontSize: 11.5, fontWeight: "700", color: t.textMuted },

  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: SPACE.sm, marginBottom: SPACE.xs },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.full },
  badgeTxt: { fontSize: 11, fontWeight: "800", letterSpacing: 0.2 },

  notasCard: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", borderRadius: RADIUS.lg, padding: SPACE.md, marginTop: SPACE.sm },
  notasTxt: { flex: 1, fontSize: 12.5, color: "#92400E", lineHeight: 18, fontWeight: "600" },

  grupo: { marginTop: SPACE.lg },
  grupoHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: SPACE.sm },
  grupoLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  platoCard: { backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.borderStrong, paddingVertical: 14, paddingHorizontal: SPACE.md, marginBottom: SPACE.sm },
  platoNombre: { fontSize: 15, fontWeight: "700", color: t.textStrong, lineHeight: 21 },

  emptyBox: { alignItems: "center", gap: 6, paddingVertical: 40, paddingHorizontal: SPACE.lg },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginTop: 4 },
  emptySub: { fontSize: 12.5, color: t.textFaint, textAlign: "center" },

  editarDiaBtn: { alignSelf: "center", marginTop: SPACE.md, paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  editarDiaBtnFull: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACE.lg, paddingVertical: 11, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  editarDiaTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  alergiasNota: { fontSize: 11, color: t.textFaint, textAlign: "center", marginTop: SPACE.lg },

  // Semana
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.lg },
  weekLabel: { fontSize: 14, fontWeight: "700", color: t.textStrong, flex: 1, textAlign: "center" },
  weekRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: SPACE.md, marginBottom: SPACE.sm },
  weekRowHoy: { borderColor: t.accent, borderWidth: 1.5, backgroundColor: t.accentSoft },
  weekDate: { width: 44, alignItems: "center" },
  weekDow: { fontSize: 10, fontWeight: "700", color: t.textFaint, textTransform: "uppercase", letterSpacing: 1 },
  weekDay: { fontSize: 17, fontWeight: "800", color: t.textStrong, fontVariant: ["tabular-nums"] },
  weekHoyTxt: { color: BLUE[600] },
  weekPrincipal: { fontSize: 13.5, fontWeight: "700", color: t.textStrong },
  weekMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  weekResto: { fontSize: 11.5, color: t.textFaint },
  weekDot: { width: 7, height: 7, borderRadius: 4 },
  sinMenu: { fontSize: 12, color: t.textFaint },
  hint: { fontSize: 11, color: t.textFaint, textAlign: "center", marginTop: 10 },

  // Upload
  uploadWrap: { marginBottom: SPACE.xl },
  uploadLabel: { ...TYPE.label, color: t.textFaint, marginBottom: SPACE.sm },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 14, borderRadius: RADIUS.lg, borderWidth: 1.5, borderStyle: "dashed", borderColor: t.accent, backgroundColor: t.accentSoft, minHeight: 44 },
  uploadTitle: { fontSize: 13, fontWeight: "700", color: BLUE[600] },
  uploadHint: { fontSize: 11, color: t.textFaint },
  previewBox: { padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface },
  previewTitle: { fontSize: 12.5, fontWeight: "700", color: t.textStrong, marginBottom: SPACE.sm },
  previewList: { maxHeight: 220 },
  previewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border },
  previewFecha: { fontSize: 13, color: t.text, fontWeight: "600", textTransform: "capitalize", flex: 1 },
  previewPill: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: RADIUS.full },
  previewPillTxt: { fontSize: 10.5, fontWeight: "800" },
  previewActions: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md },
  previewBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  previewBtnCancelar: { borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface },
  previewBtnCancelarTxt: { fontSize: 13, fontWeight: "700", color: t.textMuted },
  previewBtnConfirmar: { backgroundColor: SLATE[900] },
  previewBtnConfirmarTxt: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  uploadMsg: { fontSize: 13, marginTop: 10, fontWeight: "600" },

  // Modal
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 440, maxHeight: "88%", backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: t.textStrong, letterSpacing: -0.2, marginBottom: 2 },
  modalSub: { fontSize: 12, color: t.textFaint, marginBottom: 14, textTransform: "capitalize" },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 6, marginTop: SPACE.sm },
  input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, paddingHorizontal: 12, fontSize: 14, color: t.text },
  inputMulti: { minHeight: 66, paddingTop: 10, textAlignVertical: "top" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  modalErr: { fontSize: 12.5, color: t.danger, fontWeight: "600", marginTop: 10 },
  modalBtns: { flexDirection: "row", gap: 8, marginTop: 16 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textMuted, fontSize: 14, fontWeight: "700" },
  borrarBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: RADIUS.lg, alignItems: "center", justifyContent: "center" },
  borrarTxt: { color: t.danger, fontSize: 14, fontWeight: "700" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.lg, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
});
