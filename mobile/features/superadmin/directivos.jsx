// Directivos y membrete en el panel del colegio del celular (antes solo web).
// Espejo de Super Admin → Personas → 🧭 Directivos y del bloque "Membrete de
// los comunicados" de 🏫 Colegio (src/features/superadmin). Ver
// specs/roles-por-nivel.md y specs/comunicados-con-formato.md.
//   · Niveles que tiene el colegio (colegios.niveles).
//   · Administradores del colegio: solo la lista (el alta la hace tribbu).
//   · Directivos por nivel (rol nivel_admin): alta, edición, contraseña,
//     cargo, niveles y activo/inactivo. Mismos permisos para todos.
//   · Membrete: línea y firma, y por nivel si el colegio tiene más de uno.
import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert, StyleSheet } from "react-native";
import { BotonNuevo } from "../../components/BotonNuevo";
import { supabase } from "../../lib/supabase";
import { authAdminCreate, authAdminUpdate, authAdminFind } from "../../lib/authAdmin";
import { sanitize } from "@shared/helpers";
import { NIVELES, nombreNivel, ordenarNiveles, textoSecretaria, CARGOS, CARGO_DEFECTO } from "@shared/niveles";
import { mensajeErrorAuth } from "@shared/erroresAuth";
import { THEMES, SLATE, BLUE } from "@shared/tokens";
import { Sheet } from "../../components/Sheet";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";

const t = THEMES.light;

function Chip({ on, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{on ? "✓ " : ""}{label}</Text>
    </Pressable>
  );
}

function Campo({ label, ...props }) {
  return (
    <View style={s.campo}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={t.placeholder} style={s.input} autoCapitalize="none" {...props} />
    </View>
  );
}

