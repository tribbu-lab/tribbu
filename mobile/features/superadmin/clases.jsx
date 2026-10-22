// Materias del colegio + clases por curso — puerto RN de
// src/features/superadmin/clases.jsx (specs/docentes-clases-y-grupos.md,
// Fase A). maestro_cursos y maestros.materia los deriva la base (triggers):
// acá solo se escribe en `materias` y `clases`.
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, StyleSheet, Modal, KeyboardAvoidingView, ScrollView } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { BotonNuevo } from "../../components/BotonNuevo";
import { fmtNombre, sanitize } from "@shared/helpers";
import { NIVELES, nombreNivel, materiaDelNivel, puedeEditarMateria } from "@shared/niveles";
import { THEMES, SLATE, SPACE, RADIUS, MIN_TOUCH } from "@shared/tokens";

const t = THEMES.light;
export const PALETA_MATERIAS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#0EA5E9", "#14B8A6", "#6366F1", "#64748B"];
const sinAcentos = (v) => (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function useMaterias(colegioId) {
  const [materias, setMaterias] = useState(null);
  const recargar = useCallback(async () => {
    if (!colegioId) { setMaterias([]); return; }
    const { data } = await supabase.from("materias").select("*").eq("colegio_id", colegioId).order("orden").order("nombre");
    setMaterias(data || []);
  }, [colegioId]);
  useEffect(() => { recargar(); }, [recargar]);
  return { materias, recargar };
}

export async function cargarClasesCurso(cursoId) {
  const { data } = await supabase.from("clases")
    .select("id,curso_id,materia_id,maestro_id,optativa,materias(id,nombre,color,activo),maestros(id,nombre,apellido,activo)")
    .eq("curso_id", cursoId);
  return (data || []).sort((a, b) => (a.materias?.nombre || "").localeCompare(b.materias?.nombre || "", "es"));
}
export const etiquetaClase = (c) => [c.materias?.nombre, c.maestros ? fmtNombre(c.maestros) : null].filter(Boolean).join(" · ");

export async function cargarClasesMaestro(maestroId) {
  if (!maestroId) return [];
  const { data } = await supabase.from("clases").select("id,curso_id,materia_id").eq("maestro_id", maestroId);
  return data || [];
}
export async function guardarClasesMaestro(maestroId, borrador, originales, cursosVisibles) {
  const visibles = new Set(cursosVisibles);
  const clave = (v) => `${v.curso_id}|${v.materia_id}`;
  const enBorrador = new Set(borrador.map(clave));
  const enOriginal = new Set(originales.map(clave));
  const quitar = originales.filter((o) => visibles.has(o.curso_id) && !enBorrador.has(clave(o))).map((o) => o.id);
  const agregar = borrador.filter((b) => !enOriginal.has(clave(b))).map((b) => ({ maestro_id: maestroId, curso_id: b.curso_id, materia_id: b.materia_id }));
  const [del, ins] = await Promise.all([
    quitar.length ? supabase.from("clases").delete().in("id", quitar) : { error: null },
    agregar.length ? supabase.from("clases").insert(agregar) : { error: null },
  ]);
  return del.error || ins.error || null;
}

function Chip({ label, on, onPress, color }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: !!on }}>
      {color ? <View style={[s.dot, { backgroundColor: color }]} /> : null}
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

// ── Catálogo de materias ─────────────────────────────────────────────────────

