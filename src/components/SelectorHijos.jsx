// Selector de "Mi acceso" (Todos mis hijos / un hijo / un curso), como en el
// prototipo: un desplegable sobrio arriba de cada sección (en Hoy, debajo del
// saludo) en vez de los botones del header/sidebar. Solo con más de un acceso.
// En el desplegable también se cambia el color del hijo elegido. Mobile:
// mobile/components/SelectorHijos.jsx.
import { useState } from "react";
import { Icono } from "./Icono";
import { HIJO_COLORS_CUSTOM, ROL_LABEL } from "../lib/theme";

const nombreItem = (item, esDocente) =>
  item._tipo === "todos" ? (esDocente ? "Todos mis cursos" : "Todos mis hijos")
  : item._tipo === "hijo" ? item.nombre?.split(" ")[0]
  : `${item.avatar ? item.avatar + " " : ""}${item.nombre}`;

function Marca({ item, color }) {
  if (item._tipo === "todos") return <Icono nombre="usuarios" size={17} color="#475569" />;
  if (item._tipo === "hijo") return <span style={{ width: 10, height: 10, borderRadius: 999, background: color || "#94A3B8", flexShrink: 0 }} />;
  return <Icono nombre="curso" size={16} color="#475569" />;
}

export function SelectorHijos({ items, cursoIdx, onElegir, colorDe, colorCustomDe, onColor, esDocente, style }) {
  const [abierto, setAbierto] = useState(false);
  if (!items || items.length < 2) return null;
  const actual = items[cursoIdx] || items[0];
  return (
    <div style={{ position: "relative", display: "inline-block", maxWidth: "100%", ...style }}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, maxWidth: "100%", padding: "0 14px", borderRadius: 999, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}
      >
        <Marca item={actual} color={colorDe(actual)} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombreItem(actual, esDocente)}</span>
        <Icono nombre="chevron" size={16} color="#64748B" />
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 300 }} />
          <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 301, minWidth: 240, background: "white", border: "1px solid #E2E8F0", borderRadius: 14, boxShadow: "0 12px 32px rgba(15,23,42,0.12)", overflow: "hidden" }}>
            {items.map((item, i) => {
              const on = i === cursoIdx;
              return (
                <button
                  key={item.id ?? i}
                  role="option"
                  aria-selected={on}
                  onClick={() => { onElegir(i); setAbierto(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", border: "none", borderTop: i ? "1px solid #F1F5F9" : "none", background: on ? "#F8FAFC" : "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                >
                  <Marca item={item} color={colorDe(item)} />
                  <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: on ? 800 : 600, color: "#0F172A" }}>{nombreItem(item, esDocente)}</span>
                    {item._tipo === "hijo" && item.rolEfectivo && item.rolEfectivo !== "padre" ? <span style={{ display: "block", fontSize: 11.5, color: "#64748B" }}>{ROL_LABEL[item.rolEfectivo] || item.rolEfectivo}</span> : null}
                  </span>
                  {on ? <Icono nombre="check" size={18} color="#2563EB" /> : null}
                </button>
              );
            })}
            {actual._tipo === "hijo" && onColor ? (
              <div style={{ borderTop: "1px solid #F1F5F9", padding: "10px 14px 12px" }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>Color de {nombreItem(actual)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {HIJO_COLORS_CUSTOM.map((col) => (
                    <button key={col} aria-label={`Color ${col}`} onClick={() => onColor(cursoIdx, col)} style={{ width: 26, height: 26, borderRadius: 999, background: col, border: colorCustomDe(actual) === col ? "3px solid #0F172A" : "2px solid transparent", cursor: "pointer", padding: 0 }} />
                  ))}
                </div>
                {colorCustomDe(actual) ? (
                  <button onClick={() => onColor(cursoIdx, null)} style={{ marginTop: 8, padding: 0, border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#2563EB", fontFamily: "inherit" }}>Restablecer color</button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
