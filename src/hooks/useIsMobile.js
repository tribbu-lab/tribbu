import { useState, useEffect } from "react";

/**
 * Devuelve true si el ancho de ventana es menor a 768px.
 * Se actualiza automáticamente al cambiar el tamaño.
 *
 * Antes: definido inline en App.jsx línea 193
 *
 * Uso:
 *   const isMobile = useIsMobile();
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return isMobile;
}
