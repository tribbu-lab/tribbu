// mobile/features/calendario/BotonAgregarCalendario.jsx (puerto RN de
// src/features/calendario/BotonAgregarCalendarioWeb.jsx)
//
// Copia el enlace del feed ICS de tribbu (eventos + cumpleaños + festejos de
// todos los cursos del usuario). En iOS se ofrece abrirlo directo con
// webcal:// (el SO resuelve el flujo nativo de suscripción, y confirmado que
// sí persiste). En Android NO hay atajo de un toque que funcione de verdad:
// se probaron Linking.openURL y una Custom Tab (expo-web-browser) contra
// calendar.google.com/.../render?cid=, pero calendar.google.com está
// verificado como Android App Link de la app de Google Calendar — Android le
// entrega el link a esa app en los dos casos, y la app de Calendar muestra
// selector de cuenta + un "agregado con éxito" falso: no llega a suscribir
// nada de verdad (ni en la app ni en calendar.google.com desde el
// navegador — confirmado con un usuario real). Ni Google Calendar ni
// Outlook/Samsung Calendar tienen "agregar por URL" dentro de su app mobile
// — las tres requieren pasar por la versión web de escritorio del calendario
// que uses. Así que en Android solo se ofrece "Copiar enlace" + instrucciones
// para pegarlo ahí.
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
import { View, Text, Pressable, Platform, Linking, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { T } from "@shared/theme";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { getRuntimeConfig } from "@shared/runtimeConfig";
import { supabase } from "../../lib/supabase";
import { Sheet } from "../../components/Sheet";

const t = THEMES.light;
const claveSincronizado = (userId) => `calsync_${userId}`;

export default function BotonAgregarCalendario({ userId }) {
  const [token, setToken] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // Guarda el método usado ("webcal" | "copia"), no solo un booleano: copiar
  // el enlace todavía no sincronizó nada (falta pegarlo en el calendario), a
  // diferencia de abrir webcal:// en iOS, que sí completa la suscripción ahí
  // mismo — el trigger no debe decir "sincronizado" para lo primero.
  // ("google" quedó de un intento anterior en Android que resultó ser un
  // falso positivo — ver comentario de arriba — se trata igual que "copia".)
  const [metodo, setMetodo] = useState(null);
  const sincronizado = metodo === "webcal";
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

  const copiarUrl = async () => {
    if (!feedUrl) return;
    try {
      await Clipboard.setStringAsync(feedUrl);
      setCopiado(true);
      marcarSincronizado("copia");
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

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setAbierto(true)} style={[styles.trigger, metodo && styles.triggerHecho]}>
        <Text style={[styles.triggerTxt, metodo && styles.triggerTxtHecho]}>
          {sincronizado ? "✓ Calendario sincronizado" : soloCopiado ? "🔗 Enlace copiado — pegalo en tu calendario" : "📅 Agregar a tu calendario"}
        </Text>
      </Pressable>

      <Sheet visible={abierto} onClose={() => setAbierto(false)} title="Sincronizar calendario">
        <Text style={styles.hint}>
          Los eventos de la escuela aparecerán en tu calendario y se actualizan solos. Google puede tardar unas horas en reflejar los cambios.
        </Text>

        <View style={styles.row}>
          {Platform.OS === "ios" ? (
            <Pressable onPress={abrirWebcal} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryTxt}>📅 Agregar a Calendario</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={copiarUrl} style={Platform.OS === "ios" ? styles.btnSecondary : styles.btnPrimary}>
            <Text style={Platform.OS === "ios" ? styles.btnSecondaryTxt : styles.btnPrimaryTxt}>
              {copiado ? "¡Copiado!" : "Copiar enlace"}
            </Text>
          </Pressable>
        </View>

        {/* En Android no hay atajo de un toque confiable: ni Google Calendar
            ni Outlook ni Samsung Calendar soportan "agregar por URL" dentro
            de su app mobile — las tres requieren pegar el enlace desde la
            versión web de escritorio de ese calendario. */}
        <Text style={styles.hintSmall}>
          {Platform.OS === "ios"
            ? '¿Usás otra app de calendario (Outlook, etc.) en vez de la de Apple? Copiá el enlace y pegalo ahí, en su opción de "agregar calendario desde una URL" o "suscribirse" (en Outlook, por ejemplo: outlook.com en el navegador → Configuración → Calendario → Agregar calendario → Suscribirse desde la web).'
            : 'Pegá el enlace copiado en la versión web de tu calendario (no la app): en Google Calendar, calendar.google.com desde el navegador → ⚙️ Configuración → Agregar calendario → Desde URL. En Outlook: outlook.com → Configuración → Calendario → Agregar calendario → Suscribirse desde la web.'}
        </Text>

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
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: SPACE.md },
  btnPrimary: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnPrimaryTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  btnSecondary: { borderWidth: 1.5, borderColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnSecondaryTxt: { color: t.accent, fontSize: 13, fontWeight: "700" },
  hint: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  hintSmall: { fontSize: 11, color: t.textFaint, lineHeight: 15, marginTop: SPACE.md },
  link: { fontSize: 12, fontWeight: "700", color: t.accent, textDecorationLine: "underline", marginTop: SPACE.md },
  linkDanger: { fontSize: 12, fontWeight: "700", color: T.red, textDecorationLine: "underline" },
  linkMuted: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  confirmRow: { gap: 4, marginTop: SPACE.md },
  confirmTxt: { fontSize: 12, color: t.textMuted },
  confirmBtns: { flexDirection: "row", gap: 14 },
});
