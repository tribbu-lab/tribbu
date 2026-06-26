// Layout de tabs: header persistente (selector de hijo/curso + notificaciones)
// sobre un bottom-tab navigator nativo. Las tabs de admin (Alumnos/Admin) solo
// se ofrecen cuando el item activo es "admin" (rolEfectivo). El deep-link de
// push se engancha acá.

import { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { AppHeader } from "../../components/AppHeader";
import { supabase } from "../../lib/supabase";
import { useNotificationRouting } from "../../push/useNotificationRouting";

// Contador de recordatorios no leídos para el badge de la tab (igual que la web).
function useRecordatoriosBadge(cursoId, userId) {
  const [count, setCount] = useState(0);
  const cargar = useCallback(async () => {
    if (!cursoId || !userId) {
      setCount(0);
      return;
    }
    const hoy = new Date().toISOString().split("T")[0];
    const [recs, leidos] = await Promise.all([
      supabase
        .from("recordatorios")
        .select("id")
        .eq("curso_id", cursoId)
        .or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`)
        .or(`fecha.is.null,fecha.gte.${hoy}`),
      supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId),
    ]);
    const leidosIds = new Set((leidos.data || []).map((r) => r.recordatorio_id));
    setCount((recs.data || []).filter((r) => !leidosIds.has(r.id)).length);
  }, [cursoId, userId]);

  useEffect(() => {
    cargar();
    const iv = setInterval(cargar, 30000);
    return () => clearInterval(iv);
  }, [cargar]);

  return count;
}

// Iconos de tab como emoji (la app usa emoji en <Text>, no hay librería de
// vector-icons). Sin tabBarIcon, react-navigation muestra su placeholder (un
// triángulo) en su lugar.
const tabIcon = (emoji) =>
  function TabIcon({ size }) {
    return <Text style={{ fontSize: (size ?? 24) - 2 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const { usuario, cursoId } = useSession();
  const badge = useRecordatoriosBadge(cursoId, usuario?.id);
  useNotificationRouting(true);

  const screenOptions = {
    headerShown: false,
    tabBarActiveTintColor: T.accent,
    tabBarInactiveTintColor: "#94A3B8",
    tabBarStyle: { backgroundColor: T.primary, borderTopColor: "rgba(255,255,255,0.08)" },
    tabBarLabelStyle: { fontSize: 10 },
  };

  // Oculta del bottom-bar las secundarias (se alcanzan desde "Más").
  const hidden = { href: null };

  return (
    <View style={styles.root}>
      <AppHeader />
      <Tabs screenOptions={screenOptions}>
        <Tabs.Screen name="muro" options={{ title: "Inicio", tabBarIcon: tabIcon("🏠") }} />
        <Tabs.Screen
          name="calendario"
          options={{ title: "Calendario", tabBarIcon: tabIcon("📅") }}
        />
        <Tabs.Screen name="cumples" options={{ title: "Cumpleaños", tabBarIcon: tabIcon("🎂") }} />
        <Tabs.Screen
          name="recordatorios"
          options={{
            title: "Recordatorios",
            tabBarIcon: tabIcon("📌"),
            tabBarBadge: badge > 0 ? badge : undefined,
          }}
        />
        <Tabs.Screen name="mas" options={{ title: "Más", tabBarIcon: tabIcon("☰") }} />

        {/* Secundarias: navegables desde "Más", fuera del bottom-bar */}
        <Tabs.Screen name="comedor" options={hidden} />
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
