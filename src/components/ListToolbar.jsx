/**
 * Barra de búsqueda, ordenamiento y filtros para listas del admin.
 * Se usa siempre junto con useListControls.
 * Antes: definido en App.jsx línea 542
 *
 * Los filtros son chips agrupados por dimensión (ej. "Rol: Todos /
 * Apoderado / Room Parent / Super Admin"), no <select> — un select oculta
 * las opciones y el estado activo a la vez; los chips muestran ambos y son
 * táctiles (handoff: Tribbu Admin.dc.html, Parte 3 #1). Cada opción puede
 * llevar un `color` opcional para pintar un dot dentro del chip (ej. el
 * color de `ROL_COLOR` en el filtro de rol).
 *
 * Uso:
 *   <ListToolbar
 *     {...ctrl}
 *     sortOptions={[{ key: "nombre", label: "Nombre" }]}
 *     filterOptions={[{ key: "rol", label: "Rol", options: [{value,label,color?}] }]}
 *     placeholder="Buscar usuario..."
 *   />
 */
export function ListToolbar({
  busqueda, setBusqueda,
  sortOptions, sortKey, sortAsc, toggleSort,
  filterOptions, filtros, setFiltro, resetFiltros,
  total,
  placeholder = "Buscar...",
}) {
  const hayFiltros = busqueda || Object.values(filtros).some((v) => v && v !== "all");

  const s = {
    padding:      "8px 12px",
    borderRadius: 10,
    border:       "1.5px solid #E2E8F0",
    fontSize:     12,
    outline:      "none",
    fontFamily:   "inherit",
    background:   "white",
    cursor:       "pointer",
  };

  const chipStyle = (activo) => ({
    display: "flex", alignItems: "center", gap: 6,
    minHeight: 30, padding: "0 12px",
    border: `1px solid ${activo ? "#0F172A" : "#E2E8F0"}`,
    borderRadius: 999,
    background: activo ? "#0F172A" : "white",
    color: activo ? "white" : "#475569",
    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
    cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 2, minWidth: 160, ...s, cursor: "text" }}
        />

        {sortOptions?.length > 0 && (
          <select
            value={sortKey || ""}
            onChange={(e) => toggleSort(e.target.value)}
            style={{ flex: 1, minWidth: 120, ...s }}
          >
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        )}

        {sortOptions && (
          <button onClick={() => toggleSort(sortKey)} style={{ ...s, padding: "8px 10px", minWidth: 36 }}>
            {sortAsc ? "↑" : "↓"}
          </button>
        )}

        {hayFiltros && (
          <button
            onClick={resetFiltros}
            style={{ ...s, color: "#EF4444", borderColor: "#FCA5A5", background: "#FEF2F2", fontWeight: 700 }}
          >
            Limpiar
          </button>
        )}
      </div>

      {filterOptions?.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {filterOptions.map((f, i) => {
            const activo = filtros[f.key] || "all";
            return (
              <div key={f.key} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {i > 0 && <span style={{ width: 1, height: 20, background: "#E2E8F0", margin: "0 2px" }} />}
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#94A3B8" }}>{f.label}</span>
                <button onClick={() => setFiltro(f.key, "all")} style={chipStyle(activo === "all")}>Todos</button>
                {f.options.map((o) => (
                  <button key={o.value} onClick={() => setFiltro(f.key, o.value)} style={chipStyle(activo === o.value)}>
                    {o.color && <span style={{ width: 7, height: 7, borderRadius: 999, background: o.color, flexShrink: 0 }} />}
                    {o.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
        {total} resultado{total !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
