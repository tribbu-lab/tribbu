// Cambios en la salida (puerto RN de src/features/salidas; reglas en
// @shared/cambiosSalida, permisos en supabase/cambios-salida.sql). La familia
// avisa que su hijo se retira distinto a lo habitual; le llega a la
// Secretaría del nivel, que lo marca como visto. La docente del curso los ve
// en solo lectura. CambiosSalidaColegio es la sección del panel del colegio.
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView, Alert, RefreshControl, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { useRecarga } from "../../lib/useRecarga";
import { recontarPanel } from "../../lib/useNoLeidosPanel";
import { sanitize, fmtLocalDate, fmtNombre } from "@shared/helpers";
import {
  MOTIVOS, opcionesRetiro, formVacio, validarCambioSalida, filaCambioSalida, textoMotivo, textoRetira,
  estadoCambio, sePuedeCancelar, separarCambios, pendientesDeVer, fechaCambio, cargarCambiosSalida,
  normalizarHora,
} from "@shared/cambiosSalida";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BotonNuevo } from "../../components/BotonNuevo";
import { Sheet } from "../../components/Sheet";
import { DateField } from "../../components/DateField";
import { EmptyState } from "../../components/EmptyState";
import { BotonFiltros, FiltrosSheet, filtrosActivos } from "../../components/Filtros";

const t = THEMES.light;
const fmtCuando = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const TONO = { pendiente: "#B45309", visto: "#047857", cancelado: SLATE[400], pasado: SLATE[400] };

