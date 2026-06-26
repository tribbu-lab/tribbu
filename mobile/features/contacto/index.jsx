// Contacto + Alumnos (puerto RN de src/features/contacto).
// - Contacto: info del colegio + lista de contactos; teléfono/mail/maps accionables
//   vía Linking (con safeUrl). La edición (super) vive en el flujo Super Admin.
// - Alumnos: listado del curso con sus apoderados (solo lectura, igual que la web).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Linking, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { fmtNombre, safeUrl } from "@shared/helpers";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { Card } from "../../components/Card";
import { Spinner } from "../../components/Spinner";

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
            <Text style={styles.mapsTxt}>📍 Ver en mapa</Text>
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
  const { cursoId } = useSession();
  const [hijos, setHijos] = useState([]);
  const [apodMap, setApodMap] = useState({});
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!cursoId) return;
    const { data: hijosData } = await supabase
      .from("hijos")
      .select("*")
      .eq("curso_id", cursoId)
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
  }, [cursoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando) return <Spinner />;

  const filtrados = hijos.filter((h) =>
    fmtNombre(h).toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Alumnos</Text>
      <TextInput
        value={busqueda}
        onChangeText={setBusqueda}
        placeholder="Buscar alumno..."
        placeholderTextColor="#94A3B8"
        autoCorrect={false}
        style={styles.search}
      />
      <Text style={styles.count}>{filtrados.length} alumnos</Text>
      {filtrados.map((h) => {
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
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 16, paddingBottom: 32 },
  flex1: { flex: 1 },
  h1: { fontSize: 22, fontWeight: "900", color: T.text, marginBottom: 16 },
  muted: { fontSize: 13, color: "#94A3B8", textAlign: "center", paddingVertical: 16 },
  card: { padding: 18 },
  colegioNombre: { fontSize: 14, fontWeight: "800", color: T.text, marginBottom: 12 },
  filaRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  filaLabel: { fontSize: 13, color: "#94A3B8", fontWeight: "600", width: 110 },
  filaVal: { fontSize: 13, color: T.text, flex: 1 },
  link: { fontSize: 13, color: T.accent, fontWeight: "600" },
  mapsBtn: { marginTop: 8, minHeight: 36, justifyContent: "center" },
  mapsTxt: { fontSize: 13, fontWeight: "700", color: T.accent },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: T.text, marginTop: 8, marginBottom: 10 },
  contactoCard: { padding: 14, marginBottom: 8 },
  contactoNombre: { fontSize: 13, fontWeight: "700", color: T.text },
  contactoRol: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  contactoLinks: { flexDirection: "row", gap: 16, marginTop: 6, flexWrap: "wrap" },
  search: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "white",
    fontSize: 13,
    color: T.text,
    marginBottom: 12,
  },
  count: { fontSize: 12, color: "#94A3B8", marginBottom: 10 },
  alumnoCard: {
    backgroundColor: "white",
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  alumnoTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  alumnoNombre: { fontSize: 13, fontWeight: "700", color: T.text },
  apodBox: { borderTopWidth: 1, borderTopColor: "#F1F5F9", paddingHorizontal: 12, paddingVertical: 8 },
  apodRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  apodDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.accent },
  apodNombre: { fontSize: 12, fontWeight: "600", color: T.text, flex: 1 },
  sinApod: { fontSize: 11, color: "#CBD5E1" },
});
