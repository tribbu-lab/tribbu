// Wordmark de marca ("tribbu.") — antes hardcodeado en varios lugares de
// App.jsx (header Super Admin, header mobile, sidebar desktop) y de
// features/auth (login, registro, selector de perfil), cada uno con su
// propio tamaño pero el mismo patrón: serif + punto en el color de acento.
// Un solo componente parametrizable por tamaño en vez de N copias.

export function Wordmark({ size = 22, color = "white", dotColor = "#3B82F6", letterSpacing, style }) {
  return (
    <div style={{ fontSize: size, fontWeight: 900, color, letterSpacing: letterSpacing ?? -size * 0.045, fontFamily: "Georgia,serif", ...style }}>
      tribbu<span style={{ color: dotColor }}>.</span>
    </div>
  );
}
