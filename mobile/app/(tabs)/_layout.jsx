// Layout de tabs: header persistente (selector de hijo/curso + notificaciones)
// sobre un bottom-tab navigator nativo. Las tabs de admin (Alumnos/Admin) solo
// se ofrecen cuando el item activo es "admin" (rolEfectivo). El deep-link de
// push se engancha acá.

import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { AppHeader } from "../../components/AppHeader";
import { FloatingTabBar } from "../../components/FloatingTabBar";
import { useNotificationRouting } from "../../push/useNotificationRouting";
import { useNotificaciones } from "../../features/notificaciones";

export default function TabsLayout() {
  const { usuario, cursoIds } = useSession();
  // Se levanta acá (en vez de adentro de AppHeader) para que el badge de la
  // tab de Recordatorios reuse el mismo fetch de recordatorios+leídos en vez
  // de pedirlo de nuevo por separado en cada cambio de hijo/curso.
  const notif = useNotificaciones({ cursoIds, userId: usuario?.id ?? null, active: true });
  const badge = notif.notifs.filter((n) => n._tipo === "recordatorio" && !notif.leidos.has(n.id)).length;
  useNotificationRouting(true);

  // Oculta del bottom-bar las secundarias (se alcanzan desde "Más").
  // La FloatingTabBar (patrón A3) solo renderiza su lista blanca de tabs,
  // así que estas quedan navegables pero fuera de la barra.
  const hidden = { href: null };

  return (
    <View style={styles.root}>
      <AppHeader notif={notif} />
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
        <Tabs.Screen name="buscar" options={hidden} />
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
