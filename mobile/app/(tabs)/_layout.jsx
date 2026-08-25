// Layout de tabs: header persistente (selector de hijo/curso + notificaciones)
// sobre un bottom-tab navigator nativo. Las tabs de admin (Alumnos/Admin) solo
// se ofrecen cuando el item activo es "admin" (rolEfectivo). El deep-link de
// push se engancha acá.

import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { AppHeader } from "../../components/AppHeader";
import { FloatingTabBar } from "../../components/FloatingTabBar";
import { supabase } from "../../lib/supabase";
import { useNotificationRouting } from "../../push/useNotificationRouting";

// Contador de recordatorios no leídos para el badge de la tab (igual que la web).
function useRecordatoriosBadge(cursoIds, userId) {
  const [count, setCount] = useState(0);
  const cargar = useCallback(async () => {
    if (!cursoIds?.length || !userId) {
      setCount(0);
      return;
    }
    const hoy = new Date().toISOString().split("T")[0];
    const [recs, leidos] = await Promise.all([
      supabase
        .from("recordatorios")
        .select("id")
        .in("curso_id", cursoIds)
        .or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`)
        .or(`fecha.is.null,fecha.gte.${hoy}`),
      supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId),
    ]);
    const leidosIds = new Set((leidos.data || []).map((r) => r.recordatorio_id));
    setCount((recs.data || []).filter((r) => !leidosIds.has(r.id)).length);
  }, [cursoIds, userId]);

  useEffect(() => {
    cargar();
    const iv = setInterval(cargar, 30000);
    return () => clearInterval(iv);
  }, [cargar]);

  return count;
}

export default function TabsLayout() {
  const { usuario, cursoIds } = useSession();
  const badge = useRecordatoriosBadge(cursoIds, usuario?.id);
  useNotificationRouting(true);

  // Oculta del bottom-bar las secundarias (se alcanzan desde "Más").
  // La FloatingTabBar (patrón A3) solo renderiza su lista blanca de tabs,
  // así que estas quedan navegables pero fuera de la barra.
  const hidden = { href: null };

  return (
    <View style={styles.root}>
      <AppHeader />
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} badge={badge} />}
      >
        <Tabs.Screen name="muro" options={{ title: "Inicio" }} />
        <Tabs.Screen name="calendario" options={{ title: "Calendario" }} />
        <Tabs.Screen name="cumples" options={{ title: "Cumpleaños" }} />
        <Tabs.Screen name="recordatorios" options={{ title: "Recordatorios" }} />
        <Tabs.Screen name="mas" options={{ title: "Más" }} />

        {/* Secundarias: navegables desde "Más", fuera del bottom-bar */}
        <Tabs.Screen name="comedor" options={hidden} />
        <Tabs.Screen name="encuestas" options={hidden} />
        <Tabs.Screen name="finanzas" options={hidden} />
        <Tabs.Screen name="info" options={hidden} />
        <Tabs.Screen name="contacto" options={hidden} />
        <Tabs.Screen name="alumnos" options={hidden} />
        <Tabs.Screen name="admin" options={hidden} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
});
