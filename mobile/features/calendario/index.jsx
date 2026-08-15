// Calendario (puerto RN de src/features/calendario). Vistas Mes / Próximos /
// Horario. eventos + cumpleaños (virtuales). Admin crea/edita eventos
// (EventoModal) y se puede pedir confirmación de asistencia (EventoAsistenciaModal).
// Deep-link: openFecha selecciona el día en la vista Mes. Los festejos se
// gestionan en Cumpleaños (no se abre su modal acá).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Modal, Linking, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { fmtNombre, safeUrl } from "@shared/helpers";
import { MESES, T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { supabase } from "../../lib/supabase";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { DateField } from "../../components/DateField";

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

export function Calendario({ openFecha = null, onClearOpenFecha }) {
  const { cursoId, usuario, isAdmin, misHijos = [] } = useSession();
  const userId = usuario?.id ?? null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const [vista, setVista] = useState("mes");
  const [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [eventos, setEventos] = useState([]);
  const [cumples, setCumples] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [diaSelec, setDiaSelec] = useState(null);
  const [modal, setModal] = useState(null); // "nuevo" | evento
  const [confirm, setConfirm] = useState(null);
  const [eventoDetalle, setEventoDetalle] = useState(null);
  const [filtroRango, setFiltroRango] = useState("90");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const [ev, al, ma, hor] = await Promise.all([
      supabase.from("eventos").select("*").eq("curso_id", cursoId).order("fecha"),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id", cursoId),
      supabase
        .from("maestros")
        .select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)")
        .eq("maestro_cursos.curso_id", cursoId),
      supabase.from("horarios").select("*").eq("curso_id", cursoId).order("hora_inicio"),
    ]);
    setEventos(ev.data || []);
    setHorarios(hor.data || []);
    setCumples([
      ...(al.data || [])
        .filter((a) => a.fecha_nacimiento)
        .map((a) => ({ id: `c-a-${a.id}`, tipo: "cumple", nombre: fmtNombre(a), fecha_nacimiento: a.fecha_nacimiento })),
      ...(ma.data || [])
        .filter((m) => m.fecha_nacimiento)
        .map((m) => ({ id: `c-m-${m.id}`, tipo: "cumple", nombre: m.nombre, fecha_nacimiento: m.fecha_nacimiento })),
    ]);
  }, [cursoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!openFecha) return;
    const d = new Date(openFecha + "T00:00:00");
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    setDiaSelec({ year: d.getFullYear(), month: d.getMonth(), day: d.getDate() });
    setVista("mes");
    onClearOpenFecha?.();
  }, [openFecha, onClearOpenFecha]);

  const eliminar = async (id) => {
    await supabase.from("eventos").delete().eq("id", id);
    setConfirm(null);
    cargar();
  };

  const eventosDelDia = (year, month, day) => {
    const fecha = `${year}-${pad(month + 1)}-${pad(day)}`;
    const reales = eventos.filter((e) => e.fecha === fecha);
    const bday = cumples
      .filter((c) => {
        const d = new Date(c.fecha_nacimiento + "T00:00:00");
        return d.getMonth() === month && d.getDate() === day;
      })
      .map((c) => ({ ...c, titulo: c.nombre, fecha }));
    return [...reales, ...bday];
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
        const d = new Date(e.fecha + "T00:00:00");
        return d >= desde && d <= hasta;
      })
      .map((e) => ({ ...e, _fecha: new Date(e.fecha + "T00:00:00") }));
    const bday = cumples
      .map((c) => {
        const d = new Date(c.fecha_nacimiento + "T00:00:00");
        let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
        if (next < desde) next = new Date(hoy.getFullYear() + 1, d.getMonth(), d.getDate());
        if (next < desde || next > hasta) return null;
        return { ...c, titulo: c.nombre, fecha: next.toISOString().slice(0, 10), _fecha: next, tipo: "cumple" };
      })
      .filter(Boolean);
    const todos = [...reales, ...bday].sort((a, b) => a._fecha - b._fecha);
    return filtroTipo === "todos" ? todos : todos.filter((e) => e.tipo === filtroTipo);
  };

  const evDiaSelec = diaSelec ? eventosDelDia(diaSelec.year, diaSelec.month, diaSelec.day) : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Calendario</Text>
        {isAdmin ? (
          <Pressable onPress={() => setModal("nuevo")} style={styles.addBtn}>
            <Text style={styles.addTxt}>+ Evento</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.subtitle}>Clases, eventos y cumpleaños</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {[
          { id: "mes", l: "📆 Mes" },
          { id: "lista", l: "📋 Próximos" },
          { id: "horario", l: "🕐 Horario" },
        ].map((t) => (
          <Pressable key={t.id} onPress={() => setVista(t.id)} style={[styles.tab, vista === t.id && styles.tabActive]}>
            <Text style={[styles.tabTxt, vista === t.id && styles.tabTxtActive]}>{t.l}</Text>
          </Pressable>
        ))}
      </ScrollView>

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
                {isAdmin ? (
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
                    isAdmin={isAdmin}
                    onAsistencia={() => setEventoDetalle(e)}
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangos}>
            {[
              { k: "7", l: "Esta semana" },
              { k: "30", l: "Este mes" },
              { k: "90", l: "Próx. 3 meses" },
            ].map((r) => (
              <Pressable
                key={r.k}
                onPress={() => setFiltroRango(r.k)}
                style={[styles.rangoChip, filtroRango === r.k && styles.rangoOn]}
              >
                <Text style={[styles.rangoTxt, filtroRango === r.k && styles.rangoTxtOn]}>{r.l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rangos}>
            <Pressable
              onPress={() => setFiltroTipo("todos")}
              style={[styles.rangoChip, filtroTipo === "todos" && styles.rangoOn]}
            >
              <Text style={[styles.rangoTxt, filtroTipo === "todos" && styles.rangoTxtOn]}>Todos</Text>
            </Pressable>
            {Object.entries(TIPO_CONFIG)
              .filter(([k]) => k !== "festejo")
              .map(([k, v]) => (
                <Pressable
                  key={k}
                  onPress={() => setFiltroTipo(k)}
                  style={[styles.rangoChip, filtroTipo === k && styles.rangoOn]}
                >
                  <Text style={[styles.rangoTxt, filtroTipo === k && styles.rangoTxtOn]}>{v.label}</Text>
                </Pressable>
              ))}
          </ScrollView>

          {listaEventos().length === 0 ? (
            <Text style={styles.muted}>No hay eventos para este filtro</Text>
          ) : null}
          {listaEventos().map((e, i) => {
            const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
            const d = new Date(e.fecha + "T00:00:00");
            const dias = Math.round((d - hoy) / 86400000);
            return (
              <Card key={e.id || i} style={[styles.listCard, { borderLeftColor: cfg.color }]}>
                <View style={styles.listRow}>
                  <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
                    <Text style={styles.iconTxt}>{cfg.emoji}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.eventoTitulo}>{e.titulo}</Text>
                    <Text style={styles.eventoMeta}>
                      {d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                      {e.hora && !e.todo_el_dia ? ` · ${e.hora}${e.hora_fin ? ` – ${e.hora_fin}` : ""}` : ""}
                    </Text>
                    {e.lugar ? (
                      <View style={styles.lugarRow}>
                        <Text style={styles.eventoMeta}>📍 {e.lugar}</Text>
                        {e.url_ubicacion ? (
                          <Pressable onPress={() => safeUrl(e.url_ubicacion) && Linking.openURL(safeUrl(e.url_ubicacion))}>
                            <Text style={styles.mapLink}>Ver mapa</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                    {e.descripcion ? <Text style={styles.eventoDesc}>{e.descripcion}</Text> : null}
                    <AdjuntosList adjuntos={e.adjuntos} />
                  </View>
                  <View style={styles.listRight}>
                    <View style={styles.diasTag}>
                      <Text style={styles.diasTagTxt}>
                        {dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `${dias}d`}
                      </Text>
                    </View>
                    {e.tipo !== "festejo" && e.confirma_asistencia ? (
                      <Pressable onPress={() => setEventoDetalle(e)} style={styles.asistBtn}>
                        <Text style={styles.asistTxt}>Asistencia</Text>
                      </Pressable>
                    ) : null}
                    {isAdmin && e.id && !String(e.id).startsWith("c-") && e.tipo !== "festejo" ? (
                      <View style={styles.editRow}>
                        <Pressable onPress={() => setModal(e)} style={styles.miniBtn}>
                          <Text style={styles.miniTxt}>✏️</Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirm(e)} style={styles.miniBtn}>
                          <Text style={[styles.miniTxt, { color: "#EF4444" }]}>🗑</Text>
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

      {vista === "horario" ? <HorarioView horarios={horarios} isAdmin={isAdmin} /> : null}

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
          misHijos={misHijos}
          userId={userId}
          isAdmin={isAdmin}
          onClose={() => setEventoDetalle(null)}
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

function EventoRow({ e, isAdmin, onAsistencia, onEditar, onEliminar }) {
  const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
  const editable = isAdmin && e.id && !String(e.id).startsWith("c-") && e.tipo !== "festejo";
  return (
    <View style={styles.diaRow}>
      <View style={[styles.iconBox, { backgroundColor: cfg.bg }]}>
        <Text style={styles.iconTxt}>{cfg.emoji}</Text>
      </View>
      <View style={styles.flex1}>
        <Text style={styles.eventoTitulo}>{e.titulo}</Text>
        <Text style={styles.eventoMeta}>
          {cfg.label}
          {e.hora && !e.todo_el_dia ? ` · ${e.hora}${e.hora_fin ? ` – ${e.hora_fin}` : ""}` : ""}
          {e.lugar ? ` · 📍${e.lugar}` : ""}
        </Text>
        {e.descripcion ? <Text style={styles.eventoDesc}>{e.descripcion}</Text> : null}
        <AdjuntosList adjuntos={e.adjuntos} />
      </View>
      {e.tipo !== "festejo" && e.confirma_asistencia ? (
        <Pressable onPress={onAsistencia} style={styles.asistBtn}>
          <Text style={styles.asistTxt}>Asistencia</Text>
        </Pressable>
      ) : null}
      {editable ? (
        <View style={styles.editRow}>
          <Pressable onPress={onEditar} style={styles.miniBtn}>
            <Text style={styles.miniTxt}>✏️</Text>
          </Pressable>
          <Pressable onPress={onEliminar} style={styles.miniBtn}>
            <Text style={[styles.miniTxt, { color: "#EF4444" }]}>🗑</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function HorarioView({ horarios, isAdmin }) {
  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  const DIA_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444"];
  const fmtHora = (t) => (t ? t.slice(0, 5) : "");
  const slots = [...new Set(horarios.map((h) => h.hora_inicio))].sort();

  if (horarios.length === 0) {
    return (
      <Text style={styles.muted}>
        {isAdmin ? "No hay horarios cargados. Agregá desde Admin → Horarios." : "No hay horarios cargados aún."}
      </Text>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.horarioScroll}>
      <View>
        <View style={styles.horarioHeaderRow}>
          <View style={styles.horaCol} />
          {DIAS.map((d, i) => (
            <View key={d} style={[styles.horarioDiaHead, { backgroundColor: DIA_COLORS[i] + "22" }]}>
              <Text style={[styles.horarioDiaTxt, { color: DIA_COLORS[i] }]}>{d.slice(0, 3).toUpperCase()}</Text>
            </View>
          ))}
        </View>
        {slots.map((slot) => (
          <View key={slot} style={styles.horarioRow}>
            <View style={styles.horaCol}>
              <Text style={styles.horaTxt}>{fmtHora(slot)}</Text>
            </View>
            {DIAS.map((dia, di) => {
              const clase = horarios.find((h) => h.dia === dia && h.hora_inicio === slot);
              const dc = DIA_COLORS[di];
              return (
                <View key={dia} style={styles.horarioCell}>
                  {clase ? (
                    <View style={[styles.claseBox, { backgroundColor: (clase.color || dc) + "22", borderColor: (clase.color || dc) + "55" }]}>
                      <Text style={[styles.claseMateria, { color: clase.color || dc }]}>{clase.materia}</Text>
                      {clase.docente ? <Text style={styles.claseDocente}>{clase.docente}</Text> : null}
                      <Text style={styles.claseHora}>
                        {fmtHora(clase.hora_inicio)}–{fmtHora(clase.hora_fin)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function EventoModal({ evento, cursoId, userId, onClose, onSave }) {
  const esNuevo = !evento;
  const [form, setForm] = useState({
    titulo: evento?.titulo || "",
    tipo: evento?.tipo || "acto",
    fecha: evento?.fecha || "",
    hora: evento?.hora || "",
    hora_fin: evento?.hora_fin || "",
    lugar: evento?.lugar || "",
    url_ubicacion: evento?.url_ubicacion || "",
    descripcion: evento?.descripcion || "",
    todo_el_dia: evento?.todo_el_dia !== false,
    confirma_asistencia: evento?.confirma_asistencia ?? false,
    adjuntos: evento?.adjuntos || [],
  });
  const [saving, setSaving] = useState(false);
  const [subiendoAdj, setSubiendoAdj] = useState(false);

  const guardar = async () => {
    if (!form.titulo || !form.fecha) return;
    setSaving(true);
    const payload = { ...form, curso_id: cursoId, creado_por: userId };
    let eventoId = evento?.id;
    if (esNuevo) {
      const { data: ev } = await supabase.from("eventos").insert(payload).select().single();
      eventoId = ev?.id;
      const userIds = await getUserIdsByCurso(cursoId);
      await sendPush({ type: "evento", payload: { titulo: form.titulo, fecha: form.fecha || "", userIds } });
    } else {
      await supabase.from("eventos").update(payload).eq("id", evento.id);
    }
    if (form.confirma_asistencia && eventoId) {
      const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id", cursoId);
      const hijosIds = (hijos || []).map((h) => h.id);
      if (hijosIds.length) {
        const { data: uh } = await supabase
          .from("usuario_hijos")
          .select("usuario_id,hijo_id")
          .in("hijo_id", hijosIds);
        const rows = (uh || []).map((r) => ({
          evento_id: eventoId,
          usuario_id: r.usuario_id,
          alumno_invitado_id: r.hijo_id,
          asiste: "pendiente",
        }));
        if (rows.length) {
          await supabase.from("evento_asistencia").delete().eq("evento_id", eventoId);
          await supabase
            .from("evento_asistencia")
            .upsert(rows, { onConflict: "evento_id,alumno_invitado_id", ignoreDuplicates: false });
        }
      }
    }
    setSaving(false);
    onSave();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <ScrollView>
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
              { l: "Lugar", k: "lugar", ph: "Ej: Patio del colegio" },
              { l: "URL ubicación", k: "url_ubicacion", ph: "https://maps.google.com/..." },
              { l: "Descripción", k: "descripcion", ph: "Detalles adicionales" },
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
              <Pressable
                onPress={() => setForm((p) => ({ ...p, todo_el_dia: !p.todo_el_dia }))}
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
              <Pressable onPress={guardar} disabled={saving || subiendoAdj} style={[styles.saveBtn, subiendoAdj && { opacity: 0.5 }]}>
                <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Guardar"}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function EventoAsistenciaModal({ evento, onClose, misHijos = [], userId = null }) {
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
  const pendientes = todosHijos.filter((h) => !asistencia[h.id] || asistencia[h.id] === "pendiente");
  const grupos = [
    { list: confirmados, label: "Confirman", color: "#10B981", bg: "#F0FDF4" },
    { list: pendientes, label: "Pendiente", color: "#F59E0B", bg: "#FFFBEB" },
    { list: noVan, label: "No van", color: "#EF4444", bg: "#FEF2F2" },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.pagosHeader}>
            <View style={styles.flex1}>
              <Text style={styles.modalTitle}>{evento.titulo}</Text>
              <Text style={styles.eventoMeta}>
                {new Date(evento.fecha + "T00:00:00").toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </Text>
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
                    RESUMEN · {confirmados.length} van · {noVan.length} no · {pendientes.length} pend.
                  </Text>
                  {grupos.map(({ list, label, color, bg }) =>
                    list.length > 0 ? (
                      <View key={label} style={styles.grupoResumen}>
                        <Text style={[styles.grupoLabel, { color }]}>
                          {label} ({list.length})
                        </Text>
                        {list.map((h) => (
                          <View key={h.id} style={[styles.resumenRow, { backgroundColor: bg }]}>
                            <View style={[styles.dot, { backgroundColor: h.color || color }]} />
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
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: t.textMuted, marginTop: 4, marginBottom: 14 },
  addBtn: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  addTxt: { color: t.onAccent, fontSize: 12.5, fontWeight: "800" },
  muted: { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: SPACE.lg },
  tabs: { gap: 7, paddingBottom: 4, marginBottom: SPACE.md },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: RADIUS.full, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.borderStrong, minHeight: 36, justifyContent: "center" },
  tabActive: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  tabTxt: { fontSize: 12, fontWeight: "600", color: t.textMuted },
  tabTxtActive: { color: t.textInverse, fontWeight: "700" },
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
  eventoDesc: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  lugarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  mapLink: { fontSize: 11, fontWeight: "700", color: BLUE[600] },
  asistBtn: { borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 10, minHeight: 32, justifyContent: "center", backgroundColor: t.surface },
  asistTxt: { fontSize: 11, fontWeight: "600", color: t.textMuted },
  editRow: { flexDirection: "row", gap: 4, marginTop: 4 },
  miniBtn: { padding: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface },
  miniTxt: { fontSize: 12, color: t.text },
  rangos: { gap: 6, paddingBottom: 8 },
  rangoChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.full, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.borderStrong, minHeight: 34, justifyContent: "center" },
  rangoOn: { backgroundColor: SLATE[900], borderColor: SLATE[900] },
  rangoTxt: { fontSize: 11, fontWeight: "600", color: t.textMuted },
  rangoTxtOn: { color: t.textInverse, fontWeight: "700" },
  listCard: { padding: 13, marginBottom: 10, borderLeftWidth: 3 },
  listRow: { flexDirection: "row", gap: SPACE.md, alignItems: "flex-start" },
  listRight: { alignItems: "flex-end", gap: 6 },
  diasTag: { backgroundColor: SLATE[100], borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 9 },
  diasTagTxt: { fontSize: 11, fontWeight: "800", color: t.textMuted, fontVariant: ["tabular-nums"] },
  horarioScroll: { marginTop: 4 },
  horarioHeaderRow: { flexDirection: "row" },
  horaCol: { width: 64, padding: 6, backgroundColor: t.surfaceSunken, borderWidth: 1, borderColor: t.border, alignItems: "center", justifyContent: "center" },
  horaTxt: { fontSize: 10, fontWeight: "700", color: t.textMuted },
  horarioDiaHead: { width: 110, padding: 8, borderWidth: 1, borderColor: t.border, alignItems: "center" },
  horarioDiaTxt: { fontSize: 11, fontWeight: "800" },
  horarioRow: { flexDirection: "row" },
  horarioCell: { width: 110, minHeight: 56, padding: 4, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
  claseBox: { flex: 1, borderRadius: RADIUS.sm, borderWidth: 1.5, padding: 6 },
  claseMateria: { fontSize: 11, fontWeight: "700" },
  claseDocente: { fontSize: 9, color: t.textFaint, marginTop: 2 },
  claseHora: { fontSize: 9, color: SLATE[300], marginTop: 2 },
  overlay: { flex: 1, backgroundColor: t.overlay, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  modalCard: { width: "100%", maxWidth: 440, maxHeight: "88%", backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xl },
  confirmCard: { width: "100%", maxWidth: 340, backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, padding: SPACE.xxl },
  modalTitle: { fontSize: 15, fontWeight: "800", color: t.textStrong, marginBottom: 8 },
  label: { ...TYPE.label, color: t.textFaint, marginBottom: 5, marginTop: 8 },
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
  vozNo: { borderColor: t.danger, backgroundColor: t.dangerSoft },
  vozTxt: { fontSize: 13, fontWeight: "700", color: t.textFaint },
  grupoResumen: { marginBottom: 10 },
  grupoLabel: { fontSize: 11, fontWeight: "700", marginBottom: 5 },
  resumenRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: RADIUS.md, marginBottom: 4 },
  resumenNombre: { fontSize: 13, fontWeight: "600", color: t.text },
});
