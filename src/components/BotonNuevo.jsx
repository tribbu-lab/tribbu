// El botón "+ Nuevo" de todas las pantallas (Avisos, Mensajes, Calendario,
// Colectas, Encuestas, Autorizaciones, Lost & Found, Marketplace): mismo
// tamaño, color y texto en todas. Espejo mobile: mobile/components/BotonNuevo.jsx.
export function BotonNuevo({ onClick, label = "Nuevo", ariaLabel, style }) {
  return (
    <button onClick={onClick} aria-label={ariaLabel || label}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36, padding: "0 14px 0 11px", borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap", ...style }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <span style={{ fontSize: 13, fontWeight: 800, color: "white" }}>{label}</span>
    </button>
  );
}
