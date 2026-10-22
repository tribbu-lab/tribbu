// Editor del horario semanal de un curso (mobile). Port del web
// (src/features/superadmin/horarios.jsx) con las mismas reglas
// (@shared/horarios): bloque en varios días, alcance al editar una serie,
// buscador de clase, crear clase ahí mismo, talleres optativos con alumnos,
// copiar un día y copiar de otro curso. Lo usan el panel del colegio
// (puedeEditarClases) y el Admin del Room Parent (solo bloques).
//
// En el teléfono la semana va por pestañas de día (una grilla de 5–6 columnas
// no entra). iOS no apila Modals: el borrador del bloque vive acá y las hojas
// se abren de a una (se cierra una y se abre la otra a los 350 ms).
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { fmtNombre, sanitize } from "@shared/helpers";
import { materiaDelNivel } from "@shared/niveles";
import { THEMES, SLATE, BLUE, SPACE, RADIUS, MIN_TOUCH } from "@shared/tokens";
import {
  DIAS_HORARIO, DIAS_HABILES, DIA_CORTO, normalizarDia, aMin, deMin, hhmm, validarBloque, superposiciones,
  serieDe, planGuardarBloque, planCopiarDia, planCopiarCurso, diasVisibles,
} from "@shared/horarios";
import { Sheet } from "../../components/Sheet";
import { PALETA_MATERIAS, useMaterias, cargarClasesCurso, etiquetaClase } from "../superadmin/clases";

const t = THEMES.light;
const DUR_DEFAULT = 40;
const ESPERA_SHEET = 350;
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// "18", "1830", "18:5" → "18:30"/"18:05"; inválido → null
function normalizarHora(v) {
  const m = String(v || "").trim().match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] || 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

async function aplicarPlan({ actualizar = [], insertar = [], borrar = [] }) {
  const res = await Promise.all([
    ...actualizar.map((u) => supabase.from("horarios").update(u.datos).eq("id", u.id)),
    insertar.length ? supabase.from("horarios").insert(insertar) : { error: null },
    borrar.length ? supabase.from("horarios").delete().in("id", borrar) : { error: null },
  ]);
  return res.find((r) => r.error)?.error || null;
}

function Chip({ label, on, onPress, color, dashed, small }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={[s.chip, small && s.chipSmall, on && s.chipOn, dashed && { borderStyle: "dashed", borderColor: t.accent }]}>
      {color ? <View style={[s.dot, { backgroundColor: color }]} /> : null}
      <Text style={[s.chipTxt, on && s.chipTxtOn, dashed && { color: t.accent }]}>{label}</Text>
    </Pressable>
  );
}

function PillsDias({ dias, setDias, mostrar }) {
  const toggle = (d) => setDias(dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d]);
  return (
    <View>
      <View style={s.wrap}>{mostrar.map((d) => <Chip key={d} label={DIA_CORTO[d]} on={dias.includes(d)} onPress={() => toggle(d)} />)}</View>
      <View style={[s.row, { marginTop: 6, gap: SPACE.lg }]}>
        {[["Lun a Vie", DIAS_HABILES], ["Todos", mostrar], ["Ninguno", []]].map(([l, v]) => (
          <Pressable key={l} onPress={() => setDias(v)} hitSlop={6}><Text style={s.link}>{l}</Text></Pressable>
        ))}
      </View>
    </View>
  );
}

// ── Hoja: bloque ────────────────────────────────────────────────────────────

