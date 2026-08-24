// mobile/features/calendario/BotonAgregarCalendario.jsx (puerto RN de
// src/features/calendario/BotonAgregarCalendarioWeb.jsx)
//
// Copia el enlace del feed ICS de tribbu (eventos + cumpleaños + festejos de
// todos los cursos del usuario) y, en iOS, ofrece abrirlo directo con
// webcal:// (el SO resuelve el flujo nativo de suscripción). Android no tiene
// un "suscribirse por URL" a nivel de sistema, así que ahí solo se copia el
// enlace — el usuario lo pega en Google Calendar (web/desktop) → Otros
// calendarios → Desde URL.

import { useEffect, useState } from "react";
import { View, Text, Pressable, Platform, Linking, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { T } from "@shared/theme";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { getRuntimeConfig } from "@shared/runtimeConfig";
import { supabase } from "../../lib/supabase";

const t = THEMES.light;

export default function BotonAgregarCalendario({ userId }) {
  const [token, setToken] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (!userId) {
        if (activo) setCargando(false);
        return;
      }
      try {
        const { data, error } = await supabase.from("usuarios").select("calendar_token").eq("id", userId).single();
        if (!activo) return;
        if (error) throw error;
        if (data?.calendar_token) {
          setToken(data.calendar_token);
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
    await Clipboard.setStringAsync(feedUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const abrirWebcal = () => {
    if (!feedUrl) return;
    Linking.openURL(feedUrl.replace(/^https?:\/\//, "webcal://")).catch((e) =>
      console.warn("No se pudo abrir el enlace webcal:", e?.message)
    );
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
      <View style={styles.row}>
        {Platform.OS === "ios" ? (
          <Pressable onPress={abrirWebcal} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryTxt}>📅 Agregar a Calendario</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={copiarUrl} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryTxt}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Los eventos de la escuela aparecerán en tu calendario y se actualizan solos.{" "}
        {Platform.OS === "android" ? "En Android, pegá el enlace en Google Calendar (web) → Otros calendarios → Desde URL. " : ""}
        Google puede tardar unas horas en reflejar los cambios.
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACE.lg, gap: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btnPrimary: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnPrimaryTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  btnSecondary: { borderWidth: 1.5, borderColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnSecondaryTxt: { color: t.accent, fontSize: 13, fontWeight: "700" },
  hint: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  link: { fontSize: 12, fontWeight: "700", color: t.accent, textDecorationLine: "underline" },
  linkDanger: { fontSize: 12, fontWeight: "700", color: T.red, textDecorationLine: "underline" },
  linkMuted: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  confirmRow: { gap: 4 },
  confirmTxt: { fontSize: 12, color: t.textMuted },
  confirmBtns: { flexDirection: "row", gap: 14 },
});
