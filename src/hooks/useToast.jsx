import { useState, useCallback } from "react";

/**
 * Hook simple de toast/notificación.
 * Devuelve { toast, showToast, Toast }
 *
 * Uso:
 *   const { showToast, Toast } = useToast();
 *   // En JSX: <Toast />
 *   // Para mostrar: showToast("Guardado correctamente", "ok")
 *   // Para error:   showToast("Ocurrió un error", "error")
 */
export function useToast(durationMs = 3500) {
  const [toast, setToast] = useState(null); // { msg, type: "ok"|"error"|"info" }

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), durationMs);
  }, [durationMs]);

  const COLOR = {
    ok:    { bg: "#F0FDF4", border: "#10B981", text: "#065F46" },
    error: { bg: "#FFFBEB", border: "#F59E0B", text: "#92400E" },
    info:  { bg: "#EFF6FF", border: "#3B82F6", text: "#1D4ED8" },
  };

  const Toast = () => {
    if (!toast) return null;
    const c = COLOR[toast.type] || COLOR.info;
    return (
      <div style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, maxWidth: 480, width: "90%",
        background: c.bg, border: `1.5px solid ${c.border}`,
        borderRadius: 14, padding: "13px 18px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
        display: "flex", alignItems: "center", gap: 10,
        animation: "fadeInDown 0.2s ease",
      }}>
        <style>{`@keyframes fadeInDown{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
        <div style={{ flex: 1, fontSize: 13, color: c.text, lineHeight: 1.5 }}>{toast.msg}</div>
        <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: c.text, opacity: 0.5, padding: 0, lineHeight: 1 }}>✕</button>
      </div>
    );
  };

  return { toast, showToast, Toast };
}
