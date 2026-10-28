// Ficha de un alumno en el panel de la app (espejo de
// src/features/superadmin/fichaAlumno.jsx): datos, familia, cambios en la
// salida, autorizaciones del curso con su respuesta y sus chats con
// Secretaría y las maestras. Se abre desde Personas → Alumnos.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { fmtNombre, fmtF, fmtLocalDate } from "@shared/helpers";
import { SELECT_CAMBIO_SALIDA, estadoCambio, fechaCambio, textoMotivo, textoRetira } from "@shared/cambiosSalida";
import { Sheet } from "../../components/Sheet";

const fmtCuando = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

export function FichaAlumno({ alumno, curso, onClose }) {
  const [d, setD] = useState(null);
  const hoy = fmtLocalDate();
  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from("cambios_salida").select(SELECT_CAMBIO_SALIDA).eq("hijo_id", alumno.id).order("fecha", { ascending: false }).limit(5),
      alumno.curso_id ? supabase.from("autorizaciones").select("id,titulo,fecha_evento,creado_en").eq("curso_id", alumno.curso_id).order("creado_en", { ascending: false }).limit(6) : { data: [] },
      supabase.from("autorizacion_respuestas").select("autorizacion_id,autoriza").eq("hijo_id", alumno.id),
      supabase.from("conversaciones").select("id,tipo,ultimo_mensaje_en,maestros(nombre,apellido,materia)").eq("hijo_id", alumno.id).in("tipo", ["colegio", "docente"]).order("ultimo_mensaje_en", { ascending: false, nullsFirst: false }),
    ]).then(([sal, auts, resp, convs]) => {
      if (vivo) setD({ salidas: sal.data || [], autorizaciones: auts.data || [], respuestas: resp.data || [], chats: convs.data || [] });
    });
    return () => { vivo = false; };
  }, [alumno.id, alumno.curso_id]);

  const apoderados = (alumno.usuarios || []).map((u) => u.usuarios).filter(Boolean);
  const respuestaDe = new Map((d?.respuestas || []).map((r) => [r.autorizacion_id, r]));
  const Seccion = ({ titulo, children }) => (
    <View>
      <Text style={s.titulo}>{titulo.toUpperCase()}</Text>
      <View style={s.caja}>{children}</View>
    </View>
  );
  return (
    <Sheet visible onClose={onClose} title={fmtNombre(alumno)}>
      <ScrollView style={s.scroll}>
        <Text style={s.sub}>{[curso?.nombre, alumno.fecha_nacimiento ? fmtF(alumno.fecha_nacimiento) : null, alumno.dni ? `DNI ${alumno.dni}` : null].filter(Boolean).join(" · ")}</Text>
        <Seccion titulo="Familia">
          {apoderados.length ? apoderados.map((p, i) => (
            <View key={p.id} style={[s.fila, i > 0 && s.borde]}>
              <Text style={s.fuerte}>{fmtNombre(p)}</Text>
              <Text style={s.meta}>{[p.email, p.telefono].filter(Boolean).join(" · ")}</Text>
            </View>
          )) : <Text style={[s.vacio, s.alerta]}>Sin apoderado vinculado: su familia todavía no recibe nada.</Text>}
        </Seccion>
        {!d ? <Text style={s.vacio}>Cargando…</Text> : (
          <>
            <Seccion titulo="Cambios en la salida">
              {d.salidas.length ? d.salidas.map((c, i) => {
                const est = estadoCambio(c, hoy);
                return (
                  <View key={c.id} style={[s.fila, i > 0 && s.borde]}>
                    <Text style={s.fuerte}>{fechaCambio(c.fecha, hoy)} · {(c.hora || "").slice(0, 5)} <Text style={est.id === "visto" ? s.ok : est.id === "pendiente" ? s.alerta : s.meta}>· {est.id === "pendiente" ? "Sin ver" : est.label}</Text></Text>
                    <Text style={s.meta}>{textoMotivo(c)} · Se retira con {textoRetira(c)}</Text>
                  </View>
                );
              }) : <Text style={s.vacio}>No avisaron ningún cambio.</Text>}
            </Seccion>
            <Seccion titulo="Autorizaciones del curso">
              {d.autorizaciones.length ? d.autorizaciones.map((a, i) => {
                const r = respuestaDe.get(a.id);
                return (
                  <View key={a.id} style={[s.fila, s.filaH, i > 0 && s.borde]}>
                    <View style={s.flex1}>
                      <Text style={s.fuerte}>{a.titulo}</Text>
                      {a.fecha_evento ? <Text style={s.meta}>Salida {fmtF(a.fecha_evento)}</Text> : null}
                    </View>
                    <Text style={[s.estado, !r ? s.meta : r.autoriza ? s.ok : s.no]}>{!r ? "Sin responder" : r.autoriza ? "Autorizó" : "No autorizó"}</Text>
                  </View>
                );
              }) : <Text style={s.vacio}>El curso no tiene autorizaciones.</Text>}
            </Seccion>
            <Seccion titulo="Mensajes">
              {d.chats.length ? d.chats.map((c, i) => (
                <View key={c.id} style={[s.fila, i > 0 && s.borde]}>
                  <Text style={s.fuerte}>{c.tipo === "colegio" ? "Con Secretaría" : `Con ${fmtNombre(c.maestros) || "una maestra"}${c.maestros?.materia ? ` (${c.maestros.materia})` : ""}`}</Text>
                  <Text style={s.meta}>{c.ultimo_mensaje_en ? `Último mensaje: ${fmtCuando(c.ultimo_mensaje_en)}` : "Sin mensajes"}</Text>
                </View>
              )) : <Text style={s.vacio}>Su familia todavía no escribió.</Text>}
            </Seccion>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  sub: { fontSize: 13, color: "#64748B", marginBottom: 4 },
  titulo: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, color: "#94A3B8", marginTop: 14, marginBottom: 6 },
  caja: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, backgroundColor: "white" },
  fila: { paddingVertical: 10, paddingHorizontal: 12 },
  filaH: { flexDirection: "row", alignItems: "center", gap: 8 },
  borde: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  flex1: { flex: 1 },
  fuerte: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  meta: { fontSize: 12.5, color: "#64748B", marginTop: 1 },
  estado: { fontSize: 12.5, fontWeight: "700" },
  ok: { color: "#047857" },
  no: { color: "#B91C1C" },
  alerta: { color: "#B45309" },
  vacio: { fontSize: 13, color: "#94A3B8", paddingVertical: 10, paddingHorizontal: 12 },
});
