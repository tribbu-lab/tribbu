// Campo de texto de un comunicado con barrita de formato (B, I, Título,
// listas, Link) y "Vista previa". Puerto de src/components/EditorFormato.jsx:
// la selección sale de onSelectionChange; lo guardado sigue siendo texto.
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { aplicarMarca, BOTONES_FORMATO } from "@shared/formato";
import { THEMES, BLUE } from "@shared/tokens";
import { TextoConFormato } from "./TextoConFormato";

const t = THEMES.light;

export function EditorFormato({ value, onChange, placeholder, style }) {
  const [sel, setSel] = useState({ start: (value || "").length, end: (value || "").length });
  const [selForzada, setSelForzada] = useState(null); // selección a poner después de marcar
  const [vista, setVista] = useState(false);

  const marcar = (tipo) => {
    const r = aplicarMarca(value || "", sel.start, sel.end, tipo);
    onChange(r.texto);
    const nueva = { start: r.desde, end: r.hasta };
    setSel(nueva);
    setSelForzada(nueva);
  };

  return (
    <View>
      <View style={s.barra} accessibilityRole="toolbar">
        {BOTONES_FORMATO.map((b) => (
          <Pressable key={b.tipo} onPress={() => marcar(b.tipo)} disabled={vista} accessibilityLabel={b.etiqueta} style={[s.boton, vista && s.apagado]}>
            <Text style={[s.botonTxt, b.tipo === "negrita" && s.negrita, b.tipo === "cursiva" && s.cursiva]}>{b.l}</Text>
          </Pressable>
        ))}
        <View style={s.flex1} />
        <Pressable onPress={() => setVista((v) => !v)} style={[s.boton, vista && s.botonOn]} accessibilityState={{ selected: vista }}>
          <Text style={[s.botonTxt, vista && s.botonTxtOn]}>{vista ? "Editar" : "Vista previa"}</Text>
        </Pressable>
      </View>
      {vista ? (
        <View style={[style, s.vista]}>
          {value?.trim() ? <TextoConFormato texto={value} fontSize={14} /> : <Text style={s.vacio}>Nada para mostrar todavía.</Text>}
        </View>
      ) : (
        <TextInput
          value={value || ""}
          onChangeText={(v) => { setSelForzada(null); onChange(v); }}
          onSelectionChange={(e) => { setSel(e.nativeEvent.selection); setSelForzada(null); }}
          selection={selForzada || undefined}
          placeholder={placeholder}
          placeholderTextColor={t.placeholder}
          multiline
          style={style}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  barra: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 6 },
  boton: { minWidth: 34, height: 32, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "white", alignItems: "center", justifyContent: "center" },
  botonOn: { borderColor: BLUE[500], backgroundColor: BLUE[50] },
  apagado: { opacity: 0.4 },
  botonTxt: { fontSize: 12.5, fontWeight: "700", color: t.text },
  botonTxtOn: { color: BLUE[700] },
  negrita: { fontWeight: "900" },
  cursiva: { fontStyle: "italic" },
  flex1: { flex: 1 },
  vista: { minHeight: 96 },
  vacio: { fontSize: 13, color: t.textMuted },
});
