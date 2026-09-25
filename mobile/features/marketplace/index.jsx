// Marketplace de cosas usadas (puerto RN de src/features/marketplace — ver
// specs/marketplace.md). Grilla de 2 columnas; tocar abre el detalle (fotos,
// precio, "Me interesa" / gestión). "Me interesa" avisa al vendedor (push) y
// comparte los contactos; el vendedor marca Vendido (y opcionalmente a quién).
// Lo que publica el colegio se carga desde el panel del colegio web.
import { useState, useCallback, useEffect, useMemo } from "react";
import { View, Text, Pressable, TextInput, FlatList, ScrollView, Alert, Linking, RefreshControl, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { sendPush } from "../../lib/push";
import { pickAndUploadImage } from "../../lib/media";
import { useRecarga } from "../../lib/useRecarga";
import { sanitize } from "@shared/helpers";
import { CATEGORIAS, categoria, CONDICIONES, condicion, MAX_FOTOS, DIAS_VIGENCIA, estaDisponible, estaVisible, ordenar, fmtPrecio, diasParaVencer, coincideBusqueda, filtroAlcance } from "@shared/marketplace";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { EmptyState } from "../../components/EmptyState";
import { SignedImage } from "../../components/SignedImage";

const t = THEMES.light;
const hace = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

export function Marketplace() {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, items } = useSession();
  const userId = usuario?.id ?? null;
  const [datos, setDatos] = useState(null);
  const [cat, setCat] = useState("todas");
  const [soloRegalos, setSoloRegalos] = useState(false);
  const [mios, setMios] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [interesando, setInteresando] = useState(null);
  const [contactos, setContactos] = useState(null); // { titulo, lista, interesados }
  const [vendiendo, setVendiendo] = useState(null); // { articulo, lista }

  const cursosPublicar = useMemo(() => {
    const ids = esVistaTodos ? cursoIds : cursoId ? [cursoId] : [];
    return ids.map((id) => ({ id, nombre: tagDeCurso(id)?.nombre || (items || []).find((i) => i.curso_id === id)?.cursos?.nombre || "Mi curso" }));
  }, [esVistaTodos, cursoIds, cursoId, tagDeCurso, items]);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const { data: cursos } = await supabase.from("cursos").select("id,colegio_id").in("id", cursoIds);
    const colegios = [...new Set((cursos || []).map((c) => c.colegio_id))];
    const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await supabase
      .from("marketplace_articulos")
      .select("*")
      .or(filtroAlcance(cursoIds, colegios))
      .or(`vence_en.gt.${new Date().toISOString()},vendido_en.gt.${hace7}`)
      .order("creado_en", { ascending: false });
    const articulos = data || [];
    const ids = articulos.map((a) => a.id);
    const [{ data: propios }, { data: conteo }] = ids.length
      ? await Promise.all([
          supabase.from("marketplace_interesados").select("articulo_id").eq("usuario_id", userId).in("articulo_id", ids),
          supabase.rpc("interesados_por_articulo", { p_ids: ids }),
        ])
      : [{ data: [] }, { data: [] }];
    setDatos({
      articulos,
      misInteres: new Set((propios || []).map((r) => r.articulo_id)),
      interesadosDe: Object.fromEntries((conteo || []).map((r) => [r.articulo_id, r.cantidad])),
      colegioDe: new Map((cursos || []).map((c) => [c.id, c.colegio_id])),
    });
  }, [cursoIds, userId]);
  useEffect(() => {
    cargar();
  }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const verContacto = async (a) => {
    setContactos({ titulo: `${a.titulo} · ${fmtPrecio(a)}`, lista: null });
    const { data } = await supabase.rpc("contacto_articulo", { p_id: a.id });
    setContactos({ titulo: `${a.titulo} · ${fmtPrecio(a)}`, lista: data?.length ? data : [{ nombre: "—" }] });
  };
  const verInteresados = async (a) => {
    setContactos({ titulo: a.titulo, lista: null, interesados: true });
    const { data } = await supabase.rpc("interesados_articulo", { p_id: a.id });
    setContactos({ titulo: a.titulo, lista: data || [], interesados: true });
  };
  const abrirVendido = async (a) => {
    setVendiendo({ articulo: a, lista: null });
    const { data } = await supabase.rpc("interesados_articulo", { p_id: a.id });
    setVendiendo({ articulo: a, lista: data || [] });
  };
  const marcarVendido = async (comprador) => {
    await supabase.from("marketplace_articulos").update({ estado: "vendido", vendido_en: new Date().toISOString(), comprador_id: comprador || null }).eq("id", vendiendo.articulo.id);
    setVendiendo(null);
    setAbierto(null);
    cargar();
  };
  const renovar = async (a) => {
    await supabase.from("marketplace_articulos").update({ vence_en: new Date(Date.now() + DIAS_VIGENCIA * 86400000).toISOString() }).eq("id", a.id);
    setAbierto(null);
    cargar();
  };
  const borrar = (a) =>
    Alert.alert("Borrar publicación", "¿Seguro?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase.from("marketplace_articulos").delete().eq("id", a.id);
          if (error) { Alert.alert("No se pudo borrar", error.message); return; }
          borrarArchivos(a.fotos, "adjuntos");
          setAbierto(null);
          cargar();
        },
      },
    ]);

  const visibles = useMemo(() => ordenar((datos?.articulos || []).filter((a) => estaVisible(a) || a.publicado_por === userId)), [datos, userId]);
  if (!datos) return <View style={styles.screen}><Text style={styles.cargando}>Cargando…</Text></View>;
  const lista = visibles.filter((a) => (cat === "todas" || a.categoria === cat) && (!soloRegalos || a.es_regalo) && (!mios || a.publicado_por === userId) && coincideBusqueda(a, busqueda));

  const chip = (on, label, onPress, key) => (
    <Pressable key={key || label} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={lista}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={styles.fila}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
        renderItem={({ item: a }) => <Tarjeta a={a} tag={tagDeCurso(a.curso_id)} onPress={() => setAbierto(a)} />}
        ListHeaderComponent={
          <View>
            <View style={styles.buscarRow}>
              <TextInput value={busqueda} onChangeText={setBusqueda} placeholder="Buscar: buzo, talle 10…" placeholderTextColor={t.placeholder} style={[styles.input, styles.flex1]} />
              {cursosPublicar.length ? <Button title="+ Publicar" size="sm" onPress={() => setNuevo(true)} /> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {[{ k: "todas", l: "Todo", e: "" }, ...CATEGORIAS].map((c) => chip(cat === c.k, `${c.e} ${c.l}`.trim(), () => setCat(c.k), c.k))}
              {chip(soloRegalos, "🎁 Regalos", () => setSoloRegalos(!soloRegalos))}
              {chip(mios, "Mis publicaciones", () => setMios(!mios))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <EmptyState emoji="🛍️" title={visibles.length ? "No hay nada con esos filtros" : "Todavía no hay nada publicado"} note="¿Tenés un uniforme que ya no le entra, libros del año pasado o un disfraz? Publicalo." />
        }
      />
      {abierto ? (
        <DetalleSheet
          a={abierto}
          userId={userId}
          yaMeInteresa={datos.misInteres.has(abierto.id)}
          nInteresados={datos.interesadosDe[abierto.id] || 0}
          tag={tagDeCurso(abierto.curso_id)}
          onClose={() => setAbierto(null)}
          onMeInteresa={() => { setInteresando(abierto); setAbierto(null); }}
          onVerContacto={() => { const a = abierto; setAbierto(null); verContacto(a); }}
          onVerInteresados={() => { const a = abierto; setAbierto(null); verInteresados(a); }}
          onVendido={() => { const a = abierto; setAbierto(null); abrirVendido(a); }}
          onRenovar={() => renovar(abierto)}
          onBorrar={() => borrar(abierto)}
        />
      ) : null}
      {interesando ? (
        <InteresSheet
          a={interesando}
          userId={userId}
          onClose={() => setInteresando(null)}
          onListo={() => { const a = interesando; setInteresando(null); cargar(); verContacto(a); }}
        />
      ) : null}
      {contactos ? (
        <Sheet visible onClose={() => setContactos(null)} title={contactos.interesados ? "🙋 Interesados" : "📞 Contacto del vendedor"}>
          <Text style={styles.contactoTitulo}>{contactos.titulo}</Text>
          <ScrollView style={styles.sheetScroll}>
            {!contactos.lista ? <Text style={styles.cargando}>Cargando…</Text> : contactos.lista.map((c, i) => <ContactoCard key={c.usuario_id || i} c={c} />)}
          </ScrollView>
        </Sheet>
      ) : null}
      {vendiendo ? (
        <Sheet visible onClose={() => setVendiendo(null)} title="✓ Marcar como vendido">
          <ScrollView style={styles.sheetScroll}>
            <Text style={styles.contactoTitulo}>{vendiendo.articulo.titulo}</Text>
            {!vendiendo.lista ? <Text style={styles.cargando}>Cargando…</Text> : (
              <>
                {vendiendo.lista.length ? <Text style={styles.label}>¿A quién se lo vendiste? (opcional)</Text> : null}
                {vendiendo.lista.map((x) => (
                  <Pressable key={x.usuario_id} onPress={() => marcarVendido(x.usuario_id)} style={styles.opcionComprador}>
                    <Text style={styles.opcionTxt}>{x.nombre}</Text>
                  </Pressable>
                ))}
                <Button title={vendiendo.lista.length ? "A otra persona / prefiero no decirlo" : "Marcar vendido"} variant={vendiendo.lista.length ? "secondary" : "primary"} onPress={() => marcarVendido(null)} style={styles.mtMd} />
                <Text style={styles.hint}>Se sigue viendo una semana marcado como vendido y después desaparece.</Text>
              </>
            )}
          </ScrollView>
        </Sheet>
      ) : null}
      {nuevo ? (
        <NuevoSheet cursos={cursosPublicar} colegioDe={datos.colegioDe} userId={userId} onClose={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />
      ) : null}
    </View>
  );
}

function Tarjeta({ a, tag, onPress }) {
  const cat = categoria(a.categoria);
  const vendido = a.estado === "vendido";
  return (
    <Pressable onPress={onPress} style={[styles.tarjeta, vendido && styles.vendido]} accessibilityRole="button" accessibilityLabel={`${a.titulo}, ${fmtPrecio(a)}`}>
      <View style={styles.tarjetaFoto}>
        {a.fotos?.[0] ? <SignedImage src={a.fotos[0]} bucket="adjuntos" style={styles.fotoLlena} resizeMode="cover" /> : <Text style={styles.fotoEmoji}>{cat.e}</Text>}
        {vendido ? <Text style={styles.badgeVendido}>VENDIDO</Text> : null}
        {a.es_colegio ? <Text style={styles.badgeColegio}>🏫</Text> : null}
      </View>
      <View style={styles.tarjetaBody}>
        <Text style={[styles.precio, a.es_regalo && styles.regalo]}>{fmtPrecio(a)}</Text>
        <Text style={styles.tarjetaTitulo} numberOfLines={2}>{a.titulo}</Text>
        <Text style={styles.meta} numberOfLines={1}>{[tag?.nombre, condicion(a.condicion).l, a.talle ? `T. ${a.talle}` : null].filter(Boolean).join(" · ")}</Text>
      </View>
    </Pressable>
  );
}

function DetalleSheet({ a, userId, yaMeInteresa, nInteresados, tag, onClose, onMeInteresa, onVerContacto, onVerInteresados, onVendido, onRenovar, onBorrar }) {
  const [foto, setFoto] = useState(0);
  const cat = categoria(a.categoria);
  const propio = a.publicado_por === userId;
  const vendido = a.estado === "vendido";
  const dias = diasParaVencer(a);
  return (
    <Sheet visible onClose={onClose} title={a.titulo}>
      <ScrollView style={styles.sheetScroll}>
        {a.fotos?.length ? (
          <View>
            <SignedImage src={a.fotos[foto]} bucket="adjuntos" style={styles.fotoGrande} resizeMode="contain" />
            {a.fotos.length > 1 ? (
              <View style={styles.miniaturas}>
                {a.fotos.map((f, i) => (
                  <Pressable key={f} onPress={() => setFoto(i)} style={[styles.miniatura, i === foto && styles.miniaturaOn]} accessibilityLabel={`Foto ${i + 1}`}>
                    <SignedImage src={f} bucket="adjuntos" style={styles.fotoLlena} resizeMode="cover" />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <Text style={[styles.precioGrande, a.es_regalo && styles.regalo]}>{fmtPrecio(a)}</Text>
        <View style={styles.badges}>
          {vendido ? <Text style={[styles.pill, styles.pillVendido]}>VENDIDO</Text> : null}
          <Text style={styles.pill}>{cat.e} {cat.l}</Text>
          <Text style={styles.pill}>{condicion(a.condicion).l}</Text>
          {a.talle ? <Text style={styles.pill}>Talle {a.talle}</Text> : null}
          {a.es_colegio ? <Text style={styles.pill}>🏫 Colegio</Text> : null}
        </View>
        {a.descripcion ? <Text style={styles.desc}>{a.descripcion}</Text> : null}
        <Text style={styles.meta}>
          {[tag?.nombre, a.alcance === "colegio" ? "todo el colegio" : "su curso", `publicado ${hace(a.creado_en)}`, propio && !vendido ? (dias > 0 ? `vence en ${dias} días` : "venció") : null].filter(Boolean).join(" · ")}
        </Text>

        {!propio && !vendido && !yaMeInteresa && estaDisponible(a) ? <Button title="🙋 Me interesa" onPress={onMeInteresa} style={styles.mtMd} /> : null}
        {!propio && yaMeInteresa ? <Button title="📞 Ver contacto del vendedor" variant="secondary" onPress={onVerContacto} style={styles.mtMd} /> : null}
        {!propio && !yaMeInteresa && nInteresados > 0 && !vendido ? (
          <Text style={styles.yaHay}>🙋 {nInteresados === 1 ? "Ya hay 1 interesado" : `Ya hay ${nInteresados} interesados`}</Text>
        ) : null}

        {propio ? (
          <View style={styles.gestion}>
            {nInteresados > 0 ? <Button title={`🙋 ${nInteresados} ${nInteresados === 1 ? "interesado" : "interesados"}`} variant="secondary" size="sm" onPress={onVerInteresados} /> : null}
            {!vendido ? <Button title="✓ Vendido" variant="secondary" size="sm" onPress={onVendido} /> : null}
            {!vendido && dias <= 10 ? <Button title={`↻ Renovar ${DIAS_VIGENCIA} días`} variant="secondary" size="sm" onPress={onRenovar} /> : null}
            <Pressable onPress={onBorrar} hitSlop={8} style={styles.borrar}><Text style={styles.borrarTxt}>Borrar</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
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

function InteresSheet({ a, userId, onClose, onListo }) {
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setEnviando(true);
    const { error } = await supabase.from("marketplace_interesados").insert({ articulo_id: a.id, usuario_id: userId, mensaje: sanitize(mensaje) || null });
    if (error) { setEnviando(false); Alert.alert("No se pudo avisar", "Probá de nuevo."); return; }
    if (a.publicado_por) await sendPush({ type: "marketplace", payload: { titulo: `Alguien está interesado en: ${a.titulo}`, userIds: [a.publicado_por] } });
    setEnviando(false);
    onListo();
  };
  return (
    <Sheet visible onClose={onClose} title="🙋 Me interesa">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <Text style={styles.hint}>Le avisamos a quien lo publicó y se comparten los contactos de los dos para que se pongan de acuerdo.</Text>
        <TextInput value={mensaje} onChangeText={setMensaje} placeholder="Mensaje (opcional): ¿sigue disponible?" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea, styles.mtMd]} />
        <Button title={enviando ? "Avisando…" : "Avisar y ver el contacto"} onPress={enviar} disabled={enviando} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

function NuevoSheet({ cursos, colegioDe, userId, onClose, onCreado }) {
  const [form, setForm] = useState({ titulo: "", descripcion: "", categoria: "uniformes", condicion: "usado", talle: "", es_regalo: false, precio: "", alcance: "colegio", curso_id: cursos[0]?.id || null });
  const [fotos, setFotos] = useState([]); // paths ya subidos
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const colegio = colegioDe.get(form.curso_id);

  const agregarFoto = async () => {
    setSubiendo(true);
    try {
      const r = await pickAndUploadImage({ bucket: "adjuntos", pathPrefix: `marketplace/${colegio}/` });
      if (r?.url) setFotos((p) => [...p, r.url].slice(0, MAX_FOTOS));
    } catch (e) {
      Alert.alert("No se pudo subir la foto", e?.message || "Probá de nuevo.");
    }
    setSubiendo(false);
  };
  const quitarFoto = (path) => {
    setFotos((p) => p.filter((x) => x !== path));
    borrarArchivos([path], "adjuntos");
  };
  const cerrar = () => {
    if (fotos.length) borrarArchivos(fotos, "adjuntos"); // subidas y descartadas
    onClose();
  };
  const publicar = async () => {
    if (!form.titulo.trim()) { Alert.alert("Falta qué es", "Ej: Buzo del uniforme talle 10."); return; }
    const precio = Number(String(form.precio).replace(/\./g, "").replace(",", "."));
    if (!form.es_regalo && (!form.precio || !Number.isFinite(precio) || precio < 0)) { Alert.alert("Falta el precio", "Poné el precio o marcá \"Lo regalo\"."); return; }
    if (!fotos.length) { Alert.alert("Falta una foto", "Es lo primero que se mira."); return; }
    if (!form.curso_id) { Alert.alert("Elegí el curso"); return; }
    setGuardando(true);
    const { error } = await supabase.from("marketplace_articulos").insert({
      titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null, categoria: form.categoria,
      condicion: form.condicion, talle: sanitize(form.talle) || null, es_regalo: form.es_regalo,
      precio: form.es_regalo ? null : precio, fotos, alcance: form.alcance, curso_id: form.curso_id,
      colegio_id: colegio, publicado_por: userId, es_colegio: false,
    });
    setGuardando(false);
    if (error) { Alert.alert("No se pudo publicar", error.message); return; }
    onCreado();
  };
  const chip = (on, label, onPress, key) => (
    <Pressable key={key || label} onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
  return (
    <Sheet visible onClose={cerrar} title="Publicar en el Marketplace">
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
        <Text style={styles.label}>Fotos (hasta {MAX_FOTOS})</Text>
        <View style={styles.fotosRow}>
          {fotos.map((f) => (
            <Pressable key={f} onPress={() => quitarFoto(f)} style={styles.fotoPreview} accessibilityLabel="Quitar foto">
              <SignedImage src={f} bucket="adjuntos" style={styles.fotoLlena} resizeMode="cover" />
              <Text style={styles.quitar}>✕</Text>
            </Pressable>
          ))}
          {fotos.length < MAX_FOTOS ? (
            <Pressable onPress={agregarFoto} disabled={subiendo} style={[styles.fotoPreview, styles.fotoAgregar]} accessibilityLabel="Agregar foto">
              <Text style={styles.fotoAgregarTxt}>{subiendo ? "…" : "+"}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.label}>Qué es</Text>
        <TextInput value={form.titulo} onChangeText={(v) => set("titulo", v)} placeholder="Ej: Buzo del uniforme talle 10" placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Categoría</Text>
        <View style={styles.wrap}>{CATEGORIAS.map((c) => chip(form.categoria === c.k, `${c.e} ${c.l}`, () => set("categoria", c.k), c.k))}</View>
        <Text style={styles.label}>Estado</Text>
        <View style={styles.wrap}>{CONDICIONES.map((c) => chip(form.condicion === c.k, c.l, () => set("condicion", c.k), c.k))}</View>
        <Text style={styles.label}>Talle (opcional)</Text>
        <TextInput value={form.talle} onChangeText={(v) => set("talle", v)} placeholder="Ej: 10" placeholderTextColor={t.placeholder} style={styles.input} />
        <Text style={styles.label}>Precio</Text>
        <View style={styles.precioRow}>
          <TextInput value={form.precio} onChangeText={(v) => set("precio", v)} editable={!form.es_regalo} keyboardType="decimal-pad" placeholder="$ 15000" placeholderTextColor={t.placeholder} style={[styles.input, styles.flex1, form.es_regalo && styles.deshabilitado]} />
          {chip(form.es_regalo, `${form.es_regalo ? "✓ " : ""}🎁 Lo regalo`, () => set("es_regalo", !form.es_regalo))}
        </View>
        <Text style={styles.label}>Detalle (opcional)</Text>
        <TextInput value={form.descripcion} onChangeText={(v) => set("descripcion", v)} placeholder="Marca, cómo está, dónde se retira…" placeholderTextColor={t.placeholder} multiline style={[styles.input, styles.textarea]} />
        <Text style={styles.label}>¿Quién lo ve?</Text>
        <View style={styles.wrap}>
          {chip(form.alcance === "colegio", "Todo el colegio", () => set("alcance", "colegio"))}
          {chip(form.alcance === "curso", "Mi curso", () => set("alcance", "curso"))}
        </View>
        {cursos.length > 1 ? <View style={styles.wrap}>{cursos.map((c) => chip(form.curso_id === c.id, c.nombre, () => set("curso_id", c.id), c.id))}</View> : null}
        <Text style={styles.hint}>Se ve {DIAS_VIGENCIA} días (lo podés renovar). Cuando alguien toca “Me interesa” te avisamos y se comparten los contactos. El pago lo arreglan entre ustedes.</Text>
        <Button title={guardando ? "Publicando…" : "Publicar"} onPress={publicar} disabled={guardando || subiendo} style={styles.mtMd} />
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { paddingHorizontal: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  cargando: { textAlign: "center", color: t.textFaint, padding: 30 },
  flex1: { flex: 1, minWidth: 0 },
  buscarRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm },
  chips: { gap: 6, paddingBottom: SPACE.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACE.sm },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipOn: { borderColor: t.accent, backgroundColor: "#EFF6FF" },
  chipTxt: { fontSize: 12.5, fontWeight: "600", color: t.textMuted },
  chipTxtOn: { color: t.accent },
  fila: { justifyContent: "space-between" },
  tarjeta: { width: "48%", marginBottom: SPACE.md, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, overflow: "hidden" },
  vendido: { opacity: 0.6 },
  tarjetaFoto: { aspectRatio: 1, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  fotoLlena: { width: "100%", height: "100%" },
  fotoEmoji: { fontSize: 38 },
  badgeVendido: { position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: "800", color: "white", backgroundColor: "#0F172A", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  badgeColegio: { position: "absolute", top: 6, right: 8, fontSize: 14 },
  tarjetaBody: { padding: 10 },
  precio: { fontSize: 15, fontWeight: "900", color: t.textStrong },
  regalo: { color: "#047857" },
  tarjetaTitulo: { fontSize: 13, fontWeight: "600", color: t.text, marginTop: 2, lineHeight: 17 },
  meta: { fontSize: 11.5, color: t.textFaint, marginTop: 4 },
  fotoGrande: { width: "100%", height: 260, borderRadius: RADIUS.lg, backgroundColor: "#F1F5F9" },
  miniaturas: { flexDirection: "row", gap: 6, marginTop: 6 },
  miniatura: { width: 54, height: 54, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  miniaturaOn: { borderColor: t.accent },
  precioGrande: { fontSize: 22, fontWeight: "900", color: t.textStrong, marginTop: SPACE.md },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginVertical: SPACE.sm },
  pill: { fontSize: 12, color: t.textMuted, backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  pillVendido: { backgroundColor: "#0F172A", color: "white", fontWeight: "800" },
  desc: { fontSize: 13.5, color: t.text, lineHeight: 19, marginTop: 4 },
  yaHay: { fontSize: 12.5, color: t.textMuted, textAlign: "center", marginTop: SPACE.sm },
  gestion: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: SPACE.lg, paddingTop: SPACE.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
  borrar: { marginLeft: "auto", padding: 6 },
  borrarTxt: { color: t.danger, fontSize: 13, fontWeight: "700" },
  sheetScroll: { flexShrink: 1 },
  label: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 4, marginTop: SPACE.sm },
  input: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: t.text, backgroundColor: "#F8FAFC" },
  textarea: { minHeight: 64, textAlignVertical: "top" },
  deshabilitado: { opacity: 0.4 },
  precioRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  hint: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
  mtMd: { marginTop: SPACE.md },
  fotosRow: { flexDirection: "row", gap: SPACE.sm, flexWrap: "wrap" },
  fotoPreview: { width: 72, height: 72, borderRadius: 10, overflow: "hidden", backgroundColor: "#F1F5F9" },
  fotoAgregar: { borderWidth: 1.5, borderStyle: "dashed", borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  fotoAgregarTxt: { fontSize: 26, color: t.textMuted },
  quitar: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "#0F172A", color: "white", fontSize: 11, textAlign: "center", lineHeight: 20, overflow: "hidden" },
  opcionComprador: { paddingVertical: 12, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, marginTop: 6 },
  opcionTxt: { fontSize: 14, fontWeight: "600", color: t.text },
  contactoTitulo: { fontSize: 12.5, color: t.textMuted, marginBottom: SPACE.sm },
  contacto: { padding: SPACE.md, borderRadius: RADIUS.lg, backgroundColor: "#F8FAFC", marginBottom: SPACE.sm },
  contactoNombre: { fontSize: 14, fontWeight: "700", color: t.text },
  contactoRow: { flexDirection: "row", gap: SPACE.md, marginTop: 4 },
  contactoLink: { fontSize: 13, color: "#2563EB", marginTop: 2 },
  contactoWa: { fontSize: 13, color: "#16A34A", marginTop: 2 },
});
