// Menú de un día como tabla (Entrada / Plato principal / Postre), el mismo en
// el Inicio y en Comedor. Categorías en @shared/menu.
import { filasMenu } from "../lib/menu";

export function TablaMenu({ menu, style }) {
  const filas = filasMenu(menu);
  if (!filas.length) return null;
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 16, background: "white", padding: "6px 18px", ...style }}>
      {filas.map((f, i) => (
        <div key={f.label} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "10px 0", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
          <span style={{ width: 108, flexShrink: 0, fontSize: 12.5, lineHeight: "20px", color: "#64748B", whiteSpace: "nowrap" }}>{f.label}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            {f.platos.map((p, j) => (
              <span key={j} style={{ display: "block", fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "#0F172A", marginTop: j ? 4 : 0 }}>{p}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
