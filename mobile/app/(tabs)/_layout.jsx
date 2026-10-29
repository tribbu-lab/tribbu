// Layout de tabs: header persistente (selector de hijo/curso + Mi cuenta)
// sobre un bottom-tab navigator con 4 secciones: Hoy · Agenda ·
// Comunicaciones · Curso. Administrar el curso (Room Parent) vive en
// Curso. El deep-link de push se engancha acá.

import { View, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { T } from "@shared/theme";
import { useSession } from "../../context/Session";
import { AppHeader } from "../../components/AppHeader";
import { FloatingTabBar } from "../../components/FloatingTabBar";
import { useNotificationRouting } from "../../push/useNotificationRouting";
import { useNotificaciones, NotificacionesProvider, avisosSinLeer } from "../../features/notificaciones";
import { useMensajesNoLeidos, MensajesProvider } from "../../lib/useMensajesNoLeidos";
import { useSalidasNovedades, SalidasProvider } from "../../lib/useSalidasNovedades";
import { columnaCentrada, useInsetsLaterales } from "../../lib/layout";

export default function TabsLayout() {
  const { usuario, cursoIds, misHijos, esDocente } = useSession();
  // Se levanta acá (en vez de adentro de AppHeader) para que el badge de la
  // tab de Recordatorios reuse el mismo fetch de recordatorios+leídos en vez
  // de pedirlo de nuevo por separado en cada cambio de hijo/curso.
  const notif = useNotificaciones({ cursoIds, userId: usuario?.id ?? null, active: true });
  // Badge de Mensajes + la única suscripción Realtime (ver lib/useMensajesNoLeidos).
  const mensajes = useMensajesNoLeidos(usuario?.id ?? null);
  // Novedades de Cambios en la salida (pestaña Salidas de Comunicaciones).
  const salidas = useSalidasNovedades({ userId: usuario?.id ?? null, cursoIds, hijoIds: misHijos, esDocente });
  // Comunicaciones = avisos sin leer + mensajes sin leer + salidas nuevas.
  const badge = avisosSinLeer(notif) + (mensajes.noLeidos || 0) + salidas.n;
  const laterales = useInsetsLaterales();
  useNotificationRouting(true);

  // Oculta del bottom-bar las secundarias (se alcanzan desde "Más").
  // La FloatingTabBar (patrón A3) solo renderiza su lista blanca de tabs,
  // así que estas quedan navegables pero fuera de la barra.
  const hidden = { href: null };

  return (
    <NotificacionesProvider value={notif}>
    <MensajesProvider value={mensajes}>
    <SalidasProvider value={salidas}>
    <View style={styles.root}>
      <AppHeader notif={notif} />
      {/* Tablet/plegable: secciones y barra inferior en una columna centrada
          (lib/layout). En el celular ocupa todo el ancho, como siempre. */}
      <View style={[styles.flex1, laterales]}>
      <View style={styles.columna}>
      <Tabs
        // freezeOnBlur: las pestañas que no se ven no se re-renderizan (cada
        // cambio de sesión/notificaciones re-renderizaba TODAS las montadas);
        // al volver a una se pone al día de una sola vez.
        screenOptions={{ headerShown: false, freezeOnBlur: true }}
        tabBar={(props) => <FloatingTabBar {...props} badge={badge} />}
      >
        {/* Hoy · Agenda (Calendario + Cumpleaños) · Comunicaciones (Avisos +
            Mensajes) · Curso. El resto son pantallas de esas secciones,
            fuera del bottom-bar (FloatingTabBar marca la sección de cada una). */}
        <Tabs.Screen name="muro" options={{ title: "Hoy" }} />
        <Tabs.Screen name="calendario" options={{ title: "Agenda" }} />
        <Tabs.Screen name="recordatorios" options={{ title: "Comunicaciones" }} />
        <Tabs.Screen name="curso" options={{ title: "Curso" }} />

        <Tabs.Screen name="cumples" options={hidden} />
        <Tabs.Screen name="horario" options={hidden} />
        <Tabs.Screen name="cuenta" options={hidden} />
        <Tabs.Screen name="ayuda" options={hidden} />
        <Tabs.Screen name="buscar" options={hidden} />
        <Tabs.Screen name="comedor" options={hidden} />
        <Tabs.Screen name="encuestas" options={hidden} />
        <Tabs.Screen name="autorizaciones" options={hidden} />
        <Tabs.Screen name="salidas" options={hidden} />
        <Tabs.Screen name="fotos" options={hidden} />
        <Tabs.Screen name="talleres" options={hidden} />
        <Tabs.Screen name="comunidad" options={hidden} />
        <Tabs.Screen name="perdidos" options={hidden} />
        <Tabs.Screen name="finanzas" options={hidden} />
        <Tabs.Screen name="info" options={hidden} />
        <Tabs.Screen name="contacto" options={hidden} />
        <Tabs.Screen name="admin" options={hidden} />
        <Tabs.Screen name="mensajes" options={hidden} />
        <Tabs.Screen name="alumnos" options={hidden} />
      </Tabs>
      </View>
      </View>
    </View>
    </SalidasProvider>
    </MensajesProvider>
    </NotificacionesProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  flex1: { flex: 1 },
  columna: { flex: 1, ...columnaCentrada },
});
