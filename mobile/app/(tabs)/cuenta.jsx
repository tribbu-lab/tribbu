// "Mi cuenta" — se abre desde el círculo con las iniciales del header. Antes
// era el final de "Más"; las funciones del colegio pasaron a la pestaña
// Curso. Los avisos automáticos tienen su propia hoja (Notificaciones).
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch } from "react-native";
import { useRouter } from "expo-router";
import { Sheet } from "../../components/Sheet";
import * as LocalAuthentication from "expo-local-authentication";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { CambiarPasswordModal } from "../../features/auth";
import { BloqueadosSheet } from "../../features/mensajes";
import { deleteMyAccount } from "../../lib/authAdmin";
import { getBiometricPref, setBiometricPref } from "../../lib/biometricPref";
import { supabase } from "../../lib/supabase";
import { TIPOS_AVISO, preferenciasEfectivas, filaPreferencias } from "@shared/avisos";
import { otrasCuentas } from "@shared/cuentas";
import { AvatarPerfil } from "../../components/AvatarPerfil";
import { elegirFotoPerfil, quitarFotoPerfil } from "../../lib/fotoPerfil";

const t = THEMES.light;

// "Agregar otra cuenta" (specs/perfil-multicuenta.md). La contraseña no se guarda.
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
      <ScrollView style={styles.formCuenta} keyboardShouldPersistTaps="handled">
        <Text style={styles.nota}>
          {emailInicial ? "La sesión de esta cuenta venció. Poné su contraseña una vez más." : "Si tenés hijos en otro colegio, entrá con esa cuenta una sola vez. Después cambiás con un toque y recibís los avisos de las dos."}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Correo"
          placeholderTextColor={t.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          style={styles.inputCuenta}
        />
        <TextInput
          value={pass}
          onChangeText={setPass}
          placeholder="Contraseña"
          placeholderTextColor={t.textMuted}
          secureTextEntry
          textContentType="password"
          style={styles.inputCuenta}
        />
        {error ? <Text style={styles.errorCuenta}>{error}</Text> : null}
        <Pressable onPress={enviar} disabled={enviando} accessibilityRole="button" style={[styles.btnCuenta, enviando && styles.btnCuentaOff]}>
          {enviando ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnCuentaTxt}>Entrar</Text>}
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

