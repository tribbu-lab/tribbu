// Toast liviano para mobile — equivalente RN de src/hooks/useToast.
// Uso:
//   const { showToast, toast } = useToast();
//   ...
//   <Pressable onPress={() => { copiar(); showToast("¡Copiado al portapapeles!"); }} />
//   {toast}
// Aparece abajo, sobre la barra de tabs, y se va solo a los ~1.9s.

import { useState, useRef, useCallback } from "react";
import { Animated, Text, StyleSheet, Easing } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, RADIUS } from "@shared/tokens";
import { TAB_BAR_SPACE } from "./FloatingTabBar";

const t = THEMES.light;

export function useToast() {
  const [msg, setMsg] = useState(null);
  const [tone, setTone] = useState("ok");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef(null);

  const showToast = useCallback(
    (text, kind = "ok") => {
      setMsg(text);
      setTone(kind);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
          if (finished) setMsg(null);
        });
      }, 1900);
    },
    [opacity]
  );

  const toast =
    msg != null ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.toast,
          tone === "error" ? styles.toastError : styles.toastOk,
          { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
        ]}
      >
        <MaterialCommunityIcons
          name={tone === "error" ? "alert-circle" : "check-circle"}
          size={16}
          color="#FFFFFF"
        />
        <Text style={styles.toastTxt}>{msg}</Text>
      </Animated.View>
    ) : null;

  return { showToast, toast };
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: TAB_BAR_SPACE,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: RADIUS.lg,
    zIndex: 999,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastOk: { backgroundColor: "#0F172A" },
  toastError: { backgroundColor: t.danger },
  toastTxt: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "700" },
});
