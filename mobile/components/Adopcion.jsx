// mobile/components/Adopcion.jsx — puerto RN de src/components/Adopcion.jsx.
// Adopción de la app por curso (RPC adopcion_por_curso): familias, con la app
// (les llegan las notificaciones), con calendario sincronizado y activas en
// 30 días. En el celular, una tarjeta por curso en lugar de la tabla web.
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { supabase } from "../lib/supabase";

const t = THEMES.light;
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function Barra({ label, n, total, color }) {
  const p = pct(n, total);
  return (
    <View style={styles.barra}>
      <View style={styles.barraHead}>
        <Text style={styles.barraLabel}>{label}</Text>
        <Text style={styles.barraNum}>{n} · {p}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${p}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** cursos: [{ id, nombre }] — los que no tienen familias salen en 0. */
export function AdopcionLista({ cursos }) {
  const [filas, setFilas] = useState(null);
  const clave = cursos.map((c) => c.id).sort().join(",");
  useEffect(() => {
    let vivo = true;
    const ids = clave ? clave.split(",") : [];
    if (!ids.length) return;
    supabase.rpc("adopcion_por_curso", { p_ids: ids }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) console.warn("No se pudo cargar la adopción:", error.message);
      setFilas(data || []);
    });
    return () => {
      vivo = false;
    };
  }, [clave]);

  if (!cursos.length) return <Text style={styles.vacio}>No hay cursos para mostrar.</Text>;
  if (filas === null) return <Text style={styles.vacio}>Cargando…</Text>;
  const porCurso = new Map(filas.map((f) => [f.curso_id, f]));
  const orden = [...cursos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <View>
      {orden.map((c) => {
        const f = porCurso.get(c.id) || { familias: 0, con_app: 0, con_calendario: 0, activas_30d: 0 };
        return (
          <View key={c.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.curso}>{c.nombre}</Text>
              <Text style={styles.familias}>{f.familias ? `${f.familias} familias` : "Sin familias"}</Text>
            </View>
            {f.familias ? (
              <>
                <Barra label="Con la app" n={f.con_app} total={f.familias} color="#3B82F6" />
                <Barra label="Calendario sincronizado" n={f.con_calendario} total={f.familias} color="#8B5CF6" />
                <Barra label="Entraron (30 días)" n={f.activas_30d} total={f.familias} color="#10B981" />
              </>
            ) : null}
          </View>
        );
      })}
      <Text style={styles.nota}>“Con la app” = instalaron la app y aceptaron notificaciones: a ellas les llegan los avisos al instante.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  vacio: { fontSize: 13, color: t.textFaint, padding: SPACE.md },
  card: { backgroundColor: "white", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  curso: { fontSize: 14, fontWeight: "800", color: t.text, flex: 1 },
  familias: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  barra: { marginTop: 6 },
  barraHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3 },
  barraLabel: { fontSize: 11.5, color: t.textMuted },
  barraNum: { fontSize: 11.5, fontWeight: "700", color: t.text },
  track: { height: 5, borderRadius: 3, backgroundColor: "#F1F5F9", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  nota: { fontSize: 11, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 15 },
});
