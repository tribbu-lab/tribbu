// Íconos de línea propios (SVG, sin dependencias) para la navegación sobria:
// un solo color, trazo fino, como los MaterialCommunityIcons "-outline" de
// mobile. El color va explícito (index.css pone *{color} y currentColor no
// hereda bien acá).
const P = {
  hoy: ["M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  agenda: ["M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M16 3v4M8 3v4M3 10h18"],
  comunicaciones: ["M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M3.5 7.5 12 13l8.5-5.5"],
  curso: ["M6 10a6 6 0 0 1 12 0v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z", "M9.5 4.6V4a2.5 2.5 0 0 1 5 0v.6", "M9 14h6v3H9z"],
  usuarios: ["M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M2.5 20a6.5 6.5 0 0 1 13 0", "M16 4.6a3.5 3.5 0 0 1 0 6.8", "M18.5 14.2A6.5 6.5 0 0 1 21.5 20"],
  chevron: ["M6 9l6 6 6-6"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  firma: ["M4 20h16", "M14.5 4.5l3 3L8 17H5v-3z"],
  cubiertos: ["M6 3v7a2 2 0 0 0 4 0V3", "M8 12v9", "M17 21V3c-2 1-3 3.2-3 6v4h3"],
  paleta: ["M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.6 0-.5-.2-.8-.4-1.1a1.6 1.6 0 0 1 1.2-2.7H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3z", "M7.5 11.5h.01M10 7.5h.01M15 7.5h.01"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"],
  telefono: ["M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  moneda: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M14.5 9.5C14 8.6 13.1 8 12 8c-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.6-2.5-1.5", "M12 6.5V8M12 16v1.5"],
  grafico: ["M4 20h16", "M7 16v-4M12 16V8M17 16v-6"],
  bolsa: ["M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z", "M9 8V6a3 3 0 0 1 6 0v2"],
  mensaje: ["M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8 9h8M8 12.5h5"],
  lupa: ["M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z", "M20 20l-4.5-4.5"],
  campana: ["M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  salvavidas: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"],
  llave: ["M8 19a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M11 12l9-9M17 6l2 2M15 8l2 2"],
  salir: ["M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4", "M15 16l4-4-4-4", "M19 12H9"],
  papelera: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6M14 11v6"],
  atras: ["M15 6l-6 6 6 6"],
  cerrar: ["M6 6l12 12M18 6 6 18"],
  reloj: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
  flecha: ["M5 12h14", "M13 6l6 6-6 6"],
  alerta: ["M12 4 2.5 20h19z", "M12 10v4", "M12 17h.01"],
  ajustes: ["M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0", "M16 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM10 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
};

export function Icono({ nombre, size = 18, color = "#475569", grosor = 1.8, style }) {
  const paths = P[nombre];
  if (!paths) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: "block", ...style }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
