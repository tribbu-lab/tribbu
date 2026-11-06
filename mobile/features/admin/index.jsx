// Admin (puerto RN de src/features/admin · AdminPanel). Solo visible cuando el
// item activo es Room Parent (rolEfectivo === "room"). El Room Parent define el
// monto sugerido por cumple (tabla `cursos`), quién le regala a quién (`cumples`)
// y nombra a otros Room Parents entre los apoderados del curso.
// Horarios, familias, adopción y alertas son del colegio.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { fmtNombre } from "@shared/helpers";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { Buscador } from "../../components/Buscador";
import { candidatosRoomParent, filtrarCandidatos } from "@shared/apoderados";

// Quiénes son Room Parent del curso y nombrar a otro entre sus apoderados.
function RoomParentsCurso({ cursoId }) {
  const [roomParents, setRoomParents] = useState([]);
  const [hijosCurso, setHijosCurso] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [nombrandoId, setNombrandoId] = useState(null);

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const [rp, hi] = await Promise.all([
      supabase.from("usuario_cursos").select("usuario_id, usuarios(id,nombre,apellido)").eq("curso_id", cursoId).eq("rol", "room"),
      supabase.from("hijos").select("nombre, usuario_hijos(usuarios(id,nombre,apellido,rol,activo))").eq("curso_id", cursoId),
    ]);
    setRoomParents((rp.data || []).map((r) => r.usuarios).filter(Boolean));
    setHijosCurso(hi.data || []);
  }, [cursoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const candidatos = filtrarCandidatos(candidatosRoomParent(hijosCurso, roomParents.map((r) => r.id)), busqueda);

  const guardar = async (c) => {
    setError("");
    setNombrandoId(c.id);
    const { error: e } = await supabase.from("usuario_cursos").insert({ usuario_id: c.id, curso_id: cursoId, rol: "room" });
    setNombrandoId(null);
    if (e) {
      setError("No se pudo nombrar. Probá de nuevo.");
      return;
    }
    setAbierto(false);
    setBusqueda("");
    cargar();
  };

  const nombrar = (c) => {
    Alert.alert(`¿Nombrar a ${fmtNombre(c)} Room Parent?`, `${fmtNombre(c)} va a poder hacer lo mismo que vos en este curso. Para sacarlo, hay que pedírselo al colegio.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Nombrar", onPress: () => guardar(c) },
    ]);
  };

  return (
    <View style={[styles.card, styles.rpCard]}>
      <Text style={styles.cardTitle}>Room Parents del curso</Text>
      {roomParents.map((r) => (
        <Text key={r.id} style={styles.rpRow}>{fmtNombre(r)}</Text>
      ))}
      {error ? <Text style={styles.rpError}>{error}</Text> : null}
      {!abierto ? (
        <Pressable onPress={() => setAbierto(true)} style={styles.rpAbrir}>
          <Text style={styles.rpAbrirTxt}>Nombrar a otro</Text>
        </Pressable>
      ) : (
        <View style={styles.rpLista}>
          <Buscador value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o por hijo…" />
          {candidatos.length === 0 ? <Text style={styles.muted}>No hay apoderados para mostrar.</Text> : null}
          {candidatos.map((c) => (
            <View key={c.id} style={styles.rpFila}>
              <View style={styles.flex1}>
                <Text style={styles.rpNombre}>{fmtNombre(c)}</Text>
                <Text style={styles.regaloFecha}>Familia de {c.hijos.join(" y ")}</Text>
              </View>
              <Pressable onPress={() => nombrar(c)} disabled={nombrandoId === c.id} style={styles.rpNombrar}>
                <Text style={styles.rpNombrarTxt}>{nombrandoId === c.id ? "Nombrando…" : "Nombrar"}</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => { setAbierto(false); setBusqueda(""); }} style={styles.rpCancelar}>
            <Text style={styles.rpCancelarTxt}>Cancelar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}


export function AdminPanel() {
  const { cursoId, cursoNombre } = useSession();
  const [form, setForm] = useState({ monto_regalo: "", moneda_regalo: "$" });
  const [saving, setSaving] = useState(false);
  const [alumnosRegalo, setAlumnosRegalo] = useState([]);
  const [cumpleMap, setCumpleMap] = useState({});
  const [expandidoId, setExpandidoId] = useState(null);
  const [guardandoRegaloId, setGuardandoRegaloId] = useState(null);

  const nextBday = (fecha) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const d = new Date(fecha + "T00:00:00");
    let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
    if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
    return Math.round((next - hoy) / (1000 * 60 * 60 * 24));
  };

  const cargarRegalos = useCallback(async () => {
    if (!cursoId) return;
    const { data: al } = await supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id", cursoId).order("nombre");
    const conCumple = (al || []).filter((a) => a.fecha_nacimiento).sort((a, b) => nextBday(a.fecha_nacimiento) - nextBday(b.fecha_nacimiento));
    setAlumnosRegalo(conCumple);

    const { data: cu } = await supabase.from("cumples").select("*").eq("curso_id", cursoId).not("alumno_id", "is", null);
    const responsableUids = [...new Set((cu || []).map((c) => c.responsable_id).filter(Boolean))];
    let uidToHijo = {};
    if (responsableUids.length && conCumple.length) {
      const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("usuario_id", responsableUids).in("hijo_id", conCumple.map((a) => a.id));
      const hijoById = {}; conCumple.forEach((a) => { hijoById[a.id] = a; });
      (uh || []).forEach((r) => { if (hijoById[r.hijo_id]) uidToHijo[r.usuario_id] = hijoById[r.hijo_id]; });
    }
    const map = {};
    (cu || []).forEach((c) => { if (c.alumno_id) map[c.alumno_id] = { ...c, _responsable_hijo: uidToHijo[c.responsable_id] || null }; });
    setCumpleMap(map);
  }, [cursoId]);

  const asignarRegalo = async (alumnoId, responsableHijoId) => {
    setGuardandoRegaloId(alumnoId);
    let resolvedUserId = null;
    if (responsableHijoId) {
      const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id").eq("hijo_id", responsableHijoId).limit(1);
      resolvedUserId = uh?.[0]?.usuario_id || null;
    }
    const existente = cumpleMap[alumnoId];
    if (existente?.id) await supabase.from("cumples").update({ responsable_id: resolvedUserId }).eq("id", existente.id);
    else if (resolvedUserId) await supabase.from("cumples").insert({ curso_id: cursoId, alumno_id: alumnoId, responsable_id: resolvedUserId });
    await cargarRegalos();
    setGuardandoRegaloId(null);
    setExpandidoId(null);
  };

  const toggleComprado = async (alumnoId) => {
    const existente = cumpleMap[alumnoId];
    if (!existente?.id) return;
    await supabase.from("cumples").update({ comprado: !existente.comprado }).eq("id", existente.id);
    cargarRegalos();
  };

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const [c] = await Promise.all([
      supabase.from("cursos").select("monto_regalo,moneda_regalo").eq("id", cursoId).single(),
      cargarRegalos(),
    ]);
    setForm({ monto_regalo: c.data?.monto_regalo ? String(c.data.monto_regalo) : "", moneda_regalo: c.data?.moneda_regalo || "$" });
  }, [cursoId, cargarRegalos]);

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

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Regalos y Room Parents</Text>
      <Text style={styles.subtitle}>{cursoNombre}</Text>

      <View style={styles.card}>
        <Text style={[styles.cardTitle, styles.montoTitulo]}>Monto sugerido por cumple</Text>
        <Text style={styles.regalosIntro}>Lo que se sugiere gastar en cada regalo. Las familias lo ven en Cumpleaños.</Text>
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
        <Text style={styles.label}>MONTO</Text>
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

      <RoomParentsCurso key={cursoId} cursoId={cursoId} />

      <View>
        <Text style={[styles.cardTitle, styles.regalosTitulo]}>Quién le regala a quién</Text>
        <Text style={styles.regalosIntro}>
          Elegí qué familia le regala a cada compañero, ordenado por el próximo cumpleaños. Tocá una fila para elegir.
        </Text>
        {alumnosRegalo.length === 0 ? (
          <Text style={styles.muted}>Ningún alumno del curso tiene fecha de nacimiento cargada.</Text>
        ) : (
          alumnosRegalo.map((a) => {
            const cumple = cumpleMap[a.id];
            const dias = nextBday(a.fecha_nacimiento);
            const bl = dias === 0 ? { l: "Hoy", c: "#EF4444" } : dias === 1 ? { l: "Mañana", c: "#F59E0B" } : dias <= 7 ? { l: `${dias}d`, c: "#F59E0B" } : { l: `${dias}d`, c: "#94A3B8" };
            const abierto = expandidoId === a.id;
            const guardando = guardandoRegaloId === a.id;
            return (
              <View key={a.id} style={styles.regaloCard}>
                <Pressable onPress={() => setExpandidoId(abierto ? null : a.id)} style={styles.regaloHeader}>
                  <View style={[styles.avatarChico, { backgroundColor: (a.color || "#3B82F6") + "1F" }]}>
                    <Text style={[styles.avatarChicoTxt, { color: a.color || "#3B82F6" }]}>{a.nombre?.slice(0, 1)}{a.apellido?.slice(0, 1)}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.regaloNombre}>{fmtNombre(a)}</Text>
                    <Text style={styles.regaloFecha}>
                      {new Date(a.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
                      <Text style={{ color: bl.c, fontWeight: "700" }}> · {bl.l}</Text>
                    </Text>
                  </View>
                  <Text style={styles.regaloAsignado} numberOfLines={1}>
                    {cumple?._responsable_hijo ? fmtNombre(cumple._responsable_hijo) : "Sin asignar"}
                  </Text>
                  <Text style={styles.regaloChevron}>{abierto ? "▲" : "▼"}</Text>
                </Pressable>
                {abierto ? (
                  <View style={styles.regaloOpciones}>
                    <Pressable onPress={() => asignarRegalo(a.id, null)} disabled={guardando} style={styles.regaloOpcion}>
                      <Text style={styles.regaloOpcionTxt}>— Sin asignar —</Text>
                    </Pressable>
                    {alumnosRegalo.filter((x) => x.id !== a.id).map((x) => {
                      const sel = cumple?._responsable_hijo?.id === x.id;
                      return (
                        <Pressable key={x.id} onPress={() => asignarRegalo(a.id, x.id)} disabled={guardando} style={[styles.regaloOpcion, sel && styles.regaloOpcionOn]}>
                          <Text style={[styles.regaloOpcionTxt, sel && styles.regaloOpcionTxtOn]}>{fmtNombre(x)}</Text>
                          {sel ? <Text style={styles.regaloOpcionCheck}>✓</Text> : null}
                        </Pressable>
                      );
                    })}
                    <Pressable onPress={() => toggleComprado(a.id)} disabled={!cumple?.id} style={styles.compradoRow}>
                      <View style={[styles.compradoBox, cumple?.comprado && styles.compradoBoxOn]}>
                        {cumple?.comprado ? <Text style={styles.compradoCheck}>✓</Text> : null}
                      </View>
                      <Text style={[styles.compradoTxt, !cumple?.id && styles.compradoTxtDisabled]}>Regalo comprado</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 112 /* barra flotante */ },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: T.text },
  subtitle: { fontSize: 13, color: "#94A3B8", marginBottom: 16 },
  muted: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 24 },


  card: { backgroundColor: "white", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#E2E8F0" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: T.text, marginBottom: 12 },
  montoTitulo: { marginBottom: 4 },
  rpCard: { marginTop: 16 },
  rpRow: { fontSize: 13, color: T.text, marginBottom: 6 },
  rpError: { fontSize: 12.5, color: "#DC2626", marginTop: 8 },
  rpAbrir: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", paddingHorizontal: 14, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0" },
  rpAbrirTxt: { fontSize: 13, fontWeight: "700", color: T.accent },
  rpLista: { marginTop: 12 },
  rpFila: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" },
  rpNombre: { fontSize: 13.5, fontWeight: "600", color: T.text },
  rpNombrar: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#EFF6FF" },
  rpNombrarTxt: { fontSize: 12, fontWeight: "700", color: T.accent },
  rpCancelar: { alignSelf: "flex-start", minHeight: 40, justifyContent: "center", marginTop: 4 },
  rpCancelarTxt: { fontSize: 12.5, fontWeight: "600", color: "#64748B" },
  regalosTitulo: { marginTop: 20, marginBottom: 4 },
  regalosIntro: { fontSize: 12.5, color: "#94A3B8", lineHeight: 18, marginBottom: 14 },
  regaloCard: { backgroundColor: "white", borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 8, overflow: "hidden" },
  regaloHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, minHeight: 44 },
  avatarChico: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  avatarChicoTxt: { fontSize: 11.5, fontWeight: "800" },
  regaloNombre: { fontSize: 13.5, fontWeight: "700", color: T.text },
  regaloFecha: { fontSize: 11, color: "#94A3B8", marginTop: 1 },
  regaloAsignado: { fontSize: 11.5, color: "#64748B", fontWeight: "600", maxWidth: 90, textAlign: "right" },
  regaloChevron: { fontSize: 10, color: "#CBD5E1", marginLeft: 2 },
  regaloOpciones: { borderTopWidth: 1, borderTopColor: "#F1F5F9", maxHeight: 260 },
  regaloOpcion: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" },
  regaloOpcionOn: { backgroundColor: "#EFF6FF" },
  regaloOpcionTxt: { fontSize: 13, color: T.text },
  regaloOpcionTxtOn: { color: T.accent, fontWeight: "700" },
  regaloOpcionCheck: { fontSize: 12, color: T.accent, fontWeight: "800" },
  compradoRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, paddingHorizontal: 14, backgroundColor: "#FAFAFA" },
  compradoBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  compradoBoxOn: { backgroundColor: T.green, borderColor: T.green },
  compradoCheck: { fontSize: 12, color: "white", fontWeight: "900" },
  compradoTxt: { fontSize: 12.5, fontWeight: "600", color: T.text },
  compradoTxtDisabled: { color: "#CBD5E1" },
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

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "white" },
  chipOn: { borderColor: T.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  chipTxtOn: { color: T.accent, fontWeight: "700" },
  colorDot: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  colorDotOn: { borderColor: T.primary },
});
