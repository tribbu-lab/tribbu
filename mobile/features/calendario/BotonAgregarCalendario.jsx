// mobile/features/calendario/BotonAgregarCalendario.jsx (puerto RN de
// src/features/calendario/BotonAgregarCalendarioWeb.jsx)
//
// Sincroniza el feed ICS de tribbu (eventos + cumpleaños + citas de todos
// los cursos del usuario) con el calendario personal, con un flujo distinto
// por plataforma (ver specs/eleccion-de-calendario-mobile.md):
//
// - iOS: el usuario elige su calendario. "Apple Calendar" abre webcal:// (el
//   SO resuelve el flujo nativo de suscripción, confirmado que persiste) y
//   "Google Calendar" abre calendar.google.com/calendar/render?cid=webcal://…
//   — el mismo flujo verificado de la web — dentro de un
//   SFSafariViewController (expo-web-browser): los universal links NO se
//   disparan ahí, así que la app nativa de Google Calendar no puede
//   interceptar la URL. (Costo: cookies aisladas de Safari → posible login
//   de Google la primera vez, fricción única.)
//
// - Android: "Conectar con mi calendario" escribe los eventos directo en el
//   calendario Google del dispositivo vía expo-calendar (CalendarContract) —
//   sin browser ni login; el motor vive en mobile/lib/calendarSync.js y
//   re-sincroniza al abrir la app. Se eligió esto porque el atajo web NO
//   funciona en Android: calendar.google.com está verificado como App Link
//   de la app de Google Calendar — Android le entrega la URL a esa app
//   (probado con Linking.openURL y Custom Tab), que muestra selector de
//   cuenta + un "agregado con éxito" falso sin suscribir nada (confirmado
//   con un usuario real). Un WebView interno tampoco sirve: Google bloquea
//   el login en WebViews embebidos (disallowed_useragent). Ni Google
//   Calendar ni Outlook/Samsung Calendar tienen "agregar por URL" en su app
//   mobile — requieren la web de escritorio. "Copiar enlace" queda como
//   fallback (otras apps / permiso denegado / sin cuenta Google).
//
// UI colapsada en un Sheet para no empujar el resto de Calendario hacia
// abajo: el trigger es una sola línea, y una vez que el usuario ya usó
// alguna acción queda marcado como "sincronizado" (AsyncStorage) para no
// insistir con el mismo bloque en cada visita.
//
// El token vive en su propia tabla (usuario_calendar_tokens, no en
// usuarios) para que usuarios_select no lo exponga a compañeros de curso —
// ver supabase/calendar-token-hardening.sql.

