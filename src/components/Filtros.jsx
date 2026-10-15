// Filtros en un solo botón: "Filtros (2)" abre un modal con cada grupo de
// opciones como chips (misma idea que mobile/components/Filtros.jsx).
//
//   <BotonFiltros grupos={grupos} onClick={() => setAbierto(true)} />
//   {abierto && <FiltrosModal grupos={grupos} onClose={...} onLimpiar={...}/>}
//
// grupos = [{ key, label, options: [{ value, label }], value, onChange }]. Un
// filtro está "activo" cuando su valor no es `defecto` (o la primera opción).

const filtrosActivos = (grupos) => grupos.filter((g) => g.value !== (g.defecto ?? g.options[0]?.value)).length;

export function BotonFiltros({ grupos, onClick }) {
  const n = filtrosActivos(grupos);
  return (
    <button onClick={onClick} aria-label={n ? `Filtros, ${n} activos` : "Filtros"}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 8, border: `1px solid ${n ? "#BFDBFE" : "#E2E8F0"}`, background: n ? "#EFF6FF" : "white", cursor: "pointer", fontFamily: "inherit" }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={n ? "#1D4ED8" : "#475569"} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" />
      </svg>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: n ? "#1D4ED8" : "#334155" }}>Filtros</span>
      {n > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#2563EB", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}><span style={{ fontSize: 11, fontWeight: 800, color: "white" }}>{n}</span></span>}
    </button>
  );
}

export function FiltrosModal({ grupos, onClose, onLimpiar, children }) {
  const n = filtrosActivos(grupos);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label="Filtros" onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>Filtros</span>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#94A3B8", padding: 4 }}>✕</button>
        </div>
        {grupos.map((g) => (
          <div key={g.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>{g.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {g.options.map((o) => {
                const on = g.value === o.value;
                return (
                  <button key={o.value} onClick={() => g.onChange(o.value)} style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? "#0F172A" : "#E2E8F0"}`, background: on ? "#0F172A" : "white", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: on ? "white" : "#334155" }}>{o.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {children}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
          {n > 0 ? <button onClick={onLimpiar || (() => grupos.forEach((g) => g.onChange(g.defecto ?? g.options[0].value)))} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}><span style={{ fontSize: 13.5, fontWeight: 700, color: "#64748B" }}>Limpiar filtros</span></button> : <span />}
          <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", fontFamily: "inherit" }}><span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Listo</span></button>
        </div>
      </div>
    </div>
  );
}
