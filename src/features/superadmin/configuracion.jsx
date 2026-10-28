// Página de Configuración del panel del colegio (web): tarjetas agrupadas con
// su estado, en vez de 10 pestañas (@shared/configuracionPanel; mobile en
// mobile/features/superadmin). Al tocar una se va a esa pantalla, que vuelve
// con "‹ Configuración".
import { useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { Icono } from "../../components/Icono";
import { DESC_CONFIG, estadoConfig, gruposVisibles } from "../../lib/configuracionPanel";

export function ConfiguracionInicio({ items, cursos = [], maestros = [], directivos = 0, membreteListo = null, onIr }) {
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
  const datos = { cursos: cursos.length, cursosSinHorario: ids ? sinHorario : 0, maestros: maestros.filter((m) => m.activo !== false).length, directivos, membreteListo };
  return (
    <div style={{ maxWidth: 880 }}>
      {gruposVisibles(new Set(items.map((i) => i.id))).map((g) => (
        <div key={g.titulo} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "0 2px 8px" }}>{g.titulo}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
            {g.items.map((id) => {
              const est = estadoConfig(id, datos);
              return (
                <button key={id} onClick={() => onIr(id)} style={{ display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: "14px 16px", borderRadius: 14, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{nombre[id]}</span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 2, lineHeight: 1.4 }}>{DESC_CONFIG[id]}</span>
                    {est ? <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: est.alerta ? "#B45309" : "#047857", marginTop: 6 }}>{est.texto}</span> : null}
                  </span>
                  <Icono nombre="flecha" size={16} color="#94A3B8" style={{ marginTop: 3 }} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
