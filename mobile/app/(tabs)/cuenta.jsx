// "Mi cuenta" — se abre desde el círculo con las iniciales del header. Antes
// era el final de "Más"; las funciones del colegio pasaron a la pestaña
// Curso. Los avisos automáticos tienen su propia hoja (Notificaciones).
import { useState, useEffect } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator, Switch } from "react-native";
import { useRouter } from "expo-router";
import { Sheet } from "../../components/Sheet";
import * as LocalAuthentication from "expo-local-authentication";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { T } from "@shared/theme";
import { THEMES, TYPE, SPACE, RADIUS, SLATE } from "@shared/tokens";
import { iniciales } from "@shared/helpers";
import { TAB_BAR_SPACE } from "../../components/FloatingTabBar";
import { useSession } from "../../context/Session";
import { CambiarPasswordModal } from "../../features/auth";
import { BloqueadosSheet } from "../../features/mensajes";
import { deleteMyAccount } from "../../lib/authAdmin";
import { getBiometricPref, setBiometricPref } from "../../lib/biometricPref";
import { supabase } from "../../lib/supabase";
import { TIPOS_AVISO, preferenciasEfectivas, filaPreferencias } from "@shared/avisos";

const t = THEMES.light;

export default function CuentaScreen() {
  const router = useRouter();
  const { esDocente, usuario, logout } = useSession();
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
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{iniciales(usuario)}</Text>
        </View>
        <View style={styles.flex1}>
          <Text style={styles.perfilNombre}>{[usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ")}</Text>
          {usuario?.email ? <Text style={styles.crowMeta}>{usuario.email}</Text> : null}
        </View>
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
        <Pressable onPress={() => router.push({ pathname: "/(tabs)/mensajes", params: { soporte: "1", t: String(Date.now()) } })} style={styles.crow}>
          <MaterialCommunityIcons name="lifebuoy" size={19} color={t.textMuted} />
          <View style={styles.flex1}>
            <Text style={styles.crowTitulo}>Ayuda y soporte</Text>
            <Text style={styles.crowMeta}>Escribile al equipo de tribbu</Text>
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
  avatar: { width: 44, height: 44, borderRadius: RADIUS.full, backgroundColor: SLATE[800], alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
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
  crowTitulo: { fontSize: 14, fontWeight: "700", color: t.textStrong },
  crowMeta: { fontSize: 12, color: t.textMuted, marginTop: 1 },
  nota: { fontSize: 11.5, color: t.textFaint, marginTop: SPACE.sm, lineHeight: 16 },
});
