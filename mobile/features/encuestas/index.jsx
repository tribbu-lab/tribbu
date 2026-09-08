// Encuestas — sondeos rápidos por curso (puerto RN de src/features/encuestas).
// A diferencia del resto de los "+" de tribbu, cualquier rol (padre o admin)
// puede crear una encuesta; el voto es por apoderado (un voto por usuario_id,
// no por hijo) y los resultados se ven en vivo para cualquier miembro del
// curso, haya votado o no. Cerrar/borrar es de quien la creó, un admin del
// curso, o Super Admin.

import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, FlatList, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { sanitize } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { DateField } from "../../components/DateField";
import { EmptyState } from "../../components/EmptyState";

const t = THEMES.light;
const MAX_OPCIONES = 6;
const MIN_OPCIONES = 2;
const FORM_VACIO = { pregunta: "", opciones: ["", ""], fecha_cierre: "", curso_id: null };

export function Encuestas() {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, isAdmin, items } = useSession();
  const userId = usuario?.id ?? null;

  const [encuestas, setEncuestas] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [votos, setVotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("activas");
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState(null); // id de la encuesta en edición, o null si es alta
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [votando, setVotando] = useState(null); // id de la encuesta con un voto en vuelo (evita doble-tap/carrera)

  // Fecha local del dispositivo (no UTC — toISOString() corre la fecha antes
  // de tiempo para usuarios al oeste de UTC en la noche, ej. Argentina).
  const hoyDate = new Date();
  const hoyStr = `${hoyDate.getFullYear()}-${String(hoyDate.getMonth()+1).padStart(2,"0")}-${String(hoyDate.getDate()).padStart(2,"0")}`;

  // En vista "Todos" el permiso de gestión se resuelve contra el rol en el
  // curso de cada fila, no contra el isAdmin de sesión (que en Todos es false).
  const cursosAdmin = useMemo(
    () => new Set((items || []).filter((i) => i.rolEfectivo === "room").map((i) => i.curso_id)),
    [items]
  );

  const cursosOpciones = useMemo(
    () => (esVistaTodos ? cursoIds.map((cid) => ({ curso_id: cid, tag: tagDeCurso(cid) })).filter((o) => o.tag) : []),
    [esVistaTodos, cursoIds, tagDeCurso]
  );

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) {
      setCargando(false);
      return;
    }
    setCargando(true);
    const { data: encs } = await supabase.from("encuestas").select("*").in("curso_id", cursoIds).order("creado_en", { ascending: false });
    const ids = (encs || []).map((e) => e.id);
    const [ops, vts] = await Promise.all([
      ids.length ? supabase.from("encuesta_opciones").select("*").in("encuesta_id", ids).order("orden", { ascending: true }) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("encuesta_votos").select("*, usuarios(nombre,apellido)").in("encuesta_id", ids) : Promise.resolve({ data: [] }),
    ]);
    setEncuestas(encs || []);
    setOpciones(ops.data || []);
    setVotos(vts.data || []);
    setCargando(false);
  }, [cursoIds]);

  useEffect(() => { cargar(); }, [cargar]);

  const opcionesDe = (eid) => opciones.filter((o) => o.encuesta_id === eid);
  const votosDe = (eid) => votos.filter((v) => v.encuesta_id === eid);
  const miVoto = (eid) => votos.find((v) => v.encuesta_id === eid && v.usuario_id === userId)?.opcion_id || null;
  const estaCerrada   = (e) => e.cerrada_manual || (e.fecha_cierre && e.fecha_cierre < hoyStr);
  const estaEliminada = (e) => !!e.eliminada_en;
  const puedeGestionar = (e) => e.creado_por === userId || (esVistaTodos ? cursosAdmin.has(e.curso_id) : isAdmin);
  // Editar las opciones solo tiene sentido mientras nadie votó todavía —
  // después de eso borrar/reemplazar opciones dejaría votos huérfanos.
  const puedeEditarOpciones = (e) => puedeGestionar(e) && !estaCerrada(e) && !estaEliminada(e) && votosDe(e.id).length === 0;

  const abrirModal = () => {
    setEditId(null);
    setForm({ ...FORM_VACIO, opciones: ["", ""], curso_id: cursoId || cursoIds[0] || null });
    setModal(true);
  };

  const abrirModalEditar = (e) => {
    setEditId(e.id);
    setForm({ ...FORM_VACIO, pregunta: e.pregunta || "", opciones: opcionesDe(e.id).map((o) => o.texto), fecha_cierre: e.fecha_cierre || "", curso_id: e.curso_id });
    setModal(true);
  };

  const setOpcionTexto = (i, val) => setForm((p) => ({ ...p, opciones: p.opciones.map((o, idx) => (idx === i ? val : o)) }));
  const agregarOpcion = () => setForm((p) => (p.opciones.length >= MAX_OPCIONES ? p : { ...p, opciones: [...p.opciones, ""] }));
  const quitarOpcion = (i) => setForm((p) => (p.opciones.length <= MIN_OPCIONES ? p : { ...p, opciones: p.opciones.filter((_, idx) => idx !== i) }));

  const crear = async () => {
    const cursoDestino = cursoId || form.curso_id;
    const opcionesLimpias = form.opciones.map((o) => o.trim()).filter(Boolean);
    if (!form.pregunta?.trim() || opcionesLimpias.length < MIN_OPCIONES || !cursoDestino) return;
    setSaving(true);
    setError(null);
    let encuestaCreada = null;
    try {
      const { data: enc, error: encErr } = await supabase
        .from("encuestas")
        .insert({ pregunta: sanitize(form.pregunta), curso_id: cursoDestino, creado_por: userId, fecha_cierre: form.fecha_cierre || null })
        .select()
        .single();
      if (encErr) throw encErr;
      encuestaCreada = enc;
      const { error: opError } = await supabase
        .from("encuesta_opciones")
        .insert(opcionesLimpias.map((texto, i) => ({ encuesta_id: enc.id, texto: sanitize(texto), orden: i })));
      if (opError) throw opError;
      const userIds = await getUserIdsByCurso(cursoDestino);
      if (userIds.length) await sendPush({ type: "encuesta", payload: { titulo: form.pregunta, userIds } });
      setModal(false);
      cargar();
    } catch (e) {
      console.warn("Encuestas.crear:", e?.message);
      // Si la encuesta ya se creó pero las opciones fallaron, no dejar una
      // fila huérfana (pregunta sin opciones) visible para todo el curso.
      if (encuestaCreada) await supabase.from("encuestas").delete().eq("id", encuestaCreada.id);
      setError("No se pudo publicar la encuesta. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // Edición de una encuesta existente — solo llega a ejecutarse con 0 votos
  // (puedeEditarOpciones lo garantiza en la UI), así que reemplazar todas las
  // opciones no puede dejar votos huérfanos.
  const guardarEdicion = async () => {
    const opcionesLimpias = form.opciones.map((o) => o.trim()).filter(Boolean);
    if (!form.pregunta?.trim() || opcionesLimpias.length < MIN_OPCIONES || !editId) return;
    setSaving(true);
    setError(null);
    try {
      const { error: encErr } = await supabase
        .from("encuestas")
        .update({ pregunta: sanitize(form.pregunta), fecha_cierre: form.fecha_cierre || null })
        .eq("id", editId);
      if (encErr) throw encErr;
      const { error: delErr } = await supabase.from("encuesta_opciones").delete().eq("encuesta_id", editId);
      if (delErr) throw delErr;
      const { error: opError } = await supabase
        .from("encuesta_opciones")
        .insert(opcionesLimpias.map((texto, i) => ({ encuesta_id: editId, texto: sanitize(texto), orden: i })));
      if (opError) throw opError;
      setModal(false);
      setEditId(null);
      cargar();
    } catch (e) {
      console.warn("Encuestas.guardarEdicion:", e?.message);
      setError("No se pudieron guardar los cambios. Probá de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const votar = async (eid, oid) => {
    if (!userId || votando) return;
    setVotando(eid);
    setError(null);
    const votoAnterior = votos.find((v) => v.encuesta_id === eid && v.usuario_id === userId) || null;
    setVotos((p) => [...p.filter((v) => !(v.encuesta_id === eid && v.usuario_id === userId)), { encuesta_id: eid, opcion_id: oid, usuario_id: userId }]);
    const { error: voteErr } = await supabase.from("encuesta_votos").upsert({ encuesta_id: eid, opcion_id: oid, usuario_id: userId }, { onConflict: "encuesta_id,usuario_id" });
    if (voteErr) {
      console.warn("Encuestas.votar:", voteErr?.message);
      setVotos((p) => {
        const sinOptimista = p.filter((v) => !(v.encuesta_id === eid && v.usuario_id === userId));
        return votoAnterior ? [...sinOptimista, votoAnterior] : sinOptimista;
      });
      setError("No se pudo registrar tu voto. Probá de nuevo.");
    }
    await cargar();
    setVotando(null);
  };

  const terminar = async (id) => {
    const { error: err } = await supabase.from("encuestas").update({ cerrada_manual: true }).eq("id", id);
    if (err) { console.warn("Encuestas.terminar:", err?.message); setError("No se pudo terminar la encuesta."); return; }
    cargar();
  };
  const reabrir = async (id) => {
    const { error: err } = await supabase.from("encuestas").update({ cerrada_manual: false }).eq("id", id);
    if (err) { console.warn("Encuestas.reabrir:", err?.message); setError("No se pudo reabrir la encuesta."); return; }
    cargar();
  };
  // Borrado suave (encuestas.eliminada_en) para que el creador o el Room
  // Parent puedan recuperarla si la borraron sin querer.
  const eliminar = async (id) => {
    const { error: err } = await supabase.from("encuestas").update({ eliminada_en: new Date().toISOString() }).eq("id", id);
    if (err) { console.warn("Encuestas.eliminar:", err?.message); setError("No se pudo eliminar la encuesta."); return; }
    cargar();
  };
  const recuperar = async (id) => {
    const { error: err } = await supabase.from("encuestas").update({ eliminada_en: null }).eq("id", id);
    if (err) { console.warn("Encuestas.recuperar:", err?.message); setError("No se pudo recuperar la encuesta."); return; }
    cargar();
  };

  const visibles = encuestas.filter((e) => !estaEliminada(e) && (filtro === "activas" ? !estaCerrada(e) : estaCerrada(e)));
  const eliminadas = encuestas.filter((e) => estaEliminada(e) && puedeGestionar(e));

  return (
    <View style={styles.screen}>
      <FlatList
        data={filtro === "eliminadas" ? eliminadas : visibles}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE }}
        ListHeaderComponent={
          <>
            <Text style={styles.h1}>Encuestas</Text>
            <Text style={styles.sub}>Sondeos rápidos del curso — un voto por apoderado</Text>
            <View style={styles.toolbar}>
              <View style={styles.chips}>
                {[{ id: "activas", l: "Activas" }, { id: "cerradas", l: "Cerradas" }, { id: "eliminadas", l: "Eliminadas" }].map((ch) => (
                  <Pressable key={ch.id} onPress={() => setFiltro(ch.id)} style={[styles.chip, filtro === ch.id && styles.chipOn]}>
                    <Text style={[styles.chipTxt, filtro === ch.id && styles.chipTxtOn]}>{ch.l}</Text>
                  </Pressable>
                ))}
              </View>
              <Button title="+ Nueva" onPress={abrirModal} size="sm" />
            </View>
            {error && !modal ? <Text style={styles.errorTxt}>⚠️ {error}</Text> : null}
          </>
        }
        ListEmptyComponent={
          !cargando ? (
            <EmptyState
              emoji="📊"
              title={filtro === "activas" ? "Sin encuestas activas" : filtro === "cerradas" ? "Sin encuestas cerradas" : "Sin encuestas eliminadas"}
              note={filtro === "activas" ? "Creá la primera para sondear al curso." : null}
            />
          ) : null
        }
        renderItem={({ item: e }) =>
          filtro === "eliminadas" ? (
            <EncuestaEliminadaCard e={e} tag={tagDeCurso(e.curso_id)} onRecuperar={() => recuperar(e.id)} />
          ) : (
            <EncuestaCard
              e={e}
              opciones={opcionesDe(e.id)}
              votos={votosDe(e.id)}
              miVoto={miVoto(e.id)}
              cerrada={estaCerrada(e)}
              votando={votando === e.id}
              tag={tagDeCurso(e.curso_id)}
              puedeGestionar={puedeGestionar(e)}
              puedeEditar={puedeEditarOpciones(e)}
              onVotar={(oid) => votar(e.id, oid)}
              onEditar={() => abrirModalEditar(e)}
              onTerminar={() => terminar(e.id)}
              onReabrir={() => reabrir(e.id)}
              onEliminar={() => eliminar(e.id)}
            />
          )
        }
      />

      <Sheet visible={modal} onClose={() => { setModal(false); setEditId(null); }} title={editId ? "Editar encuesta" : "Nueva encuesta"}>
        {!editId && cursosOpciones.length > 0 ? (
          <>
            <Text style={styles.label}>Para el curso de</Text>
            <View style={styles.cursoRow}>
              {cursosOpciones.map((o) => {
                const active = form.curso_id === o.curso_id;
                return (
                  <Pressable key={o.curso_id} onPress={() => setForm((p) => ({ ...p, curso_id: o.curso_id }))} style={[styles.cursoBtn, active && styles.cursoBtnOn]}>
                    <View style={[styles.tagDot, { backgroundColor: o.tag.color }]} />
                    <Text style={[styles.cursoBtnTxt, active && styles.cursoBtnTxtOn]}>{o.tag.nombre}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={styles.label}>Pregunta</Text>
        <TextInput
          value={form.pregunta}
          onChangeText={(v) => setForm((p) => ({ ...p, pregunta: v }))}
          placeholder="Ej: ¿Quién trae la torta el viernes?"
          multiline
          numberOfLines={2}
          style={[styles.input, styles.inputMultiline]}
        />

        <Text style={styles.label}>Opciones</Text>
        {form.opciones.map((op, i) => (
          <View key={i} style={styles.opcionRow}>
            <TextInput value={op} onChangeText={(v) => setOpcionTexto(i, v)} placeholder={`Opción ${i + 1}`} style={[styles.input, styles.opcionInput]} />
            {form.opciones.length > MIN_OPCIONES ? (
              <Pressable onPress={() => quitarOpcion(i)} style={styles.opcionQuitar} hitSlop={8}>
                <Text style={styles.opcionQuitarTxt}>✕</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {form.opciones.length < MAX_OPCIONES ? (
          <Pressable onPress={agregarOpcion} style={styles.agregarBtn}>
            <Text style={styles.agregarTxt}>+ Agregar opción</Text>
          </Pressable>
        ) : null}

        <Text style={styles.label}>Fecha de cierre (opcional)</Text>
        <DateField value={form.fecha_cierre} onChange={(v) => setForm((p) => ({ ...p, fecha_cierre: v }))} placeholder="Sin fecha límite" clearable style={styles.input} />

        {error && modal ? <Text style={styles.errorTxt}>⚠️ {error}</Text> : null}
        <Button
          title={saving ? "Guardando..." : editId ? "Guardar cambios" : "Publicar encuesta"}
          onPress={editId ? guardarEdicion : crear}
          disabled={saving}
          loading={saving}
          style={{ marginTop: SPACE.lg }}
        />
      </Sheet>
    </View>
  );
}

function EncuestaCard({ e, opciones, votos, miVoto, cerrada, votando, tag, puedeGestionar, puedeEditar, onVotar, onEditar, onTerminar, onReabrir, onEliminar }) {
  const total = votos.length;
  // Pie contextual (Parte 4 del handoff): reemplaza tener que inferir el
  // estado mirando la fecha y si ya voté.
  const ganadora = cerrada && opciones.length
    ? opciones.reduce((max, o) => (votos.filter((v) => v.opcion_id === o.id).length > votos.filter((v) => v.opcion_id === max.id).length ? o : max), opciones[0])
    : null;
  const pie = cerrada
    ? (ganadora && total > 0 ? `Cerrada · ganó "${ganadora.texto}"` : "Cerrada")
    : miVoto
    ? "Ya votaste, podés cambiarlo"
    : e.fecha_cierre
    ? `Cierra ${new Date(e.fecha_cierre + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`
    : null;
  return (
    <Card style={cerrada ? styles.cardCerrada : null}>
      <View style={styles.cardHead}>
        <Text style={styles.pregunta}>{e.pregunta}</Text>
        <View style={[styles.estadoPill, cerrada ? styles.estadoCerrada : styles.estadoAbierta]}>
          <Text style={[styles.estadoTxt, cerrada ? styles.estadoTxtCerrada : styles.estadoTxtAbierta]}>{cerrada ? "Cerrada" : "Abierta"}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {tag ? (
          <View style={styles.tagRow}>
            <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
            <Text style={styles.tagTxt}>{tag.nombre}</Text>
          </View>
        ) : null}
        {e.fecha_cierre ? (
          <Text style={styles.metaTxt}>
            Cierra {new Date(e.fecha_cierre + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
          </Text>
        ) : null}
        <Text style={styles.metaTxt}>{total} voto{total !== 1 ? "s" : ""}</Text>
      </View>

      <View style={{ gap: SPACE.xs }}>
        {opciones.map((o) => {
          const votantes = votos.filter((v) => v.opcion_id === o.id);
          const cuenta = votantes.length;
          const pct = total ? Math.round((cuenta / total) * 100) : 0;
          const esMiVoto = miVoto === o.id;
          const nombres = votantes.map((v) => v.usuarios?.nombre?.split(" ")[0] || "Apoderado").join(", ");
          return (
            <View key={o.id}>
              <Pressable onPress={() => !cerrada && !votando && onVotar(o.id)} disabled={cerrada || votando} style={[styles.opcion, esMiVoto && styles.opcionOn, votando && styles.opcionVotando]}>
                <View style={[styles.opcionBar, { width: `${pct}%` }, esMiVoto && styles.opcionBarOn]} />
                <View style={styles.opcionContent}>
                  <Text style={[styles.opcionTxt, esMiVoto && styles.opcionTxtOn]} numberOfLines={2}>{esMiVoto ? "✓ " : ""}{o.texto}</Text>
                  <Text style={styles.opcionPct}>{cuenta} · {pct}%</Text>
                </View>
              </Pressable>
              {cuenta > 0 ? <Text style={styles.opcionVotantes} numberOfLines={1}>{nombres}</Text> : null}
            </View>
          );
        })}
      </View>

      {pie ? <Text style={styles.pieTxt}>{pie}</Text> : null}

      {puedeGestionar ? (
        <View style={styles.gestionRow}>
          {puedeEditar ? (
            <Pressable onPress={onEditar} style={styles.gestionBtn}>
              <Text style={styles.gestionTxt}>✏️ Editar</Text>
            </Pressable>
          ) : null}
          {!cerrada ? (
            <Pressable onPress={onTerminar} style={styles.gestionBtn}>
              <Text style={styles.gestionTxt}>Terminar encuesta</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onReabrir} style={styles.gestionBtn}>
              <Text style={styles.gestionTxtExito}>Reabrir</Text>
            </Pressable>
          )}
          <Pressable onPress={onEliminar} style={styles.gestionBtn}>
            <Text style={styles.gestionTxtDanger}>Eliminar</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

function EncuestaEliminadaCard({ e, tag, onRecuperar }) {
  return (
    <Card style={styles.cardCerrada}>
      <Text style={styles.pregunta}>{e.pregunta}</Text>
      <View style={styles.metaRow}>
        {tag ? (
          <View style={styles.tagRow}>
            <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
            <Text style={styles.tagTxt}>{tag.nombre}</Text>
          </View>
        ) : null}
        <Text style={styles.metaTxt}>
          Eliminada el {new Date(e.eliminada_en).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}
        </Text>
      </View>
      <Pressable onPress={onRecuperar} style={styles.recuperarBtn}>
        <Text style={styles.recuperarTxt}>↩️ Recuperar</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  h1: { ...TYPE.h1, color: t.textStrong, marginBottom: 2 },
  sub: { ...TYPE.body, color: t.textMuted, marginBottom: SPACE.lg },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.lg, gap: SPACE.sm },
  chips: { flexDirection: "row", gap: SPACE.xs },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: RADIUS.full, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  chipOn: { backgroundColor: t.textStrong, borderColor: t.textStrong },
  chipTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  chipTxtOn: { color: t.surface },

  cardCerrada: { opacity: 0.72 },
  pieTxt: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: SPACE.sm, marginBottom: 4 },
  pregunta: { ...TYPE.h3, color: t.textStrong, flex: 1, lineHeight: 20 },
  estadoPill: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: RADIUS.full, flexShrink: 0 },
  estadoAbierta: { backgroundColor: t.successSoft },
  estadoCerrada: { backgroundColor: t.surface2 },
  estadoTxt: { fontSize: 10, fontWeight: "700" },
  estadoTxtAbierta: { color: t.success },
  estadoTxtCerrada: { color: t.textMuted },

  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACE.sm, marginBottom: SPACE.md },
  metaTxt: { fontSize: 11, color: t.textMuted },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagTxt: { fontSize: 10, fontWeight: "700", color: t.textMuted },

  opcion: { position: "relative", overflow: "hidden", borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface, minHeight: 46, justifyContent: "center", paddingVertical: 8, paddingHorizontal: 12 },
  opcionOn: { borderColor: t.accent },
  opcionBar: { position: "absolute", top: 0, left: 0, bottom: 0, backgroundColor: t.surface2 },
  opcionBarOn: { backgroundColor: t.accentSoft },
  opcionContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.sm },
  opcionTxt: { fontSize: 13, fontWeight: "500", color: t.textStrong, flex: 1 },
  opcionTxtOn: { fontWeight: "700" },
  opcionPct: { fontSize: 12, fontWeight: "700", color: t.textMuted, flexShrink: 0 },
  opcionVotantes: { fontSize: 11, color: t.textFaint, paddingHorizontal: 4, marginTop: 2 },
  opcionVotando: { opacity: 0.6 },
  errorTxt: { fontSize: 12, color: t.danger, backgroundColor: t.dangerSoft, borderRadius: RADIUS.sm, padding: SPACE.sm, marginTop: SPACE.sm },

  gestionRow: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md, flexWrap: "wrap" },
  gestionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.border },
  gestionTxt: { fontSize: 11, fontWeight: "700", color: t.textMuted },
  gestionTxtExito: { fontSize: 11, fontWeight: "700", color: t.success },
  gestionTxtDanger: { fontSize: 11, fontWeight: "700", color: t.danger },
  recuperarBtn: { alignSelf: "flex-start", marginTop: SPACE.sm, paddingVertical: 6, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: t.accent },
  recuperarTxt: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },

  label: { fontSize: 11, fontWeight: "700", color: t.textMuted, marginBottom: 5, marginTop: SPACE.md, textTransform: "uppercase" },
  input: { borderWidth: 1.5, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: t.textStrong, backgroundColor: t.surface2 },
  inputMultiline: { minHeight: 56, textAlignVertical: "top" },
  opcionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  opcionInput: { flex: 1 },
  opcionQuitar: { width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.border },
  opcionQuitarTxt: { fontSize: 14, color: t.textMuted },
  agregarBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1, borderStyle: "dashed", borderColor: t.border, alignSelf: "flex-start" },
  agregarTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },

  cursoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACE.sm },
  cursoBtn: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface },
  cursoBtnOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  cursoBtnTxt: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  cursoBtnTxtOn: { color: t.accent },
});
