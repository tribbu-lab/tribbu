// src/components/Lecturas.jsx
//
// Confirmación de lectura de avisos (recordatorios / comunicaciones del
// colegio): chip "👁 5 de 40 leyeron" + modal con quién falta y quién leyó.
// Los datos salen de la RPC lecturas_de_recordatorios (supabase/
// lecturas-y-adopcion.sql), que solo devuelve filas de los avisos que el
// usuario puede auditar (autor, Room Parent del curso, colegio) — para el
// resto no hay datos y el chip simplemente no aparece.
import { resumenLecturas } from "../hooks/useLecturas";

export function ChipLecturas({ filas, onClick }) {
  if (!filas?.length) return null;
  const { total, leyeron } = resumenLecturas(filas);
  const todos = leyeron === total;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title="Ver quién lo leyó"
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", background: todos ? "#F0FDF4" : "#F1F5F9", color: todos ? "#047857" : "#475569" }}
    >
      👁 {leyeron} de {total} leyeron
    </button>
  );
}

const fmtCuando = (iso) =>
  new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function LecturasModal({ titulo, filas, onClose }) {
  const faltan = filas.filter((f) => !f.leido_en);
  const leyeron = filas.filter((f) => f.leido_en).sort((a, b) => (a.leido_en < b.leido_en ? 1 : -1));
  const sinApp = faltan.filter((f) => !f.tiene_app).length;
  const persona = (f) => (
    <div key={`${f.recordatorio_id}-${f.usuario_id}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #F1F5F9" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{[f.nombre, f.apellido].filter(Boolean).join(" ")}</div>
        {f.hijos && <div style={{ fontSize: 11, color: "#94A3B8" }}>Familia de {f.hijos}</div>}
      </div>
      {f.leido_en
        ? <span style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>{fmtCuando(f.leido_en)}</span>
        : !f.tiene_app && <span title="No tiene la app instalada: no le llegan las notificaciones" style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8, background: "#FFFBEB", color: "#B45309", whiteSpace: "nowrap" }}>Sin app</span>}
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 440, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>¿Quién lo leyó?</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        {titulo && <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{titulo}</div>}
        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 12 }}>
          {leyeron.length} de {filas.length} familias lo leyeron
          {sinApp > 0 && <span style={{ fontWeight: 500, color: "#B45309" }}> · {sinApp} de las que faltan no tienen la app</span>}
        </div>
        <div style={{ overflowY: "auto" }}>
          {faltan.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", marginBottom: 2 }}>Faltan ({faltan.length})</div>
              {faltan.map(persona)}
            </>
          )}
          {leyeron.length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "14px 0 2px" }}>Leyeron ({leyeron.length})</div>
              {leyeron.map(persona)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
