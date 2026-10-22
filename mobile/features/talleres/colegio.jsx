// Talleres — panel del colegio en mobile (módulo "🎨 Talleres"): lista de
// talleres y gestión de inscriptos (aprobar, rechazar, pasar de la espera,
// quitar, sortear, cerrar/reabrir/cancelar, Excel, aviso a inscriptos). Crear
// y editar talleres queda en la web (spec: specs/talleres-extraprogramaticos.md).
import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush } from "../../lib/push";
import { exportRowsToExcel } from "../../lib/media";
import { Sheet } from "../../components/Sheet";
import { fmtNombre, sanitize } from "@shared/helpers";
import { THEMES, SLATE, SPACE, RADIUS, MIN_TOUCH } from "@shared/tokens";
import { MODOS, ESTADOS_TALLER, SELECT_TALLER, hoyAR, textoLugares, textoHorario, inscripcionAbierta } from "@shared/talleres";

const t = THEMES.light;
const GRUPOS = [["inscripto", "Inscriptos"], ["pendiente", "Pendientes"], ["espera", "Espera"], ["rechazado", "Rechazados"], ["baja", "Bajas"]];
// Estados en gris; solo "cancelado" se marca (mismo criterio que la web).
const COLOR_ESTADO = { borrador: ["#F8FAFC", "#64748B"], publicado: ["#F1F5F9", "#334155"], cerrado: ["#F1F5F9", "#64748B"], cancelado: ["#FEF2F2", "#B91C1C"] };

const avisar = (userIds, taller, mensaje) => {
  if (!userIds?.length) return Promise.resolve();
  return sendPush({ type: "taller", payload: { userIds, tallerId: taller.id, titulo: taller.nombre, mensaje } }).catch(() => {});
};
const confirmar = (titulo, detalle, texto, destructivo = true) => new Promise((res) => {
  Alert.alert(titulo, detalle || undefined, [
    { text: "Cancelar", style: "cancel", onPress: () => res(false) },
    { text: texto, style: destructivo ? "destructive" : "default", onPress: () => res(true) },
  ]);
});

function EstadoPill({ estado }) {
  const [bg, fg] = COLOR_ESTADO[estado] || COLOR_ESTADO.borrador;
  return <Text style={[s.pill, { backgroundColor: bg, color: fg }]}>{ESTADOS_TALLER[estado] || estado}</Text>;
}

