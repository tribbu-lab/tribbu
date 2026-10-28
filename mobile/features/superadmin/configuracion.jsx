// Página de Configuración del panel del colegio (app): tarjetas agrupadas con
// su estado, en vez de 9 pestañas (@shared/configuracionPanel; espejo de
// src/features/superadmin/configuracion.jsx). Al tocar una se va a esa
// pantalla, que vuelve con "‹ Configuración".
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase } from "../../lib/supabase";
import { DESC_CONFIG, estadoConfig, gruposVisibles } from "@shared/configuracionPanel";

export function ConfiguracionInicio({ items, cursos = [], maestros = [], directivos = 0, onIr }) {
  const [sinHorario, setSinHorario] = useState(null);
  const ids = cursos.map((c) => c.id).join(",");
  useEffect(() => {
    const lista = ids ? ids.split(",") : [];
    if (!lista.length) return undefined;
    let vivo = true;
    supabase.from("horarios").select("curso_id").in("curso_id", lista).then(({ data }) => {
      if (vivo) setSinHorario(lista.length - new Set((data || []).map((h) => h.curso_id)).size);
    });
    return () => { vivo = false; };
  }, [ids]);

  const nombre = Object.fromEntries(items.map((i) => [i.id, i.l]));
  const datos = { cursos: cursos.length, cursosSinHorario: ids ? sinHorario : 0, maestros: maestros.filter((m) => m.activo !== false).length, directivos };
  return (
    <View>
      {gruposVisibles(new Set(items.map((i) => i.id))).map((g) => (
        <View key={g.titulo} style={s.grupo}>
          <Text style={s.grupoTitulo}>{g.titulo.toUpperCase()}</Text>
          <View style={s.card}>
            {g.items.map((id, i) => {
              const est = estadoConfig(id, datos);
              return (
                <Pressable key={id} onPress={() => onIr(id)} style={({ pressed }) => [s.fila, i > 0 && s.borde, pressed && s.pressed]} accessibilityRole="button">
                  <View style={s.flex1}>
                    <Text style={s.titulo}>{nombre[id]}</Text>
                    <Text style={s.desc}>{DESC_CONFIG[id]}</Text>
                    {est ? <Text style={[s.estado, est.alerta && s.alerta]}>{est.texto}</Text> : null}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grupo: { marginBottom: 16 },
  grupoTitulo: { fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, color: "#94A3B8", marginBottom: 8, marginLeft: 2 },
  card: { backgroundColor: "white", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", overflow: "hidden" },
  fila: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 },
  borde: { borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  pressed: { backgroundColor: "#F8FAFC" },
  flex1: { flex: 1 },
  titulo: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  desc: { fontSize: 12.5, color: "#64748B", marginTop: 2 },
  estado: { fontSize: 12.5, fontWeight: "700", color: "#047857", marginTop: 4 },
  alerta: { color: "#B45309" },
});
