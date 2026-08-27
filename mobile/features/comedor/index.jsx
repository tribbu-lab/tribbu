// Comedor (puerto RN de src/features/comedor). Vistas día / semana / mes del
// `menu`. El admin carga el menú desde un Excel con expo-document-picker +
// expo-file-system (base64) + la lib xlsx (misma que la web).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as XLSX from "xlsx";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { MESES, T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";

const t = THEMES.light;

const CAMPOS = [
  { key: "entrada", label: "Entrada", color: "#8B5CF6", emoji: "🥣" },
  { key: "plato", label: "Plato Principal 1", color: "#3B82F6", emoji: "🍽️" },
  { key: "plato2", label: "Plato Principal 2", color: "#0EA5E9", emoji: "🍽️" },
  { key: "acompanamiento", label: "Plato Principal 3", color: "#6366F1", emoji: "🍽️" },
  { key: "postre", label: "Postre 1", color: "#10B981", emoji: "🍎" },
  { key: "postre2", label: "Postre 2", color: "#34D399", emoji: "🍊" },
];

const iso = (d) => d.toISOString().split("T")[0];
const pad = (n) => String(n).padStart(2, "0");

export function Comedor() {
  const { isAdmin } = useSession();
  const [menu, setMenu] = useState([]);
  const [vista, setVista] = useState("diario");
  const [fechaSel, setFechaSel] = useState(iso(new Date()));
  const [mes, setMes] = useState(new Date());

  const cargarMenu = useCallback(() => {
    supabase
      .from("menu")
      .select("*")
      .order("fecha")
      .then((r) => setMenu(r.data || []));
  }, []);

  useEffect(() => {
    cargarMenu();
  }, [cargarMenu]);

  const diaActual = menu.find((m) => m.fecha === fechaSel);
  const year = mes.getFullYear();
  const month = mes.getMonth();

  // Semana (lunes a viernes)
  const getInicioSemana = (fecha) => {
    const d = new Date(fecha + "T00:00:00");
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  };
  const semanaBase = getInicioSemana(fechaSel);
  const diasSemana = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(semanaBase);
    d.setDate(d.getDate() + i);
    return iso(d);
  });
  const navSemana = (dir) => {
    const d = new Date(fechaSel + "T00:00:00");
    d.setDate(d.getDate() + dir * 7);
    setFechaSel(iso(d));
  };
  const navDia = (dir) => {
    const d = new Date(fechaSel + "T00:00:00");
    d.setDate(d.getDate() + dir);
    setFechaSel(iso(d));
  };
  const semanaLabel = () => {
    const ini = new Date(diasSemana[0] + "T00:00:00");
    const fin = new Date(diasSemana[4] + "T00:00:00");
    return `${ini.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
  };

  // Mes
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  const tieneMenu = (day) => menu.some((m) => m.fecha === `${year}-${pad(month + 1)}-${pad(day)}`);
  const hoyIso = iso(new Date());

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Comedor 🍽️</Text>
      <Text style={styles.subtitle}>Menú del curso</Text>

      {isAdmin ? <UploadMenuExcel onDone={cargarMenu} /> : null}

      <View style={styles.tabs}>
        {[
          { id: "diario", l: "Día" },
          { id: "semanal", l: "Semana" },
          { id: "mensual", l: "Mes" },
        ].map((v) => (
          <Pressable
            key={v.id}
            onPress={() => setVista(v.id)}
            style={[styles.tab, vista === v.id && styles.tabActive]}
          >
            <Text style={[styles.tabTxt, vista === v.id && styles.tabTxtActive]}>{v.l}</Text>
          </Pressable>
        ))}
      </View>

      {vista === "diario" ? (
        <View>
          <View style={styles.diaNav}>
            <Pressable onPress={() => navDia(-1)} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={t.textMuted} />
            </Pressable>
            <Text style={styles.diaLabel}>
              {new Date(fechaSel + "T00:00:00").toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </Text>
            <Pressable onPress={() => navDia(1)} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.textMuted} />
            </Pressable>
          </View>
          {diaActual ? (
            <Card style={styles.menuCard}>
              {CAMPOS.filter((c) => diaActual[c.key]).map((c, i) => (
                <View
                  key={c.key}
                  style={[styles.platoRow, { borderLeftColor: c.color }, i > 0 && styles.platoRowDivider]}
                >
                  <Text style={[styles.platoLabel, { color: c.color }]}>
                    {c.emoji} {c.label.toUpperCase()}
                  </Text>
                  <Text style={styles.platoTxt}>{diaActual[c.key]}</Text>
                </View>
              ))}
            </Card>
          ) : (
            <Card style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.muted}>No hay menú cargado para este día</Text>
            </Card>
          )}
          <Text style={styles.alergiasNota}>¿Alergias o intolerancias? Consultalas en Contacto.</Text>
        </View>
      ) : null}

      {vista === "semanal" ? (
        <View>
          <View style={styles.weekNav}>
            <Pressable onPress={() => navSemana(-1)} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={t.textMuted} />
            </Pressable>
            <Text style={styles.weekLabel}>{semanaLabel()}</Text>
            <Pressable onPress={() => navSemana(1)} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.textMuted} />
            </Pressable>
          </View>
          {diasSemana.map((fecha) => {
            const d = new Date(fecha + "T00:00:00");
            const m = menu.find((x) => x.fecha === fecha);
            const isHoy = fecha === hoyIso;
            return (
              <Pressable
                key={fecha}
                onPress={() => {
                  setFechaSel(fecha);
                  setVista("diario");
                }}
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
                    CAMPOS.filter((c) => m[c.key]).slice(0, 3).map((c) => (
                      <Text key={c.key} style={styles.weekItem}>
                        <Text style={{ color: c.color }}>{c.emoji} </Text>
                        {m[c.key]}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.sinMenu}>Sin menú</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.hint}>Tocá un día para ver el detalle completo</Text>
        </View>
      ) : null}

      {vista === "mensual" ? (
        <View>
          <View style={styles.weekNav}>
            <Pressable onPress={() => setMes(new Date(year, month - 1, 1))} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-left" size={18} color={t.textMuted} />
            </Pressable>
            <Text style={styles.weekLabel}>
              {MESES[month]} {year}
            </Text>
            <Pressable onPress={() => setMes(new Date(year, month + 1, 1))} style={styles.navBtn}>
              <MaterialCommunityIcons name="chevron-right" size={18} color={t.textMuted} />
            </Pressable>
          </View>
          <Card style={styles.calCard}>
            <View style={styles.calGrid}>
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
                <View key={d} style={styles.calCell}>
                  <Text style={styles.calDow}>{d}</Text>
                </View>
              ))}
              {cells.map((day, i) => {
                if (!day) return <View key={`e${i}`} style={styles.calCell} />;
                const fecha = `${year}-${pad(month + 1)}-${pad(day)}`;
                const isHoy = fecha === hoyIso;
                const tieneM = tieneMenu(day);
                return (
                  <Pressable
                    key={fecha}
                    onPress={() => {
                      setFechaSel(fecha);
                      setVista("diario");
                    }}
                    style={styles.calCell}
                  >
                    <View
                      style={[
                        styles.calDayBox,
                        tieneM && !isHoy && styles.calDayMenu,
                        isHoy && styles.calDayHoy,
                      ]}
                    >
                      <Text style={[styles.calDayTxt, isHoy && styles.weekHoyTxt]}>{day}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>
          <Text style={styles.hint}>Tocá un día para ver el menú</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// Carga de menú en 4 estados (Parte 4 del handoff — antes era un upsert
// directo con un alert de texto crudo si algo fallaba):
//   idle → leyendo → error (con las columnas encontradas) | preview
// El upsert real (onConflict:"fecha", pisa lo que ya había) solo corre al
// confirmar el preview, nunca al leer el archivo — antes se escribía sin
// avisar qué días se estaban reemplazando.
export function UploadMenuExcel({ onDone }) {
  const [stage, setStage] = useState("idle"); // idle | leyendo | error | preview
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState([]); // [{fecha, row, estado}]
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
      if (!colFecha) throw new Error(`No encontré columna de fecha. Renombrá esa columna a "fecha". Columnas encontradas: ${keys.join(", ")}`);

      const inserts = rows
        .map((r) => ({
          fecha: parseFecha(r[colFecha]),
          entrada: colEntrada ? r[colEntrada] || null : null,
          plato: colPlato1 ? r[colPlato1] || null : null,
          plato2: colPlato2 ? r[colPlato2] || null : null,
          acompanamiento: colPlato3 ? r[colPlato3] || null : colAcomp ? r[colAcomp] || null : null,
          postre: colPostre1 ? r[colPostre1] || null : null,
          postre2: colPostre2 ? r[colPostre2] || null : null,
        }))
        .filter((r) => r.fecha);
      if (inserts.length === 0) throw new Error("Columna fecha encontrada pero ningún valor válido. Revisá el formato de las fechas.");

      // Preview antes de escribir: el upsert real (onConflict:"fecha") pisa
      // sin avisar, así que primero se lee qué ya había cargado para esos
      // mismos días.
      const { data: existentes } = await supabase.from("menu").select("fecha").in("fecha", inserts.map((r) => r.fecha));
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
    const aCargar = preview.filter((r) => r.estado !== "vacio").map(({ estado, ...r }) => r);
    if (aCargar.length === 0) { setStage("idle"); return; }
    setConfirmando(true);
    const { error } = await supabase.from("menu").upsert(aCargar, { onConflict: "fecha" });
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
                    {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
                  </Text>
                  <View style={[styles.previewPill, { backgroundColor: `${info.color}1A` }]}>
                    <Text style={[styles.previewPillTxt, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.previewActions}>
            <Pressable
              onPress={() => { setStage("idle"); setPreview([]); }}
              disabled={confirmando}
              style={[styles.previewBtn, styles.previewBtnCancelar]}
            >
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
            <Text style={styles.uploadHint}>Formato: menu_tribbu.xlsx</Text>
          </View>
        </Pressable>
      )}

      {msg ? (
        <Text style={[styles.uploadMsg, { color: T.green }]}>{msg}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginBottom: SPACE.lg },
  muted: { fontSize: 13, color: t.textFaint, fontWeight: "600", textAlign: "center" },
  tabs: { flexDirection: "row", gap: 6, marginBottom: SPACE.lg },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: RADIUS.full, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.borderStrong, minHeight: 36, justifyContent: "center" },
  tabActive: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  tabTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  tabTxtActive: { color: "#FFFFFF", fontWeight: "700" },
  diaNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  diaLabel: { fontSize: 14, color: t.textStrong, fontWeight: "700", textTransform: "capitalize", flex: 1, textAlign: "center" },
  navBtn: { width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  menuCard: { padding: 0, overflow: "hidden", borderRadius: RADIUS.xl, borderColor: t.borderStrong, shadowOpacity: 0, elevation: 0 },
  platoRow: { padding: 14, borderLeftWidth: 3 },
  platoRowDivider: { borderTopWidth: 1, borderTopColor: t.borderStrong },
  platoLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 4 },
  platoTxt: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  emptyCard: { padding: SPACE.xxl, alignItems: "center", borderRadius: RADIUS.xl, borderColor: t.borderStrong, shadowOpacity: 0, elevation: 0 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  alergiasNota: { fontSize: 11, color: t.textFaint, textAlign: "center", marginTop: 10 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.lg },
  weekLabel: { fontSize: 14, fontWeight: "700", color: t.textStrong, flex: 1, textAlign: "center" },
  weekRow: { flexDirection: "row", gap: SPACE.md, backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: SPACE.md, marginBottom: SPACE.sm },
  weekRowHoy: { borderColor: t.accent, backgroundColor: t.accentSoft },
  weekDate: { width: 44, alignItems: "center" },
  weekDow: { fontSize: 10, fontWeight: "700", color: t.textFaint, textTransform: "uppercase", letterSpacing: 1 },
  weekDay: { fontSize: 17, fontWeight: "800", color: t.textStrong, fontVariant: ["tabular-nums"] },
  weekHoyTxt: { color: BLUE[600] },
  weekItem: { fontSize: 12, color: t.text, lineHeight: 18 },
  sinMenu: { fontSize: 12, color: t.textFaint },
  hint: { fontSize: 11, color: t.textFaint, textAlign: "center", marginTop: 10 },
  calCard: { padding: 10, borderRadius: RADIUS.xl, borderColor: t.borderStrong, shadowOpacity: 0, elevation: 0 },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center", padding: 2 },
  calDow: { fontSize: 10, fontWeight: "700", color: t.textFaint },
  calDayBox: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm },
  calDayMenu: { backgroundColor: BLUE[100] },
  calDayHoy: { backgroundColor: t.accentSoft, borderWidth: 1.5, borderColor: t.accent },
  calDayTxt: { fontSize: 12, fontWeight: "600", color: t.text },
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
});
