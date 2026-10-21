// Membrete de un comunicado del colegio (recordatorios.con_membrete): arriba
// logo + nombre + línea, abajo la firma. Sobrio: grises, sin colores nuevos.
// `m` = membreteDe(colegio, nivel) de lib/formato.
import { SignedImg } from "./SignedImg";

export function MembreteEncabezado({ m }) {
  if (!m) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #E2E8F0" }}>
      {m.logo
        ? <SignedImg src={m.logo} bucket="adjuntos" alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 8, flexShrink: 0, background: "white" }} />
        : null}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A", letterSpacing: 0.2 }}>{m.nombre}</div>
        {m.linea ? <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 1 }}>{m.linea}</div> : null}
      </div>
    </div>
  );
}

export function MembreteFirma({ m }) {
  if (!m?.firma) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid #E2E8F0", textAlign: "right" }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#334155", whiteSpace: "pre-line" }}>{m.firma}</span>
    </div>
  );
}
