// Ayuda (Mi cuenta → Ayuda y soporte): preguntas frecuentes de las familias
// sobre lo básico de la app, con buscador y un botón que lleva a la pantalla,
// y al final "Escribile al equipo de tribbu" (el chat de soporte de siempre).
// Contenido en src/lib/ayuda.js (@shared/ayuda), el mismo que mobile.
import { useState } from "react";
import { buscarPreguntas } from "../../lib/ayuda";
import { Icono } from "../../components/Icono";
import { EmptyState } from "../../components/EmptyState";

const tarjeta = { background: "white", border: "1px solid #E7ECF3", borderRadius: 16, overflow: "hidden" };

function Pregunta({ p, primera, abierta, onToggle, onIr }) {
  return (
    <div style={{ borderTop: primera ? "none" : "1px solid #F1F5F9" }}>
      <button onClick={onToggle} aria-expanded={abierta} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: "#0F172A", lineHeight: 1.35 }}>{p.pregunta}</span>
        <Icono nombre="chevron" size={18} color="#94A3B8" style={{ transform: abierta ? "rotate(180deg)" : "none", transition: "transform .15s", flexShrink: 0 }} />
      </button>
      {abierta && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.55 }}>{p.respuesta}</div>
          {p.ir?.web && (
            <button onClick={() => onIr(p.ir.web)} style={{ marginTop: 10, border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "#2563EB" }}>{p.ir.label} →</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Ayuda({ onIr, onSoporte, onVolver }) {
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState(null);
  const grupos = buscarPreguntas(busqueda);
  return (
    <div style={{ maxWidth: 680 }}>
      {onVolver && (
        <button onClick={onVolver} style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "none", background: "none", padding: 0, marginBottom: 10, cursor: "pointer", fontFamily: "inherit" }}>
          <Icono nombre="atras" size={17} color="#2563EB" /><span style={{ fontSize: 14, fontWeight: 700, color: "#2563EB" }}>Mi cuenta</span>
        </button>
      )}
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Ayuda</div>
      <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 4, marginBottom: 16 }}>Cómo hacer lo básico en tribbu. Si no encontrás lo que buscás, escribinos.</div>
      <div style={{ position: "relative", marginBottom: 18 }}>
        <Icono nombre="lupa" size={17} color="#94A3B8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar: colecta, autorización, contraseña…" aria-label="Buscar en la ayuda"
          style={{ width: "100%", padding: "11px 12px 11px 36px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", fontFamily: "inherit", background: "white", boxSizing: "border-box" }} />
      </div>
      {grupos.length === 0 ? (
        <EmptyState icono="lupa" titulo="No encontramos nada con esa búsqueda" nota="Probá con otra palabra o escribile al equipo de tribbu." accion="Escribirnos" onAccion={onSoporte} />
      ) : grupos.map((g) => (
        <div key={g.tema} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.7, margin: "0 2px 8px" }}>{g.tema}</div>
          <div style={tarjeta}>
            {g.items.map((p, i) => (
              <Pregunta key={p.id} p={p} primera={i === 0} abierta={abierta === p.id || !!busqueda.trim() && g.items.length === 1}
                onToggle={() => setAbierta((a) => (a === p.id ? null : p.id))} onIr={onIr} />
            ))}
          </div>
        </div>
      ))}
      <button onClick={onSoporte} style={{ ...tarjeta, width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", marginTop: 6 }}>
        <span style={{ width: 38, height: 38, borderRadius: 999, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono nombre="salvavidas" size={19} color="#475569" /></span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "#0F172A" }}>¿No encontraste lo que buscabas?</span>
          <span style={{ display: "block", fontSize: 13, color: "#64748B", marginTop: 2 }}>Escribile al equipo de tribbu</span>
        </span>
        <Icono nombre="flecha" size={17} color="#94A3B8" />
      </button>
    </div>
  );
}
