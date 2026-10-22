// Foto a pantalla completa con zoom: pellizcar (hasta 5x), doble toque para
// acercar/alejar y arrastrar mientras está ampliada. Un toque sin zoom llama a
// `onTocar` (los visores lo usan para cerrar). Usa gesture-handler +
// reanimated, que ya vienen con la app (sin dependencias nuevas). Va adentro
// de un <Modal>: en Android un Modal necesita su propio GestureHandlerRootView.

import { useState } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SignedImage } from "./SignedImage";

const MAX = 5;
const DOBLE = 2.5;

export function FotoZoom({ src, bucket = "adjuntos", onTocar }) {
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const escala = useSharedValue(1);
  const escalaIni = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const xIni = useSharedValue(0);
  const yIni = useSharedValue(0);
  const ancho = useSharedValue(0);
  const alto = useSharedValue(0);

  // Que la foto ampliada no se pueda arrastrar fuera de la pantalla.
  const limitar = (v, lado, e) => {
    "worklet";
    const max = (lado * (e - 1)) / 2;
    return Math.min(max, Math.max(-max, v));
  };
  const volver = () => {
    "worklet";
    escala.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
  };

  const pellizco = Gesture.Pinch()
    .onStart(() => { escalaIni.value = escala.value; })
    .onUpdate((e) => { escala.value = Math.min(MAX, Math.max(1, escalaIni.value * e.scale)); })
    .onEnd(() => {
      if (escala.value <= 1.02) volver();
      else {
        x.value = withTiming(limitar(x.value, ancho.value, escala.value));
        y.value = withTiming(limitar(y.value, alto.value, escala.value));
      }
    });
  const arrastre = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => { xIni.value = x.value; yIni.value = y.value; })
    .onUpdate((e) => {
      if (escala.value <= 1) return;
      x.value = limitar(xIni.value + e.translationX, ancho.value, escala.value);
      y.value = limitar(yIni.value + e.translationY, alto.value, escala.value);
    });
  const dobleToque = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (escala.value > 1) volver();
      else escala.value = withTiming(DOBLE);
    });
  const toque = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => { if (escala.value <= 1 && onTocar) onTocar(); });

  const gesto = Gesture.Simultaneous(pellizco, arrastre, Gesture.Exclusive(dobleToque, toque));
  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: escala.value }],
  }));

  return (
    <GestureHandlerRootView style={s.raiz}>
      <GestureDetector gesture={gesto}>
        <Animated.View
          style={[s.raiz, estilo]}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            ancho.value = width;
            alto.value = height;
            setTam({ w: width, h: height });
          }}
        >
          {tam.w ? <SignedImage src={src} bucket={bucket} style={{ width: tam.w, height: tam.h }} resizeMode="contain" /> : null}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, width: "100%" },
});
