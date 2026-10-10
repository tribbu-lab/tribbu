// Mensajes (puerto RN de src/features/mensajes — ver specs/mensajes.md).
// Chat 1 a 1 entre apoderados que comparten curso + hilo de soporte con el
// equipo tribbu. Lista = RPC mis_conversaciones() (una request); chat en un
// Modal a pantalla completa (tapa header y tab bar, y el teclado se maneja
// con KeyboardAvoidingView). Tiempo real: un solo canal en (tabs)/_layout
// (lib/useMensajesNoLeidos) que reemite por DeviceEventEmitter.
// Privacidad: nunca se muestra teléfono ni email de otra familia.
import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import {
  View, Text, Pressable, TextInput, FlatList, Modal, KeyboardAvoidingView, Alert,
  ActivityIndicator, DeviceEventEmitter, Platform, StyleSheet, RefreshControl, Linking, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase } from "../../lib/supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { pickImages, uploadImage } from "../../lib/media";
import { EVENTO_MENSAJE, EVENTO_RESYNC, useMensajesCtx } from "../../lib/useMensajesNoLeidos";
import { useRecarga } from "../../lib/useRecarga";
import { uuidLite, safeUrl } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS, SLATE, BLUE, MIN_TOUCH, withAlpha } from "@shared/tokens";
import {
  MAX_TEXTO, MAX_FOTOS_MENSAJE, PAGINA_MENSAJES, MOTIVOS_DENUNCIA, motivoDenuncia, NORMAS_CHAT,
  AVISO_RETENCION, AVISO_SOPORTE, AVISO_DIAGNOSTICO, vistaPrevia, horaCorta, horaMensaje,
  fusionarMensajes, agruparPorDia, puedeEditar, firmaMensaje, limpiarTexto, filtrarFamilias,
  hijosDeFamilia, metaSoporte, pathFotoMensaje,
} from "@shared/mensajes";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Button } from "../../components/Button";
import { Sheet } from "../../components/Sheet";
import { EmptyState } from "../../components/EmptyState";
import { SignedImage } from "../../components/SignedImage";

const t = THEMES.light;
const SOPORTE_VACIO = { id: null, tipo: "soporte", titulo: "Soporte tribbu", ultimo_en: null, no_leidos: 0 };

// ── Piezas chicas ───────────────────────────────────────────────────────────

function Iniciales({ texto, icono, color = BLUE[500], size = 44 }) {
  const ini = (texto || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(color, 0.14) }]}>
      {icono
        ? <MaterialCommunityIcons name={icono} size={size * 0.5} color={color} />
        : <Text style={[s.avatarTxt, { color, fontSize: size * 0.36 }]}>{ini}</Text>}
    </View>
  );
}

