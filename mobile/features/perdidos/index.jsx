// Perdidos y encontrados (puerto RN de src/features/perdidos — ver
// specs/perdidos-y-encontrados.md). Las familias publican lo que buscan y lo que
// encontraron; se ve en el curso (o en todo el colegio si así se eligió), vence a
// los 30 días (lo resuelto sigue listado, atenuado, hasta entonces), y al publicar
// no se manda push. "¡Es mío!" /
// "Lo tengo yo" avisa a quien publicó y comparte los contactos. Lo que publica
// el colegio (su caja de objetos perdidos) se carga desde el Super Admin web.
import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView, Alert, Linking, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { sendPush } from "../../lib/push";
import { pickAndUploadImage } from "../../lib/media";
import { sanitize, fmtLocalDate } from "@shared/helpers";
import { CATEGORIAS, categoria, estaVigente, estaVisible, ordenarVisibles, coincidencias, filtroAlcance, cargarReclamados } from "@shared/perdidos";
import { THEMES, TYPE, SPACE, RADIUS } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { DateField } from "../../components/DateField";
import { EmptyState } from "../../components/EmptyState";
import { SignedImage } from "../../components/SignedImage";

const t = THEMES.light;
const fmtDia = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : null);
const hace = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

export function Perdidos({ embebido = false }) {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, items } = useSession();
  const userId = usuario?.id ?? null;
  const [datos, setDatos] = useState(null);
  const [tab, setTab] = useState("encontrado");
  const [cat, setCat] = useState("todas");
  const [nuevo, setNuevo] = useState(false);
  const [avisando, setAvisando] = useState(null);
  const [contacto, setContacto] = useState(null); // { titulo, lista: [c] | null }

  const cursosAdmin = useMemo(() => (items || []).filter((i) => i._tipo === "hijo" && i.rolEfectivo === "room").map((i) => i.curso_id), [items]);
  const cursosPublicar = useMemo(() => {
    const ids = esVistaTodos ? cursoIds : cursoId ? [cursoId] : [];
    return ids.map((id) => ({ id, nombre: tagDeCurso(id)?.nombre || (items || []).find((i) => i.curso_id === id)?.cursos?.nombre || "Mi curso" }));
  }, [esVistaTodos, cursoIds, cursoId, tagDeCurso, items]);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const { data: cursos } = await supabase.from("cursos").select("id,colegio_id").in("id", cursoIds);
    const colegios = [...new Set((cursos || []).map((c) => c.colegio_id))];
    const { data: objs } = await supabase
      .from("objetos_perdidos")
      .select("*")
      .or(filtroAlcance(cursoIds, colegios))
      .gt("vence_en", new Date().toISOString())
      .order("creado_en", { ascending: false });
    const objetos = objs || [];
    const ids = objetos.map((o) => o.id);
    const { data: avisos } = ids.length ? await supabase.from("objeto_perdido_avisos").select("objeto_id,usuario_id").in("objeto_id", ids) : { data: [] };
    const misAvisos = new Set((avisos || []).filter((a) => a.usuario_id === userId).map((a) => a.objeto_id));
    const avisosDe = {};
    for (const a of avisos || []) avisosDe[a.objeto_id] = (avisosDe[a.objeto_id] || 0) + 1;
    const reclamados = await cargarReclamados(supabase, ids);
    setDatos({ objetos, misAvisos, avisosDe, reclamados, colegioDe: new Map((cursos || []).map((c) => [c.id, c.colegio_id])) });
  }, [cursoIds, userId]);
  // Expo Router deja la pantalla montada: recargar al volver a ella (como
  // Recordatorios) y con pull-to-refresh, si no lo nuevo no aparece nunca.
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  const [refrescando, setRefrescando] = useState(false);
  const refrescar = async () => {
    setRefrescando(true);
    try { await cargar(); } finally { setRefrescando(false); }
  };

  const vigentes = useMemo(() => (datos?.objetos || []).filter((o) => estaVigente(o)), [datos]);
  const visibles = useMemo(() => ordenarVisibles((datos?.objetos || []).filter((o) => estaVisible(o))), [datos]);
  const gestiona = (o) => o.publicado_por === userId || (!!o.curso_id && cursosAdmin.includes(o.curso_id));

  const verContacto = async (o) => {
    setContacto({ titulo: o.titulo, lista: null });
    const { data } = await supabase.rpc("contacto_objeto_perdido", { p_id: o.id });
    setContacto({ titulo: o.titulo, lista: data?.length ? data : [{ nombre: "—" }] });
  };
  const verAvisos = async (o) => {
    setContacto({ titulo: o.titulo, lista: null, objeto: o });
    const { data } = await supabase.rpc("avisos_objeto_perdido", { p_id: o.id });
    setContacto({ titulo: o.titulo, lista: data || [], objeto: o });
  };
  const resuelto = async (o) => {
    await supabase.from("objetos_perdidos").update({ estado: "resuelto", resuelto_en: new Date().toISOString() }).eq("id", o.id);
    setContacto(null);
    cargar();
  };
  const borrar = (o) =>
    Alert.alert("Borrar publicación", "¿Seguro?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: async () => { await supabase.from("objetos_perdidos").delete().eq("id", o.id); if (o.foto) borrarArchivos([o.foto], "adjuntos"); cargar(); } },
    ]);

  if (!datos) return <View style={styles.screen}><Text style={styles.cargando}>Cargando…</Text></View>;
  const lista = visibles.filter((o) => o.tipo === tab && (cat === "todas" || o.categoria === cat));
  const cuenta = (tipo) => visibles.filter((o) => o.tipo === tipo).length;

  const renderItem = ({ item: o }) => {
    const c = categoria(o.categoria);
    const propio = o.publicado_por === userId;
    const yaAvise = datos.misAvisos.has(o.id);
    const nAvisos = datos.avisosDe[o.id] || 0;
    const resuelta = o.estado === "resuelto";
    const reclamado = datos.reclamados.has(o.id);
    const sugerencias = propio && !resuelta ? coincidencias(o, vigentes.filter((x) => !datos.reclamados.has(x.id))) : [];
    const tag = tagDeCurso(o.curso_id);
    return (
      <Card style={[styles.card, resuelta && styles.cardResuelta]}>
        <View style={styles.cardTop}>
          {o.foto ? (
            <SignedImage src={o.foto} bucket="adjuntos" style={styles.foto} resizeMode="cover" />
          ) : (
            <View style={[styles.foto, styles.fotoVacia]}><Text style={styles.fotoEmoji}>{c.e}</Text></View>
          )}
          <View style={styles.flex1}>
            <View style={styles.badges}>
              <Text style={[styles.badge, o.tipo === "perdido" ? styles.badgeBuscan : styles.badgeEncontrado]}>{o.tipo === "perdido" ? "BUSCAN" : "ENCONTRADO"}</Text>
              {resuelta ? <Text style={[styles.badge, styles.badgeResuelto]}>✓ RESUELTO</Text> : null}
              <Text style={styles.cat}>{c.e} {c.l}</Text>
              {o.es_colegio ? <Text style={styles.colegio}>🏫 Colegio</Text> : null}
            </View>
            <Text style={styles.titulo}>{o.titulo}</Text>
            {o.descripcion ? <Text style={styles.desc}>{o.descripcion}</Text> : null}
            <Text style={styles.meta}>
              {[tag?.nombre, o.lugar && `📍 ${o.lugar}`, o.fecha && `📅 ${fmtDia(o.fecha)}`, hace(o.creado_en)].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        {sugerencias.length ? (
          <Pressable onPress={() => setTab(sugerencias[0].objeto.tipo)} style={styles.sugerencia}>
            <Text style={styles.sugerenciaTxt}>🔎 ¿Será {sugerencias.length === 1 ? "este" : "alguno de estos"}? {sugerencias.map((s) => s.objeto.titulo).join(", ")}</Text>
          </Pressable>
        ) : null}
        {!propio && !yaAvise && reclamado && !resuelta ? (
          <Text style={styles.reclamado}>{o.tipo === "encontrado" ? "🙋 Alguien ya avisó que es suyo" : "🙋 Alguien ya avisó que lo tiene"}</Text>
        ) : null}
        <View style={styles.acciones}>
          {!propio && !yaAvise && !resuelta ? (
            <Pressable onPress={() => setAvisando(o)} style={styles.btnPri}>
              <Text style={styles.btnPriTxt}>{o.tipo === "encontrado" ? "🙋 ¡Es mío!" : "🙋 Lo tengo yo"}</Text>
            </Pressable>
          ) : null}
          {!propio && yaAvise ? (
            <Pressable onPress={() => verContacto(o)} style={styles.btnSec}>
              <Text style={styles.btnSecTxt}>📞 Ver contacto</Text>
            </Pressable>
          ) : null}
          {gestiona(o) && nAvisos > 0 ? (
            <Pressable onPress={() => verAvisos(o)} style={styles.btnOk}>
              <Text style={styles.btnOkTxt}>🙋 {nAvisos} {nAvisos === 1 ? "aviso" : "avisos"}</Text>
            </Pressable>
          ) : null}
          <View style={styles.flex1} />
          {gestiona(o) ? (
            <>
              {!resuelta ? <Pressable onPress={() => resuelto(o)} hitSlop={6}><Text style={styles.linkOk}>✓ Resuelto</Text></Pressable> : null}
              <Pressable onPress={() => borrar(o)} hitSlop={6}><Text style={styles.linkDanger}>Borrar</Text></Pressable>
            </>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={lista}
        keyExtractor={(o) => o.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <View style={styles.flex1}>
                {/* Dentro de Comunidad el título lo pone la sección. */}
                {!embebido ? <Text style={styles.h1}>Lost&amp;Found</Text> : null}
                <Text style={styles.sub}>Lo que se perdió y lo que apareció</Text>
              </View>
              {cursosPublicar.length ? <Button title="+ Publicar" size="sm" onPress={() => setNuevo(true)} /> : null}
            </View>
            <View style={styles.tabs}>
              {[["encontrado", "🙌 Encontrados"], ["perdido", "😟 Buscan"]].map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[styles.tabBtn, tab === k && styles.tabOn]}>
                  <Text style={[styles.tabTxt, tab === k && styles.tabTxtOn]}>{l} ({cuenta(k)})</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
              {[{ k: "todas", l: "Todas", e: "" }, ...CATEGORIAS].map((c) => (
                <Pressable key={c.k} onPress={() => setCat(c.k)} style={[styles.catBtn, cat === c.k && styles.catOn]}>
                  <Text style={[styles.catTxt, cat === c.k && styles.catTxtOn]}>{c.e} {c.l}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <EmptyState emoji="🧦" title={tab === "encontrado" ? "No hay objetos encontrados" : "Nadie está buscando nada"} note="Las publicaciones se ven 30 días, también las resueltas." />
        }
      />
      {nuevo ? (
        <NuevoSheet
          cursos={cursosPublicar}
          colegioDe={datos.colegioDe}
          userId={userId}
          candidatos={vigentes}
          onClose={() => setNuevo(false)}
          onCreado={(n) => { setNuevo(false); setTab(n.tipo); cargar(); }}
        />
      ) : null}
      {avisando ? (
        <AvisarSheet
          o={avisando}
          userId={userId}
          onClose={() => setAvisando(null)}
          onAvisado={() => { const o = avisando; setAvisando(null); cargar(); verContacto(o); }}
        />
      ) : null}
      {contacto ? (
        <Sheet visible onClose={() => setContacto(null)} title={contacto.objeto ? "🙋 Quiénes avisaron" : "📞 Contacto"}>
          <Text style={styles.contactoTitulo}>{contacto.titulo}</Text>
          <ScrollView style={styles.sheetScroll}>
            {!contacto.lista ? <Text style={styles.cargando}>Cargando…</Text> : contacto.lista.map((c, i) => <ContactoCard key={c.usuario_id || i} c={c} />)}
          </ScrollView>
          {contacto.objeto ? <Button title="✓ Ya está resuelto" variant="secondary" onPress={() => resuelto(contacto.objeto)} style={styles.mtMd} /> : null}
        </Sheet>
      ) : null}
    </View>
  );
}

function ContactoCard({ c }) {
  const abrir = (url) => Linking.openURL(url).catch(() => {});
  return (
    <View style={styles.contacto}>
      <Text style={styles.contactoNombre}>{c.nombre}</Text>
      {c.telefono ? (
        <View style={styles.contactoRow}>
          <Pressable onPress={() => abrir(`tel:${c.telefono}`)}><Text style={styles.contactoLink}>📞 {c.telefono}</Text></Pressable>
          <Pressable onPress={() => abrir(`https://wa.me/${c.telefono.replace(/[^0-9]/g, "")}`)}><Text style={styles.contactoWa}>💬 WhatsApp</Text></Pressable>
        </View>
      ) : null}
      {c.email ? <Pressable onPress={() => abrir(`mailto:${c.email}`)}><Text style={styles.contactoLink}>✉️ {c.email}</Text></Pressable> : null}
      {!c.telefono && !c.email ? <Text style={styles.meta}>No cargó teléfono ni email.</Text> : null}
      {c.mensaje ? <Text style={styles.desc}>“{c.mensaje}”</Text> : null}
    </View>
  );
}

function AvisarSheet({ o, userId, onClose, onAvisado }) {
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = async () => {
    setEnviando(true);
    const { error } = await supabase.from("objeto_perdido_avisos").insert({ objeto_id: o.id, usuario_id: userId, mensaje: sanitize(mensaje) || null });
    if (error) { setEnviando(false); Alert.alert("No se pudo avisar", "Probá de nuevo."); return; }
    if (o.publicado_por) {
      await sendPush({ type: "perdido", payload: { titulo: `${o.tipo === "encontrado" ? "Alguien dice que es suyo" : "Alguien lo tiene"}: ${o.titulo}`, userIds: [o.publicado_por] } });
    }
    setEnviando(false);
    onAvisado();
  };
  return (
    <Sheet visible onClose={onClose} title={o.tipo === "encontrado" ? "🙋 ¡Es mío!" : "🙋 Lo tengo yo"}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <Text style={styles.hint}>Le avisamos a quien lo publicó y se comparten los contactos de los dos para que se pongan de acuerdo.</Text>
        <TextInput value={mensaje} onChangeText={setMensaje} placeholder="Mensaje (opcional): ej. tiene el nombre bordado" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea]} />
        <Button title={enviando ? "Avisando…" : "Avisar y ver el contacto"} onPress={avisar} disabled={enviando} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

function NuevoSheet({ cursos, colegioDe, userId, candidatos, onClose, onCreado }) {
  const [form, setForm] = useState({ tipo: "encontrado", categoria: "ropa", titulo: "", descripcion: "", lugar: "", fecha: fmtLocalDate(), alcance: "curso", curso_id: cursos[0]?.id || null });
  const [foto, setFoto] = useState(null); // path en adjuntos
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const colegio = colegioDe.get(form.curso_id);

  const elegirFoto = async () => {
    setSubiendo(true);
    try {
      const r = await pickAndUploadImage({ bucket: "adjuntos", pathPrefix: `perdidos/${colegio}/` });
      if (r?.url) setFoto(r.url);
    } catch (e) {
      Alert.alert("No se pudo subir la foto", e?.message || "Probá de nuevo.");
    }
    setSubiendo(false);
  };
  const publicar = async () => {
    if (!form.titulo.trim()) { Alert.alert("Falta qué es", "Ej: Campera azul talle 8."); return; }
    if (form.tipo === "encontrado" && !foto) { Alert.alert("Falta la foto", "Para un objeto encontrado, la foto es lo que permite reconocerlo."); return; }
    if (!form.curso_id) { Alert.alert("Elegí el curso"); return; }
    setGuardando(true);
    const { data: nuevo, error } = await supabase
      .from("objetos_perdidos")
      .insert({
        tipo: form.tipo, categoria: form.categoria, titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null,
        lugar: sanitize(form.lugar) || null, fecha: form.fecha || null, foto, alcance: form.alcance,
        curso_id: form.curso_id, colegio_id: colegio, publicado_por: userId, es_colegio: false,
      })
      .select()
      .single();
    if (error) { setGuardando(false); Alert.alert("No se pudo publicar", error.message); return; }
    if (nuevo.tipo === "encontrado") {
      const duenos = [...new Set(coincidencias(nuevo, candidatos, { max: 10 }).map((x) => x.objeto.publicado_por).filter((u) => u && u !== userId))];
      if (duenos.length) await sendPush({ type: "perdido", payload: { titulo: `Puede que hayan encontrado lo que buscás: ${nuevo.titulo}`, userIds: duenos } });
    }
    setGuardando(false);
    onCreado(nuevo);
  };
  const chip = (on, label, onPress, key) => (
    <Pressable key={key || label} onPress={onPress} style={[styles.catBtn, on && styles.catOn]}>
      <Text style={[styles.catTxt, on && styles.catTxtOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet visible onClose={onClose} title="Publicar">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <View style={styles.tabs}>
          {chip(form.tipo === "perdido", "😟 Perdí algo", () => set("tipo", "perdido"))}
          {chip(form.tipo === "encontrado", "🙌 Encontré algo", () => set("tipo", "encontrado"))}
        </View>
        <Text style={styles.label}>Categoría</Text>
        <View style={styles.wrap}>{CATEGORIAS.map((c) => chip(form.categoria === c.k, `${c.e} ${c.l}`, () => set("categoria", c.k), c.k))}</View>
        <Text style={styles.label}>Qué es</Text>
        <TextInput value={form.titulo} onChangeText={(v) => set("titulo", v)} placeholder="Ej: Campera azul talle 8" placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Detalle (opcional)</Text>
        <TextInput value={form.descripcion} onChangeText={(v) => set("descripcion", v)} placeholder="Marca, nombre bordado… (mejor sin el nombre completo del chico)" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea]} />
        <Text style={styles.label}>{form.tipo === "perdido" ? "Dónde se perdió (opcional)" : "Dónde está ahora"}</Text>
        <TextInput value={form.lugar} onChangeText={(v) => set("lugar", v)} placeholder={form.tipo === "perdido" ? "Ej: en el patio, en el micro" : "Ej: lo tiene preceptoría / lo tengo yo"} placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Fecha</Text>
        <DateField value={form.fecha} onChange={(v) => set("fecha", v)} style={styles.input} />
        <Text style={styles.label}>Foto {form.tipo === "encontrado" ? "" : "(opcional)"}</Text>
        <View style={styles.fotoRow}>
          {foto ? <SignedImage src={foto} bucket="adjuntos" style={styles.fotoPreview} resizeMode="cover" /> : null}
          <Button title={subiendo ? "Subiendo…" : foto ? "Cambiar foto" : "Elegir foto"} variant="secondary" size="sm" onPress={elegirFoto} disabled={subiendo} />
        </View>
        <Text style={styles.label}>¿Quién lo ve?</Text>
        <View style={styles.wrap}>
          {chip(form.alcance === "curso", "Mi curso", () => set("alcance", "curso"))}
          {chip(form.alcance === "colegio", "Todo el colegio", () => set("alcance", "colegio"))}
        </View>
        {cursos.length > 1 ? (
          <View style={styles.wrap}>{cursos.map((c) => chip(form.curso_id === c.id, c.nombre, () => set("curso_id", c.id), c.id))}</View>
        ) : null}
        <Text style={styles.hint}>Se ve 30 días (si lo marcás resuelto, sigue en la lista como resuelto). No se manda notificación a nadie al publicar.</Text>
        <Button title={guardando ? "Publicando…" : "Publicar"} onPress={publicar} disabled={guardando || subiendo} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  cargando: { textAlign: "center", color: t.textFaint, padding: 30 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: SPACE.sm, marginBottom: SPACE.md },
  h1: { ...TYPE.h1, color: t.text },
  sub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  flex1: { flex: 1, minWidth: 0 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: SPACE.sm },
  tabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0" },
  tabOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  tabTxt: { fontSize: 13, fontWeight: "700", color: t.textMuted },
  tabTxtOn: { color: "white" },
  cats: { gap: 6, paddingBottom: SPACE.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACE.sm },
  catBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white" },
  catOn: { borderColor: t.accent, backgroundColor: "#EFF6FF" },
  catTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  catTxtOn: { color: t.accent },
  card: { marginBottom: SPACE.md, padding: 0, overflow: "hidden" },
  cardTop: { flexDirection: "row", gap: 12, padding: 12 },
  foto: { width: 84, height: 84, borderRadius: 12, backgroundColor: "#F1F5F9" },
  fotoVacia: { alignItems: "center", justifyContent: "center" },
  fotoEmoji: { fontSize: 32 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 3 },
  badge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  badgeBuscan: { backgroundColor: "#FEF3C7", color: "#92400E" },
  badgeEncontrado: { backgroundColor: "#DCFCE7", color: "#166534" },
  badgeResuelto: { backgroundColor: "#E2E8F0", color: "#334155" },
  cardResuelta: { opacity: 0.7 },
  cat: { fontSize: 11, color: t.textMuted },
  colegio: { fontSize: 10, fontWeight: "700", color: "#6366F1" },
  titulo: { fontSize: 15, fontWeight: "800", color: t.text },
  desc: { fontSize: 12.5, color: t.textMuted, marginTop: 3, lineHeight: 17 },
  meta: { fontSize: 11.5, color: t.textFaint, marginTop: 4 },
  sugerencia: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#F0F9FF", borderTopWidth: 1, borderTopColor: "#E0F2FE" },
  sugerenciaTxt: { fontSize: 12, fontWeight: "700", color: "#0369A1" },
  acciones: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E2E8F0", flexWrap: "wrap" },
  btnPri: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: t.accent },
  btnPriTxt: { color: t.onAccent, fontSize: 12.5, fontWeight: "700" },
  btnSec: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
  btnSecTxt: { color: "#1D4ED8", fontSize: 12.5, fontWeight: "700" },
  btnOk: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.md, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" },
  btnOkTxt: { color: "#047857", fontSize: 12.5, fontWeight: "700" },
  linkOk: { color: "#10B981", fontSize: 12.5, fontWeight: "700" },
  linkDanger: { color: t.danger, fontSize: 12.5, fontWeight: "700" },
  sheetScroll: { flexShrink: 1 },
  reclamado: { fontSize: 12.5, color: t.textMuted, marginTop: SPACE.sm },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 4, marginTop: SPACE.sm },
  input: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: RADIUS.md, padding: 10, fontSize: 14, color: t.text, backgroundColor: "#F8FAFC" },
  textarea: { minHeight: 64, textAlignVertical: "top" },
  hint: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
  mtMd: { marginTop: SPACE.md },
  fotoRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  fotoPreview: { width: 64, height: 64, borderRadius: 10 },
  contactoTitulo: { fontSize: 12.5, color: t.textMuted, marginBottom: SPACE.sm },
  contacto: { padding: SPACE.md, borderRadius: RADIUS.lg, backgroundColor: "#F8FAFC", marginBottom: SPACE.sm },
  contactoNombre: { fontSize: 14, fontWeight: "700", color: t.text },
  contactoRow: { flexDirection: "row", gap: SPACE.md, marginTop: 4 },
  contactoLink: { fontSize: 13, color: "#2563EB", marginTop: 2 },
  contactoWa: { fontSize: 13, color: "#16A34A", marginTop: 2 },
});
