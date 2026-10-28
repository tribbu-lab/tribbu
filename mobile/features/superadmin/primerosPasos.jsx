// "Primeros pasos" en el inicio del panel de la app (administrador y super):
// misma lista y estados que la web (@shared/primerosPasos). Los pasos que en
// la app no tienen pantalla (Importar datos) muestran "En la computadora".
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { pasosPrimerosPasos, progresoPasos, CLAVE_PASOS_OCULTOS } from "@shared/primerosPasos";

export function PrimerosPasos({ userId, colegioId, cursos = [], maestros = [], hijos = [], usuarios = [], puedeIr, onIr }) {
  const [d, setD] = useState(null);
  const [oculto, setOculto] = useState(true); // hasta leer el almacenamiento
  const clave = CLAVE_PASOS_OCULTOS(userId, colegioId);
  const ids = cursos.map((c) => c.id).join(",");

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(clave).then((v) => { if (vivo) setOculto(v === "1"); }).catch(() => { if (vivo) setOculto(false); });
    return () => { vivo = false; };
  }, [clave]);

  useEffect(() => {
    if (!colegioId) return undefined;
    let vivo = true;
    const lista = ids ? ids.split(",") : [];
    const vacio = { data: [] };
    Promise.all([
      supabase.from("materias").select("id", { count: "exact", head: true }).eq("colegio_id", colegioId),
      lista.length ? supabase.from("horarios").select("curso_id").in("curso_id", lista) : vacio,
      lista.length ? supabase.rpc("adopcion_por_curso", { p_ids: lista }) : vacio,
    ]).then(([mat, hor, adop]) => {
      if (!vivo) return;
      const conHorario = new Set((hor.data || []).map((h) => h.curso_id));
      const a = (adop.data || []).reduce((s, r) => ({ familias: s.familias + (r.familias || 0), conApp: s.conApp + (r.con_app || 0) }), { familias: 0, conApp: 0 });
      setD({ materias: mat.count || 0, sinHorario: lista.filter((id) => !conHorario.has(id)).length, ...a });
    });
    return () => { vivo = false; };
  }, [colegioId, ids]);

  if (!d || oculto) return null;
  const delAno = new Set(cursos.map((c) => c.id));
  const alumnos = hijos.filter((h) => delAno.has(h.curso_id));
  const conApoderado = new Set(usuarios.flatMap((u) => u.hijos || []));
  const pasos = pasosPrimerosPasos({
    cursos: cursos.length, materias: d.materias, maestros: maestros.filter((m) => m.activo !== false).length,
    cursosSinHorario: d.sinHorario, alumnos: alumnos.length, alumnosSinApoderado: alumnos.filter((h) => !conApoderado.has(h.id)).length,
    familias: d.familias, familiasConApp: d.conApp,
  });
  const progreso = progresoPasos(pasos);
  if (progreso.completo) return null;
  const ocultar = () => { setOculto(true); AsyncStorage.setItem(clave, "1").catch(() => {}); };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.titulo}>Primeros pasos</Text>
        <Text style={s.cuenta}>{progreso.hechos} de {progreso.total}</Text>
        <Pressable onPress={ocultar} hitSlop={8} accessibilityRole="button"><Text style={s.ocultar}>Ocultar</Text></Pressable>
      </View>
      <View style={s.barra}><View style={[s.relleno, { width: `${(progreso.hechos / progreso.total) * 100}%` }]} /></View>
      {pasos.map((p, i) => {
        const va = !p.hecho && puedeIr(p.sec);
        return (
          <Pressable key={p.id} onPress={va ? () => onIr(p.sec) : undefined} disabled={!va} style={[s.fila, i > 0 && s.borde]} accessibilityRole={va ? "button" : undefined}>
            <View style={[s.marca, p.hecho && s.marcaHecha]}>
              {p.hecho ? <MaterialCommunityIcons name="check" size={14} color="white" /> : <Text style={s.num}>{i + 1}</Text>}
            </View>
            <View style={s.flex1}>
              <Text style={[s.paso, p.hecho && s.pasoHecho]}>{p.titulo}</Text>
              {p.detalle ? <Text style={s.detalle}>{p.detalle}</Text> : null}
              {!p.hecho && !va ? <Text style={s.detalle}>En la computadora, desde el panel web.</Text> : null}
            </View>
            {va ? <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, marginBottom: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  titulo: { flex: 1, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  cuenta: { fontSize: 13, fontWeight: "700", color: "#64748B" },
  ocultar: { fontSize: 12.5, fontWeight: "700", color: "#94A3B8" },
  barra: { height: 6, borderRadius: 999, backgroundColor: "#F1F5F9", marginTop: 10, overflow: "hidden" },
  relleno: { height: 6, borderRadius: 999, backgroundColor: "#10B981" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, minHeight: 52 },
  borde: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  marca: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },
  marcaHecha: { backgroundColor: "#10B981", borderWidth: 0 },
  num: { fontSize: 11, fontWeight: "800", color: "#94A3B8" },
  flex1: { flex: 1 },
  paso: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  pasoHecho: { color: "#64748B" },
  detalle: { fontSize: 12.5, color: "#64748B", marginTop: 1 },
});
