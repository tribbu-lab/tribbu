// useRecarga — Expo Router deja montadas las pantallas al cambiar de pestaña,
// así que un `useEffect(() => cargar(), [cargar])` corre una sola vez y la
// pantalla muestra datos viejos hasta reiniciar la app (lo nuevo que publicó
// otro no aparece). Este hook:
//   · recarga al VOLVER a la pantalla (no en el primer foco: la
//     carga inicial ya la hace el useEffect de la pantalla, sin duplicarla),
//     salvo que se haya cargado hace menos de 30 s y no hubo escrituras
//     desde esta app en el medio (lib/cambios.js),
//   · devuelve { refrescando, onRefresh } para <RefreshControl> (deslizar
//     hacia abajo para actualizar).
//
// Uso:
//   const { refrescando, onRefresh } = useRecarga(cargar);
//   <ScrollView refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}>
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ultimoCambioEn } from "./cambios";

const VENTANA_MS = 30 * 1000;

export function useRecarga(cargar) {
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  }, [cargar]);

  const yaEnfocada = useRef(false);
  const ultimaCarga = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!yaEnfocada.current) {
        // Primer foco: la carga inicial la hace el useEffect de la pantalla.
        yaEnfocada.current = true;
        ultimaCarga.current = Date.now();
        return;
      }
      // Saltar entre pestañas no recarga si se cargó hace menos de 30 s y
      // nadie escribió nada desde entonces desde esta app (lib/cambios.js).
      const reciente = Date.now() - ultimaCarga.current < VENTANA_MS;
      if (reciente && ultimoCambioEn() <= ultimaCarga.current) return;
      ultimaCarga.current = Date.now();
      cargarRef.current?.();
    }, [])
  );

  const [refrescando, setRefrescando] = useState(false);
  const onRefresh = useCallback(async () => {
    ultimaCarga.current = Date.now(); // deslizar para actualizar: siempre recarga
    setRefrescando(true);
    try {
      await cargarRef.current?.();
    } finally {
      setRefrescando(false);
    }
  }, []);

  return { refrescando, onRefresh };
}
