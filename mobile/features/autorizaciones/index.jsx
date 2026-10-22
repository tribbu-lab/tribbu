// Autorizaciones (puerto RN de src/features/autorizaciones — ver
// specs/autorizaciones.md). Cada familia responde por hijo: Autorizo / No
// autorizo, quién lo retira y un comentario; el Room Parent crea para su curso
// y ve / exporta las respuestas. AutorizacionesColegio es la sección del Super
// Admin (varios cursos a la vez, mismo grupo_id). La fecha límite también la
// hace cumplir la RLS.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView, Alert, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { exportRowsToExcel } from "../../lib/media";
import { sanitize, fmtLocalDate, fmtNombre, uuidLite } from "@shared/helpers";
import { estaAbierta, estadoPorAlumno, resumenRespuestas, hijosSinResponder, estadoConvocatoria, limiteCercano, textoConfirmacion, textoRespuesta, fechaAut } from "@shared/autorizaciones";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, TYPE, SPACE, RADIUS } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { BotonNuevo } from "../../components/BotonNuevo";
import { Sheet } from "../../components/Sheet";
import { DateField } from "../../components/DateField";
import { EmptyState } from "../../components/EmptyState";
import { CursoListSelector } from "../../components/CursoListSelector";

const t = THEMES.light;
const fmtFecha = (s) => new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "long" });
const fmtCuando = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function Autorizaciones({ openAutorizacion = null, nonce = null }) {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, isAdmin, items } = useSession();
  const userId = usuario?.id ?? null;
  const [datos, setDatos] = useState(null);
  const [respondiendo, setRespondiendo] = useState(null); // { a, hijo, respuesta }
  const [detalle, setDetalle] = useState(null); // autorización con respuestas abiertas
  const [nueva, setNueva] = useState(false);
  const [confirmaciones, setConfirmaciones] = useState({}); // autorizacion_id → "Respuesta enviada: …"
  const [resaltar, setResaltar] = useState(null);
  const listaRef = useRef(null);
  const hoyStr = fmtLocalDate();

  const misHijos = useMemo(() => (items || []).filter((i) => i._tipo === "hijo"), [items]);
  const cursosAdmin = useMemo(() => misHijos.filter((i) => i.rolEfectivo === "room").map((i) => i.curso_id), [misHijos]);
  const { cursosDocente = [] } = useSession();
  // Room Parent gestiona todo lo del curso; la docente crea en sus cursos pero
  // gestiona solo lo suyo (RLS: creador o colegio).
  const cursosRoom = useMemo(() => (esVistaTodos ? [...new Set(cursosAdmin)] : isAdmin && cursoId ? [cursoId] : []), [esVistaTodos, cursosAdmin, isAdmin, cursoId]);
  const cursosQueGestiona = useMemo(
    () => [...new Set([...cursosRoom, ...(esVistaTodos ? cursosDocente : cursoId && cursosDocente.includes(cursoId) ? [cursoId] : [])])],
    [cursosRoom, esVistaTodos, cursosDocente, cursoId]
  );

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const { data: auts } = await supabase.from("autorizaciones").select("*").in("curso_id", cursoIds).order("creado_en", { ascending: false });
    const ids = (auts || []).map((a) => a.id);
    const [resp, alumnos] = await Promise.all([
      ids.length ? supabase.from("autorizacion_respuestas").select("*, usuarios(nombre,apellido)").in("autorizacion_id", ids) : Promise.resolve({ data: [] }),
      supabase.from("hijos").select("id,nombre,apellido,curso_id").in("curso_id", cursoIds),
    ]);
    setDatos({ autorizaciones: auts || [], respuestas: resp.data || [], alumnos: alumnos.data || [] });
  }, [cursoIds]);
  // Expo Router deja la pantalla montada: recargar al volver a ella (como
  // Recordatorios) y con pull-to-refresh, si no lo nuevo no aparece nunca.
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = async () => {
    setRefrescando(true);
    try { await cargar(); } finally { setRefrescando(false); }
  };

  const gestiona = (a) => a.creado_por === userId || cursosRoom.includes(a.curso_id);

  // Desde Hoy ("Responder autorización"): ir a esa tarjeta, resaltarla y abrir
  // directo el formulario del primer hijo que falta responder.
  const listo = !!datos;
  useEffect(() => {
    if (!openAutorizacion || !listo) return undefined;
    const auts = datos.autorizaciones;
    const ordenadas = [...auts.filter((x) => estaAbierta(x, hoyStr)), ...auts.filter((x) => !estaAbierta(x, hoyStr))];
    const idx = ordenadas.findIndex((x) => String(x.id) === String(openAutorizacion));
    if (idx < 0) return undefined;
    const aut = ordenadas[idx];
    const t1 = setTimeout(() => {
      try { listaRef.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true }); } catch { /* sin medir todavía */ }
      setResaltar(aut.id);
      const falta = estaAbierta(aut, hoyStr) ? hijosSinResponder(aut, misHijos, datos.respuestas)[0] : null;
      if (falta) setRespondiendo({ a: aut, hijo: falta, respuesta: null });
    }, 250);
    const t2 = setTimeout(() => setResaltar(null), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [openAutorizacion, nonce, listo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos) return <View style={styles.screen}><Text style={styles.cargando}>Cargando…</Text></View>;
  const lista = [
    ...datos.autorizaciones.filter((a) => estaAbierta(a, hoyStr)),
    ...datos.autorizaciones.filter((a) => !estaAbierta(a, hoyStr)),
  ];

  const renderItem = ({ item: a }) => {
    const abierta = estaAbierta(a, hoyStr);
    const tag = tagDeCurso(a.curso_id);
    const respDe = datos.respuestas.filter((r) => r.autorizacion_id === a.id);
    const misDelCurso = misHijos.filter((h) => h.curso_id === a.curso_id);
    const urgente = limiteCercano(a, hoyStr);
    const confirmacion = confirmaciones[a.id];
    return (
      <Card style={[styles.card, resaltar === a.id && styles.cardResaltada]}>
        {/* Convocatoria: de quién es y hasta cuándo está abierta. */}
        <View style={styles.cardHead}>
          <View style={styles.metaRow}>
            {tag ? (
              <View style={styles.tag}>
                <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                <Text style={styles.tagTxt}>{tag.nombre}</Text>
              </View>
            ) : null}
            {a.grupo_id ? <Text style={styles.colegio}>Del colegio</Text> : null}
          </View>
          <Text style={styles.convocatoria}>{estadoConvocatoria(a, hoyStr)}</Text>
        </View>
        <Text style={styles.titulo}>{a.titulo}</Text>
        {/* Fecha de la salida y fecha límite, bien diferenciadas. */}
        {a.fecha_evento ? (
          <View style={styles.fechaFila}>
            <Text style={styles.fechaLabel}>Salida</Text>
            <Text style={styles.fechaValor}>{fechaAut(a.fecha_evento)}</Text>
          </View>
        ) : null}
        {a.fecha_limite ? (
          <View style={styles.fechaFila}>
            <Text style={styles.fechaLabel}>Responder hasta</Text>
            <Text style={[styles.fechaValor, urgente && styles.fechaUrgente]}>{fechaAut(a.fecha_limite)}</Text>
          </View>
        ) : null}
        {a.descripcion ? <Text style={styles.descripcion}>{a.descripcion}</Text> : null}

        {confirmacion ? (
          <View style={styles.confirmacion}>
            <MaterialCommunityIcons name="check" size={16} color="#047857" />
            <Text style={styles.confirmacionTxt}>{confirmacion}</Text>
          </View>
        ) : null}

        {/* Tu respuesta: una por hijo. */}
        {misDelCurso.length ? <Text style={styles.tuRespuesta}>{misDelCurso.length > 1 ? "Tus respuestas" : "Tu respuesta"}</Text> : null}
        {misDelCurso.map((h) => {
          const r = respDe.find((x) => x.hijo_id === h.id) || null;
          return (
            <View key={h.id} style={styles.hijoRow}>
              {r ? (
                <MaterialCommunityIcons name={r.autoriza ? "check" : "close"} size={18} color={r.autoriza ? "#047857" : "#B91C1C"} />
              ) : null}
              <View style={styles.flex1}>
                <Text style={styles.hijoNombre}>
                  {h.nombre}:{" "}
                  <Text style={r ? (r.autoriza ? styles.si : styles.no) : styles.falta}>
                    {r ? textoRespuesta(r) : abierta ? "falta tu respuesta" : "sin responder"}
                  </Text>
                </Text>
                {r ? (
                  <Text style={styles.hijoMeta}>
                    {[r.retira ? `Retira: ${r.retira}` : null, r.comentario ? `“${r.comentario}”` : null, `Respondido el ${fmtCuando(r.respondido_en)}`].filter(Boolean).join(" · ")}
                  </Text>
                ) : !abierta ? <Text style={styles.hijoMeta}>La fecha límite ya pasó</Text> : null}
              </View>
              {abierta ? (
                <Pressable onPress={() => setRespondiendo({ a, hijo: h, respuesta: r })} style={r ? styles.btnSec : styles.btnPri} hitSlop={6}>
                  <Text style={r ? styles.btnSecTxt : styles.btnPriTxt}>{r ? "Cambiar" : "Responder"}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

        {gestiona(a) ? (
          <Pressable onPress={() => setDetalle(a)} style={styles.resumenBtn} hitSlop={4}>
            <Text style={styles.resumenTxt}>
              {(() => {
                const s = resumenRespuestas(datos.alumnos.filter((x) => x.curso_id === a.curso_id), respDe);
                return `${s.autorizados} autorizados · ${s.noAutorizados} no · ${s.sinResponder} sin responder — ver respuestas`;
              })()}
            </Text>
          </Pressable>
        ) : null}
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listaRef}
        onScrollToIndexFailed={() => {}}
        data={lista}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.flex1}>
              <Text style={styles.h1}>Autorizaciones</Text>
              <Text style={styles.sub}>Salidas y actividades que necesitan tu permiso</Text>
            </View>
            {cursosQueGestiona.length ? <BotonNuevo onPress={() => setNueva(true)} accessibilityLabel="Nueva autorización" /> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState icon="file-sign" title="No hay autorizaciones" note="Cuando el colegio o el Room Parent pida permiso para una salida, aparece acá." />
        }
      />
      {respondiendo ? (
        <ResponderSheet {...respondiendo} userId={userId} onClose={() => setRespondiendo(null)} onGuardado={(autoriza) => { setConfirmaciones((p) => ({ ...p, [respondiendo.a.id]: textoConfirmacion(autoriza, respondiendo.hijo.nombre) })); setRespondiendo(null); cargar(); }} />
      ) : null}
      {detalle ? (
        <DetalleSheet
          a={detalle}
          alumnos={datos.alumnos.filter((x) => x.curso_id === detalle.curso_id)}
          respuestas={datos.respuestas.filter((r) => r.autorizacion_id === detalle.id)}
          onClose={() => setDetalle(null)}
          onEliminada={() => { setDetalle(null); cargar(); }}
        />
      ) : null}
      {nueva ? (
        <NuevaSheet
          cursos={cursosQueGestiona.map((id) => ({ id, nombre: tagDeCurso(id)?.nombre || "Este curso" }))}
          userId={userId}
          onClose={() => setNueva(false)}
          onCreada={() => { setNueva(false); cargar(); }}
        />
      ) : null}
    </View>
  );
}

function ResponderSheet({ a, hijo, respuesta, userId, onClose, onGuardado }) {
  const [form, setForm] = useState({ autoriza: respuesta?.autoriza ?? null, retira: respuesta?.retira || "", comentario: respuesta?.comentario || "" });
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    if (form.autoriza === null) { Alert.alert("Falta la respuesta", "Elegí Autorizo o No autorizo."); return; }
    setGuardando(true);
    const { error } = await supabase.from("autorizacion_respuestas").upsert({
      autorizacion_id: a.id, hijo_id: hijo.id, usuario_id: userId, autoriza: form.autoriza,
      retira: sanitize(form.retira) || null, comentario: sanitize(form.comentario) || null, respondido_en: new Date().toISOString(),
    }, { onConflict: "autorizacion_id,hijo_id" });
    setGuardando(false);
    if (error) { Alert.alert("No se pudo guardar", estaAbierta(a, fmtLocalDate()) ? "Probá de nuevo." : "La fecha límite ya pasó."); return; }
    onGuardado(form.autoriza);
  };
  const opcion = (valor, txt, estilo) => (
    <Pressable onPress={() => setForm((p) => ({ ...p, autoriza: valor }))} style={[styles.opcion, form.autoriza === valor && estilo]}>
      <Text style={[styles.opcionTxt, form.autoriza === valor && styles.opcionTxtOn]}>{txt}</Text>
    </Pressable>
  );
  return (
    <Sheet visible onClose={onClose} title={`${hijo.nombre}: ${a.titulo}`}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <View style={styles.opcionesRow}>
          {opcion(true, "Autorizo", styles.opcionOn)}
          {opcion(false, "No autorizo", styles.opcionOn)}
        </View>
        <Text style={styles.label}>¿Quién lo retira?</Text>
        <TextInput value={form.retira} onChangeText={(v) => setForm((p) => ({ ...p, retira: v }))} placeholder="Ej: la mamá, Juana Pérez" placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Comentario (opcional)</Text>
        <TextInput value={form.comentario} onChangeText={(v) => setForm((p) => ({ ...p, comentario: v }))} placeholder="Algo que el colegio tenga que saber" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea]} />
        <Button title={guardando ? "Guardando…" : "Enviar respuesta"} onPress={guardar} disabled={guardando} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

function DetalleSheet({ a, ids, alumnos, respuestas, onClose, onEliminada }) {
  const filas = estadoPorAlumno(alumnos, respuestas);
  const s = resumenRespuestas(alumnos, respuestas);
  const exportar = async () => {
    try {
      await exportRowsToExcel({
        rows: filas.map(({ hijo, respuesta }) => ({
          Alumno: fmtNombre(hijo),
          Respuesta: !respuesta ? "Sin responder" : respuesta.autoriza ? "Autorizado" : "No autorizado",
          "Quién retira": respuesta?.retira || "",
          Comentario: respuesta?.comentario || "",
          "Respondió": respuesta ? fmtNombre(respuesta.usuarios) : "",
          Fecha: respuesta ? fmtCuando(respuesta.respondido_en) : "",
        })),
        nombreHoja: "Respuestas",
        fileName: a.titulo.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "autorizacion",
      });
    } catch (e) {
      Alert.alert("No se pudo exportar", e?.message || "Probá de nuevo.");
    }
  };
  const eliminar = () =>
    Alert.alert("Eliminar autorización", "Se borran también todas las respuestas.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => { await supabase.from("autorizaciones").delete().in("id", ids || [a.id]); onEliminada(); } },
    ]);
  return (
    <Sheet visible onClose={onClose} title={a.titulo}>
      <Text style={styles.resumenGrande}>✅ {s.autorizados} autorizados · ❌ {s.noAutorizados} no · ⏳ {s.sinResponder} sin responder</Text>
      <ScrollView style={styles.sheetScroll}>
        {filas.map(({ hijo, respuesta }) => (
          <View key={hijo.id} style={styles.detalleRow}>
            <Text style={styles.detalleIcon}>{!respuesta ? "⏳" : respuesta.autoriza ? "✅" : "❌"}</Text>
            <View style={styles.flex1}>
              <Text style={styles.hijoNombre}>{fmtNombre(hijo)}</Text>
              <Text style={styles.hijoMeta}>
                {respuesta
                  ? [respuesta.retira ? `Retira: ${respuesta.retira}` : null, respuesta.comentario ? `“${respuesta.comentario}”` : null, `${fmtNombre(respuesta.usuarios)}, ${fmtCuando(respuesta.respondido_en)}`].filter(Boolean).join(" · ")
                  : "Sin responder"}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.detalleAcciones}>
        <Button title="⬇ Exportar Excel" variant="secondary" size="sm" onPress={exportar} />
        <Pressable onPress={eliminar} hitSlop={6}><Text style={styles.eliminar}>Eliminar</Text></Pressable>
      </View>
    </Sheet>
  );
}

// Alta en uno o varios cursos (Room Parent: su curso; colegio: varios, con el
// mismo grupo_id como las Comunicaciones). cursos: [{ id, nombre }].
function NuevaSheet({ cursos, multi = false, userId, onClose, onCreada }) {
  const [form, setForm] = useState({
    titulo: "", descripcion: "", fecha_evento: "", fecha_limite: "",
    cursosSel: cursos.length === 1 ? [cursos[0].id] : [],
  });
  const [guardando, setGuardando] = useState(false);
  const toggleCurso = (id) =>
    setForm((p) => ({
      ...p,
      cursosSel: multi ? (p.cursosSel.includes(id) ? p.cursosSel.filter((x) => x !== id) : [...p.cursosSel, id]) : [id],
    }));
  const publicar = async () => {
    if (!form.titulo.trim()) { Alert.alert("Falta el título"); return; }
    if (!form.cursosSel.length) { Alert.alert("Elegí al menos un curso"); return; }
    if (form.fecha_limite && form.fecha_evento && form.fecha_limite > form.fecha_evento) { Alert.alert("Revisá las fechas", "La fecha límite no puede ser posterior a la salida."); return; }
    setGuardando(true);
    const grupo_id = form.cursosSel.length > 1 ? uuidLite() : null;
    const { error } = await supabase.from("autorizaciones").insert(
      form.cursosSel.map((curso_id) => ({
        curso_id, grupo_id, titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null,
        fecha_evento: form.fecha_evento || null, fecha_limite: form.fecha_limite || null, creado_por: userId,
      }))
    );
    if (error) { setGuardando(false); Alert.alert("No se pudo publicar", error.message); return; }
    const userIds = [...new Set((await Promise.all(form.cursosSel.map(getUserIdsByCurso))).flat())].filter((u) => u !== userId);
    await sendPush({ type: "autorizacion", payload: { titulo: form.titulo.trim(), userIds } });
    setGuardando(false);
    onCreada();
  };
  return (
    <Sheet visible onClose={onClose} title="Nueva autorización">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        {cursos.length > 1 ? (
          <>
            <View style={styles.cursosCabecera}>
              <Text style={[styles.label, styles.flex1]}>{multi ? `Cursos${form.cursosSel.length ? ` · ${form.cursosSel.length} elegido${form.cursosSel.length === 1 ? "" : "s"}` : ""}` : "Curso"}</Text>
              {multi ? (
                <Pressable onPress={() => setForm((p) => ({ ...p, cursosSel: p.cursosSel.length === cursos.length ? [] : cursos.map((c) => c.id) }))} hitSlop={8}>
                  <Text style={styles.todosTxt}>{form.cursosSel.length === cursos.length ? "Ninguno" : "Seleccionar todos"}</Text>
                </Pressable>
              ) : null}
            </View>
            {/* Lista con casillas y scroll: con muchos cursos, los botones ocupaban media pantalla. */}
            <CursoListSelector cursos={cursos} seleccionados={form.cursosSel} onToggle={toggleCurso} multi={multi} maxHeight={220} />
          </>
        ) : null}
        <Text style={styles.label}>Título</Text>
        <TextInput value={form.titulo} onChangeText={(v) => setForm((p) => ({ ...p, titulo: v }))} placeholder="Ej: Salida a la Granja Educativa" placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Detalle (opcional)</Text>
        <TextInput value={form.descripcion} onChangeText={(v) => setForm((p) => ({ ...p, descripcion: v }))} placeholder="Horario, lugar, qué llevar, costo…" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea]} />
        <Text style={styles.label}>Fecha de la salida (opcional)</Text>
        <DateField value={form.fecha_evento} onChange={(v) => setForm((p) => ({ ...p, fecha_evento: v }))} clearable style={styles.input} />
        <Text style={styles.label}>Responder hasta (opcional)</Text>
        <DateField value={form.fecha_limite} onChange={(v) => setForm((p) => ({ ...p, fecha_limite: v }))} clearable style={styles.input} />
        <Text style={styles.hint}>Cada familia responde por hijo si autoriza, quién lo retira y un comentario. Les llega una notificación.</Text>
        <Button title={guardando ? "Publicando…" : "Publicar"} onPress={publicar} disabled={guardando} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

/** Sección del Super Admin / Admin de Colegio: publicar en varios cursos y ver respuestas. */
export function AutorizacionesColegio({ cursos, userId }) {
  const [datos, setDatos] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [detalle, setDetalle] = useState(null); // grupo abierto
  const clave = cursos.map((c) => c.id).join(",");
  const hoyStr = fmtLocalDate();

  const cargar = useCallback(async () => {
    const ids = clave ? clave.split(",") : [];
    if (!ids.length) { setDatos({ autorizaciones: [], respuestas: [], alumnos: [] }); return; }
    const { data: auts } = await supabase.from("autorizaciones").select("*").in("curso_id", ids).order("creado_en", { ascending: false });
    const autIds = (auts || []).map((a) => a.id);
    const [resp, alumnos] = await Promise.all([
      autIds.length ? supabase.from("autorizacion_respuestas").select("*, usuarios(nombre,apellido)").in("autorizacion_id", autIds) : Promise.resolve({ data: [] }),
      supabase.from("hijos").select("id,nombre,apellido,curso_id").in("curso_id", ids),
    ]);
    setDatos({ autorizaciones: auts || [], respuestas: resp.data || [], alumnos: alumnos.data || [] });
  }, [clave]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos) return <Text style={styles.cargando}>Cargando…</Text>;
  const nombreCurso = new Map(cursos.map((c) => [c.id, c.nombre]));
  // Las filas multi-curso (mismo grupo_id) van en una sola tarjeta.
  const grupos = [];
  const porGrupo = new Map();
  for (const a of datos.autorizaciones) {
    const k = a.grupo_id || a.id;
    if (!porGrupo.has(k)) { porGrupo.set(k, { ...a, filas: [] }); grupos.push(porGrupo.get(k)); }
    porGrupo.get(k).filas.push(a);
  }
  const datosDe = (g) => {
    const cursosG = new Set(g.filas.map((f) => f.curso_id));
    const idsG = new Set(g.filas.map((f) => f.id));
    return {
      alumnos: datos.alumnos.filter((h) => cursosG.has(h.curso_id)),
      respuestas: datos.respuestas.filter((r) => idsG.has(r.autorizacion_id)),
    };
  };

  return (
    <View>
      <Button title="+ Nueva autorización" size="sm" onPress={() => setNueva(true)} style={styles.nuevaColegio} />
      {!grupos.length ? <Text style={styles.cargando}>Todavía no hay autorizaciones en este colegio.</Text> : null}
      {grupos.map((g) => {
        const abierta = estaAbierta(g, hoyStr);
        const { alumnos, respuestas } = datosDe(g);
        const s = resumenRespuestas(alumnos, respuestas);
        return (
          <Card key={g.grupo_id || g.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.titulo}>✍️ {g.titulo}</Text>
              <View style={[styles.estado, !abierta && styles.estadoCerrada]}>
                <Text style={[styles.estadoTxt, !abierta && styles.estadoTxtCerrada]}>{abierta ? "Abierta" : "Cerrada"}</Text>
              </View>
            </View>
            <Text style={styles.meta}>{g.filas.map((f) => nombreCurso.get(f.curso_id)).filter(Boolean).join(", ")}</Text>
            {g.fecha_evento ? <Text style={styles.meta}>📅 {fmtFecha(g.fecha_evento)}</Text> : null}
            {g.fecha_limite ? <Text style={styles.meta}>⏰ Hasta el {fmtFecha(g.fecha_limite)}</Text> : null}
            <Pressable onPress={() => setDetalle(g)} style={styles.resumenBtn} hitSlop={4}>
              <Text style={styles.resumenTxt}>✅ {s.autorizados} · ❌ {s.noAutorizados} · ⏳ {s.sinResponder} sin responder — ver respuestas</Text>
            </Pressable>
          </Card>
        );
      })}
      {detalle ? (
        <DetalleSheet
          a={detalle}
          ids={detalle.filas.map((f) => f.id)}
          {...datosDe(detalle)}
          onClose={() => setDetalle(null)}
          onEliminada={() => { setDetalle(null); cargar(); }}
        />
      ) : null}
      {nueva ? (
        <NuevaSheet cursos={cursos} multi userId={userId} onClose={() => setNueva(false)} onCreada={() => { setNueva(false); cargar(); }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nuevaColegio: { alignSelf: "flex-start", marginBottom: SPACE.md },
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  cargando: { textAlign: "center", color: t.textFaint, padding: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm, marginBottom: SPACE.lg },
  h1: { ...TYPE.h1, color: t.text },
  sub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  flex1: { flex: 1, minWidth: 0 },
  card: { marginBottom: SPACE.md },
  cardResaltada: { borderColor: "#93C5FD", borderWidth: 2 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACE.sm },
  convocatoria: { fontSize: 12.5, fontWeight: "600", color: t.textMuted },
  titulo: { fontSize: 17, fontWeight: "800", color: t.textStrong, marginTop: 8, lineHeight: 22 },
  fechaFila: { flexDirection: "row", gap: 14, marginTop: 6 },
  fechaLabel: { width: 118, fontSize: 13, color: t.textMuted },
  fechaValor: { flex: 1, fontSize: 13, fontWeight: "600", color: t.textStrong },
  fechaUrgente: { color: "#B45309" },
  confirmacion: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: SPACE.md, paddingVertical: 9, paddingHorizontal: 12, borderRadius: RADIUS.md, backgroundColor: "#F0FDF4" },
  confirmacionTxt: { flex: 1, fontSize: 13, fontWeight: "600", color: "#047857" },
  tuRespuesta: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginTop: SPACE.md },
  si: { color: "#047857" },
  no: { color: "#B91C1C" },
  falta: { color: t.textMuted, fontWeight: "600" },
  estado: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm, backgroundColor: "#F0FDF4" },
  estadoCerrada: { backgroundColor: "#F1F5F9" },
  estadoTxt: { fontSize: 10.5, fontWeight: "700", color: "#10B981" },
  estadoTxtCerrada: { color: t.textFaint },
  metaRow: { flexDirection: "row", gap: SPACE.sm, alignItems: "center", flexWrap: "wrap", flexShrink: 1 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagTxt: { fontSize: 12, fontWeight: "600", color: "#475569" },
  colegio: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  meta: { fontSize: 12, color: t.textMuted, marginTop: 3 },
  metaLimite: { color: "#B45309" },
  descripcion: { fontSize: 13, color: "#475569", marginTop: SPACE.sm, lineHeight: 19 },
  hijoRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0" },
  hijoNombre: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  hijoMeta: { fontSize: 11.5, color: t.textMuted, marginTop: 2, lineHeight: 16 },
  btnPri: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: t.accent },
  btnPriTxt: { color: t.onAccent, fontSize: 12.5, fontWeight: "700" },
  btnSec: { paddingHorizontal: 10, paddingVertical: 6 },
  btnSecTxt: { color: t.accent, fontSize: 12.5, fontWeight: "700" },
  resumenBtn: { marginTop: SPACE.md, paddingTop: SPACE.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0" },
  resumenTxt: { fontSize: 12, fontWeight: "700", color: t.accent },
  sheetScroll: { flexShrink: 1 },
  opcionesRow: { flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.md },
  opcion: { flex: 1, paddingVertical: 11, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: "#E2E8F0", alignItems: "center" },
  opcionOn: { borderColor: t.textStrong, backgroundColor: "#F8FAFC" },
  opcionTxt: { fontSize: 14, fontWeight: "700", color: t.textMuted },
  opcionTxtOn: { color: t.text },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 4, marginTop: SPACE.sm },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: RADIUS.md, padding: 10, fontSize: 14, color: t.text, backgroundColor: "#F8FAFC" },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  hint: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
  mtMd: { marginTop: SPACE.md },
  resumenGrande: { fontSize: 13, fontWeight: "700", color: t.text, marginBottom: SPACE.sm },
  detalleRow: { flexDirection: "row", gap: SPACE.sm, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  detalleIcon: { fontSize: 15 },
  detalleAcciones: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: SPACE.md },
  eliminar: { color: t.danger, fontSize: 13, fontWeight: "700" },
  cursosCabecera: { flexDirection: "row", alignItems: "center", gap: 8 },
  todosTxt: { fontSize: 13, fontWeight: "700", color: t.accent, marginTop: 10 },
});
