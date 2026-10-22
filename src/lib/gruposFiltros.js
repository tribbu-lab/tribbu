// Grupos del botón "Filtros" (components/Filtros, web y mobile) para las listas
// que usan useListControls + ListToolbar: cada filtro como chips con "Todos"
// primero y, al final, el orden ("Ordenar por" y el sentido). El orden nunca
// cuenta como filtro activo (su `defecto` es el valor actual), así "Filtros
// (2)" y "Limpiar filtros" solo miran los filtros de verdad. Puro: lo usan
// src/components/ListToolbar.jsx y mobile/components/ListToolbar.jsx.
export function gruposFiltros({ filterOptions = [], filtros = {}, setFiltro, sortOptions = [], sortKey, sortAsc, toggleSort }) {
  const grupos = (filterOptions || []).map((f) => ({
    key: f.key,
    label: f.label,
    value: filtros[f.key] || "all",
    onChange: (v) => setFiltro(f.key, v),
    options: [{ value: "all", label: "Todos" }, ...f.options.map((o) => ({ value: o.value, label: o.label }))],
  }));
  if (sortOptions?.length && toggleSort) {
    const sentido = sortAsc ? "asc" : "desc";
    grupos.push(
      { key: "_orden", label: "Ordenar por", value: sortKey, defecto: sortKey, options: sortOptions.map((o) => ({ value: o.key, label: o.label })), onChange: (k) => { if (k !== sortKey) toggleSort(k); } },
      { key: "_sentido", label: "Sentido", value: sentido, defecto: sentido, options: [{ value: "asc", label: "Ascendente" }, { value: "desc", label: "Descendente" }], onChange: (v) => { if (v !== sentido) toggleSort(sortKey); } },
    );
  }
  return grupos;
}
