import { T } from "../lib/theme";

/**
 * Etiqueta en cápsula — usada para roles, materias, estados, etc.
 * Antes: definido en App.jsx línea 173
 *
 * Uso:
 *   <Pill label="Room Parent" color="#10B981" bg="#F0FDF4" />
 *   <Pill label="Inactivo" />   ← usa defaults azules
 */
export function Pill({ label, color, bg }) {
  return (
    <span
      style={{
        fontSize:        10,
        fontWeight:      700,
        padding:         "4px 12px",
        borderRadius:    100,
        background:      bg    || "rgba(59, 130, 246, 0.08)",
        color:           color || T.accent,
        whiteSpace:      "nowrap",
        letterSpacing:   "0.3px",
        textTransform:   "uppercase",
      }}
    >
      {label}
    </span>
  );
}
