/**
 * Indicador de carga centrado.
 * Antes: definido en App.jsx línea 186
 *
 * Uso:
 *   if (loading) return <Spinner />;
 */
export function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div
        style={{
          width:       36,
          height:      36,
          border:      "3px solid #E2E8F0",
          borderTop:   "3px solid #3B82F6",
          borderRadius: "50%",
          animation:   "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
