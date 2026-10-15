// Círculo del usuario: su foto de perfil o, si no tiene, las iniciales.
// `oscuro` = sobre el header/barra lateral. Espejo mobile: mobile/components/AvatarPerfil.jsx.
import { iniciales } from "../lib/helpers";
import { SignedImg } from "./SignedImg";

export function AvatarPerfil({ usuario, foto, size = 34, oscuro = false }) {
  const redondo = { width: size, height: size, borderRadius: 999, flexShrink: 0, display: "block" };
  if (foto) {
    return <SignedImg src={foto} bucket="adjuntos" miniatura={size <= 64} alt="" style={{ ...redondo, objectFit: "cover", border: oscuro ? "1px solid rgba(255,255,255,0.25)" : "none", boxSizing: "border-box" }} />;
  }
  return (
    <span style={{ ...redondo, display: "flex", alignItems: "center", justifyContent: "center", background: oscuro ? "rgba(255,255,255,0.12)" : "#1E293B", border: oscuro ? "1px solid rgba(255,255,255,0.2)" : "none", boxSizing: "border-box" }}>
      <span style={{ fontSize: Math.round(size * 0.37), fontWeight: 800, color: "white", letterSpacing: 0.3 }}>{iniciales(usuario)}</span>
    </span>
  );
}
