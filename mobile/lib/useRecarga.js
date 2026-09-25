// useRecarga — Expo Router deja montadas las pantallas al cambiar de pestaña,
// así que un `useEffect(() => cargar(), [cargar])` corre una sola vez y la
// pantalla muestra datos viejos hasta reiniciar la app (lo nuevo que publicó
// otro no aparece). Este hook:
//   · recarga cada vez que se VUELVE a la pantalla (no en el primer foco: la
//     carga inicial ya la hace el useEffect de la pantalla, sin duplicarla),
//   · devuelve { refrescando, onRefresh } para <RefreshControl> (deslizar
//     hacia abajo para actualizar).
//
// Uso:
//   const { refrescando, onRefresh } = useRecarga(cargar);
//   <ScrollView refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} />}>
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useRecarga(cargar) {
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  }, [cargar]);

  const yaEnfocada = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (yaEnfocada.current) cargarRef.current?.();
      yaEnfocada.current = true;
    }, [])
  );

  const [refrescando, setRefrescando] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefrescando(true);
    try {
      await cargarRef.current?.();
    } finally {
      setRefrescando(false);
    }
  }, []);

  return { refrescando, onRefresh };
}
