// Muro / Inicio — patrón A3 del sistema de diseño (ver mobile/DESIGN_SYSTEM.md
// y mobile/design-alternatives.html §A3). Tres bloques, en orden de urgencia:
//   1. Pendientes: lista vertical de cards accionables (recordatorios sin leer,
//      colectas sin pagar, invitaciones sin responder, encuestas sin votar),
//      cada una con ícono + acción primaria de 44px + "Ver" + chip de la
//      derecha (urgencia/monto/fecha), y empty state punteado ("Estás al día").
//      Si la carga falla, se muestra un card de error con "Reintentar" en vez
//      de dejar el skeleton para siempre (o, si ya había datos, un banner
//      arriba sin perder lo último cargado).
//      En la vista "Todos" del header, todo el muro (pendientes, agenda, alertas)
//      abarca los cursos de todos los hijos, con tag de hijo por fila/card.
//   2. Próximos 15 días: agenda unificada (eventos + cumpleaños por proximidad)
//      con countdown por urgencia (<3 días lleno · ≤7 teñido · resto neutro, nivelUrgencia en @shared/muro).
//   3. Comedor: menú de hoy o el próximo día con servicio.
// El admin conserva la alerta del curso (banner + publicar). Deep-links:
// colecta → Finanzas (openColecta), evento → Calendario (openFecha), resto → tab.

import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  TextInput,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useRecarga } from "../../lib/useRecarga";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsParaAlerta } from "../../lib/push";
import { fmtNombre, fmtRangoHora, fmtLocalDate } from "@shared/helpers";
import { autorizacionesPendientes } from "@shared/autorizaciones";
import { talleresParaAnotarse, claveTalleresVistos, leerTalleresVistos, marcarTallerVisto } from "@shared/talleres";
import { filtroAlcance, encontradosDeLaSemana, cargarReclamados, claveEncontradosVistos } from "@shared/perdidos";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { proximoCumple, recordatoriosPendientes, colectasActivas, colectasPendientes, colectasPorCerrar, diasVencida, festejosPendientes, festejosRechazados, encuestasAbiertas, alertasUnaPorCurso, textoRespuestasPendientes, ordenarPorVencimiento, avisoVencimiento, fechaCorta, filasMenu, DIAS_PROXIMOS } from "@shared/muro";
import { menusParaNivel, nivelDeVista } from "@shared/niveles";
import { SELECT_REC_CON_LEIDO, separarLeidos, conLeidoDe } from "@shared/leidos";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { useNotificacionesCtx } from "../notificaciones";
import { SkeletonList } from "../../components/Skeleton";
import { SelectorHijos } from "../../components/SelectorHijos";
import { TablaMenu } from "../../components/TablaMenu";
import { textoPlano } from "@shared/formato";
import { useAutoresDocentes } from "../../lib/useAutoresDocentes";
import { etiquetaDocente } from "@shared/docentes";

const t = THEMES.light;

const TIPO_CONFIG = {
  cumple: { emoji: "🎂" },
  festejo: { emoji: "🎉" },
  paseo: { emoji: "🚌" },
  acto: { emoji: "🎭" },
  dia_especial: { emoji: "⭐" },
  comunicado: { emoji: "📢" },
  feriado: { emoji: "🚩" },
  vacaciones: { emoji: "🏖️" },
};

const diasHasta = (fechaStr) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(fechaStr + "T00:00:00") - hoy) / 86400000);
};

