// Calendario (puerto RN de src/features/calendario). Vistas Mes / Próximos /
// Horario. eventos + cumpleaños (virtuales). Admin crea/edita eventos
// (EventoModal) y se puede pedir confirmación de asistencia (EventoAsistenciaModal).
// Deep-link: openFecha selecciona el día en la vista Mes. Los festejos se
// gestionan en Cumpleaños (no se abre su modal acá).

import { useState, useEffect, useCallback, useRef } from "react";
import { EmptyState } from "../../components/EmptyState";
import { View, Text, Pressable, ScrollView, TextInput, Modal, Linking, KeyboardAvoidingView, StyleSheet, Alert, RefreshControl } from "react-native";
import { useRecarga } from "../../lib/useRecarga";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fmtNombre, safeUrl, fmtRangoFecha, fmtLocalDate } from "@shared/helpers";
import { rangoNecesario, cubre, unirRangos, filtroDesdeEventos } from "@shared/calendarioRango";
import { MESES } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { supabase } from "../../lib/supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { AdjuntosInput, AdjuntosList, ImagenAmpliable } from "../../components/Adjuntos";
import { DateField } from "../../components/DateField";
import BotonAgregarCalendario from "./BotonAgregarCalendario";
import { BotonFiltros, FiltrosSheet, filtrosActivos } from "../../components/Filtros";
import { BotonNuevo } from "../../components/BotonNuevo";
import { Buscador } from "../../components/Buscador";
import { FestejoDetalleModal } from "../cumples";
import { diasVisibles, normalizarDia, DIA_CORTO, DIAS_HORARIO } from "@shared/horarios";
import { bloquesDeTalleres } from "@shared/talleres";
import { textoPlano } from "@shared/formato";
import { useAutoresDocentes } from "../../lib/useAutoresDocentes";
import { etiquetaDocente, separarCumplesDocente } from "@shared/docentes";

const t = THEMES.light;

const TIPO_CONFIG = {
  cumple: { emoji: "🎂", color: "#EC4899", bg: "#FDF2F8", label: "Cumpleaños" },
  festejo: { emoji: "🎉", color: "#F59E0B", bg: "#FFFBEB", label: "Festejo" },
  paseo: { emoji: "🚌", color: "#3B82F6", bg: "#EFF6FF", label: "Paseo" },
  acto: { emoji: "🎭", color: "#8B5CF6", bg: "#F5F3FF", label: "Acto escolar" },
  dia_especial: { emoji: "⭐", color: "#10B981", bg: "#F0FDF4", label: "Día especial" },
  comunicado: { emoji: "📢", color: "#F97316", bg: "#FFF7ED", label: "Comunicado" },
  feriado: { emoji: "🚩", color: "#EF4444", bg: "#FEF2F2", label: "Feriado" },
  vacaciones: { emoji: "🏖️", color: "#06B6D4", bg: "#ECFEFF", label: "Vacaciones" },
};
const pad = (n) => String(n).padStart(2, "0");