// Texto con links tocables (solo http/https/www, pasados por safeUrl).
const URL_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
function TextoConLinks({ texto, style, colorLink }) {
  const partes = texto.split(URL_RE);
  return (
    <Text style={style} selectable>
      {partes.map((p, i) => {
        if (i % 2 === 1) {
          const href = safeUrl(p);
          return href
            ? <Text key={i} style={{ color: colorLink, textDecorationLine: "underline" }} onPress={() => Linking.openURL(href)}>{p}</Text>
            : <Text key={i}>{p}</Text>;
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

function VisorFoto({ path, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!path} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.visor} onPress={onClose}>
        {path ? <SignedImage src={path} bucket="adjuntos" style={s.visorImg} resizeMode="contain" /> : null}
        <Pressable onPress={onClose} style={[s.visorCerrar, { top: insets.top + 12 }]} accessibilityRole="button" accessibilityLabel="Cerrar">
          <MaterialCommunityIcons name="close" size={22} color="white" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Normas de convivencia ───────────────────────────────────────────────────

export function NormasSheet({ visible, userId, onAceptar, onCerrar }) {
  const [guardando, setGuardando] = useState(false);
  const aceptar = async () => {
    setGuardando(true);
    const { error } = await supabase.from("normas_chat_aceptadas").upsert({ usuario_id: userId }, { onConflict: "usuario_id" });
    setGuardando(false);
    if (error) { Alert.alert("No se pudo guardar", "Probá de nuevo."); return; }
    onAceptar();
  };
  return (
    <Sheet visible={visible} onClose={onCerrar} title="Normas de convivencia">
      <Text style={s.sheetIntro}>Antes de escribirle a otras familias, leé y aceptá estas reglas.</Text>
      {NORMAS_CHAT.map((n) => (
        <View key={n} style={s.normaRow}>
          <Text style={s.normaPunto}>•</Text>
          <Text style={s.normaTxt}>{n}</Text>
        </View>
      ))}
      <View style={s.sheetBotones}>
        <Button title="Ahora no" variant="outline" onPress={onCerrar} full={false} style={s.flex1} />
        <Button title="Acepto" onPress={aceptar} loading={guardando} full={false} style={s.flex1} />
      </View>
    </Sheet>
  );
}

// ── Denunciar ───────────────────────────────────────────────────────────────

function DenunciarSheet({ mensaje, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!motivo) { Alert.alert("Elegí un motivo"); return; }
    setEnviando(true);
    const { error } = await supabase.from("mensaje_denuncias").insert({ mensaje_id: mensaje.id, motivo, detalle: detalle.trim() || null });
    setEnviando(false);
    if (error) { Alert.alert(error.code === "23505" ? "Ya denunciaste este mensaje" : "No se pudo enviar la denuncia"); return; }
    onListo();
  };
  return (
    <Sheet visible={!!mensaje} onClose={onCerrar} title="Denunciar mensaje">
      <Text style={s.sheetIntro}>Lo revisa el colegio. Solo ve este mensaje, no el resto de la conversación. Quien lo escribió no se entera.</Text>
      {MOTIVOS_DENUNCIA.map((m) => (
        <Pressable key={m.k} onPress={() => setMotivo(m.k)} style={[s.opcion, motivo === m.k && s.opcionOn]} accessibilityRole="radio" accessibilityState={{ checked: motivo === m.k }}>
          <MaterialCommunityIcons name={motivo === m.k ? "radiobox-marked" : "radiobox-blank"} size={20} color={motivo === m.k ? t.accent : SLATE[400]} />
          <Text style={s.opcionTxt}>{m.label}</Text>
        </Pressable>
      ))}
      <TextInput value={detalle} onChangeText={(v) => setDetalle(v.slice(0, 500))} placeholder="Contanos más (opcional)" placeholderTextColor={t.placeholder} multiline style={s.inputArea} />
      <View style={s.sheetBotones}>
        <Button title="Cancelar" variant="outline" onPress={onCerrar} full={false} style={s.flex1} />
        <Button title="Denunciar" variant="danger" onPress={enviar} loading={enviando} full={false} style={s.flex1} />
      </View>
    </Sheet>
  );
}

// ── Nuevo mensaje: Familias · Maestras · Secretaría (o Alumnos, para la docente) ──

const PESTANAS_NUEVO = [
  { k: "familias", l: "Familias" },
  { k: "maestras", l: "Maestras" },
  { k: "secretaria", l: "Secretaría" },
];
const AYUDA_NUEVO = {
  familias: "Podés escribirle a las familias de los cursos de tus hijos.",
  maestras: "Un chat por cada hijo con cada maestra. El colegio puede leer estas conversaciones.",
  secretaria: "Un chat por cada hijo con la secretaría del colegio.",
  alumnos: "Escribile a la familia de un alumno. El colegio puede leer estas conversaciones.",
};
const sinAcentos = (v) => (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function FilaOpcion({ titulo, sub, avatar, onPress, deshabilitada, abriendo, nota, dot }) {
  return (
    <Pressable onPress={onPress} disabled={!!(deshabilitada || abriendo)} style={[s.filaFamilia, deshabilitada ? s.off : null]} accessibilityRole="button">
      {avatar}
      <View style={s.flex1}>
        <Text style={s.filaTitulo} numberOfLines={1}>{titulo}</Text>
        {sub ? (
          <View style={s.rowCenter}>
            {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
            <Text style={s.filaSub} numberOfLines={1}>{sub}</Text>
          </View>
        ) : null}
      </View>
      {abriendo ? <ActivityIndicator size="small" color={t.accent} /> : nota ? <Text style={s.notaChica}>{nota}</Text> : null}
    </Pressable>
  );
}

function NuevoMensajeSheet({ visible, esDocente, hijos = [], onCerrar, onFamilia, onDocente, onSecretaria, onAlumno, tagDeCurso }) {
  const [pestana, setPestana] = useState(esDocente ? "alumnos" : "familias");
  const [datos, setDatos] = useState({});
  const [q, setQ] = useState("");
  const [abriendo, setAbriendo] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    const rpc = { familias: "familias_para_mensaje", maestras: "docentes_para_mensaje", alumnos: "alumnos_para_docente" }[pestana];
    if (!rpc || datos[pestana]) return undefined;
    let vivo = true;
    supabase.rpc(rpc).then(({ data }) => { if (vivo) setDatos((d) => ({ ...d, [pestana]: data || [] })); });
    return () => { vivo = false; };
  }, [visible, pestana, datos]);

  const abrir = async (clave, fn) => {
    setAbriendo(clave);
    const ok = await fn();
    setAbriendo(null);
    if (!ok) Alert.alert("No se pudo abrir la conversación");
  };

  const tq = sinAcentos(q).trim();
  const coincide = (...c) => !tq || sinAcentos(c.join(" ")).includes(tq);
  let items = [];
  if (pestana === "familias" && datos.familias) {
    items = filtrarFamilias(datos.familias, q).map((f) => {
      const tag = tagDeCurso?.(f.curso_ids?.[0]);
      return { key: f.usuario_id, titulo: `${f.nombre} ${f.apellido || ""}`, sub: hijosDeFamilia(f) ? `Familia de ${hijosDeFamilia(f)}` : "Room Parent",
        dot: tag?.color, avatar: <Iniciales texto={`${f.nombre} ${f.apellido || ""}`} size={40} />, onPress: () => abrir(f.usuario_id, () => onFamilia(f)) };
    });
  } else if (pestana === "maestras" && datos.maestras) {
    items = datos.maestras.filter((d) => coincide(d.nombre, d.apellido, d.materia, d.hijo_nombre)).map((d) => {
      const k = `${d.hijo_id}-${d.maestro_id}`;
      return { key: k, titulo: `${d.nombre} ${d.apellido || ""}`, sub: [d.materia, `Sobre ${d.hijo_nombre}`].filter(Boolean).join(" · "),
        avatar: <Iniciales icono="human-male-board" color={SLATE[600]} size={40} />, deshabilitada: !d.tiene_cuenta,
        nota: d.tiene_cuenta ? null : "Todavía no usa tribbu", onPress: () => abrir(k, () => onDocente(d)) };
    });
  } else if (pestana === "secretaria") {
    items = hijos.map((h) => ({ key: h.id, titulo: `Secretaría · sobre ${h.nombre}`, sub: h.curso,
      avatar: <Iniciales icono="school-outline" color={SLATE[600]} size={40} />, onPress: () => abrir(h.id, () => onSecretaria(h)) }));
  } else if (pestana === "alumnos" && datos.alumnos) {
    items = datos.alumnos.filter((a) => coincide(a.nombre, a.apellido, a.curso_nombre)).map((a) => {
      const k = `${a.hijo_id}-${a.maestro_id}`;
      return { key: k, titulo: `Familia de ${a.nombre} ${a.apellido || ""}`, sub: a.curso_nombre,
        avatar: <Iniciales texto={`${a.nombre} ${a.apellido || ""}`} size={40} />, onPress: () => abrir(k, () => onAlumno(a)) };
    });
  }
  const cargando = pestana !== "secretaria" && !datos[pestana];

  return (
    <Sheet visible={visible} onClose={onCerrar} title="Nuevo mensaje" style={s.sheetAlto}>
      {!esDocente ? (
        <View style={s.tabs} accessibilityRole="tablist">
          {PESTANAS_NUEVO.map((p) => (
            <Pressable key={p.k} onPress={() => { setPestana(p.k); setQ(""); }} style={[s.tab, pestana === p.k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: pestana === p.k }}>
              <Text style={[s.tabTxt, pestana === p.k && s.tabTxtOn]}>{p.l}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {pestana !== "secretaria" ? (
        <TextInput value={q} onChangeText={setQ} placeholder={pestana === "alumnos" ? "Buscar alumno" : "Buscar por nombre"} placeholderTextColor={t.placeholder} style={s.input} autoCorrect={false} accessibilityLabel="Buscar" />
      ) : null}
      <Text style={s.nota}>{AYUDA_NUEVO[pestana]}</Text>
      {cargando ? <ActivityIndicator style={{ marginTop: SPACE.lg }} color={t.accent} /> : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.key}
          keyboardShouldPersistTaps="handled"
          style={s.flexShrink}
          ListEmptyComponent={<Text style={s.vacioTxt}>{tq ? "No encontramos a nadie con ese nombre." : pestana === "maestras" ? "Tu colegio todavía no cargó las maestras de este curso." : "No hay nadie acá todavía."}</Text>}
          renderItem={({ item: i }) => <FilaOpcion {...i} abriendo={abriendo === i.key} />}
        />
      )}
    </Sheet>
  );
}

// ── Burbuja ─────────────────────────────────────────────────────────────────

const Burbuja = memo(function Burbuja({ m, mio, firma, primero, seleccionado, onTocar, onVerFoto, onReintentar }) {
  const borrado = !!m.borrado_en;
  const fotos = m.fotos || [];
  const previews = m._previews || [];
  const nFotos = fotos.length || previews.length;
  const lado = nFotos > 1 ? 118 : 220;
  return (
    <View style={[s.burbujaWrap, mio ? s.derecha : s.izquierda, primero ? s.mt8 : s.mt2]}>
      {firma ? <Text style={s.firma}>{firma}</Text> : null}
      <Pressable onPress={borrado ? undefined : onTocar} onLongPress={borrado ? undefined : onTocar} delayLongPress={250}
        style={[s.burbuja, borrado ? s.burbujaBorrada : mio ? s.burbujaMia : s.burbujaOtra, mio && primero && s.esqDer, !mio && primero && s.esqIzq,
          nFotos && !m.texto ? s.burbujaSoloFoto : null, m._estado === "enviando" && s.enviando, seleccionado && s.seleccionada]}
        accessibilityRole="button" accessibilityHint="Tocá para ver opciones">
        {borrado ? <Text style={s.borradoTxt}>Mensaje eliminado</Text> : (
          <>
            {nFotos ? (
              <View style={[s.fotosGrid, m.texto ? s.mb6 : null]}>
                {fotos.length ? fotos.map((p) => (
                  <Pressable key={p} onPress={() => onVerFoto(p)} accessibilityRole="imagebutton" accessibilityLabel="Ver foto">
                    <SignedImage src={p} bucket="adjuntos" miniatura style={{ width: lado, height: lado, borderRadius: 12 }} />
                  </Pressable>
                )) : previews.map((u) => <SignedImagePreview key={u} uri={u} lado={lado} />)}
              </View>
            ) : null}
            {m.texto ? <TextoConLinks texto={m.texto} style={[s.msgTxt, mio && s.msgTxtMio, nFotos ? s.px6 : null]} colorLink={mio ? "white" : t.accent} /> : null}
          </>
        )}
      </Pressable>
      <View style={s.metaRow}>
        {m._estado === "error" ? (
          <Pressable onPress={onReintentar} hitSlop={8}><Text style={s.errorMeta}>No se envió · Reintentar</Text></Pressable>
        ) : (
          <Text style={s.metaTxt}>{m._estado === "enviando" ? "Enviando…" : `${horaMensaje(m.creado_en)}${m.editado_en && !borrado ? " · editado" : ""}`}</Text>
        )}
      </View>
    </View>
  );
});

// Vista previa local (antes de subir) — Image directo, la URI es del dispositivo.
function SignedImagePreview({ uri, lado }) {
  return <Image source={{ uri }} style={{ width: lado, height: lado, borderRadius: 12 }} />;
}

// ── Chat ────────────────────────────────────────────────────────────────────

/**
 * conv: { id, tipo, titulo, subtitulo, otro_id, silenciado, bloqueado, estado }
 * modo: "familia" | "staff" (super en la bandeja de soporte).
 */
export function ChatConversacion({ conv, userId, modo = "familia", rolPropio = null, soloLectura = false, normasOk = true, onPedirNormas, onCerrar, onCambio, meta, encabezadoExtra }) {
  const insets = useSafeAreaInsets();
  const [mensajes, setMensajes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [hayMas, setHayMas] = useState(false);
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState([]); // assets de pickImages
  const [enviandoAlgo, setEnviandoAlgo] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  const [editando, setEditando] = useState(null);
  const [denunciar, setDenunciar] = useState(null);
  const [visor, setVisor] = useState(null);
  const [menu, setMenu] = useState(false);
  const [silenciado, setSilenciado] = useState(!!conv.silenciado);
  const [bloqueado, setBloqueado] = useState(!!conv.bloqueado);
  const [estado, setEstado] = useState(conv.estado || "abierta");
  const mensajesRef = useRef([]);
  const staff = modo === "staff";
  // Lado institucional: qué rol_autor cuenta como "mío" (soporte / colegio).
  const rolStaff = rolPropio || (staff ? "soporte" : null);
  // Hilos con más de dos personas: cada mensaje lleva quién lo firmó.
  const multi = conv.tipo === "curso" || conv.tipo === "colegio" || conv.tipo === "docente";
  const [nombres, setNombres] = useState({});
  const nombresRef = useRef({});
  const cargarNombres = useCallback(async () => {
    const { data } = await supabase.rpc("autores_conversacion", { p_conv: conv.id });
    const map = Object.fromEntries((data || []).map((a) => [a.usuario_id, a.nombre]));
    nombresRef.current = map;
    setNombres(map);
  }, [conv.id]);
  useEffect(() => { if (multi) cargarNombres(); }, [multi, cargarNombres]);
  const esSoporte = conv.tipo === "soporte";
  const necesitaNormas = !staff && (conv.tipo === "directo" || conv.tipo === "curso") && !normasOk;

  const marcarLeido = useCallback(async (lista) => {
    const ultimo = lista.length ? new Date(lista[lista.length - 1].creado_en).getTime() : 0;
    const en = new Date(Math.max(Date.now(), ultimo + 1)).toISOString();
    await supabase.from("conversacion_miembros").upsert(
      { conversacion_id: conv.id, usuario_id: userId, ultimo_leido_en: en }, { onConflict: "conversacion_id,usuario_id" });
    onCambio?.();
  }, [conv.id, userId, onCambio]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("mensajes").select("*")
        .eq("conversacion_id", conv.id).order("creado_en", { ascending: false }).limit(PAGINA_MENSAJES);
      if (!vivo) return;
      if (error) { setCargando(false); Alert.alert("No se pudieron cargar los mensajes"); return; }
      const lista = (data || []).reverse();
      setMensajes(lista);
      setHayMas((data || []).length === PAGINA_MENSAJES);
      setCargando(false);
      marcarLeido(lista);
    })();
    return () => { vivo = false; };
  }, [conv.id, marcarLeido]);

  useEffect(() => { mensajesRef.current = mensajes; }, [mensajes]);

  useEffect(() => {
    const subMsg = DeviceEventEmitter.addListener(EVENTO_MENSAJE, ({ row }) => {
      if (!row || row.conversacion_id !== conv.id) return;
      const nuevo = !mensajesRef.current.some((m) => m.id === row.id);
      setMensajes((prev) => fusionarMensajes(prev, [row]));
      if (nuevo && row.autor_id !== userId) marcarLeido([row]);
      if (nuevo && multi && row.autor_id && !nombresRef.current[row.autor_id]) cargarNombres();
    });
    const subResync = DeviceEventEmitter.addListener(EVENTO_RESYNC, async () => {
      const lista = mensajesRef.current;
      const desde = lista.length ? lista[lista.length - 1].creado_en : null;
      let q = supabase.from("mensajes").select("*").eq("conversacion_id", conv.id).order("creado_en", { ascending: true }).limit(200);
      if (desde) q = q.gte("creado_en", desde);
      const { data } = await q;
      if (data?.length) setMensajes((prev) => fusionarMensajes(prev, data));
    });
    return () => { subMsg.remove(); subResync.remove(); };
  }, [conv.id, userId, marcarLeido, multi, cargarNombres]);

  const cargarAnteriores = useCallback(async () => {
    const primero = mensajesRef.current[0];
    if (!primero || !hayMas) return;
    const { data } = await supabase.from("mensajes").select("*").eq("conversacion_id", conv.id)
      .lt("creado_en", primero.creado_en).order("creado_en", { ascending: false }).limit(PAGINA_MENSAJES);
    setHayMas((data || []).length === PAGINA_MENSAJES);
    if (data?.length) setMensajes((prev) => fusionarMensajes(prev, data));
  }, [conv.id, hayMas]);

  const elegirFotos = async () => {
    try {
      const assets = await pickImages({ max: MAX_FOTOS_MENSAJE - fotos.length });
      if (assets.length) setFotos((prev) => [...prev, ...assets].slice(0, MAX_FOTOS_MENSAJE));
    } catch (e) {
      Alert.alert("No se pudo elegir la foto", e.message);
    }
  };

  const enviarMensaje = async (id, tx, assets) => {
    let paths = [];
    if (assets.length) {
      try {
        const subidas = await Promise.all(assets.map((a, i) => uploadImage(a, { bucket: "adjuntos", path: pathFotoMensaje(conv.id, i) })));
        paths = subidas.map((r) => r.url);
      } catch {
        return { error: "No se pudo subir una de las fotos." };
      }
    }
    const { data, error } = await supabase.from("mensajes").insert({ id, conversacion_id: conv.id, texto: tx || null, fotos: paths }).select().single();
    if (error) {
      borrarArchivos(paths, "adjuntos");
      return { error: "No se pudo enviar el mensaje." };
    }
    if (esSoporte && !staff && meta) {
      await supabase.from("soporte_diagnosticos").insert({ mensaje_id: id, conversacion_id: conv.id, datos: meta() });
    }
    return { data };
  };

  const enviar = async (reintento) => {
    const tx = reintento ? reintento.texto : limpiarTexto(texto);
    const assets = reintento ? reintento.assets : fotos;
    if (!tx && !assets.length) return;
    if (necesitaNormas) { onPedirNormas?.(); return; }
    const id = reintento?.id || uuidLite();
    const optimista = {
      id, conversacion_id: conv.id, autor_id: userId, rol_autor: rolStaff || "usuario", texto: tx || null, fotos: [],
      creado_en: reintento?.creado_en || new Date().toISOString(), _estado: "enviando",
      _previews: assets.map((a) => a.uri), _reintento: { id, texto: tx, assets },
    };
    setMensajes((prev) => fusionarMensajes(prev, [optimista]));
    if (!reintento) { setTexto(""); setFotos([]); }
    setEnviandoAlgo(true);
    const r = await enviarMensaje(id, tx, assets);
    setEnviandoAlgo(false);
    if (r.error) {
      setMensajes((prev) => prev.map((m) => (m.id === id ? { ...m, _estado: "error" } : m)));
      return;
    }
    setMensajes((prev) => fusionarMensajes(prev, [{ ...r.data, _previews: undefined, _reintento: undefined }]));
    onCambio?.();
  };

  const guardarEdicion = async () => {
    const tx = limpiarTexto(editando.texto);
    if (!tx) return;
    const { data, error } = await supabase.from("mensajes").update({ texto: tx }).eq("id", editando.id).select().single();
    if (error) { Alert.alert("No se pudo editar el mensaje"); return; }
    setMensajes((prev) => fusionarMensajes(prev, [data]));
    setEditando(null);
  };

  const eliminar = (m) => {
    Alert.alert("¿Eliminar este mensaje?", "Se va a ver como “Mensaje eliminado”.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        const { data, error } = await supabase.from("mensajes").update({ borrado_en: new Date().toISOString() }).eq("id", m.id).select().single();
        if (error) { Alert.alert("No se pudo eliminar el mensaje"); return; }
        borrarArchivos(m.fotos || [], "adjuntos");
        setMensajes((prev) => fusionarMensajes(prev, [data]));
        onCambio?.();
      } },
    ]);
  };

  const toggleSilencio = async () => {
    setMenu(false);
    const nuevo = !silenciado;
    const { error } = await supabase.from("conversacion_miembros").upsert(
      { conversacion_id: conv.id, usuario_id: userId, silenciado: nuevo }, { onConflict: "conversacion_id,usuario_id" });
    if (error) { Alert.alert("No se pudo cambiar"); return; }
    setSilenciado(nuevo);
    onCambio?.();
  };

  const cambiarBloqueo = async (bloquear) => {
    const { error } = bloquear
      ? await supabase.from("usuario_bloqueos").insert({ usuario_id: userId, bloqueado_id: conv.otro_id })
      : await supabase.from("usuario_bloqueos").delete().eq("usuario_id", userId).eq("bloqueado_id", conv.otro_id);
    if (error) { Alert.alert("No se pudo cambiar el bloqueo"); return; }
    setBloqueado(bloquear);
    onCambio?.();
  };
  const toggleBloqueo = () => {
    setMenu(false);
    if (!conv.otro_id) return;
    if (bloqueado) { cambiarBloqueo(false); return; }
    Alert.alert(`¿Bloquear a ${conv.titulo}?`, "No va a poder escribirte y no vas a ver sus mensajes en grupos. No se le avisa.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Bloquear", style: "destructive", onPress: () => cambiarBloqueo(true) },
    ]);
  };

  const cambiarEstadoSoporte = async () => {
    setMenu(false);
    const nuevo = estado === "resuelta" ? "abierta" : "resuelta";
    const { error } = await supabase.rpc("marcar_soporte", { p_conv: conv.id, p_estado: nuevo });
    if (error) { Alert.alert("No se pudo cambiar el estado"); return; }
    setEstado(nuevo);
    onCambio?.();
  };

  const tocarMensaje = useCallback((m) => {
    if (m._estado) return;
    const opciones = [];
    if (puedeEditar(m, userId)) {
      if (m.texto) opciones.push({ text: "Editar", onPress: () => setEditando({ id: m.id, texto: m.texto }) });
      opciones.push({ text: "Eliminar", style: "destructive", onPress: () => eliminar(m) });
    } else if (!staff && m.rol_autor === "usuario" && conv.tipo !== "soporte") {
      opciones.push({ text: "Denunciar", style: "destructive", onPress: () => setDenunciar(m) });
    }
    if (!opciones.length) return;
    setSeleccionado(m.id);
    Alert.alert("Mensaje", m.texto ? m.texto.slice(0, 80) : undefined, [
      ...opciones,
      { text: "Cancelar", style: "cancel", onPress: () => setSeleccionado(null) },
    ], { cancelable: true, onDismiss: () => setSeleccionado(null) });
  // eliminar usa estado fresco vía setters; se recrea con conv/userId
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, staff, conv.tipo]);

  // FlatList invertida: datos del más nuevo al más viejo.
  const filas = useMemo(() => agruparPorDia(mensajes).reverse(), [mensajes]);
  const puedeEscribir = !(conv.tipo === "directo" && bloqueado);
  const vacio = !tx(texto) && !fotos.length;

  const renderItem = useCallback(({ item: f }) => {
    if (f.tipo === "dia") return <View style={s.diaWrap}><Text style={s.dia}>{f.label}</Text></View>;
    const m = f.m;
    const mio = rolStaff ? m.rol_autor === rolStaff : m.autor_id === userId;
    const firma = !mio && f.primeroDelGrupo && (multi || (staff && m.rol_autor === "soporte")) ? firmaMensaje(m, { userId, nombres }) : null;
    return (
      <Burbuja m={m} mio={mio} firma={firma} primero={f.primeroDelGrupo} seleccionado={seleccionado === m.id}
        onTocar={() => tocarMensaje(m)} onVerFoto={setVisor}
        onReintentar={() => enviar({ ...m._reintento, creado_en: m.creado_en })} />
    );
  // enviar cambia en cada render pero solo se usa en el reintento
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, userId, conv.tipo, seleccionado, tocarMensaje, rolStaff, multi, nombres]);

  return (
    <View style={[s.chatRoot, { paddingTop: insets.top }]}>
      <VisorFoto path={visor} onClose={() => setVisor(null)} />
      <DenunciarSheet mensaje={denunciar} onCerrar={() => { setDenunciar(null); setSeleccionado(null); }}
        onListo={() => { setDenunciar(null); setSeleccionado(null); Alert.alert("Gracias", "El colegio va a revisar el mensaje."); }} />

      <View style={s.chatHeader}>
        {onCerrar ? (
          <Pressable onPress={onCerrar} style={s.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volver">
            <MaterialCommunityIcons name="arrow-left" size={22} color={t.text} />
          </Pressable>
        ) : null}
        {esSoporte && !staff ? <Iniciales icono="lifebuoy" color={SLATE[700]} size={38} /> : <Iniciales texto={conv.titulo} color={esSoporte ? SLATE[700] : BLUE[500]} size={38} />}
        <View style={s.flex1}>
          <Text style={s.chatTitulo} numberOfLines={1}>{conv.titulo}{silenciado ? "  🔕" : ""}</Text>
          {conv.subtitulo ? <Text style={s.chatSub} numberOfLines={1}>{conv.subtitulo}</Text> : null}
          {staff && esSoporte ? <Text style={[s.chatSub, { color: estado === "resuelta" ? t.success : t.warning, fontWeight: "700" }]}>{estado === "resuelta" ? "✓ Resuelto" : "Abierto"}</Text> : null}
        </View>
        <Pressable onPress={() => setMenu(true)} style={s.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Opciones de la conversación">
          <MaterialCommunityIcons name="dots-vertical" size={22} color={t.textMuted} />
        </Pressable>
      </View>
      {encabezadoExtra}

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Opciones">
        {!staff ? <MenuFila icono={silenciado ? "bell-outline" : "bell-off-outline"} texto={silenciado ? "Activar notificaciones" : "Silenciar"} onPress={toggleSilencio} /> : null}
        {conv.tipo === "directo" ? <MenuFila icono={bloqueado ? "account-check-outline" : "account-cancel-outline"} texto={bloqueado ? "Desbloquear" : "Bloquear"} peligro={!bloqueado} onPress={toggleBloqueo} /> : null}
        {staff && esSoporte ? <MenuFila icono={estado === "resuelta" ? "restore" : "check-circle-outline"} texto={estado === "resuelta" ? "Reabrir" : "Marcar resuelto"} onPress={cambiarEstadoSoporte} /> : null}
      </Sheet>

      <KeyboardAvoidingView style={s.flex1} behavior="padding" keyboardVerticalOffset={0}>
        {cargando ? <ActivityIndicator style={{ marginTop: SPACE.xl }} color={t.accent} /> : (
          <FlatList
            inverted
            data={filas}
            keyExtractor={(f) => f.key}
            renderItem={renderItem}
            onEndReached={cargarAnteriores}
            onEndReachedThreshold={0.3}
            contentContainerStyle={s.chatLista}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={
              <Text style={s.avisoChat}>{esSoporte ? (staff ? "Respondés como “Soporte tribbu”." : AVISO_SOPORTE) : AVISO_RETENCION}</Text>
            }
            ListEmptyComponent={
              <Text style={[s.vacioTxt, s.invertido]}>
                {esSoporte && !staff ? "Contanos qué te pasa. Si podés, mandá una captura de pantalla." : "Todavía no hay mensajes. ¡Escribí el primero!"}
              </Text>
            }
          />
        )}

        {soloLectura ? (
          <View style={[s.composerBloq, { paddingBottom: insets.bottom + SPACE.md }]}>
            <Text style={s.nota}>Solo lectura: esta conversación es entre la familia y la docente.</Text>
          </View>
        ) : !puedeEscribir ? (
          <View style={[s.composerBloq, { paddingBottom: insets.bottom + SPACE.md }]}>
            <Text style={s.nota}>Bloqueaste a {conv.titulo}.</Text>
            <Button title="Desbloquear" variant="secondary" size="sm" onPress={toggleBloqueo} />
          </View>
        ) : necesitaNormas ? (
          <View style={[s.composerBloq, { paddingBottom: insets.bottom + SPACE.md }]}>
            <Text style={s.nota}>Para escribir, aceptá las normas de convivencia.</Text>
            <Button title="Leer normas" size="sm" onPress={onPedirNormas} />
          </View>
        ) : editando ? (
          <View style={[s.composer, { paddingBottom: insets.bottom + SPACE.sm }]}>
            <Text style={s.editandoLbl}>Editando mensaje</Text>
            <View style={s.composerRow}>
              <TextInput value={editando.texto} onChangeText={(v) => setEditando((e) => ({ ...e, texto: v.slice(0, MAX_TEXTO) }))} multiline autoFocus style={s.composerInput} accessibilityLabel="Editar mensaje" />
              <Pressable onPress={() => setEditando(null)} style={s.iconBtn} accessibilityLabel="Cancelar edición"><MaterialCommunityIcons name="close" size={22} color={t.textMuted} /></Pressable>
              <Pressable onPress={guardarEdicion} style={[s.sendBtn]} accessibilityLabel="Guardar edición"><MaterialCommunityIcons name="check" size={20} color="white" /></Pressable>
            </View>
          </View>
        ) : (
          <View style={[s.composer, { paddingBottom: insets.bottom + SPACE.sm }]}>
            {fotos.length ? (
              <View style={s.previewsRow}>
                {fotos.map((a, i) => (
                  <View key={a.uri}>
                    <Image source={{ uri: a.uri }} style={s.previewImg} />
                    <Pressable onPress={() => setFotos((p) => p.filter((_, j) => j !== i))} style={s.quitarFoto} hitSlop={8} accessibilityLabel={`Quitar foto ${i + 1}`}>
                      <MaterialCommunityIcons name="close" size={12} color="white" />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {esSoporte && !staff && !mensajes.length ? <Text style={s.notaChica}>{AVISO_DIAGNOSTICO}</Text> : null}
            <View style={s.composerRow}>
              <Pressable onPress={elegirFotos} disabled={fotos.length >= MAX_FOTOS_MENSAJE} style={[s.iconBtn, fotos.length >= MAX_FOTOS_MENSAJE && s.off]} accessibilityRole="button" accessibilityLabel="Adjuntar foto">
                <MaterialCommunityIcons name="image-outline" size={24} color={t.textMuted} />
              </Pressable>
              <TextInput value={texto} onChangeText={(v) => setTexto(v.slice(0, MAX_TEXTO))} placeholder="Escribí un mensaje" placeholderTextColor={t.placeholder}
                multiline style={s.composerInput} accessibilityLabel="Mensaje" />
              <Pressable onPress={() => enviar()} disabled={vacio || enviandoAlgo} style={[s.sendBtn, vacio && s.sendOff]} accessibilityRole="button" accessibilityLabel="Enviar">
                <MaterialCommunityIcons name="send" size={18} color="white" />
              </Pressable>
            </View>
            {texto.length > MAX_TEXTO - 200 ? <Text style={[s.notaChica, s.derechaTxt]}>{texto.length}/{MAX_TEXTO}</Text> : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
const tx = (v) => (v || "").trim();

function MenuFila({ icono, texto, onPress, peligro }) {
  return (
    <Pressable onPress={onPress} style={s.menuFila} accessibilityRole="button">
      <MaterialCommunityIcons name={icono} size={20} color={peligro ? t.danger : t.textMuted} />
      <Text style={[s.menuTxt, peligro && { color: t.danger }]}>{texto}</Text>
    </Pressable>
  );
}

/** Chat a pantalla completa (tapa header y tab bar). */
export function ChatModal({ conv, onClose, ...rest }) {
  return (
    <Modal visible={!!conv} animationType="slide" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      {conv ? <ChatConversacion key={conv.id} conv={conv} onCerrar={onClose} {...rest} /> : null}
    </Modal>
  );
}

// ── Pantalla Mensajes ───────────────────────────────────────────────────────

const FilaConversacion = memo(function FilaConversacion({ c, userId, tag, onPress, esDocente }) {
  const esSoporte = c.tipo === "soporte";
  return (
    <Pressable onPress={onPress} style={s.fila} accessibilityRole="button" accessibilityLabel={`${c.titulo}${c.no_leidos ? `, ${c.no_leidos} sin leer` : ""}`}>
      {esSoporte ? <Iniciales icono="lifebuoy" color={SLATE[700]} /> : c.tipo === "colegio" ? <Iniciales icono="school-outline" color={SLATE[600]} /> : c.tipo === "docente" && !esDocente ? <Iniciales icono="human-male-board" color={SLATE[600]} /> : <Iniciales texto={c.titulo} />}
      <View style={s.flex1}>
        <View style={s.rowCenter}>
          <Text style={[s.filaTitulo, s.flex1, c.no_leidos ? s.bold : null]} numberOfLines={1}>{c.titulo}{c.silenciado ? " 🔕" : ""}</Text>
          <Text style={[s.hora, c.no_leidos ? s.horaNueva : null]}>{horaCorta(c.ultimo_en)}</Text>
        </View>
        {c.subtitulo ? (
          <View style={s.rowCenter}>
            {tag ? <View style={[s.dot, { backgroundColor: tag.color }]} /> : null}
            <Text style={s.filaSub} numberOfLines={1}>{c.subtitulo}</Text>
          </View>
        ) : null}
        <View style={s.rowCenter}>
          <Text style={[s.preview, s.flex1, c.no_leidos ? s.previewNueva : null]} numberOfLines={1}>
            {c.bloqueado ? "Bloqueado" : vistaPrevia(c, userId) || (esSoporte ? "¿Tenés un problema con la app? Escribinos" : "")}
          </Text>
          {c.no_leidos ? <View style={s.badge}><Text style={s.badgeTxt}>{c.no_leidos > 99 ? "99+" : c.no_leidos}</Text></View> : null}
        </View>
      </View>
    </Pressable>
  );
});

export function Mensajes({ abrirConv = null, abrirSoporte: pedirSoporte = false, abrirUsuario = null, nonce = null, esDocente = false }) {
  const { usuario, items, tagDeCurso } = useSession();
  const userId = usuario?.id ?? null;
  const { recargar: recargarBadge } = useMensajesCtx();
  const [convs, setConvs] = useState(null);
  const [normasOk, setNormasOk] = useState(true);
  const [activa, setActiva] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [normas, setNormas] = useState(null); // callback tras aceptar
  const visto = useRef(null);
  const timer = useRef(null);

  const cargar = useCallback(async () => {
    if (!userId) return;
    const [{ data, error }, { data: n }] = await Promise.all([
      supabase.rpc("mis_conversaciones"),
      supabase.from("normas_chat_aceptadas").select("usuario_id").eq("usuario_id", userId).maybeSingle(),
    ]);
    if (error) { setConvs((c) => c || []); return; }
    setConvs(data || []);
    setNormasOk(!!n);
  }, [userId]);
  useEffect(() => { cargar(); }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  const onCambio = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { cargar(); recargarBadge(); }, 400);
  }, [cargar, recargarBadge]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(EVENTO_MENSAJE, onCambio);
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, [onCambio]);

  const conNormas = (fn) => { if (normasOk) fn(); else setNormas(() => fn); };

  const abrirSoporte = useCallback(async () => {
    const existente = (convs || []).find((c) => c.tipo === "soporte");
    if (existente) { setActiva(existente); return; }
    const { data: id, error } = await supabase.rpc("abrir_conversacion_soporte");
    if (error || !id) { Alert.alert("No se pudo abrir el chat de soporte"); return; }
    setActiva({ ...SOPORTE_VACIO, id });
  }, [convs]);

  const abrirDirecta = useCallback(async (f) => {
    const { data: id, error } = await supabase.rpc("abrir_conversacion_directa", { p_usuario: f.usuario_id });
    if (error || !id) return false;
    const existente = (convs || []).find((c) => c.id === id);
    setNuevo(false);
    setActiva(existente || {
      id, tipo: "directo", otro_id: f.usuario_id, titulo: `${f.nombre} ${f.apellido || ""}`.trim(),
      subtitulo: hijosDeFamilia(f) ? `familia de ${hijosDeFamilia(f)}` : null,
    });
    return true;
  }, [convs]);

  // Hilos institucionales (maestra / Secretaría): se abren por RPC; si todavía
  // no están en la lista (sin mensajes) se muestran con los datos que hay.
  const abrirPorRpc = useCallback(async (rpc, params, provisoria) => {
    const { data: id, error } = await supabase.rpc(rpc, params);
    if (error || !id) return false;
    setNuevo(false);
    setActiva((convs || []).find((c) => c.id === id) || { id, ...provisoria });
    return true;
  }, [convs]);
  const hijos = useMemo(() => (items || []).filter((i) => i._tipo === "hijo").map((i) => ({ id: i.id, nombre: i.nombre?.split(" ")[0], curso: i.cursos?.nombre })), [items]);
  const onFamilia = (f) => {
    if (normasOk) return abrirDirecta(f);
    setNuevo(false);
    setNormas(() => () => abrirDirecta(f));
    return Promise.resolve(true);
  };
  const onDocente = (d) => abrirPorRpc("abrir_conversacion_docente", { p_hijo: d.hijo_id, p_maestro: d.maestro_id },
    { tipo: "docente", titulo: `${d.nombre} ${d.apellido || ""}`.trim(), subtitulo: [d.materia, `Sobre ${d.hijo_nombre}`].filter(Boolean).join(" · ") });
  const onSecretaria = (h) => abrirPorRpc("abrir_conversacion_colegio", { p_hijo: h.id },
    { tipo: "colegio", titulo: "Secretaría", subtitulo: `Sobre ${h.nombre}` });
  const onAlumno = (a) => abrirPorRpc("abrir_conversacion_docente", { p_hijo: a.hijo_id, p_maestro: a.maestro_id },
    { tipo: "docente", titulo: `Familia de ${a.nombre} ${a.apellido || ""}`.trim(), subtitulo: a.curso_nombre });

  // Deep links: push (c), "Ayuda y soporte" (soporte), Alumnos (usuario). Una vez por nonce.
  useEffect(() => {
    if (!convs) return;
    const clave = `${nonce}|${abrirConv}|${pedirSoporte}|${abrirUsuario}`;
    if (visto.current === clave || (!abrirConv && !pedirSoporte && !abrirUsuario)) return;
    visto.current = clave;
    if (pedirSoporte) { abrirSoporte(); return; }
    if (abrirConv) {
      const c = convs.find((x) => x.id === abrirConv);
      if (c) setActiva(c);
      return;
    }
    if (abrirUsuario) {
      supabase.rpc("familias_para_mensaje").then(({ data }) => {
        const f = (data || []).find((x) => x.usuario_id === abrirUsuario);
        if (f) conNormas(() => abrirDirecta(f));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convs, nonce, abrirConv, pedirSoporte, abrirUsuario]);

  const meta = useCallback(() => metaSoporte({
    plataforma: Platform.OS,
    version: Constants.expoConfig?.version,
    sistema: `${Device.osName || Platform.OS} ${Device.osVersion || ""}`.trim(),
    dispositivo: [Device.manufacturer, Device.modelName].filter(Boolean).join(" "),
    pantalla: "mensajes",
    colegio: items.find((i) => i._tipo === "hijo")?.cursos?.colegio_id || null,
    cursos: [...new Set(items.filter((i) => i._tipo === "hijo").map((i) => i.cursos?.nombre).filter(Boolean))],
  }), [items]);

  const lista = convs || [];
  const soporte = lista.find((c) => c.tipo === "soporte") || SOPORTE_VACIO;
  const otras = lista.filter((c) => c.tipo !== "soporte");
  const activaFresca = activa ? lista.find((c) => c.id === activa.id) || activa : null;

  return (
    <View style={s.screen}>
      <ChatModal conv={activaFresca} onClose={() => { setActiva(null); onCambio(); }} userId={userId} normasOk={normasOk}
        onPedirNormas={() => setNormas(() => () => {})} onCambio={onCambio} meta={activaFresca?.tipo === "soporte" ? meta : undefined} />
      <NuevoMensajeSheet key={esDocente ? "doc" : "fam"} visible={nuevo} esDocente={esDocente} hijos={hijos} onCerrar={() => setNuevo(false)} tagDeCurso={tagDeCurso}
        onFamilia={onFamilia} onDocente={onDocente} onSecretaria={onSecretaria} onAlumno={onAlumno} />
      <NormasSheet visible={!!normas} userId={userId} onCerrar={() => setNormas(null)}
        onAceptar={() => { const fn = normas; setNormas(null); setNormasOk(true); fn?.(); }} />

      <FlatList
        data={otras}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}
        contentContainerStyle={s.listaContenido}
        ListHeaderComponent={
          <View>
            <View style={s.tituloRow}>
              <View style={s.flex1}>
                <Text style={s.h1}>Mensajes</Text>
                <Text style={s.sub}>{esDocente ? "Con las familias de tus alumnos" : "Con familias, maestras y Secretaría"}</Text>
              </View>
              <Button title="Nuevo" icon="✏️" size="sm" onPress={() => setNuevo(true)} />
            </View>
            <View style={s.card}>
              <FilaConversacion c={soporte} userId={userId} onPress={abrirSoporte} />
            </View>
            {convs === null ? <ActivityIndicator style={{ marginTop: SPACE.xl }} color={t.accent} /> : null}
            {otras.length ? <Text style={s.label}>Conversaciones</Text> : null}
          </View>
        }
        ListEmptyComponent={convs ? (
          <EmptyState emoji="💬" title="Todavía no tenés conversaciones" note={esDocente ? "Escribile a la familia de un alumno sin compartir tu teléfono." : "Escribile a otra familia, a una maestra o a Secretaría sin compartir tu teléfono."}
            actionLabel="Escribir un mensaje" onAction={() => setNuevo(true)} />
        ) : null}
        renderItem={({ item: c }) => (
          <View style={s.cardFila}>
            <FilaConversacion c={c} userId={userId} esDocente={esDocente} tag={c.tipo === "directo" ? tagDeCurso?.(c.curso_id) : null} onPress={() => setActiva(c)} />
          </View>
        )}
      />
    </View>
  );
}

// ── Más → Usuarios bloqueados ───────────────────────────────────────────────

export function BloqueadosSheet({ visible, onCerrar }) {
  const { usuario } = useSession();
  const [lista, setLista] = useState(null);
  const cargar = useCallback(async () => {
    const { data } = await supabase.from("usuario_bloqueos")
      .select("bloqueado_id, usuarios!usuario_bloqueos_bloqueado_id_fkey(nombre,apellido)")
      .eq("usuario_id", usuario?.id);
    setLista(data || []);
  }, [usuario?.id]);
  useEffect(() => { if (visible) cargar(); }, [visible, cargar]);
  const desbloquear = async (id) => {
    const { error } = await supabase.from("usuario_bloqueos").delete().eq("usuario_id", usuario?.id).eq("bloqueado_id", id);
    if (error) { Alert.alert("No se pudo desbloquear"); return; }
    cargar();
  };
  return (
    <Sheet visible={visible} onClose={onCerrar} title="Usuarios bloqueados">
      {lista === null ? <ActivityIndicator color={t.accent} /> : !lista.length ? (
        <Text style={s.vacioTxt}>No bloqueaste a nadie.</Text>
      ) : lista.map((b) => (
        <View key={b.bloqueado_id} style={s.filaFamilia}>
          <Iniciales texto={`${b.usuarios?.nombre || ""} ${b.usuarios?.apellido || ""}`} size={36} />
          <Text style={[s.filaTitulo, s.flex1]} numberOfLines={1}>{b.usuarios?.nombre} {b.usuarios?.apellido || ""}</Text>
          <Button title="Desbloquear" variant="outline" size="sm" onPress={() => desbloquear(b.bloqueado_id)} />
        </View>
      ))}
    </Sheet>
  );
}

// ── Panel (super / colegio_admin) ───────────────────────────────────────────

const FILTROS_SOPORTE = [
  { k: "sin_responder", label: "Sin responder" },
  { k: "abiertos", label: "Abiertos" },
  { k: "resueltos", label: "Resueltos" },
  { k: "todos", label: "Todos" },
];

export function BandejaSoporte() {
  const { usuario } = useSession();
  const [hilos, setHilos] = useState(null);
  const [filtro, setFiltro] = useState("sin_responder");
  const [activa, setActiva] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const timer = useRef(null);
  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("bandeja_soporte");
    setHilos(data || []);
  }, []);
  useEffect(() => {
    cargar();
    const sub = DeviceEventEmitter.addListener(EVENTO_MENSAJE, () => { clearTimeout(timer.current); timer.current = setTimeout(cargar, 500); });
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, [cargar]);
  useEffect(() => {
    if (!activa) { setDetalle(null); return undefined; }
    let vivo = true;
    Promise.all([
      supabase.from("usuarios").select("rol,telefono,usuario_hijos(hijos(nombre,cursos(nombre)))").eq("id", activa.usuario_id).maybeSingle(),
      supabase.from("soporte_diagnosticos").select("datos").eq("conversacion_id", activa.id).order("creado_en", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([{ data: u }, { data: d }]) => { if (vivo) setDetalle({ u, d }); });
    return () => { vivo = false; };
  }, [activa]);

  const visibles = (hilos || []).filter((h) =>
    filtro === "todos" ? true
    : filtro === "sin_responder" ? h.sin_responder && h.estado !== "resuelta"
    : filtro === "abiertos" ? h.estado === "abierta" : h.estado === "resuelta");

  const extra = detalle ? (
    <View style={s.detalleUsuario}>
      <Text style={s.notaChica}>Rol: {detalle.u?.rol || "—"} · Tel: {detalle.u?.telefono || "—"}</Text>
      <Text style={s.notaChica} numberOfLines={2}>Hijos: {(detalle.u?.usuario_hijos || []).map((r) => `${r.hijos?.nombre} (${r.hijos?.cursos?.nombre || "sin curso"})`).join(", ") || "—"}</Text>
      {detalle.d ? <Text style={s.notaChica} numberOfLines={2}>Dispositivo: {[detalle.d.datos?.plataforma, detalle.d.datos?.version && `v${detalle.d.datos.version}`, detalle.d.datos?.sistema, detalle.d.datos?.dispositivo].filter(Boolean).join(" · ")}</Text> : null}
    </View>
  ) : null;

  return (
    <View>
      <ChatModal conv={activa ? { id: activa.id, tipo: "soporte", titulo: activa.nombre, subtitulo: [activa.email, activa.colegio].filter(Boolean).join(" · "), estado: activa.estado } : null}
        onClose={() => { setActiva(null); cargar(); }} userId={usuario?.id} modo="staff" onCambio={cargar} encabezadoExtra={extra} />
      <View style={s.chipsRow}>
        {FILTROS_SOPORTE.map((f) => (
          <Pressable key={f.k} onPress={() => setFiltro(f.k)} style={[s.chip, filtro === f.k && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: filtro === f.k }}>
            <Text style={[s.chipTxt, filtro === f.k && s.chipTxtOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>
      {hilos === null ? <ActivityIndicator color={t.accent} /> : !visibles.length ? <Text style={s.vacioTxt}>No hay consultas acá. 🎉</Text> : visibles.map((h) => (
        <Pressable key={h.id} onPress={() => setActiva(h)} style={[s.card, s.filaPanel]} accessibilityRole="button">
          <Iniciales texto={h.nombre} color={SLATE[600]} size={40} />
          <View style={s.flex1}>
            <View style={s.rowCenter}>
              <Text style={[s.filaTitulo, s.flex1]} numberOfLines={1}>{h.nombre}</Text>
              <Text style={s.hora}>{horaCorta(h.ultimo_en)}</Text>
            </View>
            <Text style={s.filaSub} numberOfLines={1}>{h.colegio || "Sin colegio"} · {h.estado === "resuelta" ? "✓ resuelto" : h.sin_responder ? "sin responder" : "respondido"}</Text>
            <View style={s.rowCenter}>
              <Text style={[s.preview, s.flex1]} numberOfLines={1}>{h.ultimo_rol_autor === "soporte" ? "Vos: " : ""}{h.ultimo_texto || (h.ultimo_fotos ? "📷 Foto" : "")}</Text>
              {h.no_leidos ? <View style={[s.badge, { backgroundColor: t.danger }]}><Text style={s.badgeTxt}>{h.no_leidos}</Text></View> : null}
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function SoporteColegioAdmin() {
  const { usuario } = useSession();
  const [conv, setConv] = useState(null);
  const abrir = async () => {
    const { data, error } = await supabase.rpc("abrir_conversacion_soporte");
    if (error || !data) { Alert.alert("No se pudo abrir el chat de soporte"); return; }
    setConv({ ...SOPORTE_VACIO, id: data });
  };
  const meta = useCallback(() => metaSoporte({
    plataforma: Platform.OS, version: Constants.expoConfig?.version,
    sistema: `${Device.osName || Platform.OS} ${Device.osVersion || ""}`.trim(),
    dispositivo: [Device.manufacturer, Device.modelName].filter(Boolean).join(" "), pantalla: "panel colegio",
  }), []);
  return (
    <View style={s.card}>
      <ChatModal conv={conv} onClose={() => setConv(null)} userId={usuario?.id} meta={meta} />
      <Text style={s.sheetIntro}>¿Algo no funciona o tenés una duda? Escribile al equipo de tribbu. {AVISO_SOPORTE}</Text>
      <Button title="Escribir a soporte" icon="🛟" onPress={abrir} />
    </View>
  );
}

export function DenunciasColegio({ colegioId }) {
  const [denuncias, setDenuncias] = useState(null);
  const [filtro, setFiltro] = useState("pendiente");
  const cargar = useCallback(async () => {
    let q = supabase.from("mensaje_denuncias").select("*").order("creado_en", { ascending: false }).limit(200);
    if (colegioId) q = q.eq("colegio_id", colegioId);
    const { data } = await q;
    setDenuncias(data || []);
  }, [colegioId]);
  useEffect(() => { cargar(); }, [cargar]);
  const resolver = (d, eliminar) => {
    const hacer = async () => {
      const { error } = await supabase.rpc("resolver_denuncia", { p_denuncia: d.id, p_eliminar: eliminar });
      if (error) { Alert.alert("No se pudo resolver la denuncia"); return; }
      cargar();
    };
    if (!eliminar) { hacer(); return; }
    Alert.alert("¿Eliminar el mensaje?", "Se va a ver como “Mensaje eliminado” para todos.", [
      { text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: hacer },
    ]);
  };
  const visibles = (denuncias || []).filter((d) => filtro === "todas" || d.estado === filtro);
  return (
    <View>
      <Text style={s.sheetIntro}>Acá ves solo los mensajes que una familia denunció — nunca el resto de las conversaciones.</Text>
      <View style={s.chipsRow}>
        {[{ k: "pendiente", l: "Pendientes" }, { k: "resuelta", l: "Resueltas" }, { k: "todas", l: "Todas" }].map((f) => (
          <Pressable key={f.k} onPress={() => setFiltro(f.k)} style={[s.chip, filtro === f.k && s.chipOn]} accessibilityRole="button">
            <Text style={[s.chipTxt, filtro === f.k && s.chipTxtOn]}>{f.l}</Text>
          </Pressable>
        ))}
      </View>
      {denuncias === null ? <ActivityIndicator color={t.accent} /> : !visibles.length ? <Text style={s.vacioTxt}>{filtro === "pendiente" ? "No hay denuncias pendientes." : "No hay denuncias."}</Text> : visibles.map((d) => (
        <View key={d.id} style={[s.card, s.denuncia]}>
          <View style={s.rowCenter}>
            <Text style={[s.estadoPill, d.estado === "pendiente" ? s.pillPend : s.pillOk]}>{d.estado === "pendiente" ? "Pendiente" : d.accion === "mensaje_eliminado" ? "Mensaje eliminado" : "Resuelta"}</Text>
            <Text style={[s.filaTitulo, s.flex1]} numberOfLines={1}>  {motivoDenuncia(d.motivo)}</Text>
          </View>
          <Text style={s.filaSub}>Escribió: {d.autor_snapshot || "—"} · {new Date(d.creado_en).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}</Text>
          <Text style={s.denunciaTxt}>{d.texto_snapshot || "(sin texto)"}</Text>
          {d.detalle ? <Text style={s.notaChica}>Comentario: “{d.detalle}”</Text> : null}
          {d.estado === "pendiente" ? (
            <View style={s.sheetBotones}>
              <Button title="Eliminar mensaje" variant="danger" size="sm" onPress={() => resolver(d, true)} full={false} style={s.flex1} />
              <Button title="Marcar resuelta" variant="outline" size="sm" onPress={() => resolver(d, false)} full={false} style={s.flex1} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// ── Panel colegio: Secretaría + chats familia ↔ docente (solo lectura) ─────

const FILTROS_COLEGIO = [
  { k: "sin_responder", label: "Sin responder" },
  { k: "secretaria", label: "Secretaría" },
  { k: "docentes", label: "Con maestras" },
];

export function BandejaColegio() {
  const { usuario } = useSession();
  const [hilos, setHilos] = useState(null);
  const [filtro, setFiltro] = useState("sin_responder");
  const [activa, setActiva] = useState(null);
  const timer = useRef(null);
  const cargar = useCallback(async () => {
    const { data } = await supabase.rpc("bandeja_colegio");
    setHilos(data || []);
  }, []);
  useEffect(() => {
    cargar();
    const sub = DeviceEventEmitter.addListener(EVENTO_MENSAJE, () => { clearTimeout(timer.current); timer.current = setTimeout(cargar, 500); });
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, [cargar]);

  const visibles = (hilos || []).filter((h) =>
    filtro === "sin_responder" ? h.sin_responder : filtro === "secretaria" ? h.tipo === "colegio" : h.tipo === "docente");
  const conv = activa ? {
    id: activa.id, tipo: activa.tipo, subtitulo: activa.curso,
    titulo: activa.tipo === "docente" ? `${activa.docente} ↔ familia de ${activa.alumno}` : `Familia de ${activa.alumno}`,
  } : null;

  return (
    <View>
      <ChatModal conv={conv} onClose={() => { setActiva(null); cargar(); }} userId={usuario?.id} modo="staff" rolPropio="colegio"
        soloLectura={activa?.tipo === "docente"} onCambio={cargar} />
      <Text style={s.sheetIntro}>Lo que las familias le escriben a Secretaría (respondés como “Secretaría”) y, en solo lectura, sus chats con las maestras.</Text>
      <View style={s.chipsRow}>
        {FILTROS_COLEGIO.map((f) => {
          const n = f.k === "sin_responder" ? (hilos || []).filter((h) => h.sin_responder).length : 0;
          return (
            <Pressable key={f.k} onPress={() => setFiltro(f.k)} style={[s.chip, filtro === f.k && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: filtro === f.k }}>
              <Text style={[s.chipTxt, filtro === f.k && s.chipTxtOn]}>{f.label}{n ? ` · ${n}` : ""}</Text>
            </Pressable>
          );
        })}
      </View>
      {hilos === null ? <ActivityIndicator color={t.accent} /> : !visibles.length ? (
        <Text style={s.vacioTxt}>{filtro === "sin_responder" ? "No hay mensajes sin responder. 🎉" : "No hay conversaciones acá."}</Text>
      ) : visibles.map((h) => (
        <Pressable key={h.id} onPress={() => setActiva(h)} style={[s.card, s.filaPanel]} accessibilityRole="button">
          <Iniciales icono={h.tipo === "docente" ? "human-male-board" : "school-outline"} color={SLATE[600]} size={40} />
          <View style={s.flex1}>
            <View style={s.rowCenter}>
              <Text style={[s.filaTitulo, s.flex1]} numberOfLines={1}>Familia de {h.alumno}</Text>
              <Text style={s.hora}>{horaCorta(h.ultimo_en)}</Text>
            </View>
            <Text style={s.filaSub} numberOfLines={1}>{h.curso} · {h.tipo === "docente" ? `con ${h.docente} (solo lectura)` : h.sin_responder ? "Secretaría · sin responder" : "Secretaría"}</Text>
            <View style={s.rowCenter}>
              <Text style={[s.preview, s.flex1]} numberOfLines={1}>{h.ultimo_rol_autor === "colegio" ? "Secretaría: " : h.ultimo_rol_autor === "docente" ? "Docente: " : ""}{h.ultimo_texto || (h.ultimo_fotos ? "📷 Foto" : "")}</Text>
              {h.no_leidos ? <View style={[s.badge, { backgroundColor: t.danger }]}><Text style={s.badgeTxt}>{h.no_leidos}</Text></View> : null}
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  listaContenido: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  tituloRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, marginBottom: SPACE.md },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong },
  sub: { ...TYPE.caption, color: t.textMuted },
  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  card: { backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, padding: SPACE.xs },
  cardFila: { backgroundColor: t.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.borderStrong, marginBottom: SPACE.sm, padding: SPACE.xs },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.sm, minHeight: 64 },
  filaPanel: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.md, marginBottom: SPACE.sm },
  filaFamilia: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.sm, minHeight: MIN_TOUCH + 8 },
  filaTitulo: { fontSize: 15, fontWeight: "700", color: t.textStrong },
  filaSub: { fontSize: 12, color: t.textMuted, flexShrink: 1 },
  bold: { fontWeight: "800" },
  hora: { fontSize: 11, color: t.textFaint, marginLeft: SPACE.sm },
  horaNueva: { color: t.accent, fontWeight: "700" },
  preview: { fontSize: 13, color: t.textMuted },
  previewNueva: { color: t.text, fontWeight: "600" },
  badge: { backgroundColor: t.accent, borderRadius: RADIUS.full, minWidth: 20, height: 20, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", marginLeft: SPACE.sm },
  badgeTxt: { color: "white", fontSize: 11, fontWeight: "700" },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontWeight: "800" },
  sheetIntro: { fontSize: 13.5, color: t.textMuted, lineHeight: 19, marginBottom: SPACE.md },
  sheetAlto: { height: "85%" },
  sheetBotones: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md },
  normaRow: { flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.sm },
  normaPunto: { fontSize: 14, color: t.accent, lineHeight: 20 },
  normaTxt: { flex: 1, fontSize: 14, color: t.text, lineHeight: 20 },
  opcion: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: t.borderStrong, marginBottom: SPACE.sm, minHeight: MIN_TOUCH },
  opcionOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  opcionTxt: { fontSize: 14, color: t.text },
  input: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.lg, paddingHorizontal: SPACE.md, paddingVertical: 10, fontSize: 15, color: t.text, backgroundColor: t.surfaceSunken },
  inputArea: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.lg, padding: SPACE.md, fontSize: 14, color: t.text, minHeight: 80, textAlignVertical: "top", backgroundColor: t.surfaceSunken },
  nota: { fontSize: 12, color: t.textFaint, marginTop: SPACE.sm, marginBottom: SPACE.sm, textAlign: "center" },
  notaChica: { fontSize: 11.5, color: t.textMuted, marginBottom: 4 },
  derechaTxt: { textAlign: "right" },
  vacioTxt: { fontSize: 13, color: t.textMuted, textAlign: "center", padding: SPACE.xl },
  invertido: { transform: [{ scaleY: -1 }] },
  menuFila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingVertical: SPACE.md, minHeight: MIN_TOUCH },
  menuTxt: { fontSize: 15, color: t.text, fontWeight: "600" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: SPACE.md },
  tabs: { flexDirection: "row", gap: 4, backgroundColor: t.surface2, borderRadius: RADIUS.lg, padding: 3, marginBottom: SPACE.md },
  tab: { flex: 1, minHeight: 38, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  tabTxt: { fontSize: 13.5, fontWeight: "700", color: t.textMuted },
  tabTxtOn: { color: t.textStrong },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  chipTxt: { fontSize: 12.5, fontWeight: "700", color: SLATE[600] },
  chipTxtOn: { color: BLUE[700] },
  detalleUsuario: { backgroundColor: t.surfaceSunken, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, borderBottomWidth: 1, borderBottomColor: t.border },
  denuncia: { padding: SPACE.md, marginBottom: SPACE.sm },
  denunciaTxt: { fontSize: 14, color: t.text, backgroundColor: t.surfaceSunken, borderRadius: RADIUS.md, padding: SPACE.md, marginVertical: SPACE.sm },
  estadoPill: { fontSize: 11, fontWeight: "800", paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.full, overflow: "hidden" },
  pillPend: { backgroundColor: t.dangerSoft, color: t.danger },
  pillOk: { backgroundColor: t.successSoft, color: t.success },
  // chat
  chatRoot: { flex: 1, backgroundColor: t.bg },
  chatHeader: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.sm, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
  chatTitulo: { fontSize: 16, fontWeight: "800", color: t.textStrong },
  chatSub: { fontSize: 12, color: t.textMuted },
  iconBtn: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.4 },
  chatLista: { paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  avisoChat: { fontSize: 11.5, color: t.textFaint, textAlign: "center", marginVertical: SPACE.md, paddingHorizontal: SPACE.xl },
  diaWrap: { alignItems: "center", marginVertical: SPACE.md },
  dia: { fontSize: 11.5, fontWeight: "700", color: t.textMuted, backgroundColor: t.surface2, borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 3, overflow: "hidden" },
  burbujaWrap: { maxWidth: "80%" },
  derecha: { alignSelf: "flex-end", alignItems: "flex-end" },
  izquierda: { alignSelf: "flex-start", alignItems: "flex-start" },
  mt8: { marginTop: 8 },
  mt2: { marginTop: 2 },
  mb6: { marginBottom: 6 },
  px6: { paddingHorizontal: 6, paddingBottom: 4 },
  firma: { fontSize: 11.5, fontWeight: "700", color: t.textMuted, marginHorizontal: 8, marginBottom: 2 },
  burbuja: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  burbujaMia: { backgroundColor: t.accent },
  burbujaOtra: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  burbujaBorrada: { borderWidth: 1, borderStyle: "dashed", borderColor: t.borderStrong },
  burbujaSoloFoto: { padding: 4 },
  esqDer: { borderTopRightRadius: 4 },
  esqIzq: { borderTopLeftRadius: 4 },
  enviando: { opacity: 0.7 },
  seleccionada: { borderWidth: 2, borderColor: BLUE[300] },
  borradoTxt: { fontSize: 13, fontStyle: "italic", color: t.textFaint },
  msgTxt: { fontSize: 15, lineHeight: 20, color: t.text },
  msgTxtMio: { color: "white" },
  fotosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metaRow: { marginHorizontal: 8, marginTop: 2 },
  metaTxt: { fontSize: 10.5, color: t.textFaint },
  errorMeta: { fontSize: 11, color: t.danger, fontWeight: "700" },
  composer: { backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: SPACE.sm, paddingTop: SPACE.sm },
  composerBloq: { backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, padding: SPACE.md, alignItems: "center", gap: SPACE.sm },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  composerInput: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, borderWidth: 1.5, borderColor: t.borderStrong, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, color: t.text, backgroundColor: t.surfaceSunken },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", marginLeft: 2 },
  sendOff: { backgroundColor: SLATE[300] },
  editandoLbl: { fontSize: 12, fontWeight: "700", color: t.accent, marginBottom: 4, marginLeft: 6 },
  previewsRow: { flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.sm, paddingHorizontal: 4 },
  previewImg: { width: 56, height: 56, borderRadius: 8 },
  quitarFoto: { position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: SLATE[800], alignItems: "center", justifyContent: "center" },
  visor: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", alignItems: "center", justifyContent: "center" },
  visorImg: { width: "100%", height: "80%" },
  visorCerrar: { position: "absolute", right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});
