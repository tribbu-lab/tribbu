// Skeletons de carga — pulso sutil con Animated (native driver, no bloquea JS).
// Usar mientras llegan datos de Supabase en vez de Spinner cuando la forma de
// la lista es conocida: <SkeletonList rows={4}/> imita cards de fila estándar.

import { useEffect, useRef } from "react";
import { View, Animated } from "react-native";
import { RADIUS, SPACE } from "@shared/tokens";
import { makeThemedStyles, useTheme } from "../context/Theme";

function usePulse() {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

/** Barra/bloque individual. width acepta número o "60%". */
export function Skeleton({ width = "100%", height = 12, radius = RADIUS.sm, style }) {
  const t = useTheme();
  const opacity = usePulse();
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          opacity,
          backgroundColor: t.name === "dark" ? t.surface2 : t.surfaceActive,
        },
        style,
      ]}
    />
  );
}

const useStyles = makeThemedStyles((t) => ({
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.xl,
    marginBottom: SPACE.lg,
    borderWidth: 1,
    borderColor: t.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
  },
  lines: { flex: 1, gap: SPACE.sm },
}));

/** Lista de cards fantasma (avatar + 2 líneas), para pantallas de listas. */
export function SkeletonList({ rows = 4, avatar = true }) {
  const s = useStyles();
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={s.card}>
          {avatar ? <Skeleton width={36} height={36} radius={RADIUS.full} /> : null}
          <View style={s.lines}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="80%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}
