// Pagos al colegio (specs/pagos-colegio.md), app. La familia avisa "Ya pagué" y
// el colegio confirma cuando recibe el dinero. Aparte de las colectas entre
// familias (features/finanzas).
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, RefreshControl } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, TYPE, SPACE, RADIUS } from "@shared/tokens";
import { fmtF, sanitize, uuidLite } from "@shared/helpers";
import { ESTADO_PAGO, celularesAvisados, cuentasActivasDeAlumno, textoAvisoPago, textoDestinatariosPago, textoResumenPago, errorFormularioPago, filasAlumnosDePago, montoDeFormulario, montoPago, resumenPago } from "@shared/pagosColegio";
import { supabase } from "../../lib/supabase";
import { sendPush } from "../../lib/push";
import { useRecarga } from "../../lib/useRecarga";
import { usePagosPendientesCtx } from "../../lib/usePagosPendientes";
import { useSession } from "../../context/Session";
import { Sheet } from "../../components/Sheet";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";

const t = THEMES.light;

function Estado({ estado }) {
  const e = ESTADO_PAGO[estado] || ESTADO_PAGO.pendiente;
  return <View style={[styles.estado, { backgroundColor: e.bg }]}><Text style={[styles.estadoTxt, { color: e.c }]}>{e.l}</Text></View>;
}

function Boton({ texto, onPress, secundario, disabled, chico }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.btn, secundario && styles.btnSec, chico && styles.btnChico, disabled && styles.btnOff]}>
      <Text style={[styles.btnTxt, secundario && styles.btnSecTxt]}>{texto}</Text>
    </Pressable>
  );
}

const idsDe = (data) => (data || []).map((x) => x?.familias_pendientes_pago_colegio ?? x);

