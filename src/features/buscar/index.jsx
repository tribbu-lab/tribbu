// @ts-nocheck
// Búsqueda global de escritorio (handoff Tribbu Apoderado Web.dc.html, Parte
// 7): el campo vive en el header y filtra recordatorios/eventos/colectas
// dentro del alcance actual (cursoIds, respeta "Mi acceso"/vista Todos).
// Versión web de mobile/features/buscar — mismo criterio de alcance, panel
// distinto (se muestra sobre el módulo activo, no una pestaña propia).

import { useState, useEffect } from "react";
import { supabase } from "../../supabase";

export function BusquedaGlobal({ query, cursoIds, tagDeCurso, onNavigate, onLimpiar }) {
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const q = query.trim();
    const timer = setTimeout(async () => {
      if (!vivo) return;
      if (!q || q.length < 2 || !cursoIds?.length) { setResultados([]); setCargando(false); return; }
      setCargando(true);
      const like = `%${q}%`;
      const [recs, evs, cols] = await Promise.all([
        supabase.from("recordatorios").select("id,texto,fecha,curso_id").in("curso_id", cursoIds).ilike("texto", like).limit(6),
        supabase.from("eventos").select("id,titulo,fecha,tipo,curso_id").in("curso_id", cursoIds).ilike("titulo", like).limit(6),
        supabase.from("colectas").select("id,titulo,curso_id").in("curso_id", cursoIds).ilike("titulo", like).limit(6),
      ]);
      if (!vivo) return;
      const fmtFecha = (f) => f ? new Date(f + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "long" }) : null;
      const items = [
        ...(recs.data || []).map(r => ({
          id: `rec-${r.id}`, emoji: "📌", soft: "#EFF6FF",
          titulo: r.texto, meta: ["Recordatorio", tagDeCurso?.(r.curso_id)?.nombre, fmtFecha(r.fecha)].filter(Boolean).join(" · "),
          go: () => onNavigate("recordatorios"),
        })),
        ...(evs.data || []).map(e => ({
          id: `ev-${e.id}`, emoji: "📅", soft: "#F0FDF4",
          titulo: e.titulo, meta: ["Evento", tagDeCurso?.(e.curso_id)?.nombre, fmtFecha(e.fecha)].filter(Boolean).join(" · "),
          go: () => onNavigate("clases", { openFecha: e.fecha }),
        })),
        ...(cols.data || []).map(c => ({
          id: `col-${c.id}`, emoji: "💳", soft: "#FFFBEB",
          titulo: c.titulo, meta: ["Colecta", tagDeCurso?.(c.curso_id)?.nombre].filter(Boolean).join(" · "),
          go: () => onNavigate("finanzas", { openColecta: c.id }),
        })),
      ];
      setResultados(items);
      setCargando(false);
    }, 250);
    return () => { vivo = false; clearTimeout(timer); };
  }, [query, cursoIds, tagDeCurso, onNavigate]);

  const q = query.trim();

  return (
    <div style={{ border: "1px solid #E7ECF3", borderRadius: 18, background: "white", overflow: "hidden", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#0F172A" }}>
          {cargando ? "Buscando..." : `${resultados.length} resultado${resultados.length !== 1 ? "s" : ""} para "${q}"`}
        </div>
        <button onClick={onLimpiar} style={{ minHeight: 36, padding: "0 12px", border: "1px solid #E2E8F0", borderRadius: 10, background: "white", color: "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Limpiar</button>
      </div>
      {!cargando && resultados.length === 0 && (
        <div style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 38 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 11 }}>Sin resultados para "{q}"</div>
          <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 5 }}>Probá con el nombre de un chico, un evento o "colecta".</div>
        </div>
      )}
      {resultados.map(r => (
        <button key={r.id} onClick={r.go} style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 13, padding: "14px 18px", border: "none", borderBottom: "1px solid #F8FAFC", background: "white", cursor: "pointer", textAlign: "left" }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: r.soft, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{r.emoji}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{r.titulo}</div>
            <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{r.meta}</div>
          </div>
          <span style={{ fontSize: 18, color: "#CBD5E1" }}>›</span>
        </button>
      ))}
    </div>
  );
}
