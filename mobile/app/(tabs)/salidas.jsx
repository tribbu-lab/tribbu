import { useCallback } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CambiosSalida } from "../../features/salidas";
import { ComunicacionesTabs } from "../../components/SubTabs";
import { useSalidasCtx } from "../../lib/useSalidasNovedades";

// Comunicaciones → Salidas (Cambios en la salida). Al abrirla se apaga su globito.
export default function SalidasScreen() {
  const { marcarVistas } = useSalidasCtx();
  useFocusEffect(useCallback(() => { marcarVistas(); }, [marcarVistas]));
  return (
    <View style={{ flex: 1 }}>
      <ComunicacionesTabs activo="salidas" />
      <CambiosSalida />
    </View>
  );
}