export function Muro() {
  const router = useRouter();
  const { cursoId, cursoIds, cursoNombre, isAdmin, usuario, misHijos, items, tagDeCurso } = useSession();
  const userId = usuario?.id ?? null;
  // Refresca el badge de la tab de Avisos + el punto de la campana (hook
  // levantado en (tabs)/_layout.jsx) cuando desde acá se marca un aviso leído
  // o se cambia una alerta — igual que hace la pantalla de Avisos.
  const recargarBadge = useNotificacionesCtx()?.recargar;
  const userName = usuario?.nombre?.split(" ")[0] || "";

  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [alertaModal, setAlertaModal] = useState(false);

  const hoyLabel = (() => {
    const txt = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  })();

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    try {
    const fechaHoy = fmtLocalDate();
    const fecha15 = fmtLocalDate(new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));
    const misHijosIds = (misHijos || []).filter((h) => h && typeof h === "string");
    // Todas las lecturas por curso van por cursoIds: en vista "Todos" abarca
    // todos los cursos con hijos; en vista por hijo es solo el curso activo.
    const cursosScope = cursoIds;
    // Dos lotes en paralelo (antes eran ~7 consultas en fila después del
    // primero, cada una un viaje a us-east-1). Lote 1: lo que solo depende de
    // los cursos/usuario. Lote 2: lo que necesita ids del lote 1.
    // colegio_id por curso sale de la sesión (items), sin ir a "cursos".
    const colegios = [...new Set(cursosScope.map((cid) => (items || []).find((i) => i.curso_id === cid)?.cursos?.colegio_id).filter(Boolean))];

    const [
      alerta,
      menu,
      menuProx,
      recordatorios,
      cuotas,
      hijosData,
      maestrosData,
      eventosData,
      invitacionesData,
      encuestasData,
      objsData,
      autsData,
      talleresData,
      tallerInscData,
    ] = await Promise.all([
      supabase.from("alertas").select("*").in("curso_id", cursosScope).eq("activa", true).order("creado_en", { ascending: false }).limit(3),
      // Puede haber un menú general y otros por nivel (roles-por-nivel): se elige abajo.
      supabase.from("menu").select("*").eq("fecha", fechaHoy),
      supabase.from("menu").select("*").gt("fecha", fechaHoy).order("fecha").limit(8),
      // Solo los que pueden ser "pendientes" (recordatoriosPendientes): sin
      // fecha o de hoy en adelante, para todos o para mí — no el
      // historial completo del año.
      // "¿Lo leí?" embebido (@shared/leidos): sin pedir aparte todos mis leídos.
      conLeidoDe(supabase.from("recordatorios").select(SELECT_REC_CON_LEIDO), userId)
        .in("curso_id", cursosScope)
        .or(`para_usuario_id.is.null${userId ? `,para_usuario_id.eq.${userId}` : ""}`)
        .or(`fecha.is.null,fecha.gte.${fechaHoy}`)
        .order("creado_en", { ascending: false }),
      supabase.from("colectas").select("*").in("curso_id", cursosScope),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id", cursosScope),
      supabase.from("maestros").select("id,nombre,apellido,fecha_nacimiento, maestro_cursos!inner(curso_id)").in("maestro_cursos.curso_id", cursosScope),
      supabase.from("eventos").select("*").in("curso_id", cursosScope).gte("fecha", fechaHoy).lte("fecha", fecha15).order("fecha"),
      userId && misHijosIds.length
        ? supabase
            .from("evento_asistencia")
            .select("id, asiste, alumno_invitado_id, evento:evento_id(id,titulo,fecha,hora,lugar,tipo,curso_id)")
            .in("alumno_invitado_id", misHijosIds)
            .in("asiste", ["pendiente", "no"])
        : Promise.resolve({ data: [] }),
      supabase.from("encuestas").select("*").in("curso_id", cursosScope),
      // Perdidos y encontrados: objetos encontrados esta semana en mis cursos / colegio.
      supabase
        .from("objetos_perdidos")
        .select("id,tipo,estado,vence_en,creado_en,publicado_por")
        .or(filtroAlcance(cursosScope, colegios))
        .eq("tipo", "encontrado")
        .eq("estado", "abierto")
        .gte("creado_en", new Date(Date.now() - 7 * 86400000).toISOString()),
      misHijosIds.length
        ? supabase.from("autorizaciones").select("id,titulo,descripcion,curso_id,fecha_limite,fecha_evento").in("curso_id", cursosScope)
        : Promise.resolve({ data: [] }),
      // Talleres con inscripción abierta (RLS: los que ve la familia) y en qué
      // ya están anotados mis hijos → tarjeta "Inscripción abierta".
      misHijosIds.length
        ? supabase.from("talleres").select("id,nombre,estado,elegibilidad,edad_min,edad_max,inscripcion_desde,inscripcion_hasta,fecha_inicio,taller_cursos(curso_id)").eq("estado", "publicado")
        : Promise.resolve({ data: [] }),
      misHijosIds.length ? supabase.from("taller_inscripciones").select("taller_id,hijo_id,estado").in("hijo_id", misHijosIds) : Promise.resolve({ data: [] }),
    ]);

    const objs = objsData.data || [];
    const auts = autsData.data || [];
    const encuestasActivas = encuestasAbiertas(encuestasData.data || [], fechaHoy);
    const activas = colectasActivas(cuotas.data || [], fecha15);
    const [reclamados, respData, votosData, pagosData, vistosHasta, talleresVistosTxt] = await Promise.all([
      cargarReclamados(supabase, objs.map((o) => o.id)),
      auts.length
        ? supabase.from("autorizacion_respuestas").select("autorizacion_id,hijo_id").in("autorizacion_id", auts.map((a) => a.id)).in("hijo_id", misHijosIds)
        : Promise.resolve({ data: [] }),
      userId && encuestasActivas.length
        ? supabase.from("encuesta_votos").select("encuesta_id").eq("usuario_id", userId).in("encuesta_id", encuestasActivas.map((e) => e.id))
        : Promise.resolve({ data: [] }),
      misHijosIds.length && activas.length
        ? supabase.from("colecta_pagos").select("*").in("colecta_id", activas.map((c) => c.id)).in("alumno_id", misHijosIds)
        : Promise.resolve({ data: [] }),
      // "No es de mi hijo" (local, sin viaje al servidor).
      AsyncStorage.getItem(claveEncontradosVistos(userId)).catch(() => null),
      // Talleres ya mirados desde Novedades (local).
      AsyncStorage.getItem(claveTalleresVistos(userId)).catch(() => null),
    ]);

    const bdayList = [
      ...(hijosData.data || []).filter((a) => a.fecha_nacimiento).map((a) => ({
        id: `a-${a.id}`,
        esMio: misHijosIds.includes(a.id),
        nombre: fmtNombre(a),
        tipo: "Alumno",
        curso_id: a.curso_id,
        ...proximoCumple(a.fecha_nacimiento),
      })),
      ...(maestrosData.data || []).filter((m) => m.fecha_nacimiento).map((m) => ({
        id: `m-${m.id}`,
        esMio: false,
        nombre: fmtNombre(m),
        tipo: "Maestro",
        curso_id: m.maestro_cursos?.[0]?.curso_id ?? null,
        ...proximoCumple(m.fecha_nacimiento),
      })),
    ]
      .filter((a) => a.dias <= 15)
      .sort((a, b) => a.dias - b.dias);

    const { recs: recsVigentes, leidos: leidosIds } = separarLeidos(recordatorios.data);

    const recsNoLeidos = recordatoriosPendientes(recsVigentes, leidosIds, userId, fechaHoy);

    // Mis hijos agrupados por curso: cada colecta se evalúa contra los hijos de
    // SU curso (en modo unificado hay colectas de varios cursos en cuotas).
    const misHijosPorCurso = new Map();
    for (const it of items || []) {
      if (it._tipo !== "hijo" || !it.curso_id) continue;
      const arr = misHijosPorCurso.get(it.curso_id) || [];
      arr.push(it.id);
      misHijosPorCurso.set(it.curso_id, arr);
    }
    // Colectas que gestiono y llevan 15+ días vencidas → "¿la cerrás?"
    const cursosAdmin = (items || []).filter((i) => i.rolEfectivo === "room").map((i) => i.curso_id);
    const porCerrar = colectasPorCerrar(cuotas.data || [], userId, cursosAdmin, fmtLocalDate());
    const colectasPend =
      misHijosIds.length && activas.length ? colectasPendientes(activas, pagosData.data || [], misHijosPorCurso) : [];

    // Invitaciones a festejos futuros sin responder (una card por festejo).
    const invitaciones = festejosPendientes((invitacionesData.data || []).filter((i) => i.asiste === "pendiente"), fechaHoy);
    // Festejos en "Próximos días" (la RLS ya trae solo los que me tocan), menos
    // los que rechazamos.
    const rechazados = festejosRechazados(invitacionesData.data || []);

    // Encuestas abiertas (ni cerradas ni eliminadas) donde el usuario todavía no votó.
    const votadas = new Set((votosData.data || []).map((v) => v.encuesta_id));
    const encuestasPend = userId ? encuestasActivas.filter((e) => !votadas.has(e.id)) : [];

    // Perdidos y encontrados: cuántos objetos aparecieron esta semana en mis cursos / colegio.
    const encontradosSemana = encontradosDeLaSemana(objs, userId, { reclamados, vistosHasta });

    // Autorizaciones abiertas con algún hijo mío sin responder.
    const misHijosObj = (hijosData.data || []).filter((h) => misHijosIds.includes(h.id));
    const autorizacionesPend = auts.length ? autorizacionesPendientes(auts, misHijosObj, respData.data || [], fechaHoy) : [];
    const talleresAbiertos = talleresParaAnotarse(talleresData.data || [], misHijosObj, {
      cursosPorTaller: Object.fromEntries((talleresData.data || []).map((x) => [x.id, (x.taller_cursos || []).map((c) => c.curso_id)])),
      inscripciones: tallerInscData.data || [],
    });

    setDatos({
      alertas: alertasUnaPorCurso(alerta.data || []),
      menu: menusParaNivel(menu.data, nivelDeVista(items, cursosScope))[0] || null,
      menuProx: menusParaNivel(menuProx.data, nivelDeVista(items, cursosScope))[0] || null,
      recordatorios: recsNoLeidos,
      bdayList,
      colectasPend,
      porCerrar,
      invitaciones,
      encuestasPend,
      autorizacionesPend,
      talleresAbiertos,
      talleresVistos: talleresVistosTxt,
      encontradosSemana,
      eventos: (eventosData.data || []).filter((e) => e.tipo !== "cumple" && !(e.tipo === "festejo" && rechazados.has(e.id))),
    });
    setError(false);
    } catch (e) {
      console.warn("No se pudo actualizar el muro:", e?.message);
      setError(true);
    }
  }, [cursoIds, userId, misHijos, items]);

  useEffect(() => {
    setDatos(null);
    setError(false);
    cargar();
  }, [cargar]);
  useRecarga(cargar); // al volver al Inicio, sin pasar por el esqueleto de carga

  const onRefresh = async () => {
    setRefreshing(true);
    await cargar();
    setRefreshing(false);
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({ activa: false }).eq("curso_id", cursoId);
    await supabase.from("alertas").insert({ curso_id: cursoId, mensaje: msg, hora: "Ahora", activa: true });
    const userIds = await getUserIdsParaAlerta(cursoId);
    await sendPush({ type: "alerta", payload: { mensaje: msg, userIds } });
    setAlertaModal(false);
    cargar();
    recargarBadge?.();
  };

  const dismissAlerta = async (alertaId) => {
    if (!alertaId) return;
    await supabase.from("alertas").update({ activa: false }).eq("id", alertaId);
    cargar();
    recargarBadge?.();
  };

  // Avisos de docentes: "Laura · Inglés" como origen en Novedades (igual que la web).
  const docenteDe = useAutoresDocentes((datos?.recordatorios || []).map((r) => r.creado_por));

  // Cargando: el saludo es inmediato (dato local) y la lista llega como skeleton.
  // Si la primera carga falla, mostramos el error en vez de un skeleton eterno.
  if (!datos)
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.fecha}>{hoyLabel}</Text>
        <Text style={styles.hello}>
          Hola
          {userName ? `, ${userName}` : ""}
        </Text>
        <SelectorHijos style={{ marginTop: SPACE.md }} />
        {error ? (
          <ErrorMuro onReintentar={cargar} tieneDatos={false} />
        ) : (
          <>
            <View style={{ height: SPACE.xl }} />
            <SkeletonList rows={3} />
          </>
        )}
      </View>
    );

  const fechaHoy = fmtLocalDate();
  const hora = (h) => (h ? `${String(h).slice(0, 5)} hs` : null);
  const montoTxt = (c) =>
    c.monto_sugerido ? `Aporte ${(c.moneda || "$") === "$" ? "$" : `${c.moneda} `}${Number(c.monto_sugerido).toLocaleString("es-AR")}` : null;
  const unir = (...partes) => partes.filter(Boolean).join(" · ");
  const irColecta = (c) => router.push({ pathname: "/(tabs)/finanzas", params: { openColecta: String(c.id) } });

  // ── Respuestas pendientes (prototipo "Hoy"): solo lo que pide una acción de
  // la familia — los avisos sin leer van aparte, en Comunicaciones. Ordenadas
  // por vencimiento (@shared/muro); la primera va destacada con botón azul.
  const pendientes = ordenarPorVencimiento([
    ...(datos.autorizacionesPend || []).map((a) => {
      const urgencia = avisoVencimiento("Respondé hasta", a.fecha_limite, fechaHoy);
      return {
        key: `aut-${a.id}`, tipo: "Autorización", tag: tagDeCurso(a.curso_id), titulo: a.titulo,
        dato: unir(a.fecha_evento ? `Salida: ${fechaCorta(a.fecha_evento)}` : null, urgencia ? null : a.fecha_limite ? `Responder hasta el ${fechaCorta(a.fecha_limite)}` : "Falta tu respuesta"),
        detalle: a.descripcion || null, vence: a.fecha_limite || null, urgencia,
        accion: "Responder autorización", ir: () => router.push({ pathname: "/(tabs)/autorizaciones", params: { openAutorizacion: String(a.id), t: String(Date.now()) } }),
      };
    }),
    ...datos.colectasPend.map((c) => ({
      key: `c-${c.id}`, tipo: "Colecta", tag: tagDeCurso(c.curso_id), titulo: c.titulo,
      dato: unir(montoTxt(c), (c.fecha_limite || c.vencimiento) && !avisoVencimiento("x", c.fecha_limite || c.vencimiento, fechaHoy) ? `Cierra el ${fechaCorta(c.fecha_limite || c.vencimiento)}` : null), detalle: null,
      vence: c.fecha_limite || c.vencimiento || null, urgencia: avisoVencimiento("Vence", c.fecha_limite || c.vencimiento, fechaHoy),
      accion: "Ver datos para pagar", ir: () => irColecta(c),
    })),
    ...datos.invitaciones.map((ev) => ({
      key: `i-${ev.id}`, tipo: "Invitación", tag: tagDeCurso(ev.curso_id), titulo: ev.titulo,
      dato: unir(avisoVencimiento("x", ev.fecha, fechaHoy) ? null : fechaCorta(ev.fecha), hora(ev.hora), ev.lugar), detalle: null,
      vence: ev.fecha, urgencia: avisoVencimiento("Es", ev.fecha, fechaHoy),
      accion: "Confirmar asistencia", ir: () => router.push({ pathname: "/(tabs)/cumples", params: { openFestejo: String(ev.id) } }),
    })),
    ...datos.encuestasPend.map((e) => ({
      key: `enc-${e.id}`, tipo: "Encuesta", tag: tagDeCurso(e.curso_id), titulo: e.pregunta,
      dato: e.fecha_cierre && !avisoVencimiento("x", e.fecha_cierre, fechaHoy) ? `Cierra el ${fechaCorta(e.fecha_cierre)}` : null, detalle: null,
      vence: e.fecha_cierre || null, urgencia: avisoVencimiento("Cierra", e.fecha_cierre, fechaHoy),
      accion: "Votar en la encuesta", ir: () => router.push("/(tabs)/encuestas"),
    })),
    ...(datos.porCerrar || []).map((c) => ({
      key: `pc-${c.id}`, tipo: "Colecta para cerrar", tag: tagDeCurso(c.curso_id), titulo: c.titulo,
      dato: `Venció hace ${diasVencida(c, fechaHoy)} días · ¿Terminó la colecta?`, detalle: null, vence: null, urgencia: null,
      accion: "Ver la colecta", ir: () => irColecta(c),
    })),
  ]);
  const [destacado, ...resto] = pendientes;

  // ── Novedades: avisos sin leer (leerlo en Avisos lo marca como leído) y
  // talleres con inscripción abierta. Un taller es optativo: se informa acá,
  // no va en "respuestas pendientes" (si no lo anotan, no hay nada que responder).
  const avisosSinLeer = datos.recordatorios
    .filter((r) => !r.tipo || r.tipo === "recordatorio" || r.tipo === "general")
    .map((r) => ({
      key: `r-${r.id}`, etiqueta: "Sin leer", accion: "Leer aviso", tag: tagDeCurso(r.curso_id), titulo: r.titulo || textoPlano(r.texto),
      dato: unir(r.grupo_id ? "Comunicación del colegio" : docenteDe(r.creado_por) ? etiquetaDocente(docenteDe(r.creado_por)).replace(/^👩‍🏫\s*/, "") : "Aviso del curso", r.fecha ? fechaCorta(r.fecha) : null, fmtRangoHora(r.hora_inicio, r.hora_fin) || null),
      ir: () => router.push({ pathname: "/(tabs)/recordatorios", params: { openAviso: String(r.id), t: String(Date.now()) } }),
    }));

  const avisos = [
    ...avisosSinLeer,
    ...(datos.talleresAbiertos || []).filter(({ taller: x }) => !leerTalleresVistos(datos.talleresVistos).has(x.id)).map(({ taller: x, hijos: hs }) => ({
      key: `tal-${x.id}`, etiqueta: "Inscripción abierta", etiquetaGris: true, accion: "Ver el taller", tag: null, titulo: x.nombre,
      dato: unir(`Para ${hs.map((h) => h.nombre?.split(" ")[0]).join(" y ")}`, x.inscripcion_hasta ? `hasta el ${fechaCorta(x.inscripcion_hasta)}` : null),
      ir: () => {
        // Mirarlo lo saca de Novedades (sigue en Curso → Talleres).
        const guardado = marcarTallerVisto(datos.talleresVistos, x.id);
        setDatos((d) => ({ ...d, talleresVistos: guardado }));
        AsyncStorage.setItem(claveTalleresVistos(userId), guardado).catch(() => {});
        router.push({ pathname: "/(tabs)/talleres", params: { openTaller: String(x.id), t: String(Date.now()) } });
      },
    })),
  ];

  // ── Próximos días: eventos + cumpleaños de los próximos 15 días.
  const agenda = [
    ...datos.eventos.map((e) => (e.tipo === "festejo"
      ? {
        key: `e-${e.id}`, fecha: e.fecha, dias: diasHasta(e.fecha), titulo: e.titulo,
        meta: unir("Festejo", hora(e.hora), e.lugar), tag: tagDeCurso(e.curso_id),
        ir: () => router.push({ pathname: "/(tabs)/cumples", params: { openFestejo: String(e.id) } }),
      }
      : {
        key: `e-${e.id}`, fecha: e.fecha, dias: diasHasta(e.fecha), titulo: e.titulo,
        meta: e.lugar || "Todo el curso", tag: tagDeCurso(e.curso_id),
        ir: () => router.push({ pathname: "/(tabs)/calendario", params: { openFecha: e.fecha } }),
      })),
    ...datos.bdayList.map((b) => ({
      key: b.id, fecha: b.fecha, dias: b.dias, titulo: `Cumple de ${b.nombre}`, meta: "Cumpleaños",
      tag: tagDeCurso(b.curso_id), ir: () => router.push("/(tabs)/cumples"),
    })),
  ]
    .filter((x) => x.dias >= 0 && x.dias <= DIAS_PROXIMOS)
    .sort((a, b) => a.dias - b.dias);
  const menuFilas = filasMenu(datos.menu);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.fecha}>{hoyLabel}</Text>
      <Text style={styles.hello}>
        Hola
        {userName ? `, ${userName}` : ""}
      </Text>
      <SelectorHijos style={{ marginTop: SPACE.md }} />

      {error ? <ErrorMuro onReintentar={cargar} tieneDatos style={{ marginTop: SPACE.lg }} /> : null}

      {isAdmin ? (
        <Pressable onPress={() => setAlertaModal(true)} style={styles.alertaCta}>
          <Text style={styles.alertaCtaTxt}>Publicar alerta al curso</Text>
        </Pressable>
      ) : null}

      {/* Alertas del curso: lo único en rojo (son urgencias reales). */}
      {(datos.alertas || []).map((a) => (
        <View key={a.id} style={styles.alerta}>
          <MaterialCommunityIcons name="alert-outline" size={20} color={t.danger} />
          <View style={styles.flex1}>
            <View style={styles.filaTop}>
              <Text style={styles.alertaMeta}>Alerta del curso{a.hora ? ` · ${a.hora}` : ""}</Text>
              <Hijo tag={tagDeCurso(a.curso_id)} />
            </View>
            <Text style={styles.alertaMsg}>{a.mensaje}</Text>
          </View>
          {isAdmin ? (
            <Pressable onPress={() => dismissAlerta(a.id)} hitSlop={8} style={styles.alertaClose} accessibilityLabel="Quitar alerta">
              <MaterialCommunityIcons name="close" size={18} color={SLATE[400]} />
            </Pressable>
          ) : null}
        </View>
      ))}

      {/* ── Respuestas pendientes ── */}
      {pendientes.length ? (
        <>
          <Text style={styles.seccion}>{textoRespuestasPendientes(pendientes.length)}</Text>
          <View style={[styles.card, styles.destacado]}>
            <View style={styles.filaTop}>
              <Text style={styles.tipo}>{destacado.tipo}</Text>
              <Hijo tag={destacado.tag} />
            </View>
            {destacado.urgencia ? (
              <View style={styles.urgencia}>
                <MaterialCommunityIcons name="clock-outline" size={14} color="#B91C1C" />
                <Text style={styles.urgenciaTxt}>{destacado.urgencia}</Text>
              </View>
            ) : null}
            <Text style={styles.destTitulo}>{destacado.titulo}</Text>
            {destacado.dato ? <Text style={styles.dato}>{destacado.dato}</Text> : null}
            {destacado.detalle ? <Text style={styles.dato} numberOfLines={2}>{destacado.detalle}</Text> : null}
            {/* Mismo enlace que el resto de los pendientes (antes era un botón azul solo en el primero). */}
            <Enlace texto={destacado.accion} onPress={destacado.ir} />
          </View>
          {resto.length ? (
            <View style={[styles.card, { marginTop: SPACE.md }]}>
              {resto.map((p, i) => (
                <View key={p.key} style={[styles.fila, i > 0 && styles.filaBorde]}>
                  <View style={styles.filaTop}>
                    <Text style={styles.tipo}>{p.tipo}</Text>
                    <Hijo tag={p.tag} />
                  </View>
                  <Text style={styles.filaTitulo}>{p.titulo}</Text>
                  {p.dato ? (
                    <Text style={styles.dato}>
                      {p.urgencia ? <Text style={styles.datoUrgente}>{p.urgencia} · </Text> : null}
                      {p.dato}
                    </Text>
                  ) : null}
                  <Enlace texto={p.accion} onPress={p.ir} />
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={[styles.card, styles.alDia]}>
          <View style={styles.alDiaIcon}>
            <MaterialCommunityIcons name="check" size={19} color={SLATE[600]} />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.alDiaTitulo}>Estás al día</Text>
            <Text style={styles.alDiaTxt}>No tenés nada para responder. Cuando haya algo, aparece acá.</Text>
          </View>
        </View>
      )}

      {/* ── Novedades: avisos sin leer + Lost & Found ── */}
      <View style={styles.encabezado}>
        <Text style={[styles.seccion, styles.seccionEnFila]}>Novedades</Text>
        {avisos.length ? (
          <View style={styles.cuenta}>
            <Text style={styles.cuentaTxt}>{avisos.length}</Text>
          </View>
        ) : null}
        <View style={styles.flex1} />
        <Pressable onPress={() => router.push("/(tabs)/mensajes")} hitSlop={8}>
          <Text style={styles.link}>Mensajes</Text>
        </Pressable>
      </View>
      {!avisos.length ? <Text style={styles.subSeccion}>No tenés avisos sin leer.</Text> : null}
      {avisos.length || datos.encontradosSemana > 0 ? (
        <View style={styles.card}>
          {avisos.map((a, i) => (
            <View key={a.key} style={[styles.fila, i > 0 && styles.filaBorde]}>
              <View style={styles.filaTop}>
                <Text style={a.etiquetaGris ? styles.etiquetaGris : styles.sinLeer}>{a.etiqueta}</Text>
                <Hijo tag={a.tag} />
              </View>
              <Text style={styles.filaTitulo}>{a.titulo}</Text>
              {a.dato ? <Text style={styles.dato}>{a.dato}</Text> : null}
              <Enlace texto={a.accion} onPress={a.ir} />
            </View>
          ))}
          {datos.encontradosSemana > 0 ? (
            <View style={[styles.fila, avisos.length ? styles.filaBorde : null]}>
              <Text style={styles.tipo}>Lost & Found</Text>
              <Text style={styles.filaTitulo}>
                {datos.encontradosSemana} {datos.encontradosSemana === 1 ? "objeto encontrado" : "objetos encontrados"} esta semana
              </Text>
              <Text style={styles.dato}>¿{datos.encontradosSemana === 1 ? "Es" : "Alguno es"} de tu hijo?</Text>
              <View style={styles.accionesFila}>
                <Enlace texto="Ver" onPress={() => router.push({ pathname: "/(tabs)/perdidos", params: { tab: "encontrado", t: String(Date.now()) } })} />
                {/* "No": deja de preguntar por estos objetos (vuelve solo si aparece uno nuevo). */}
                <Pressable
                  onPress={() => {
                    AsyncStorage.setItem(claveEncontradosVistos(userId), new Date().toISOString()).catch(() => {});
                    setDatos((d) => ({ ...d, encontradosSemana: 0 }));
                  }}
                  hitSlop={8}
                  style={styles.noBtn}
                >
                  <Text style={styles.linkNo}>No</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Próximos días ── */}
      <View style={styles.encabezado}>
        <Text style={[styles.seccion, styles.seccionEnFila, styles.flex1]}>Próximos días</Text>
        <Pressable onPress={() => router.push("/(tabs)/calendario")} hitSlop={8}>
          <Text style={styles.link}>Agenda</Text>
        </Pressable>
      </View>
      {agenda.length ? (
        <View style={styles.card}>
          {agenda.map((item, i) => {
            const f = new Date(item.fecha + "T00:00:00");
            const dow = f.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");
            return (
              <Pressable key={item.key} onPress={item.ir} style={[styles.arow, i > 0 && styles.filaBorde]}>
                <View style={styles.fechaCol}>
                  <Text style={styles.fechaDow}>{dow}</Text>
                  <Text style={styles.fechaNum}>{f.getDate()}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.filaTitulo} numberOfLines={1}>{item.titulo}</Text>
                  <View style={styles.arowMetaRow}>
                    <Hijo tag={item.tag} />
                    <Text style={[styles.dato, styles.flex1, { marginTop: 0 }]} numberOfLines={1}>{item.meta}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.subSeccion}>{`Sin eventos ni cumpleaños en los próximos ${DIAS_PROXIMOS} días.`}</Text>
      )}

      {/* ── Menú de hoy ── */}
      {menuFilas.length ? (
        <>
          <View style={styles.encabezado}>
            <Text style={[styles.seccion, styles.seccionEnFila, styles.flex1]}>Menú de hoy</Text>
            <Pressable onPress={() => router.push("/(tabs)/comedor")} hitSlop={8}>
              <Text style={styles.link}>Semana</Text>
            </Pressable>
          </View>
          <TablaMenu menu={datos.menu} />
        </>
      ) : null}

      <AlertaModal visible={alertaModal} onClose={() => setAlertaModal(false)} onEnviar={enviarAlerta} />
    </ScrollView>
  );
}

// Error al (re)cargar el muro. Con `tieneDatos` se muestra como banner arriba
// del contenido ya cargado (la última carga buena sigue visible); sin datos
// previos (primera carga) reemplaza al skeleton.
function ErrorMuro({ onReintentar, tieneDatos, style }) {
  return (
    <View style={[styles.errorCard, style]}>
      <Text style={styles.errorEmoji}>☁️</Text>
      <Text style={styles.errorTitulo}>No pudimos actualizar el muro</Text>
      <Text style={styles.errorTxt}>
        {tieneDatos ? "Estás viendo lo último cargado. Revisá tu conexión." : "Revisá tu conexión e intentá de nuevo."}
      </Text>
      <Pressable onPress={onReintentar} style={styles.errorBtn}>
        <Text style={styles.errorBtnTxt}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

// Punto del color del hijo + nombre (solo en la vista "Todos").
function Hijo({ tag }) {
  if (!tag) return null;
  return (
    <View style={styles.hijo}>
      <View style={[styles.hijoDot, { backgroundColor: tag.color }]} />
      <Text style={styles.hijoTxt} numberOfLines={1}>{tag.nombre}</Text>
    </View>
  );
}

function Enlace({ texto, onPress }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.enlace} accessibilityRole="link">
      <Text style={styles.link}>{texto}</Text>
      <MaterialCommunityIcons name="arrow-right" size={16} color={BLUE[600]} />
    </Pressable>
  );
}

function AlertaModal({ visible, onClose, onEnviar }) {
  const [msg, setMsg] = useState("");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>Publicar alerta</Text>
            <Text style={styles.modalSub}>Se envía como push a toda la comunidad del curso.</Text>
            <TextInput
              value={msg}
              onChangeText={setMsg}
              placeholder="Ej: Mañana no hay clases"
              placeholderTextColor={t.placeholder}
              multiline
              style={styles.modalInput}
            />
            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={() => msg.trim() && onEnviar(msg.trim())} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>Enviar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Estilos A3: sin sombras, borde hairline, radio 16, countdown protagonista.
// Estilos sobrios (prototipo "Hoy"): blanco, bordes finos, grises; el azul solo
// en la acción principal y los enlaces; el color del hijo solo en su punto.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },

  fecha: { fontSize: 13, color: t.textMuted },
  hello: { fontSize: 26, fontWeight: "800", color: t.textStrong, marginTop: 2, letterSpacing: -0.4 },

  seccion: { fontSize: 18, fontWeight: "800", color: t.textStrong, letterSpacing: -0.2, marginTop: SPACE.xl, marginBottom: SPACE.md },
  seccionEnFila: { marginTop: 0, marginBottom: 0 },
  encabezado: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: SPACE.xl, marginBottom: SPACE.md },
  subSeccion: { fontSize: 13, color: t.textMuted, marginTop: -6, marginBottom: SPACE.md },
  cuenta: { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: RADIUS.full, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  cuentaTxt: { fontSize: 12, fontWeight: "700", color: SLATE[600] },
  link: { fontSize: 13.5, fontWeight: "700", color: BLUE[600] },

  card: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.xl, overflow: "hidden" },
  destacado: { padding: 16 },
  filaTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tipo: { fontSize: 12.5, fontWeight: "600", color: t.textMuted },
  sinLeer: { fontSize: 12, fontWeight: "700", color: BLUE[600] },
  etiquetaGris: { fontSize: 12, fontWeight: "600", color: SLATE[500] },
  urgencia: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.sm, backgroundColor: "#FEF2F2" },
  urgenciaTxt: { fontSize: 12.5, fontWeight: "700", color: "#B91C1C" },
  destTitulo: { fontSize: 18, fontWeight: "800", color: t.textStrong, marginTop: 10, lineHeight: 23 },
  dato: { fontSize: 13, color: t.textMuted, marginTop: 4, lineHeight: 18 },
  datoUrgente: { color: "#B91C1C", fontWeight: "700" },
  fila: { paddingHorizontal: 16, paddingVertical: 14 },
  filaBorde: { borderTopWidth: 1, borderTopColor: t.border },
  filaTitulo: { fontSize: 15, fontWeight: "700", color: t.textStrong, marginTop: 4, lineHeight: 20 },
  enlace: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, minHeight: 28 },

  hijo: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  hijoDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  hijoTxt: { fontSize: 12, fontWeight: "600", color: SLATE[600] },

  alDia: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 16, marginTop: SPACE.xl },
  alDiaIcon: { width: 36, height: 36, borderRadius: RADIUS.full, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" },
  alDiaTitulo: { fontSize: 15, fontWeight: "700", color: t.textStrong },
  alDiaTxt: { fontSize: 13, color: t.textMuted, marginTop: 2, lineHeight: 18 },

  accionesFila: { flexDirection: "row", alignItems: "center", gap: 20 },
  noBtn: { marginTop: 10, minHeight: 28, justifyContent: "center" },
  linkNo: { fontSize: 14, fontWeight: "700", color: t.textMuted },

  arow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  fechaCol: { width: 36, alignItems: "center" },
  fechaDow: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: t.textMuted },
  fechaNum: { fontSize: 20, fontWeight: "800", color: t.textStrong, fontVariant: ["tabular-nums"] },
  arowMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },


  alertaCta: { marginTop: SPACE.lg, alignSelf: "flex-start", minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.full, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  alertaCtaTxt: { color: t.danger, fontSize: 13, fontWeight: "700" },
  alerta: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, marginTop: SPACE.lg, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FEF2F2" },
  alertaMeta: { fontSize: 12, fontWeight: "700", color: "#B91C1C" },
  alertaMsg: { fontSize: 14, fontWeight: "600", color: t.textStrong, marginTop: 3, lineHeight: 20 },
  alertaClose: { padding: 2 },

  // error al cargar/actualizar el muro
  errorCard: { alignItems: "center", backgroundColor: t.dangerSoft, borderWidth: 1, borderColor: t.dangerBorder, borderRadius: RADIUS.xl, padding: SPACE.xl },
  errorEmoji: { fontSize: 28 },
  errorTitulo: { fontSize: 14.5, fontWeight: "800", color: t.textStrong, marginTop: 8, textAlign: "center" },
  errorTxt: { fontSize: 12.5, color: t.textMuted, marginTop: 4, textAlign: "center", lineHeight: 17 },
  errorBtn: { marginTop: 14, minHeight: 40, paddingHorizontal: 18, borderRadius: RADIUS.md, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" },
  errorBtnTxt: { color: t.onAccent, fontSize: 13, fontWeight: "800" },

  // modal de alerta
  modalOverlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 420, maxHeight: "88%", backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xxl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "900", color: t.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: t.textFaint, marginBottom: 14 },
  modalInput: {
    minHeight: 80,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surfaceSunken,
    padding: SPACE.md,
    fontSize: 14,
    color: t.text,
    textAlignVertical: "top",
    marginBottom: 14,
  },
  modalBtns: { flexDirection: "row", gap: SPACE.sm },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  cancelTxt: { color: t.textFaint, fontSize: 13, fontWeight: "600" },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
});
