/**
 * Controles de paginación — se integra con useListControls.
 * Antes: definido en App.jsx línea 576
 *
 * Uso:
 *   <Paginador
 *     pagina={ctrl.pagina}
 *     totalPag={ctrl.totalPag}
 *     setPagina={ctrl.setPagina}
 *   />
 */
export function Paginador({ pagina, totalPag, setPagina }) {
  if (totalPag <= 1) return null;

  const btn = (onClick, disabled, label) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:      "5px 10px",
        borderRadius: 8,
        border:       "1px solid #E2E8F0",
        background:   "white",
        cursor:       disabled ? "default" : "pointer",
        fontSize:     12,
        color:        disabled ? "#CBD5E1" : "#0F172A",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16 }}>
      {btn(() => setPagina(1),               pagina === 1,        "«")}
      {btn(() => setPagina((p) => p - 1),    pagina === 1,        "‹")}
      <span style={{ fontSize: 12, color: "#64748B", padding: "0 8px" }}>
        Pág. {pagina} de {totalPag}
      </span>
      {btn(() => setPagina((p) => p + 1),    pagina === totalPag, "›")}
      {btn(() => setPagina(totalPag),        pagina === totalPag, "»")}
    </div>
  );
}
