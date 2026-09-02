// Cumpleaños (puerto RN de src/features/cumples). Lista unificada de cumpleaños
// de alumnos + maestros del curso (búsqueda/orden/filtro vía useListControls +
// FlatList), banners de festejo del propio hijo, "mis invitaciones", y 4 modales:
// ResponsableModal (quién regala), FestejoModal (alta/edición + invitados +
// imagen), FestejoDetalleModal (RSVP + totales + export Excel) y ColectaRegaloModal
// (admin crea colecta de regalo para un maestro). La asignación de regalo genera
// recordatorios automáticos al responsable (misma lógica que la web).

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  FlatList,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  StyleSheet,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { pickAndUploadImage, exportRowsToExcel } from "../../lib/media";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fmtNombre, fmtF, sanitize, safeUrl } from "@shared/helpers";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE, childTheme } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { SelectChip } from "../../components/SelectChip";
import { Paginador } from "../../components/Paginador";
import { Avatar } from "../../components/Avatar";
import { DateField } from "../../components/DateField";
import { useListControls } from "../../lib/useListControls";

const t = THEMES.light;

const MESES_NOMBRES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Opciones de los filtros colapsados (SelectChip): el chip muestra el nombre
// corto del mes cuando hay filtro activo.
const MES_OPTS = [
  { value: "all", label: "Todos los meses" },
  ...MESES_NOMBRES.map((m, i) => ({ value: String(i), label: m, short: m.slice(0, 3) })),
];
const TIPO_OPTS = [
  { value: "all", label: "Todos" },
  { value: "Alumno", label: "Alumnos" },
  { value: "Maestro", label: "Maestros" },
];

const nextBday = (fecha) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const d = new Date(fecha + "T00:00:00");
  let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
  if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
  return Math.round((next - hoy) / (1000 * 60 * 60 * 24));
};

// Countdown con urgencia (firma A3): ≤3 lleno, ≤7 teñido, resto neutro.
const bdayLabel = (dias) => {
  if (dias === 0) return { l: "Hoy", c: t.onAccent, bg: t.accent };
  if (dias === 1) return { l: "Mañana", c: t.onAccent, bg: t.accent };
  if (dias <= 3) return { l: `${dias} días`, c: t.onAccent, bg: t.accent };
  if (dias <= 7) return { l: `${dias} días`, c: BLUE[600], bg: t.accentSoft };
  return { l: `${dias} días`, c: t.textMuted, bg: SLATE[100] };
};

const fmtDiaMes = (fecha) =>
  new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" });

