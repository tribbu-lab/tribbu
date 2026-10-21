// Campo de texto de un comunicado con una barrita de formato (B, I, Título,
// listas, Link) y "Vista previa". Las marcas se insertan alrededor de lo
// seleccionado (lib/formato → aplicarMarca); lo que se guarda sigue siendo texto.
import { useRef, useState } from "react";
import { aplicarMarca, BOTONES_FORMATO } from "../lib/formato";
import { TextoConFormato } from "./TextoConFormato";

export function EditorFormato({ value, onChange, rows = 5, placeholder, style, ariaLabel = "Texto" }) {
  const ref = useRef(null);
  const [vista, setVista] = useState(false);

  const marcar = (tipo) => {
    const el = ref.current;
    // Link: inserta [texto](https://) con la dirección seleccionada para tipearla
    // (window.prompt no aparece en algunos navegadores embebidos).
    const r = aplicarMarca(value || "", el?.selectionStart, el?.selectionEnd, tipo);
    onChange(r.texto);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(r.desde, r.hasta);
    });
  };

  const boton = { minWidth: 34, height: 30, padding: "0 9px", borderRadius: 8, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" };
  return (
    <div>
      <div role="toolbar" aria-label="Formato del texto" style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        {BOTONES_FORMATO.map((b) => (
          <button key={b.tipo} type="button" onClick={() => marcar(b.tipo)} disabled={vista} title={b.etiqueta} aria-label={b.etiqueta} style={{ ...boton, opacity: vista ? 0.4 : 1 }}>
            <span style={{ fontSize: 12.5, color: "#334155", fontWeight: b.tipo === "negrita" ? 900 : 700, fontStyle: b.tipo === "cursiva" ? "italic" : undefined }}>{b.l}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setVista((v) => !v)} aria-pressed={vista} style={{ ...boton, border: `1px solid ${vista ? "#3B82F6" : "#E2E8F0"}`, background: vista ? "#EFF6FF" : "white" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: vista ? "#1D4ED8" : "#64748B" }}>{vista ? "Editar" : "Vista previa"}</span>
        </button>
      </div>
      {vista ? (
        <div style={{ minHeight: rows * 20, padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "white", ...style, resize: undefined }}>
          {value?.trim() ? <TextoConFormato texto={value} fontSize={13.5} /> : <span style={{ fontSize: 13, color: "#94A3B8" }}>Nada para mostrar todavía.</span>}
        </div>
      ) : (
        <textarea ref={ref} value={value || ""} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} aria-label={ariaLabel} style={style} />
      )}
    </div>
  );
}
