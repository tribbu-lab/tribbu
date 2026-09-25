// src/components/PreferenciasAvisos.jsx
//
// "Notificaciones": qué avisos automáticos (Edge Function avisos-automaticos)
// quiere recibir la familia. Tabla preferencias_avisos (sin fila = todos
// activados). No afecta las notificaciones "en vivo" (un aviso nuevo, una
// alerta del curso), que siempre llegan.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { TIPOS_AVISO, preferenciasEfectivas, filaPreferencias } from "../lib/avisos";


export function PreferenciasAvisosModal({ userId, onClose }) {
  const [prefs, setPrefs] = useState(null);
  const [guardando, setGuardando] = useState(null); // clave en vuelo
  const [error, setError] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase.from("preferencias_avisos").select("*").eq("usuario_id", userId).maybeSingle().then(({ data }) => {
      if (vivo) setPrefs(preferenciasEfectivas(data));
    });
    return () => { vivo = false; };
  }, [userId]);

  const cambiar = async (k) => {
    const nuevo = { ...prefs, [k]: !prefs[k] };
    setPrefs(nuevo); // optimista
    setGuardando(k); setError(null);
    const { error: err } = await supabase.from("preferencias_avisos").upsert(filaPreferencias(userId, nuevo), { onConflict: "usuario_id" });
    setGuardando(null);
    if (err) { setPrefs(prefs); setError("No se pudo guardar. Probá de nuevo."); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>⚙️ Configurar notificaciones</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 14, lineHeight: 1.45 }}>
          Avisos automáticos que te manda tribbu al celular. Los avisos y alertas que publica el curso te llegan siempre.
        </div>
        {!prefs ? <div style={{ fontSize: 13, color: "#94A3B8" }}>Cargando…</div> : TIPOS_AVISO.map((t) => (
          <label key={t.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #F1F5F9", cursor: "pointer" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>{t.titulo}</div>
              <div style={{ fontSize: 11.5, color: "#94A3B8" }}>{t.desc}</div>
            </div>
            <input type="checkbox" checked={!!prefs[t.k]} disabled={guardando === t.k} onChange={() => cambiar(t.k)} style={{ width: 20, height: 20, accentColor: "#3B82F6", cursor: "pointer" }} />
          </label>
        ))}
        {error && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 8 }}>{error}</div>}
      </div>
    </div>
  );
}
