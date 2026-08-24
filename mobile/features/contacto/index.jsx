// Contacto + Alumnos (puerto RN de src/features/contacto).
// - Contacto: info del colegio + lista de contactos; teléfono/mail/maps accionables
//   vía Linking (con safeUrl). La edición (super) vive en el flujo Super Admin.
// - Alumnos: listado del curso con sus apoderados (solo lectura, igual que la web).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Linking, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { fmtNombre, safeUrl } from "@shared/helpers";
import { THEMES, TYPE, SPACE, RADIUS, BLUE, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";

const t = THEMES.light;

const COLEGIO_ID = "d31b5547-246b-46fa-906e-950e51d4af58";

const abrir = async (url) => {
  const safe = safeUrl(url);
  if (!safe) return;
  try {
    await Linking.openURL(safe);
  } catch {
    /* no-op: esquema no soportado en el dispositivo */
  }
};

export function Contacto() {
  const [colegio, setColegio] = useState(null);
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const [col, con] = await Promise.all([
      supabase.from("colegio").select("*").eq("id", COLEGIO_ID).single(),
      supabase.from("contactos").select("*").order("nombre"),
    ]);
    setColegio(col.data || {});
    setContactos(con.data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <Spinner />;

  const filas = [
    { l: "Teléfono", v: colegio?.telefono, link: colegio?.telefono ? `tel:${colegio.telefono}` : null },
    { l: "Email", v: colegio?.email, link: colegio?.email ? `mailto:${colegio.email}` : null },
    { l: "Dirección", v: colegio?.direccion },
    { l: "Horario clases", v: colegio?.horario_clases },
    { l: "Secretaría", v: colegio?.horario_secretaria },
    { l: "Sitio web", v: colegio?.sitio_web, link: colegio?.sitio_web },
  ].filter((x) => x.v);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Contacto</Text>

      <Card style={styles.card}>
        <Text style={styles.colegioNombre}>{colegio?.nombre || "Colegio"}</Text>
        {filas.length === 0 ? (
          <Text style={styles.muted}>Sin información cargada.</Text>
        ) : (
          filas.map((x) => (
            <View key={x.l} style={styles.filaRow}>
              <Text style={styles.filaLabel}>{x.l}</Text>
              {x.link ? (
                <Pressable onPress={() => abrir(x.link)} style={styles.flex1}>
                  <Text style={styles.link}>{x.v}</Text>
                </Pressable>
              ) : (
                <Text style={styles.filaVal}>{x.v}</Text>
              )}
            </View>
          ))
        )}
        {colegio?.url_maps ? (
          <Pressable onPress={() => abrir(colegio.url_maps)} style={styles.mapsBtn}>
            <MaterialCommunityIcons name="map-marker-outline" size={17} color={BLUE[600]} />
            <Text style={styles.mapsTxt}>Ver en mapa</Text>
          </Pressable>
        ) : null}
      </Card>

      <Text style={styles.sectionTitle}>Contactos</Text>
      {contactos.length === 0 ? (
        <Text style={styles.muted}>Sin contactos cargados</Text>
      ) : (
        contactos.map((c) => (
          <Card key={c.id} style={styles.contactoCard}>
            <Text style={styles.contactoNombre}>{c.nombre}</Text>
            {c.rol ? <Text style={styles.contactoRol}>{c.rol}</Text> : null}
            <View style={styles.contactoLinks}>
              {c.telefono ? (
                <Pressable onPress={() => abrir(`tel:${c.telefono}`)}>
                  <Text style={styles.link}>Tel: {c.telefono}</Text>
                </Pressable>
              ) : null}
              {c.email ? (
                <Pressable onPress={() => abrir(`mailto:${c.email}`)}>
                  <Text style={styles.link}>{c.email}</Text>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

export function Alumnos() {
  const { cursoIds, esVistaTodos, tagDeCurso } = useSession();
  const [hijos, setHijos] = useState([]);
  const [apodMap, setApodMap] = useState({});
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!cursoIds?.length) return;
    const { data: hijosData } = await supabase
      .from("hijos")
      .select("*")
      .in("curso_id", cursoIds)
      .order("apellido")
      .order("nombre");
    setHijos(hijosData || []);
    const ids = (hijosData || []).map((h) => h.id);
    if (ids.length) {
      const { data: uh } = await supabase
        .from("usuario_hijos")
        .select("hijo_id, usuario_id, usuarios(id,nombre,apellido,email,telefono)")
        .in("hijo_id", ids);
      const m = {};
      (uh || []).forEach((r) => {
        if (!m[r.hijo_id]) m[r.hijo_id] = [];
        if (r.usuarios) m[r.hijo_id].push(r.usuarios);
      });
      setApodMap(m);
    }
    setCargando(false);
  }, [cursoIds]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <Spinner />;

  const filtrados = hijos.filter((h) =>
    fmtNombre(h).toLowerCase().includes(busqueda.toLowerCase())
  );

  // En vista "Todos" se agrupa por curso (orden = cursoIds); en vista por hijo
  // hay un solo grupo sin encabezado, idéntico al comportamiento actual.
  const grupos = esVistaTodos
    ? (cursoIds || [])
        .map((cid) => ({ cursoId: cid, hijos: filtrados.filter((h) => h.curso_id === cid) }))
        .filter((g) => g.hijos.length > 0)
    : [{ cursoId: null, hijos: filtrados }];
  const conEncabezados = grupos.length > 1;

  const renderAlumno = (h) => {
    const apods = apodMap[h.id] || [];
    return (
      <View key={h.id} style={styles.alumnoCard}>
        <View style={styles.alumnoTop}>
          <View style={styles.flex1}>
            <Text style={styles.alumnoNombre}>{fmtNombre(h)}</Text>
            {h.fecha_nacimiento ? (
              <Text style={styles.contactoRol}>
                {new Date(h.fecha_nacimiento + "T00:00:00").toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Text>
            ) : null}
          </View>
          {h.dni ? <Text style={styles.contactoRol}>DNI: {h.dni}</Text> : null}
        </View>
        <View style={styles.apodBox}>
          {apods.length === 0 ? (
            <Text style={styles.sinApod}>Sin apoderados vinculados</Text>
          ) : (
            apods.map((a) => (
              <View key={a.id} style={styles.apodRow}>
                <View style={styles.apodDot} />
                <Text style={styles.apodNombre}>
                  {fmtNombre(a)}
                  {a.telefono ? `  ${a.telefono}` : ""}
                  {a.email ? `  ${a.email}` : ""}
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Alumnos</Text>
      <TextInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar alumno..."
        placeholderTextColor={t.placeholder}
        autoCorrect={false}
        style={styles.search}
      />
      <Text style={styles.count}>{filtrados.length} alumnos</Text>
      {grupos.map((g) => {
        const tag = conEncabezados ? tagDeCurso(g.cursoId) : null;
        return (
          <View key={g.cursoId ?? "curso-actual"}>
            {tag ? (
              <View style={styles.cursoHeader}>
                <View style={[styles.cursoDot, { backgroundColor: tag.color }]} />
                <Text style={styles.cursoTxt} numberOfLines={1}>{tag.nombre}</Text>
              </View>
            ) : null}
            {g.hijos.map(renderAlumno)}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3, marginBottom: SPACE.lg },
  muted: { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: SPACE.lg },
  card: {
    padding: SPACE.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: t.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  colegioNombre: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, marginBottom: SPACE.md },
  filaRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  filaLabel: { fontSize: 13, color: t.textFaint, fontWeight: "600", width: 110 },
  filaVal: { fontSize: 13, color: t.text, flex: 1 },
  link: { fontSize: 13, color: BLUE[600], fontWeight: "700" },
  mapsBtn: {
    marginTop: SPACE.md,
    minHeight: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: t.accentSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  mapsTxt: { fontSize: 12.5, fontWeight: "700", color: BLUE[600] },
  sectionTitle: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.sm, marginBottom: SPACE.sm },
  contactoCard: {
    padding: SPACE.lg,
    marginBottom: SPACE.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: t.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  contactoNombre: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  contactoRol: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  contactoLinks: { flexDirection: "row", gap: SPACE.lg, marginTop: 6, flexWrap: "wrap" },
  search: {
    minHeight: 44,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: t.borderStrong,
    backgroundColor: t.surface,
    fontSize: 13,
    color: t.text,
    marginBottom: SPACE.md,
  },
  count: { fontSize: 12, color: t.textMuted, marginBottom: SPACE.sm },
  cursoHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: SPACE.sm, marginBottom: SPACE.sm },
  cursoDot: { width: 8, height: 8, borderRadius: RADIUS.full },
  cursoTxt: { fontSize: 11.5, fontWeight: "700", color: t.textMuted, flex: 1 },
  alumnoCard: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.xl,
    marginBottom: SPACE.sm,
    borderWidth: 1,
    borderColor: t.borderStrong,
    overflow: "hidden",
  },
  alumnoTop: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.md },
  alumnoNombre: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  apodBox: { borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm },
  apodRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, marginBottom: SPACE.xs },
  apodDot: { width: 7, height: 7, borderRadius: RADIUS.full, backgroundColor: t.accent },
  apodNombre: { fontSize: 12, fontWeight: "600", color: t.text, flex: 1 },
  sinApod: { fontSize: 12, color: SLATE[300] },
});
