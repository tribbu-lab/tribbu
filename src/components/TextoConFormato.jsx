// Comunicado con formato (negrita, cursiva, títulos, listas, links) desde los
// nodos de lib/formato — nunca HTML crudo. Cada span lleva su color porque
// index.css fija *{color} (el color no se hereda en la web).
import { bloquesDeTexto } from "../lib/formato";
import { safeUrl } from "../lib/helpers";

function Partes({ partes, color }) {
  return partes.map((p, k) => {
    const estilo = { color, fontWeight: p.b ? 800 : undefined, fontStyle: p.i ? "italic" : undefined };
    if (p.t === "link") {
      const url = safeUrl(p.url);
      return url
        ? <a key={k} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...estilo, color: "#2563EB", textDecoration: "underline", wordBreak: "break-word" }}>{p.v}</a>
        : <span key={k} style={estilo}>{p.v}</span>;
    }
    return <span key={k} style={estilo}>{p.v}</span>;
  });
}

export function TextoConFormato({ texto, color = "#334155", fontSize = 14.5, style }) {
  const bloques = bloquesDeTexto(texto);
  return (
    <div style={{ fontSize, lineHeight: 1.55, color, wordBreak: "break-word", ...style }}>
      {bloques.map((b, k) => {
        const arriba = k === 0 ? 0 : 10;
        if (b.tipo === "titulo") {
          return <div key={k} style={{ marginTop: k === 0 ? 0 : 14, fontSize: fontSize + 2.5, fontWeight: 800, color: "#0F172A", lineHeight: 1.3 }}><Partes partes={b.partes} color="#0F172A" /></div>;
        }
        if (b.tipo === "lista") {
          const Tag = b.numerada ? "ol" : "ul";
          return (
            <Tag key={k} start={b.numerada ? b.inicio : undefined} style={{ margin: `${arriba}px 0 0`, paddingLeft: 22 }}>
              {b.items.map((partes, j) => <li key={j} style={{ color, marginTop: j ? 3 : 0 }}><Partes partes={partes} color={color} /></li>)}
            </Tag>
          );
        }
        return (
          <p key={k} style={{ margin: `${arriba}px 0 0`, color }}>
            {b.lineas.map((partes, j) => <span key={j} style={{ color }}>{j ? <br /> : null}<Partes partes={partes} color={color} /></span>)}
          </p>
        );
      })}
    </div>
  );
}
