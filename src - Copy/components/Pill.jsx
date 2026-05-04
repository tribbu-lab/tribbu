import { T } from "../lib/theme";

/**
 * Etiqueta tipo cápsula, ideal para roles, estados y categorías.
 *
 * Uso:
 *   <Pill label="Apoderado" />
 *   <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9" />
 */
export function Pill({ label, color, bg }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "4px 12px",
        borderRadius: 100,
        background: bg || "rgba(59, 130, 246, 0.08)",
        color: color || T.accent,
        whiteSpace: "nowrap",
        letterSpacing: "0.3px",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}
