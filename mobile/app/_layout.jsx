// Layout raíz: providers globales + gate de autenticación.
// Colapsa los tres layouts de la web (super / mobile / desktop) en un único
// layout móvil: el Super Admin va a su propia pila (super), el resto a las tabs.

import { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Stack, useRouter, useSegments } from "expo-router";
import { SessionProvider, useSession } from "../context/Session";
import { hydrateHijoColors } from "../lib/hijoColors";
import { getBiometricPref } from "../lib/biometricPref";
import { Spinner } from "../components/Spinner";
import { BiometricGate } from "../components/BiometricGate";

export default function RootLayout() {
  useEffect(() => {
    hydrateHijoColors();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { usuario, isSuper, esColegioAdmin, authLoading } = useSession();
  const vaAlPanel = isSuper || esColegioAdmin; // ambos van al stack (super), no a las tabs
  const esDocente = usuario?.rol === "docente"; // solo Mensajes: stack (docente)
  const segments = useSegments();
  const router = useRouter();

  // Candado biométrico local (ver specs/desbloqueo-con-huella-digital.md) —
  // no toca la sesión de Supabase, solo gatea mostrarla. Se re-chequea por
  // apertura en frío y por usuario (cambia de cuenta en el mismo device →
  // vuelve a "checking" para ese usuario nuevo). El estado queda atado al
  // usuario para el que se resolvió: para un usuario nuevo es "checking" desde
  // el primer render, sin un render intermedio en "off".
  const [bio, setBio] = useState({ uid: null, estado: "off" }); // estado: locked | off | unlocked
  const bioState = !usuario?.id ? "off" : bio.uid === usuario.id ? bio.estado : "checking";
  useEffect(() => {
    if (!usuario?.id) return undefined;
    let cancel = false;
    getBiometricPref(usuario.id).then((enabled) => {
      if (!cancel) setBio({ uid: usuario.id, estado: enabled ? "locked" : "off" });
    });
    return () => {
      cancel = true;
    };
  }, [usuario?.id]);

  useEffect(() => {
    if (authLoading) return;
    const grupo = segments[0]; // "login" | "(tabs)" | "(super)" | undefined
    if (!usuario) {
      if (grupo !== "login") router.replace("/login");
    } else if (esDocente) {
      if (grupo !== "(docente)") router.replace("/(docente)");
    } else if (vaAlPanel) {
      if (grupo !== "(super)") router.replace("/(super)");
    } else {
      if (grupo !== "(tabs)") router.replace("/(tabs)/muro");
    }
  }, [usuario, vaAlPanel, esDocente, authLoading, segments, router]);

  const cargando = authLoading || (!!usuario && bioState === "checking");
  const bloqueado = !!usuario && bioState === "locked";

  // El <Stack> se renderiza SIEMPRE y la carga / el candado van por encima.
  // Antes se reemplazaba el Stack por el spinner: si el gate de arriba
  // navegaba justo cuando el Stack se desmontaba (al abrir la app tocando una
  // notificación pasaba siempre), la navegación quedaba sin navegador,
  // expo-router remontaba todo el layout raíz y la app entraba en un bucle de
  // recargas (se tildaba y parpadeaba).
  return (
    <View style={styles.root}>
      <View style={styles.root} importantForAccessibility={cargando || bloqueado ? "no-hide-descendants" : "auto"}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(super)" />
          <Stack.Screen name="(docente)" />
        </Stack>
      </View>
      {cargando ? (
        <Spinner style={[StyleSheet.absoluteFill, { backgroundColor: "#0F172A" }]} />
      ) : bloqueado ? (
        <View style={StyleSheet.absoluteFill}>
          <BiometricGate onUnlock={() => setBio({ uid: usuario.id, estado: "unlocked" })} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