export function Cumpleanios({ openFestejoId = null, onClearOpenFestejo }) {
  const { cursoId, cursoIds, esVistaTodos, tagDeCurso, usuario, isAdmin, misHijos = [], hijoActivoId = null } = useSession();
  const userId = usuario?.id;
  const misHijosUniq = useMemo(() => [...new Set(misHijos)], [misHijos]);

  const [lista, setLista] = useState([]);
  const [cumpleMap, setCumpleMap] = useState({});
  const [festejoMap, setFestejoMap] = useState({});
  const [invitaciones, setInvitaciones] = useState([]);
  const [montoRegalo, setMontoRegalo] = useState(null);
  const [monedaRegalo, setMonedaRegalo] = useState("$");
  const [apoderados, setApoderados] = useState([]);

  const [editando, setEditando] = useState(null);
  const [festejoModal, setFestejoModal] = useState(null);
  const [festejoDetalle, setFestejoDetalle] = useState(null);
  const [colectaRegaloModal, setColectaRegaloModal] = useState(null);

  const verificarRecordatoriosRegalo = useCallback(
    async (cumpleMapActual, listaActual) => {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const pendientes = listaActual
        .map((item) => {
          const cumple = cumpleMapActual[item.id];
          if (!cumple?.responsable_id) return null;
          const d = new Date(item.fecha_nacimiento + "T00:00:00");
          let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
          if (next < hoy) next.setFullYear(hoy.getFullYear() + 1);
          const dias = Math.round((next - hoy) / (1000 * 60 * 60 * 24));
          if (dias > 7 || dias < 0) return null;
          return { item, cumple, dias, next };
        })
        .filter(Boolean);
      if (!pendientes.length) return;

      const refIds = pendientes.map((p) => p.cumple.id);
      const { data: yaExisten } = await supabase
        .from("recordatorios")
        .select("ref_id, para_usuario_id")
        .in("curso_id", cursoIds)
        .eq("tipo", "regalo_cumple")
        .in("ref_id", refIds);
      const existeSet = new Set((yaExisten || []).map((r) => `${r.ref_id}_${r.para_usuario_id}`));

      const inserts = pendientes
        .filter((p) => !existeSet.has(`${p.cumple.id}_${p.cumple.responsable_id}`))
        .map(({ item, cumple, dias, next }) => {
          const nombre = item.nombre.split(" ")[0];
          return {
            // El recordatorio pertenece al curso del cumple (en vista Todos no hay curso de sesión).
            curso_id: cumple.curso_id,
            tipo: "regalo_cumple",
            ref_id: cumple.id,
            para_usuario_id: cumple.responsable_id,
            texto: `El cumple de ${nombre} es en ${
              dias === 0 ? "hoy" : dias === 1 ? "1 día" : `${dias} días`
            }. ¿Ya compraste el regalo?`,
            emoji: "🎁",
            urgente: dias <= 2,
            prioridad: dias <= 2 ? "alta" : "media",
            fecha: next.toISOString().slice(0, 10),
          };
        });
      if (inserts.length) await supabase.from("recordatorios").insert(inserts);
    },
    [cursoIds]
  );

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const [al, ma, cu, fest, inv] = await Promise.all([
      supabase
        .from("hijos")
        .select("id,nombre,apellido,fecha_nacimiento,color,curso_id")
        .in("curso_id", cursoIds)
        .order("nombre"),
      supabase
        .from("maestros")
        .select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)")
        .in("maestro_cursos.curso_id", cursoIds),
      supabase
        .from("cumples")
        .select("*, responsable:responsable_id(id,nombre,apellido)")
        .in("curso_id", cursoIds),
      supabase.from("eventos").select("*").in("curso_id", cursoIds).eq("tipo", "festejo"),
      userId && misHijos?.length
        ? supabase
            .from("evento_asistencia")
            .select(
              "*, evento:evento_id(id,titulo,fecha,hora,hora_fin,lugar,tipo,imagen_url,url_ubicacion,descripcion,alumno_id)"
            )
            .in("alumno_invitado_id", misHijos)
        : Promise.resolve({ data: [] }),
    ]);

    // Monto sugerido por familia: con un solo curso se muestra siempre; en vista
    // Todos solo si todos los cursos coinciden (si difieren, se oculta la pill).
    const { data: cursosData } = await supabase
      .from("cursos")
      .select("monto_regalo,moneda_regalo")
      .in("id", cursoIds);
    const montosUniq = [...new Set((cursosData || []).map((c) => c.monto_regalo || null))];
    const monedasUniq = [...new Set((cursosData || []).map((c) => c.moneda_regalo || "$"))];
    setMontoRegalo(montosUniq.length === 1 ? montosUniq[0] : null);
    setMonedaRegalo(monedasUniq.length === 1 ? monedasUniq[0] : "$");

    const invFiltradas = (inv.data || []).filter(
      (i) => i.evento && (hijoActivoId === null || i.alumno_invitado_id === hijoActivoId)
    );
    setInvitaciones(invFiltradas);

    const fmap = {};
    (fest.data || []).forEach((f) => {
      if (f.alumno_id) fmap[f.alumno_id] = f;
    });
    setFestejoMap(fmap);

    const alumnosUniq = Object.values(
      (al.data || []).reduce((acc, a) => {
        acc[a.id] = a;
        return acc;
      }, {})
    );
    const maestrosUniq = Object.values(
      (ma.data || []).reduce((acc, m) => {
        acc[m.id] = m;
        return acc;
      }, {})
    );
    const unified = [
      ...alumnosUniq
        .filter((a) => a.fecha_nacimiento)
        .map((a) => ({
          id: `a-${a.id}`,
          rawId: a.id,
          nombre: fmtNombre(a),
          tipo: "Alumno",
          fecha_nacimiento: a.fecha_nacimiento,
          color: a.color || "#3B82F6",
          curso_id: a.curso_id,
        })),
      ...maestrosUniq
        .filter((m) => m.fecha_nacimiento)
        .map((m) => ({
          id: `m-${m.id}`,
          rawId: m.id,
          nombre: m.nombre,
          tipo: "Maestro",
          fecha_nacimiento: m.fecha_nacimiento,
          color: "#8B5CF6",
          // El !inner ya filtró los cursos a cursoIds; si el maestro está en
          // varios de mis cursos, se etiqueta con el primero.
          curso_id: m.maestro_cursos?.[0]?.curso_id ?? null,
        })),
    ];
    unified.sort((a, b) => nextBday(a.fecha_nacimiento) - nextBday(b.fecha_nacimiento));
    setLista(unified);

    // Apoderados del curso (para ColectaRegaloModal) + responsable → hijo compañero
    const { data: hijosDelCurso } = await supabase
      .from("hijos")
      .select("id")
      .in("curso_id", cursoIds);
    const hids = (hijosDelCurso || []).map((h) => h.id);
    let uhData = [];
    if (hids.length) {
      const { data } = await supabase.from("usuario_hijos").select("usuario_id").in("hijo_id", hids);
      uhData = data || [];
      const uids = [...new Set(uhData.map((x) => x.usuario_id).filter(Boolean))];
      if (uids.length) {
        const { data: usData } = await supabase
          .from("usuarios")
          .select("id,nombre,apellido")
          .in("id", uids);
        setApoderados((usData || []).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }
    }

    const map = {};
    (cu.data || []).forEach((c) => {
      if (c.alumno_id) map[`a-${c.alumno_id}`] = c;
      if (c.maestro_id_ref) map[`m-${c.maestro_id_ref}`] = c;
    });
    const responsableUids = [...new Set((cu.data || []).map((c) => c.responsable_id).filter(Boolean))];
    if (responsableUids.length && hids.length) {
      try {
        const { data: uhResp } = await supabase
          .from("usuario_hijos")
          .select("usuario_id, hijo_id")
          .in("usuario_id", responsableUids)
          .in("hijo_id", hids);
        if (uhResp?.length) {
          const alumnoById = {};
          alumnosUniq.forEach((a) => {
            alumnoById[a.id] = a;
          });
          const uidToHijo = {};
          uhResp.forEach((r) => {
            if (alumnoById[r.hijo_id]) uidToHijo[r.usuario_id] = alumnoById[r.hijo_id];
          });
          Object.values(map).forEach((c) => {
            if (c.responsable_id && uidToHijo[c.responsable_id])
              c._responsable_hijo = uidToHijo[c.responsable_id];
          });
        }
      } catch {
        /* RLS puede bloquear: caemos al nombre del usuario responsable */
      }
    }
    setCumpleMap(map);
    await verificarRecordatoriosRegalo(map, unified);
  }, [cursoIds, userId, misHijos, hijoActivoId, verificarRecordatoriosRegalo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Deep-link desde el Muro (card de invitación del carrusel de Pendientes):
  // abre el detalle del festejo apenas los datos lo contienen.
  useEffect(() => {
    if (!openFestejoId) return;
    const deInvitacion = invitaciones.find(
      (i) => i.evento && String(i.evento.id) === String(openFestejoId)
    )?.evento;
    const deFestejo = Object.values(festejoMap).find(
      (f) => String(f.id) === String(openFestejoId)
    );
    const ev = deInvitacion || deFestejo;
    if (ev) {
      setFestejoDetalle(ev);
      onClearOpenFestejo?.();
    }
  }, [openFestejoId, invitaciones, festejoMap, onClearOpenFestejo]);

  const guardarResponsable = async ({ responsable_id, comprado }) => {
    const isAlumno = editando.tipo === "Alumno";
    const cumpleExistente = cumpleMap[editando.id];
    const existenteId = cumpleExistente?.id || null;

    let resolvedId = null;
    if (responsable_id) {
      const { data: uh } = await supabase
        .from("usuario_hijos")
        .select("usuario_id")
        .eq("hijo_id", responsable_id)
        .limit(1);
      resolvedId = uh?.[0]?.usuario_id || null;
    }
    const payload = { responsable_id: resolvedId, comprado };
    if (existenteId) {
      await supabase.from("cumples").update(payload).eq("id", existenteId);
    } else {
      await supabase.from("cumples").insert({
        // Curso del alumno/maestro editado (en vista Todos no hay curso de sesión).
        curso_id: editando.curso_id,
        alumno_id: isAlumno ? editando.rawId : null,
        maestro_id_ref: !isAlumno ? editando.rawId : null,
        ...payload,
      });
    }
    setEditando(null);
    await cargar();
  };

  const crearColectaRegalo = async ({ maestroNombre, titulo, monto, moneda, fecha_limite, responsable_id }) => {
    // Curso del maestro homenajeado (nunca el de sesión, que es null en vista Todos).
    const cursoDestino = colectaRegaloModal?.cursoId ?? cursoId;
    const payload = {
      titulo: sanitize(titulo),
      tipo: "colecta",
      descripcion: `Colecta para el regalo de cumpleaños de ${maestroNombre}`,
      monto_sugerido: monto ? Number(monto) : null,
      moneda: moneda || "$",
      fecha_limite: fecha_limite || null,
      vencimiento: fecha_limite || new Date().toISOString().slice(0, 10),
      curso_id: cursoDestino,
      activa: true,
      responsable_id: responsable_id || null,
    };
    const { error } = await supabase.from("colectas").insert(payload);
    if (!error) {
      const userIds = await getUserIdsByCurso(cursoDestino);
      await sendPush({
        type: "colecta",
        payload: { descripcion: `Colecta para el regalo de ${maestroNombre}`, userIds },
      });
    }
    setColectaRegaloModal(null);
  };

  const ctrl = useListControls(lista, {
    searchFn: (a, q) => a.nombre.toLowerCase().includes(q),
    // Orden fijo: próximo cumpleaños primero (sin control de orden en la UI).
    sortOptions: [{ key: "proximo", label: "Próximo", val: (a) => nextBday(a.fecha_nacimiento) }],
    filterOptions: [
      {
        key: "mes",
        label: "Mes",
        options: MESES_NOMBRES.map((m, i) => ({ value: String(i), label: m })),
        match: (a, v) => new Date(a.fecha_nacimiento + "T00:00:00").getMonth() === parseInt(v, 10),
      },
      {
        key: "tipo",
        label: "Tipo",
        options: [
          { value: "Alumno", label: "Alumnos" },
          { value: "Maestro", label: "Maestros" },
        ],
        match: (a, v) => a.tipo === v,
      },
    ],
    pageSize: 20,
  });

  const hijosConCumple = lista.filter(
    (a) => a.tipo === "Alumno" && misHijosUniq.includes(a.rawId)
  );

  const esteMes = lista.filter(
    (a) => new Date(a.fecha_nacimiento + "T00:00:00").getMonth() === new Date().getMonth()
  ).length;

  const Header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.h1}>Cumpleaños</Text>
        {montoRegalo ? (
          <View style={styles.montoPill}>
            <Text style={styles.montoTxt}>
              🎁 {monedaRegalo} {Number(montoRegalo).toLocaleString("es-AR")} por familia
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.subtitle}>
        {lista.length} {esVistaTodos ? "en tus cursos" : "en el curso"}
        {esteMes ? ` · ${esteMes} este mes` : ""}
      </Text>

      {/* Tu festejo: crear/ver festejo del propio hijo (card A3 con barra del color del hijo) */}
      {hijosConCumple.length > 0 ? <Text style={styles.label}>Tu festejo</Text> : null}
      {hijosConCumple.map((a) => {
        const fest = festejoMap[a.rawId];
        const bl = bdayLabel(nextBday(a.fecha_nacimiento));
        const ct = childTheme(a.color);
        return (
          <View key={`b-${a.rawId}`} style={[styles.banner, { borderLeftColor: ct.main }]}>
            <View style={styles.bannerTop}>
              <Avatar nombre={a.nombre} color={a.color} size={38} />
              <View style={styles.flex1}>
                <Text style={styles.bannerNombre}>
                  {fest ? "Festejo de " : "Cumple de "}
                  {a.nombre.split(" ")[0]}
                </Text>
                <Text style={styles.bannerFecha}>
                  {fmtDiaMes(a.fecha_nacimiento)}
                  {fest ? " · invitaciones enviadas" : " · todavía sin festejo"}
                </Text>
              </View>
              <View style={[styles.diasPill, { backgroundColor: bl.bg }]}>
                <Text style={[styles.diasTxt, { color: bl.c }]}>{bl.l}</Text>
              </View>
            </View>
            <View style={styles.bannerBtns}>
              {fest ? (
                <>
                  <Pressable onPress={() => setFestejoDetalle(fest)} style={styles.verFestBtn}>
                    <Text style={styles.verFestTxt}>Ver festejo</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setFestejoModal({ alumnoId: a.rawId, alumnoNombre: a.nombre, cursoId: a.curso_id, festejo: fest })}
                    style={styles.editFestBtn}
                  >
                    <Text style={styles.editFestTxt}>Editar</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  onPress={() => setFestejoModal({ alumnoId: a.rawId, alumnoNombre: a.nombre, cursoId: a.curso_id })}
                  style={styles.verFestBtn}
                >
                  <Text style={styles.verFestTxt}>+ Crear festejo</Text>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {/* Mis invitaciones: fila tocable con chip de estado (A3) */}
      {invitaciones.length > 0 ? (
        <View style={styles.invSection}>
          <Text style={styles.label}>Invitaciones</Text>
          {invitaciones.map((inv) => {
            const ev = inv.evento;
            if (!ev) return null;
            const estado =
              inv.asiste === "si"
                ? { l: "✓ Confirmado", c: t.success, bg: t.successSoft }
                : inv.asiste === "no"
                ? { l: "No va", c: t.danger, bg: t.dangerSoft }
                : { l: "Responder", c: "#B45309", bg: t.warningSoft };
            return (
              <Pressable key={inv.id} onPress={() => setFestejoDetalle(ev)} style={styles.invCard}>
                <View style={styles.invTile}>
                  <Text style={styles.invTileTxt}>🎉</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.invNombre} numberOfLines={1}>{ev.titulo}</Text>
                  <Text style={styles.invMeta} numberOfLines={1}>
                    {fmtF(ev.fecha)}
                    {ev.hora ? ` · ${ev.hora}${ev.hora_fin ? ` – ${ev.hora_fin}` : ""}` : ""}
                    {ev.lugar ? ` · ${ev.lugar}` : ""}
                  </Text>
                </View>
                <View style={[styles.estadoPill, { backgroundColor: estado.bg }]}>
                  <Text style={[styles.estadoTxt, { color: estado.c }]}>{estado.l}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={17} color={SLATE[300]} />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* Toolbar A3: búsqueda + filtros colapsados en una sola fila (orden fijo por fecha) */}
      <View style={styles.toolRow}>
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={16} color={t.textFaint} />
          <TextInput
            value={ctrl.busqueda}
            onChangeText={ctrl.setBusqueda}
            placeholder="Buscar por nombre..."
            placeholderTextColor={t.placeholder}
            style={styles.searchInput}
          />
        </View>
        <SelectChip
          label="Mes"
          prefix={false}
          value={ctrl.filtros.mes || "all"}
          options={MES_OPTS}
          onChange={(v) => ctrl.setFiltro("mes", v)}
        />
        <SelectChip
          label="Tipo"
          prefix={false}
          value={ctrl.filtros.tipo || "all"}
          options={TIPO_OPTS}
          onChange={(v) => ctrl.setFiltro("tipo", v)}
        />
      </View>
      <Text style={styles.cnt}>
        {ctrl.total} resultado{ctrl.total !== 1 ? "s" : ""}
      </Text>
    </View>
  );

  // Encabezado de mes: se inserta antes del primer ítem cuyo mes difiere del
  // anterior en la lista ya ordenada por proximidad — el orden por
  // nextBday ya agrupa los meses en secuencia (mes actual en adelante), así
  // que comparar contra el ítem previo alcanza sin un SectionList aparte.
  const mesDe = (a) => new Date(a.fecha_nacimiento + "T00:00:00").getMonth();

  const renderItem = ({ item: a, index }) => {
    const dias = nextBday(a.fecha_nacimiento);
    const bl = bdayLabel(dias);
    const cumple = cumpleMap[a.id] || {};
    const isAlumno = a.tipo === "Alumno";
    const esMiHijo = isAlumno && misHijosUniq.includes(a.rawId);
    const fest = isAlumno ? festejoMap[a.rawId] : null;
    const respNombre = cumple._responsable_hijo
      ? fmtNombre(cumple._responsable_hijo)
      : cumple.responsable
      ? fmtNombre(cumple.responsable)
      : null;
    const tag = tagDeCurso(a.curso_id); // solo en vista Todos
    const mesActual = mesDe(a);
    const mesCambia = index === 0 || mesDe(ctrl.items[index - 1]) !== mesActual;
    return (
      <View>
      {mesCambia ? <Text style={styles.mesHeader}>{MESES_NOMBRES[mesActual]}</Text> : null}
      <View style={styles.row}>
        <Avatar nombre={a.nombre} color={a.color} size={38} />
        <View style={styles.flex1}>
          <Text style={styles.rowNombre} numberOfLines={1}>{a.nombre}</Text>
          <View style={styles.rowTags}>
            <Text style={styles.rowFecha}>{fmtDiaMes(a.fecha_nacimiento)}</Text>
            <Text style={styles.rowFecha}>·</Text>
            <Text style={[styles.tipoTxt, { color: a.tipo === "Maestro" ? "#8B5CF6" : t.textMuted }]}>
              {a.tipo === "Maestro" ? "Seño" : a.tipo}
              {esMiHijo ? " · tu hijo/a" : ""}
            </Text>
            {tag ? (
              <>
                <Text style={styles.rowFecha}>·</Text>
                <View style={styles.tagHijo}>
                  <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                  <Text style={styles.tagTxt} numberOfLines={1}>{tag.nombre}</Text>
                </View>
              </>
            ) : null}
          </View>
          {respNombre ? <Text style={styles.regala}>🎁 Regala: {respNombre}</Text> : null}
          {cumple.comprado ? (
            <View style={styles.compradoPill}>
              <Text style={styles.compradoTxt}>✓ Regalo comprado</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rowRight}>
          <View style={[styles.diasPill, { backgroundColor: bl.bg }]}>
            <Text style={[styles.diasTxt, { color: bl.c }]}>{bl.l}</Text>
          </View>
          {isAlumno && fest ? (
            <Pressable onPress={() => setFestejoDetalle(fest)} style={styles.miniFest}>
              <Text style={styles.miniFestTxt}>
                🎉 {new Date(fest.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
              </Text>
            </Pressable>
          ) : null}
          {isAlumno && !fest && esMiHijo ? (
            <Pressable
              onPress={() => setFestejoModal({ alumnoId: a.rawId, alumnoNombre: a.nombre, cursoId: a.curso_id })}
              style={styles.miniCrear}
            >
              <Text style={styles.miniCrearTxt}>+ Festejo</Text>
            </Pressable>
          ) : null}
          {isAdmin ? (
            <View style={styles.adminBtns}>
              <Pressable onPress={() => setEditando(a)} style={styles.miniAdmin}>
                <Text style={styles.miniAdminTxt}>🎁 Regalo</Text>
              </Pressable>
              {a.tipo === "Maestro" ? (
                <Pressable
                  onPress={() => setColectaRegaloModal({ maestroNombre: a.nombre, maestroId: a.rawId, cursoId: a.curso_id })}
                  style={styles.miniColecta}
                >
                  <Text style={styles.miniColectaTxt}>+ Colecta</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={ctrl.items}
        keyExtractor={(a) => a.id}
        renderItem={renderItem}
        ListHeaderComponent={Header}
        ListFooterComponent={
          lista.length > 20 ? (
            <Paginador pagina={ctrl.pagina} totalPag={ctrl.totalPag} setPagina={ctrl.setPagina} />
          ) : null
        }
        ListEmptyComponent={<Text style={styles.muted}>Sin cumpleaños cargados</Text>}
        contentContainerStyle={styles.content}
      />

      {editando ? (
        <ResponsableModal
          cumple={{
            ...editando,
            responsable_id: cumpleMap[editando.id]?._responsable_hijo?.id || null,
            comprado: cumpleMap[editando.id]?.comprado || false,
          }}
          alumnos={lista}
          onClose={() => setEditando(null)}
          onSave={guardarResponsable}
        />
      ) : null}
      {festejoModal ? (
        <FestejoModal
          alumnoId={festejoModal.alumnoId}
          alumnoNombre={festejoModal.alumnoNombre}
          cursoId={festejoModal.cursoId ?? cursoId}
          userId={userId}
          festejoExistente={festejoModal.festejo}
          onClose={() => setFestejoModal(null)}
          onSave={() => {
            setFestejoModal(null);
            cargar();
          }}
        />
      ) : null}
      {festejoDetalle ? (
        <FestejoDetalleModal
          evento={festejoDetalle}
          userId={userId}
          misHijos={misHijosUniq}
          onClose={() => setFestejoDetalle(null)}
          onUpdate={cargar}
        />
      ) : null}
      {colectaRegaloModal ? (
        <ColectaRegaloModal
          maestroNombre={colectaRegaloModal.maestroNombre}
          montoDefault={montoRegalo}
          monedaDefault={monedaRegalo}
          usuarios={apoderados}
          onClose={() => setColectaRegaloModal(null)}
          onSave={crearColectaRegalo}
        />
      ) : null}
    </View>
  );
}

// ── ResponsableModal ──────────────────────────────────────────────────────────
export function ResponsableModal({ cumple, alumnos, onClose, onSave }) {
  const [responsableId, setResponsableId] = useState(cumple?.responsable_id || null);
  const [comprado, setComprado] = useState(cumple?.comprado || false);
  const companeros = alumnos.filter((a) => a.tipo === "Alumno" && a.rawId !== cumple.rawId);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
            <Text style={styles.modalTitle}>🎁 Regalo de {cumple.nombre}</Text>
            <Text style={styles.modalSub}>🎂 {fmtDiaMes(cumple.fecha_nacimiento)}</Text>

            <Text style={styles.label}>¿QUIÉN REGALA?</Text>
            <Pressable
              onPress={() => setResponsableId(null)}
              style={[styles.optRow, !responsableId && styles.optRowSel]}
            >
              <Text style={styles.optTxt}>Sin asignar</Text>
            </Pressable>
            {companeros.map((a) => {
              const sel = responsableId === a.rawId;
              return (
                <Pressable
                  key={a.rawId}
                  onPress={() => setResponsableId(a.rawId)}
                  style={[styles.optRow, sel && { borderColor: a.color || T.accent, backgroundColor: t.accentSoft }]}
                >
                  <Text style={[styles.optTxt, sel && { fontWeight: "700" }]}>{a.nombre}</Text>
                  {sel ? <Text style={{ color: a.color || T.accent, fontWeight: "700" }}>✓</Text> : null}
                </Pressable>
              );
            })}

            <Text style={styles.label}>ESTADO DEL REGALO</Text>
            <Pressable
              onPress={() => setComprado((p) => !p)}
              style={[styles.togglePill, comprado && styles.togglePillOn]}
            >
              <Text style={[styles.toggleTxt, comprado && { color: "#10B981" }]}>
                {comprado ? "Comprado" : "Pendiente"}
              </Text>
            </Pressable>

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave({ responsable_id: responsableId, comprado })}
                style={styles.saveBtn}
              >
                <Text style={styles.saveTxt}>Guardar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── FestejoModal ────────────────────────────────────────────────────────────────
export function FestejoModal({ alumnoId, alumnoNombre, cursoId, userId, festejoExistente, onClose, onSave }) {
  const [form, setForm] = useState({
    titulo: festejoExistente?.titulo || `🎉 Festejo de ${alumnoNombre}`,
    fecha: festejoExistente?.fecha || "",
    hora: festejoExistente?.hora || "",
    hora_fin: festejoExistente?.hora_fin || "",
    lugar: festejoExistente?.lugar || "",
    url_ubicacion: festejoExistente?.url_ubicacion || "",
    descripcion: festejoExistente?.descripcion || "",
    imagen_url: festejoExistente?.imagen_url || "",
  });
  const [alumnos, setAlumnos] = useState([]);
  const [invitados, setInvitados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgError, setImgError] = useState("");

  useEffect(() => {
    supabase
      .from("hijos")
      .select("id,nombre,apellido,color")
      .eq("curso_id", cursoId)
      .order("nombre")
      .then((r) => setAlumnos(r.data || []));
    if (festejoExistente?.id) {
      supabase
        .from("evento_asistencia")
        .select("alumno_invitado_id")
        .eq("evento_id", festejoExistente.id)
        .then((r) =>
          setInvitados(
            (r.data || [])
              .map((x) => x.alumno_invitado_id)
              .filter(Boolean)
              .filter((id) => id !== alumnoId)
          )
        );
    }
  }, [cursoId, alumnoId, festejoExistente?.id]);

  const toggleAlumno = (id) =>
    setInvitados((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const invitarTodos = () => setInvitados(alumnos.filter((a) => a.id !== alumnoId).map((a) => a.id));

  const elegirImagen = async () => {
    setImgError("");
    setImgUploading(true);
    try {
      const res = await pickAndUploadImage({
        bucket: "eventos",
        pathPrefix: `festejos/${cursoId}_${alumnoId}_`,
      });
      if (res?.url) setForm((p) => ({ ...p, imagen_url: res.url }));
    } catch (e) {
      setImgError(e.message || "No se pudo subir la imagen");
    }
    setImgUploading(false);
  };

  const guardar = async () => {
    if (!form.fecha || !form.titulo) return;
    setGuardando(true);
    const payload = { ...form, tipo: "festejo", alumno_id: alumnoId, curso_id: cursoId, creado_por: userId };
    let eventoId = festejoExistente?.id;
    if (eventoId) {
      await supabase.from("eventos").update(payload).eq("id", eventoId);
    } else {
      const { data, error } = await supabase.from("eventos").insert(payload).select("id").single();
      if (error || !data?.id) {
        setGuardando(false);
        return;
      }
      eventoId = data.id;
    }

    const { data: existentes } = await supabase
      .from("evento_asistencia")
      .select("id, alumno_invitado_id")
      .eq("evento_id", eventoId);
    const existentesSet = new Set((existentes || []).map((r) => r.alumno_invitado_id));
    const invitadosSet = new Set(invitados);
    const nuevos = invitados.filter((hid) => !existentesSet.has(hid));
    if (nuevos.length) {
      await supabase.from("evento_asistencia").insert(
        nuevos.map((hid) => ({
          evento_id: eventoId,
          usuario_id: userId,
          alumno_invitado_id: hid,
          asiste: "pendiente",
        }))
      );
    }
    const quitados = (existentes || [])
      .filter((r) => !invitadosSet.has(r.alumno_invitado_id))
      .map((r) => r.id);
    if (quitados.length) await supabase.from("evento_asistencia").delete().in("id", quitados);

    if (!festejoExistente) {
      const invitadosUserIds = await Promise.all(
        invitados.map((hid) => supabase.from("usuario_hijos").select("usuario_id").eq("hijo_id", hid))
      );
      const userIds = [
        ...new Set(invitadosUserIds.flatMap((r) => (r.data || []).map((v) => v.usuario_id))),
      ];
      if (userIds.length) await sendPush({ type: "festejo", payload: { titulo: form.titulo, userIds } });
    }
    setGuardando(false);
    onSave();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>🎉 {festejoExistente ? "Editar festejo" : "Nuevo festejo"}</Text>
            <Text style={styles.modalSub}>Festejo de {alumnoNombre}</Text>

            {[
              { l: "Título", k: "titulo", ph: `Festejo de ${alumnoNombre}` },
              { l: "Fecha", k: "fecha", ph: "Elegir fecha" },
              { l: "Lugar", k: "lugar", ph: "Ej: Salón de eventos, casa…" },
              { l: "URL ubicación", k: "url_ubicacion", ph: "https://maps.google.com/..." },
              { l: "Descripción", k: "descripcion", ph: "Info para los invitados" },
            ].map((f) => (
              <View key={f.k}>
                <Text style={styles.label}>{f.l.toUpperCase()}</Text>
                {f.k === "fecha" ? (
                  <DateField
                    value={form.fecha}
                    onChange={(v) => setForm((p) => ({ ...p, fecha: v }))}
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
              </View>
            ))}

            <Text style={styles.label}>HORA</Text>
            <View style={styles.horaRow}>
              <TextInput
                value={form.hora}
                onChangeText={(t) => setForm((p) => ({ ...p, hora: t }))}
                placeholder="14:00"
                placeholderTextColor="#94A3B8"
                style={[styles.input, styles.horaInput]}
              />
              <Text style={styles.muted}>a</Text>
              <TextInput
                value={form.hora_fin}
                onChangeText={(t) => setForm((p) => ({ ...p, hora_fin: t }))}
                placeholder="17:00"
                placeholderTextColor="#94A3B8"
                style={[styles.input, styles.horaInput]}
              />
            </View>

            <Text style={styles.label}>IMAGEN DE INVITACIÓN</Text>
            {form.imagen_url ? (
              <View style={styles.imgWrap}>
                <Image source={{ uri: form.imagen_url }} style={styles.imgPreview} resizeMode="contain" />
                <Pressable onPress={() => setForm((p) => ({ ...p, imagen_url: "" }))} style={styles.imgRemove}>
                  <Text style={styles.imgRemoveTxt}>✕</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable onPress={elegirImagen} disabled={imgUploading} style={styles.imgPick}>
              <Text style={styles.imgPickEmoji}>🖼️</Text>
              <Text style={styles.imgPickTxt}>
                {imgUploading ? "Subiendo..." : form.imagen_url ? "Cambiar imagen" : "Subir imagen"}
              </Text>
            </Pressable>
            {imgError ? <Text style={styles.errorTxt}>{imgError}</Text> : null}

            <View style={styles.invHeader}>
              <Text style={styles.label}>INVITADOS ({invitados.length})</Text>
              <Pressable onPress={invitarTodos}>
                <Text style={styles.invTodos}>Invitar a todo el curso</Text>
              </Pressable>
            </View>
            {alumnos
              .filter((a) => a.id !== alumnoId)
              .map((a) => {
                const sel = invitados.includes(a.id);
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => toggleAlumno(a.id)}
                    style={[styles.optRow, sel && { borderColor: a.color || T.accent, backgroundColor: t.accentSoft }]}
                  >
                    <Text style={[styles.optTxt, sel && { fontWeight: "700" }]}>{fmtNombre(a)}</Text>
                    {sel ? <Text style={{ color: a.color || T.accent, fontWeight: "700" }}>✓</Text> : null}
                  </Pressable>
                );
              })}

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={guardar} disabled={guardando || imgUploading} style={styles.saveBtn}>
                <Text style={styles.saveTxt}>{guardando ? "Guardando..." : "Publicar festejo"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── FestejoDetalleModal ─────────────────────────────────────────────────────────
const ESTADO_LABEL = { si: "Confirma", no: "No va", pendiente: "Pendiente" };

export function FestejoDetalleModal({ evento, userId, misHijos = [], onClose, onUpdate }) {
  const [asistencia, setAsistencia] = useState([]);
  const [alumnos, setAlumnos] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [comentarios, setComentarios] = useState({});
  const [hermanos, setHermanos] = useState({});
  const [adultos, setAdultos] = useState({});
  const [exportMsg, setExportMsg] = useState("");

  const cargarDatos = useCallback(async () => {
    const { data: asist } = await supabase.from("evento_asistencia").select("*").eq("evento_id", evento.id);
    const rows = asist || [];
    const aids = [...new Set(rows.map((r) => r.alumno_invitado_id).filter(Boolean))];
    const alumnosMap = {};
    if (aids.length) {
      const { data: als } = await supabase.from("hijos").select("id,nombre,apellido").in("id", aids);
      (als || []).forEach((a) => {
        alumnosMap[a.id] = a;
      });
    }
    setAlumnos(alumnosMap);
    setAsistencia(rows);
    const coms = {}, herm = {}, adul = {};
    rows.forEach((r) => {
      if (misHijos.includes(r.alumno_invitado_id)) {
        coms[r.alumno_invitado_id] = r.comentario || "";
        herm[r.alumno_invitado_id] = Number(r.hermanos) || 0;
        adul[r.alumno_invitado_id] = Number(r.adultos) || 0;
      }
    });
    setComentarios(coms);
    setHermanos(herm);
    setAdultos(adul);
  }, [evento.id, misHijos]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const responder = async (alumnoId, asiste) => {
    setAsistencia((prev) => prev.map((r) => (r.alumno_invitado_id === alumnoId ? { ...r, asiste } : r)));
    await supabase
      .from("evento_asistencia")
      .update({
        asiste,
        comentario: comentarios[alumnoId] || null,
        hermanos: hermanos[alumnoId] ?? 0,
        adultos: adultos[alumnoId] ?? 0,
      })
      .eq("evento_id", evento.id)
      .eq("alumno_invitado_id", alumnoId);
    onUpdate?.();
  };

  const guardarExtras = async (alumnoId) => {
    setGuardando(true);
    await supabase
      .from("evento_asistencia")
      .update({
        comentario: comentarios[alumnoId] || null,
        hermanos: hermanos[alumnoId] ?? 0,
        adultos: adultos[alumnoId] ?? 0,
      })
      .eq("evento_id", evento.id)
      .eq("alumno_invitado_id", alumnoId);
    await cargarDatos();
    setGuardando(false);
    onClose();
  };

  const setNumero = (setter, alumnoId, val) => {
    const n = Math.max(0, parseInt(val, 10) || 0);
    setter((p) => ({ ...p, [alumnoId]: n }));
  };

  const dedupAsistencia = (rows) => {
    const PRIO = { si: 2, no: 1, pendiente: 0 };
    const map = {};
    rows.forEach((r) => {
      const k = r.alumno_invitado_id;
      if (!k) return;
      if (!map[k] || (PRIO[r.asiste] || 0) > (PRIO[map[k].asiste] || 0)) map[k] = r;
    });
    return Object.values(map);
  };
  const asistenciaDedup = dedupAsistencia(asistencia).filter((a) => a.alumno_invitado_id !== evento.alumno_id);
  const confirmados = asistenciaDedup.filter((a) => a.asiste === "si");
  const noVan = asistenciaDedup.filter((a) => a.asiste === "no");
  const pendientes = asistenciaDedup.filter((a) => a.asiste === "pendiente" || !a.asiste);
  const totalHermanos = confirmados.reduce((s, a) => s + (Number(a.hermanos) || 0), 0);
  const totalAdultos = confirmados.reduce((s, a) => s + (Number(a.adultos) || 0), 0);

  const exportar = async () => {
    setExportMsg("");
    const ORDEN = { Confirma: 0, Pendiente: 1, "No va": 2 };
    const rows = asistenciaDedup
      .map((a) => {
        const al = alumnos[a.alumno_invitado_id];
        return {
          Alumno: al ? `${al.nombre} ${al.apellido || ""}`.trim() : "--",
          Asistencia: ESTADO_LABEL[a.asiste] || "Pendiente",
          Hermanos: Number(a.hermanos) || 0,
          Adultos: Number(a.adultos) || 0,
          Comentario: a.comentario || "",
        };
      })
      .sort((a, b) => (ORDEN[a.Asistencia] || 0) - (ORDEN[b.Asistencia] || 0));
    rows.push({});
    rows.push({
      Alumno: "TOTAL CONFIRMADOS",
      Asistencia: confirmados.length,
      Hermanos: totalHermanos,
      Adultos: totalAdultos,
      Comentario: "",
    });
    try {
      await exportRowsToExcel({
        rows,
        cols: [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 }],
        nombreHoja: "Asistencia",
        fileName: `${evento.titulo || "Festejo"} - asistencia`,
      });
    } catch (e) {
      setExportMsg(e.message || "No se pudo exportar");
    }
  };

  const grupos = [
    { list: confirmados, label: "Confirman", color: "#10B981", bg: "#F0FDF4" },
    { list: pendientes, label: "Pendiente", color: "#F59E0B", bg: "#FFFBEB" },
    { list: noVan, label: "No van", color: "#EF4444", bg: "#FEF2F2" },
  ];
  const misHijosInvitados = misHijos.filter(
    (hid) => hid !== evento.alumno_id && asistencia.some((a) => a.alumno_invitado_id === hid)
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <View style={styles.pagosHeader}>
            <View style={styles.flex1}>
              <Text style={styles.modalTitle}>{evento.titulo}</Text>
              <Text style={styles.modalSub}>
                {new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
                {evento.hora ? ` · ${evento.hora}${evento.hora_fin ? ` – ${evento.hora_fin}` : ""}` : ""}
              </Text>
              {evento.lugar ? (
                <Text style={styles.modalSub}>
                  📍 {evento.lugar}
                  {evento.url_ubicacion && safeUrl(evento.url_ubicacion) ? (
                    <Text style={styles.link} onPress={() => Linking.openURL(safeUrl(evento.url_ubicacion))}>
                      {"  "}Ver mapa
                    </Text>
                  ) : null}
                </Text>
              ) : null}
              {evento.descripcion ? <Text style={styles.modalSub}>{evento.descripcion}</Text> : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {evento.imagen_url ? (
              <Image source={{ uri: evento.imagen_url }} style={styles.detalleImg} resizeMode="contain" />
            ) : null}

            {misHijosInvitados.map((hid) => {
              const fila = asistencia.find((a) => a.alumno_invitado_id === hid);
              const al = alumnos[hid];
              const miAsiste = fila?.asiste;
              const hVal = hermanos[hid] ?? 0;
              const aVal = adultos[hid] ?? 0;
              return (
                <View key={hid} style={styles.miHijoCard}>
                  <Text style={styles.label}>{al ? `${al.nombre} ${al.apellido}` : "Tu hijo/a"}</Text>
                  <View style={styles.vozRow}>
                    <Pressable onPress={() => responder(hid, "si")} style={[styles.vozBtn, miAsiste === "si" && styles.vozSi]}>
                      <Text style={[styles.vozTxt, miAsiste === "si" && { color: "#10B981" }]}>Sí va</Text>
                    </Pressable>
                    <Pressable onPress={() => responder(hid, "no")} style={[styles.vozBtn, miAsiste === "no" && styles.vozNo]}>
                      <Text style={[styles.vozTxt, miAsiste === "no" && { color: "#EF4444" }]}>No va</Text>
                    </Pressable>
                  </View>
                  <View style={styles.contadores}>
                    {[
                      { l: "Hermanos", val: hVal, setter: setHermanos },
                      { l: "Adultos", val: aVal, setter: setAdultos },
                    ].map((c) => (
                      <View key={c.l}>
                        <Text style={styles.contLabel}>{c.l}</Text>
                        <View style={styles.stepperRow}>
                          <Pressable onPress={() => setNumero(c.setter, hid, c.val - 1)} style={styles.stepBtn}>
                            <Text style={styles.stepTxt}>−</Text>
                          </Pressable>
                          <Text style={styles.stepVal}>{c.val}</Text>
                          <Pressable onPress={() => setNumero(c.setter, hid, c.val + 1)} style={styles.stepBtn}>
                            <Text style={styles.stepTxt}>+</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.contLabel}>Comentario</Text>
                  <TextInput
                    value={comentarios[hid] || ""}
                    onChangeText={(t) => setComentarios((p) => ({ ...p, [hid]: t }))}
                    placeholder="Alergias, restricciones, etc."
                    placeholderTextColor="#94A3B8"
                    style={styles.input}
                  />
                  <Pressable onPress={() => guardarExtras(hid)} disabled={guardando} style={styles.saveBtnFull}>
                    <Text style={styles.saveTxt}>{guardando ? "Guardando..." : "Guardar"}</Text>
                  </Pressable>
                </View>
              );
            })}

            {confirmados.length > 0 ? (
              <View style={styles.totalesRow}>
                {[
                  { l: "Alumnos", v: confirmados.length, c: "#3B82F6", bg: "#EFF6FF" },
                  { l: "Hermanos", v: totalHermanos, c: "#8B5CF6", bg: "#F5F3FF" },
                  { l: "Adultos", v: totalAdultos, c: "#F59E0B", bg: "#FFFBEB" },
                ].map((t) => (
                  <View key={t.l} style={[styles.totalCard, { backgroundColor: t.bg }]}>
                    <Text style={[styles.totalNum, { color: t.c }]}>{t.v}</Text>
                    <Text style={[styles.totalLbl, { color: t.c }]}>{t.l}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.invHeader}>
              <Text style={styles.label}>LISTA DE ASISTENCIA</Text>
              {asistenciaDedup.length > 0 ? (
                <Pressable onPress={exportar} style={styles.exportBtn}>
                  <Text style={styles.exportTxt}>📥 Exportar Excel</Text>
                </Pressable>
              ) : null}
            </View>
            {exportMsg ? <Text style={styles.errorTxt}>{exportMsg}</Text> : null}
            {asistencia.length === 0 ? <Text style={styles.muted}>Sin respuestas aún</Text> : null}
            {grupos.map(({ list, label, color, bg }) =>
              list.length > 0 ? (
                <View key={label} style={styles.grupoResumen}>
                  <Text style={[styles.grupoLabel, { color }]}>
                    {label} ({list.length})
                  </Text>
                  {list.map((a, i) => {
                    const al = alumnos[a.alumno_invitado_id];
                    return (
                      <View key={`${a.alumno_invitado_id}-${i}`} style={[styles.resumenRow, { backgroundColor: bg }]}>
                        <Text style={styles.resumenNombre}>{al ? `${al.nombre} ${al.apellido}` : "--"}</Text>
                        <View style={styles.resumenExtras}>
                          {(Number(a.hermanos) || 0) > 0 ? (
                            <Text style={[styles.resumenExtra, { color: "#8B5CF6" }]}>{a.hermanos} herm.</Text>
                          ) : null}
                          {(Number(a.adultos) || 0) > 0 ? (
                            <Text style={[styles.resumenExtra, { color: "#F59E0B" }]}>{a.adultos} adultos</Text>
                          ) : null}
                          {a.comentario ? <Text style={styles.resumenComent}>{a.comentario}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── ColectaRegaloModal ──────────────────────────────────────────────────────────
export function ColectaRegaloModal({ maestroNombre, montoDefault, monedaDefault = "$", usuarios = [], onClose, onSave }) {
  const [titulo, setTitulo] = useState(`Regalo cumpleaños ${maestroNombre}`);
  const [monto, setMonto] = useState(montoDefault ? String(montoDefault) : "");
  const [moneda, setMoneda] = useState(monedaDefault || "$");
  const [fechaLimite, setFechaLimite] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!titulo.trim()) return;
    setSaving(true);
    await onSave({
      maestroNombre,
      titulo,
      monto,
      moneda,
      fecha_limite: fechaLimite || null,
      responsable_id: responsableId ? Number(responsableId) : null,
    });
    setSaving(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.modalCard}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>🎁 Colecta regalo</Text>
            <Text style={styles.modalSub}>Cumpleaños de {maestroNombre}</Text>

            <Text style={styles.label}>TÍTULO</Text>
            <TextInput value={titulo} onChangeText={setTitulo} style={styles.input} placeholderTextColor="#94A3B8" />

            <Text style={styles.label}>MONTO SUGERIDO</Text>
            <View style={styles.horaRow}>
              {["$", "USD"].map((m) => (
                <Pressable key={m} onPress={() => setMoneda(m)} style={[styles.monedaBtn, moneda === m && styles.monedaBtnOn]}>
                  <Text style={[styles.monedaTxt, moneda === m && { color: T.accent }]}>{m}</Text>
                </Pressable>
              ))}
              <TextInput
                value={monto}
                onChangeText={setMonto}
                placeholder="Ej: 5000"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                style={[styles.input, styles.flex1]}
              />
            </View>

            <Text style={styles.label}>RESPONSABLE</Text>
            <Pressable onPress={() => setResponsableId("")} style={[styles.optRow, !responsableId && styles.optRowSel]}>
              <Text style={styles.optTxt}>Sin asignar</Text>
            </Pressable>
            {usuarios.map((u) => {
              const sel = responsableId === String(u.id);
              return (
                <Pressable
                  key={u.id}
                  onPress={() => setResponsableId(String(u.id))}
                  style={[styles.optRow, sel && styles.optRowSel]}
                >
                  <Text style={[styles.optTxt, sel && { fontWeight: "700" }]}>
                    {u.nombre} {u.apellido || ""}
                  </Text>
                  {sel ? <Text style={{ color: T.accent, fontWeight: "700" }}>✓</Text> : null}
                </Pressable>
              );
            })}

            <Text style={styles.label}>FECHA LÍMITE</Text>
            <DateField value={fechaLimite} onChange={setFechaLimite} style={styles.input} />

            <View style={styles.modalBtns}>
              <Pressable onPress={onClose} style={styles.cancelBtn}>
                <Text style={styles.cancelTxt}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={guardar} disabled={saving} style={[styles.saveBtn, { backgroundColor: "#10B981" }]}>
                <Text style={styles.saveTxt}>{saving ? "Creando..." : "Crear colecta"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Estilos A3: sin sombras, borde hairline, radio 16, countdown por urgencia.
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 4, marginBottom: 4 },
  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.lg, marginBottom: SPACE.sm },
  mesHeader: { ...TYPE.label, color: t.textFaint, textTransform: "capitalize", marginTop: SPACE.lg, marginBottom: SPACE.xs },
  montoPill: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 11 },
  montoTxt: { fontSize: 11, fontWeight: "700", color: t.textMuted },
  muted: { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: SPACE.lg },

  banner: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderLeftWidth: 3,
    borderRadius: RADIUS.xl,
    padding: 13,
    marginBottom: SPACE.sm,
  },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  bannerNombre: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  bannerFecha: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  bannerBtns: { flexDirection: "row", gap: SPACE.sm, marginTop: SPACE.md, paddingLeft: 50 },
  verFestBtn: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  verFestTxt: { color: t.onAccent, fontSize: 12.5, fontWeight: "800" },
  editFestBtn: { borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, borderRadius: RADIUS.md, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
  editFestTxt: { color: t.textMuted, fontSize: 12.5, fontWeight: "700" },

  // toolbar de una fila: búsqueda + selects colapsados
  toolRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginTop: SPACE.lg },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
  },
  searchInput: { flex: 1, fontSize: 13, color: t.text, paddingVertical: 0 },
  cnt: { fontSize: 11.5, color: t.textFaint, marginTop: 6, marginBottom: SPACE.sm },

  invSection: { marginBottom: 4 },
  invCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    padding: 13,
    marginBottom: SPACE.sm,
  },
  invTile: { width: 38, height: 38, borderRadius: RADIUS.md + 1, backgroundColor: t.warningSoft, alignItems: "center", justifyContent: "center" },
  invTileTxt: { fontSize: 18 },
  invNombre: { fontSize: 14.5, fontWeight: "700", color: t.textStrong },
  invMeta: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  estadoPill: { borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 9 },
  estadoTxt: { fontSize: 10.5, fontWeight: "800" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    padding: 13,
    marginBottom: SPACE.sm,
  },
  rowNombre: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, marginBottom: 2 },
  rowTags: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2, flexWrap: "wrap" },
  // Tag de hijo (vista "Todos"): dot del color de identidad + primer nombre
  tagHijo: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagTxt: { fontSize: 11, fontWeight: "700", color: t.textMuted },
  tipoTxt: { fontSize: 12, fontWeight: "600" },
  rowFecha: { fontSize: 12, color: t.textMuted },
  regala: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  compradoPill: { alignSelf: "flex-start", backgroundColor: t.successSoft, borderRadius: RADIUS.full, paddingVertical: 3, paddingHorizontal: 8, marginTop: 3 },
  compradoTxt: { fontSize: 10, fontWeight: "700", color: t.success },
  rowRight: { alignItems: "flex-end", gap: 5 },
  diasPill: { borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 9 },
  diasTxt: { fontSize: 11, fontWeight: "800", fontVariant: ["tabular-nums"] },
  miniFest: { borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 8 },
  miniFestTxt: { fontSize: 10.5, fontWeight: "700", color: "#B45309" },
  miniCrear: { backgroundColor: t.accentSoft, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 8 },
  miniCrearTxt: { fontSize: 11, fontWeight: "700", color: BLUE[600] },
  adminBtns: { flexDirection: "row", gap: 4 },
  miniAdmin: { borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 8 },
  miniAdminTxt: { fontSize: 10, color: t.textMuted, fontWeight: "600" },
  miniColecta: { backgroundColor: t.accentSoft, borderRadius: RADIUS.sm, paddingVertical: 4, paddingHorizontal: 8 },
  miniColectaTxt: { fontSize: 10, color: BLUE[600], fontWeight: "700" },

  // Modales
  overlay: { flex: 1, backgroundColor: t.overlay, justifyContent: "center", padding: SPACE.lg },
  modalCard: { backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xl, maxHeight: "88%" },
  modalTitle: { fontSize: 17, fontWeight: "800", color: t.textStrong, marginBottom: 4 },
  modalSub: { fontSize: 12, color: t.textFaint, marginBottom: 8 },
  input: { minHeight: 44, borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 8, fontSize: 13, color: t.text, backgroundColor: t.surfaceSunken },
  horaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  horaInput: { flex: 1 },
  optRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, paddingVertical: 8, marginBottom: 6, backgroundColor: t.surface },
  optRowSel: { borderColor: t.accent, backgroundColor: t.accentSoft },
  optTxt: { fontSize: 13, color: t.text, flex: 1 },
  togglePill: { alignSelf: "flex-start", borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.full, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: t.surface },
  togglePillOn: { borderColor: t.success, backgroundColor: t.successSoft },
  toggleTxt: { fontSize: 12, fontWeight: "700", color: t.textFaint },
  monedaBtn: { borderWidth: 1.5, borderColor: t.borderStrong, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 14, minHeight: 44, justifyContent: "center", backgroundColor: t.surface },
  monedaBtnOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  monedaTxt: { fontSize: 13, fontWeight: "700", color: t.textFaint },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  cancelTxt: { fontSize: 13, fontWeight: "600", color: t.textFaint },
  saveBtn: { flex: 2, minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  saveBtnFull: { minHeight: 44, borderRadius: RADIUS.md, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", marginTop: 10 },
  saveTxt: { fontSize: 14, fontWeight: "700", color: t.onAccent },
  errorTxt: { fontSize: 12, color: t.danger, marginTop: 6 },

  imgWrap: { marginBottom: 8 },
  imgPreview: { width: "100%", height: 180, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong },
  imgRemove: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: RADIUS.full, backgroundColor: t.danger, alignItems: "center", justifyContent: "center" },
  imgRemoveTxt: { color: t.textInverse, fontSize: 13, fontWeight: "900" },
  imgPick: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: t.borderStrong, backgroundColor: t.surfaceSunken, borderRadius: RADIUS.md, paddingVertical: SPACE.md, paddingHorizontal: 14 },
  imgPickEmoji: { fontSize: 18 },
  imgPickTxt: { fontSize: 13, fontWeight: "600", color: BLUE[600] },

  invHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  invTodos: { fontSize: 11, fontWeight: "700", color: BLUE[600] },

  pagosHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 8 },
  closeTxt: { fontSize: 18, color: t.textFaint },
  link: { color: BLUE[600], fontWeight: "700" },
  detalleImg: { width: "100%", height: 180, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: t.borderStrong, marginBottom: SPACE.md },

  miHijoCard: { backgroundColor: t.surfaceSunken, borderRadius: RADIUS.lg, padding: 14, marginBottom: SPACE.md },
  vozRow: { flexDirection: "row", gap: 8, marginBottom: SPACE.md },
  vozBtn: { flex: 1, minHeight: 40, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  vozSi: { borderColor: t.success, backgroundColor: t.successSoft },
  vozNo: { borderColor: t.danger, backgroundColor: t.dangerSoft },
  vozTxt: { fontSize: 13, fontWeight: "700", color: t.textFaint },
  contadores: { flexDirection: "row", gap: SPACE.lg, marginBottom: SPACE.md },
  contLabel: { fontSize: 11, fontWeight: "700", color: t.textFaint, marginBottom: 6 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  stepTxt: { fontSize: 18, fontWeight: "700", color: t.textMuted },
  stepVal: { fontSize: 14, fontWeight: "700", color: t.text, minWidth: 28, textAlign: "center", fontVariant: ["tabular-nums"] },

  totalesRow: { flexDirection: "row", gap: 8, marginTop: SPACE.md, marginBottom: 6 },
  totalCard: { flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, alignItems: "center" },
  totalNum: { fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  totalLbl: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  exportBtn: { borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, borderRadius: RADIUS.sm, paddingVertical: 5, paddingHorizontal: 10 },
  exportTxt: { fontSize: 11, fontWeight: "700", color: t.success },
  grupoResumen: { marginBottom: 10 },
  grupoLabel: { fontSize: 11, fontWeight: "700", marginBottom: 5 },
  resumenRow: { borderRadius: RADIUS.md, padding: 8, marginBottom: 5 },
  resumenNombre: { fontSize: 13, fontWeight: "600", color: t.text },
  resumenExtras: { flexDirection: "row", gap: 10, marginTop: 3, flexWrap: "wrap" },
  resumenExtra: { fontSize: 11, fontWeight: "600" },
  resumenComent: { fontSize: 11, color: t.textFaint },
});
