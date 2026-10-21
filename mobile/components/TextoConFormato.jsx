// Comunicado con formato (negrita, cursiva, títulos, listas, links) desde los
// nodos de @shared/formato — RN puro, sin HTML. Puerto de
// src/components/TextoConFormato.jsx.
import { View, Text, Linking, StyleSheet } from "react-native";
import { bloquesDeTexto } from "@shared/formato";
import { safeUrl } from "@shared/helpers";
import { THEMES } from "@shared/tokens";

const t = THEMES.light;

function Partes({ partes }) {
  return partes.map((p, k) => {
    const estilo = [p.b && s.b, p.i && s.i];
    if (p.t === "link") {
      const url = safeUrl(p.url);
      return url
        ? <Text key={k} style={[...estilo, s.link]} onPress={() => Linking.openURL(url).catch(() => {})} accessibilityRole="link">{p.v}</Text>
        : <Text key={k} style={estilo}>{p.v}</Text>;
    }
    return <Text key={k} style={estilo}>{p.v}</Text>;
  });
}

export function TextoConFormato({ texto, style, fontSize = 14.5, color = t.text }) {
  const base = { fontSize, lineHeight: Math.round(fontSize * 1.5), color };
  return (
    <View style={style}>
      {bloquesDeTexto(texto).map((b, k) => {
        const arriba = k === 0 ? 0 : 10;
        if (b.tipo === "titulo") {
          return <Text key={k} style={[base, s.titulo, { fontSize: fontSize + 2.5, marginTop: k === 0 ? 0 : 14 }]}><Partes partes={b.partes} /></Text>;
        }
        if (b.tipo === "lista") {
          return (
            <View key={k} style={{ marginTop: arriba }}>
              {b.items.map((partes, j) => (
                <View key={j} style={[s.item, j ? s.itemSig : null]}>
                  <Text style={[base, s.marca]}>{b.numerada ? `${b.inicio + j}.` : "•"}</Text>
                  <Text style={[base, s.flex1]}><Partes partes={partes} /></Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={k} style={[base, { marginTop: arriba }]}>
            {b.lineas.map((partes, j) => <Text key={j}>{j ? "\n" : ""}<Partes partes={partes} /></Text>)}
          </Text>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  b: { fontWeight: "800" },
  i: { fontStyle: "italic" },
  link: { color: "#2563EB", textDecorationLine: "underline" },
  titulo: { fontWeight: "800", color: t.textStrong },
  item: { flexDirection: "row", gap: 6 },
  itemSig: { marginTop: 3 },
  marca: { minWidth: 16, color: t.textMuted },
  flex1: { flex: 1 },
});
