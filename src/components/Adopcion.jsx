// src/components/Adopcion.jsx
//
// Adopción de la app por curso: familias, cuántas tienen la app instalada
// (les llegan las notificaciones), cuántas sincronizaron el calendario y
// cuántas entraron en los últimos 30 días. RPC adopcion_por_curso
// (supabase/lecturas-y-adopcion.sql) — solo devuelve los cursos que el
// usuario puede ver (Room Parent de ese curso, o el colegio).
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

function Barra({ n, total, color }) {
  const p = pct(n, total);
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
        <span>{n}</span><span style={{ color: "#94A3B8" }}>{p}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "#F1F5F9", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}

/** cursos: [{id, nombre}] — una fila por curso (sin fila si el usuario no tiene permiso). */
export function AdopcionTabla({ cursos }) {
  const [filas, setFilas] = useState(null);
  const clave = cursos.map((c) => c.id).sort().join(",");
  useEffect(() => {
    let vivo = true;
    const ids = clave ? clave.split(",") : [];
    if (!ids.length) return;
    supabase.rpc("adopcion_por_curso", { p_ids: ids }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { console.warn("No se pudo cargar la adopción:", error.message); setFilas([]); return; }
      setFilas(data || []);
    });
    return () => { vivo = false; };
  }, [clave]);

  if (!cursos.length) return <div style={{ fontSize: 13, color: "#94A3B8" }}>No hay cursos para mostrar.</div>;
  if (filas === null) return <div style={{ fontSize: 13, color: "#94A3B8" }}>Cargando…</div>;

  const nombre = new Map(cursos.map((c) => [c.id, c.nombre]));
  const orden = [...filas].sort((a, b) => (nombre.get(a.curso_id) || "").localeCompare(nombre.get(b.curso_id) || "", "es"));
  const tot = filas.reduce((a, f) => ({ familias: a.familias + f.familias, con_app: a.con_app + f.con_app, con_calendario: a.con_calendario + f.con_calendario, activas_30d: a.activas_30d + f.activas_30d }), { familias: 0, con_app: 0, con_calendario: 0, activas_30d: 0 });
  const th = { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: "#94A3B8", textTransform: "uppercase", textAlign: "left", padding: "0 10px 8px" };
  const td = { padding: "10px", borderTop: "1px solid #F1F5F9", verticalAlign: "middle" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
        <thead>
          <tr>
            <th style={th}>Curso</th>
            <th style={th}>Familias</th>
            <th style={th} title="Les llegan las notificaciones">Con la app</th>
            <th style={th}>Calendario sincronizado</th>
            <th style={th}>Entraron (30 días)</th>
          </tr>
        </thead>
        <tbody>
          {orden.map((f) => (
            <tr key={f.curso_id}>
              <td style={{ ...td, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{nombre.get(f.curso_id) || "—"}</td>
              <td style={{ ...td, fontSize: 13, color: "#475569" }}>{f.familias}</td>
              <td style={td}><Barra n={f.con_app} total={f.familias} color="#3B82F6" /></td>
              <td style={td}><Barra n={f.con_calendario} total={f.familias} color="#8B5CF6" /></td>
              <td style={td}><Barra n={f.activas_30d} total={f.familias} color="#10B981" /></td>
            </tr>
          ))}
          {orden.length > 1 && (
            <tr>
              <td style={{ ...td, fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Total</td>
              <td style={{ ...td, fontSize: 12, fontWeight: 700, color: "#475569" }}>{tot.familias}</td>
              <td style={td}><Barra n={tot.con_app} total={tot.familias} color="#3B82F6" /></td>
              <td style={td}><Barra n={tot.con_calendario} total={tot.familias} color="#8B5CF6" /></td>
              <td style={td}><Barra n={tot.activas_30d} total={tot.familias} color="#10B981" /></td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, lineHeight: 1.5 }}>
        "Con la app" = instalaron la app del celular y aceptaron notificaciones: son las familias a las que les llegan los avisos al instante.
        Una familia con hijos en dos cursos cuenta en los dos.
      </div>
    </div>
  );
}
