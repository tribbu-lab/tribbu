// Membrete de un comunicado del colegio (recordatorios.con_membrete). Puerto
// de src/components/Membrete.jsx. `m` = membreteDe(colegio, nivel).
import { View, Text, StyleSheet } from "react-native";
import { THEMES } from "@shared/tokens";
import { SignedImage } from "./SignedImage";

const t = THEMES.light;

export function MembreteEncabezado({ m }) {
  if (!m) return null;
  return (
    <View style={s.encabezado}>
      {m.logo ? <SignedImage src={m.logo} bucket="adjuntos" resizeMode="contain" style={s.logo} /> : null}
      <View style={s.flex1}>
        <Text style={s.nombre}>{m.nombre}</Text>
        {m.linea ? <Text style={s.linea}>{m.linea}</Text> : null}
      </View>
    </View>
  );
}

export function MembreteFirma({ m }) {
  if (!m?.firma) return null;
  return (
    <View style={s.firmaCaja}>
      <Text style={s.firma}>{m.firma}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  encabezado: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 12, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  logo: { width: 44, height: 44, borderRadius: 8, backgroundColor: "white" },
  flex1: { flex: 1, minWidth: 0 },
  nombre: { fontSize: 14.5, fontWeight: "800", color: t.textStrong },
  linea: { fontSize: 12.5, color: t.textMuted, marginTop: 1 },
  firmaCaja: { marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E2E8F0", alignItems: "flex-end" },
  firma: { fontSize: 13.5, fontWeight: "700", color: t.text },
});
