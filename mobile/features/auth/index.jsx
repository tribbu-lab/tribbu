// Auth en RN: Login + "olvidé mi contraseña" + RegistroConCodigo + CambiarPasswordModal.
// Misma lógica de Supabase Auth que la web (src/features/auth); UI con primitivas RN.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import { T } from "@shared/theme";
import { Wordmark } from "../../components/Wordmark";

// ── Login ─────────────────────────────────────────────────────────────────
// onSuccess: opcional — lo usa BiometricGate como fallback de identidad
// cuando la huella/Face ID falla o se cancela (mismo signInWithPassword de
// siempre, solo agrega un aviso de que ya terminó). El gate raíz (mobile/app/
// login.jsx) no lo pasa: ahí el SessionProvider reacciona solo al cambio de
// auth, como siempre.
export function Login({ onSuccess } = {}) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ld, setLd] = useState(false);
  const [vista, setVista] = useState("login"); // login | reset | registro
  const [resetOk, setResetOk] = useState(false);
  const [resetLd, setResetLd] = useState(false);

  const go = async () => {
    setErr("");
    setLd(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: pass,
      });
      setLd(false);
      if (authError) {
        console.warn("signInWithPassword error:", authError.status, authError.message);
        // "Invalid login credentials" = llegó a Supabase y rechazó; otro mensaje
        // (Network request failed, fetch, etc.) = la request no llegó al backend.
        setErr(
          /invalid login/i.test(authError.message)
            ? "Correo o contraseña incorrectos"
            : `No se pudo conectar: ${authError.message}`
        );
        return;
      }
      if (!authData?.user) {
        setErr("Correo o contraseña incorrectos");
        return;
      }
      // El SessionProvider detecta el cambio de auth y carga el usuario.
      onSuccess?.();
    } catch (e) {
      setLd(false);
      console.warn("signIn threw:", e);
      setErr(`No se pudo conectar: ${e?.message || e}`);
    }
  };

  const enviarReset = async () => {
    if (!email.trim()) {
      setErr("Ingresá tu correo primero");
      return;
    }
    setResetLd(true);
    setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL("/"),
    });
    setResetLd(false);
    if (error) {
      setErr("Error al enviar el correo: " + error.message);
      return;
    }
    setResetOk(true);
  };

  if (vista === "registro") return <RegistroConCodigo onVolver={() => setVista("login")} />;

  return (
    <KeyboardAvoidingView
      style={styles.authBg}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Wordmark size={40} letterSpacing={-2} />
          <Text style={styles.brandSub}>COMUNIDAD ESCOLAR</Text>
        </View>

        <View style={styles.authCard}>
          {resetOk ? (
            <View style={styles.center}>
              <Text style={styles.bigEmoji}>📬</Text>
              <Text style={styles.authTitle}>Revisá tu correo</Text>
              <Text style={styles.authMuted}>
                Te enviamos un link para restablecer tu contraseña a {email}.
              </Text>
              <Pressable
                onPress={() => {
                  setVista("login");
                  setResetOk(false);
                }}
              >
                <Text style={styles.link}>Volver al inicio</Text>
              </Pressable>
            </View>
          ) : vista === "reset" ? (
            <>
              <Text style={styles.authTitle}>Restablecer contraseña</Text>
              <Text style={styles.authMuted}>Te enviamos un link a tu correo para crear una nueva.</Text>
              <Field label="Correo">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="correo@mail.com"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={styles.authInput}
                />
              </Field>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <PrimaryBtn label={resetLd ? "Enviando..." : "Enviar link"} onPress={enviarReset} disabled={resetLd} />
              <Pressable
                onPress={() => {
                  setVista("login");
                  setErr("");
                }}
              >
                <Text style={styles.linkMuted}>← Volver</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Field label="Correo">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  keyboardType="email-address"
                  placeholder="correo@mail.com"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={styles.authInput}
                />
              </Field>
              <Field label="Contraseña">
                <TextInput
                  value={pass}
                  onChangeText={setPass}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  onSubmitEditing={go}
                  style={styles.authInput}
                />
              </Field>
              <Pressable
                onPress={() => {
                  setVista("reset");
                  setErr("");
                }}
                style={styles.alignEnd}
              >
                <Text style={styles.linkMuted}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <PrimaryBtn label={ld ? "Ingresando..." : "Ingresar"} onPress={go} disabled={ld} />
              <Pressable
                onPress={() => {
                  setVista("registro");
                  setErr("");
                }}
                style={styles.outlineBtn}
              >
                <Text style={styles.outlineBtnTxt}>Registrarme con código de invitación</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Registro con código ─────────────────────────────────────────────────────
export function RegistroConCodigo({ onVolver }) {
  const [paso, setPaso] = useState(1);
  const [codigo, setCodigo] = useState("");
  const [cursoData, setCursoData] = useState(null);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [ld, setLd] = useState(false);

  const verificarCodigo = async () => {
    if (!codigo.trim()) {
      setErr("Ingresá el código de invitación");
      return;
    }
    setLd(true);
    setErr("");
    // Verificación server-side (RPC SECURITY DEFINER) — no expone/enumera
    // codigos_invitacion vía la API. Ver supabase/rls-hardening.sql.
    const { data, error } = await supabase.rpc("verificar_codigo", {
      p_codigo: codigo.trim().toUpperCase(),
    });
    setLd(false);
    if (error || !data) {
      setErr("Código inválido. Pedile uno nuevo al Room Parent.");
      return;
    }
    if (!data.valido) {
      setErr(
        data.motivo === "inactivo"
          ? "Este código ya no está activo."
          : data.motivo === "sin_usos"
            ? "Este código llegó al límite de usos."
            : "Código inválido. Pedile uno nuevo al Room Parent.",
      );
      return;
    }
    setCursoData({ id: data.curso_id, nombre: data.curso_nombre, codigo_id: data.codigo_id });
    setPaso(2);
  };

  const registrar = async () => {
    if (!nombre.trim() || !email.trim() || !pass.trim()) {
      setErr("Completá todos los campos");
      return;
    }
    if (pass.length < 6) {
      setErr("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLd(true);
    setErr("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: pass,
      });
      if (authErr) throw new Error(authErr.message);
      const auth_id = authData.user?.id;

      // Alta + vínculo al curso + consumo del código, server-side (SECURITY
      // DEFINER, respeta RLS: no hay INSERT directo a usuarios/usuario_cursos).
      // Requiere supabase/rls-hardening.sql desplegado.
      const { error: rpcErr } = await supabase.rpc("crear_apoderado", {
        p_codigo: codigo.trim().toUpperCase(),
        p_auth_id: auth_id,
        p_nombre: nombre.trim(),
        p_apellido: apellido.trim() || null,
        p_email: email.trim().toLowerCase(),
      });
      if (rpcErr) throw new Error(rpcErr.message || "Error al crear el usuario");

      setPaso(3);
    } catch (e) {
      setErr(e.message || "Error al registrarse");
    }
    setLd(false);
  };

  return (
    <KeyboardAvoidingView style={styles.authBg} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Wordmark size={40} letterSpacing={-2} />
          <Text style={styles.brandSub}>REGISTRO DE APODERADO</Text>
        </View>

        <View style={styles.authCard}>
          {paso === 3 ? (
            <View style={styles.center}>
              <Text style={styles.bigEmoji}>🎉</Text>
              <Text style={styles.authTitle}>¡Bienvenido/a a tribbu!</Text>
              <Text style={styles.authMuted}>
                Tu cuenta fue creada y ya estás conectado/a al curso {cursoData?.nombre}.
              </Text>
              <PrimaryBtn label="Ir al inicio de sesión" onPress={onVolver} />
            </View>
          ) : paso === 1 ? (
            <>
              <Text style={styles.authTitle}>Ingresá tu código</Text>
              <Text style={styles.authMuted}>
                El Room Parent de tu curso te compartió un código de invitación.
              </Text>
              <Field label="Código de invitación">
                <TextInput
                  value={codigo}
                  onChangeText={(t) => setCodigo(t.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={10}
                  placeholder="Ej: ABC123"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  style={[styles.authInput, styles.codeInput]}
                />
              </Field>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <PrimaryBtn label={ld ? "Verificando..." : "Continuar"} onPress={verificarCodigo} disabled={ld} />
              <Pressable onPress={onVolver}>
                <Text style={styles.linkMuted}>← Volver al inicio de sesión</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.authTitle}>Creá tu cuenta</Text>
              <Text style={styles.authMuted}>Curso: {cursoData?.nombre}</Text>
              <Field label="Nombre">
                <TextInput value={nombre} onChangeText={setNombre} placeholder="Tu nombre" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.authInput} />
              </Field>
              <Field label="Apellido">
                <TextInput value={apellido} onChangeText={setApellido} placeholder="Tu apellido" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.authInput} />
              </Field>
              <Field label="Correo">
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="correo@mail.com" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.authInput} />
              </Field>
              <Field label="Contraseña">
                <TextInput value={pass} onChangeText={setPass} secureTextEntry placeholder="Mínimo 6 caracteres" placeholderTextColor="rgba(255,255,255,0.4)" style={styles.authInput} />
              </Field>
              {err ? <Text style={styles.err}>{err}</Text> : null}
              <PrimaryBtn label={ld ? "Registrando..." : "Crear cuenta"} onPress={registrar} disabled={ld} green />
              <Pressable onPress={() => { setPaso(1); setErr(""); }}>
                <Text style={styles.linkMuted}>← Cambiar código</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Cambiar contraseña ──────────────────────────────────────────────────────
export function CambiarPasswordModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const [nueva, setNueva] = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const guardar = async () => {
    setErr("");
    if (!nueva || !confirma) return setErr("Completá todos los campos");
    if (nueva.length < 6) return setErr("La contraseña debe tener al menos 6 caracteres");
    if (nueva !== confirma) return setErr("Las contraseñas no coinciden");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setSaving(false);
    if (error) return setErr("Error al cambiar la contraseña: " + error.message);
    setOk(true);
  };

  const cerrar = () => {
    setNueva("");
    setConfirma("");
    setErr("");
    setOk(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={cerrar}>
      <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Cambiar contraseña</Text>
          {ok ? (
            <View style={styles.center}>
              <Text style={styles.bigEmoji}>✅</Text>
              <Text style={styles.okTxt}>Contraseña actualizada</Text>
              <PrimaryBtn label="Cerrar" onPress={cerrar} />
            </View>
          ) : (
            <>
              <Text style={styles.modalLabel}>NUEVA CONTRASEÑA</Text>
              <TextInput value={nueva} onChangeText={setNueva} secureTextEntry placeholder="Mínimo 6 caracteres" placeholderTextColor="#94A3B8" style={styles.modalInput} />
              <Text style={styles.modalLabel}>CONFIRMAR CONTRASEÑA</Text>
              <TextInput value={confirma} onChangeText={setConfirma} secureTextEntry placeholder="Repetí la contraseña" placeholderTextColor="#94A3B8" style={styles.modalInput} />
              {err ? <Text style={styles.errDark}>{err}</Text> : null}
              <View style={styles.modalBtns}>
                <Pressable onPress={cerrar} style={styles.cancelBtn}>
                  <Text style={styles.cancelTxt}>Cancelar</Text>
                </Pressable>
                <Pressable onPress={guardar} disabled={saving} style={styles.saveBtn}>
                  <Text style={styles.saveTxt}>{saving ? "Guardando..." : "Cambiar"}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Helpers de UI ───────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PrimaryBtn({ label, onPress, disabled, green }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.primaryBtn, green && styles.primaryBtnGreen, disabled && styles.primaryBtnDisabled]}
    >
      {disabled ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={styles.primaryBtnTxt}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  authBg: { flex: 1, backgroundColor: "#0F172A" },
  authScroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brandWrap: { alignItems: "center", marginBottom: 32 },
  brandSub: { fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4, letterSpacing: 1 },
  authCard: {
    width: "100%",
    maxWidth: 360,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  authTitle: { fontSize: 16, fontWeight: "800", color: "white", marginBottom: 4 },
  authMuted: { fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 16, lineHeight: 19 },
  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 6,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  authInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "white",
    fontSize: 14,
  },
  codeInput: { textAlign: "center", fontSize: 20, fontWeight: "800", letterSpacing: 4 },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  primaryBtnGreen: { backgroundColor: T.green },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnTxt: { color: "white", fontSize: 14, fontWeight: "800" },
  outlineBtn: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  outlineBtnTxt: { color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "600" },
  link: { color: "rgba(255,255,255,0.6)", fontSize: 13, textDecorationLine: "underline", marginTop: 12 },
  linkMuted: { color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", marginTop: 4 },
  alignEnd: { alignSelf: "flex-end", marginBottom: 12 },
  err: { fontSize: 12, color: "#FCA5A5", marginBottom: 12, textAlign: "center" },
  errDark: { fontSize: 12, color: "#EF4444", marginBottom: 12, textAlign: "center" },
  center: { alignItems: "center", paddingVertical: 8 },
  bigEmoji: { fontSize: 36, marginBottom: 12 },
  okTxt: { fontSize: 14, fontWeight: "700", color: T.green, marginBottom: 16 },
  // Modal cambiar pass
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: { width: "100%", maxWidth: 380, backgroundColor: "white", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 16, fontWeight: "900", color: T.text, marginBottom: 16 },
  modalLabel: { fontSize: 11, fontWeight: "700", color: "#94A3B8", marginBottom: 5 },
  modalInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontSize: 13,
    backgroundColor: "#F8FAFC",
    color: T.text,
    marginBottom: 12,
  },
  modalBtns: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTxt: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  saveBtn: {
    flex: 2,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  saveTxt: { color: "white", fontSize: 13, fontWeight: "700" },
});
