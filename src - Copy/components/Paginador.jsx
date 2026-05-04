/**
 * Barra de paginación.
 * No renderiza nada si solo hay una página.
 *
 * Uso:
 *   <Paginador pagina={pagina} totalPag={totalPag} setPagina={setPagina} />
 */
export function Paginador({ pagina, totalPag, setPagina }) {
  if (totalPag <= 1) return null;

  const btn = (disabled) => ({
    padding: "5px 10px",
    borderRadius: 8,
    border: "1px solid #E2E8F0",
    background: "white",
    cursor: disabled ? "default" : "pointer",
    fontSize: 12,
    color: disabled ? "#CBD5E1" : "#0F172A",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginTop: 16,
      }}
    >
      <button
        onClick={() => setPagina(1)}
        disabled={pagina === 1}
        style={btn(pagina === 1)}
      >
        «
      </button>
      <button
        onClick={() => setPagina((p) => Math.max(1, p - 1))}
        disabled={pagina === 1}
        style={btn(pagina === 1)}
      >
        ‹
      </button>
      <span style={{ fontSize: 12, color: "#64748B", padding: "0 8px" }}>
        Pág. {pagina} de {totalPag}
      </span>
      <button
        onClick={() => setPagina((p) => Math.min(totalPag, p + 1))}
        disabled={pagina === totalPag}
        style={btn(pagina === totalPag)}
      >
        ›
      </button>
      <button
        onClick={() => setPagina(totalPag)}
        disabled={pagina === totalPag}
        style={btn(pagina === totalPag)}
      >
        »
      </button>
    </div>
  );
}
