// Fotos escolares (puerto RN de src/features/fotos, solo la parte de las
// familias; reglas en @shared/fotosEscolares, permisos en
// supabase/fotos-escolares.sql). La familia ve las fotos de su hijo (y las
// grupales) con la marca de agua grabada, elige opción y copias, avisa
// "Ya pagué" y, si la Secretaría confirma el pago de una opción digital,
// descarga el original. La Secretaría las carga desde el panel web.
import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, TextInput, ScrollView, FlatList, Alert, Modal, RefreshControl, KeyboardAvoidingView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { supabase } from "../../lib/supabase";
import { useRecarga } from "../../lib/useRecarga";
import { sanitize, fmtLocalDate, fmtM, fmtF } from "@shared/helpers";
import {
  BUCKET_FOTOS, sesionVencida, totalPedido, validarPedido, copiasParaGuardar, estadoPedido, puedeEditarPedido,
  fotosDeAlumno, fotoDescargable, textoCopia, formDePedido, firmaPedido, ofreceDigital, formatoDe, formatosOpcion,
} from "@shared/fotosEscolares";
import { THEMES, TYPE, SPACE, RADIUS, SLATE, BLUE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SignedImage } from "../../components/SignedImage";
import { FotoZoom } from "../../components/FotoZoom";

const t = THEMES.light;
const TONO = { pendiente: "#B45309", informado: BLUE[600], pagado: "#047857", entregado: "#047857", listo: "#047857", sin_pedido: SLATE[400] };
const ordenArchivo = (a, b) => (a.orden - b.orden) || a.archivo.localeCompare(b.archivo, "es", { numeric: true });

function VisorFoto({ foto, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!foto} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.visor}>
        {foto ? <FotoZoom src={foto.path_muestra} bucket={BUCKET_FOTOS} onTocar={onClose} /> : null}
        <Pressable onPress={onClose} style={[styles.visorCerrar, { top: insets.top + 12 }]} accessibilityRole="button" accessibilityLabel="Cerrar">
          <MaterialCommunityIcons name="close" size={22} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}

async function descargarOriginal(foto) {
  const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(foto.path, 120);
  if (error || !data?.signedUrl) throw new Error("firma");
  const nombre = (foto.archivo || "foto").replace(/[/\\?*[\]:]/g, "").replace(/\.(jpe?g|png)$/i, "") + ".jpg";
  const { uri } = await FileSystem.downloadAsync(data.signedUrl, `${FileSystem.cacheDirectory}${nombre}`);
  if (!(await Sharing.isAvailableAsync())) throw new Error("compartir");
  await Sharing.shareAsync(uri, { mimeType: "image/jpeg", dialogTitle: nombre, UTI: "public.jpeg" });
}