export default function CuentaScreen() {
  const router = useRouter();
  const { esDocente, usuario, logout, items, fotoPerfil, setFotoPerfil, authId, cuentas, cambiandoCuenta, cambiarCuenta, agregarCuenta, quitarOtraCuenta } = useSession();
  const otras = otrasCuentas(cuentas, authId);
  // null = cerrado; "" = cuenta nueva; un mail = volver a entrar a una vencida.
  const [agregar, setAgregar] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const abrirCuenta = async (c) => {
    if (abriendo || cambiandoCuenta) return;
    setAbriendo(c.auth_id);
    const res = await cambiarCuenta(c.auth_id);
    setAbriendo(null);
    if (res?.vencida) setAgregar(c.email || "");
    else if (res?.error) Alert.alert("No se pudo abrir la cuenta", res.error);
    else router.replace("/(tabs)/muro");
  };
  const confirmarQuitar = (c) => {
    Alert.alert("¿Quitar esta cuenta del celular?", `Vas a dejar de recibir acá los avisos de ${c.nombre || c.email}. La cuenta no se borra.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => quitarOtraCuenta(c.auth_id) },
    ]);
  };
  const entrarConOtra = async (email, pass) => {
    const res = await agregarCuenta(email, pass);
    if (res?.ok) router.replace("/(tabs)/muro");
    return res;
  };
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // Room Parent: dato del perfil (antes era un cartel en el header).
  const cursosRoom = [...new Set((items || []).filter((i) => i.rolEfectivo === "room").map((i) => i.cursos?.nombre).filter(Boolean))];

  const cambiarFoto = async () => {
    if (subiendoFoto) return;
    setSubiendoFoto(true);
    try {
      const nueva = await elegirFotoPerfil(usuario.id);
      if (nueva) setFotoPerfil(nueva);
    } catch (e) {
      Alert.alert("No se pudo cambiar la foto", e?.message || "Probá de nuevo en unos minutos.");
    }
    setSubiendoFoto(false);
  };
  const menuFoto = () => {
    if (!fotoPerfil) { cambiarFoto(); return; }
    Alert.alert("Foto de perfil", null, [
      { text: "Elegir otra foto", onPress: cambiarFoto },
      { text: "Quitar foto", style: "destructive", onPress: async () => {
        try { await quitarFotoPerfil(); setFotoPerfil(null); } catch { Alert.alert("No se pudo quitar la foto"); }
      } },
      { text: "Cancelar", style: "cancel" },
    ]);
  };
  const [notifAbierto, setNotifAbierto] = useState(false);
  const [cambiarPass, setCambiarPass] = useState(false);
  const [bloqueados, setBloqueados] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [bioEnabled, setBioEnabledState] = useState(false);
  // Avisos automáticos que quiere recibir (preferencias_avisos; sin fila = todos).
  const [prefsAvisos, setPrefsAvisos] = useState(null);

  useEffect(() => {
    if (!usuario?.id) return;
    let vivo = true;
    supabase
      .from("preferencias_avisos")
      .select("*")
      .eq("usuario_id", usuario.id)
      .maybeSingle()
      .then(({ data }) => {
        if (vivo) setPrefsAvisos(preferenciasEfectivas(data));
      });
    return () => {
      vivo = false;
    };
  }, [usuario?.id]);

  const cambiarAviso = async (k) => {
    const antes = prefsAvisos;
    const nuevo = { ...prefsAvisos, [k]: !prefsAvisos[k] };
    setPrefsAvisos(nuevo); // optimista
    const { error } = await supabase.from("preferencias_avisos").upsert(filaPreferencias(usuario.id, nuevo), { onConflict: "usuario_id" });
    if (error) {
      setPrefsAvisos(antes);
      Alert.alert("No se pudo guardar", "Probá de nuevo en unos minutos.");
    }
  };

  useEffect(() => {
    if (!usuario?.id) return;
    getBiometricPref(usuario.id).then(setBioEnabledState);
  }, [usuario?.id]);

  // Activar pide confirmar que el dispositivo realmente tiene huella/Face ID
  // configurado — sin eso el candado de apertura (BiometricGate) fallaría
  // siempre y dejaría al usuario encerrado hasta caer al fallback de contraseña.
  const toggleBiometria = async (valor) => {
    if (valor) {
      const [tieneHardware, tieneEnrolado] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!tieneHardware || !tieneEnrolado) {
        Alert.alert(
          "No disponible",
          "Tu dispositivo no tiene huella digital o Face ID configurado. Activalo en los ajustes del teléfono primero."
        );
        return;
      }
    }
    setBioEnabledState(valor);
    setBiometricPref(usuario.id, valor);
  };

  // Apple 5.1.1(v): la eliminación de cuenta debe poder iniciarse en la app.
  // Doble confirmación destructiva → Edge Function delete-account → signOut.
  const confirmarEliminar = () => {
    if (eliminando) return;
    Alert.alert(
      "Eliminar mi cuenta",
      "Se eliminarán tu cuenta y tus datos personales (accesos, confirmaciones y tokens de notificaciones). Los datos del curso no se ven afectados.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Continuar",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "¿Estás seguro?",
              "Esta acción es permanente y no se puede deshacer.",
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar definitivamente", style: "destructive", onPress: eliminarCuenta },
              ],
            ),
        },
      ],
    );
  };

  const eliminarCuenta = async () => {
    setEliminando(true);
    try {
      await deleteMyAccount();
      // La cuenta ya no existe: signOut solo limpia la sesión local y el
      // gate de auth vuelve al login.
      try {
        await logout();
      } catch {
        // la sesión puede estar ya invalidada del lado del servidor
      }
    } catch (e) {
      Alert.alert("No se pudo eliminar la cuenta", e.message || "Probá de nuevo en unos minutos.");
      setEliminando(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Mi cuenta</Text>
      <View style={styles.perfil}>
        <Pressable onPress={menuFoto} accessibilityRole="button" accessibilityLabel={fotoPerfil ? "Cambiar o quitar la foto de perfil" : "Poner una foto de perfil"}>
          <AvatarPerfil usuario={usuario} foto={fotoPerfil} size={56} />
          <View style={styles.camara}>
            {subiendoFoto ? <ActivityIndicator size="small" color="#fff" /> : <MaterialCommunityIcons name="camera-outline" size={13} color="#fff" />}
          </View>
        </Pressable>
        <View style={styles.flex1}>
          <Text style={styles.perfilNombre}>{[usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ")}</Text>
          {usuario?.email ? <Text style={styles.crowMeta}>{usuario.email}</Text> : null}
          {cursosRoom.length ? <Text style={styles.rolPerfil}>Room Parent de {cursosRoom.join(" y ")}</Text> : null}
          <Pressable onPress={menuFoto} hitSlop={6}><Text style={styles.linkFoto}>{fotoPerfil ? "Cambiar foto" : "Poner una foto"}</Text></Pressable>
        </View>
      </View>

      <Text style={styles.label}>Cuentas en este celular</Text>
      <View style={styles.card}>
        {otras.map((c, i) => (
          <View key={c.auth_id} style={[styles.crow, i > 0 && styles.crowBorde]}>
            <Pressable onPress={() => abrirCuenta(c)} disabled={!!abriendo} accessibilityRole="button" accessibilityLabel={`Cambiar a la cuenta de ${c.nombre || c.email}`} style={styles.filaCuenta}>
              <MaterialCommunityIcons name="account-switch-outline" size={19} color={t.textMuted} />
              <View style={styles.flex1}>
                <Text style={styles.crowTitulo} numberOfLines={1}>{c.nombre || c.email}</Text>
                <Text style={styles.crowMeta} numberOfLines={1}>{c.etiqueta || c.email}</Text>
              </View>
              {abriendo === c.auth_id ? <ActivityIndicator size="small" color={t.accent} /> : null}
            </Pressable>
            <Pressable onPress={() => confirmarQuitar(c)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quitar la cuenta de ${c.nombre || c.email} de este celular`} style={styles.quitarCuenta}>
              <MaterialCommunityIcons name="close" size={18} color={t.textMuted} />
            </Pressable>
          </View>
        ))}
        <Pressable onPress={() => setAgregar("")} accessibilityRole="button" style={[styles.crow, otras.length > 0 && styles.crowBorde]}>
          <MaterialCommunityIcons name="account-plus-outline" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Agregar otra cuenta</Text>
            <Text style={styles.crowMeta}>Para tus hijos en otro colegio</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
      </View>

      {/* Los avisos automáticos son para familias (eventos, colectas, cumples):
          a una docente no le llega ninguno, así que no hay nada que configurar. */}
      {esDocente ? null : (
        <>
          <Text style={styles.label}>Preferencias</Text>
          <View style={styles.card}>
            <Pressable onPress={() => setNotifAbierto(true)} style={styles.crow}>
              <MaterialCommunityIcons name="bell-outline" size={19} color={t.textMuted} />
              <View style={styles.flex1}>
                <Text style={styles.crowTitulo}>Notificaciones</Text>
                <Text style={styles.crowMeta}>Qué avisos automáticos querés recibir</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
            </Pressable>
          </View>
        </>
      )}

      <Text style={styles.label}>Cuenta</Text>
      <View style={styles.card}>
        <Pressable onPress={() => router.push("/(tabs)/ayuda")} style={styles.crow}>
          <MaterialCommunityIcons name="lifebuoy" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Ayuda y soporte</Text>
            <Text style={styles.crowMeta}>Preguntas frecuentes y contacto con tribbu</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
        <Pressable onPress={() => setBloqueados(true)} style={[styles.crow, styles.crowBorde]}>
          <MaterialCommunityIcons name="account-cancel-outline" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Usuarios bloqueados</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
        <Pressable onPress={() => setCambiarPass(true)} style={[styles.crow, styles.crowBorde]}>
          <MaterialCommunityIcons name="key-outline" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Cambiar contraseña</Text>
            {usuario?.email ? <Text style={styles.crowMeta}>{usuario.email}</Text> : null}
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={SLATE[300]} />
        </Pressable>
        <View style={[styles.crow, styles.crowBorde]}>
          <MaterialCommunityIcons name="fingerprint" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Desbloqueo con huella/Face ID</Text>
            <Text style={styles.crowMeta}>Pide biometría al abrir la app</Text>
          </View>
          <Switch value={bioEnabled} onValueChange={toggleBiometria} trackColor={{ true: t.accent }} />
        </View>
        <Pressable onPress={logout} style={[styles.crow, styles.crowBorde]}>
          <MaterialCommunityIcons name="logout" size={19} color={t.danger} />
          <View style={styles.flex1}>
            <Text style={[styles.crowTitulo, { color: t.danger }]}>Cerrar sesión</Text>
          </View>
        </Pressable>
        <Pressable onPress={confirmarEliminar} style={[styles.crow, styles.crowBorde]} disabled={eliminando}>
          <MaterialCommunityIcons name="account-remove-outline" size={19} color={t.danger} />
          <View style={styles.flex1}>
            <Text style={[styles.crowTitulo, { color: t.danger }]}>Eliminar mi cuenta</Text>
            <Text style={styles.crowMeta}>Borra tu cuenta y tus datos de forma permanente</Text>
          </View>
          {eliminando ? <ActivityIndicator size="small" color={t.danger} /> : null}
        </Pressable>
      </View>

      <AgregarCuentaSheet visible={agregar !== null} emailInicial={agregar} onClose={() => setAgregar(null)} onAgregar={entrarConOtra} />

      <Sheet visible={notifAbierto} onClose={() => setNotifAbierto(false)} title="Notificaciones">
        <ScrollView style={styles.sheetScroll}>
          <View style={styles.card}>
            {TIPOS_AVISO.map((tipo, i) => (
              <View key={tipo.k} style={[styles.crow, i > 0 && styles.crowBorde]}>
                <View style={styles.flex1}>
                  <Text style={styles.crowTitulo}>{tipo.titulo}</Text>
                  <Text style={styles.crowMeta}>{tipo.desc}</Text>
                </View>
                <Switch
                  value={prefsAvisos ? prefsAvisos[tipo.k] : true}
                  disabled={!prefsAvisos}
                  onValueChange={() => cambiarAviso(tipo.k)}
                  trackColor={{ true: t.accent }}
                />
              </View>
            ))}
          </View>
          <Text style={styles.nota}>Son avisos automáticos. Los avisos y alertas que publica el curso te llegan siempre.</Text>
        </ScrollView>
      </Sheet>
      <CambiarPasswordModal visible={cambiarPass} onClose={() => setCambiarPass(false)} />
      <BloqueadosSheet visible={bloqueados} onCerrar={() => setBloqueados(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: SPACE.lg, paddingBottom: TAB_BAR_SPACE },
  flex1: { flex: 1 },
  h1: { fontSize: 21, fontWeight: "800", color: t.textStrong, letterSpacing: -0.3, marginBottom: SPACE.lg },
  perfil: { flexDirection: "row", alignItems: "center", gap: SPACE.md, backgroundColor: t.surface, borderWidth: 1, borderColor: t.borderStrong, borderRadius: RADIUS.xl, padding: 14 },
  camara: { position: "absolute", right: -2, bottom: -2, width: 22, height: 22, borderRadius: RADIUS.full, backgroundColor: SLATE[700], borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  rolPerfil: { fontSize: 12.5, fontWeight: "700", color: "#047857", marginTop: 3 },
  linkFoto: { fontSize: 12.5, fontWeight: "700", color: t.accent, marginTop: 5 },
  perfilNombre: { fontSize: 15, fontWeight: "800", color: t.textStrong },
  sheetScroll: { flexShrink: 1 },
  label: { ...TYPE.label, color: t.textFaint, marginTop: SPACE.xl, marginBottom: SPACE.sm },
  card: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.borderStrong,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
  },
  crow: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: 13, minHeight: 52 },
  crowBorde: { borderTopWidth: 1, borderTopColor: t.border },
  filaCuenta: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: 44 },
  quitarCuenta: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -SPACE.sm },
  formCuenta: { flexShrink: 1 },
  inputCuenta: { borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingHorizontal: SPACE.md, minHeight: 46, fontSize: 15, color: t.textStrong, backgroundColor: t.surfaceRaised, marginTop: SPACE.sm },
  errorCuenta: { fontSize: 13, color: t.danger, marginTop: SPACE.sm },
  btnCuenta: { backgroundColor: t.accent, borderRadius: RADIUS.md, minHeight: 46, alignItems: "center", justifyContent: "center", marginTop: SPACE.md, marginBottom: SPACE.sm },
  btnCuentaOff: { opacity: 0.6 },
  btnCuentaTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
  crowTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  crowMeta: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  nota: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
});