function Chip({ on, onPress, label }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function Tarjeta({ c, hoy, tag, colegio = false, onVisto, onCancelar }) {
  const est = estadoCambio(c, hoy);
  const cancelado = est.id === "cancelado";
  return (
    <Card style={[styles.card, cancelado && styles.cardCancelada]}>
      <View style={styles.cardHead}>
        <View style={styles.flex1}>
          <Text style={[styles.cuando, cancelado && styles.tachado]}>{fechaCambio(c.fecha, hoy)} · {(c.hora || "").slice(0, 5)}</Text>
          <View style={styles.metaRow}>
            {tag ? <View style={[styles.tagDot, { backgroundColor: tag.color }]} /> : null}
            <Text style={styles.alumno}>{fmtNombre(c.hijos) || "Alumno"}</Text>
            {colegio && c.cursos?.nombre ? <Text style={styles.curso}>· {c.cursos.nombre}</Text> : null}
          </View>
        </View>
        <Text style={[styles.estado, { color: TONO[est.id] }]}>{colegio && est.id === "pendiente" ? "Sin ver" : est.label}</Text>
      </View>
      <View style={styles.datoFila}><Text style={styles.datoLabel}>Motivo</Text><Text style={styles.datoValor}>{textoMotivo(c)}</Text></View>
      <View style={styles.datoFila}><Text style={styles.datoLabel}>Se retira con</Text><Text style={styles.datoValor}>{textoRetira(c)}</Text></View>
      {c.comentario ? <View style={styles.datoFila}><Text style={styles.datoLabel}>Comentario</Text><Text style={[styles.datoValor, styles.comentario]}>{c.comentario}</Text></View> : null}
      <Text style={styles.pie}>
        {[
          `Avisado ${c.creador ? `por ${fmtNombre(c.creador)} ` : ""}el ${fmtCuando(c.creado_en)}`,
          c.visto_en ? `Visto${c.visto ? ` por ${fmtNombre(c.visto)}` : ""} el ${fmtCuando(c.visto_en)}` : null,
          c.cancelado_en ? `Cancelado el ${fmtCuando(c.cancelado_en)}` : null,
        ].filter(Boolean).join(" · ")}
      </Text>
      {onVisto || onCancelar ? (
        <View style={styles.acciones}>
          {onVisto ? <Button title="Marcar como visto" size="sm" onPress={() => onVisto(c)} /> : null}
          {onCancelar ? (
            <Pressable onPress={() => onCancelar(c)} hitSlop={8} style={styles.cancelarBtn}>
              <Text style={styles.cancelarTxt}>Cancelar aviso</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function NuevoSheet({ hijos, hijoInicial, userId, onClose, onEnviado }) {
  const hoy = fmtLocalDate();
  const [form, setForm] = useState(() => ({ ...formVacio(), hijoId: hijoInicial || (hijos.length === 1 ? hijos[0].id : null), fecha: hoy }));
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const hijo = hijos.find((h) => h.id === form.hijoId);
  const retiros = opcionesRetiro(hijo?.cursos?.nivel);

  const enviar = async () => {
    const err = validarCambioSalida(form, hoy);
    if (err) { Alert.alert("Falta un dato", err); return; }
    setGuardando(true);
    const fila = filaCambioSalida(form, { cursoId: hijo.curso_id, userId, sanitize });
    const { error } = await supabase.from("cambios_salida").insert(fila);
    setGuardando(false);
    if (error) { Alert.alert("No se pudo enviar", "Revisá los datos y probá de nuevo."); return; }
    onEnviado(hijo.nombre);
  };

  return (
    <Sheet visible onClose={onClose} title="Avisar un cambio en la salida">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <Text style={styles.hint}>Le llega a la Secretaría del nivel. Cuando lo vean, te aparece acá como “Visto por el colegio”.</Text>
        {hijos.length > 1 ? (
          <>
            <Text style={styles.label}>¿Quién se retira?</Text>
            <View style={styles.chips}>
              {hijos.map((h) => (
                <Chip key={h.id} label={h.nombre?.split(" ")[0]} on={form.hijoId === h.id}
                  onPress={() => setForm((p) => ({ ...p, hijoId: h.id, retira: p.retira === "solo" && h.cursos?.nivel !== "secundaria" ? null : p.retira }))} />
              ))}
            </View>
          </>
        ) : null}
        <View style={styles.fila2}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Día</Text>
            <DateField value={form.fecha} onChange={(v) => set("fecha", v)} style={styles.input} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.label}>Horario de salida</Text>
            <TextInput value={form.hora} onChangeText={(v) => set("hora", v)} onBlur={() => set("hora", normalizarHora(form.hora) || form.hora)}
              placeholder="14:30" placeholderTextColor={t.placeholder} keyboardType="numbers-and-punctuation" maxLength={5} style={styles.input} accessibilityLabel="Horario de salida" />
          </View>
        </View>
        <Text style={styles.label}>Motivo</Text>
        <View style={styles.chips}>
          {MOTIVOS.map((m) => <Chip key={m.id} label={m.label} on={form.motivo === m.id} onPress={() => set("motivo", m.id)} />)}
        </View>
        {form.motivo === "otro" ? (
          <TextInput value={form.motivoDetalle} onChangeText={(v) => set("motivoDetalle", v)} placeholder="Contanos el motivo" placeholderTextColor={t.placeholder} maxLength={120} style={[styles.input, styles.mtSm]} />
        ) : null}
        <Text style={styles.label}>¿Con quién se retira?</Text>
        <View style={styles.chips}>
          {retiros.map((r) => <Chip key={r.id} label={r.label} on={form.retira === r.id} onPress={() => set("retira", r.id)} />)}
        </View>
        {form.retira === "otro_adulto" ? (
          <>
            <TextInput value={form.retiraNombre} onChangeText={(v) => set("retiraNombre", v)} placeholder="Nombre y apellido" placeholderTextColor={t.placeholder} maxLength={80} style={[styles.input, styles.mtSm]} />
            <TextInput value={form.retiraDni} onChangeText={(v) => set("retiraDni", v)} placeholder="DNI" placeholderTextColor={t.placeholder} keyboardType="number-pad" maxLength={15} style={[styles.input, styles.mtSm]} />
          </>
        ) : null}
        {form.retira === "transporte" ? (
          <TextInput value={form.retiraNombre} onChangeText={(v) => set("retiraNombre", v)} placeholder="¿Cuál? (opcional)" placeholderTextColor={t.placeholder} maxLength={80} style={[styles.input, styles.mtSm]} />
        ) : null}
        <Text style={styles.label}>Comentario (opcional)</Text>
        <TextInput value={form.comentario} onChangeText={(v) => set("comentario", v)} placeholder="Algo más que el colegio tenga que saber" placeholderTextColor={t.placeholder} multiline maxLength={500} style={[styles.input, styles.textarea]} />
        <Button title={guardando ? "Enviando…" : "Enviar aviso"} onPress={enviar} disabled={guardando} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

/** Pantalla de las familias (y de la docente, en solo lectura). */
export function CambiosSalida() {
  const { cursoIds, items, usuario, tagDeCurso, esDocente, hijoActivoId } = useSession();
  const userId = usuario?.id ?? null;
  const [lista, setLista] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const hoy = fmtLocalDate();
  const misHijos = useMemo(() => (items || []).filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)), [items, cursoIds]);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    try {
      const filas = await cargarCambiosSalida(supabase, { cursoIds, docente: esDocente, desde: esDocente ? fmtLocalDate(new Date(Date.now() - 30 * 86400000)) : null });
      const ids = new Set(misHijos.map((h) => h.id));
      setLista(esDocente ? filas : filas.filter((c) => ids.has(c.hijo_id)));
    } catch {
      setLista((p) => p || []);
    }
  }, [cursoIds, misHijos, esDocente]);
  useEffect(() => { cargar(); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const cancelar = (c) =>
    Alert.alert("Cancelar el aviso", `El colegio va a ver que ${c.hijos?.nombre || "tu hijo"} se retira como siempre.`, [
      { text: "Volver", style: "cancel" },
      { text: "Cancelar aviso", style: "destructive", onPress: async () => {
        const { data } = await supabase.rpc("cancelar_cambio_salida", { p_id: c.id });
        setAviso(data ? "Aviso cancelado." : "Ya no se puede cancelar.");
        cargar();
      } },
    ]);

  const { proximos, historial } = separarCambios(lista || [], hoy);
  const filas = lista?.length
    ? [{ _titulo: "Hoy y próximos" }, ...(proximos.length ? proximos : [{ _vacio: true }]), ...(historial.length ? [{ _titulo: "Historial" }, ...historial] : [])]
    : [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={filas}
        keyExtractor={(c, i) => c.id || `${c._titulo || "vacio"}-${i}`}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={!!refrescando} onRefresh={onRefresh} />}
        renderItem={({ item: c }) =>
          c._titulo ? <Text style={styles.tituloLista}>{c._titulo}</Text>
          : c._vacio ? <Text style={styles.nada}>No hay cambios para hoy ni para los próximos días.</Text>
          : <Tarjeta c={c} hoy={hoy} tag={tagDeCurso(c.curso_id)} colegio={esDocente} onCancelar={!esDocente && sePuedeCancelar(c, hoy) ? cancelar : null} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.flex1}>
                <Text style={styles.h1}>Cambios en la salida</Text>
                <Text style={styles.sub}>{esDocente ? "Los avisos de las familias de tus cursos." : "Avisale al colegio si tu hijo se retira distinto a lo habitual."}</Text>
              </View>
              {!esDocente && misHijos.length ? <BotonNuevo onPress={() => setNuevo(true)} accessibilityLabel="Avisar un cambio en la salida" /> : null}
            </View>
            {aviso ? <View style={styles.aviso}><Text style={styles.avisoTxt}>{aviso}</Text></View> : null}
          </View>
        }
        ListEmptyComponent={
          !lista ? <Text style={styles.cargando}>Cargando…</Text>
          : esDocente ? <EmptyState icon="clock-outline" title="No hay cambios en la salida" note="Cuando una familia de tus cursos avise que un alumno se retira distinto, aparece acá." />
          : <EmptyState icon="clock-outline" title="Todavía no avisaste ningún cambio" note="Si un día tu hijo se va más temprano o lo retira otra persona, avisale a la Secretaría desde acá." actionLabel="Avisar un cambio" onAction={() => setNuevo(true)} />
        }
      />
      {nuevo ? (
        <NuevoSheet hijos={misHijos} hijoInicial={misHijos.some((h) => h.id === hijoActivoId) ? hijoActivoId : null} userId={userId}
          onClose={() => setNuevo(false)} onEnviado={(n) => { setNuevo(false); setAviso(`Listo: le avisamos a la Secretaría el cambio de ${n}.`); cargar(); }} />
      ) : null}
    </View>
  );
}

/** Sección del panel del colegio (administrador, Secretaría, super). */
export function CambiosSalidaColegio({ cursos = [] }) {
  const [lista, setLista] = useState(null);
  const [filtros, setFiltros] = useState(false);
  const [curso, setCurso] = useState("todos");
  const [vista, setVista] = useState("proximos");
  const [buscar, setBuscar] = useState("");
  const hoy = fmtLocalDate();
  const clave = cursos.map((c) => c.id).join(",");

  const cargar = useCallback(async () => {
    const ids = clave ? clave.split(",") : [];
    if (!ids.length) { setLista([]); return; }
    try { setLista(await cargarCambiosSalida(supabase, { cursoIds: ids, limite: 500 })); } catch { setLista((p) => p || []); }
  }, [clave]);
  useEffect(() => { cargar(); }, [cargar]);

  const marcarVisto = async (c) => {
    await supabase.rpc("marcar_cambio_salida_visto", { p_id: c.id });
    cargar();
    recontarPanel();
  };

  const grupos = [
    { key: "vista", label: "Mostrar", value: vista, onChange: setVista, options: [{ value: "proximos", label: "Hoy y próximos" }, { value: "historial", label: "Historial" }, { value: "todos", label: "Todos" }] },
    ...(cursos.length > 1 ? [{ key: "curso", label: "Curso", value: curso, onChange: setCurso, options: [{ value: "todos", label: "Todos los cursos" }, ...cursos.map((c) => ({ value: c.id, label: c.nombre }))] }] : []),
  ];
  const q = buscar.trim().toLowerCase();
  const filtrada = (lista || []).filter((c) => (curso === "todos" || c.curso_id === curso) && (!q || fmtNombre(c.hijos).toLowerCase().includes(q)));
  const { proximos, historial } = separarCambios(filtrada, hoy);
  const visibles = vista === "proximos" ? proximos : vista === "historial" ? historial : [...proximos, ...historial];
  const sinVer = pendientesDeVer(lista || [], hoy);

  // El panel ya scrollea: lista simple, sin FlatList anidada.
  return (
    <View>
      <View style={styles.toolbar}>
        <TextInput value={buscar} onChangeText={setBuscar} placeholder="Buscar alumno" placeholderTextColor={t.placeholder} style={[styles.input, styles.flex1]} accessibilityLabel="Buscar alumno" />
        <BotonFiltros activos={filtrosActivos(grupos)} onPress={() => setFiltros(true)} />
      </View>
      {sinVer > 0 ? <Text style={styles.sinVer}>{sinVer === 1 ? "1 cambio sin ver" : `${sinVer} cambios sin ver`}</Text> : null}
      {!lista ? <Text style={styles.cargando}>Cargando…</Text> : !visibles.length ? (
        <EmptyState icon="clock-outline" title={vista === "historial" ? "No hay cambios anteriores" : "No hay cambios en la salida"} note="Cuando una familia avise que su hijo se retira distinto a lo habitual, aparece acá con un globito en Mensajes." />
      ) : visibles.map((c) => (
        <Tarjeta key={c.id} c={c} hoy={hoy} colegio onVisto={!c.visto_en && !c.cancelado_en ? marcarVisto : null} />
      ))}
      <FiltrosSheet visible={filtros} onClose={() => setFiltros(false)} grupos={grupos} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  cargando: { textAlign: "center", color: t.textFaint, padding: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm, marginBottom: SPACE.md },
  h1: { ...TYPE.h1, color: t.text },
  sub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  flex1: { flex: 1, minWidth: 0 },
  aviso: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.md, backgroundColor: "#F0FDF4", marginBottom: SPACE.sm },
  avisoTxt: { fontSize: 13, fontWeight: "600", color: "#047857" },
  tituloLista: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: t.textFaint, textTransform: "uppercase", marginTop: SPACE.lg, marginBottom: SPACE.sm },
  nada: { fontSize: 13, color: t.textFaint },
  card: { marginBottom: SPACE.md },
  cardCancelada: { opacity: 0.7 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm },
  cuando: { fontSize: 15, fontWeight: "800", color: t.textStrong },
  tachado: { textDecorationLine: "line-through" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  alumno: { fontSize: 13, fontWeight: "700", color: SLATE[700] },
  curso: { fontSize: 13, color: t.textFaint },
  estado: { fontSize: 12, fontWeight: "700", maxWidth: 130, textAlign: "right" },
  datoFila: { flexDirection: "row", gap: SPACE.md, marginTop: 6 },
  datoLabel: { width: 96, fontSize: 13, color: t.textMuted },
  datoValor: { flex: 1, fontSize: 13, fontWeight: "600", color: t.textStrong },
  comentario: { fontWeight: "400", color: SLATE[700] },
  pie: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
  acciones: { flexDirection: "row", alignItems: "center", gap: SPACE.lg, marginTop: SPACE.sm },
  cancelarBtn: { minHeight: 36, justifyContent: "center" },
  cancelarTxt: { fontSize: 13, fontWeight: "700", color: t.danger },
  sheetScroll: { flexShrink: 1 },
  hint: { fontSize: 12.5, color: t.textMuted, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 6, marginTop: SPACE.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, minHeight: 38, justifyContent: "center", borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  chipOn: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  chipTxt: { fontSize: 13.5, fontWeight: "600", color: SLATE[700] },
  chipTxtOn: { color: "white" },
  fila2: { flexDirection: "row", gap: SPACE.sm },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: RADIUS.md, padding: 10, fontSize: 14, color: t.text, backgroundColor: "#F8FAFC", minHeight: 44 },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  mtSm: { marginTop: SPACE.sm },
  mtMd: { marginTop: SPACE.md },
  toolbar: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md },
  sinVer: { fontSize: 13, fontWeight: "700", color: "#B45309", marginBottom: SPACE.sm },
});
