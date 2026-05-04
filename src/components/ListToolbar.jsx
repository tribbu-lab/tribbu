/**
 * Barra de búsqueda, ordenamiento y filtros para listas del admin.
 * Se usa siempre junto con useListControls.
 * Antes: definido en App.jsx línea 542
 *
 * Uso:
 *   <ListToolbar
 *     {...ctrl}
 *     sortOptions={[{ key: "nombre", label: "Nombre" }]}
 *     filterOptions={[{ key: "rol", label: "Rol", options: [...] }]}
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
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {filterOptions.map((f) => (
            <select
              key={f.key}
              value={filtros[f.key] || "all"}
              onChange={(e) => setFiltro(f.key, e.target.value)}
              style={{ ...s, fontSize: 11, padding: "5px 10px" }}
            >
              <option value="all">{f.label}: Todos</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6 }}>
        {total} resultado{total !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
