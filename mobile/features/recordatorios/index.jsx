// Recordatorios — patrón A3 (ver mobile/DESIGN_SYSTEM.md §7). Lista con leídos/
// no-leídos, filtros colapsados en select-chips (Sheet), alta/edición y borrado.
// El admin que crea un recordatorio dispara un push al curso. La prioridad/urgencia vive en el dot de la fila; leído = dot
// hueco + texto apagado.

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { sanitize, fmtLocalDate, ordenPorEnviado, coincideTexto } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { SELECT_REC_CON_LEIDO, separarLeidos, conLeidoDe } from "@shared/leidos";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Paginador } from "../../components/Paginador";
import { BotonFiltros, FiltrosSheet, filtrosActivos } from "../../components/Filtros";
import { BotonNuevo } from "../../components/BotonNuevo";
import { Buscador } from "../../components/Buscador";
import { EmptyState } from "../../components/EmptyState";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { DateField } from "../../components/DateField";
import { ChipLecturas, LecturasSheet } from "../../components/Lecturas";
import { useLecturas } from "../../lib/useLecturas";
import { useNotificacionesCtx } from "../notificaciones";
import { useAutoresDocentes } from "../../lib/useAutoresDocentes";
import { etiquetaDocente } from "@shared/docentes";
import { separarAvisos, haceCuanto, fechaCortaAviso, fechaDelAviso, origenAviso, fotoDelAviso } from "@shared/avisosLista";
import { SignedImage } from "../../components/SignedImage";