// Alta o edición de un directivo por nivel.
function DirectivoSheet({ inicial, colegioId, niveles, onClose, onGuardado }) {
  const esNuevo = !inicial?.id;
  const [form, setForm] = useState(() => ({
    nombre: inicial?.nombre || "", apellido: inicial?.apellido || "", email: inicial?.email || "",
    pass: "", cargo: inicial?.cargo || CARGO_DEFECTO, niveles: inicial?.niveles || [], activo: inicial?.activo ?? true,
  }));
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const cargoEsOtro = !CARGOS.includes(form.cargo);

  const guardar = async () => {
    if (!form.nombre.trim() || !form.email.trim()) { Alert.alert("Faltan datos", "Completá el nombre y el mail."); return; }
    if (esNuevo && form.pass.length < 6) { Alert.alert("Falta la contraseña", "Poné una contraseña de al menos 6 caracteres."); return; }
    if (!form.niveles.length) { Alert.alert("Falta el nivel", "Elegí al menos un nivel."); return; }
    setGuardando(true);
    const email = sanitize(form.email).toLowerCase();
    const fila = {
      nombre: sanitize(form.nombre), apellido: sanitize(form.apellido) || null, email,
      cargo: sanitize(form.cargo) || CARGO_DEFECTO, niveles: ordenarNiveles(form.niveles), activo: form.activo,
    };
    try {
      if (esNuevo) {
        const { auth_id } = await authAdminCreate(email, form.pass);
        const avatar = `${fila.nombre[0] || ""}${(fila.apellido || "")[0] || ""}`.toUpperCase() || "SE";
        const { error } = await supabase.from("usuarios").insert({ ...fila, rol: "nivel_admin", colegio_id: colegioId, avatar, auth_id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("usuarios").update(fila).eq("id", inicial.id);
        if (error) throw error;
        const emailCambio = email !== (inicial.email || "").toLowerCase();
        if (form.pass || emailCambio) {
          let authId = inicial.auth_id;
          if (!authId) authId = (await authAdminFind(inicial.email)).auth_id || null;
          if (authId) {
            const { auth_id_reparado } = await authAdminUpdate(authId, {
              ...(emailCambio ? { email } : {}), ...(form.pass ? { password: form.pass } : {}), current_email: inicial.email,
            });
            if (auth_id_reparado && auth_id_reparado !== authId) await supabase.from("usuarios").update({ auth_id: auth_id_reparado }).eq("id", inicial.id);
          }
        }
      }
    } catch (e) {
      setGuardando(false);
      Alert.alert("No se pudo guardar", mensajeErrorAuth(e));
      return;
    }
    setGuardando(false);
    onGuardado();
  };

  return (
    <Sheet visible onClose={onClose} title={esNuevo ? "Nuevo directivo por nivel" : "Editar directivo"}>
      <ScrollView keyboardShouldPersistTaps="handled" style={s.flexShrink}>
        <Text style={s.nota}>Gestiona solo los cursos de sus niveles. El cargo es solo el nombre que se ve; todos pueden lo mismo.</Text>
        <Text style={s.label}>Cargo</Text>
        <View style={s.fila}>
          {CARGOS.map((c) => <Chip key={c} label={c} on={form.cargo === c} onPress={() => set("cargo", c)} />)}
        </View>
        <TextInput value={cargoEsOtro ? form.cargo : ""} onChangeText={(v) => set("cargo", v || CARGO_DEFECTO)} placeholder="Otro cargo (opcional): Ej. Vicedirección" placeholderTextColor={t.placeholder} style={[s.input, s.mtSm]} />
        <Text style={[s.label, s.mtMd]}>Niveles</Text>
        <View style={s.fila}>
          {niveles.map((k) => {
            const on = form.niveles.includes(k);
            return <Chip key={k} label={nombreNivel(k)} on={on} onPress={() => set("niveles", on ? form.niveles.filter((x) => x !== k) : [...form.niveles, k])} />;
          })}
        </View>
        <Campo label="NOMBRE" value={form.nombre} onChangeText={(v) => set("nombre", v)} placeholder="Ej: María" autoCapitalize="words" />
        <Campo label="APELLIDO" value={form.apellido} onChangeText={(v) => set("apellido", v)} placeholder="Ej: García" autoCapitalize="words" />
        <Campo label="MAIL" value={form.email} onChangeText={(v) => set("email", v)} placeholder="maria@colegio.edu.ar" keyboardType="email-address" />
        <Campo label={esNuevo ? "CONTRASEÑA" : "NUEVA CONTRASEÑA"} value={form.pass} onChangeText={(v) => set("pass", v)} placeholder={esNuevo ? "Contraseña de acceso" : "Dejar vacío para no cambiar"} secureTextEntry />
        {!esNuevo ? (
          <View style={[s.fila, s.mtMd]}>
            <Chip label={form.activo ? "Activo" : "Inactivo"} on={form.activo} onPress={() => set("activo", !form.activo)} />
          </View>
        ) : null}
        <Button title={guardando ? "Guardando…" : esNuevo ? "Crear directivo" : "Guardar cambios"} onPress={guardar} disabled={guardando} style={s.mtLg} />
      </ScrollView>
    </Sheet>
  );
}

/** Personas → Directivos (administrador del colegio y super). */
export function DirectivosAdmin({ colegioId, usuarios = [], onCambio }) {
  const [niveles, setNiveles] = useState(null);
  const [editor, setEditor] = useState(null); // { inicial } — inicial null = alta
  const cargar = useCallback(async () => {
    if (!colegioId) return;
    const { data } = await supabase.from("colegios").select("niveles").eq("id", colegioId).maybeSingle();
    setNiveles(ordenarNiveles(data?.niveles));
  }, [colegioId]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardarNiveles = async (lista) => {
    const nuevos = ordenarNiveles(lista);
    const { error } = await supabase.from("colegios").update({ niveles: nuevos }).eq("id", colegioId);
    if (error) { Alert.alert("No se pudieron guardar los niveles", error.message); return; }
    setNiveles(nuevos);
    onCambio?.(); // el panel recarga sus niveles (cursos, menú, comunicados)
  };

  if (!niveles) return <Spinner />;
  const admins = usuarios.filter((u) => u.rol === "colegio_admin");
  const directivos = usuarios.filter((u) => u.rol === "nivel_admin");

  return (
    <View>
      {editor ? (
        <DirectivoSheet inicial={editor.inicial} colegioId={colegioId} niveles={niveles} onClose={() => setEditor(null)}
          onGuardado={() => { setEditor(null); onCambio?.(); }} />
      ) : null}

      <Text style={s.titulo}>Administradores</Text>
      <Text style={s.nota}>Gestionan todo el colegio. Los da de alta el equipo de tribbu.</Text>
      <View style={s.card}>
        {admins.length ? admins.map((u, i) => (
          <View key={u.id} style={[s.item, i ? s.itemBorde : null]}>
            <Text style={s.itemTitulo}>{u.nombre}{u.apellido ? ` ${u.apellido}` : ""}</Text>
            <Text style={s.itemSub}>{u.email}</Text>
          </View>
        )) : <Text style={[s.nota, s.pad]}>Todavía no hay administradores.</Text>}
      </View>

      <Text style={[s.titulo, s.mtLg]}>Niveles</Text>
      <Text style={s.nota}>Los niveles que tiene el colegio. Con más de uno, cada curso lleva su nivel y podés mandar comunicados o cargar el menú por nivel, y sumar directivos por nivel.</Text>
      <View style={s.fila}>
        {NIVELES.map((n) => {
          const on = niveles.includes(n.k);
          return <Chip key={n.k} label={n.l} on={on} onPress={() => guardarNiveles(on ? niveles.filter((x) => x !== n.k) : [...niveles, n.k])} />;
        })}
      </View>

      <Text style={[s.titulo, s.mtLg]}>Directivos por nivel</Text>
      <Text style={s.nota}>Dirección, Secretaría, Coordinación… Gestionan solo los cursos de sus niveles: comunicados, eventos, autorizaciones, alertas, horarios, talleres, alumnos y familias y los mensajes a Secretaría.</Text>
      {niveles.length < 2 ? (
        <Text style={[s.nota, s.aviso]}>Para dar de alta directivos por nivel, marcá al menos dos niveles arriba.</Text>
      ) : (
        <>
          <View style={s.card}>
            {directivos.length ? directivos.map((u, i) => (
              <Pressable key={u.id} onPress={() => setEditor({ inicial: u })} style={[s.item, s.itemFila, i ? s.itemBorde : null]} accessibilityRole="button">
                <View style={s.flex1}>
                  <Text style={s.itemTitulo}>{u.nombre}{u.apellido ? ` ${u.apellido}` : ""}{u.activo === false ? " · inactivo" : ""}</Text>
                  <Text style={s.itemSub}>{textoSecretaria(u.niveles, u.cargo)} · {u.email}</Text>
                </View>
                <Text style={s.editar}>Editar</Text>
              </Pressable>
            )) : <Text style={[s.nota, s.pad]}>Todavía no hay directivos por nivel.</Text>}
          </View>
          <View style={[s.mtMd, { flexDirection: "row", justifyContent: "flex-end" }]}>
            <BotonNuevo label="Nuevo directivo" onPress={() => setEditor({ inicial: null })} />
          </View>
        </>
      )}
    </View>
  );
}

/** Colegio → Membrete de los comunicados. */
export function MembreteAdmin({ colegioId }) {
  const [form, setForm] = useState(null);
  const [niveles, setNiveles] = useState([]);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (!colegioId) return;
    supabase.from("colegios").select("niveles, membrete_linea, membrete_firma, membrete_niveles").eq("id", colegioId).maybeSingle()
      .then(({ data }) => {
        setNiveles(ordenarNiveles(data?.niveles));
        setForm({ linea: data?.membrete_linea || "", firma: data?.membrete_firma || "", niveles: data?.membrete_niveles || {} });
      });
  }, [colegioId]);
  if (!form) return null;
  const setNivel = (k, campo, v) => setForm((p) => ({ ...p, niveles: { ...p.niveles, [k]: { ...(p.niveles?.[k] || {}), [campo]: v } } }));
  const guardar = async () => {
    setGuardando(true);
    const membrete_niveles = Object.fromEntries(Object.entries(form.niveles || {})
      .map(([k, v]) => [k, { linea: sanitize(v?.linea || "") || null, firma: sanitize(v?.firma || "") || null }])
      .filter(([, v]) => v.linea || v.firma));
    const { error } = await supabase.from("colegios").update({
      membrete_linea: sanitize(form.linea) || null, membrete_firma: sanitize(form.firma) || null, membrete_niveles,
    }).eq("id", colegioId);
    setGuardando(false);
    if (error) { Alert.alert("No se pudo guardar el membrete", error.message); return; }
    Alert.alert("Membrete guardado");
  };
  return (
    <View style={s.mtLg}>
      <Text style={s.titulo}>Membrete de los comunicados</Text>
      <Text style={s.nota}>Los comunicados que mandes con “Con membrete” se ven con el logo y el nombre del colegio arriba, esta línea debajo y la firma al final.</Text>
      <Campo label="LÍNEA (OPCIONAL)" value={form.linea} onChangeText={(v) => setForm((p) => ({ ...p, linea: v }))} placeholder="Ej: Ciclo lectivo 2026" autoCapitalize="sentences" />
      <Campo label="FIRMA (OPCIONAL)" value={form.firma} onChangeText={(v) => setForm((p) => ({ ...p, firma: v }))} placeholder="Ej: Dirección" autoCapitalize="sentences" />
      {niveles.length > 1 ? niveles.map((k) => (
        <View key={k}>
          <Campo label={`LÍNEA · ${nombreNivel(k).toUpperCase()}`} value={form.niveles?.[k]?.linea || ""} onChangeText={(v) => setNivel(k, "linea", v)} placeholder="Si queda vacía, va la general" autoCapitalize="sentences" />
          <Campo label={`FIRMA · ${nombreNivel(k).toUpperCase()}`} value={form.niveles?.[k]?.firma || ""} onChangeText={(v) => setNivel(k, "firma", v)} placeholder={`Ej: Dirección de ${nombreNivel(k)}`} autoCapitalize="sentences" />
        </View>
      )) : null}
      <Button title={guardando ? "Guardando…" : "Guardar membrete"} onPress={guardar} disabled={guardando} style={s.mtMd} />
    </View>
  );
}

const s = StyleSheet.create({
  titulo: { fontSize: 16, fontWeight: "800", color: t.textStrong },
  nota: { fontSize: 13, color: t.textMuted, marginTop: 3, marginBottom: 10, lineHeight: 18 },
  aviso: { backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[200], borderRadius: 12, padding: 12 },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: SLATE[200], borderRadius: 14, overflow: "hidden" },
  item: { paddingVertical: 12, paddingHorizontal: 14 },
  itemFila: { flexDirection: "row", alignItems: "center", gap: 10 },
  itemBorde: { borderTopWidth: 1, borderTopColor: SLATE[100] },
  itemTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  itemSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  editar: { fontSize: 13, fontWeight: "700", color: BLUE[600] },
  pad: { padding: 14, marginBottom: 0 },
  fila: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "white" },
  chipOn: { borderColor: BLUE[500], backgroundColor: BLUE[50] },
  chipTxt: { fontSize: 12.5, fontWeight: "700", color: SLATE[500] },
  chipTxtOn: { color: BLUE[700] },
  campo: { marginTop: 12 },
  label: { fontSize: 12.5, fontWeight: "600", color: SLATE[600], marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: SLATE[200], borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: t.text, backgroundColor: SLATE[50] },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  mtSm: { marginTop: 8 },
  mtMd: { marginTop: 12 },
  mtLg: { marginTop: 22 },
});
