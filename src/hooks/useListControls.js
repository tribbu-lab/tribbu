import { useState } from "react";

/**
 * Maneja búsqueda, ordenamiento, filtros y paginación sobre una lista.
 * Antes: definido inline en App.jsx línea 494
 *
 * Uso:
 *   const ctrl = useListControls(usuarios, {
 *     searchFn: (u, q) => u.nombre.toLowerCase().includes(q),
 *     sortOptions: [
 *       { key: "nombre", label: "Nombre", val: u => u.nombre },
 *     ],
 *     filterOptions: [
 *       { key: "rol", label: "Rol", options: [...], match: (u, v) => u.rol === v },
 *     ],
 *     pageSize: 12,
 *   });
 *
 *   // Usar en JSX:
 *   <ListToolbar {...ctrl} />
 *   {ctrl.items.map(u => <UsuarioCard key={u.id} usuario={u} />)}
 *   <Paginador pagina={ctrl.pagina} totalPag={ctrl.totalPag} setPagina={ctrl.setPagina} />
 */
export function useListControls(items, { searchFn, sortOptions, filterOptions, pageSize = 12 }) {
  const [busqueda, setBusqueda] = useState("");
  const [sortKey,  setSortKey]  = useState(sortOptions?.[0]?.key || null);
  const [sortAsc,  setSortAsc]  = useState(true);
  const [filtros,  setFiltros]  = useState({});
  const [pagina,   setPagina]   = useState(1);

  const toggleSort = (key) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(true); }
    setPagina(1);
  };

  const setFiltro   = (k, v) => { setFiltros((p) => ({ ...p, [k]: v })); setPagina(1); };
  const resetFiltros = ()     => { setFiltros({}); setBusqueda(""); setPagina(1); };

  const filtered = items.filter((item) => {
    if (busqueda && searchFn && !searchFn(item, busqueda.toLowerCase())) return false;
    for (const [k, v] of Object.entries(filtros)) {
      if (!v || v === "all") continue;
      const opt = filterOptions?.find((f) => f.key === k);
      if (opt && !opt.match(item, v)) return false;
    }
    return true;
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const opt = sortOptions?.find((s) => s.key === sortKey);
        if (!opt) return 0;
        const va = opt.val(a), vb = opt.val(b);
        const cmp =
          typeof va === "string"
            ? va.localeCompare(vb, "es")
            : (va ?? Infinity) - (vb ?? Infinity);
        return sortAsc ? cmp : -cmp;
      })
    : filtered;

  const totalPag     = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginaActual = Math.min(pagina, totalPag);
  const paginados    = sorted.slice((paginaActual - 1) * pageSize, paginaActual * pageSize);

  return {
    busqueda,  setBusqueda,
    sortKey,   sortAsc, toggleSort,
    filtros,   setFiltro, resetFiltros,
    pagina:    paginaActual,
    setPagina,
    totalPag,
    filtered:  sorted,
    items:     paginados,
    total:     sorted.length,
    // Exponer filterOptions para poder mutarlos externamente (ej. opciones dinámicas de curso)
    filterOptions,
  };
}
