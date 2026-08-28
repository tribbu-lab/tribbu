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

// wa.me no necesita columna nueva: se arma con el mismo teléfono que ya
// carga el colegio/contacto, asumiendo que ya incluye código de país (como
// se completa hoy para el link tel:).
const waLink = (telefono) => (telefono ? `https://wa.me/${telefono.replace(/[^0-9]/g, "")}` : null);

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
    { l: "Horario clases", v: colegio?.horario_clases },
    { l: "Secretaría", v: colegio?.horario_secretaria },
    { l: "Sitio web", v: colegio?.sitio_web, link: colegio?.sitio_web },
  ].filter((x) => x.v);

  // Urgencias (mockup): no hay columna "urgente" en contactos — se infiere
  // por rol (Preceptoría/Portería/Enfermería, lo típico en "urgencias en
  // horario escolar") para no depender de un cambio de esquema. Sin match,
  // simplemente no aparece el banner — no se inventa un contacto.
  const esUrgencia = (c) => /precep|porter|enfermer/i.test(c.rol || "");
  const urgencia = contactos.find(esUrgencia);
  const contactosResto = contactos.filter((c) => c !== urgencia);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Contacto</Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {[colegio?.nombre, colegio?.direccion].filter(Boolean).join(" · ")}
      </Text>

      {urgencia ? (
        <View style={styles.urgCard}>
          <Text style={styles.urgLabel}>URGENCIAS EN HORARIO ESCOLAR</Text>
          <Text style={styles.urgTitulo}>{urgencia.rol}{urgencia.telefono ? ` · ${urgencia.telefono}` : ""}</Text>
          <View style={styles.urgBtns}>
            {urgencia.telefono ? (
              <Pressable onPress={() => abrir(`tel:${urgencia.telefono}`)} style={styles.urgBtnPrimary}>
                <MaterialCommunityIcons name="phone" size={16} color="#FFFFFF" />
                <Text style={styles.urgBtnPrimaryTxt}>Llamar ahora</Text>
              </Pressable>
            ) : null}
            {urgencia.telefono ? (
              <Pressable onPress={() => abrir(waLink(urgencia.telefono))} style={styles.urgBtnGhost}>
                <Text style={styles.urgBtnGhostTxt}>WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Colegio</Text>
      <Card style={styles.card}>
        {filas.length === 0 ? (
          <Text style={styles.muted}>Sin información cargada.</Text>
        ) : (
          filas.map((x, i) => (
            <View key={x.l} style={[styles.filaRow, i > 0 && styles.filaRowDivider]}>
              <View style={styles.filaIconBox}>
                <MaterialCommunityIcons name={ICONO_FILA[x.l] || "information-outline"} size={16} color={t.textMuted} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.filaLabel}>{x.l}</Text>
                {x.link ? (
                  <Pressable onPress={() => abrir(x.link)}>
                    <Text style={styles.link}>{x.v}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.filaVal}>{x.v}</Text>
                )}
              </View>
              {x.l === "Teléfono" ? (
                <View style={styles.filaAcciones}>
                  <Pressable onPress={() => abrir(x.link)} style={styles.filaAccionBtn}>
                    <MaterialCommunityIcons name="phone-outline" size={16} color={t.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => abrir(waLink(colegio.telefono))} style={styles.filaAccionBtn}>
                    <MaterialCommunityIcons name="whatsapp" size={16} color="#25D366" />
                  </Pressable>
                </View>
              ) : null}
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

      {contactosResto.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Contactos</Text>
          <Card style={styles.card}>
            {contactosResto.map((c, i) => (
              <View key={c.id} style={[styles.filaRow, i > 0 && styles.filaRowDivider]}>
                <View style={styles.filaIconBox}>
                  <MaterialCommunityIcons name="account-outline" size={16} color={t.textMuted} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.filaVal}>{c.nombre}</Text>
                  {c.rol ? <Text style={styles.contactoRol}>{c.rol}</Text> : null}
                </View>
                <View style={styles.filaAcciones}>
                  {c.telefono ? (
                    <Pressable onPress={() => abrir(`tel:${c.telefono}`)} style={styles.filaAccionBtn}>
                      <MaterialCommunityIcons name="phone-outline" size={16} color={t.textMuted} />
                    </Pressable>
                  ) : null}
                  {c.telefono ? (
                    <Pressable onPress={() => abrir(waLink(c.telefono))} style={styles.filaAccionBtn}>
                      <MaterialCommunityIcons name="whatsapp" size={16} color="#25D366" />
                    </Pressable>
                  ) : null}
                  {c.email ? (
                    <Pressable onPress={() => abrir(`mailto:${c.email}`)} style={styles.filaAccionBtn}>
                      <MaterialCommunityIcons name="email-outline" size={16} color={t.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const ICONO_FILA = {
  "Teléfono": "phone-outline",
  "Email": "email-outline",
  "Horario clases": "clock-outline",
  "Secretaría": "office-building-outline",
  "Sitio web": "web",
};

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
  // Listado de alumnos: "Apellido, Nombre" (orden de planilla escolar),
  // acorde al order("apellido") de la query — los apoderados de abajo
  // siguen en "Nombre Apellido" (fmtNombre), sin cambios.
  const fmtAlumno = (h) => (h?.apellido ? `${h.apellido}, ${h.nombre || ""}`.trim() : fmtNombre(h));

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
            <Text style={styles.alumnoNombre}>{fmtAlumno(h)}</Text>
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
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, color: t.textMuted, marginBottom: SPACE.lg },
  muted: { fontSize: 13, color: t.textFaint, textAlign: "center", paddingVertical: SPACE.lg },
  urgCard: { backgroundColor: "#FEF2F2", borderWidth: 1.5, borderColor: "#FCA5A5", borderRadius: RADIUS.xl, padding: SPACE.lg, marginBottom: SPACE.lg },
  urgLabel: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.8, color: "#EF4444" },
  urgTitulo: { fontSize: 16, fontWeight: "800", color: "#7F1D1D", marginTop: 4, marginBottom: 12 },
  urgBtns: { flexDirection: "row", gap: 8 },
  urgBtnPrimary: { flex: 1, minHeight: 44, borderRadius: RADIUS.lg, backgroundColor: "#EF4444", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  urgBtnPrimaryTxt: { fontSize: 13.5, fontWeight: "800", color: "#FFFFFF" },
  urgBtnGhost: { flex: 1, minHeight: 44, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: "#FCA5A5", backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  urgBtnGhostTxt: { fontSize: 13.5, fontWeight: "800", color: "#EF4444" },
  filaIconBox: { width: 32, height: 32, borderRadius: RADIUS.md, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center", flexShrink: 0 },
  filaRowDivider: { borderTopWidth: 1, borderTopColor: t.border, marginTop: 4, paddingTop: 10 },
  filaAcciones: { flexDirection: "row", gap: 4 },
  filaAccionBtn: { width: 32, height: 32, borderRadius: RADIUS.md, borderWidth: 1, borderColor: t.borderStrong, alignItems: "center", justifyContent: "center" },
  card: {
    padding: SPACE.xl,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: t.borderStrong,
    shadowOpacity: 0,
    elevation: 0,
  },
  colegioNombre: { fontSize: 14.5, fontWeight: "700", color: t.textStrong, marginBottom: SPACE.md },
  filaRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 6 },
  filaLabel: { fontSize: 10.5, color: t.textFaint, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 },
  filaVal: { fontSize: 13.5, color: t.text, fontWeight: "600" },
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
  contactoLinks: { flexDirection: "row", gap: SPACE.lg, marginTop: 6, flexWrap: "wrap", alignItems: "center" },
  waBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
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
