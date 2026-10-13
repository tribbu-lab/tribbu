// mobile/lib/useTecladoAbierto.js — ¿está abierto el teclado?
//
// En Android, un KeyboardAvoidingView con behavior="padding" dentro de un
// Modal no vuelve a 0 al cerrar el teclado: queda un hueco abajo (la hoja o
// el campo de texto se ven "levantados"). Con edge-to-edge no se puede
// prescindir del KAV, así que se activa solo mientras el teclado está
// abierto: `enabled={Platform.OS === "ios" || tecladoAbierto}`.
import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

export function useTecladoAbierto() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardDidShow", () => setAbierto(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setAbierto(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return abierto;
}
