import { useEffect, useRef } from "react";

// Pestañas internas de Agenda (Calendario + Cumpleaños) y Comunicaciones
// (Avisos + Mensajes): cada pantalla sigue siendo su propio ?tab=. Mobile:
// mobile/components/SubTabs.jsx. `desplazable`: muchas pestañas (panel del
// colegio) — cada una con su ancho y la fila se desplaza de costado.
export function SubSeccion({ items, activo, onIr, desplazable = false }) {
  // Con la fila desplazable, la pestaña activa siempre a la vista.
  const fila = useRef(null);
  useEffect(() => {
    if (!desplazable || !fila.current) return;
    const b = fila.current.querySelector("[data-activa]");
    if (b) fila.current.scrollLeft = Math.max(0, b.offsetLeft - (fila.current.clientWidth - b.offsetWidth) / 2);
  }, [activo, desplazable]);
  return (
    <div ref={fila} style={{ position: "relative", display: desplazable ? "inline-flex" : "flex", background: "#F1F5F9", borderRadius: 999, padding: 4, marginBottom: 18, maxWidth: desplazable ? "100%" : 420, overflowX: desplazable ? "auto" : undefined, scrollbarWidth: desplazable ? "none" : undefined, boxSizing: "border-box" }}>
      {items.map((it) => {
        const on = it.id === activo;
        return (
          <button
            key={it.id}
            data-activa={on ? "" : undefined}
            onClick={() => (on ? null : onIr(it.id))}
            style={{ flex: desplazable ? "0 0 auto" : 1, padding: desplazable ? "0 14px" : undefined, whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 36, borderRadius: 999, border: on ? "1px solid #E2E8F0" : "1px solid transparent", background: on ? "white" : "transparent", cursor: on ? "default" : "pointer", fontFamily: "inherit" }}
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