// niveles: los del colegio; nivelesPropios: los de la Secretaría (edita solo esas), null = administrador.
export function MateriasAdmin({ colegioId, niveles = [], nivelesPropios = null }) {
  const conNiveles = (niveles || []).length > 1;
  const nivelesElegibles = NIVELES.filter((n) => (niveles || []).includes(n.k) && (!nivelesPropios || nivelesPropios.includes(n.k)));
  const puede = (m) => puedeEditarMateria(m, nivelesPropios);
  // La Secretaría ve solo las de sus niveles y las compartidas (las de otro nivel no le sirven).
  const deMiNivel = (m) => !nivelesPropios || !m.nivel || nivelesPropios.includes(m.nivel);
  const { materias, recargar } = useMaterias(colegioId);
  const [usos, setUsos] = useState(null); // null = todavía cargando (no mostrar "sin clases")
  const [clasesDe, setClasesDe] = useState({}); // materia_id → [{id, cursos, maestros}]
  const [sel, setSel] = useState(null); // materia abierta en el sheet de edición
  const [nombre, setNombre] = useState("");
  const [unificarCon, setUnificarCon] = useState(null);
  const [verUnificar, setVerUnificar] = useState(false);

  // Las clases de cada materia con su curso y maestra, para ver quién la da.
  const cargarClases = useCallback(async () => {
    if (!materias?.length) return;
    const { data, error } = await supabase.from("clases")
      .select("id,materia_id,maestro_id,cursos(*),maestros(nombre,apellido)") // cursos(*): la ñ de año_lectivo en la URL falla en RN
      .in("materia_id", materias.map((m) => m.id));
    if (error) console.warn("materias: clases", error.message);
    const n = {}, de = {};
    for (const r of data || []) {
      n[r.materia_id] = (n[r.materia_id] || 0) + 1;
      (de[r.materia_id] ||= []).push(r);
    }
    for (const k in de) de[k].sort((a, b) => (b.cursos?.año_lectivo || 0) - (a.cursos?.año_lectivo || 0) || (a.cursos?.nombre || "").localeCompare(b.cursos?.nombre || "", "es"));
    setUsos(n); setClasesDe(de);
  }, [materias]);
  useEffect(() => { Promise.resolve().then(cargarClases); }, [cargarClases]);

  const quitarClase = (c) => {
    const quien = c.maestros ? fmtNombre(c.maestros) : "sin maestra";
    Alert.alert(`¿Quitar ${sel.nombre} de ${c.cursos?.nombre || "este curso"}?`, `Se borra la clase (${quien}). Los bloques de horario que la usaban quedan con su texto, sin clase.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("clases").delete().eq("id", c.id);
        if (error) { Alert.alert("No se pudo quitar", error.message); return; }
        cargarClases();
      } },
    ]);
  };

  const duplicada = (n, id, nivel) => (materias || []).some((m) => m.id !== id && (m.nivel || "") === (nivel || "") && sinAcentos(m.nombre) === sinAcentos(n));
  const actualizar = async (cambios) => {
    const { error } = await supabase.from("materias").update(cambios).eq("id", sel.id);
    if (error) { Alert.alert("No se pudo guardar", error.message); return false; }
    recargar(); return true;
  };
  const guardar = async () => {
    const n = sanitize(nombre).trim();
    if (!n) return;
    const nivel = conNiveles ? sel.nivel || null : null;
    if (duplicada(n, sel.id, nivel)) { Alert.alert("Ya hay otra materia con ese nombre en ese nivel", sel.id ? "Usá “Unificar” si son la misma." : undefined); return; }
    if (!sel.id) {
      const { error } = await supabase.from("materias").insert({ colegio_id: colegioId, nombre: n, color: sel.color, nivel, orden: (materias?.length || 0) + 1 });
      if (error) { Alert.alert("No se pudo crear", error.message); return; }
      setSel(null); recargar(); return;
    }
    if (await actualizar({ nombre: n })) setSel(null);
  };
  const abrirNueva = () => { setSel({ id: null, nombre: "", nivel: nivelesPropios?.[0] || null, color: PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length], activo: true }); setNombre(""); setUnificarCon(null); };
  // En una materia nueva el color y el nivel se guardan al crear; en una existente, al tocarlos.
  const cambiar = (cambios) => { if (sel?.id) actualizar(cambios); setSel((p) => ({ ...p, ...cambios })); };
  const unificar = () => {
    if (!unificarCon) return;
    Alert.alert(`¿Unificar “${sel.nombre}” en “${unificarCon.nombre}”?`, `Sus clases y horarios pasan a “${unificarCon.nombre}” y “${sel.nombre}” desaparece.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Unificar", style: "destructive", onPress: async () => {
        const { error } = await supabase.rpc("fusionar_materias", { p_origen: sel.id, p_destino: unificarCon.id });
        if (error) { Alert.alert("No se pudo unificar", error.message); return; }
        setSel(null); setUnificarCon(null); recargar();
      } },
    ]);
  };

  const eliminar = () => {
    const n = (usos || {})[sel.id] || 0;
    Alert.alert(`¿Eliminar “${sel.nombre}”?`, n
      ? `Se quitan sus ${n} ${n === 1 ? "clase" : "clases"} de los cursos (los bloques de horario quedan con su texto, sin clase). Si es la misma que otra, usá “Unificar”.`
      : "No la usa ningún curso.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("materias").delete().eq("id", sel.id);
        if (error) { Alert.alert("No se pudo eliminar", error.message); return; }
        setSel(null); recargar();
      } },
    ]);
  };

  if (!colegioId) return <Text style={s.muted}>Elegí un colegio primero.</Text>;
  if (materias === null) return <ActivityIndicator color={t.accent} />;
  return (
    <View>
      <View style={[s.row, { justifyContent: "flex-end" }]}>
        <BotonNuevo accessibilityLabel="Nueva materia" onPress={abrirNueva} />
      </View>
      {/* Lista sobria: nombre y, en gris, nivel · clases; se toca para editar. */}
      <View style={s.card}>
        {materias.filter(deMiNivel).map((m, i) => (
          <Pressable key={m.id} onPress={() => (puede(m) ? (setSel(m), setNombre(m.nombre), setUnificarCon(null), setVerUnificar(false)) : null)} style={[s.fila, i > 0 && s.borde, !m.activo && s.off]} accessibilityRole="button">
            <View style={s.flex1}>
              <Text style={s.filaTxt}>{m.nombre}</Text>
              <Text style={s.meta}>{[conNiveles ? (m.nivel ? nombreNivel(m.nivel) : "Todos los niveles") : null, usos === null ? null : usos[m.id] ? `${usos[m.id]} ${usos[m.id] === 1 ? "clase" : "clases"}` : "sin clases", m.activo ? null : "oculta", puede(m) ? null : "solo lectura"].filter(Boolean).join(" · ")}</Text>
            </View>
            {puede(m) ? <Text style={s.editar}>Editar</Text> : null}
          </Pressable>
        ))}
      </View>

      <Modal visible={!!sel} transparent animationType="fade" onRequestClose={() => setSel(null)}>
        <KeyboardAvoidingView style={s.overlay} behavior="padding">
          <View style={s.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>{sel?.id ? "Editar materia" : "Nueva materia"}</Text>
              <Text style={s.label}>Nombre</Text>
              <TextInput value={nombre} onChangeText={setNombre} placeholder="Ej: Inglés" placeholderTextColor={t.placeholder} style={s.input} />
              <Text style={s.label}>Color en el horario</Text>
              <View style={s.wrap}>
                {PALETA_MATERIAS.map((c) => (
                  <Pressable key={c} onPress={() => cambiar({ color: c })} style={[s.colorDot, { backgroundColor: c }, sel?.color === c && s.colorOn]} accessibilityLabel={`Color ${c}`} />
                ))}
              </View>
              {conNiveles ? (
                <>
                  <Text style={s.label}>Nivel</Text>
                  <View style={s.wrap}>
                    {!nivelesPropios ? <Chip label="Todos los niveles" on={!sel?.nivel} onPress={() => cambiar({ nivel: null })} /> : null}
                    {nivelesElegibles.map((n) => <Chip key={n.k} label={n.l} on={sel?.nivel === n.k} onPress={() => cambiar({ nivel: n.k })} />)}
                  </View>
                </>
              ) : null}
              {sel?.id ? <>
              <Text style={s.label}>Dónde se da ({clasesDe[sel?.id]?.length || 0})</Text>
              {!clasesDe[sel?.id]?.length ? <Text style={s.muted}>Ningún curso la tiene.</Text> : clasesDe[sel.id].map((c) => (
                <View key={c.id} style={s.claseFila}>
                  <Text style={[s.flex1, { fontSize: 13.5, color: t.text }]}>
                    <Text style={{ fontWeight: "700", color: t.textStrong }}>{c.cursos?.nombre || "Curso eliminado"}</Text>
                    <Text style={{ color: t.textMuted }}> · {c.cursos?.año_lectivo || "—"} — </Text>
                    <Text style={{ color: c.maestros ? t.text : t.textFaint }}>{c.maestros ? fmtNombre(c.maestros) : "Sin maestra"}</Text>
                  </Text>
                  <Pressable onPress={() => quitarClase(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar ${sel?.nombre} de ${c.cursos?.nombre || "este curso"}`}>
                    <Text style={{ color: t.danger, fontSize: 13, fontWeight: "700" }}>Quitar</Text>
                  </Pressable>
                </View>
              ))}
              {/* Plegado: una lista simple de nombres (antes, pastillas de colores). */}
              <Pressable onPress={() => { setVerUnificar((v) => !v); setUnificarCon(null); }} hitSlop={6} style={{ marginTop: SPACE.md }}>
                <Text style={s.editar}>{verUnificar ? "Cerrar" : "Unificar con otra…"}</Text>
              </Pressable>
              {verUnificar ? (
                <View style={[s.card, { marginTop: SPACE.sm }]}>
                  {(materias || []).filter((m) => m.id !== sel?.id && puede(m)).map((m, i) => (
                    <Pressable key={m.id} onPress={() => setUnificarCon(unificarCon?.id === m.id ? null : m)} style={[s.fila, i > 0 && s.borde, { minHeight: 44 }]}>
                      <Text style={[s.filaTxt, s.flex1, { fontWeight: unificarCon?.id === m.id ? "800" : "600" }]}>{m.nombre}</Text>
                      {unificarCon?.id === m.id ? <Text style={s.editar}>✓</Text> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {unificarCon ? <Pressable onPress={unificar} style={[s.btnSec, { marginTop: SPACE.sm }]}><Text style={s.btnSecTxt}>Unificar en “{unificarCon.nombre}”</Text></Pressable> : null}
              <Pressable onPress={async () => { if (await actualizar({ activo: !sel.activo })) setSel(null); }} style={[s.btnSec, { marginTop: SPACE.md }]}>
                <Text style={s.btnSecTxt}>{sel?.activo ? "Ocultar de las listas" : "Volver a mostrar"}</Text>
              </Pressable>
              <Pressable onPress={eliminar} style={[s.btnSec, { marginTop: SPACE.sm, borderColor: t.dangerBorder }]}>
                <Text style={[s.btnSecTxt, { color: t.danger }]}>Eliminar materia</Text>
              </Pressable>
              </> : null}
              <View style={[s.row, { marginTop: SPACE.lg }]}>
                <Pressable onPress={() => setSel(null)} style={[s.btnSec, s.flex1]}><Text style={s.btnSecTxt}>Cancelar</Text></Pressable>
                <Pressable onPress={guardar} style={[s.btnPri, s.flex1]}><Text style={s.btnPriTxt}>{sel?.id ? "Guardar" : "Crear materia"}</Text></Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ── Clases de un curso (en Horarios) ──────────────────────────────────────────

export function ClasesCurso({ curso, colegioId, clases, maestros = [], onCambio }) {
  const { materias } = useMaterias(colegioId);
  const [abierto, setAbierto] = useState(false);
  const [materiaId, setMateriaId] = useState(null);
  const [maestroId, setMaestroId] = useState(null);

  const agregar = async () => {
    if (!materiaId) return;
    const { error } = await supabase.from("clases").insert({ curso_id: curso.id, materia_id: materiaId, maestro_id: maestroId || null });
    if (error) { Alert.alert(error.code === "23505" ? "Esa clase ya existe en el curso" : "No se pudo agregar", error.code === "23505" ? undefined : error.message); return; }
    setMateriaId(null); setMaestroId(null); setAbierto(false); onCambio?.();
  };
  const quitar = (c) => {
    Alert.alert(`¿Quitar “${etiquetaClase(c)}”?`, c._usos ? `Tiene ${c._usos} ${c._usos === 1 ? "bloque" : "bloques"} en el horario: quedan sin clase (se siguen viendo con su texto).` : undefined, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        const { error } = await supabase.from("clases").delete().eq("id", c.id);
        if (error) { Alert.alert("No se pudo quitar la clase"); return; }
        onCambio?.();
      } },
    ]);
  };
  // "Renombrar" una clase = cambiarle la materia (sus horarios pasan a la nueva).
  const [cambiando, setCambiando] = useState(null); // clase cuya materia se está cambiando
  const cambiarMateria = async (c, nueva) => {
    setCambiando(null);
    if (!nueva || nueva === c.materia_id) return;
    const { error } = await supabase.from("clases").update({ materia_id: nueva }).eq("id", c.id);
    if (error) { Alert.alert(error.code === "23505" ? "Ese curso ya tiene esa materia con esa maestra" : "No se pudo cambiar", error.code === "23505" ? undefined : error.message); return; }
    onCambio?.();
  };
  const activas = (materias || []).filter((m) => m.activo && materiaDelNivel(m, curso.nivel));
  return (
    <View style={[s.card, { padding: SPACE.md, marginBottom: SPACE.md }]}>
      <Text style={s.label}>CLASES DE {curso.nombre.toUpperCase()}</Text>
      {!clases.length ? <Text style={s.muted}>Todavía no hay clases. Agregá las materias que se dan y quién las da.</Text> : null}
      {clases.map((c) => (
        <View key={c.id}>
          <View style={s.claseFila}>
            <View style={[s.dot, { backgroundColor: c.materias?.color || SLATE[400] }]} />
            <Text style={[s.filaTxt, s.flex1]} numberOfLines={1}>{etiquetaClase(c)}</Text>
            <Pressable onPress={() => setCambiando(cambiando === c.id ? null : c.id)} hitSlop={8} accessibilityLabel={`Cambiar la materia de ${c.materias?.nombre}`}><Text>✏️</Text></Pressable>
            <Pressable onPress={() => quitar(c)} hitSlop={8} accessibilityLabel={`Quitar ${c.materias?.nombre}`}><MaterialCommunityIcons name="trash-can-outline" size={19} color="#DC2626" /></Pressable>
          </View>
          {cambiando === c.id ? (
            <View style={[s.wrap, { marginBottom: SPACE.sm }]}>
              {activas.map((m) => <Chip key={m.id} label={m.nombre} color={m.color} on={m.id === c.materia_id} onPress={() => cambiarMateria(c, m.id)} />)}
            </View>
          ) : null}
        </View>
      ))}
      {abierto ? (
        <View style={{ marginTop: SPACE.sm }}>
          <Text style={s.label}>Materia</Text>
          <View style={s.wrap}>
            {activas.map((m) => <Chip key={m.id} label={m.nombre} color={m.color} on={materiaId === m.id} onPress={() => setMateriaId(m.id)} />)}
          </View>
          {!activas.length ? <Text style={s.muted}>Primero cargá las materias en Colegio → Materias.</Text> : null}
          <Text style={s.label}>Maestra</Text>
          <View style={s.wrap}>
            <Chip label="Sin maestra" on={!maestroId} onPress={() => setMaestroId(null)} />
            {maestros.map((m) => <Chip key={m.id} label={fmtNombre(m)} on={maestroId === m.id} onPress={() => setMaestroId(m.id)} />)}
          </View>
          <View style={[s.row, { marginTop: SPACE.sm }]}>
            <Pressable onPress={() => setAbierto(false)} style={[s.btnSec, s.flex1]}><Text style={s.btnSecTxt}>Cancelar</Text></Pressable>
            <Pressable onPress={agregar} disabled={!materiaId} style={[s.btnPri, s.flex1, !materiaId && s.off]}><Text style={s.btnPriTxt}>Agregar clase</Text></Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={() => setAbierto(true)} style={[s.btnSec, { marginTop: SPACE.sm }]}><Text style={s.btnSecTxt}>+ Agregar clase</Text></Pressable>
      )}
    </View>
  );
}

// ── Clases de una maestra (ficha) ─────────────────────────────────────────────

export function ClasesMaestroEditor({ colegioId, cursos, value, onChange }) {
  const { materias } = useMaterias(colegioId);
  const [cursoId, setCursoId] = useState(null);
  const porId = useMemo(() => Object.fromEntries((materias || []).map((m) => [m.id, m])), [materias]);
  const nombreCurso = useMemo(() => Object.fromEntries((cursos || []).map((c) => [c.id, c.nombre])), [cursos]);
  const nivelCurso = (cursos || []).find((c) => c.id === cursoId)?.nivel || null;
  const activas = (materias || []).filter((m) => m.activo && materiaDelNivel(m, nivelCurso));
  const toggle = (materiaId) => {
    if (!cursoId) return;
    const existe = value.find((v) => v.curso_id === cursoId && v.materia_id === materiaId);
    onChange(existe ? value.filter((v) => v !== existe) : [...value, { curso_id: cursoId, materia_id: materiaId }]);
  };
  return (
    <View>
      {!value.length ? <Text style={s.muted}>Sin clases asignadas.</Text> : (
        <View style={s.wrap}>
          {value.map((v) => (
            <Chip key={`${v.curso_id}-${v.materia_id}`} label={`${porId[v.materia_id]?.nombre || "…"} · ${nombreCurso[v.curso_id] || "otro año"}  ✕`}
              color={porId[v.materia_id]?.color} on onPress={() => onChange(value.filter((x) => x !== v))} />
          ))}
        </View>
      )}
      <Text style={s.label}>Agregar: elegí el curso…</Text>
      <View style={s.wrap}>
        {(cursos || []).map((c) => <Chip key={c.id} label={c.nombre} on={cursoId === c.id} onPress={() => setCursoId(c.id)} />)}
      </View>
      {cursoId ? (
        <>
          <Text style={s.label}>…y las materias que da ahí</Text>
          <View style={s.wrap}>
            {activas.map((m) => (
              <Chip key={m.id} label={m.nombre} color={m.color} on={value.some((v) => v.curso_id === cursoId && v.materia_id === m.id)} onPress={() => toggle(m.id)} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  intro: { fontSize: 13, color: t.textMuted, lineHeight: 19, marginBottom: SPACE.md },
  muted: { fontSize: 13, color: t.textMuted, marginVertical: SPACE.xs },
  row: { flexDirection: "row", gap: SPACE.sm, alignItems: "center", marginBottom: SPACE.md },
  flex1: { flex: 1 },
  off: { opacity: 0.5 },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: 10, fontSize: 15, color: t.text, backgroundColor: t.surfaceSunken },
  card: { backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.md, minHeight: MIN_TOUCH + 4 },
  borde: { borderTopWidth: 1, borderTopColor: t.border },
  filaTxt: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  meta: { fontSize: 12.5, color: t.textMuted, marginTop: 1 },
  editar: { fontSize: 14, fontWeight: "700", color: t.accent },
  claseFila: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: 36 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotGrande: { width: 14, height: 14, borderRadius: 7 },
  label: { fontSize: 12.5, fontWeight: "600", color: t.textMuted, marginTop: SPACE.md, marginBottom: 6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 36, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  chipTxt: { fontSize: 13, color: SLATE[600], fontWeight: "600" },
  chipTxtOn: { color: t.accent },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorOn: { borderWidth: 3, borderColor: t.textStrong },
  btnPri: { backgroundColor: t.accent, borderRadius: RADIUS.lg, minHeight: MIN_TOUCH, paddingHorizontal: SPACE.lg, alignItems: "center", justifyContent: "center" },
  btnPriTxt: { color: "white", fontWeight: "700", fontSize: 14 },
  btnSec: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.lg, minHeight: MIN_TOUCH, paddingHorizontal: SPACE.lg, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  btnSecTxt: { color: SLATE[700], fontWeight: "700", fontSize: 14 },
  overlay: { flex: 1, backgroundColor: t.overlay, justifyContent: "center", padding: SPACE.xl },
  modalCard: { backgroundColor: t.surface, borderRadius: RADIUS.xl, padding: SPACE.lg, maxHeight: "88%" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: t.textStrong },
});
