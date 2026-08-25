// Layout raíz: providers globales + gate de autenticación.
// Colapsa los tres layouts de la web (super / mobile / desktop) en un único
// layout móvil: el Super Admin va a su propia pila (super), el resto a las tabs.

import { useState, useEffect } from "react";
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
  const { usuario, isSuper, authLoading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  // Candado biométrico local (ver specs/desbloqueo-con-huella-digital.md) —
  // no toca la sesión de Supabase, solo gatea mostrarla. Se re-chequea por
  // apertura en frío y por usuario (cambia de cuenta en el mismo device →
  // vuelve a "checking" para ese usuario nuevo).
  const [bioState, setBioState] = useState("checking"); // checking | locked | off | unlocked
  useEffect(() => {
    if (!usuario?.id) {
      setBioState("off");
      return;
    }
    let cancel = false;
    setBioState("checking");
    getBiometricPref(usuario.id).then((enabled) => {
      if (!cancel) setBioState(enabled ? "locked" : "off");
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
    } else if (isSuper) {
      if (grupo !== "(super)") router.replace("/(super)");
    } else {
      if (grupo !== "(tabs)") router.replace("/(tabs)/muro");
    }
  }, [usuario, isSuper, authLoading, segments, router]);

  if (authLoading || (usuario && bioState === "checking")) {
    return <Spinner style={{ backgroundColor: "#0F172A" }} />;
  }

  if (usuario && bioState === "locked") {
    return <BiometricGate onUnlock={() => setBioState("unlocked")} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(super)" />
    </Stack>
  );
}
