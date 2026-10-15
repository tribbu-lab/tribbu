// Campo de búsqueda de las listas (Avisos, Mensajes…): lupa + texto + ✕ para
// borrar. Mismo aspecto en todas las pantallas. Espejo mobile: mobile/components/Buscador.jsx.
import { Icono } from "./Icono";

export function Buscador({ value, onChange, placeholder = "Buscar…", style }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 12px", border: "1px solid #E2E8F0", borderRadius: 999, background: "white", boxSizing: "border-box", marginBottom: 12, ...style }}>
      <Icono nombre="lupa" size={17} color="#94A3B8" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: "#0F172A", fontFamily: "inherit" }}
      />
      {value ? (
        <button onClick={() => onChange("")} aria-label="Borrar búsqueda" style={{ border: "none", background: "none", cursor: "pointer", padding: 2, display: "flex" }}>
          <Icono nombre="cerrar" size={15} color="#94A3B8" />
        </button>
      ) : null}
    </div>
  );
}