// ── Familias ─────────────────────────────────────────────────────────────────
export function PagosFamilia() {
  const { cursoIds, items, misHijos, tagDeCurso } = useSession();
  // Globito de Curso (app/(tabs)/_layout): baja apenas se avisa "Ya pagué".
  const recargarGlobito = usePagosPendientesCtx().recargar;
  const [filas, setFilas] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const nombreDe = useMemo(() => new Map((items || []).filter((i) => i._tipo === "hijo").map((i) => [i.id, i.nombre?.split(" ")[0]])), [items]);

  const cargar = useCallback(async () => {
    if (!misHijos?.length) { setFilas([]); return; }
    const { data } = await supabase.from("pago_colegio_alumnos").select("pago_id,hijo_id,estado,pagos_colegio(*)").in("hijo_id", misHijos);
    setFilas(data || []);
  }, [misHijos]);
  useEffect(() => { cargar(); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const pagos = useMemo(() => {
    const m = new Map();
    for (const f of filas || []) {
      const p = f.pagos_colegio;
      if (!p || !(cursoIds || []).includes(p.curso_id)) continue;
      if (!m.has(p.id)) m.set(p.id, { ...p, filas: [] });
      m.get(p.id).filas.push(f);
    }
    return [...m.values()].sort((a, b) => (a.fecha_limite || "9999").localeCompare(b.fecha_limite || "9999"));
  }, [filas, cursoIds]);

  const avisar = async (f, pague) => {
    setGuardando(`${f.pago_id}-${f.hijo_id}`);
    const { error } = await supabase.rpc("avisar_pago_colegio", { p_pago: f.pago_id, p_hijo: f.hijo_id, p_pague: pague });
    setGuardando(null);
    if (error) { Alert.alert("No se pudo guardar", error.message); return; }
    cargar();
    recargarGlobito();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}>
      <Text style={styles.h1}>Pagos al colegio</Text>
      <Text style={styles.sub}>Excursiones, visitas y otros pagos que pide el colegio. tribbu no maneja el dinero.</Text>
      {filas === null ? <ActivityIndicator color={t.accent} /> : null}
      {filas !== null && !pagos.length ? <EmptyState icon="cash-multiple" title="No hay pagos del colegio" note="Cuando el colegio pida uno, aparece acá." /> : null}
      {pagos.map((p) => {
        const tag = tagDeCurso?.(p.curso_id);
        return (
          <View key={p.id} style={styles.card}>
            {tag ? <Text style={[styles.tag, { color: tag.color || t.textMuted }]}>{tag.nombre}</Text> : null}
            <View style={styles.filaTitulo}>
              <Text style={styles.titulo}>{p.titulo}</Text>
              <Text style={styles.monto}>{montoPago(p)}</Text>
            </View>
            {p.fecha_limite ? <Text style={styles.meta}>Pagar hasta el {fmtF(p.fecha_limite)}</Text> : null}
            {p.descripcion ? <Text style={styles.texto}>{p.descripcion}</Text> : null}
            {p.datos_pago ? <View style={styles.datos}><Text selectable style={styles.datosTxt}>{p.datos_pago}</Text></View> : null}
            {p.filas.map((f) => {
              const clave = `${f.pago_id}-${f.hijo_id}`;
              return (
                <View key={clave} style={styles.filaAlumno}>
                  <Text style={styles.alumno} numberOfLines={1}>{nombreDe.get(f.hijo_id) || "Tu hijo"}</Text>
                  <Estado estado={f.estado} />
                  {f.estado === "pendiente" ? <Boton texto="Ya pagué" chico disabled={guardando === clave} onPress={() => avisar(f, true)} /> : null}
                  {f.estado === "informado" ? <Boton texto="Deshacer" chico secundario disabled={guardando === clave} onPress={() => avisar(f, false)} /> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Panel del colegio ────────────────────────────────────────────────────────
function NuevoPago({ visible, cursos, userId, onClose, onCreado }) {
  const [form, setForm] = useState({ titulo: "", monto: "", fecha_limite: "", datos_pago: "", descripcion: "" });
  const [cursosSel, setCursosSel] = useState([]);
  const [excluidos, setExcluidos] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (!cursosSel.length) { setAlumnos([]); return undefined; }
    supabase.from("hijos").select("id,nombre,apellido,curso_id").in("curso_id", cursosSel).order("nombre").then(({ data }) => { if (vivo) setAlumnos(data || []); });
    return () => { vivo = false; };
  }, [cursosSel]);

  const toggle = (lista, set, id) => set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const crear = async () => {
    const err = errorFormularioPago(form, cursosSel);
    if (err) { setError(err); return; }
    if (form.fecha_limite && !/^\d{4}-\d{2}-\d{2}$/.test(form.fecha_limite)) { setError("La fecha va como AAAA-MM-DD."); return; }
    setGuardando(true);
    setError("");
    const grupo = uuidLite();
    const creados = [];
    try {
      for (const cursoId of cursosSel) {
        const id = uuidLite();
        const { error: e1 } = await supabase.from("pagos_colegio").insert({
          id, grupo_id: grupo, curso_id: cursoId, titulo: sanitize(form.titulo).trim(), monto: montoDeFormulario(form.monto),
          fecha_limite: form.fecha_limite || null, datos_pago: sanitize(form.datos_pago).trim() || null, descripcion: sanitize(form.descripcion).trim() || null, creado_por: userId || null,
        });
        if (e1) throw e1;
        const filas = filasAlumnosDePago(id, alumnos.filter((a) => a.curso_id === cursoId), excluidos);
        if (filas.length) {
          const { error: e2 } = await supabase.from("pago_colegio_alumnos").insert(filas);
          if (e2) throw e2;
        }
        creados.push(id);
      }
      const destinos = await Promise.all(creados.map((id) => supabase.rpc("familias_pendientes_pago_colegio", { p_pago: id })));
      const userIds = [...new Set(destinos.flatMap((r) => idsDe(r.data)))];
      const res = destinos.some((r) => r.error) ? null
        : userIds.length ? await sendPush({ type: "pago_colegio", payload: { titulo: form.titulo.trim(), userIds } })
        : { ok: true, sent: 0 };
      setForm({ titulo: "", monto: "", fecha_limite: "", datos_pago: "", descripcion: "" });
      setCursosSel([]);
      setExcluidos([]);
      setGuardando(false);
      onCreado(textoAvisoPago(res, "Pago creado"));
    } catch (e) {
      setError(e?.message || "No se pudo crear el pago.");
      setGuardando(false);
    }
  };

  const campo = (k, label, props = {}) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} placeholderTextColor={t.textMuted} style={[styles.input, props.multiline && styles.inputMulti]} {...props} />
    </>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Nuevo pago">
      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        {campo("titulo", "Título", { placeholder: "Excursión al Planetario" })}
        {campo("monto", "Monto", { placeholder: "15000", keyboardType: "numeric" })}
        {campo("fecha_limite", "Fecha límite (opcional)", { placeholder: "AAAA-MM-DD", autoCapitalize: "none" })}
        {campo("datos_pago", "Datos para pagar (opcional)", { placeholder: "Alias, CBU o dónde pagar", multiline: true })}
        {campo("descripcion", "Descripción (opcional)", { multiline: true })}
        <Text style={styles.label}>Cursos</Text>
        <View style={styles.chips}>
          {cursos.map((c) => {
            const on = cursosSel.includes(c.id);
            return (
              <Pressable key={c.id} onPress={() => toggle(cursosSel, setCursosSel, c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.nombre}</Text>
              </Pressable>
            );
          })}
        </View>
        {alumnos.length ? (
          <>
            <Text style={styles.label}>Alumnos que tienen que pagar</Text>
            {alumnos.map((a) => {
              const on = !excluidos.includes(a.id);
              return (
                <Pressable key={a.id} onPress={() => toggle(excluidos, setExcluidos, a.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.check}>
                  <MaterialCommunityIcons name={on ? "checkbox-marked-outline" : "checkbox-blank-outline"} size={22} color={on ? t.accent : t.textMuted} />
                  <Text style={styles.checkTxt}>{[a.nombre, a.apellido].filter(Boolean).join(" ")}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.acciones}><Boton texto={guardando ? "Creando…" : "Crear y avisar"} disabled={guardando} onPress={crear} /></View>
      </ScrollView>
    </Sheet>
  );
}

function DetallePago({ pago, curso, userId, onVolver, onCambio }) {
  const [filas, setFilas] = useState(null);
  const [fuera, setFuera] = useState([]);
  const [ultimo, setUltimo] = useState(pago.ultimo_recordatorio);

  const cargar = useCallback(async () => {
    const [{ data: f }, { data: todos }] = await Promise.all([
      supabase.from("pago_colegio_alumnos").select("pago_id,hijo_id,estado,hijos(nombre,apellido)").eq("pago_id", pago.id),
      supabase.from("hijos").select("id,nombre,apellido").eq("curso_id", pago.curso_id).order("nombre"),
    ]);
    const lista = (f || []).sort((a, b) => (a.hijos?.nombre || "").localeCompare(b.hijos?.nombre || ""));
    setFilas(lista);
    const dentro = new Set(lista.map((x) => x.hijo_id));
    setFuera((todos || []).filter((h) => !dentro.has(h.id)));
  }, [pago.id, pago.curso_id]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombre = (h) => [h?.nombre, h?.apellido].filter(Boolean).join(" ");
  const cambiar = async (f, estado) => {
    const { error } = await supabase.from("pago_colegio_alumnos").update(estado === "pagado"
      ? { estado, confirmado_por: userId || null, confirmado_en: new Date().toISOString() }
      : { estado, confirmado_por: null, confirmado_en: null }).eq("pago_id", f.pago_id).eq("hijo_id", f.hijo_id);
    if (error) { Alert.alert("No se pudo guardar", error.message); return; }
    cargar(); onCambio();
  };
  const quitar = (f) => Alert.alert("¿Sacar a este alumno del pago?", nombre(f.hijos), [
    { text: "Cancelar", style: "cancel" },
    { text: "Sacar", style: "destructive", onPress: async () => {
      const { error } = await supabase.from("pago_colegio_alumnos").delete().eq("pago_id", f.pago_id).eq("hijo_id", f.hijo_id);
      if (error) { Alert.alert("No se pudo sacar", error.message); return; }
      cargar(); onCambio();
    } },
  ]);
  const sumar = async (h) => {
    const { error } = await supabase.from("pago_colegio_alumnos").insert({ pago_id: pago.id, hijo_id: h.id });
    if (error) { Alert.alert("No se pudo sumar", error.message); return; }
    cargar(); onCambio();
    if (!pago.activo) return;
    const { data, error: e2 } = await supabase.from("usuario_hijos").select("usuario_id,usuarios(activo)").eq("hijo_id", h.id);
    const userIds = cuentasActivasDeAlumno(data);
    const res = e2 ? null
      : userIds.length ? await sendPush({ type: "pago_colegio", payload: { titulo: pago.titulo, userIds } })
      : { ok: true, sent: 0 };
    if (!celularesAvisados(res)) Alert.alert("Aviso", textoAvisoPago(res, "Alumno sumado").texto);
  };
  const recordar = async () => {
    const { data, error } = await supabase.rpc("familias_pendientes_pago_colegio", { p_pago: pago.id });
    if (error) { Alert.alert("No se pudo enviar", error.message); return; }
    const userIds = idsDe(data);
    if (!userIds.length) { Alert.alert("No hay familias pendientes con cuenta"); return; }
    Alert.alert("¿Enviar recordatorio?", textoDestinatariosPago(r.pendiente, userIds.length), [
      { text: "Cancelar", style: "cancel" },
      { text: "Enviar", onPress: async () => {
        const res = await sendPush({ type: "pago_colegio", payload: { titulo: pago.titulo, recordatorio: true, userIds } });
        const celulares = celularesAvisados(res);
        if (celulares === null) { Alert.alert("No se pudo enviar", "Probá de nuevo."); return; }
        if (!celulares) { Alert.alert("Sin celulares para avisar", "Ninguna familia pendiente tiene un celular con notificaciones activadas."); return; }
        const ahora = new Date().toISOString();
        await supabase.from("pagos_colegio").update({ ultimo_recordatorio: ahora }).eq("id", pago.id);
        setUltimo(ahora);
        onCambio();
      } },
    ]);
  };
  const cerrar = () => Alert.alert(pago.activo ? "¿Cerrar este pago?" : "¿Volver a abrir este pago?", pago.activo ? "Las familias dejan de verlo." : "Las familias lo vuelven a ver.", [
    { text: "Cancelar", style: "cancel" },
    { text: pago.activo ? "Cerrar" : "Abrir", onPress: async () => {
      const { error } = await supabase.from("pagos_colegio").update({ activo: !pago.activo }).eq("id", pago.id);
      if (error) { Alert.alert("No se pudo guardar", error.message); return; }
      onCambio(); onVolver();
    } },
  ]);

  const r = resumenPago(filas);
  return (
    <View>
      <Pressable onPress={onVolver} hitSlop={8} accessibilityRole="button" style={styles.volver}><Text style={styles.volverTxt}>‹ Pagos</Text></Pressable>
      <Text style={styles.titulo}>{pago.titulo}</Text>
      <Text style={styles.meta}>{[curso?.nombre, montoPago(pago), pago.fecha_limite ? `Hasta el ${fmtF(pago.fecha_limite)}` : null].filter(Boolean).join(" · ")}</Text>
      <Text style={styles.texto}>{textoResumenPago(r)}</Text>
      <View style={styles.acciones}>
        {pago.activo ? <Boton texto="Enviar recordatorio" disabled={!r.pendiente} onPress={recordar} /> : null}
        <Boton texto={pago.activo ? "Cerrar pago" : "Volver a abrir"} secundario onPress={cerrar} />
      </View>
      {ultimo ? <Text style={styles.meta}>Último recordatorio: {new Date(ultimo).toLocaleDateString("es-AR")}</Text> : null}
      <View style={[styles.card, styles.cardLista]}>
        {filas === null ? <ActivityIndicator color={t.accent} /> : null}
        {(filas || []).map((f) => (
          <View key={f.hijo_id} style={styles.filaAlumno}>
            <Text style={styles.alumno} numberOfLines={2}>{nombre(f.hijos)}</Text>
            <Estado estado={f.estado} />
            {f.estado === "pagado"
              ? <Boton texto="Deshacer" chico secundario onPress={() => cambiar(f, "pendiente")} />
              : <Boton texto="Confirmar" chico onPress={() => cambiar(f, "pagado")} />}
            {f.estado !== "pagado" ? (
              <Pressable onPress={() => quitar(f)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Sacar a ${nombre(f.hijos)} del pago`} style={styles.quitar}>
                <MaterialCommunityIcons name="close" size={17} color={t.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {fuera.length ? (
        <>
          <Text style={styles.label}>Alumnos del curso fuera de este pago</Text>
          <View style={styles.chips}>
            {fuera.map((h) => <Pressable key={h.id} onPress={() => sumar(h)} accessibilityRole="button" style={styles.chip}><Text style={styles.chipTxt}>+ {nombre(h)}</Text></Pressable>)}
          </View>
        </>
      ) : null}
    </View>
  );
}

export function PagosColegio({ cursos = [], userId, abrirNuevo = null, onCambio }) {
  const [pagos, setPagos] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const cursoIds = useMemo(() => cursos.map((c) => c.id), [cursos]);
  const cursoDe = useMemo(() => new Map(cursos.map((c) => [c.id, c])), [cursos]);

  const cargar = useCallback(async () => {
    if (!cursoIds.length) { setPagos([]); return; }
    const { data } = await supabase.from("pagos_colegio").select("*, pago_colegio_alumnos(estado)").in("curso_id", cursoIds).order("creado_en", { ascending: false });
    setPagos(data || []);
  }, [cursoIds]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (abrirNuevo) setNuevo(true); }, [abrirNuevo]);

  if (detalle) return <DetallePago key={detalle.id} pago={detalle} curso={cursoDe.get(detalle.curso_id)} userId={userId} onVolver={() => setDetalle(null)} onCambio={() => { cargar(); onCambio?.(); }} />;

  return (
    <View>
      <View style={styles.filaNuevo}><BotonNuevo accessibilityLabel="Nuevo pago" onPress={() => setNuevo(true)} /></View>
      {pagos === null ? <ActivityIndicator color={t.accent} /> : null}
      {pagos?.length === 0 ? <EmptyState icon="cash-multiple" title="Todavía no hay pagos" note="Creá uno para una excursión o una visita." /> : null}
      {(pagos || []).map((p) => {
        const r = resumenPago(p.pago_colegio_alumnos);
        return (
          <Pressable key={p.id} onPress={() => setDetalle(p)} accessibilityRole="button" style={[styles.card, !p.activo && styles.cardCerrada]}>
            <View style={styles.filaTitulo}>
              <Text style={styles.titulo}>{p.titulo}</Text>
              <Text style={styles.monto}>{montoPago(p)}</Text>
            </View>
            <Text style={styles.meta}>{[cursoDe.get(p.curso_id)?.nombre, p.fecha_limite ? `Hasta el ${fmtF(p.fecha_limite)}` : null, p.activo ? null : "Cerrado"].filter(Boolean).join(" · ")}</Text>
            <Text style={styles.texto}>{r.pagado} de {r.total} confirmados{r.informado ? ` · ${r.informado} por confirmar` : ""}</Text>
          </Pressable>
        );
      })}
      <NuevoPago visible={nuevo} cursos={cursos} userId={userId} onClose={() => setNuevo(false)} onCreado={(aviso) => { setNuevo(false); cargar(); setTimeout(() => Alert.alert("Pago creado", aviso.texto), 350); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: 120 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: t.textMuted, marginTop: SPACE.xs, marginBottom: SPACE.lg },
  card: { backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.border, padding: SPACE.lg, marginBottom: SPACE.md },
  cardLista: { paddingVertical: SPACE.xs, marginTop: SPACE.md },
  cardCerrada: { opacity: 0.65 },
  tag: { fontSize: 12, fontWeight: "700", marginBottom: SPACE.xs },
  filaTitulo: { flexDirection: "row", justifyContent: "space-between", gap: SPACE.md },
  titulo: { flexShrink: 1, fontSize: 16, fontWeight: "800", color: t.textStrong },
  monto: { fontSize: 16, fontWeight: "800", color: t.textStrong },
  meta: { fontSize: 13, color: t.textMuted, marginTop: 3 },
  texto: { fontSize: 13.5, color: t.text, marginTop: SPACE.sm },
  datos: { backgroundColor: t.bg, borderRadius: RADIUS.md, padding: SPACE.md, marginTop: SPACE.sm },
  datosTxt: { fontSize: 13, color: t.textStrong },
  filaAlumno: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm, paddingVertical: SPACE.sm, borderTopWidth: 1, borderTopColor: t.border, marginTop: SPACE.xs },
  alumno: { flex: 1, minWidth: 90, fontSize: 14, fontWeight: "700", color: t.textStrong },
  estado: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.full },
  estadoTxt: { fontSize: 12, fontWeight: "700" },
  btn: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 44, paddingHorizontal: SPACE.lg, alignItems: "center", justifyContent: "center" },
  btnChico: { minHeight: 38, paddingHorizontal: SPACE.md },
  btnSec: { backgroundColor: t.surfaceRaised, borderWidth: 1, borderColor: t.border },
  btnOff: { opacity: 0.5 },
  btnTxt: { fontSize: 13.5, fontWeight: "700", color: "#fff" },
  btnSecTxt: { color: t.text },
  quitar: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  acciones: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginTop: SPACE.md, marginBottom: SPACE.xs },
  volver: { marginBottom: SPACE.sm, minHeight: 32, justifyContent: "center" },
  volverTxt: { fontSize: 14, fontWeight: "700", color: t.accent },
  filaNuevo: { alignItems: "flex-end", marginBottom: SPACE.md },
  form: { flexShrink: 1 },
  label: { ...TYPE.label, color: t.textMuted, marginTop: SPACE.md, marginBottom: SPACE.xs },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, minHeight: 46, fontSize: 15, color: t.textStrong, backgroundColor: t.surfaceRaised },
  inputMulti: { minHeight: 70, textAlignVertical: "top", paddingTop: SPACE.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { minHeight: 36, justifyContent: "center", paddingHorizontal: SPACE.md, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceRaised },
  chipOn: { borderColor: t.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 13, fontWeight: "700", color: t.text },
  chipTxtOn: { color: t.accent },
  check: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: 40 },
  checkTxt: { flex: 1, fontSize: 14, color: t.textStrong },
  error: { fontSize: 13, color: t.danger, marginTop: SPACE.sm },
});
