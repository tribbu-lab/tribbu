import { Card } from "./Card";

/**
 * Confirmación genérica para acciones destructivas (handoff Tribbu Admin,
 * Parte 6: "Confirmaciones destructivas" — 440px, icono rojo, título en
 * pregunta, y cuando corresponde la lista concreta de consecuencias).
 * Reemplaza los `window.confirm` / clics directos sin aviso.
 *
 * Uso:
 *   <ConfirmDestructivoModal
 *     titulo="¿Rotar este código?"
 *     detalle="El código ABC123 deja de funcionar de inmediato."
 *     consecuencias={["3 familias no registradas todavía perderán este código"]}
 *     confirmando={saving}
 *     textoConfirmar="Rotar código"
 *     onCancelar={() => setX(null)}
 *     onConfirmar={hacerAlgo}
 *   />
 */
export function ConfirmDestructivoModal({
  titulo,
  detalle,
  consecuencias,
  confirmando = false,
  textoConfirmar = "Eliminar",
  colorAccion = "#EF4444",
  onCancelar,
  onConfirmar,
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", paddingTop: 6 }}>{titulo}</div>
        </div>
        {detalle && <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: consecuencias?.length ? 10 : 18 }}>{detalle}</div>}
        {consecuencias?.length > 0 && (
          <ul style={{ margin: "0 0 18px", paddingLeft: 18, fontSize: 12.5, color: "#7F1D1D", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px 10px 28px", lineHeight: 1.7 }}>
            {consecuencias.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancelar} disabled={confirmando} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#94A3B8" }}>
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            disabled={confirmando}
            style={{ flex: 2, padding: 11, borderRadius: 10, border: "none", background: colorAccion, color: "white", cursor: confirmando ? "default" : "pointer", fontSize: 13, fontWeight: 700, opacity: confirmando ? 0.7 : 1 }}
          >
            {confirmando ? "Un momento..." : textoConfirmar}
          </button>
        </div>
      </Card>
    </div>
  );
}
