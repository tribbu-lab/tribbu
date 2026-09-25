// Comunidad — agrupa lo que las familias publican entre ellas: Marketplace
// (cosas usadas), Lost&Found y Servicios (próximamente). Un solo ítem en el
// menú; la sub-sección vive en la URL como ?tab=marketplace|perdidos|servicios
// (App.jsx), así los deep-links de push y el Muro abren la pestaña correcta.
import { lazy, Suspense } from "react";
import { Spinner } from "../../components/Spinner";

const Marketplace = lazy(() => import("../marketplace").then((m) => ({ default: m.Marketplace })));
const Perdidos = lazy(() => import("../perdidos").then((m) => ({ default: m.Perdidos })));

const SUBSECCIONES = [
  { id: "marketplace", label: "Marketplace", emoji: "🛍️" },
  { id: "perdidos", label: "Lost&Found", emoji: "🧦" },
  { id: "servicios", label: "Servicios", emoji: "🧑‍🏫" },
];

function Proximamente() {
  return (
    <div style={{ background: "white", border: "1px solid #E7ECF3", borderRadius: 16, padding: "32px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 36 }}>🧑‍🏫</div>
      <div style={{ display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, padding: "4px 10px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>PRÓXIMAMENTE</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 12, color: "#0F172A" }}>Servicios de la comunidad</div>
      <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 6, lineHeight: 1.55, maxWidth: 420, marginInline: "auto" }}>
        Clases particulares, maestras de apoyo, niñeras, animación de cumpleaños, fotografía y más — recomendados por las familias del colegio.
      </div>
    </div>
  );
}

export function Comunidad({ sub = "marketplace", onSub, ...props }) {
  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3 }}>Comunidad</div>
      <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 14 }}>Lo que las familias del colegio comparten entre ellas</div>
      <div role="tablist" aria-label="Secciones de Comunidad" style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
        {SUBSECCIONES.map((s) => {
          const on = sub === s.id;
          return (
            <button key={s.id} role="tab" aria-selected={on} onClick={() => onSub?.(s.id)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: on ? "#0F172A" : "white", color: on ? "white" : "#64748B", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
              {s.emoji} {s.label}{s.id === "servicios" ? <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 800, padding: "1px 6px", borderRadius: 999, background: on ? "rgba(255,255,255,0.18)" : "#FEF3C7", color: on ? "white" : "#92400E" }}>PRONTO</span> : null}
            </button>
          );
        })}
      </div>
      <Suspense fallback={<Spinner />}>
        {sub === "marketplace" && <Marketplace {...props} />}
        {sub === "perdidos" && <Perdidos {...props} embebido />}
        {sub === "servicios" && <Proximamente />}
      </Suspense>
    </div>
  );
}