function BloqueSheet({ visible, borrador, setBorrador, curso, horarios, clases, conSabado, onClose, onGuardado, onCrearClase }) {
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  if (!borrador) return null;
  const { dias, ini, fin, claseId, alcance } = borrador;
  const set = (p) => { setBorrador((b) => ({ ...b, ...p })); setError(""); };
  const mostrar = conSabado || dias.includes("Sábado") ? DIAS_HORARIO : DIAS_HABILES;
  const choques = superposiciones(horarios, { dias, hora_inicio: ini, hora_fin: fin }, alcance.map((h) => h.id));
  const filtradas = clases.filter((c) => !q || sinAcentos(etiquetaClase(c)).includes(sinAcentos(q)));

  const guardar = async () => {
    const a = normalizarHora(ini) || ini, b = normalizarHora(fin) || fin;
    const err = validarBloque({ dias, hora_inicio: a, hora_fin: b, clase_id: claseId });
    if (err) { setError(err); return; }
    setGuardando(true);
    const e = await aplicarPlan(planGuardarBloque({ alcance, dias, hora_inicio: a, hora_fin: b, clase_id: claseId, curso_id: curso.id }));
    setGuardando(false);
    if (e) { setError(`No se pudo guardar: ${e.message}`); return; }
    setQ(""); onGuardado();
  };
  const quitar = () => {
    Alert.alert(alcance.length > 1 ? `¿Quitar este bloque de ${alcance.length} días?` : "¿Quitar este bloque del horario?",
      `${alcance.map((h) => DIA_CORTO[normalizarDia(h.dia)]).join(", ")} ${hhmm(alcance[0].hora_inicio)} a ${hhmm(alcance[0].hora_fin)}`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Quitar", style: "destructive", onPress: async () => {
          const e = await aplicarPlan({ borrar: alcance.map((h) => h.id) });
          if (e) { Alert.alert("No se pudo quitar", e.message); return; }
          onGuardado();
        } },
      ]);
  };

  return (
    <Sheet visible={visible} onClose={() => { setQ(""); onClose(); }} title={alcance.length ? "Editar bloque" : "Agregar al horario"}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <Text style={s.label}>Días</Text>
        <PillsDias dias={dias} setDias={(v) => set({ dias: v })} mostrar={mostrar} />

        <View style={[s.row, { marginTop: SPACE.md }]}>
          <View style={s.flex1}>
            <Text style={s.label}>Empieza</Text>
            <TextInput value={ini} onChangeText={(v) => set({ ini: v })} onBlur={() => { const n = normalizarHora(ini); if (n) set({ ini: n }); }}
              placeholder="08:00" placeholderTextColor={t.placeholder} keyboardType="numbers-and-punctuation" style={s.input} accessibilityLabel="Hora de inicio" />
          </View>
          <View style={s.flex1}>
            <Text style={s.label}>Termina</Text>
            <TextInput value={fin} onChangeText={(v) => set({ fin: v })} onBlur={() => { const n = normalizarHora(fin); if (n) set({ fin: n }); }}
              placeholder="08:40" placeholderTextColor={t.placeholder} keyboardType="numbers-and-punctuation" style={s.input} accessibilityLabel="Hora de fin" />
          </View>
        </View>
        <View style={[s.wrap, { marginTop: 6 }]}>
          {[30, 40, 45, 60, 80, 90].map((m) => {
            const a = aMin(normalizarHora(ini));
            return <Chip key={m} small label={`${m} min`} on={a != null && aMin(normalizarHora(fin)) - a === m} onPress={() => { if (a != null) set({ ini: deMin(a), fin: deMin(a + m) }); }} />;
          })}
        </View>

        <Text style={[s.label, { marginTop: SPACE.md }]}>Clase</Text>
        {alcance.length && !alcance[0].clase_id ? (
          <Text style={[s.aviso, { marginTop: 0, marginBottom: 8 }]}>
            Este bloque es de antes de las clases: dice “{[alcance[0].materia, alcance[0].docente].filter(Boolean).join(" · ")}” pero no está ligado a ninguna clase. Elegí la clase que corresponde (o creala) o tocá Quitar.
          </Text>
        ) : null}
        <TextInput value={q} onChangeText={setQ} placeholder="Buscar materia o maestra…" placeholderTextColor={t.placeholder} style={s.input} accessibilityLabel="Buscar clase" />
        <View style={s.lista}>
          {!filtradas.length ? <Text style={s.muted}>No hay clases con “{q}”.</Text> : null}
          {filtradas.map((c) => {
            const on = c.id === claseId;
            return (
              <Pressable key={c.id} onPress={() => set({ claseId: c.id })} style={[s.claseFila, on && s.claseFilaOn]} accessibilityRole="button" accessibilityState={{ selected: on }}>
                <View style={[s.dot, { backgroundColor: c.materias?.color || SLATE[400] }]} />
                <Text style={[s.flex1, s.claseTxt]} numberOfLines={1}>
                  <Text style={{ fontWeight: "800", color: t.textStrong }}>{c.materias?.nombre}</Text>
                  <Text style={{ color: t.textMuted }}>{c.maestros ? ` · ${fmtNombre(c.maestros)}` : " · sin maestra"}</Text>
                </Text>
                {c.optativa ? <Text style={s.taller}>TALLER</Text> : null}
                {on ? <Text style={{ color: t.accent, fontWeight: "800" }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {onCrearClase ? <Pressable onPress={() => onCrearClase(q)} hitSlop={6}><Text style={[s.link, { marginTop: 8 }]}>+ Crear una clase nueva{q ? ` (“${q}”)` : ""}</Text></Pressable> : null}

        {choques.length ? (
          <Text style={s.aviso}>
            Se superpone con {choques.slice(0, 3).map((h) => `${h.materia} (${DIA_CORTO[normalizarDia(h.dia)]} ${hhmm(h.hora_inicio)})`).join(", ")}{choques.length > 3 ? ` y ${choques.length - 3} más` : ""}. Si es un taller optativo puede estar bien.
          </Text>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={[s.row, { marginTop: SPACE.lg }]}>
          {alcance.length ? <Pressable onPress={quitar} style={[s.btnSec, { borderColor: t.dangerBorder }]}><Text style={[s.btnSecTxt, { color: t.danger }]}>Quitar</Text></Pressable> : null}
          <Pressable onPress={guardar} disabled={guardando} style={[s.btnPri, s.flex1, guardando && { opacity: 0.6 }]}>
            <Text style={s.btnPriTxt}>{guardando ? "Guardando…" : dias.length > 1 ? `Guardar en ${dias.length} días` : "Guardar"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

// ── Hoja: clase (materia + maestra + taller) ────────────────────────────────

// Fila de una lista de opciones: nombre y ✓ en la elegida.
function Opcion({ label, on, primera, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.opcion, !primera && s.opcionBorde]} accessibilityRole="radio" accessibilityState={{ selected: !!on }}>
      <Text style={[s.opcionTxt, on && s.opcionTxtOn]} numberOfLines={1}>{label}</Text>
      {on ? <Text style={s.opcionTxtOn}>✓</Text> : null}
    </Pressable>
  );
}

function ClaseSheet({ visible, curso, colegioId, clase, textoInicial, maestros, usos, onClose, onGuardada }) {
  const { materias, recargar } = useMaterias(colegioId);
  const [materiaId, setMateriaId] = useState(clase?.materia_id || "");
  const [qMat, setQMat] = useState(clase ? "" : textoInicial || "");
  const [maestroId, setMaestroId] = useState(clase?.maestro_id || "");
  const [qMae, setQMae] = useState("");
  const [optativa, setOptativa] = useState(!!clase?.optativa);
  const [alumnos, setAlumnos] = useState(null);
  const [anotados, setAnotados] = useState(new Set());
  const [orig, setOrig] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [al, an] = await Promise.all([
        supabase.from("hijos").select("id,nombre,apellido").eq("curso_id", curso.id).order("nombre"),
        clase ? supabase.from("clase_alumnos").select("hijo_id").eq("clase_id", clase.id) : { data: [] },
      ]);
      if (!vivo) return;
      const st = new Set((an.data || []).map((r) => r.hijo_id));
      setAlumnos(al.data || []); setAnotados(st); setOrig(new Set(st));
    })();
    return () => { vivo = false; };
  }, [curso.id, clase]);

  const activas = (materias || []).filter((m) => (m.activo && materiaDelNivel(m, curso?.nivel)) || m.id === materiaId);
  const matF = activas.filter((m) => !qMat || sinAcentos(m.nombre).includes(sinAcentos(qMat)));
  const existe = activas.some((m) => sinAcentos(m.nombre) === sinAcentos(qMat));
  const maeF = maestros.filter((m) => !qMae || sinAcentos(fmtNombre(m)).includes(sinAcentos(qMae)));

  const crearMateria = async () => {
    const nombre = sanitize(qMat).trim();
    if (!nombre) return;
    const { data, error: e } = await supabase.from("materias")
      .insert({ colegio_id: colegioId, nombre, color: PALETA_MATERIAS[(materias?.length || 0) % PALETA_MATERIAS.length], orden: (materias?.length || 0) + 1, nivel: curso?.nivel || null })
      .select("id").single();
    if (e) { setError(`No se pudo crear la materia: ${e.message}`); return; }
    await recargar(); setMateriaId(data.id); setQMat("");
  };
  const guardar = async () => {
    if (!materiaId) { setError("Elegí la materia."); return; }
    if (optativa && !anotados.size) { setError("Anotá al menos un alumno en el taller (o desactivá “optativo”)."); return; }
    setGuardando(true); setError("");
    const datos = { curso_id: curso.id, materia_id: materiaId, maestro_id: maestroId || null, optativa };
    const r = clase
      ? await supabase.from("clases").update(datos).eq("id", clase.id).select("id").single()
      : await supabase.from("clases").insert(datos).select("id").single();
    if (r.error) { setGuardando(false); setError(r.error.code === "23505" ? "Ese curso ya tiene esa materia con esa maestra." : `No se pudo guardar: ${r.error.message}`); return; }
    const id = r.data.id;
    const quedan = optativa ? anotados : new Set();
    const sacar = [...orig].filter((h) => !quedan.has(h));
    const poner = [...quedan].filter((h) => !orig.has(h));
    const ops = await Promise.all([
      sacar.length ? supabase.from("clase_alumnos").delete().eq("clase_id", id).in("hijo_id", sacar) : { error: null },
      poner.length ? supabase.from("clase_alumnos").insert(poner.map((h) => ({ clase_id: id, hijo_id: h }))) : { error: null },
    ]);
    setGuardando(false);
    const e2 = ops.find((o) => o.error)?.error;
    if (e2) { setError(`La clase se guardó, pero no la lista de alumnos: ${e2.message}`); return; }
    onGuardada({ id });
  };
  const eliminar = () => {
    Alert.alert(`¿Quitar “${etiquetaClase(clase)}”?`, usos ? `Está en ${usos} ${usos === 1 ? "bloque" : "bloques"} del horario: quedan con su texto, sin clase.` : "No está en el horario.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: async () => {
        const { error: e } = await supabase.from("clases").delete().eq("id", clase.id);
        if (e) { Alert.alert("No se pudo quitar", e.message); return; }
        onGuardada(null);
      } },
    ]);
  };
  const toggleAl = (id) => setAnotados((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Sheet visible={visible} onClose={onClose} title={clase ? "Editar clase" : "Nueva clase"}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
        <Text style={s.label}>Materia</Text>
        <TextInput value={qMat} onChangeText={setQMat} placeholder={materiaId ? activas.find((m) => m.id === materiaId)?.nombre : "Buscar o escribir una materia nueva…"} placeholderTextColor={t.placeholder} style={s.input} />
        {/* Lista simple de nombres (antes, pastillas de colores). */}
        <View style={s.opciones}>
          {matF.slice(0, 8).map((m, i) => (
            <Opcion key={m.id} label={m.nombre} on={m.id === materiaId} primera={i === 0} onPress={() => { setMateriaId(m.id); setQMat(""); setError(""); }} />
          ))}
          {matF.length > 8 ? <Text style={[s.muted, { paddingHorizontal: SPACE.md, paddingVertical: 8 }]}>Escribí para ver más…</Text> : null}
        </View>
        {qMat.trim() && !existe ? (
          <Pressable onPress={crearMateria} hitSlop={6} style={{ marginTop: 8 }}><Text style={s.link}>+ Crear la materia “{qMat.trim()}”</Text></Pressable>
        ) : null}

        <Text style={[s.label, { marginTop: SPACE.md }]}>Maestra</Text>
        <TextInput value={qMae} onChangeText={setQMae} placeholder="Buscar maestra…" placeholderTextColor={t.placeholder} style={s.input} />
        <View style={s.opciones}>
          <Opcion label="Sin maestra (recreo, almuerzo…)" on={!maestroId} primera onPress={() => setMaestroId("")} />
          {maeF.slice(0, 8).map((m) => <Opcion key={m.id} label={fmtNombre(m)} on={maestroId === m.id} onPress={() => setMaestroId(m.id)} />)}
          {maeF.length > 8 ? <Text style={[s.muted, { paddingHorizontal: SPACE.md, paddingVertical: 8 }]}>Escribí para ver más…</Text> : null}
        </View>

        <View style={[s.optativa, optativa && s.optativaOn]}>
          <View style={s.flex1}>
            <Text style={s.optTitulo}>Es un taller optativo</Text>
            <Text style={s.muted}>Solo lo hacen algunos alumnos. Cada familia lo ve si su hijo está anotado.</Text>
          </View>
          <Switch value={optativa} onValueChange={setOptativa} accessibilityLabel="Taller optativo" />
        </View>
        {optativa ? (
          <View style={{ marginTop: 8 }}>
            <View style={s.row}>
              <Text style={[s.label, s.flex1, { marginBottom: 0 }]}>Anotados · {anotados.size}</Text>
              <Pressable onPress={() => setAnotados(new Set((alumnos || []).map((a) => a.id)))} hitSlop={6}><Text style={s.link}>Todos</Text></Pressable>
              <Pressable onPress={() => setAnotados(new Set())} hitSlop={6}><Text style={s.link}>Ninguno</Text></Pressable>
            </View>
            {alumnos === null ? <ActivityIndicator color={t.accent} /> : null}
            {alumnos && !alumnos.length ? <Text style={s.muted}>Este curso no tiene alumnos cargados.</Text> : null}
            {(alumnos || []).map((a) => (
              <Pressable key={a.id} onPress={() => toggleAl(a.id)} style={s.alumnoFila} accessibilityRole="checkbox" accessibilityState={{ checked: anotados.has(a.id) }}>
                <View style={[s.check, anotados.has(a.id) && s.checkOn]}>{anotados.has(a.id) ? <Text style={s.checkTxt}>✓</Text> : null}</View>
                <Text style={s.claseTxt}>{fmtNombre(a)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        <View style={[s.row, { marginTop: SPACE.lg }]}>
          {clase ? <Pressable onPress={eliminar} style={[s.btnSec, { borderColor: t.dangerBorder }]}><Text style={[s.btnSecTxt, { color: t.danger }]}>Quitar</Text></Pressable> : null}
          <Pressable onPress={guardar} disabled={guardando} style={[s.btnPri, s.flex1, guardando && { opacity: 0.6 }]}>
            <Text style={s.btnPriTxt}>{guardando ? "Guardando…" : "Guardar clase"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

// ── Hojas: atajos ───────────────────────────────────────────────────────────

function CopiarDiaSheet({ visible, horarios, dias, onClose, onHecho }) {
  const conBloques = dias.filter((d) => horarios.some((h) => normalizarDia(h.dia) === d));
  const [origen, setOrigen] = useState(conBloques[0] || "Lunes");
  const [destinos, setDestinos] = useState([]);
  const [reemplazar, setReemplazar] = useState(false);
  const plan = planCopiarDia(horarios, origen, destinos, { reemplazar });
  const copiar = async () => {
    const e = await aplicarPlan(plan);
    if (e) { Alert.alert("No se pudo copiar", e.message); return; }
    setDestinos([]); onHecho();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Copiar un día a otros">
      <ScrollView style={{ flexShrink: 1 }}>
        <Text style={s.label}>Copiar el</Text>
        <View style={s.wrap}>{conBloques.map((d) => <Chip key={d} label={d} on={origen === d} onPress={() => { setOrigen(d); setDestinos((x) => x.filter((y) => y !== d)); }} />)}</View>
        <Text style={[s.label, { marginTop: SPACE.md }]}>A estos días</Text>
        <PillsDias dias={destinos} setDias={(v) => setDestinos(v.filter((d) => d !== origen))} mostrar={dias.filter((d) => d !== origen)} />
        <View style={[s.row, { marginTop: SPACE.md }]}>
          <Text style={[s.flex1, s.claseTxt]}>Borrar lo que ya hay en esos días antes de copiar</Text>
          <Switch value={reemplazar} onValueChange={setReemplazar} />
        </View>
        {destinos.length ? <Text style={[s.muted, { marginTop: 8 }]}>{plan.insertar.length} bloques nuevos{plan.borrar.length ? `, ${plan.borrar.length} se reemplazan` : ""}</Text> : null}
        <Pressable onPress={copiar} disabled={!destinos.length} style={[s.btnPri, { marginTop: SPACE.lg }, !destinos.length && { opacity: 0.5 }]}><Text style={s.btnPriTxt}>Copiar</Text></Pressable>
      </ScrollView>
    </Sheet>
  );
}

function CopiarCursoSheet({ visible, curso, cursos, horarios, clases, onClose, onHecho }) {
  const [origenId, setOrigenId] = useState("");
  const [datos, setDatos] = useState(null);
  const [reemplazar, setReemplazar] = useState(false); // borrar lo actual tiene que ser una decisión explícita
  const [copiando, setCopiando] = useState(false);
  useEffect(() => {
    if (!origenId) return;
    let vivo = true;
    Promise.all([supabase.from("horarios").select("*").eq("curso_id", origenId), cargarClasesCurso(origenId)])
      .then(([h, cl]) => { if (vivo) setDatos({ horarios: h.data || [], clases: cl }); });
    return () => { vivo = false; };
  }, [origenId]);
  const clave = (c) => `${c.materia_id}|${c.maestro_id || ""}`;
  const faltan = datos ? datos.clases.filter((c) => !clases.some((d) => clave(d) === clave(c)) && datos.horarios.some((h) => h.clase_id === c.id)) : [];
  const copiar = async () => {
    setCopiando(true);
    const dest = new Map(clases.map((c) => [clave(c), c.id]));
    if (faltan.length) {
      const { data, error } = await supabase.from("clases").insert(faltan.map((c) => ({ curso_id: curso.id, materia_id: c.materia_id, maestro_id: c.maestro_id, optativa: !!c.optativa }))).select("id,materia_id,maestro_id");
      if (error) { setCopiando(false); Alert.alert("No se pudieron crear las clases", error.message); return; }
      for (const c of data) dest.set(clave(c), c.id);
    }
    const porId = new Map(datos.clases.map((c) => [c.id, c]));
    const plan = planCopiarCurso(datos.horarios, horarios, curso.id, (h) => { const c = porId.get(h.clase_id); return c ? dest.get(clave(c)) : undefined; }, { reemplazar });
    const e = await aplicarPlan(plan);
    setCopiando(false);
    if (e) { Alert.alert("No se pudo copiar", e.message); return; }
    setOrigenId(""); setDatos(null); onHecho(plan.insertar.length);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={`Copiar a ${curso.nombre}`}>
      <ScrollView style={{ flexShrink: 1 }}>
        <Text style={s.label}>Desde</Text>
        <View style={s.wrap}>{cursos.filter((c) => c.id !== curso.id).map((c) => <Chip key={c.id} label={c.nombre} on={origenId === c.id} onPress={() => { setOrigenId(c.id); setDatos(null); }} />)}</View>
        {origenId && !datos ? <ActivityIndicator color={t.accent} style={{ marginTop: 8 }} /> : null}
        {datos ? (
          <Text style={[s.claseTxt, { marginTop: SPACE.md }]}>
            {!datos.horarios.length ? "Ese curso no tiene horario cargado." : `Se copian ${datos.horarios.length} bloques.${faltan.length ? ` Se crean las clases que faltan: ${faltan.map(etiquetaClase).join(", ")}.` : ""} Los talleres se copian sin alumnos.`}
          </Text>
        ) : null}
        <View style={[s.row, { marginTop: SPACE.md }]}>
          <Text style={[s.flex1, s.claseTxt]}>Borrar el horario actual antes de copiar{horarios.length ? ` (${horarios.length} bloques)` : ""}</Text>
          <Switch value={reemplazar} onValueChange={setReemplazar} />
        </View>
        <Pressable onPress={copiar} disabled={!datos?.horarios.length || copiando} style={[s.btnPri, { marginTop: SPACE.lg }, (!datos?.horarios.length || copiando) && { opacity: 0.5 }]}>
          <Text style={s.btnPriTxt}>{copiando ? "Copiando…" : "Copiar"}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────

const HOY = ["Domingo", ...DIAS_HORARIO][new Date().getDay()];

export function HorarioCurso({ curso, colegioId, cursos = [], maestros = [], puedeEditarClases = true }) {
  const [horarios, setHorarios] = useState(null);
  const [clases, setClases] = useState([]);
  const [anotadosPorClase, setAnotadosPorClase] = useState({});
  const [conSabado, setConSabado] = useState(false);
  const [dia, setDia] = useState(DIAS_HABILES.includes(HOY) ? HOY : "Lunes");
  const [hoja, setHoja] = useState(null); // "bloque" | "clase" | "copiarDia" | "copiarCurso"
  const [borrador, setBorrador] = useState(null);
  const [claseEd, setClaseEd] = useState(null); // { clase?, texto?, volverABloque? }

  const cargar = useCallback(async () => {
    const [hor, cls] = await Promise.all([
      supabase.from("horarios").select("*").eq("curso_id", curso.id).order("hora_inicio"),
      cargarClasesCurso(curso.id),
    ]);
    const opt = cls.filter((c) => c.optativa).map((c) => c.id);
    const an = opt.length ? await supabase.from("clase_alumnos").select("clase_id").in("clase_id", opt) : { data: [] };
    const n = {};
    for (const r of an.data || []) n[r.clase_id] = (n[r.clase_id] || 0) + 1;
    setHorarios(hor.data || []); setClases(cls); setAnotadosPorClase(n);
  }, [curso.id]);
  useEffect(() => { Promise.resolve().then(cargar); }, [cargar]); // se monta con key=curso.id

  const optativas = useMemo(() => new Set(clases.filter((c) => c.optativa).map((c) => c.id)), [clases]);
  const usos = useMemo(() => { const u = {}; for (const h of horarios || []) if (h.clase_id) u[h.clase_id] = (u[h.clase_id] || 0) + 1; return u; }, [horarios]);

  if (horarios === null) return <ActivityIndicator color={t.accent} style={{ marginTop: SPACE.lg }} />;
  const dias = diasVisibles(horarios, conSabado);
  const delDia = horarios.filter((h) => normalizarDia(h.dia) === dia).sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio));

  const cerrarYAbrir = (siguiente) => { setHoja(null); setTimeout(siguiente, ESPERA_SHEET); };
  const nuevo = () => {
    const ult = delDia[delDia.length - 1];
    const ini = ult ? hhmm(ult.hora_fin) : "08:00";
    setBorrador({ dias: [dia], ini, fin: deMin(aMin(ini) + DUR_DEFAULT), claseId: "", alcance: [] });
    setHoja("bloque");
  };
  const editar = (h, alcance) => {
    setBorrador({ dias: alcance.map((x) => normalizarDia(x.dia)), ini: hhmm(h.hora_inicio), fin: hhmm(h.hora_fin), claseId: h.clase_id || "", alcance });
    setHoja("bloque");
  };
  const abrirBloque = (h) => {
    const serie = serieDe(horarios, h);
    if (serie.length < 2) { editar(h, [h]); return; }
    Alert.alert(`${h.materia} · ${hhmm(h.hora_inicio)}`, `Está los ${serie.map((x) => DIA_CORTO[normalizarDia(x.dia)]).join(", ")} a la misma hora. ¿Qué querés editar?`, [
      { text: `Todos los días (${serie.length})`, onPress: () => editar(h, serie) },
      { text: `Solo el ${normalizarDia(h.dia).toLowerCase()}`, onPress: () => editar(h, [h]) },
      { text: "Cancelar", style: "cancel" },
    ]);
  };
  const refrescar = () => { setHoja(null); setBorrador(null); cargar(); };

  return (
    <View>
      {/* Clases */}
      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.label, s.flex1, { marginBottom: 0 }]}>Clases de {curso.nombre} · {clases.length}</Text>
          {puedeEditarClases ? <Pressable onPress={() => { setClaseEd({}); setHoja("clase"); }} hitSlop={6}><Text style={s.link}>+ Nueva</Text></Pressable> : null}
        </View>
        {!clases.length ? <Text style={[s.muted, { marginTop: 6 }]}>{puedeEditarClases ? "Todavía no hay clases. Creá las materias que se dan y quién las da (también Recreo y Almuerzo, sin maestra)." : "El colegio todavía no cargó las clases de este curso."}</Text> : null}
        {/* Lista sin pastillas: materia en negrita; maestra y bloques en gris. */}
        <View style={{ marginTop: 4 }}>
          {clases.map((c, i) => (
            <Pressable key={c.id} disabled={!puedeEditarClases} onPress={() => { setClaseEd({ clase: c }); setHoja("clase"); }} style={[s.claseListaFila, i > 0 && s.opcionBorde]}>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: t.textStrong }}>{c.materias?.nombre}{c.optativa ? <Text style={{ fontWeight: "600", color: t.textMuted }}>{` · taller optativo (${anotadosPorClase[c.id] || 0})`}</Text> : null}</Text>
              <Text style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>
                {c.maestros ? fmtNombre(c.maestros) : "Sin maestra"}{" · "}
                <Text style={{ color: usos[c.id] ? t.textMuted : "#B45309" }}>{usos[c.id] ? `${usos[c.id]} ${usos[c.id] === 1 ? "bloque" : "bloques"}` : "todavía no está en el horario"}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Atajos */}
      <View style={[s.wrap, { marginBottom: SPACE.sm }]}>
        <Pressable onPress={nuevo} disabled={!clases.length} style={[s.btnPri, !clases.length && { opacity: 0.5 }]}><Text style={s.btnPriTxt}>+ Agregar</Text></Pressable>
        {horarios.length ? <Pressable onPress={() => setHoja("copiarDia")} style={s.btnSec}><Text style={s.btnSecTxt}>Copiar día</Text></Pressable> : null}
        {puedeEditarClases && cursos.length > 1 ? <Pressable onPress={() => setHoja("copiarCurso")} style={s.btnSec}><Text style={s.btnSecTxt}>De otro curso</Text></Pressable> : null}
      </View>

      {/* Días */}
      <View style={s.tabs}>
        {dias.map((d) => {
          const n = horarios.filter((h) => normalizarDia(h.dia) === d).length;
          return (
            <Pressable key={d} onPress={() => setDia(d)} style={[s.tab, dia === d && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: dia === d }}>
              <Text style={[s.tabTxt, dia === d && s.tabTxtOn]}>{DIA_CORTO[d]}</Text>
              <Text style={[s.tabN, dia === d && s.tabTxtOn]}>{n || "–"}</Text>
            </Pressable>
          );
        })}
        {!dias.includes("Sábado") ? <Pressable onPress={() => { setConSabado(true); setDia("Sábado"); }} style={s.tab}><Text style={s.tabTxt}>+Sáb</Text></Pressable> : null}
      </View>

      {!delDia.length ? <Text style={[s.muted, { textAlign: "center", marginVertical: SPACE.lg }]}>Nada cargado el {dia.toLowerCase()}.</Text> : null}
      {delDia.map((h) => {
        const opt = h.clase_id && optativas.has(h.clase_id);
        const col = h.color || "#3B82F6";
        return (
          <Pressable key={h.id} onPress={() => abrirBloque(h)} style={[s.bloque, { borderLeftColor: col }, opt && { borderStyle: "dashed" }]} accessibilityRole="button">
            <Text style={s.bloqueHora}>{hhmm(h.hora_inicio)}{"\n"}<Text style={s.bloqueHoraFin}>{hhmm(h.hora_fin)}</Text></Text>
            <View style={s.flex1}>
              <Text style={s.bloqueMat}>{opt ? "✦ " : ""}{h.materia}</Text>
              {h.docente ? <Text style={s.muted}>{h.docente}</Text> : null}
              {!h.clase_id ? <Text style={s.sinClase}>Sin clase asignada · tocá para elegirla</Text> : null}
            </View>
            <Text style={{ color: t.textFaint }}>›</Text>
          </Pressable>
        );
      })}

      <BloqueSheet visible={hoja === "bloque"} borrador={borrador} setBorrador={setBorrador} curso={curso} horarios={horarios} clases={clases}
        conSabado={dias.includes("Sábado")} onClose={() => setHoja(null)} onGuardado={refrescar}
        onCrearClase={puedeEditarClases ? (q) => cerrarYAbrir(() => { setClaseEd({ texto: q, volverABloque: true }); setHoja("clase"); }) : null} />
      {hoja === "clase" && claseEd ? (
        <ClaseSheet visible curso={curso} colegioId={colegioId} clase={claseEd.clase} textoInicial={claseEd.texto} maestros={maestros} usos={claseEd.clase ? usos[claseEd.clase.id] || 0 : 0}
          onClose={() => { const volver = claseEd.volverABloque; setClaseEd(null); if (volver) cerrarYAbrir(() => setHoja("bloque")); else setHoja(null); }}
          onGuardada={async (r) => {
            const volver = claseEd.volverABloque;
            setClaseEd(null);
            const cls = await cargarClasesCurso(curso.id);
            setClases(cls);
            if (volver) { if (r) setBorrador((b) => ({ ...b, claseId: r.id })); cerrarYAbrir(() => setHoja("bloque")); }
            else { setHoja(null); cargar(); }
          }} />
      ) : null}
      {hoja === "copiarDia" ? <CopiarDiaSheet visible horarios={horarios} dias={dias} onClose={() => setHoja(null)} onHecho={refrescar} /> : null}
      {hoja === "copiarCurso" ? <CopiarCursoSheet visible curso={curso} cursos={cursos} horarios={horarios} clases={clases} onClose={() => setHoja(null)} onHecho={(n) => { refrescar(); Alert.alert("Listo", `${n} bloques copiados`); }} /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  flex1: { flex: 1 },
  label: { fontSize: 12.5, fontWeight: "600", color: t.textMuted, marginBottom: 6 },
  muted: { fontSize: 12.5, color: t.textMuted },
  link: { fontSize: 13, fontWeight: "700", color: t.accent },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: 12, minHeight: MIN_TOUCH, fontSize: 14, color: t.text, backgroundColor: t.surfaceSunken },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 38, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipSmall: { minHeight: 32, paddingHorizontal: 10 },
  chipOn: { backgroundColor: t.textStrong, borderColor: t.textStrong },
  chipTxt: { fontSize: 13, fontWeight: "700", color: SLATE[600] },
  chipTxtOn: { color: "#fff" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  lista: { marginTop: 8, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, padding: 4 },
  claseFila: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, minHeight: 42, borderRadius: 9, borderWidth: 1.5, borderColor: "transparent" },
  claseFilaOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  claseTxt: { fontSize: 13.5, color: t.text },
  taller: { fontSize: 10, fontWeight: "800", color: "#7C3AED", backgroundColor: "#F5F3FF", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  aviso: { marginTop: SPACE.md, fontSize: 12.5, color: "#92400E", backgroundColor: t.warningSoft, borderWidth: 1, borderColor: t.warningBorder, borderRadius: RADIUS.md, padding: 10, lineHeight: 18 },
  error: { marginTop: SPACE.sm, fontSize: 13, color: t.danger, fontWeight: "600" },
  btnPri: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 42, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  btnPriTxt: { color: "#fff", fontSize: 14, fontWeight: "800" },
  btnSec: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, minHeight: 42, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  btnSecTxt: { color: SLATE[700], fontSize: 13.5, fontWeight: "700" },
  card: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: 16, padding: SPACE.md, backgroundColor: t.surface, marginBottom: SPACE.md },
  claseChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, maxWidth: "100%" },
  claseChipOpt: { borderStyle: "dashed", borderColor: "#C4B5FD", backgroundColor: "#F5F3FF" },
  claseChipTxt: { fontSize: 12.5, color: t.text, flexShrink: 1 },
  tabs: { flexDirection: "row", gap: 4, marginBottom: SPACE.sm },
  tab: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  tabOn: { backgroundColor: BLUE[50], borderColor: BLUE[600] },
  tabTxt: { fontSize: 12.5, fontWeight: "800", color: SLATE[600] },
  tabN: { fontSize: 10.5, color: t.textFaint, marginTop: 1 },
  tabTxtOn: { color: BLUE[700] },
  bloque: { flexDirection: "row", alignItems: "center", gap: SPACE.md, borderWidth: 1, borderColor: t.borderStrong, borderLeftWidth: 4, borderRadius: 12, padding: SPACE.md, marginBottom: 6, backgroundColor: t.surface },
  bloqueHora: { width: 48, fontSize: 13.5, fontWeight: "800", color: t.textStrong },
  bloqueHoraFin: { fontSize: 11.5, fontWeight: "600", color: t.textFaint },
  sinClase: { fontSize: 12, fontWeight: "600", color: "#B45309", marginTop: 2 },
  bloqueMat: { fontSize: 14.5, fontWeight: "800", color: t.textStrong },
  optativa: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginTop: SPACE.md, padding: SPACE.md, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md },
  optativaOn: { backgroundColor: t.surfaceSunken },
  optTitulo: { fontSize: 14, fontWeight: "800", color: t.textStrong },
  alumnoFila: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: t.accent, borderColor: t.accent },
  checkTxt: { color: "#fff", fontSize: 13, fontWeight: "800" },
  claseListaFila: { paddingVertical: 9 },
  opciones: { marginTop: 8, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.lg, backgroundColor: t.surface, overflow: "hidden" },
  opcion: { flexDirection: "row", alignItems: "center", minHeight: 44, paddingHorizontal: SPACE.md, gap: 8 },
  opcionBorde: { borderTopWidth: 1, borderTopColor: t.border },
  opcionTxt: { flex: 1, fontSize: 14.5, color: t.text },
  opcionTxtOn: { fontWeight: "800", color: BLUE[700] },
});

// ── Semana de una maestra (ficha del maestro) ───────────────────────────────

export function SemanaMaestra({ maestroId, cursos = [] }) {
  const [bloques, setBloques] = useState(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data: cl } = await supabase.from("clases").select("id").eq("maestro_id", maestroId);
      const ids = (cl || []).map((c) => c.id);
      const { data } = ids.length ? await supabase.from("horarios").select("id,dia,hora_inicio,hora_fin,materia,color,curso_id").in("clase_id", ids) : { data: [] };
      if (vivo) setBloques(data || []);
    })();
    return () => { vivo = false; };
  }, [maestroId]);
  const nombre = Object.fromEntries(cursos.map((c) => [c.id, c.nombre]));
  if (bloques === null) return <ActivityIndicator color={t.accent} />;
  const delAno = bloques.filter((h) => nombre[h.curso_id]);
  if (!delAno.length) return <Text style={s.muted}>Todavía no está en ningún horario de este año.</Text>;
  return (
    <View style={{ gap: 6 }}>
      {DIAS_HORARIO.map((d) => {
        const bs = delAno.filter((h) => normalizarDia(h.dia) === d).sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio));
        if (!bs.length) return null;
        return (
          <View key={d} style={{ flexDirection: "row", gap: 8 }}>
            <Text style={[s.label, { width: 34, marginTop: 4 }]}>{DIA_CORTO[d].toUpperCase()}</Text>
            <View style={[s.wrap, s.flex1]}>
              {bs.map((h) => (
                <Text key={h.id} style={{ fontSize: 12, color: t.text, backgroundColor: (h.color || "#3B82F6") + "1A", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: "hidden" }}>
                  {hhmm(h.hora_inicio)} <Text style={{ fontWeight: "800", color: t.textStrong }}>{h.materia}</Text> {nombre[h.curso_id]}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