function Stepper({ valor, onCambio, etiqueta }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onCambio(Math.max(0, valor - 1))} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Una copia menos de ${etiqueta}`}>
        <Text style={styles.stepTxt}>−</Text>
      </Pressable>
      <Text style={[styles.stepValor, !valor && styles.stepCero]}>{valor}</Text>
      <Pressable onPress={() => onCambio(Math.min(20, valor + 1))} style={styles.stepBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Una copia más de ${etiqueta}`}>
        <Text style={styles.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

function PedidoAlumno({ sesion, hijo, fotos, pedido, tag, onVolver, onCambio, refrescando, onRefresh }) {
  const hoy = fmtLocalDate();
  const propias = fotos.filter((f) => f.tipo === "alumno");
  const todas = fotosDeAlumno(fotos, hijo.id);
  const editable = puedeEditarPedido(sesion, pedido, hoy);
  const [form, setForm] = useState(() => formDePedido(pedido, propias));
  const [editando, setEditando] = useState(!pedido);
  // Si al recargar el pedido cambió (otro dispositivo, pago confirmado), se
  // rearma el formulario con lo nuevo.
  const firma = firmaPedido(pedido);
  const [firmaVista, setFirmaVista] = useState(firma);
  if (firma !== firmaVista) {
    setFirmaVista(firma);
    setForm(formDePedido(pedido, propias));
    setEditando(!pedido);
  }
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [ampliada, setAmpliada] = useState(null);
  const [bajando, setBajando] = useState(null);

  const cantidad = (fotoId, copiaId) => form.copias.find((c) => c.foto_id === fotoId && c.copia_id === copiaId)?.cantidad || 0;
  const setCantidad = (fotoId, copiaId, n) => setForm((p) => ({
    ...p,
    copias: [...p.copias.filter((c) => !(c.foto_id === fotoId && c.copia_id === copiaId)), ...(n > 0 ? [{ foto_id: fotoId, copia_id: copiaId, cantidad: n }] : [])],
  }));
  const total = totalPedido(sesion, form);
  const opcionElegida = (sesion.opciones || []).find((o) => o.id === form.opcionId);

  const guardar = async () => {
    const err = validarPedido(sesion, form);
    if (err) { Alert.alert("Falta un dato", err); return; }
    setGuardando(true);
    const { error } = await supabase.rpc("guardar_pedido_fotos", {
      p_sesion: sesion.id, p_hijo: hijo.id, p_opcion: form.opcionId, p_foto: form.opcionId ? form.fotoId : null,
      p_copias: copiasParaGuardar(form.copias), p_comentario: sanitize(form.comentario || ""),
      p_digital: form.opcionId ? formatoDe(opcionElegida, form.digital) : null,
    });
    setGuardando(false);
    if (error) { Alert.alert("No se pudo guardar", error.message?.length < 120 ? error.message : "Probá de nuevo."); return; }
    setEditando(false);
    setAviso("Pedido guardado. Cuando pagues, avisá con “Ya pagué”.");
    onCambio();
  };

  const informarPago = async (valor) => {
    await supabase.rpc("informar_pago_fotos", { p_pedido: pedido.id, p_valor: valor });
    setAviso(valor ? "Listo: le avisamos a la Secretaría que pagaste." : null);
    onCambio();
  };

  const anular = () =>
    Alert.alert("Anular el pedido", "Se borra lo que elegiste. Podés volver a pedir hasta el vencimiento.", [
      { text: "Volver", style: "cancel" },
      { text: "Anular pedido", style: "destructive", onPress: async () => {
        await supabase.rpc("borrar_pedido_fotos", { p_pedido: pedido.id });
        onCambio();
        onVolver();
      } },
    ]);

  const descargar = async (f) => {
    setBajando(f.id);
    try { await descargarOriginal(f); } catch { Alert.alert("No se pudo descargar", "Probá de nuevo en un rato."); }
    setBajando(null);
  };

  const est = estadoPedido(pedido);
  const fotoElegida = fotos.find((f) => f.id === pedido?.foto_id);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={!!refrescando} onRefresh={onRefresh} />}>
        <Pressable onPress={onVolver} style={styles.volver} accessibilityRole="button">
          <MaterialCommunityIcons name="chevron-left" size={20} color={t.accent} />
          <Text style={styles.volverTxt}>Fotos escolares</Text>
        </Pressable>
        <Text style={styles.h1}>{sesion.titulo} · {hijo.nombre?.split(" ")[0]}</Text>
        <View style={styles.metaRow}>
          {tag ? <View style={[styles.tagDot, { backgroundColor: tag.color }]} /> : null}
          <Text style={styles.sub}>{sesionVencida(sesion, hoy) ? `Venció el ${fmtF(sesion.vence)}` : `Podés pedir hasta el ${fmtF(sesion.vence)}`}</Text>
        </View>
        {aviso ? <View style={styles.aviso}><Text style={styles.avisoTxt}>{aviso}</Text></View> : null}

        <Text style={styles.tituloLista}>Las fotos</Text>
        <View style={styles.grilla}>
          {todas.map((f) => (
            <View key={f.id} style={styles.celda}>
              <Pressable onPress={() => setAmpliada(f)} accessibilityRole="imagebutton" accessibilityLabel={`Ver ${f.tipo === "grupal" ? "foto grupal" : f.archivo}`}>
                <SignedImage src={f.path_muestra} bucket={BUCKET_FOTOS} miniatura style={styles.foto} />
              </Pressable>
              <Text style={styles.archivo} numberOfLines={1}>{f.tipo === "grupal" ? "Grupal" : f.archivo}</Text>
              {fotoDescargable(f, pedido) ? (
                <Pressable onPress={() => descargar(f)} disabled={bajando === f.id} style={styles.descargar} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Descargar ${f.archivo}`}>
                  <MaterialCommunityIcons name="download-outline" size={16} color={t.accent} />
                  <Text style={styles.descargarTxt}>{bajando === f.id ? "Bajando…" : "Descargar"}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.nota}>Son muestras con marca de agua. {ofreceDigital(sesion) ? "Si la pedís digital, cuando la Secretaría confirme el pago las podés descargar sin marca." : "Las fotos se entregan impresas en el colegio."}</Text>

        {pedido && !editando ? (
          <>
            <Text style={styles.tituloLista}>Tu pedido</Text>
            <Card>
              <View style={styles.cardHead}>
                <Text style={styles.total}>{fmtM(Number(pedido.total) || 0)}</Text>
                <Text style={[styles.estado, { color: TONO[est.clave] }]}>{est.texto}</Text>
              </View>
              {pedido.opcion_nombre ? <Text style={styles.linea}><Text style={styles.negrita}>{pedido.opcion_nombre}</Text>{pedido.digital ? " (digital)" : ""} con {fotoElegida?.archivo || "la foto elegida"}</Text> : null}
              {(pedido.copias || []).map((c, i) => <Text key={i} style={styles.linea}>{textoCopia(c, fotos)}</Text>)}
              {pedido.comentario ? <Text style={[styles.linea, styles.muted]}>“{pedido.comentario}”</Text> : null}
              {!pedido.pagado_en && sesion.datos_pago ? (
                <View style={styles.pago}>
                  <Text style={styles.pagoLabel}>Cómo pagar</Text>
                  <Text style={styles.pagoTxt} selectable>{sesion.datos_pago}</Text>
                </View>
              ) : null}
              <View style={styles.acciones}>
                {!pedido.pagado_en && !pedido.informado_pago_en ? <Button title="Ya pagué" size="sm" onPress={() => informarPago(true)} /> : null}
                {!pedido.pagado_en && pedido.informado_pago_en ? (
                  <Pressable onPress={() => informarPago(false)} hitSlop={8} style={styles.link}><Text style={styles.linkMuted}>Todavía no pagué</Text></Pressable>
                ) : null}
                {editable ? <Button title="Cambiar pedido" size="sm" variant="secondary" onPress={() => setEditando(true)} /> : null}
                {editable ? <Pressable onPress={anular} hitSlop={8} style={styles.link}><Text style={styles.linkDanger}>Anular</Text></Pressable> : null}
              </View>
              {pedido.pagado_en && !pedido.digital ? <Text style={[styles.linea, styles.muted]}>{pedido.entregado_en ? `Entregado el ${fmtF(pedido.entregado_en.slice(0, 10))}.` : "Las fotos impresas se entregan en el colegio."}</Text> : null}
            </Card>
          </>
        ) : editable ? (
          <>
            {sesion.opciones?.length ? (
              <>
                <Text style={styles.tituloLista}>Elegí una opción</Text>
                {sesion.opciones.map((o) => {
                  const on = form.opcionId === o.id;
                  const formatos = formatosOpcion(o);
                  return (
                    <Pressable key={o.id} onPress={() => setForm((p) => ({ ...p, opcionId: on ? null : o.id, digital: on ? null : formatoDe(o, p.digital) }))} style={[styles.opcion, on && styles.opcionOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                      <View style={styles.cardHead}>
                        <Text style={styles.opcionNombre}>{o.nombre}{formatos.length === 1 && formatos[0].digital ? <Text style={styles.digital}>  · DIGITAL</Text> : null}</Text>
                        <Text style={[styles.opcionNombre, styles.precioDer]}>{formatos.length === 1 ? fmtM(formatos[0].precio) : formatos.map((f) => `${f.digital ? "Digital" : "Papel"} ${fmtM(f.precio)}`).join(" · ")}</Text>
                      </View>
                      {o.incluye?.length ? <Text style={styles.incluye}>{o.incluye.join(" · ")}</Text> : null}
                    </Pressable>
                  );
                })}
                {formatosOpcion(opcionElegida).length > 1 ? (
                  <>
                    <Text style={styles.label}>¿En papel o digital?</Text>
                    <View style={styles.formatos} accessibilityRole="radiogroup">
                      {formatosOpcion(opcionElegida).map((f) => {
                        const on = form.digital === f.digital;
                        return (
                          <Pressable key={f.label} onPress={() => setForm((p) => ({ ...p, digital: f.digital }))} style={[styles.opcion, styles.formato, on && styles.opcionOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                            <Text style={styles.opcionNombre}>{f.label} · {fmtM(f.precio)}</Text>
                            <Text style={styles.incluye}>{f.digital ? "La descargás sin marca cuando se confirme el pago" : "Se entrega impresa en el colegio"}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                ) : null}
                {form.opcionId && propias.length ? (
                  <>
                    <Text style={styles.label}>¿Con qué foto?</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.elegirFila}>
                      {propias.map((f) => {
                        const on = form.fotoId === f.id;
                        return (
                          <Pressable key={f.id} onPress={() => setForm((p) => ({ ...p, fotoId: f.id }))} style={[styles.elegir, on && styles.elegirOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={f.archivo}>
                            <SignedImage src={f.path_muestra} bucket={BUCKET_FOTOS} miniatura style={styles.elegirFoto} />
                            <Text style={[styles.archivo, on && styles.archivoOn]} numberOfLines={1}>{f.archivo}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}
              </>
            ) : null}

            {sesion.copias?.length ? (
              <>
                <Text style={styles.tituloLista}>Copias adicionales (opcional)</Text>
                {todas.map((f) => (
                  <Card key={f.id} style={styles.copiaCard}>
                    <View style={styles.copiaFila}>
                      <SignedImage src={f.path_muestra} bucket={BUCKET_FOTOS} miniatura style={styles.copiaFoto} />
                      <View style={styles.flex1}>
                        <Text style={styles.copiaTitulo}>{f.tipo === "grupal" ? "Foto grupal" : f.archivo}</Text>
                        {sesion.copias.map((c) => (
                          <View key={c.id} style={styles.copiaTam}>
                            <Text style={styles.copiaTxt}>{c.tamano} · {fmtM(Number(c.precio) || 0)}</Text>
                            <Stepper valor={cantidad(f.id, c.id)} onCambio={(n) => setCantidad(f.id, c.id, n)} etiqueta={`${c.tamano} de ${f.archivo}`} />
                          </View>
                        ))}
                      </View>
                    </View>
                  </Card>
                ))}
              </>
            ) : null}

            <Text style={styles.label}>Comentario para la Secretaría (opcional)</Text>
            <TextInput value={form.comentario} onChangeText={(v) => setForm((p) => ({ ...p, comentario: v }))} multiline maxLength={500} style={[styles.input, styles.textarea]} placeholderTextColor={t.placeholder} />

            <View style={styles.totalFila}>
              <View style={styles.flex1}>
                <Text style={styles.sub}>Total</Text>
                <Text style={styles.totalGrande}>{fmtM(total)}</Text>
              </View>
              {pedido ? <Button title="Cancelar" size="sm" variant="secondary" onPress={() => setEditando(false)} /> : null}
              <Button title={guardando ? "Guardando…" : "Guardar pedido"} size="sm" onPress={guardar} disabled={guardando} />
            </View>
          </>
        ) : (
          <Card style={styles.mtMd}><Text style={styles.muted}>El plazo para pedir estas fotos venció. Si necesitás algo, escribile a la Secretaría.</Text></Card>
        )}
      </ScrollView>
      <VisorFoto foto={ampliada} onClose={() => setAmpliada(null)} />
    </KeyboardAvoidingView>
  );
}

/** Pantalla de las familias (Curso → Fotos escolares). */
export function FotosEscolares() {
  const { cursoIds, items, tagDeCurso } = useSession();
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const hoy = fmtLocalDate();
  const misHijos = useMemo(() => (items || []).filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)), [items, cursoIds]);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const [s, f, p] = await Promise.all([
      supabase.from("fotos_sesiones").select("*").in("curso_id", cursoIds).not("publicada_en", "is", null).order("vence", { ascending: false }),
      supabase.from("fotos").select("id,sesion_id,curso_id,tipo,hijo_id,archivo,path,path_muestra,path_miniatura,orden").in("curso_id", cursoIds),
      supabase.from("fotos_pedidos").select("*").in("curso_id", cursoIds),
    ]);
    if (s.error || f.error || p.error) { setDatos((d) => d || { sesiones: [], fotos: [], pedidos: [] }); return; }
    setDatos({ sesiones: s.data || [], fotos: (f.data || []).sort(ordenArchivo), pedidos: p.data || [] });
  }, [cursoIds]);
  useEffect(() => { cargar(); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const tarjetas = useMemo(() => {
    if (!datos) return [];
    const out = [];
    for (const s of datos.sesiones) {
      for (const h of misHijos) {
        if (!datos.fotos.some((f) => f.sesion_id === s.id && f.hijo_id === h.id)) continue;
        out.push({ sesion: s, hijo: h, pedido: datos.pedidos.find((p) => p.sesion_id === s.id && p.hijo_id === h.id) || null });
      }
    }
    return out;
  }, [datos, misHijos]);

  const actual = abierto && tarjetas.find((x) => x.sesion.id === abierto.sesionId && x.hijo.id === abierto.hijoId);
  if (actual) {
    return (
      <PedidoAlumno
        key={`${actual.sesion.id}-${actual.hijo.id}`}
        sesion={actual.sesion} hijo={actual.hijo} pedido={actual.pedido} tag={tagDeCurso(actual.sesion.curso_id)}
        fotos={datos.fotos.filter((f) => f.sesion_id === actual.sesion.id)}
        onVolver={() => { setAbierto(null); cargar(); }} onCambio={cargar} refrescando={refrescando} onRefresh={onRefresh}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={tarjetas}
        keyExtractor={(x) => `${x.sesion.id}-${x.hijo.id}`}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={!!refrescando} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.mbMd}>
            <Text style={styles.h1}>Fotos escolares</Text>
            <Text style={styles.sub}>Mirá las fotos de tu hijo y elegí cuáles querés.</Text>
          </View>
        }
        ListEmptyComponent={
          !datos ? <Text style={styles.cargando}>Cargando…</Text>
          : <EmptyState icon="camera-outline" title="Todavía no hay fotos" note="Cuando el colegio publique las fotos escolares, te avisamos y aparecen acá para que elijas." />
        }
        renderItem={({ item: { sesion, hijo, pedido } }) => {
          const est = estadoPedido(pedido);
          const vencida = sesionVencida(sesion, hoy);
          const tag = tagDeCurso(sesion.curso_id);
          return (
            <Pressable onPress={() => setAbierto({ sesionId: sesion.id, hijoId: hijo.id })} accessibilityRole="button">
              <Card style={styles.fila}>
                <View style={styles.icono}><MaterialCommunityIcons name="camera-outline" size={20} color={SLATE[600]} /></View>
                <View style={styles.flex1}>
                  <Text style={styles.filaTitulo}>{sesion.titulo} · {hijo.nombre?.split(" ")[0]}</Text>
                  <View style={styles.metaRow}>
                    {tag ? <View style={[styles.tagDot, { backgroundColor: tag.color }]} /> : null}
                    <Text style={styles.sub}>{vencida ? `Venció el ${fmtF(sesion.vence)}` : `Hasta el ${fmtF(sesion.vence)}`}</Text>
                  </View>
                </View>
                <Text style={[styles.estado, { color: pedido ? TONO[est.clave] : vencida ? SLATE[400] : "#B45309" }]}>{pedido ? est.texto : vencida ? "Sin pedido" : "Elegir fotos"}</Text>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  cargando: { textAlign: "center", color: t.textFaint, padding: 40 },
  h1: { ...TYPE.h1, color: t.text },
  sub: { fontSize: 13, color: t.textMuted, marginTop: 2 },
  flex1: { flex: 1, minWidth: 0 },
  mbMd: { marginBottom: SPACE.md },
  mtMd: { marginTop: SPACE.md },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  tagDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  volver: { flexDirection: "row", alignItems: "center", minHeight: 40, marginBottom: SPACE.xs },
  volverTxt: { fontSize: 14, fontWeight: "700", color: t.accent },
  aviso: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: RADIUS.md, backgroundColor: "#F0FDF4", marginTop: SPACE.sm },
  avisoTxt: { fontSize: 13, fontWeight: "600", color: "#047857" },
  tituloLista: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: t.textFaint, textTransform: "uppercase", marginTop: SPACE.lg, marginBottom: SPACE.sm },
  grilla: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  celda: { width: "31%" },
  foto: { width: "100%", aspectRatio: 3 / 4, borderRadius: RADIUS.md },
  archivo: { fontSize: 11.5, color: t.textMuted, marginTop: 4 },
  archivoOn: { color: t.accent, fontWeight: "800" },
  descargar: { flexDirection: "row", alignItems: "center", gap: 3, minHeight: 32 },
  descargarTxt: { fontSize: 12.5, fontWeight: "700", color: t.accent },
  nota: { fontSize: 12, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 17 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.sm },
  total: { fontSize: 16, fontWeight: "800", color: t.textStrong },
  estado: { fontSize: 12, fontWeight: "700", maxWidth: 150, textAlign: "right" },
  linea: { fontSize: 13, color: SLATE[700], marginTop: 6, lineHeight: 19 },
  negrita: { fontWeight: "700", color: t.textStrong },
  muted: { color: t.textMuted },
  pago: { marginTop: SPACE.sm, padding: 10, borderRadius: RADIUS.md, backgroundColor: t.surfaceSunken },
  pagoLabel: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  pagoTxt: { fontSize: 13, color: t.textStrong, marginTop: 2 },
  acciones: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACE.md, marginTop: SPACE.md },
  link: { minHeight: 36, justifyContent: "center" },
  linkMuted: { fontSize: 13, fontWeight: "700", color: t.textMuted },
  linkDanger: { fontSize: 13, fontWeight: "700", color: t.danger },
  opcion: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, backgroundColor: t.surface },
  opcionOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  opcionNombre: { fontSize: 14.5, fontWeight: "800", color: t.textStrong },
  precioDer: { textAlign: "right" },
  formatos: { flexDirection: "row", gap: SPACE.sm },
  formato: { flex: 1, marginBottom: 0 },
  digital: { fontSize: 11.5, fontWeight: "700", color: t.accent },
  incluye: { fontSize: 12.5, color: SLATE[600], marginTop: 4, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 6, marginTop: SPACE.md },
  elegirFila: { gap: 10 },
  elegir: { width: 92, padding: 3, borderRadius: RADIUS.md, borderWidth: 2.5, borderColor: "transparent" },
  elegirOn: { borderColor: t.accent },
  elegirFoto: { width: "100%", aspectRatio: 3 / 4, borderRadius: 8 },
  copiaCard: { marginBottom: SPACE.sm },
  copiaFila: { flexDirection: "row", gap: SPACE.md },
  copiaFoto: { width: 56, height: 72, borderRadius: 8 },
  copiaTitulo: { fontSize: 13, fontWeight: "700", color: t.textStrong, marginBottom: 4 },
  copiaTam: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 3 },
  copiaTxt: { fontSize: 12.5, color: SLATE[600], flexShrink: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  stepTxt: { fontSize: 17, fontWeight: "700", color: SLATE[700] },
  stepValor: { minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: "800", color: t.textStrong },
  stepCero: { color: t.textFaint },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: t.textStrong, backgroundColor: t.surfaceSunken },
  textarea: { minHeight: 70, textAlignVertical: "top" },
  totalFila: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginTop: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: t.border },
  totalGrande: { fontSize: 20, fontWeight: "900", color: t.textStrong },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginBottom: SPACE.sm },
  icono: { width: 40, height: 40, borderRadius: 10, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  filaTitulo: { fontSize: 15, fontWeight: "800", color: t.textStrong },
  visor: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)" },
  visorCerrar: { position: "absolute", right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});