function Detalle({ taller, cupos, onCambio }) {
  const [lista, setLista] = useState(null);
  const [grupo, setGrupo] = useState("inscripto");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("inscriptos_taller", { p_taller: taller.id });
    setLista(data || []);
  }, [taller.id]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  const accion = async (r, acc) => {
    if (acc === "rechazar" && !(await confirmar(`¿Rechazar a ${fmtNombre(r)}?`, "La familia recibe un aviso.", "Rechazar"))) return;
    if (acc === "quitar" && !(await confirmar(`¿Quitar a ${fmtNombre(r)}?`, r.estado === "inscripto" ? "Si hay lista de espera, entra el primero." : "", "Quitar"))) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("resolver_inscripcion_taller", { p_taller: taller.id, p_hijo: r.hijo_id, p_accion: acc, p_motivo: null });
    setOcupado(false);
    if (error) { Alert.alert("No se pudo", error.message); return; }
    const nombre = r.nombre?.split(" ")[0] || "Tu hijo/a";
    if (acc === "aprobar" || acc === "inscribir") avisar(data?.avisar, taller, `✓ ${nombre} quedó inscripto/a en ${taller.nombre}`);
    if (acc === "rechazar") avisar(data?.avisar, taller, `${nombre} no quedó inscripto/a en ${taller.nombre}`);
    if (acc === "quitar" && data?.avisar?.length) avisar(data.avisar, taller, `🎨 ¡Se liberó un lugar! Quedó inscripto/a en ${taller.nombre}`);
    cargar(); onCambio();
  };
  const sortear = async () => {
    if (!(await confirmar(`¿Sortear ${taller.nombre}?`, `Se sortean ${taller.cupo} lugares; el resto queda en lista de espera. Se hace una sola vez.`, "Sortear", false))) return;
    setOcupado(true);
    const { data, error } = await supabase.rpc("sortear_taller", { p_taller: taller.id });
    setOcupado(false);
    if (error) { Alert.alert("No se pudo sortear", error.message); return; }
    avisar(data.avisar_inscriptos, taller, `🎉 ¡Salió en el sorteo! Quedó inscripto/a en ${taller.nombre}`);
    avisar(data.avisar_espera, taller, `Sorteo de ${taller.nombre}: quedó en lista de espera. Si se libera un lugar te avisamos.`);
    Alert.alert("Sorteo hecho", `${data.inscriptos} inscriptos, ${data.espera} en espera`);
    cargar(); onCambio();
  };
  const cambiarEstado = async (estado) => {
    const tx = { cerrado: ["¿Cerrar la inscripción?", "Las familias ya no pueden anotarse."], publicado: ["¿Reabrir la inscripción?", ""], cancelado: [`¿Cancelar ${taller.nombre}?`, "Se avisa a las familias anotadas. No se puede deshacer."] }[estado];
    if (!(await confirmar(tx[0], tx[1], estado === "cancelado" ? "Cancelar taller" : "Confirmar", estado === "cancelado"))) return;
    const anotados = estado === "cancelado" ? (await supabase.rpc("usuarios_taller", { p_taller: taller.id, p_modo: "anotados" })).data : null;
    const { error } = await supabase.from("talleres").update({ estado }).eq("id", taller.id);
    if (error) { Alert.alert("No se pudo", error.message); return; }
    if (estado === "cancelado") avisar(anotados, taller, `El taller ${taller.nombre} se canceló.`);
    onCambio();
  };
  const enviarAviso = async () => {
    const texto = sanitize(msg).trim();
    if (!texto) return;
    const { data } = await supabase.rpc("usuarios_taller", { p_taller: taller.id, p_modo: "inscriptos" });
    if (!data?.length) { Alert.alert("No hay familias inscriptas"); return; }
    await avisar(data, taller, `🎨 ${taller.nombre}: ${texto}`);
    setMsg(""); Alert.alert("Enviado", `Aviso enviado a ${data.length} ${data.length === 1 ? "familia" : "familias"}`);
  };
  const exportar = () => exportRowsToExcel({
    rows: (lista || []).filter((r) => r.estado !== "baja").map((r) => ({ Alumno: fmtNombre(r), Curso: r.curso || "", Estado: Object.fromEntries(GRUPOS)[r.estado], "Puesto en espera": r.posicion_espera || "", Apoderados: r.apoderados || "" })),
    nombreHoja: "Inscriptos", fileName: taller.nombre.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "taller",
  });

  const cuenta = (e) => (lista || []).filter((r) => r.estado === e).length;
  const filas = (lista || []).filter((r) => r.estado === grupo);
  const lleno = taller.cupo != null && cuenta("inscripto") >= taller.cupo;
  const puedeSortear = taller.modo_asignacion === "sorteo" && !taller.sorteado_en && !inscripcionAbierta(taller, hoyAR()) && taller.estado !== "cancelado" && cuenta("pendiente") > 0;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
      <Text style={s.muted}>{[textoHorario(taller.taller_horarios), taller.lugar, textoLugares(taller, cupos), MODOS[taller.modo_asignacion]].filter(Boolean).join(" · ")}</Text>
      <View style={[s.wrap, { marginTop: SPACE.sm }]}>
        {taller.estado === "publicado" ? <Pressable onPress={() => cambiarEstado("cerrado")} style={s.btnSec}><Text style={s.btnSecTxt}>Cerrar inscripción</Text></Pressable> : null}
        {taller.estado === "cerrado" ? <Pressable onPress={() => cambiarEstado("publicado")} style={s.btnSec}><Text style={s.btnSecTxt}>Reabrir</Text></Pressable> : null}
        {puedeSortear ? <Pressable onPress={sortear} disabled={ocupado} style={s.btnPri}><Text style={s.btnPriTxt}>Sortear</Text></Pressable> : null}
        {lista?.length ? <Pressable onPress={exportar} style={s.btnSec}><Text style={s.btnSecTxt}>Exportar Excel</Text></Pressable> : null}
        {taller.estado !== "cancelado" && taller.estado !== "borrador" ? <Pressable onPress={() => cambiarEstado("cancelado")} style={s.btnSec}><Text style={[s.btnSecTxt, { color: t.danger }]}>Cancelar taller</Text></Pressable> : null}
      </View>
      <View style={[s.wrap, { marginTop: SPACE.md }]}>
        {GRUPOS.map(([e, l]) => (
          <Pressable key={e} onPress={() => setGrupo(e)} style={[s.chip, grupo === e && s.chipOn]}><Text style={[s.chipTxt, grupo === e && s.chipTxtOn]}>{l} · {cuenta(e)}</Text></Pressable>
        ))}
      </View>
      {lista === null ? <ActivityIndicator color={t.accent} style={{ marginTop: 12 }} /> : null}
      {lista && !filas.length ? <Text style={[s.muted, { marginTop: 10 }]}>Nadie en este grupo.</Text> : null}
      {filas.map((r) => (
        <View key={r.hijo_id} style={s.fila}>
          <Text style={s.filaNombre}>{r.posicion_espera ? `${r.posicion_espera}. ` : ""}{fmtNombre(r)} <Text style={s.muted}>· {r.curso}</Text></Text>
          {r.apoderados ? <Text style={[s.muted, { fontSize: 12 }]}>{r.apoderados}</Text> : null}
          <View style={[s.wrap, { marginTop: 6 }]}>
            {r.estado === "pendiente" && taller.modo_asignacion !== "sorteo" ? <>
              <Pressable onPress={() => accion(r, "aprobar")} disabled={ocupado || lleno} style={[s.btnPri, lleno && { opacity: 0.5 }]}><Text style={s.btnPriTxt}>Aprobar</Text></Pressable>
              <Pressable onPress={() => accion(r, "rechazar")} disabled={ocupado} style={s.btnSec}><Text style={s.btnSecTxt}>Rechazar</Text></Pressable>
            </> : null}
            {r.estado === "espera" ? <Pressable onPress={() => accion(r, "inscribir")} disabled={ocupado} style={s.btnSec}><Text style={s.btnSecTxt}>Pasar a inscripto{lleno ? " (pasa el cupo)" : ""}</Text></Pressable> : null}
            {r.estado === "inscripto" ? <Pressable onPress={() => accion(r, "quitar")} disabled={ocupado} style={s.btnSec}><Text style={[s.btnSecTxt, { color: t.danger }]}>Quitar</Text></Pressable> : null}
            {(r.estado === "baja" || r.estado === "rechazado") && taller.estado !== "cancelado" ? <Pressable onPress={() => accion(r, "inscribir")} disabled={ocupado} style={s.btnSec}><Text style={s.btnSecTxt}>Volver a inscribir</Text></Pressable> : null}
          </View>
        </View>
      ))}
      {taller.estado !== "borrador" && taller.estado !== "cancelado" ? (
        <View style={{ marginTop: SPACE.lg }}>
          <Text style={s.label}>AVISAR A LAS FAMILIAS INSCRIPTAS</Text>
          <TextInput value={msg} onChangeText={setMsg} placeholder="Ej: Hoy no hay robótica" placeholderTextColor={t.placeholder} style={s.input} />
          <Pressable onPress={enviarAviso} disabled={!msg.trim()} style={[s.btnPri, { marginTop: 8 }, !msg.trim() && { opacity: 0.5 }]}><Text style={s.btnPriTxt}>Enviar aviso</Text></Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

export function TalleresColegio({ colegioId, anoActual = null }) {
  const [talleres, setTalleres] = useState(null);
  const [cupos, setCupos] = useState({});
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    if (!colegioId) return;
    const { data } = await supabase.from("talleres").select(SELECT_TALLER).eq("colegio_id", colegioId).order("creado_en", { ascending: false });
    const lista = (data || []).filter((x) => !anoActual || x.año_lectivo == null || x.año_lectivo === anoActual);
    const c = lista.length ? await supabase.rpc("cupos_talleres", { p_ids: lista.map((x) => x.id) }) : { data: [] };
    setTalleres(lista); setCupos(Object.fromEntries((c.data || []).map((r) => [r.taller_id, r])));
  }, [colegioId, anoActual]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]);

  if (talleres === null) return <ActivityIndicator color={t.accent} style={{ marginTop: 20 }} />;
  const sel = talleres.find((x) => x.id === abierto);
  return (
    <View>
      <Text style={[s.muted, { marginBottom: SPACE.md }]}>Gestioná inscriptos, lista de espera y sorteos. Para crear o editar un taller entrá a tribbu.ar/app desde la computadora.</Text>
      {!talleres.length ? <Text style={s.muted}>Todavía no hay talleres.</Text> : null}
      {talleres.map((x) => {
        const cu = cupos[x.id] || {};
        return (
          <Pressable key={x.id} onPress={() => setAbierto(x.id)} style={s.card} accessibilityRole="button">
            <View style={s.row}><Text style={[s.titulo, { flex: 1 }]}>{x.nombre}</Text><EstadoPill estado={x.estado} /></View>
            <Text style={s.muted}>{textoHorario(x.taller_horarios) || "Sin horario"}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{cu.inscriptos || 0}{x.cupo ? `/${x.cupo}` : ""} inscriptos{cu.pendientes ? ` · ${cu.pendientes} pendientes` : ""}{cu.espera ? ` · ${cu.espera} en espera` : ""}</Text>
          </Pressable>
        );
      })}
      <Sheet visible={!!sel} onClose={() => setAbierto(null)} title={sel?.nombre || ""}>
        {sel ? <Detalle key={sel.id} taller={sel} cupos={cupos[sel.id]} onCambio={cargar} /> : null}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  label: { fontSize: 11, fontWeight: "800", color: t.textFaint, letterSpacing: 0.5, marginBottom: 6 },
  muted: { fontSize: 13, color: t.textMuted },
  titulo: { fontSize: 15, fontWeight: "800", color: t.textStrong },
  pill: { fontSize: 10.5, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, overflow: "hidden" },
  card: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: 14, padding: SPACE.md, marginBottom: 8, backgroundColor: t.surface },
  chip: { paddingHorizontal: 11, minHeight: 34, justifyContent: "center", borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipOn: { backgroundColor: t.textStrong, borderColor: t.textStrong },
  chipTxt: { fontSize: 12.5, fontWeight: "700", color: SLATE[600] },
  chipTxtOn: { color: "#fff" },
  fila: { borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 10, marginTop: 8 },
  filaNombre: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  btnPri: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 38, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  btnPriTxt: { color: "#fff", fontSize: 13.5, fontWeight: "800" },
  btnSec: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, minHeight: 38, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  btnSecTxt: { color: SLATE[700], fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: 12, minHeight: MIN_TOUCH, fontSize: 14, color: t.text, backgroundColor: t.surfaceSunken },
});
