import { useState } from "react";
import { Card } from "./Card";

/**
 * Modal genérico de alta/edición para Super Admin (handoff Tribbu Admin,
 * Parte 6): un solo componente (560px, header emoji+título+subtítulo, cuerpo
 * en grilla de 2 columnas, footer Eliminar/Cancelar/Guardar) que reemplaza
 * los formularios hechos a mano, declarando solo sus campos.
 *
 * Cada campo: { key, label, tipo: "texto"|"area"|"opciones"|"color"|"hora",
 *   placeholder, span (1|2, default 1), opciones ([{value,label}], para tipo
 *   "opciones"), requerido (bool), ayuda (texto chico debajo del campo) }.
 *
 * El botón primario queda deshabilitado hasta que los `requerido` estén
 * completos; el borde rojo en un campo faltante solo aparece después de un
 * intento de guardar fallido (no mientras se escribe).
 *
 * Uso:
 *   <AdminFormModal
 *     emoji="🕐" titulo="Nueva clase" subtitulo={cursoSel?.nombre}
 *     campos={[
 *       {key:"dia", label:"Día", tipo:"opciones", opciones:DIAS, span:2},
 *       {key:"materia", label:"Materia", tipo:"texto", requerido:true, span:2},
 *     ]}
 *     form={form} setForm={setForm}
 *     saving={saving} editing={!!form?.id}
 *     onCancelar={...} onGuardar={...} onEliminar={...}
 *   />
 */
export function AdminFormModal({
  emoji,
  titulo,
  subtitulo,
  aviso,
  campos,
  form,
  setForm,
  saving = false,
  editing = false,
  onCancelar,
  onGuardar,
  onEliminar,
}) {
  const [intentoGuardar, setIntentoGuardar] = useState(false);

  const faltantes = campos.filter((c) => c.requerido && !String(form?.[c.key] ?? "").trim());
  const puedeGuardar = faltantes.length === 0;

  const inp = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };
  const inpErr = { ...inp, border: "1.5px solid #FCA5A5", background: "#FEF2F2" };

  const guardar = () => {
    if (!puedeGuardar) { setIntentoGuardar(true); return; }
    onGuardar();
  };

  const setCampo = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 900 }}>
            {emoji ? `${emoji} ` : ""}
            {titulo}
          </div>
          {subtitulo && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{subtitulo}</div>}
        </div>

        {aviso && (
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 12px", marginBottom: 16, fontSize: 12, color: "#1D4ED8", lineHeight: 1.5 }}>
            💡 {aviso}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
          {campos.map((c) => {
            const err = intentoGuardar && c.requerido && !String(form?.[c.key] ?? "").trim();
            const valor = form?.[c.key] ?? "";
            return (
              <div key={c.key} style={{ gridColumn: c.span === 2 ? "1 / -1" : undefined }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: err ? "#EF4444" : "#94A3B8", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {c.label}
                  {c.requerido ? " *" : ""}
                </div>

                {c.tipo === "area" ? (
                  <textarea value={valor} onChange={(e) => setCampo(c.key, e.target.value)} placeholder={c.placeholder} rows={3} style={{ ...(err ? inpErr : inp), resize: "vertical" }} />
                ) : c.tipo === "hora" ? (
                  <input type="time" value={valor} onChange={(e) => setCampo(c.key, e.target.value)} style={err ? inpErr : inp} />
                ) : c.tipo === "color" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(c.opciones || ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#6366F1"]).map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setCampo(c.key, col)}
                        style={{ width: 28, height: 28, borderRadius: 8, background: col, border: valor === col ? "3px solid #0F172A" : "2px solid transparent", cursor: "pointer" }}
                      />
                    ))}
                  </div>
                ) : c.tipo === "opciones" ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(c.opciones || []).map((o) => {
                      const activo = valor === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setCampo(c.key, o.value)}
                          style={{
                            minHeight: 44,
                            padding: "0 14px",
                            borderRadius: 10,
                            border: `1.5px solid ${activo ? "#0F172A" : err ? "#FCA5A5" : "#E2E8F0"}`,
                            background: activo ? "#0F172A" : "white",
                            color: activo ? "white" : "#475569",
                            cursor: "pointer",
                            fontSize: 12.5,
                            fontWeight: 700,
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <input value={valor} onChange={(e) => setCampo(c.key, e.target.value)} placeholder={c.placeholder} style={err ? inpErr : inp} />
                )}

                {c.ayuda && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{c.ayuda}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {editing && onEliminar && (
            <button onClick={onEliminar} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#EF4444", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Eliminar
            </button>
          )}
          <button onClick={onCancelar} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#94A3B8" }}>
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={saving || (intentoGuardar && !puedeGuardar)}
            style={{
              flex: 2,
              padding: 11,
              borderRadius: 10,
              border: "none",
              background: saving ? "#93C5FD" : "#3B82F6",
              color: "white",
              cursor: saving ? "default" : "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </Card>
    </div>
  );
}