import { useEffect, useState } from "react";
import { View, Text, Pressable, Platform, Linking, AppState, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { T } from "@shared/theme";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { getRuntimeConfig } from "@shared/runtimeConfig";
import { supabase } from "../../lib/supabase";
import { Sheet } from "../../components/Sheet";
import { prepararConexion, sincronizar, sincronizarSiConectado, desconectar } from "../../lib/calendarSync";

const t = THEMES.light;
const claveSincronizado = (userId) => `calsync_${userId}`;

export default function BotonAgregarCalendario({ userId }) {
  const [token, setToken] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // Android (conexión al calendario del dispositivo):
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [candidatos, setCandidatos] = useState(null); // >1 calendario Google → mini-picker
  const [errorConexion, setErrorConexion] = useState(null);
  // Guarda el método usado ("webcal" | "gcal" | "device" | "copia"), no solo
  // un booleano: copiar el enlace todavía no sincronizó nada (falta pegarlo
  // en el calendario), a diferencia de los otros tres, que sí conectan ahí
  // mismo — el trigger no debe decir "sincronizado" para lo primero.
  // OJO: "gcal" es el flujo Google real de iOS; "google" quedó reservado de
  // un intento anterior en Android que resultó ser un falso positivo — ver
  // header — y se trata igual que "copia". No reutilizar "google".
  const [metodo, setMetodo] = useState(null);
  const sincronizado = metodo === "webcal" || metodo === "gcal" || metodo === "device";
  const soloCopiado = metodo === "copia" || metodo === "google" || metodo === "1"; // "1" = legacy, previo a este fix

  useEffect(() => {
    if (!userId) return;
    let activo = true;
    AsyncStorage.getItem(claveSincronizado(userId))
      .then((v) => { if (activo) setMetodo(v); })
      .catch(() => {});
    return () => { activo = false; };
  }, [userId]);

  const marcarSincronizado = (m) => {
    setMetodo(m);
    AsyncStorage.setItem(claveSincronizado(userId), m).catch(() => {});
  };

  useEffect(() => {
    let activo = true;
    (async () => {
      if (!userId) {
        if (activo) setCargando(false);
        return;
      }
      try {
        const { data, error } = await supabase.from("usuario_calendar_tokens").select("token").eq("usuario_id", userId).maybeSingle();
        if (!activo) return;
        if (error) throw error;
        if (data?.token) {
          setToken(data.token);
        } else {
          const { data: nuevoToken, error: rpcErr } = await supabase.rpc("regenerar_calendar_token");
          if (!activo) return;
          if (rpcErr) throw rpcErr;
          setToken(nuevoToken);
        }
      } catch (e) {
        console.warn("No se pudo obtener el token de calendario:", e?.message);
        if (activo) setToken(null);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [userId]);

  const { supabaseUrl } = getRuntimeConfig();
  const feedUrl = token && supabaseUrl ? `${supabaseUrl}/functions/v1/calendar-feed?token=${token}` : null;

  // Android conectado: re-sync silencioso al montar Calendario y al volver a
  // foreground (con throttle adentro de sincronizarSiConectado).
  useEffect(() => {
    if (Platform.OS !== "android" || metodo !== "device" || !feedUrl || !userId) return;
    sincronizarSiConectado({ userId, feedUrl });
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") sincronizarSiConectado({ userId, feedUrl });
    });
    return () => sub.remove();
  }, [metodo, feedUrl, userId]);

  const copiarUrl = async () => {
    if (!feedUrl) return;
    try {
      await Clipboard.setStringAsync(feedUrl);
      setCopiado(true);
      // Conectado al dispositivo, copiar es solo un extra: no degradar el estado.
      if (metodo !== "device") marcarSincronizado("copia");
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      console.warn("No se pudo copiar el enlace de calendario:", e?.message);
    }
  };

  const abrirWebcal = () => {
    if (!feedUrl) return;
    Linking.openURL(feedUrl.replace(/^https?:\/\//, "webcal://")).catch((e) =>
      console.warn("No se pudo abrir el enlace webcal:", e?.message)
    );
    marcarSincronizado("webcal");
  };

  const abrirEnGoogle = async () => {
    if (!feedUrl) return;
    // cid= espera un URL con esquema webcal:// para reconocerlo como una
    // suscripción a un feed externo — con https:// a secas, Google falla con
    // "Unable to add calendar" (misma conversión que la web).
    const webcalUrl = feedUrl.replace(/^https?:\/\//, "webcal://");
    const googleUrl = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcalUrl);
    try {
      // Se marca al cerrar el browser (la promesa resuelve ahí), no al
      // abrirlo: reduce el falso "sincronizado" si cierra sin confirmar.
      await WebBrowser.openBrowserAsync(googleUrl);
      marcarSincronizado("gcal");
    } catch (e) {
      console.warn("No se pudo abrir Google Calendar:", e?.message);
    }
  };

  const conectarDispositivo = async (calendarId = null) => {
    if (!feedUrl) return;
    setErrorConexion(null);
    setConectando(true);
    try {
      let elegido = calendarId;
      if (!elegido) {
        const prep = await prepararConexion();
        if (!prep.ok) {
          setErrorConexion(
            prep.motivo === "permiso"
              ? "Sin permiso de calendario no se puede conectar. Podés darlo en Ajustes, o copiar el enlace y agregarlo a mano."
              : "No se encontró un calendario de Google en este teléfono. Copiá el enlace y agregalo a mano en calendar.google.com."
          );
          return;
        }
        if (prep.calendarios.length > 1) {
          setCandidatos(prep.calendarios);
          return;
        }
        elegido = prep.calendarios[0].id;
      }
      await sincronizar({ userId, feedUrl, calendarId: elegido });
      setCandidatos(null);
      // Recién acá: el primer sync terminó sin error (no al pedir permiso).
      marcarSincronizado("device");
    } catch (e) {
      console.warn("No se pudo conectar el calendario:", e?.message);
      setErrorConexion("No se pudo conectar el calendario. Probá de nuevo, o copiá el enlace y agregalo a mano.");
    } finally {
      setConectando(false);
    }
  };

  const desconectarDispositivo = async () => {
    setDesconectando(true);
    try {
      await desconectar({ userId });
      setMetodo(null);
      AsyncStorage.removeItem(claveSincronizado(userId)).catch(() => {});
    } catch (e) {
      console.warn("No se pudo desconectar el calendario:", e?.message);
    } finally {
      setDesconectando(false);
    }
  };

  const regenerar = async () => {
    setRegenerando(true);
    try {
      const { data: nuevoToken, error } = await supabase.rpc("regenerar_calendar_token");
      if (error) throw error;
      setToken(nuevoToken);
    } catch (e) {
      console.warn("No se pudo regenerar el enlace de calendario:", e?.message);
    } finally {
      setRegenerando(false);
      setConfirmarRegenerar(false);
    }
  };

  if (cargando || !feedUrl) return null;

  const labelTrigger = sincronizado
    ? metodo === "device" ? "✓ Calendario conectado" : "✓ Calendario sincronizado"
    : soloCopiado ? "🔗 Enlace copiado — pegalo en tu calendario" : "📅 Agregar a tu calendario";

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setAbierto(true)} style={[styles.trigger, metodo && styles.triggerHecho]}>
        <Text style={[styles.triggerTxt, metodo && styles.triggerTxtHecho]}>{labelTrigger}</Text>
      </Pressable>

      <Sheet visible={abierto} onClose={() => setAbierto(false)} title="Sincronizar calendario">
        <Text style={styles.hint}>
          {Platform.OS === "ios"
            ? "Los eventos de la escuela aparecerán en tu calendario y se actualizan solos. Google puede tardar unas horas en reflejar los cambios."
            : "Los eventos de la escuela aparecerán en tu calendario de Google y se actualizan cada vez que abrís tribbu."}
        </Text>

        {Platform.OS === "ios" ? (
          <>
            <Text style={styles.label}>¿Qué calendario usás?</Text>
            <View style={styles.row}>
              <Pressable onPress={abrirWebcal} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryTxt}> Apple Calendar</Text>
              </Pressable>
              <Pressable onPress={abrirEnGoogle} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryTxt}>🗓️ Google Calendar</Text>
              </Pressable>
              <Pressable onPress={copiarUrl} style={styles.btnSecondary}>
                <Text style={styles.btnSecondaryTxt}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Text>
              </Pressable>
            </View>
            <Text style={styles.hintSmall}>
              ¿Usás otra app de calendario (Outlook, etc.)? Copiá el enlace y pegalo ahí, en su opción de "agregar
              calendario desde una URL" o "suscribirse".
            </Text>
          </>
        ) : metodo === "device" ? (
          <>
            <View style={styles.row}>
              <Pressable onPress={copiarUrl} style={styles.btnSecondary}>
                <Text style={styles.btnSecondaryTxt}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Text>
              </Pressable>
            </View>
            <Pressable onPress={desconectarDispositivo} disabled={desconectando}>
              <Text style={[styles.linkDanger, styles.mtMd]}>
                {desconectando ? "Desconectando…" : "Desconectar (saca los eventos de tribbu de tu calendario)"}
              </Text>
            </Pressable>
          </>
        ) : candidatos ? (
          <>
            <Text style={styles.label}>¿En qué calendario?</Text>
            <View style={styles.col}>
              {candidatos.map((c) => (
                <Pressable key={c.id} onPress={() => conectarDispositivo(c.id)} disabled={conectando} style={styles.btnSecondary}>
                  <Text style={styles.btnSecondaryTxt}>
                    {c.titulo}{c.cuenta && c.cuenta !== c.titulo ? ` — ${c.cuenta}` : ""}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Pressable onPress={() => conectarDispositivo()} disabled={conectando} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryTxt}>{conectando ? "Conectando…" : "🗓️ Conectar con mi calendario"}</Text>
              </Pressable>
              <Pressable onPress={copiarUrl} style={styles.btnSecondary}>
                <Text style={styles.btnSecondaryTxt}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Text>
              </Pressable>
            </View>
            {errorConexion ? <Text style={styles.error}>{errorConexion}</Text> : null}
            <Text style={styles.hintSmall}>
              ¿Preferís otra app (Outlook, etc.)? Copiá el enlace y pegalo en la versión web de ese calendario, en su
              opción de "agregar calendario desde una URL" o "suscribirse".
            </Text>
          </>
        )}

        {confirmarRegenerar ? (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmTxt}>¿Seguro? Los calendarios ya suscriptos van a dejar de actualizarse.</Text>
            <View style={styles.confirmBtns}>
              <Pressable onPress={regenerar} disabled={regenerando}>
                <Text style={styles.linkDanger}>{regenerando ? "Regenerando…" : "Sí, regenerar"}</Text>
              </Pressable>
              <Pressable onPress={() => setConfirmarRegenerar(false)}>
                <Text style={styles.linkMuted}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmarRegenerar(true)}>
            <Text style={styles.link}>¿Problema con el enlace? Regenerar</Text>
          </Pressable>
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACE.md },
  trigger: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center",
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
    borderWidth: 1, borderColor: t.accent, backgroundColor: t.accentSoft || "#EFF6FF",
  },
  triggerHecho: { borderColor: t.border, backgroundColor: t.surface },
  triggerTxt: { fontSize: 12, fontWeight: "700", color: t.accent },
  triggerTxtHecho: { color: t.textMuted },
  label: { fontSize: 12, fontWeight: "700", color: t.text, marginTop: SPACE.md },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: SPACE.sm },
  col: { gap: 8, marginTop: SPACE.sm },
  btnPrimary: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnPrimaryTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  btnSecondary: { borderWidth: 1.5, borderColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnSecondaryTxt: { color: t.accent, fontSize: 13, fontWeight: "700" },
  hint: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  hintSmall: { fontSize: 11, color: t.textFaint, lineHeight: 15, marginTop: SPACE.md },
  error: { fontSize: 12, color: T.red, lineHeight: 17, marginTop: SPACE.sm },
  link: { fontSize: 12, fontWeight: "700", color: t.accent, textDecorationLine: "underline", marginTop: SPACE.md },
  linkDanger: { fontSize: 12, fontWeight: "700", color: T.red, textDecorationLine: "underline" },
  linkMuted: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  mtMd: { marginTop: SPACE.md },
  confirmRow: { gap: 4, marginTop: SPACE.md },
  confirmTxt: { fontSize: 12, color: t.textMuted },
  confirmBtns: { flexDirection: "row", gap: 14 },
});
