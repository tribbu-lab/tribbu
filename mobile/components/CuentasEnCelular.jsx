// "Cuentas en este celular" (specs/perfil-multicuenta.md): lista, cambio con un
// toque y "Agregar otra cuenta". Va en Mi cuenta de la familia y del panel.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { otrasCuentas, rolVaAlPanel } from "@shared/cuentas";
import { Sheet } from "./Sheet";
import { useSession } from "../context/Session";
import { PasswordInput } from "../features/auth";

const t = THEMES.light;

// La contraseña no se guarda.
function AgregarCuentaSheet({ visible, emailInicial, onClose, onAgregar }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    if (visible) {
      setEmail(emailInicial || "");
      setPass("");
      setError("");
    }
  }, [visible, emailInicial]);
  const enviar = async () => {
    if (!email.trim() || !pass || enviando) return;
    setEnviando(true);
    setError("");
    const res = await onAgregar(email, pass);
    setEnviando(false);
    if (res?.error) setError(res.error);
    else onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={emailInicial ? "Volvé a entrar" : "Agregar otra cuenta"}>
      <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.nota}>
          {emailInicial ? "La sesión de esta cuenta venció. Poné su contraseña una vez más." : "Tu otra cuenta de tribbu: la de otro colegio, o la de personal si además sos familia. Entrás una sola vez; después cambiás con un toque y recibís los avisos de todas."}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Correo"
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardType="email-address"
          textContentType="username"
          style={styles.input}
        />
        <PasswordInput
          value={pass}
          onChangeText={setPass}
          placeholder="Contraseña"
          placeholderTextColor={t.textMuted}
          iconColor={t.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="password"
          textContentType="password"
          style={styles.input}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={enviar} disabled={enviando} accessibilityRole="button" style={[styles.btn, enviando && styles.btnOff]}>
          {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnTxt}>Entrar</Text>}
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

export function CuentasEnCelular() {
  const router = useRouter();
  const { authId, cuentas, cambiandoCuenta, cambiarCuenta, agregarCuenta, quitarOtraCuenta } = useSession();
  const otras = otrasCuentas(cuentas, authId);
  // null = cerrado; "" = cuenta nueva; un mail = volver a entrar a una vencida.
  const [agregar, setAgregar] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const irAlInicio = (rol) => router.replace(rolVaAlPanel(rol) ? "/(super)" : "/(tabs)/muro");
  const abrirCuenta = async (c) => {
    if (abriendo || cambiandoCuenta) return;
    setAbriendo(c.auth_id);
    const res = await cambiarCuenta(c.auth_id);
    setAbriendo(null);
    if (res?.vencida) setAgregar(c.email || "");
    else if (res?.error) Alert.alert("No se pudo abrir la cuenta", res.error);
    else irAlInicio(res?.rol);
  };
  const confirmarQuitar = (c) => {
    Alert.alert("¿Quitar esta cuenta del celular?", `Vas a dejar de recibir acá los avisos de ${c.nombre || c.email}. La cuenta no se borra.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => quitarOtraCuenta(c.auth_id) },
    ]);
  };
  const entrarConOtra = async (email, pass) => {
    const res = await agregarCuenta(email, pass);
    if (res?.ok) irAlInicio(res.rol);
    return res;
  };
  return (
    <>
      <Text style={styles.label}>Cuentas en este celular</Text>
      <View style={styles.card}>
        {otras.map((c, i) => (
          <View key={c.auth_id} style={[styles.fila, i > 0 && styles.borde]}>
            <Pressable onPress={() => abrirCuenta(c)} disabled={!!abriendo} accessibilityRole="button" accessibilityLabel={`Cambiar a la cuenta de ${c.nombre || c.email}`} style={styles.filaToque}>
              <MaterialCommunityIcons name="account-switch-outline" size={19} color={t.textMuted} />
              <View style={styles.flex1}>
                <Text style={styles.titulo} numberOfLines={1}>{c.nombre || c.email}</Text>
                <Text style={styles.meta} numberOfLines={1}>{c.etiqueta || c.email}</Text>
              </View>
              {abriendo === c.auth_id ? <ActivityIndicator size="small" color={t.accent} /> : null}
            </Pressable>
            <Pressable onPress={() => confirmarQuitar(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar la cuenta de ${c.nombre || c.email} de este celular`} style={styles.quitar}>
              <MaterialCommunityIcons name="close" size={18} color={t.textMuted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setAgregar("")} accessibilityRole="button" style={[styles.fila, otras.length > 0 && styles.borde]}>
          <MaterialCommunityIcons name="account-plus-outline" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.titulo}>Agregar otra cuenta</Text>
            <Text style={styles.meta}>De otro colegio, o de personal y de familia</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
      </View>
      <AgregarCuentaSheet visible={agregar !== null} emailInicial={agregar} onClose={() => setAgregar(null)} onAgregar={entrarConOtra} />
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  card: { backgroundColor: t.surfaceRaised, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: t.border, overflow: "hidden", marginBottom: SPACE.md },
  fila: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 13, minHeight: 52 },
  borde: { borderTopWidth: 1, borderTopColor: t.border },
  filaToque: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: 44 },
  quitar: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -SPACE.sm },
  titulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  meta: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  nota: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  form: { flexShrink: 1 },
  input: { borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, minHeight: 46, fontSize: 15, color: t.textStrong, backgroundColor: t.surfaceRaised, marginTop: SPACE.sm },
  error: { fontSize: 13, color: t.danger, marginTop: SPACE.sm },
  btn: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: SPACE.md, marginBottom: SPACE.sm },
  btnOff: { opacity: 0.6 },
  btnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
