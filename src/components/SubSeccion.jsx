// Pestañas internas de Agenda (Calendario + Cumpleaños) y Comunicaciones
// (Avisos + Mensajes): cada pantalla sigue siendo su propio ?tab=. Mobile:
// mobile/components/SubTabs.jsx.
export function SubSeccion({ items, activo, onIr }) {
  return (
    <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 999, padding: 4, marginBottom: 18, maxWidth: 420 }}>
      {items.map((it) => {
        const on = it.id === activo;
        return (
          <button
            key={it.id}
            onClick={() => (on ? null : onIr(it.id))}
            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, borderRadius: 999, border: on ? "1px solid #E2E8F0" : "1px solid transparent", background: on ? "white" : "transparent", cursor: on ? "default" : "pointer", fontFamily: "inherit" }}
          >
            <span style={{ fontSize: 13.5, fontWeight: on ? 800 : 600, color: on ? "#1D4ED8" : "#64748B" }}>{it.label}</span>
            {it.badge > 0 ? (
              <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#EF4444", color: "white", fontSize: 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{it.badge > 9 ? "9+" : it.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
