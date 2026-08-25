// Candado local opcional al abrir la app (ver
// specs/desbloqueo-con-huella-digital.md). No toca la sesión de Supabase —
// solo gatea mostrar el contenido ya logueado detrás de una verificación
// biométrica local, en memoria (no persistida: cada apertura en frío vuelve
// a pedirla si la preferencia está activa). Si la biometría falla, se
// cancela, o no está disponible, cae al login normal como prueba de
// identidad alternativa (mismo signInWithPassword de siempre).

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { T } from "@shared/theme";
import { Login } from "../features/auth";

export function BiometricGate({ onUnlock }) {
  const insets = useSafeAreaInsets();
  const [intentando, setIntentando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  const intentar = useCallback(async () => {
    setIntentando(true);
    setFallo(false);
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Ingresá con tu huella o Face ID",
        cancelLabel: "Cancelar",
        disableDeviceFallback: false,
      });
      if (res.success) {
        onUnlock();
        return;
      }
      setFallo(true);
    } catch {
      setFallo(true);
    } finally {
      setIntentando(false);
    }
  }, [onUnlock]);

  useEffect(() => {
    intentar();
  }, [intentar]);

  if (mostrarPassword) return <Login onSuccess={onUnlock} />;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brand}>
        tribbu<Text style={styles.brandDot}>.</Text>
      </Text>

      <View style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.msg}>{intentando ? "Verificando tu identidad..." : "No se pudo verificar tu identidad"}</Text>

        {!intentando && fallo ? (
          <View style={styles.acciones}>
            <Pressable onPress={intentar} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryTxt}>Reintentar</Text>
            </Pressable>
            <Pressable onPress={() => setMostrarPassword(true)} style={styles.btnLink}>
              <Text style={styles.btnLinkTxt}>Ingresar con contraseña</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0F172A", alignItems: "center", paddingHorizontal: 24 },
  brand: {
    fontSize: 32,
    fontWeight: "900",
    color: "white",
    letterSpacing: -1.5,
    fontFamily: Platform.select({ ios: "Georgia", default: "serif" }),
    marginBottom: 60,
  },
  brandDot: { color: T.accent },
  center: { alignItems: "center", flex: 1, justifyContent: "center", paddingBottom: 60 },
  icon: { fontSize: 40, marginBottom: 16 },
  msg: { fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 24 },
  acciones: { alignItems: "center", gap: 4 },
  btnPrimary: { backgroundColor: T.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, minHeight: 44, justifyContent: "center" },
  btnPrimaryTxt: { color: "white", fontSize: 14, fontWeight: "800" },
  btnLink: { padding: 12 },
  btnLinkTxt: { color: "rgba(255,255,255,0.6)", fontSize: 13, textDecorationLine: "underline" },
});
