// src/hooks/useCargar.js
//
// Corre `cargar` al montar y cada vez que cambia (o sea, cuando cambian sus
// dependencias de useCallback). La corre en un microtask, no dentro del efecto:
// así los setState del principio de `cargar` (el spinner, el reset de la lista)
// no disparan renders en cascada durante el efecto
// (react-hooks/set-state-in-effect), y si el componente se desmonta o las
// dependencias cambian antes, esa corrida se descarta.
//
// Uso:
//   const cargar = useCallback(async () => { ... }, [cursoIds, userId]);
//   useCargar(cargar);
//   ... y después de guardar algo: cargar();
//
// `recargarCuando` (opcional): recarga también cuando cambia ese valor, sin que
// sea dependencia de cargar — p.ej. `active` para refrescar al abrir el panel.
import { useEffect } from "react";

export function useCargar(cargar, recargarCuando) {
  useEffect(() => {
    let vigente = true;
    Promise.resolve().then(() => {
      if (vigente) cargar();
    });
    return () => {
      vigente = false;
    };
  }, [cargar, recargarCuando]);
}
