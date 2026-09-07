// Admin (puerto RN de src/features/admin · AdminPanel). Solo visible cuando el
// item activo es Room Parent (rolEfectivo === "admin"). Tres pestañas:
// - General: monto/moneda de regalo del curso (tabla `cursos`) + una línea
//   calculada ("con N familias, la colecta junta $X").
// - Horarios: alta/edición/baja de clases (tabla `horarios`) con selector de
//   docente desde `maestros`.
// - Familias (nueva, Parte 3.b del handoff): quiénes son Room Parent del
//   curso y qué alumnos todavía no tienen ningún apoderado registrado con el
//   código — el dato que el Room Parent necesita para perseguir altas y hoy
//   no tiene en ningún lado.
// Arriba de todo, una alerta urgente (tarjeta roja + bottom sheet) para
// publicar un aviso al curso sin tener que ir al Muro — mismo mecanismo
// (tabla `alertas` + push) que ya usa `mobile/features/muro/index.jsx`.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { fmtNombre } from "@shared/helpers";
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
  const [familias, setFamilias] = useState([]);
  const [roomParents, setRoomParents] = useState([]);
  const [alertaSheet, setAlertaSheet] = useState(false);
  const [alertaMsg, setAlertaMsg] = useState("");
  const [alertaEnviando, setAlertaEnviando] = useState(false);
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
    const [c, hor, mae, hijosData, ucData] = await Promise.all([
      supabase.from("cursos").select("*").eq("id", cursoId).single(),
      supabase.from("horarios").select("*").eq("curso_id", cursoId).order("dia").order("hora_inicio"),
      supabase.from("maestros").select("id,nombre,materia").eq("activo", true),
      supabase.from("hijos").select("id,nombre,apellido").eq("curso_id", cursoId).order("apellido"),
      supabase.from("usuario_cursos").select("usuario_id, usuarios(nombre,apellido,email,telefono)").eq("curso_id", cursoId).eq("rol", "admin"),
    ]);
    setForm({ monto_regalo: c.data?.monto_regalo ? String(c.data.monto_regalo) : "", moneda_regalo: c.data?.moneda_regalo || "$" });
    setHorarios(hor.data || []);
    setMaestros(mae.data || []);
    setRoomParents((ucData.data || []).map((r) => r.usuarios).filter(Boolean));

    const hijosCurso = hijosData.data || [];
    const hijoIds = hijosCurso.map((h) => h.id);
    const uh = hijoIds.length
      ? await supabase.from("usuario_hijos").select("hijo_id, usuarios(nombre,apellido,email,telefono)").in("hijo_id", hijoIds)
      : { data: [] };
    const apodPorHijo = new Map();
    for (const r of uh.data || []) {
      if (!r.usuarios) continue;
      const arr = apodPorHijo.get(r.hijo_id) || [];
      arr.push(r.usuarios);
      apodPorHijo.set(r.hijo_id, arr);
    }
    setFamilias(hijosCurso.map((h) => ({ ...h, apoderados: apodPorHijo.get(h.id) || [] })));
    cargarRegalos();
  }, [cursoId, cargarRegalos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const familiasSinRegistrar = familias.filter((f) => f.apoderados.length === 0);

  const enviarAlerta = async () => {
    if (!alertaMsg.trim() || !cursoId) return;
    setAlertaEnviando(true);
    await supabase.from("alertas").update({ activa: false }).eq("curso_id", cursoId);
    await supabase.from("alertas").insert({ curso_id: cursoId, mensaje: alertaMsg.trim(), hora: "Ahora", activa: true });
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type: "alerta", payload: { mensaje: alertaMsg.trim(), userIds } });
    setAlertaEnviando(false);
    setAlertaSheet(false);
    setAlertaMsg("");
  };

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

      <Pressable onPress={() => setAlertaSheet(true)} style={styles.alertaBanner}>
        <Text style={styles.alertaBannerIcon}>🚨</Text>
        <Text style={styles.alertaBannerTxt}>Publicar alerta urgente al curso</Text>
      </Pressable>

      <View style={styles.tabs}>
        {[
          { id: "general", l: "General" },
          { id: "horarios", l: "Horarios" },
          { id: "familias", l: "Familias" },
          { id: "regalos", l: "🎁 Regalos" },
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
          {form.monto_regalo && familias.length > 0 ? (
            <Text style={styles.calculada}>
              Con {familias.length} familia{familias.length !== 1 ? "s" : ""}, la colecta junta{" "}
              {form.moneda_regalo} {(Number(form.monto_regalo) * familias.length).toLocaleString("es-AR")}
            </Text>
          ) : null}
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

      {tab === "familias" ? (
        <View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Room Parents del curso</Text>
            {roomParents.length === 0 ? (
              <Text style={styles.muted}>Sin Room Parents asignados</Text>
            ) : (
              roomParents.map((r, i) => (
                <Text key={i} style={styles.rpRow}>{fmtNombre(r)} · {r.email}</Text>
              ))
            )}
          </View>

          <Text style={[styles.cardTitle, styles.familiasTitulo]}>
            Familias sin registrar{familiasSinRegistrar.length ? ` · ${familiasSinRegistrar.length}` : ""}
          </Text>
          <Text style={styles.familiasSub}>
            Alumnos del curso a los que todavía ningún apoderado se vinculó con el código de invitación.
          </Text>
          {familiasSinRegistrar.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.muted}>Todas las familias ya se registraron ✨</Text>
            </View>
          ) : (
            familiasSinRegistrar.map((f) => (
              <View key={f.id} style={styles.familiaRow}>
                <Text style={styles.familiaNombre}>{fmtNombre(f)}</Text>
                <Text style={styles.familiaPend}>Sin registrar</Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {tab === "regalos" ? (
        <View>
          <Text style={styles.regalosIntro}>
            Asigná qué familia le regala a cada compañero — ordenado por el próximo cumpleaños. Tocá una fila para elegir.
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
      ) : null}

      <Modal visible={alertaSheet} transparent animationType="fade" onRequestClose={() => setAlertaSheet(false)}>
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Publicar alerta</Text>
              <Text style={styles.alertaSub}>Se envía como push a toda la comunidad del curso. Usalo solo para avisos urgentes — suena aunque el teléfono esté en silencio.</Text>
              <TextInput
                value={alertaMsg}
                onChangeText={setAlertaMsg}
                placeholder="Ej: Mañana no hay clases"
                placeholderTextColor="#94A3B8"
                multiline
                style={[styles.input, styles.alertaInput]}
              />
              <View style={styles.modalBtns}>
                <Pressable onPress={() => setAlertaSheet(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={enviarAlerta} disabled={alertaEnviando || !alertaMsg.trim()} style={styles.saveBtn}>
                  <Text style={styles.saveTxt}>{alertaEnviando ? "Enviando..." : "Enviar"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {horForm !== null ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setHorForm(null)}>
          <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.modalCard}>
              <ScrollView keyboardShouldPersistTaps="handled">
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
          </KeyboardAvoidingView>
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

  // alerta urgente arriba de todo (Parte 3.b del handoff)
  alertaBanner: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderRadius: 14, backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FCA5A5", paddingHorizontal: 16, marginBottom: 16 },
  alertaBannerIcon: { fontSize: 20 },
  alertaBannerTxt: { fontSize: 13.5, fontWeight: "700", color: "#DC2626" },
  alertaSub: { fontSize: 12, color: "#94A3B8", lineHeight: 17, marginBottom: 14 },
  alertaInput: { minHeight: 80, textAlignVertical: "top" },

  card: { backgroundColor: "white", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#E2E8F0" },
  cardTitle: { fontSize: 14, fontWeight: "800", color: T.text, marginBottom: 12 },
  calculada: { fontSize: 12.5, color: T.accent, fontWeight: "600", marginTop: 10, lineHeight: 18 },
  rpRow: { fontSize: 13, color: T.text, marginBottom: 6 },
  familiasTitulo: { marginTop: 18 },
  familiasSub: { fontSize: 12, color: "#94A3B8", lineHeight: 17, marginBottom: 12 },
  familiaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "white", borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", paddingVertical: 10, paddingHorizontal: 14, marginBottom: 6 },
  familiaNombre: { fontSize: 13, fontWeight: "600", color: T.text },
  familiaPend: { fontSize: 11, fontWeight: "700", color: "#B45309", backgroundColor: "#FFFBEB", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
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