// soloHorario: la pestaña "Horario" de Agenda (ruta (tabs)/horario).
export function Calendario({ openFecha = null, onClearOpenFecha, soloHorario = false }) {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, isAdmin, misHijos = [], cursosDocente = [], hijoActivoId = null, esDocente = false } = useSession();
  // Room Parent o docente de este curso: pueden cargar eventos (no en "Todos").
  const puedeCrear = isAdmin || (!!cursoId && cursosDocente.includes(cursoId));
  const userId = usuario?.id ?? null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [vista, setVista] = useState(soloHorario ? "horario" : "mes");
  // Horario: día elegido; arranca en hoy (o en el primero con clases).
  const [diaHorario, setDiaHorario] = useState(null);
  const diaHorarioSel = (dias) => (dias.includes(diaHorario) ? diaHorario : dias.includes(diaDeHoy()) ? diaDeHoy() : dias[0]);
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [eventos, setEventos] = useState([]);
  // Quién de los autores es docente: "Laura Fernández · Inglés" (como en la web).
  const docenteDe = useAutoresDocentes(eventos.map((e) => e.creado_por));
  const [cumples, setCumples] = useState([]);
  const [recordatorios, setRecordatorios] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [talleresInsc, setTalleresInsc] = useState([]); // inscripciones "inscripto" de mis hijos con su taller
  const [cursoDeHijo, setCursoDeHijo] = useState({});   // hijo_id → curso_id (de mis hijos)
  const [diaSelec, setDiaSelec] = useState(null);
  const [modal, setModal] = useState(null); // "nuevo" | evento
  const [confirm, setConfirm] = useState(null);
  const [eventoDetalle, setEventoDetalle] = useState(null);
  const [festejoDetalle, setFestejoDetalle] = useState(null);
  const [filtroRango, setFiltroRango] = useState("90");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const gruposFiltro = [
    { key: "rango", label: "Período", defecto: "90", value: filtroRango, onChange: setFiltroRango, options: [{ value: "7", label: "Esta semana" }, { value: "30", label: "Este mes" }, { value: "90", label: "Próximos 3 meses" }] },
    { key: "tipo", label: "Tipo de evento", value: filtroTipo, onChange: setFiltroTipo, options: [{ value: "todos", label: "Todos" }, ...Object.entries(TIPO_CONFIG).filter(([k]) => k !== "festejo").map(([k, v]) => ({ value: k, label: v.label }))] },
  ];

  // Rango de eventos cargado (@shared/calendarioRango): arranca en [1° del mes
  // actual, hoy + 90 días] y se amplía acá, en el render, cuando la vista pide
  // fechas fuera (otro mes, deep-link). Antes se pedían todos los eventos del
  // año en cada carga.
  const necesario = rangoNecesario({ hoy, mes, vista });
  const [rangoEventos, setRangoEventos] = useState(null);
  if (!cubre(rangoEventos, necesario)) setRangoEventos(unirRangos(rangoEventos, necesario));

  // Deep-link (openFecha): la tarjeta del día queda debajo de la grilla del
  // mes en el mismo ScrollView — sin este scroll automático el usuario no ve
  // que la navegación surtió efecto. En vista "mes" la tarjeta del día es
  // siempre lo último del contenido, así que scrollToEnd alcanza.
  const scrollRef = useRef(null);
  const pendingScroll = useRef(false);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length || !rangoEventos) return;
    const hoyStr = fmtLocalDate(new Date());
    // Docente: la RLS no le deja leer hijos/maestros → cumpleaños por RPC (una sola llamada para las dos listas).
    const cumplesDoc = esDocente ? supabase.rpc("cumples_para_docente", { p_cursos: cursoIds }).then((r) => separarCumplesDocente(r.data)) : null;
    const [ev, al, ma, hor, recs, tal] = await Promise.all([
      // Solo los que se solapan con el rango cargado (ver rangoEventos arriba).
      supabase
        .from("eventos")
        .select("*")
        .in("curso_id", cursoIds)
        .lte("fecha", rangoEventos.hasta)
        .or(filtroDesdeEventos(rangoEventos.desde))
        .order("fecha"),
      cumplesDoc ? cumplesDoc.then((x) => ({ data: x.hijos })) : supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id", cursoIds),
      cumplesDoc
        ? cumplesDoc.then((x) => ({ data: x.maestros }))
        : supabase
          .from("maestros")
          .select("id,nombre,apellido,fecha_nacimiento, maestro_cursos!inner(curso_id)")
          .in("maestro_cursos.curso_id", cursoIds),
      // clases(optativa, clase_alumnos): talleres optativos — por RLS cada
      // familia recibe solo las filas de sus hijos (ver horariosVisibles).
      supabase.from("horarios").select("*, clases(optativa, clase_alumnos(hijo_id))").in("curso_id", cursoIds).order("hora_inicio"),
      // Comunicados: recordatorios con fecha de hoy en adelante, para todos o
      // para mí (filtrado en la consulta; antes se traían todos).
      (userId
        ? supabase.from("recordatorios").select("*").in("curso_id", cursoIds).or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`)
        : supabase.from("recordatorios").select("*").in("curso_id", cursoIds).is("para_usuario_id", null)
      )
        .gte("fecha", hoyStr)
        .order("fecha", { ascending: true }),
      // Talleres extraprogramáticos en los que mis hijos están inscriptos.
      misHijos.length
        ? supabase.from("taller_inscripciones").select("taller_id, hijo_id, estado, talleres(id, nombre, estado, fecha_inicio, fecha_fin, profe_texto, taller_horarios(id, taller_id, dia, hora_inicio, hora_fin))").in("hijo_id", misHijos).eq("estado", "inscripto")
        : { data: [] },
    ]);
    setEventos(ev.data || []);
    setHorarios(hor.data || []);
    setTalleresInsc(tal.data || []);
    setCursoDeHijo(Object.fromEntries((al.data || []).filter((a) => misHijos.includes(a.id)).map((a) => [a.id, a.curso_id])));
    setRecordatorios(recs.data || []);
    setCumples([
      ...(al.data || [])
        .filter((a) => a.fecha_nacimiento)
        .map((a) => ({
          id: `c-a-${a.id}`,
          tipo: "cumple",
          nombre: fmtNombre(a),
          fecha_nacimiento: a.fecha_nacimiento,
          curso_id: a.curso_id,
        })),
      ...(ma.data || [])
        .filter((m) => m.fecha_nacimiento)
        .map((m) => ({
          id: `c-m-${m.id}`,
          tipo: "cumple",
          nombre: fmtNombre(m),
          fecha_nacimiento: m.fecha_nacimiento,
          curso_id: m.maestro_cursos?.[0]?.curso_id ?? null,
        })),
    ]);
  }, [cursoIds, userId, rangoEventos, misHijos, esDocente]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  const { refrescando, onRefresh } = useRecarga(cargar);

  useEffect(() => {
    if (!openFecha) return;
    const d = new Date(openFecha + "T00:00:00");
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    setDiaSelec({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
    setVista("mes");
    pendingScroll.current = true;
    onClearOpenFecha?.();
  }, [openFecha, onClearOpenFecha]);

  // Una vez que la tarjeta del día se montó, si el cambio vino de un
  // deep-link la llevamos a la vista.
  useEffect(() => {
    if (!pendingScroll.current || !diaSelec) return;
    pendingScroll.current = false;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [diaSelec]);

  const eliminar = async (id) => {
    // Sin ON DELETE CASCADE hacia evento_asistencia: si el evento tiene RSVPs
    // (confirma_asistencia) el delete de "eventos" viola la FK y falla en
    // silencio (mismo patrón que eliminarAlumno en superadmin) — limpiar antes.
    // Las asistencias se borran en cascada (eventos-permisos-edicion.sql).
    const { data: borrados, error } = await supabase.from("eventos").delete().eq("id", id).select("adjuntos,imagen_url");
    setConfirm(null);
    if (error) { Alert.alert("No se pudo eliminar", error.message); return; }
    borrarArchivos(borrados?.[0]?.adjuntos, "adjuntos");
    if (borrados?.[0]?.imagen_url) borrarArchivos([borrados[0].imagen_url], "eventos");
    cargar();
  };

  // Recordatorios con fecha (incluye Comunicaciones del colegio con grupo_id)
  // se muestran como eventos virtuales tipo "comunicado" — con horario si lo
  // cargaron, si no como "todo el día". Uno sin fecha es un aviso permanente
  // sin lugar en el calendario.
  const comunicados = recordatorios
    .filter((r) => r.fecha)
    .map((r) => ({
      id: `r-${r.id}`,
      tipo: "comunicado",
      titulo: (r.grupo_id ? "🏫 " : "") + (r.titulo || textoPlano(r.texto)),
      descripcion: r.titulo ? textoPlano(r.texto) : null,
      fecha: r.fecha,
      hora: r.hora_inicio,
      hora_fin: r.hora_fin,
      curso_id: r.curso_id,
      adjuntos: r.adjuntos,
    }));

  // Un evento multi-día (fecha_fin) aparece en cada día de su rango.
  const eventosDelDia = (year, month, day) => {
    const fecha = `${year}-${pad(month + 1)}-${pad(day)}`;
    const reales = eventos.filter((e) => e.fecha <= fecha && (e.fecha_fin || e.fecha) >= fecha);
    const citas = comunicados.filter((c) => c.fecha === fecha);
    const bday = cumples
      .filter((c) => {
        const d = new Date(c.fecha_nacimiento + "T00:00:00");
        return d.getMonth() === month && d.getDate() === day;
      })
      .map((c) => ({ ...c, titulo: c.nombre, fecha }));
    return [...reales, ...citas, ...bday];
  };

  const year = mes.getFullYear();
  const month = mes.getMonth();
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDay).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  const listaEventos = () => {
    const desde = new Date(hoy);
    const hasta = new Date(hoy);
    hasta.setDate(hasta.getDate() + Number(filtroRango));
    const reales = eventos
      .filter((e) => {
        const ini = new Date(e.fecha + "T00:00:00");
        const fin = e.fecha_fin ? new Date(e.fecha_fin + "T00:00:00") : ini;
        return fin >= desde && ini <= hasta; // solapa el rango del filtro
      })
      .map((e) => ({ ...e, _fecha: new Date(e.fecha + "T00:00:00") }));
    const citas = comunicados
      .map((c) => ({ ...c, _fecha: new Date(c.fecha + "T00:00:00") }))
      .filter((c) => c._fecha >= desde && c._fecha <= hasta);
    const bday = cumples
      .map((c) => {
        const d = new Date(c.fecha_nacimiento + "T00:00:00");
        let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
        if (next < desde) next = new Date(hoy.getFullYear() + 1, d.getMonth(), d.getDate());
        if (next < desde || next > hasta) return null;
        return { ...c, titulo: c.nombre, fecha: fmtLocalDate(next), _fecha: next, tipo: "cumple" };
      })
      .filter(Boolean);
    const todos = [...reales, ...citas, ...bday].sort((a, b) => a._fecha - b._fecha);
    return filtroTipo === "todos" ? todos : todos.filter((e) => e.tipo === filtroTipo);
  };

  const evDiaSelec = diaSelec ? eventosDelDia(diaSelec.year, diaSelec.month, diaSelec.day) : [];

  // Talleres optativos: los ve quien gestiona el curso (Room Parent, docente)
  // y cada familia solo si su hijo está anotado.
  const hijosFiltro = esVistaTodos || !hijoActivoId ? misHijos : [hijoActivoId];
  const talleresVis = talleresInsc.filter((i) => i.talleres && hijosFiltro.includes(i.hijo_id));
  const bloquesTaller = bloquesDeTalleres([...new Map(talleresVis.map((i) => [i.talleres.id, i.talleres])).values()], {
    horarios: talleresVis.flatMap((i) => i.talleres.taller_horarios || []),
    inscripciones: talleresVis, hijos: Object.entries(cursoDeHijo).map(([id, curso_id]) => ({ id, curso_id })),
  });
  const horariosVisibles = [...horarios.filter((h) => !h.clases?.optativa || (isAdmin && h.curso_id === cursoId) || cursosDocente.includes(h.curso_id)
    || (h.clases.clase_alumnos || []).some((a) => hijosFiltro.includes(a.hijo_id))), ...bloquesTaller];

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}>
      {/* Una sola fila arriba del mes (antes: título + subtítulo + chip de
          sincronizar + pastillas con emojis = muchos niveles). El título ya lo da
          la pestaña "Calendario" de Agenda; el Horario es su propia pestaña. */}
      {soloHorario ? null : (
      <View style={styles.vistasRow}>
        <View style={styles.vistas}>
          {[
            { id: "mes", l: "Mes" },
            { id: "lista", l: "Próximos" },
          ].map((v) => (
            <Pressable key={v.id} onPress={() => setVista(v.id)} style={[styles.vista, vista === v.id && styles.vistaOn]} hitSlop={4}>
              <Text style={[styles.vistaTxt, vista === v.id && styles.vistaTxtOn]}>{v.l}</Text>
            </Pressable>
          ))}
        </View>
        <BotonAgregarCalendario userId={userId} compacto />
        {puedeCrear ? (
          <BotonNuevo onPress={() => setModal("nuevo")} accessibilityLabel="Nuevo evento" />
        ) : null}
      </View>
      )}

      {vista === "mes" ? (
        <View>
          <Card style={styles.calCard}>
            <View style={styles.monthNav}>
              <Pressable onPress={() => setMes(new Date(year, month - 1, 1))} style={styles.navBtn}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={t.textMuted} />
              </Pressable>
              <Text style={styles.monthLabel}>
                {MESES[month]} {year}
              </Text>
              <Pressable onPress={() => setMes(new Date(year, month + 1, 1))} style={styles.navBtn}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={t.textMuted} />
              </Pressable>
            </View>
            <View style={styles.calGrid}>
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((d) => (
                <View key={d} style={styles.calCell}>
                  <Text style={styles.calDow}>{d}</Text>
                </View>
              ))}
              {cells.map((day, i) => {
                if (!day) return <View key={`e${i}`} style={styles.calCell} />;
                const esHoy = day === hoy.getDate() && month === hoy.getMonth() && year === hoy.getFullYear();
                const evs = eventosDelDia(year, month, day);
                const selec = diaSelec?.day === day && diaSelec?.month === month && diaSelec?.year === year;
                return (
                  <Pressable
                    key={`d${day}`}
                    onPress={() => setDiaSelec(selec ? null : { year, month, day })}
                    style={styles.calCell}
                  >
                    <View style={[styles.calDayBox, esHoy && styles.calDayHoy, selec && styles.calDaySelec]}>
                      <Text style={[styles.calDayTxt, esHoy && !selec && styles.calDayTxtHoy, selec && styles.calDayTxtOn]}>{day}</Text>
                      {evs.length > 0 ? (
                        <View style={styles.dots}>
                          {evs.slice(0, 3).map((e, ei) => {
                            const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
                            return (
                              <View
                                key={ei}
                                style={[styles.dot, { backgroundColor: esHoy || selec ? "white" : cfg.color }]}
                              />
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {diaSelec ? (
            <Card style={styles.diaCard}>
              <View style={styles.diaHeader}>
                <Text style={styles.diaTitle}>
                  {diaSelec.day} de {MESES[diaSelec.month]}
                </Text>
                {puedeCrear ? (
                  <Pressable onPress={() => setModal("nuevo")} style={styles.miniAdd}>
                    <Text style={styles.miniAddTxt}>+ Agregar</Text>
                  </Pressable>
                ) : null}
              </View>
              {evDiaSelec.length === 0 ? (
                <Text style={styles.muted}>Sin eventos este día</Text>
              ) : (
                evDiaSelec.map((e, i) => (
                  <EventoRow
                    key={e.id || i}
                    e={e}
                    tag={tagDeCurso(e.curso_id)}
                    docente={docenteDe(e.creado_por)}
                    isAdmin={isAdmin}
                    userId={userId}
                    onAsistencia={() => setEventoDetalle(e)}
                    onFestejo={() => setFestejoDetalle(e)}
                    onEditar={() => setModal(e)}
                    onEliminar={() => setConfirm(e)}
                  />
                ))
              )}
            </Card>
          ) : null}
        </View>
      ) : null}

      {vista === "lista" ? (
        <View>
          <View style={styles.filaFiltros}>
            <Text style={styles.filaFiltrosTxt}>{listaEventos().length === 1 ? "1 evento" : `${listaEventos().length} eventos`}</Text>
            <BotonFiltros activos={filtrosActivos(gruposFiltro)} onPress={() => setFiltrosAbiertos(true)} />
          </View>
          <FiltrosSheet visible={filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)} grupos={gruposFiltro} />

          {listaEventos().length === 0 ? (
            <EmptyState icon="calendar-blank-outline" title="No hay eventos" note="Probá con otros filtros, o creá uno con + Nuevo." />
          ) : null}
          {listaEventos().map((e, i) => {
            const d = new Date(e.fecha + "T00:00:00");
            const dFin = e.fecha_fin ? new Date(e.fecha_fin + "T00:00:00") : d;
            const enCurso = hoy >= d && hoy <= dFin;
            const dias = enCurso ? 0 : Math.round((d - hoy) / 86400000);
            const diasTxt = enCurso ? "En curso" : dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `${dias}d`;
            return (
              <Card key={e.id || i} style={styles.listCard}>
                <View style={styles.listRow}>
                  {/* Fecha en columna, como "Próximos días" del Inicio. */}
                  <View style={styles.fechaCol}>
                    <Text style={styles.fechaDow}>{d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "")}</Text>
                    <Text style={styles.fechaNum}>{d.getDate()}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.eventoTitulo}>{e.titulo}</Text>
                    <TagHijo tag={tagDeCurso(e.curso_id)} />
                    {docenteDe(e.creado_por) ? <Text style={styles.eventoDocente}>{etiquetaDocente(docenteDe(e.creado_por)).replace(/^👩‍🏫\s*/, "")}</Text> : null}
                    <Text style={styles.eventoMeta}>
                      {[TIPO_CONFIG[e.tipo]?.label, e.fecha_fin && e.fecha_fin !== e.fecha ? fmtRangoFecha(e.fecha, e.fecha_fin) : null, e.hora ? `${e.hora}${e.hora_fin ? ` – ${e.hora_fin}` : ""}` : null].filter(Boolean).join(" · ")}
                    </Text>
                    {e.lugar ? (
                      <View style={styles.lugarRow}>
                        <MaterialCommunityIcons name="map-marker-outline" size={14} color={t.textMuted} />
                        <Text style={[styles.eventoMeta, { marginTop: 0 }]}>{e.lugar}</Text>
                        {e.url_ubicacion ? (
                          <Pressable onPress={() => safeUrl(e.url_ubicacion) && Linking.openURL(safeUrl(e.url_ubicacion))}>
                            <Text style={styles.mapLink}>Ver mapa</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                    {e.descripcion ? <Text style={styles.eventoDesc}>{e.descripcion}</Text> : null}
                    {e.tipo === "festejo" && e.imagen_url ? (
                      <ImagenAmpliable src={e.imagen_url} bucket="eventos" style={styles.fotoFestejo} />
                    ) : null}
                    <AdjuntosList adjuntos={e.adjuntos} />
                  </View>
                  <View style={styles.listRight}>
                    <View style={styles.diasTag}>
                      <Text style={styles.diasTagTxt}>{diasTxt}</Text>
                    </View>
                    {e.tipo === "festejo" ? (
                      <Pressable onPress={() => setFestejoDetalle(e)} style={styles.linkBtn} hitSlop={6}>
                        <Text style={styles.linkTxt}>Invitados →</Text>
                      </Pressable>
                    ) : e.confirma_asistencia ? (
                      <Pressable onPress={() => setEventoDetalle(e)} style={styles.linkBtn} hitSlop={6}>
                        <Text style={styles.linkTxt}>Asistencia →</Text>
                      </Pressable>
                    ) : null}
                    {userId && e.creado_por === userId && e.id && !String(e.id).startsWith("c-") && !String(e.id).startsWith("r-") && e.tipo !== "festejo" ? (
                      <View style={styles.editRow}>
                        <Pressable onPress={() => setModal(e)} style={styles.miniBtn} accessibilityLabel="Editar evento">
                          <MaterialCommunityIcons name="pencil-outline" size={16} color={SLATE[500]} />
                        </Pressable>
                        <Pressable onPress={() => setConfirm(e)} style={styles.miniBtn} accessibilityLabel="Borrar evento">
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color={SLATE[500]} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      {vista === "horario" ? (
        horariosVisibles.length === 0 ? (
          <EmptyState icon="clock-outline" title="Todavía no hay horario"
            note={isAdmin ? "Cargalo desde Curso → Administrar el curso → Horarios." : "Cuando el colegio cargue el horario de clases, aparece acá."} />
        ) : (
          <>
            <DiasHorario dias={diasVisibles(horariosVisibles)} dia={diaHorarioSel(diasVisibles(horariosVisibles))} onDia={setDiaHorario} />
            {esVistaTodos ? (
              (cursoIds || [])
                .filter((cid) => horariosVisibles.some((h) => h.curso_id === cid))
                .map((cid) => (
                  <View key={cid} style={styles.horarioSeccion}>
                    <TagHijo tag={tagDeCurso(cid)} />
                    <HorarioDia horarios={horariosVisibles.filter((h) => h.curso_id === cid)} dia={diaHorarioSel(diasVisibles(horariosVisibles))} />
                  </View>
                ))
            ) : (
              <HorarioDia horarios={horariosVisibles} dia={diaHorarioSel(diasVisibles(horariosVisibles))} />
            )}
          </>
        )
      ) : null}

      {modal === "nuevo" || modal?.id ? (
        <EventoModal
          evento={modal === "nuevo" ? null : modal}
          cursoId={cursoId}
          userId={userId}
          onClose={() => setModal(null)}
          onSave={() => {
            setModal(null);
            cargar();
          }}
        />
      ) : null}

      {eventoDetalle ? (
        <EventoAsistenciaModal
          evento={eventoDetalle}
          tag={tagDeCurso(eventoDetalle.curso_id)}
          misHijos={misHijos}
          userId={userId}
          isAdmin={isAdmin}
          onClose={() => setEventoDetalle(null)}
        />
      ) : null}

      {festejoDetalle ? (
        <FestejoDetalleModal
          evento={festejoDetalle}
          userId={userId}
          misHijos={misHijos}
          onClose={() => setFestejoDetalle(null)}
          onUpdate={cargar}
        />
      ) : null}

      <Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.overlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>¿Eliminar evento?</Text>
            <Text style={styles.muted}>{confirm?.titulo}</Text>
            <View style={styles.modalBtns}>
              <Pressable onPress={() => setConfirm(null)} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={() => eliminar(confirm.id)} style={styles.deleteBtn}>
                <Text style={styles.saveTxt}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Tag de hijo estándar (solo vista "Todos": tagDeCurso devuelve null en vista por hijo).
function TagHijo({ tag }) {
  if (!tag) return null;
  return (
    <View style={styles.tagHijoRow}>
      <View style={[styles.tagHijoDot, { backgroundColor: tag.color }]} />
      <Text style={styles.tagHijoTxt} numberOfLines={1}>
        {tag.nombre}
      </Text>
    </View>
  );
}

function EventoRow({ e, tag = null, docente = null, isAdmin, userId, onAsistencia, onFestejo, onEditar, onEliminar }) {
  const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
  // Solo quien lo creó lo edita/borra (Room Parent incluida), igual que la
  // RLS (puede_editar_evento). El colegio lo hace desde su panel.
  const editable = userId && e.creado_por === userId && e.id && !String(e.id).startsWith("c-") && !String(e.id).startsWith("r-") && e.tipo !== "festejo";
  return (
    <View style={styles.diaRow}>
      <View style={styles.flex1}>
        <Text style={styles.eventoTitulo}>{e.titulo}</Text>
        <TagHijo tag={tag} />
        {docente ? <Text style={styles.eventoDocente}>{etiquetaDocente(docente).replace(/^👩‍🏫\s*/, "")}</Text> : null}
        <Text style={styles.eventoMeta}>
          {cfg.label}
          {e.hora ? ` · ${e.hora}${e.hora_fin ? ` – ${e.hora_fin}` : ""}` : ""}
          {e.lugar ? ` · ${e.lugar}` : ""}
        </Text>
        {e.descripcion ? <Text style={styles.eventoDesc}>{e.descripcion}</Text> : null}
        {e.tipo === "festejo" && e.imagen_url ? (
          <ImagenAmpliable src={e.imagen_url} bucket="eventos" style={styles.fotoFestejo} />
        ) : null}
        <AdjuntosList adjuntos={e.adjuntos} />
      </View>
      {e.tipo === "festejo" ? (
        <Pressable onPress={onFestejo} style={styles.linkBtn} hitSlop={6}>
          <Text style={styles.linkTxt}>Invitados →</Text>
        </Pressable>
      ) : e.confirma_asistencia ? (
        <Pressable onPress={onAsistencia} style={styles.linkBtn} hitSlop={6}>
          <Text style={styles.linkTxt}>Asistencia →</Text>
        </Pressable>
      ) : null}
      {editable ? (
        <View style={styles.editRow}>
          <Pressable onPress={onEditar} style={styles.miniBtn} accessibilityLabel="Editar evento">
            <MaterialCommunityIcons name="pencil-outline" size={16} color={SLATE[500]} />
          </Pressable>
          <Pressable onPress={onEliminar} style={styles.miniBtn} accessibilityLabel="Borrar evento">
            <MaterialCommunityIcons name="trash-can-outline" size={16} color={SLATE[500]} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// Horario de la familia: un día por vez (pestañas Lun–Vie, arranca en hoy) y
// la lista de clases de ese día, sobrio: hora, materia y docente; el color
// de la materia queda solo como una rayita a la izquierda.
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

// Día de hoy como "Lunes"…"Sábado" (domingo → null).
const diaDeHoy = () => DIAS_HORARIO[new Date().getDay() - 1] || null;

function DiasHorario({ dias, dia, onDia }) {
  return (
    <View style={styles.diasTabs}>
      {dias.map((d) => {
        const on = d === dia;
        return (
          <Pressable key={d} onPress={() => onDia(d)} style={[styles.diaTab, on && styles.diaTabOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.diaTabTxt, on && styles.diaTabTxtOn]}>{DIA_CORTO[d]}</Text>
            {d === diaDeHoy() ? <View style={[styles.diaHoyDot, on && styles.diaHoyDotOn]} /> : <View style={styles.diaHoyDotVacio} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function HorarioDia({ horarios, dia }) {
  const delDia = horarios
    .filter((h) => normalizarDia(h.dia) === dia)
    .sort((x, y) => String(x.hora_inicio).localeCompare(String(y.hora_inicio)));
  if (!delDia.length) return <Text style={styles.horarioVacio}>No hay clases el {dia.toLowerCase()}.</Text>;
  return (
    <View style={styles.horarioLista}>
      {delDia.map((h, i) => (
        <View key={h.id} style={[styles.claseFila, i > 0 && styles.claseFilaBorde]}>
          <View style={styles.claseHoras}>
            <Text style={styles.claseIni}>{hhmm(h.hora_inicio)}</Text>
            <Text style={styles.claseFin}>{hhmm(h.hora_fin)}</Text>
          </View>
          <View style={[styles.claseRaya, { backgroundColor: h.color || SLATE[300] }]} />
          <View style={styles.flex1}>
            <Text style={styles.claseMateria}>{h.clases?.optativa ? "✦ " : ""}{h.materia}</Text>
            {h.docente ? <Text style={styles.claseDocente}>{h.docente}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// Una fila "pendiente" por alumno del curso (y cada apoderado) en un evento que
// pide confirmar asistencia. No toca las filas que ya existen: editar el evento
// no borra lo que las familias respondieron.
async function crearAsistenciaPendiente(eventoId, cursoId) {
  const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id", cursoId);
  const hijosIds = (hijos || []).map((h) => h.id);
  if (!hijosIds.length) return;
  const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("hijo_id", hijosIds);
  const rows = (uh || []).map((r) => ({ evento_id: eventoId, usuario_id: r.usuario_id, alumno_invitado_id: r.hijo_id, asiste: "pendiente" }));
  if (rows.length) await supabase.from("evento_asistencia").upsert(rows, { onConflict: "evento_id,alumno_invitado_id", ignoreDuplicates: true });
}

// Lo que se copia a los otros cursos de un evento multi-curso al editarlo.
const CAMPOS_GRUPO = ["titulo", "tipo", "fecha", "fecha_fin", "hora", "hora_fin", "todo_el_dia", "lugar", "url_ubicacion", "descripcion", "adjuntos", "confirma_asistencia"];

export function EventoModal({ evento, cursoId, userId, onClose, onSave }) {
  const esNuevo = !evento;
  const [form, setForm] = useState({
    titulo: evento?.titulo || "",
    tipo: evento?.tipo || "acto",
    fecha: evento?.fecha || "",
    fecha_fin: evento?.fecha_fin || "",
    hora: evento?.hora || "",
    hora_fin: evento?.hora_fin || "",
    lugar: evento?.lugar || "",
    url_ubicacion: evento?.url_ubicacion || "",
    descripcion: evento?.descripcion || "",
    // Un evento nuevo arranca CON hora (no "Todo el día") para que el admin
    // vea el campo de hora de entrada, en vez de tener que acordarse de
    // destildar el toggle (mismo fix que la web). Al editar se respeta el
    // valor guardado.
    todo_el_dia: esNuevo ? false : evento.todo_el_dia !== false,
    confirma_asistencia: evento?.confirma_asistencia ?? false,
    adjuntos: evento?.adjuntos || [],
  });
  const [saving, setSaving] = useState(false);
  const [subiendoAdj, setSubiendoAdj] = useState(false);

  const fechaFinInvalida = !!(form.fecha_fin && form.fecha && form.fecha_fin < form.fecha);
  const guardar = async () => {
    if (!form.titulo || !form.fecha || fechaFinInvalida) return;
    setSaving(true);
    // Al editar, el curso es el del evento (nunca el de sesión); al crear, el
    // cursoId de sesión (el modal solo se abre con isAdmin, nunca en vista Todos).
    const cursoEvento = evento?.curso_id ?? cursoId;
    // fecha_fin es columna `date`: "" no es válido, tiene que viajar null.
    const payload = { ...form, fecha_fin: form.fecha_fin || null, curso_id: cursoEvento };
    let eventoId = evento?.id;
    try {
      if (esNuevo) {
        const { data: ev } = await supabase.from("eventos").insert({ ...payload, creado_por: userId }).select().single();
        eventoId = ev?.id;
      } else {
        await supabase.from("eventos").update(payload).eq("id", evento.id); // sin creado_por: editar no cambia quién lo creó
      }
    } catch (e) {
      console.error("EventoModal.guardar (insert/update):", e);
      setSaving(false);
      return; // no se guardó — dejar el modal abierto para reintentar
    }
    // El evento ya existe en la base a partir de acá: push y asistencia son
    // best-effort, un error o una red lenta ahí no debe dejar el modal
    // trabado sin cerrarse (pasaba: el evento se creaba bien pero "Guardando…"
    // quedaba pegado para siempre si sendPush/getUserIdsByCurso fallaba).
    try {
      if (esNuevo) {
        const userIds = await getUserIdsByCurso(cursoEvento);
        await sendPush({ type: "evento", payload: { titulo: form.titulo, fecha: form.fecha || "", userIds } });
      }
      // Al editar no se pisan las respuestas que ya llegaron.
      if (form.confirma_asistencia && eventoId) await crearAsistenciaPendiente(eventoId, cursoEvento);
    } catch (e) {
      console.error("EventoModal.guardar (push/asistencia):", e);
    } finally {
      setSaving(false);
      onSave();
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>{esNuevo ? "Nuevo evento" : "Editar evento"}</Text>

            <Text style={styles.label}>TIPO</Text>
            <View style={styles.tipoWrap}>
              {Object.entries(TIPO_CONFIG)
                .filter(([k]) => k !== "cumple" && k !== "festejo")
                .map(([k, v]) => (
                  <Pressable
                    key={k}
                    onPress={() => setForm((p) => ({ ...p, tipo: k }))}
                    style={[styles.tipoChip, form.tipo === k && { borderColor: v.color, backgroundColor: v.bg }]}
                  >
                    <Text style={[styles.tipoTxt, form.tipo === k && { color: v.color }]}>
                      {v.emoji} {v.label}
                    </Text>
                  </Pressable>
                ))}
            </View>

            {[
              { l: "Título", k: "titulo", ph: "Ej: Acto del 25 de mayo" },
              { l: "Fecha", k: "fecha", ph: "Elegir fecha" },
              { l: "Fecha fin (opcional, si dura varios días)", k: "fecha_fin", ph: "Elegir fecha" },
              { l: "Lugar", k: "lugar", ph: "Ej: Patio del colegio" },
              { l: "URL ubicación", k: "url_ubicacion", ph: "https://maps.google.com/..." },
              { l: "Descripción", k: "descripcion", ph: "Detalles adicionales" },
            ].map((f) => (
              <View key={f.k}>
                <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                {f.k === "fecha" || f.k === "fecha_fin" ? (
                  <DateField
                    value={form[f.k]}
                    onChange={(v) => setForm((p) => ({ ...p, [f.k]: v }))}
                    placeholder={f.ph}
                    style={styles.input}
                  />
                ) : (
                  <TextInput
                    value={form[f.k]}
                    onChangeText={(t) => setForm((p) => ({ ...p, [f.k]: t }))}
                    placeholder={f.ph}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize={f.k === "url_ubicacion" ? "none" : "sentences"}
                    style={styles.input}
                  />
                )}
                {f.k === "fecha_fin" && fechaFinInvalida ? (
                  <Text style={styles.errorTxt}>La fecha fin no puede ser anterior a la fecha de inicio</Text>
                ) : null}
              </View>
            ))}

            <Text style={styles.label}>HORA</Text>
            <View style={styles.horaRow}>
              <Pressable
                onPress={() => setForm((p) => ({ ...p, todo_el_dia: !p.todo_el_dia, ...(p.todo_el_dia ? {} : { hora: "", hora_fin: "" }) }))}
                style={[styles.todoDiaBtn, form.todo_el_dia && styles.todoDiaOn]}
              >
                <Text style={[styles.todoDiaTxt, form.todo_el_dia && styles.todoDiaTxtOn]}>Todo el día</Text>
              </Pressable>
              {!form.todo_el_dia ? (
                <>
                  <TextInput
                    value={form.hora}
                    onChangeText={(t) => setForm((p) => ({ ...p, hora: t }))}
                    placeholder="09:00"
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, styles.horaInput]}
                  />
                  <Text style={styles.muted}>a</Text>
                  <TextInput
                    value={form.hora_fin}
                    onChangeText={(t) => setForm((p) => ({ ...p, hora_fin: t }))}
                    placeholder="11:00"
                    placeholderTextColor="#94A3B8"
                    style={[styles.input, styles.horaInput]}
                  />
                </>
              ) : null}
            </View>

            <Pressable
              onPress={() => setForm((p) => ({ ...p, confirma_asistencia: !p.confirma_asistencia }))}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, form.confirma_asistencia && styles.checkboxOn]}>
                {form.confirma_asistencia ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>Solicitar asistencia</Text>
            </Pressable>

            <Text style={styles.label}>ADJUNTOS (OPCIONAL)</Text>
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
              <Pressable onPress={guardar} disabled={saving || subiendoAdj || fechaFinInvalida} style={[styles.saveBtn, (subiendoAdj || fechaFinInvalida) && { opacity: 0.5 }]}>
                <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function EventoAsistenciaModal({ evento, tag = null, onClose, misHijos = [], userId = null }) {
  const [asistencia, setAsistencia] = useState({});
  const [hijosInfo, setHijosInfo] = useState({});
  const [todosHijos, setTodosHijos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: asist } = await supabase.from("evento_asistencia").select("*").eq("evento_id", evento.id);
    const mapa = {};
    (asist || []).forEach((r) => {
      if (r.alumno_invitado_id) mapa[r.alumno_invitado_id] = r.asiste || "pendiente";
    });
    setAsistencia(mapa);
    const { data: hijos } = await supabase
      .from("hijos")
      .select("id,nombre,apellido,color")
      .eq("curso_id", evento.curso_id);
    const hm = {};
    (hijos || []).forEach((h) => {
      hm[h.id] = h;
    });
    setHijosInfo(hm);
    setTodosHijos(hijos || []);
    setCargando(false);
  }, [evento.id, evento.curso_id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const responder = async (alumnoId, asiste) => {
    if (!userId) return;
    setAsistencia((prev) => ({ ...prev, [alumnoId]: asiste }));
    await supabase
      .from("evento_asistencia")
      .upsert(
        { evento_id: evento.id, usuario_id: userId, alumno_invitado_id: alumnoId, asiste },
        { onConflict: "evento_id,alumno_invitado_id" }
      );
  };

  const misHijosEnCurso = misHijos.filter((hid) => hijosInfo[hid]);
  const confirmados = todosHijos.filter((h) => asistencia[h.id] === "si");
  const noVan = todosHijos.filter((h) => asistencia[h.id] === "no");
  const talVez = todosHijos.filter((h) => asistencia[h.id] === "tal_vez");
  const pendientes = todosHijos.filter((h) => !asistencia[h.id] || asistencia[h.id] === "pendiente");
  const grupos = [
    { list: confirmados, label: "Confirman", color: "#10B981", bg: "#F0FDF4" },
    { list: talVez, label: "Tal vez", color: "#F59E0B", bg: "#FFFBEB" },
    { list: pendientes, label: "Pendiente", color: "#94A3B8", bg: "#F8FAFC" },
    { list: noVan, label: "No van", color: "#EF4444", bg: "#FEF2F2" },
  ];
  const inicialAvatar = (h) => `${(h.nombre||"?")[0]}${(h.apellido||"")[0]||""}`.toUpperCase();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.pagosHeader}>
            <View style={styles.flex1}>
              <Text style={styles.modalTitle}>{evento.titulo}</Text>
              <TagHijo tag={tag} />
              <Text style={styles.eventoMeta}>{fmtRangoFecha(evento.fecha, evento.fecha_fin)}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          {cargando ? (
            <Text style={styles.muted}>Cargando...</Text>
          ) : (
            <ScrollView>
              {misHijosEnCurso.length > 0 ? (
                <View style={styles.asistSection}>
                  <Text style={styles.label}>TU ASISTENCIA</Text>
                  {misHijosEnCurso.map((hid) => {
                    const al = hijosInfo[hid];
                    const est = asistencia[hid] || "pendiente";
                    return (
                      <View key={hid} style={styles.miHijoCard}>
                        {misHijosEnCurso.length > 1 ? (
                          <Text style={styles.miHijoNombre}>
                            {al?.nombre} {al?.apellido}
                          </Text>
                        ) : null}
                        <View style={styles.vozRow}>
                          <Pressable
                            onPress={() => responder(hid, "si")}
                            style={[styles.vozBtn, est === "si" && styles.vozSi]}
                          >
                            <Text style={[styles.vozTxt, est === "si" && { color: "#10B981" }]}>Voy</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => responder(hid, "tal_vez")}
                            style={[styles.vozBtn, est === "tal_vez" && styles.vozTalVez]}
                          >
                            <Text style={[styles.vozTxt, est === "tal_vez" && { color: "#F59E0B" }]}>Tal vez</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => responder(hid, "no")}
                            style={[styles.vozBtn, est === "no" && styles.vozNo]}
                          >
                            <Text style={[styles.vozTxt, est === "no" && { color: "#EF4444" }]}>No voy</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {todosHijos.length > 0 ? (
                <View>
                  <Text style={styles.label}>
                    RESUMEN · {confirmados.length} van · {talVez.length} tal vez · {noVan.length} no · {pendientes.length} pend.
                  </Text>
                  {grupos.map(({ list, label, color, bg }) =>
                    list.length > 0 ? (
                      <View key={label} style={styles.grupoResumen}>
                        <Text style={[styles.grupoLabel, { color }]}>
                          {label} ({list.length})
                        </Text>
                        {list.map((h) => (
                          <View key={h.id} style={[styles.resumenRow, { backgroundColor: bg }]}>
                            <View style={[styles.avatarChip, { backgroundColor: h.color || color }]}>
                              <Text style={styles.avatarChipTxt}>{inicialAvatar(h)}</Text>
                            </View>
                            <Text style={styles.resumenNombre}>
                              {h.nombre} {h.apellido}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null
                  )}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// Estilos A3: sin sombras, borde hairline, grilla del mes sin bordes por día
// (hoy = anillo accent, seleccionado = relleno accent).
const styles = StyleSheet.create({
  filaFiltros: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md },
  filaFiltrosTxt: { flex: 1, fontSize: 14, fontWeight: "600", color: t.textMuted },

  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  muted: { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: SPACE.lg },
  vistasRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.md },
  vistas: { flex: 1, flexDirection: "row", gap: 18 },
  vista: { minHeight: 40, justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  vistaOn: { borderBottomColor: t.textStrong },
  vistaTxt: { fontSize: 14, fontWeight: "600", color: t.textMuted },
  vistaTxtOn: { color: t.textStrong, fontWeight: "800" },
  calCard: { padding: 14, marginBottom: SPACE.md },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.md },
  monthLabel: { fontSize: 15, fontWeight: "800", color: t.textStrong },
  navBtn: { width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  calGrid: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  calDow: { textAlign: "center", fontSize: 10, fontWeight: "700", color: t.textFaint, paddingVertical: 4, textTransform: "uppercase", letterSpacing: 0.6 },
  calDayBox: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm },
  calDayHoy: { backgroundColor: t.accentSoft, borderWidth: 1.5, borderColor: t.accent },
  calDaySelec: { backgroundColor: t.accent },
  calDayTxt: { fontSize: 12, fontWeight: "600", color: t.text, fontVariant: ["tabular-nums"] },
  calDayTxtHoy: { color: BLUE[600], fontWeight: "800" },
  calDayTxtOn: { color: t.onAccent, fontWeight: "800" },
  dots: { flexDirection: "row", gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: RADIUS.full },
  diaCard: { padding: 14 },
  diaHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.md },
  diaTitle: { fontSize: 14.5, fontWeight: "800", color: t.textStrong },
  miniAdd: { backgroundColor: t.accent, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 12, minHeight: 36, justifyContent: "center" },
  miniAddTxt: { color: t.onAccent, fontSize: 12, fontWeight: "700" },
  diaRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: t.border },
  iconBox: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center" },
  iconTxt: { fontSize: 18 },
  eventoTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  eventoMeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  eventoDocente: { fontSize: 12, fontWeight: "600", color: t.textMuted, marginTop: 2 },
  eventoDesc: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  fotoFestejo: { width: 64, height: 64, borderRadius: 8, marginTop: 6 },
  lugarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mapLink: { fontSize: 11, fontWeight: "700", color: BLUE[600] },
  asistBtn: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 10, minHeight: 32, justifyContent: "center", backgroundColor: t.surface },
  asistTxt: { fontSize: 11, fontWeight: "600", color: t.textMuted },
  editRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  miniBtn: { padding: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  miniTxt: { fontSize: 12, color: t.text },
  listCard: { padding: 13, marginBottom: 10 },
  fechaCol: { width: 36, alignItems: "center", paddingTop: 1 },
  fechaDow: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: t.textMuted },
  fechaNum: { fontSize: 20, fontWeight: "800", color: t.textStrong, fontVariant: ["tabular-nums"] },
  linkBtn: { minHeight: 28, justifyContent: "center" },
  linkTxt: { fontSize: 13, fontWeight: "700", color: BLUE[600] },
  listRow: { flexDirection: "row", gap: SPACE.md, alignItems: "flex-start" },
  listRight: { alignItems: "flex-end", gap: 6 },
  diasTag: { backgroundColor: SLATE[100], borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 9 },
  diasTagTxt: { fontSize: 11, fontWeight: "800", color: t.textMuted, fontVariant: ["tabular-nums"] },
  tagHijoRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  tagHijoDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  tagHijoTxt: { fontSize: 11, fontWeight: "700", color: t.textMuted, flexShrink: 1 },
  horarioSeccion: { marginBottom: SPACE.lg },
  diasTabs: { flexDirection: "row", gap: 6, marginBottom: SPACE.md },
  diaTab: { flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 6, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  diaTabOn: { backgroundColor: BLUE[50], borderColor: BLUE[600] },
  diaTabTxt: { fontSize: 13, fontWeight: "700", color: SLATE[600] },
  diaTabTxtOn: { color: BLUE[700], fontWeight: "800" },
  diaHoyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: SLATE[400], marginTop: 4 },
  diaHoyDotOn: { backgroundColor: BLUE[600] },
  diaHoyDotVacio: { width: 5, height: 5, marginTop: 4 },
  horarioLista: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: 16, paddingHorizontal: 14 },
  horarioVacio: { fontSize: 13, color: t.textMuted, paddingVertical: SPACE.md },
  claseFila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  claseFilaBorde: { borderTopWidth: 1, borderTopColor: t.border },
  claseHoras: { width: 46 },
  claseIni: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  claseFin: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  claseRaya: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  claseMateria: { fontSize: 15, fontWeight: "700", color: t.textStrong },
  claseDocente: { fontSize: 13, color: t.textMuted, marginTop: 1 },
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 440, maxHeight: "88%", backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xl },
  confirmCard: { width: "100%", maxWidth: 340, backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginBottom: 8 },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 5, marginTop: 8 },
  errorTxt: { fontSize: 11, color: t.danger, marginTop: 4 },
  input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, paddingHorizontal: SPACE.md, fontSize: 13, color: t.text },
  tipoWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tipoChip: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: t.surface },
  tipoTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  horaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  todoDiaBtn: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: t.surface },
  todoDiaOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  todoDiaTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  todoDiaTxtOn: { color: BLUE[600] },
  horaInput: { flex: 1, minWidth: 60 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  checkbox: { width: 22, height: 22, borderRadius: RADIUS.xs, borderWidth: 2, borderColor: SLATE[300], alignItems: "center", justifyContent: "center" },
  checkboxOn: { borderColor: t.accent, backgroundColor: t.accent },
  checkMark: { color: t.onAccent, fontSize: 12, fontWeight: "900" },
  checkboxLabel: { fontSize: 13, fontWeight: "600", color: t.text },
  modalBtns: { flexDirection: "row", gap: 8, marginTop: SPACE.lg },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textFaint, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  deleteBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  pagosHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: SPACE.md },
  closeTxt: { fontSize: 18, color: t.textFaint },
  asistSection: { marginBottom: SPACE.lg },
  miHijoCard: { backgroundColor: t.surfaceSunken, borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm, borderWidth: 1.5, borderColor: t.borderStrong },
  miHijoNombre: { fontSize: 12, fontWeight: "700", color: t.textMuted, marginBottom: 8 },
  vozRow: { flexDirection: "row", gap: 8 },
  vozBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  vozSi: { borderColor: t.success, backgroundColor: t.successSoft },
  vozTalVez: { borderColor: "#F59E0B", backgroundColor: "#FFFBEB" },
  vozNo: { borderColor: t.danger, backgroundColor: t.dangerSoft },
  vozTxt: { fontSize: 13, fontWeight: "700", color: t.textFaint },
  avatarChip: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  avatarChipTxt: { fontSize: 9.5, fontWeight: "800", color: "#FFFFFF" },
  grupoResumen: { marginBottom: 10 },
  grupoLabel: { fontSize: 11, fontWeight: "700", marginBottom: 5 },
  resumenRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: RADIUS.md, marginBottom: 4 },
  resumenNombre: { fontSize: 13, fontWeight: "600", color: t.text },
});

/**
 * Módulo "📅 Eventos" del panel del colegio (puerto de EventosColegio web):
 * los eventos de los cursos del año con quién los creó. Mismos permisos que la
 * RLS (puede_editar_evento): super edita/borra cualquiera; el colegio, solo lo
 * que creó el colegio. Festejos solo se borran (se editan en Cumpleaños).
 * Crear un evento notifica al curso, igual que en el Calendario.
 */
// usuarios: los que el panel ya tiene cargados; solo se piden los autores que falten.
export function EventosColegio({ cursos = [], userId, esSuper = false, usuarios = [] }) {
  const [eventos, setEventos] = useState(null);
  const [autores, setAutores] = useState({});
  const [cursoSel, setCursoSel] = useState("");
  const [periodo, setPeriodo] = useState("proximos");
  const [busqueda, setBusqueda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [editando, setEditando] = useState(null); // evento | "nuevo"

  const ids = cursos.map((c) => c.id).join(",");
  const cargar = useCallback(async () => {
    const cursoIds = ids ? ids.split(",") : [];
    if (!cursoIds.length) { setEventos([]); return; }
    // Los festejos son entre familias: ni se piden.
    const { data, error } = await supabase.from("eventos").select("*").in("curso_id", cursoIds).neq("tipo", "festejo").order("fecha");
    if (error) { Alert.alert("No se pudieron cargar los eventos", error.message); return; }
    const lista = data || [];
    const conocidos = Object.fromEntries(usuarios.map((u) => [u.id, u]));
    const faltan = [...new Set(lista.map((e) => e.creado_por).filter((id) => id && !conocidos[id]))];
    const { data: us } = faltan.length ? await supabase.from("usuarios").select("id,nombre,apellido,rol").in("id", faltan) : { data: [] };
    setAutores({ ...conocidos, ...Object.fromEntries((us || []).map((u) => [u.id, u])) });
    setEventos(lista);
  }, [ids, usuarios]);
  useEffect(() => { cargar(); }, [cargar]);

  const nombreCurso = (id) => cursos.find((c) => c.id === id)?.nombre || "—";
  const autor = (id) => {
    const u = autores[id];
    if (!u) return "—";
    const n = fmtNombre(u);
    return u.rol === "super" || u.rol === "colegio_admin" ? `${n} (colegio)` : n;
  };
  const puede = (e) => esSuper || ["super", "colegio_admin"].includes(autores[e.creado_por]?.rol);

  const hoy = fmtLocalDate(new Date());
  const q = busqueda.trim().toLowerCase();
  // Los festejos son entre familias: el colegio no los ve.
  const lista = (eventos || [])
    .filter((e) => e.tipo !== "festejo")
    .filter((e) => !cursoSel || e.curso_id === cursoSel)
    .filter((e) => (periodo === "proximos" ? (e.fecha_fin || e.fecha) >= hoy : (e.fecha_fin || e.fecha) < hoy))
    .filter((e) => !q || `${e.titulo} ${e.descripcion || ""} ${e.lugar || ""}`.toLowerCase().includes(q));
  if (periodo === "pasados") lista.reverse();
  // Un evento cargado para varios cursos va en una sola fila
  // con "N cursos"; editar o eliminar aplica a todos.
  const items = [];
  const porGrupo = new Map();
  for (const e of lista) {
    // También los cargados curso por curso: mismo título, fecha, hora, tipo y autor.
    const clave = e.grupo_id || [e.titulo, e.fecha, e.fecha_fin, e.hora, e.tipo, e.creado_por].join("|");
    const g = porGrupo.get(clave);
    if (g) { g.filas.push(e); continue; }
    const it = { ...e, filas: [e] };
    porGrupo.set(clave, it);
    items.push(it);
  }
  const cursosDe = (it) => (it.filas?.length > 1 ? `${it.filas.length} cursos` : nombreCurso(it.curso_id));

  // EventoModal guarda la fila abierta; acá se copian los datos al resto del grupo.
  const propagarGrupo = async (it) => {
    const otros = (it.filas || []).filter((f) => f.id !== it.id);
    if (!otros.length) return;
    const { data: a } = await supabase.from("eventos").select("*").eq("id", it.id).single();
    if (!a) return;
    const cambios = Object.fromEntries(CAMPOS_GRUPO.map((k) => [k, a[k]]));
    const { error } = await supabase.from("eventos").update(cambios).in("id", otros.map((o) => o.id));
    if (error) { Alert.alert("Se guardó en un curso, pero no en los demás", error.message); return; }
    if (a.confirma_asistencia) for (const o of otros) await crearAsistenciaPendiente(o.id, o.curso_id);
  };

  const borrar = (e) =>
    Alert.alert(
      "¿Eliminar este evento?",
      `"${e.titulo}" · ${cursosDe(e)} · ${fmtRangoFecha(e.fecha, e.fecha_fin)}\n\nDesaparece del calendario de las familias ${e.filas?.length > 1 ? `de los ${e.filas.length} cursos` : "del curso"}${e.confirma_asistencia || e.tipo === "festejo" ? " y se borran sus confirmaciones de asistencia" : ""}.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.from("eventos").delete().in("id", (e.filas || [e]).map((f) => f.id));
            if (error) { Alert.alert("No se pudo eliminar", error.message); return; }
            borrarArchivos(e.adjuntos, "adjuntos");
            if (e.imagen_url) borrarArchivos([e.imagen_url], "eventos");
            cargar();
          },
        },
      ]
    );

  const gruposFiltro = [
    { key: "periodo", label: "Cuándo", value: periodo, onChange: setPeriodo, options: [{ value: "proximos", label: "Próximos" }, { value: "pasados", label: "Pasados" }] },
    { key: "curso", label: "Curso (para crear un evento, elegí uno)", value: cursoSel, onChange: setCursoSel, options: [{ value: "", label: "Todos" }, ...cursos.map((c) => ({ value: c.id, label: c.nombre }))] },
  ];

  const nuevo = () => {
    // Un evento es de un curso: se elige en Filtros → Curso (en la web también se puede para varios a la vez).
    if (!cursoSel) { setFiltrosAbiertos(true); return; }
    setEditando("nuevo");
  };

  return (
    <View>
      {editando ? (
        <EventoModal
          evento={editando === "nuevo" ? null : editando}
          cursoId={editando === "nuevo" ? cursoSel : editando.curso_id}
          userId={userId}
          onClose={() => setEditando(null)}
          onSave={async () => { const it = editando; setEditando(null); if (it !== "nuevo") await propagarGrupo(it); cargar(); }}
        />
      ) : null}

      <View style={ec.fila}>
        <Buscador value={busqueda} onChange={setBusqueda} placeholder="Buscar evento…" style={ec.buscador} />
        <BotonFiltros activos={filtrosActivos(gruposFiltro)} onPress={() => setFiltrosAbiertos(true)} />
        <BotonNuevo accessibilityLabel="Nuevo evento" onPress={nuevo} />
      </View>
      <FiltrosSheet visible={filtrosAbiertos} onClose={() => setFiltrosAbiertos(false)} grupos={gruposFiltro} />

      {eventos === null ? (
        <Text style={ec.vacio}>Cargando…</Text>
      ) : items.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title={`${periodo === "proximos" ? "No hay eventos próximos" : "No hay eventos pasados"}${cursoSel ? " en este curso" : ""}`} />
      ) : (
        <Card style={ec.card}>
          {items.map((e, i) => {
            const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
            return (
              <View key={e.id} style={[ec.row, i > 0 && ec.rowBorde]}>
                <View style={styles.flex1}>
                  <Text style={ec.titulo}>{e.titulo}</Text>
                  <Text style={ec.meta}>
                    {[fmtRangoFecha(e.fecha, e.fecha_fin), e.hora && e.todo_el_dia === false ? e.hora.slice(0, 5) : null, cursosDe(e), cfg.label].filter(Boolean).join(" · ")}
                  </Text>
                  {e.filas.length > 1 ? <Text style={ec.autor} numberOfLines={1}>{e.filas.map((f) => nombreCurso(f.curso_id)).join(", ")}</Text> : null}
                  <Text style={ec.autor}>Creado por {autor(e.creado_por)}</Text>
                </View>
                {puede(e) ? (
                  <View style={ec.acciones}>
                    {e.tipo !== "festejo" ? (
                      <Pressable onPress={() => setEditando(e)} hitSlop={6} style={ec.accion} accessibilityLabel="Editar evento">
                        <MaterialCommunityIcons name="pencil-outline" size={17} color={t.textMuted} />
                      </Pressable>
                    ) : null}
                    <Pressable onPress={() => borrar(e)} hitSlop={6} style={[ec.accion, ec.accionDanger]} accessibilityLabel="Eliminar evento">
                      <MaterialCommunityIcons name="trash-can-outline" size={17} color={t.danger} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

const ec = StyleSheet.create({
  chips: { gap: SPACE.sm, paddingBottom: SPACE.sm },
  buscador: { flex: 1, marginBottom: 0 },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.sm },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  chipOn: { borderColor: BLUE[500], backgroundColor: BLUE[50] },
  chipTxt: { fontSize: 12.5, fontWeight: "700", color: t.textMuted },
  chipTxtOn: { color: BLUE[700] },
  btnNuevo: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.md, backgroundColor: t.accent },
  btnNuevoOff: { opacity: 0.5 },
  btnNuevoTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  buscar: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: t.text, backgroundColor: t.surface, marginBottom: SPACE.md },
  vacio: { textAlign: "center", color: t.textFaint, fontSize: 13, paddingVertical: SPACE.xl },
  card: { padding: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 12 },
  rowBorde: { borderTopWidth: 1, borderTopColor: t.border },
  icono: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  iconoTxt: { fontSize: 17 },
  titulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  meta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  autor: { fontSize: 11.5, color: t.textFaint, marginTop: 1 },
  acciones: { flexDirection: "row", gap: 6 },
  accion: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: t.surface },
  accionDanger: { borderColor: "#FEE2E2", backgroundColor: "#FEF2F2" },
});
