import { useState, useEffect } from "react";

/**
 * Devuelve true si el ancho de ventana es menor a 768px.
 * Se actualiza automáticamente al redimensionar.
 *
 * Uso:
 *   const isMobile = useIsMobile();
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  return isMobile;
}
