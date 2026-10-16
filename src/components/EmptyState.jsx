import { Icono } from "./Icono";

// Estado vacío, sobrio (mismo formato que "Estás al día" del Inicio y que
// mobile/components/EmptyState): círculo gris con un ícono de línea, título,
// nota y una acción opcional como enlace azul. Sin emojis.
export function EmptyState({ icono = "bandeja", titulo, nota, accion, onAccion, sinBorde = false, style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: sinBorde ? "8px 2px" : 16, background: sinBorde ? "transparent" : "white", border: sinBorde ? "none" : "1px solid #E2E8F0", borderRadius: 16, ...style }}>
      <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icono nombre={icono} size={18} color="#475569" />
      </span>
      <span style={{ display: "block", minWidth: 0 }}>
        {titulo ? <span style={{ display: "block", fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{titulo}</span> : null}
        {nota ? <span style={{ display: "block", fontSize: 13, color: "#64748B", marginTop: 2, lineHeight: 1.4 }}>{nota}</span> : null}
        {accion && onAccion ? (
          <button onClick={onAccion} style={{ marginTop: 8, padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#2563EB" }}>{accion} →</span>
          </button>
        ) : null}
      </span>
    </div>
  );
}
