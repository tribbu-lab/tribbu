import { T } from "../lib/theme";

/**
 * Tarjeta blanca con sombra suave.
 *
 * Uso:
 *   <Card>contenido</Card>
 *   <Card style={{ padding: 12 }}>contenido</Card>
 */
export function Card({ children, style = {} }) {
  return (
    <div
      style={{
        background: T.white,
        borderRadius: 20,
        padding: "20px",
        marginBottom: "16px",
        boxShadow:
          "0 10px 15px -3px rgba(15, 23, 42, 0.04), 0 4px 6px -2px rgba(15, 23, 42, 0.02)",
        border: `1px solid ${T.border}`,
        transition: "transform 0.2s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