// "18", "18:5", "1830", "18:30" → "18:30" · vacío → null · inválido → false.
const normalizarHora = (v) => {
  const m = String(v).trim().match(/^(\d{1,2})(?::?(\d{1,2}))?$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return false;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

const t = THEMES.light;

const PRIO = {
  alta: { l: "Alta", c: t.danger, bg: t.dangerSoft },
  media: { l: "Media", c: t.warning, bg: t.warningSoft },
  baja: { l: "Baja", c: t.success, bg: t.successSoft },
};
const POR_PAG = 10;

// Último publicado primero (creado_en), no por la fecha del aviso — igual que
// la web (src/features/recordatorios/index.jsx). Cada fila dice cuándo se envió.
const ordenAvisos = ordenPorEnviado;
const RANGOS = [
  { value: "all", label: "Todos" },
  { value: "proximos", label: "Próximos" },
  { value: "pasados", label: "Pasados" },
];
const PRIOS = [
  { value: "all", label: "Todas" },
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];
const LEIDOS = [
  { value: "all", label: "Todos" },
  { value: "noleidos", label: "No leídos" },
  { value: "leidos", label: "Leídos" },
];
const ORIGENES = [
  { value: "all", label: "Todos" },
  { value: "colegio", label: "Del colegio" },
  { value: "normal", label: "Apoderados" },
];

// Fecha del aviso como un dato más (una línea gris), no como una caja que
// parece un botón: "Vie 16 oct · 10:30–11:00 · mañana".
function LineaFecha({ r }) {
  const f = fechaDelAviso(r.fecha, r.hora_inicio);
  if (!f) return null;
  return (
    <View style={styles.fechaLinea}>
      <MaterialCommunityIcons name="calendar-blank-outline" size={15} color={t.textMuted} />
      <Text style={styles.fechaLineaTxt}>
        {f.texto}{r.hora_fin ? `–${String(r.hora_fin).slice(0, 5)}` : ""} · {f.rel.toLowerCase()}
      </Text>
    </View>
  );
}

// Tarjeta de "Recientes": prioridad, de quién viene, hace cuánto, punto de no
// leído, miniatura de la foto y la fecha del aviso en una cajita. Tocarla la
// abre entera (texto, adjuntos) y la marca leída.
const AvisoCard = memo(function AvisoCard({ r, origen, resaltado = false, esLeido, puedeEditar, tag, lecturas, onLeido, onEditar, onEliminar, onVerLecturas }) {
  const [abierto, setAbierto] = useState(resaltado);
  const prio = PRIO[r.prioridad || "media"] || PRIO.media;
  const foto = fotoDelAviso(r);
  const tocar = () => {
    setAbierto((x) => !x);
    if (!esLeido) onLeido(r.id);
  };
  return (
    <Pressable onPress={tocar} style={[styles.aviso, resaltado && styles.avisoResaltado]} accessibilityRole="button" accessibilityLabel={(r.titulo || r.texto || "") + (esLeido ? "" : ", sin leer")}>
      <View style={styles.avisoTop}>
        <View style={[styles.prioPill, { backgroundColor: prio.bg }]}>
          <View style={[styles.prioDot, { backgroundColor: prio.c }]} />
          <Text style={[styles.prioPillTxt, { color: prio.c }]}>{prio.l}</Text>
        </View>
        <Text style={styles.origen} numberOfLines={1}>{origen}</Text>
        <Text style={styles.hace}>{haceCuanto(r.creado_en)}</Text>
        {!esLeido ? <View style={styles.puntoNoLeido} /> : null}
      </View>
      <View style={styles.avisoCuerpo}>
        <View style={styles.flex1}>
          <Text style={[styles.avisoTitulo, esLeido && styles.avisoLeido]} numberOfLines={abierto ? undefined : 2}>{r.titulo || r.texto}</Text>
          {r.titulo && r.texto ? <Text style={styles.avisoTexto} numberOfLines={abierto ? undefined : 2}>{r.texto}</Text> : null}
        </View>
        {foto && !abierto ? <SignedImage src={foto.url} bucket="adjuntos" miniatura style={styles.thumb} /> : null}
      </View>
      <LineaFecha r={r} />
      {abierto ? <AdjuntosList adjuntos={r.adjuntos} /> : null}
      {tag || lecturas || puedeEditar || (abierto && esLeido) ? (
        <View style={styles.avisoPie}>
          {tag ? (
            <View style={styles.tagRow}>
              <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
              <Text style={styles.tagTxt} numberOfLines={1}>{tag.nombre}</Text>
            </View>
          ) : null}
          <ChipLecturas filas={lecturas} onPress={() => onVerLecturas(r)} />
          <View style={styles.flex1} />
          {abierto && esLeido ? (
            <Pressable onPress={() => onLeido(r.id)} hitSlop={8}>
              <Text style={styles.noLeidoTxt}>Marcar no leído</Text>
            </Pressable>
          ) : null}
          {puedeEditar ? (
            <View style={styles.editRow}>
              <Pressable onPress={() => onEditar(r)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Editar">
                <MaterialCommunityIcons name="pencil-outline" size={15} color={t.textMuted} />
              </Pressable>
              <Pressable onPress={() => onEliminar(r.id)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Borrar">
                <MaterialCommunityIcons name="trash-can-outline" size={15} color={t.textMuted} />
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
});

// "Requiere tu atención": prioridad alta (o urgente) sin leer. "Entendido" la
// marca leída y pasa a Recientes.
function AvisoAtencion({ r, origen, resaltado = false, onEntendido }) {
  const [abierto, setAbierto] = useState(resaltado);
  return (
    <View style={[styles.atencion, resaltado && styles.avisoResaltado]}>
      <View style={styles.atencionTop}>
        <View style={styles.atencionIcono}>
          <MaterialCommunityIcons name="alert-outline" size={22} color={t.danger} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.atencionTipo} numberOfLines={1}>{r.prioridad === "alta" ? "Prioridad alta" : "Urgente"} · {origen}</Text>
          <Text style={styles.atencionFecha}>{[r.creado_en ? fechaCortaAviso(r.creado_en) : null, haceCuanto(r.creado_en)].filter(Boolean).join(" · ")}</Text>
        </View>
        <View style={styles.puntoNoLeido} />
      </View>
      <Text style={styles.atencionTitulo}>{r.titulo || r.texto}</Text>
      {r.titulo && r.texto ? <Text style={styles.atencionTexto} numberOfLines={abierto ? undefined : 3}>{r.texto}</Text> : null}
      <LineaFecha r={r} />
      {abierto ? <AdjuntosList adjuntos={r.adjuntos} /> : null}
      <View style={styles.atencionBtns}>
        <Pressable onPress={() => setAbierto((x) => !x)} style={styles.atencionVer}>
          <MaterialCommunityIcons name="file-document-outline" size={18} color={t.textStrong} />
          <Text style={styles.atencionVerTxt}>{abierto ? "Ver menos" : "Ver comunicado"}</Text>
        </Pressable>
        <Pressable onPress={() => onEntendido(r.id)} style={styles.atencionOk}>
          <MaterialCommunityIcons name="check" size={18} color="#fff" />
          <Text style={styles.atencionOkTxt}>Entendido</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Recordatorios({ openAviso = null, openGrupo = null, nonce = null }) {
  const { cursoId, cursoIds, esVistaTodos, usuario, isAdmin, items, tagDeCurso, cursosDocente } = useSession();
  const userId = usuario?.id ?? null;
  // Refresca el badge de la tab + el punto de la campana (mismo hook levantado
  // en _layout.jsx) cuando acá cambia el estado de leídos / se borra un aviso.
  const notifCtx = useNotificacionesCtx();
  const recargarBadge = notifCtx?.recargar;

  const [recordatorios, setRecordatorios] = useState([]);
  // Avisos de docentes: etiqueta "👩‍🏫 Laura · Inglés" (specs/docentes-clases-y-grupos.md).
  const docenteDe = useAutoresDocentes(recordatorios.map((r) => r.creado_por));
  const [leidosSet, setLeidosSet] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [verLecturas, setVerLecturas] = useState(null); // aviso con "¿quién lo leyó?" abierto
  const [form, setForm] = useState({ titulo: "", texto: "", fecha: "", hora_inicio: "", hora_fin: "", prioridad: "media", urgente: false, adjuntos: [], curso_id: null });
  const [saving, setSaving] = useState(false);
  const [filtroRango, setFiltroRango] = useState("all");
  const [filtroPrio, setFiltroPrio] = useState("all");
  const [filtroLeido, setFiltroLeido] = useState("all");
  const [filtroOrigen, setFiltroOrigen] = useState("all");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  // Deep-link desde una notificación: aviso a resaltar y a llevar a la vista.
  const [resaltado, setResaltado] = useState(null);
  const listaRef = useRef(null);
  const [destinoUsado, setDestinoUsado] = useState(null); // último openAviso/openGrupo ya resuelto

  const hoyStr = fmtLocalDate();

  // En vista "Todos" el permiso de edición se resuelve contra el rol en el curso
  // de cada fila, no contra el isAdmin de sesión (que en Todos es false).
  const cursosAdmin = useMemo(
    () => new Set((items || []).filter((i) => i.rolEfectivo === "room").map((i) => i.curso_id)),
    [items]
  );

  // Opciones de curso destino para el alta en vista "Todos" (label = hijo/s).
  const cursosOpciones = useMemo(
    () => (esVistaTodos ? cursoIds.map((cid) => ({ curso_id: cid, tag: tagDeCurso(cid) })).filter((o) => o.tag) : []),
    [esVistaTodos, cursoIds, tagDeCurso]
  );

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    // "¿Lo leí?" embebido (@shared/leidos): sin pedir aparte todos mis leídos.
    const { data } = await conLeidoDe(supabase.from("recordatorios").select(SELECT_REC_CON_LEIDO), userId)
      .in("curso_id", cursoIds)
      .order("creado_en", { ascending: false });
    const { recs, leidos } = separarLeidos(data);
    setRecordatorios(recs);
    setLeidosSet(leidos);
  }, [cursoIds, userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Expo Router mantiene los tabs montados al cambiar de pestaña (a diferencia
  // del switch de la web, que remonta cada feature) — sin esto, volver a este
  // tab desde un push (ej. una comunicación del colegio) mostraba la lista
  // vieja hasta un refresh manual.
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  const guardar = async () => {
    if (!form.texto?.trim()) return;
    // En vista "Todos" el alta exige un curso destino elegido en el modal.
    const cursoDestino = cursoId || form.curso_id;
    if (!modal?.id && !cursoDestino) return;
    // Horario solo con fecha y fin solo con inicio — mismo modelo que
    // "Comunicación del colegio". Con fecha y hora_inicio el aviso también
    // entra al calendario sincronizado (feed ICS).
    const hora_inicio = form.fecha && form.hora_inicio?.trim() ? normalizarHora(form.hora_inicio) : null;
    const hora_fin = hora_inicio && form.hora_fin?.trim() ? normalizarHora(form.hora_fin) : null;
    if (hora_inicio === false || hora_fin === false) {
      Alert.alert("Hora inválida", "Usá el formato 18:00.");
      return;
    }
    if (hora_fin && hora_fin < hora_inicio) {
      Alert.alert("Hora inválida", "La hora de fin no puede ser anterior a la de inicio.");
      return;
    }
    setSaving(true);
    const payload = {
      titulo: sanitize(form.titulo) || null,
      texto: sanitize(form.texto),
      fecha: form.fecha || null,
      hora_inicio,
      hora_fin,
      prioridad: form.prioridad || "media",
      urgente: form.urgente || false,
      adjuntos: form.adjuntos || [],
      curso_id: cursoDestino,
    };
    if (modal?.id) {
      // Al editar no se pisa curso_id: en vista "Todos" la fila puede ser de
      // otro curso y el payload lo movería.
      const { curso_id: _cid, ...upd } = payload;
      await supabase.from("recordatorios").update(upd).eq("id", modal.id);
    } else {
      const { data: creado } = await supabase.from("recordatorios").insert({ ...payload, creado_por: userId }).select("id").single();
      // Avisan con push la Room Parent y la maestra del curso (no cualquier familia).
      if (isAdmin || (cursosDocente || []).includes(cursoDestino)) {
        const userIds = await getUserIdsByCurso(cursoDestino);
        // `id` viaja en la notificación: al tocarla, la app abre este aviso.
        await sendPush({ type: "recordatorio", payload: { titulo: form.titulo?.trim() || form.texto, id: creado?.id, userIds } });
      }
    }
    setSaving(false);
    setModal(null);
    cargar();
    recargarBadge?.();
  };

  const eliminar = useCallback(
    async (id) => {
      // Las lecturas se borran en cascada (permisos-avisos-pagos-asistencias.sql).
      const { data: borrados } = await supabase.from("recordatorios").delete().eq("id", id).select("adjuntos");
      borrarArchivos(borrados?.[0]?.adjuntos, "adjuntos");
      cargar();
      recargarBadge?.();
    },
    [cargar, recargarBadge]
  );

  const marcarLeido = useCallback(
    async (id) => {
      if (!userId) return;
      if (leidosSet.has(id)) {
        await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id", id).eq("usuario_id", userId);
        setLeidosSet((p) => {
          const n = new Set(p);
          n.delete(id);
          return n;
        });
      } else {
        await supabase
          .from("recordatorio_leidos")
          .upsert({ recordatorio_id: id, usuario_id: userId }, { onConflict: "recordatorio_id,usuario_id" });
        setLeidosSet((p) => new Set([...p, id]));
      }
      recargarBadge?.();
    },
    [userId, leidosSet, recargarBadge]
  );

  // Deep-link: una vez resaltado, llevarlo a la vista, marcarlo leído (se abrió
  // desde la notificación) y sacar el resaltado a los pocos segundos.
  useEffect(() => {
    if (!resaltado) return undefined;
    const idx = visible.findIndex((r) => r.id === resaltado);
    if (idx >= 0) setTimeout(() => listaRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.2 }), 250);
    if (userId && !leidosSet.has(resaltado)) {
      supabase.from("recordatorio_leidos").upsert({ recordatorio_id: resaltado, usuario_id: userId }, { onConflict: "recordatorio_id,usuario_id" })
        .then(() => { setLeidosSet((p) => new Set([...p, resaltado])); recargarBadge?.(); });
    }
    const t = setTimeout(() => setResaltado(null), 6000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resaltado]);

  const abrirNuevo = () => {
    setForm({
      titulo: "",
      texto: "",
      fecha: "",
      hora_inicio: "",
      hora_fin: "",
      prioridad: "media",
      urgente: false,
      adjuntos: [],
      // En vista "Todos" arranca en el primer curso; el modal muestra el selector.
      curso_id: cursoId || cursoIds[0] || null,
    });
    setModal({});
  };
  const abrirEditar = useCallback((r) => {
    setForm({
      titulo: r.titulo || "",
      texto: r.texto || "",
      fecha: r.fecha || "",
      hora_inicio: r.hora_inicio?.slice(0, 5) || "",
      hora_fin: r.hora_fin?.slice(0, 5) || "",
      prioridad: r.prioridad || "media",
      urgente: r.urgente || false,
      adjuntos: r.adjuntos || [],
      curso_id: r.curso_id || null,
    });
    setModal(r);
  }, []);

  // Ocultar solo los de regalo (se manejan aparte). Los de colecta (colecta_vence)
  // SÍ se muestran, igual que en la web.
  const visiblesTipo = recordatorios.filter((r) => r.tipo !== "regalo_cumple");
  const sinLeer = visiblesTipo.filter((r) => !leidosSet.has(r.id)).length;
  const conPagina1 = (set) => (v) => { set(v); setPagina(1); };
  const gruposFiltro = [
    { key: "leido", label: "Estado", options: LEIDOS, value: filtroLeido, onChange: conPagina1(setFiltroLeido) },
    { key: "rango", label: "Fecha", options: RANGOS, value: filtroRango, onChange: conPagina1(setFiltroRango) },
    { key: "prio", label: "Prioridad", options: PRIOS, value: filtroPrio, onChange: conPagina1(setFiltroPrio) },
    { key: "origen", label: "Quién lo publicó", options: ORIGENES, value: filtroOrigen, onChange: conPagina1(setFiltroOrigen) },
  ];
  const limpiarFiltros = () => { setFiltroLeido("all"); setFiltroRango("all"); setFiltroPrio("all"); setFiltroOrigen("all"); setPagina(1); };

  const filtrados = visiblesTipo
    .filter((r) => {
      if (!coincideTexto(busqueda, r.titulo, r.texto)) return false;
      if (filtroRango === "proximos" && r.fecha && r.fecha < hoyStr) return false;
      if (filtroRango === "pasados" && (!r.fecha || r.fecha >= hoyStr)) return false;
      if (filtroPrio !== "all" && r.prioridad !== filtroPrio) return false;
      if (filtroLeido === "leidos" && !leidosSet.has(r.id)) return false;
      if (filtroLeido === "noleidos" && leidosSet.has(r.id)) return false;
      if (filtroOrigen === "colegio" && !r.grupo_id) return false;
      if (filtroOrigen === "normal" && r.grupo_id) return false;
      return true;
    })
    .sort(ordenAvisos);

  // Resolver el deep-link en el render, cuando el aviso ya está cargado:
  // limpiar filtros (podría estar oculto), ir a su página y resaltarlo.
  const destinoKey = openAviso ? `a:${openAviso}:${nonce || ""}` : openGrupo ? `g:${openGrupo}:${nonce || ""}` : null;
  const destino = destinoKey && destinoKey !== destinoUsado
    ? visiblesTipo.find((r) => (openAviso ? String(r.id) === openAviso : r.grupo_id === openGrupo))
    : null;
  if (destino) {
    setDestinoUsado(destinoKey);
    setFiltroRango("all"); setFiltroPrio("all"); setFiltroLeido("all"); setFiltroOrigen("all");
    const orden = [...visiblesTipo].sort(ordenAvisos).filter((r) => r.id === destino.id || !(r.prioridad === "alta" || r.urgente) || leidosSet.has(r.id));
    setPagina(Math.max(1, Math.floor(orden.findIndex((r) => r.id === destino.id) / POR_PAG) + 1));
    setResaltado(destino.id);
  }

  // "Requiere tu atención" (alta/urgente sin leer) arriba; el resto, paginado.
  const { atencion, recientes } = separarAvisos(filtrados, leidosSet);
  const totalPags = Math.max(1, Math.ceil(recientes.length / POR_PAG));
  const pagina_ = Math.min(pagina, totalPags);
  const visible = recientes.slice((pagina_ - 1) * POR_PAG, pagina_ * POR_PAG);
  const nombreCurso = (cid) => (items || []).find((i) => i.curso_id === cid)?.cursos?.nombre || null;
  const origenDe = (r) => origenAviso(r, { docente: etiquetaDocente(docenteDe(r.creado_por)), curso: nombreCurso(r.curso_id) });
  const recientesSinLeer = recientes.filter((r) => !leidosSet.has(r.id));
  const marcarTodos = async () => {
    if (!userId || !recientesSinLeer.length) return;
    const ids = recientesSinLeer.map((r) => r.id);
    await supabase.from("recordatorio_leidos").upsert(ids.map((id) => ({ recordatorio_id: id, usuario_id: userId })), { onConflict: "recordatorio_id,usuario_id" });
    setLeidosSet((p) => new Set([...p, ...ids]));
    recargarBadge?.();
  };
  // Confirmación de lectura: la RPC solo devuelve los avisos que este usuario
  // puede auditar (propios, de su curso como Room Parent, o como colegio).
  const lecturas = useLecturas(visible.map((r) => r.id));

  return (
    <View style={styles.screen}>
      <FiltrosSheet visible={filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)} grupos={gruposFiltro} onLimpiar={limpiarFiltros} />
      <LecturasSheet
        visible={!!verLecturas}
        titulo={verLecturas?.titulo || verLecturas?.texto}
        filas={verLecturas ? lecturas[verLecturas.id] : null}
        onClose={() => setVerLecturas(null)}
      />
      <FlatList
        ref={listaRef}
        contentContainerStyle={styles.content}
        data={visible}
        onScrollToIndexFailed={({ index }) => setTimeout(() => listaRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.2 }), 300)}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item }) => (
          <AvisoCard
            origen={origenDe(item)}
            r={item}
            resaltado={item.id === resaltado}
            esLeido={leidosSet.has(item.id)}
            // Los de colecta no se editan/borran acá: viven y mueren con su colecta (igual que la web)
            puedeEditar={
              (item.creado_por === userId || (!item.creado_por && (esVistaTodos ? cursosAdmin.has(item.curso_id) : isAdmin))) &&
              item.tipo !== "colecta_vence"
            }
            tag={tagDeCurso(item.curso_id)}
            lecturas={lecturas[item.id]}
            onLeido={marcarLeido}
            onEditar={abrirEditar}
            onEliminar={eliminar}
            onVerLecturas={setVerLecturas}
          />
        )}
        ListHeaderComponent={
          // El título lo da la pestaña "Avisos" de Comunicaciones; los filtros van
          // juntos en un botón (FiltrosSheet) en vez de una fila de chips.
          <View style={styles.headerWrap}>
            <Buscador value={busqueda} onChange={(v) => { setBusqueda(v); setPagina(1); }} placeholder="Buscar en avisos…" />
            <View style={styles.titleRow}>
              <Text style={styles.subtitle}>
                {sinLeer === 0 ? "Todo leído" : sinLeer === 1 ? "1 sin leer" : `${sinLeer} sin leer`}
              </Text>
              <View style={styles.acciones}>
                <BotonFiltros activos={filtrosActivos(gruposFiltro)} onPress={() => setFiltrosAbiertos(true)} />
                <BotonNuevo onPress={abrirNuevo} accessibilityLabel="Nuevo aviso" />
              </View>
            </View>
            {atencion.length ? (
              <>
                <View style={styles.seccionRow}>
                  <Text style={styles.seccionTxt}>Requiere tu atención</Text>
                  <View style={styles.seccionCuenta}><Text style={styles.seccionCuentaTxt}>{atencion.length}</Text></View>
                </View>
                {atencion.map((r) => (
                  <AvisoAtencion key={r.id} r={r} origen={origenDe(r)} resaltado={r.id === resaltado} onEntendido={marcarLeido} />
                ))}
              </>
            ) : null}
            {recientes.length ? (
              <View style={styles.seccionRow}>
                <Text style={[styles.seccionTxt, styles.flex1]}>Recientes</Text>
                {recientesSinLeer.length ? (
                  <Pressable onPress={marcarTodos} hitSlop={8} style={styles.marcarTodos}>
                    <MaterialCommunityIcons name="check-all" size={17} color={BLUE[600]} />
                    <Text style={styles.marcarTodosTxt}>Marcar todos como leídos</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={atencion.length ? null : (
          <EmptyState
            icon="bell-outline"
            title="Sin avisos"
            note="Cuando el curso tenga avisos, aparecen acá."
          />
        )}
        ListFooterComponent={
          <View>
            <Paginador pagina={pagina_} totalPag={totalPags} setPagina={setPagina} />
          </View>
        }
      />

      <RecordatorioModal
        visible={modal !== null}
        form={form}
        setForm={setForm}
        saving={saving}
        editing={!!modal?.id}
        cursoId={cursoId || form.curso_id}
        // En vista "Todos" el alta pide elegir el curso destino.
        cursosOpciones={esVistaTodos && !modal?.id ? cursosOpciones : []}
        onClose={() => setModal(null)}
        onGuardar={guardar}
      />
    </View>
  );
}

function RecordatorioModal({ visible, form, setForm, saving, editing, cursoId, cursosOpciones = [], onClose, onGuardar }) {
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  // KeyboardAvoidingView + ScrollView son imprescindibles acá: en iOS el teclado
  // de un TextInput multiline no tiene tecla para cerrarse y tocar Views comunes
  // no lo desenfoca — sin esto el teclado tapaba Guardar sin forma de cerrarlo.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex1} behavior="padding">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>{editing ? "Editar aviso" : "Nuevo aviso"}</Text>
              {cursosOpciones.length > 0 ? (
                <>
                  <Text style={styles.modalLabel}>Para el curso de</Text>
                  <View style={styles.cursoRow}>
                    {cursosOpciones.map((o) => {
                      const active = form.curso_id === o.curso_id;
                      return (
                        <Pressable
                          key={o.curso_id}
                          onPress={() => setForm((p) => ({ ...p, curso_id: o.curso_id }))}
                          style={[styles.cursoBtn, active && styles.cursoBtnOn]}
                        >
                          <View style={[styles.tagDot, { backgroundColor: o.tag.color }]} />
                          <Text style={[styles.cursoTxt, active && styles.cursoTxtOn]} numberOfLines={1}>
                            {o.tag.nombre}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.modalLabel}>Título (opcional)</Text>
              <TextInput
                value={form.titulo}
                onChangeText={(v) => setForm((p) => ({ ...p, titulo: v }))}
                placeholder="Ej: Reunión de padres"
                placeholderTextColor={t.placeholder}
                style={styles.modalInput}
              />

              <Text style={styles.modalLabel}>{form.titulo?.trim() ? "Descripción" : "Texto"}</Text>
              <TextInput
                value={form.texto}
                onChangeText={(v) => setForm((p) => ({ ...p, texto: v }))}
                placeholder={form.titulo?.trim() ? "Ej: En el SUM, traer la autorización firmada." : "Ej: Reunión de padres el viernes"}
                placeholderTextColor={t.placeholder}
                multiline
                style={[styles.modalInput, styles.modalTextarea]}
              />

              <Text style={styles.modalLabel}>Fecha (opcional)</Text>
              <DateField
                value={form.fecha || ""}
                onChange={(v) => setForm((p) => ({ ...p, fecha: v }))}
                clearable
                style={styles.modalInput}
              />

              {form.fecha ? (
                <>
                  <View style={styles.horaRow}>
                    <View style={styles.horaCol}>
                      <Text style={styles.modalLabel}>Hora inicio</Text>
                      <TextInput
                        value={form.hora_inicio}
                        onChangeText={(v) => setForm((p) => ({ ...p, hora_inicio: v }))}
                        placeholder="18:00"
                        placeholderTextColor={t.placeholder}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        style={styles.modalInput}
                      />
                    </View>
                    <View style={styles.horaCol}>
                      <Text style={styles.modalLabel}>Hora fin</Text>
                      <TextInput
                        value={form.hora_fin}
                        onChangeText={(v) => setForm((p) => ({ ...p, hora_fin: v }))}
                        placeholder="19:30"
                        placeholderTextColor={t.placeholder}
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                        editable={!!form.hora_inicio}
                        style={[styles.modalInput, !form.hora_inicio && styles.inputOff]}
                      />
                    </View>
                  </View>
                  <Text style={styles.horaHint}>Con hora de inicio, el aviso también aparece en el calendario sincronizado.</Text>
                </>
              ) : null}

              <Text style={styles.modalLabel}>Prioridad</Text>
              <View style={styles.prioRow}>
                {["alta", "media", "baja"].map((p) => {
                  const active = form.prioridad === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setForm((f) => ({ ...f, prioridad: p }))}
                      style={[styles.prioBtn, active && { borderColor: PRIO[p].c, backgroundColor: PRIO[p].bg }]}
                    >
                      <Text style={[styles.prioTxt, active && { color: p === "media" ? "#B45309" : PRIO[p].c }]}>
                        {PRIO[p].l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setForm((p) => ({ ...p, urgente: !p.urgente }))}
                style={[styles.urgenteBtn, form.urgente && styles.urgenteOn]}
              >
                <Text style={[styles.urgenteTxt, form.urgente && styles.urgenteTxtOn]}>
                  {form.urgente ? "✓ Urgente" : "Marcar urgente"}
                </Text>
              </Pressable>

              <Text style={styles.modalLabel}>Adjuntos (opcional)</Text>
              <AdjuntosInput
                adjuntos={form.adjuntos || []}
                onChange={(adj) => setForm((p) => ({ ...p, adjuntos: adj }))}
                cursoId={cursoId}
                onUploadingChange={setSubiendoAdj}
              />

              <View style={styles.modalBtns}>
                <Pressable onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={onGuardar} disabled={saving || subiendoAdj} style={[styles.saveBtn, subiendoAdj && styles.saveBtnOff]}>
                  <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Estilos A3: sin sombras, borde hairline, radio 16, dot de estado como ancla.
const styles = StyleSheet.create({
  // Avisos (formato tarjetas: Requiere tu atención + Recientes)
  seccionRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: SPACE.md, marginBottom: SPACE.sm },
  seccionTxt: { fontSize: 17, fontWeight: "800", color: t.textStrong },
  seccionCuenta: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: RADIUS.full, backgroundColor: t.dangerSoft, alignItems: "center", justifyContent: "center" },
  seccionCuentaTxt: { fontSize: 12, fontWeight: "800", color: t.danger },
  marcarTodos: { flexDirection: "row", alignItems: "center", gap: 5 },
  marcarTodosTxt: { fontSize: 13.5, fontWeight: "700", color: BLUE[600] },
  aviso: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 20, padding: 16, marginBottom: SPACE.md },
  avisoResaltado: { borderColor: BLUE[400], borderWidth: 2 },
  avisoTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  prioPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: RADIUS.full },
  prioDot: { width: 7, height: 7, borderRadius: 4 },
  prioPillTxt: { fontSize: 12.5, fontWeight: "700" },
  origen: { flex: 1, fontSize: 13.5, color: t.textMuted },
  hace: { fontSize: 13, color: t.textMuted },
  puntoNoLeido: { width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE[600] },
  avisoCuerpo: { flexDirection: "row", gap: 12, marginTop: 10 },
  avisoTitulo: { fontSize: 16.5, fontWeight: "800", color: t.textStrong, lineHeight: 22 },
  avisoLeido: { color: t.text },
  avisoTexto: { fontSize: 14, color: t.textMuted, marginTop: 4, lineHeight: 20 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  fechaLinea: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  fechaLineaTxt: { fontSize: 13.5, fontWeight: "600", color: t.textMuted },
  avisoPie: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  noLeidoTxt: { fontSize: 12.5, fontWeight: "700", color: t.textMuted },
  atencion: { backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FECACA", borderRadius: 20, padding: 16, marginBottom: SPACE.md },
  atencionTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  atencionIcono: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" },
  atencionTipo: { fontSize: 13.5, fontWeight: "800", color: "#B91C1C" },
  atencionFecha: { fontSize: 13, color: t.textMuted, marginTop: 1 },
  atencionTitulo: { fontSize: 19, fontWeight: "800", color: t.textStrong, marginTop: 12 },
  atencionTexto: { fontSize: 14.5, color: t.text, marginTop: 4, lineHeight: 21 },
  atencionBtns: { flexDirection: "row", gap: 10, marginTop: 14 },
  atencionVer: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#fff" },
  atencionVerTxt: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  atencionOk: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 46, borderRadius: 14, backgroundColor: BLUE[600] },
  atencionOkTxt: { fontSize: 14.5, fontWeight: "800", color: "#fff" },
  horaRow: { flexDirection: "row", gap: 10 },
  horaCol: { flex: 1 },
  inputOff: { opacity: 0.5 },
  horaHint: { fontSize: 11, color: "#94A3B8", marginTop: 4 },
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  headerWrap: { marginBottom: SPACE.md },
  flex1: { flex: 1 },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, fontWeight: "600", color: t.textMuted, flexShrink: 1 },
  acciones: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: SPACE.sm },


  // fila de recordatorio
  rowResaltado: { backgroundColor: "#EFF6FF", borderRadius: RADIUS.lg, marginHorizontal: -8, paddingHorizontal: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: 13,
    marginBottom: SPACE.sm,
    borderRadius: RADIUS.xl,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  rdot: { width: 8, height: 8, borderRadius: RADIUS.full },
  rdotLeido: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: SLATE[300] },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, lineHeight: 19, marginBottom: 1 },
  rowTxt: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, lineHeight: 19 },
  rowTxtConTitulo: { fontSize: 13.5, fontWeight: "500" },
  rowTxtLeido: { fontWeight: "500", color: t.textMuted },
  verMasTxt: { fontSize: 11.5, fontWeight: "700", color: BLUE[600], marginTop: 2 },
  rowMeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  rowEnviado: { fontSize: 11, color: t.textFaint, marginTop: 1 },
  // tag de hijo en modo "Todos": dot con el color de identidad + primer(os) nombre(s)
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  tagDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  tagTxt: { fontSize: 11.5, fontWeight: "700", color: t.textMuted },
  rowActions: { alignItems: "flex-end", gap: 6 },
  leerBtn: { minHeight: 30, justifyContent: "center" },
  leerTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  checkBtn: { minHeight: 30, minWidth: 30, alignItems: "center", justifyContent: "center" },
  editRow: { flexDirection: "row", gap: 4 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { textAlign: "center", paddingVertical: SPACE.xl, color: t.textFaint, fontSize: 13 },

  // modal
  modalOverlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 420, maxHeight: "88%", backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginBottom: 14 },
  // selector de curso destino (solo vista "Todos")
  cursoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cursoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  cursoBtnOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  cursoTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  cursoTxtOn: { color: BLUE[600] },
  modalLabel: { ...TYPE.label, color: t.textFaint, marginBottom: 5, marginTop: 6 },
  modalInput: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surfaceSunken,
    paddingHorizontal: SPACE.md,
    fontSize: 13,
    color: t.text,
  },
  modalTextarea: { minHeight: 72, paddingTop: 10, textAlignVertical: "top" },
  prioRow: { flexDirection: "row", gap: 6 },
  prioBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  prioTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  urgenteBtn: {
    alignSelf: "flex-start",
    marginTop: SPACE.md,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  urgenteOn: { borderColor: t.danger, backgroundColor: t.dangerSoft },
  urgenteTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  urgenteTxtOn: { color: t.danger },
  modalBtns: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.lg },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textFaint, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveBtnOff: { opacity: 0.5 },
  saveTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },

});
