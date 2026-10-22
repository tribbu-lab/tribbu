import { useState } from "react";
import { BotonFiltros, FiltrosModal } from "./Filtros";
import { Buscador } from "./Buscador";
import { gruposFiltros } from "../lib/gruposFiltros";

/**
 * Barra de búsqueda + "Filtros" para listas (panel del colegio, Cumpleaños,
 * Talleres…). Se usa siempre junto con useListControls.
 *
 * Mismo aspecto que el resto de la app (2026-10-22): el Buscador con lupa y
 * un solo botón "Filtros" que abre el modal con cada filtro como chips y,
 * al final, el orden ("Ordenar por" y el sentido). Antes había un <select>
 * de orden, una flecha ↑/↓ y un botón rojo "Limpiar" a la vista.
 *
 * Uso:
 *   <ListToolbar
 *     {...ctrl}
 *     sortOptions={[{ key: "nombre", label: "Nombre" }]}
 *     filterOptions={[{ key: "rol", label: "Rol", options: [{value,label}] }]}
 *     placeholder="Buscar usuario..."
 *   />
 */
export function ListToolbar({
  busqueda, setBusqueda,
  sortOptions, sortKey, sortAsc, toggleSort,
  filterOptions, filtros, setFiltro,
  total,
  placeholder = "Buscar...",
}) {
  const [abierto, setAbierto] = useState(false);
  const grupos = gruposFiltros({ filterOptions, filtros, setFiltro, sortOptions, sortKey, sortAsc, toggleSort });

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Buscador value={busqueda} onChange={setBusqueda} placeholder={placeholder} style={{ flex: "1 1 200px", minWidth: 0, marginBottom: 0 }} />
        {grupos.length > 0 && <BotonFiltros grupos={grupos} onClick={() => setAbierto(true)} />}
      </div>
      {abierto && <FiltrosModal grupos={grupos} onClose={() => setAbierto(false)} />}
      <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 8 }}>
        {total} resultado{total !== 1 ? "s" : ""}
      </div>
    </div>
  );
}
