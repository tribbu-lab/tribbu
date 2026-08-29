// mobile/features/calendario/BotonAgregarCalendario.jsx (puerto RN de
// src/features/calendario/BotonAgregarCalendarioWeb.jsx)
//
// Sincroniza el feed ICS de tribbu (eventos + cumpleaños + citas de todos
// los cursos del usuario) con el calendario personal. En ambas plataformas
// el usuario elige primero el **destino** — la misma UI de dos opciones —
// y por debajo cada opción usa el mecanismo que funciona en esa plataforma
// (ver specs/eleccion-de-calendario-mobile.md):
//
// ┌──────────────────────────┬──────────────────────┬─────────────────────────┐
// │ destino                  │ iOS                  │ Android                 │
// ├──────────────────────────┼──────────────────────┼─────────────────────────┤
// │ Calendario del           │ webcal:// → Apple    │ expo-calendar: crea un  │
// │ dispositivo              │ Calendar se suscribe │ calendario "Tribbu"     │
// │                          │ (server push)        │ LOCAL y lo re-sincroniza│
// │                          │                      │ al abrir la app         │
// ├──────────────────────────┼──────────────────────┼─────────────────────────┤
// │ Google Calendar          │ suscripción guiada, idéntica en ambas: enlace  │
// │                          │ (copiar / mail) + 4 pasos en una computadora + │
// │                          │ "Ya lo agregué"                                │
// └──────────────────────────┴────────────────────────────────────────────────┘
//
// Por qué cada celda es así:
// - iOS/dispositivo: webcal:// es superior a escribir eventos nosotros — el
//   servidor empuja actualizaciones sin abrir la app y no pide permiso de
//   calendario. Confirmado que la suscripción persiste.
// - Google (ambas plataformas): la misma suscripción guiada, para que la
//   experiencia sea idéntica en iOS y Android (pedido explícito 2026-08-28).
//   En iOS existía un atajo in-app (render?cid= en un SFSafariViewController,
//   donde los universal links no se disparan y la app de Google Calendar no
//   intercepta) que se descartó por consistencia: exigía login de Google en
//   un browser con cookies aisladas y no daba más garantías que el instructivo.
//   Quien ya lo usó conserva metodo="gcal" y sigue contando como sincronizado.
// - Android/dispositivo: un calendario creado por una app normal es de cuenta
//   LOCAL. Se ve en Samsung Calendar/AOSP con color y toggle propios, pero
//   **la app de Google Calendar no lista ni dibuja calendarios LOCAL de
//   terceros** (verificado en emulador con una cuenta real: visible=1, 108
//   eventos, y no aparecía) y no llega a calendar.google.com. Por eso es una
//   opción y no LA opción — el copy lo dice.
// - Android/Google: no hay forma de suscribirse desde el teléfono.
//   calendar.google.com es App Link de la app de Google Calendar, que se
//   queda la URL y muestra un "agregado con éxito" falso (probado con
//   Linking.openURL y con Custom Tab); un WebView interno tampoco sirve
//   porque Google bloquea el login embebido (disallowed_useragent); y ni
//   Google Calendar ni Outlook/Samsung tienen "agregar por URL" en mobile.
//   La suscripción hecha desde una computadora sí produce exactamente lo que
//   el usuario espera: un calendario "Tribbu" real dentro de su cuenta
//   (ownerAccount …@import.calendar.google.com) con nombre, color y toggle
//   propios, sincronizado a todos sus dispositivos (verificado).
//
// UI colapsada en un Sheet para no empujar el resto de Calendario hacia
// abajo: el trigger es una sola línea, y una vez que el usuario ya usó
// alguna acción queda marcado (AsyncStorage) para no insistir en cada visita.
//
// El token vive en su propia tabla (usuario_calendar_tokens, no en
// usuarios) para que usuarios_select no lo exponga a compañeros de curso —
// ver supabase/calendar-token-hardening.sql.

import { useEffect, useState } from "react";
import { View, Text, Pressable, Platform, Linking, AppState, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { T } from "@shared/theme";
import { THEMES, SPACE, RADIUS } from "@shared/tokens";
import { getRuntimeConfig } from "@shared/runtimeConfig";
import { supabase } from "../../lib/supabase";
import { Sheet } from "../../components/Sheet";
import { prepararConexion, sincronizar, sincronizarSiConectado, desconectar } from "../../lib/calendarSync";

const t = THEMES.light;
const claveSincronizado = (userId) => `calsync_${userId}`;
const esAndroid = Platform.OS === "android";

// Pasos de la suscripción en Google Calendar (ambas plataformas). Se muestran siempre
// dentro de esa opción: el usuario los tiene que hacer en otra pantalla, así
// que no sirve esconderlos detrás de otro tap.
const PASOS = [
  "Abrí calendar.google.com en una computadora.",
  'A la izquierda, al lado de "Otros calendarios", tocá el +.',
  'Elegí "Desde URL".',
  "Pegá el enlace y confirmá.",
];

// Las dos opciones del selector. La descripción es por plataforma porque el
// mecanismo (y sus límites) cambia — ver tabla del header.
const OPCIONES = [
  {
    id: "dispositivo",
    icono: "📱",
    titulo: "Calendario del dispositivo",
    desc: esAndroid
      ? "Se crea un calendario “Tribbu” en este teléfono, en un toque. No llega a Google Calendar."
      : "Apple Calendar se suscribe al calendario “Tribbu” y se actualiza solo.",
  },
  {
    id: "google",
    icono: "🗓️",
    titulo: "Google Calendar",
    desc: "Un calendario “Tribbu” en tu cuenta de Google, en todos tus dispositivos. Se agrega una vez desde una computadora.",
  },
];

export default function BotonAgregarCalendario({ userId }) {
  const [token, setToken] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmarRegenerar, setConfirmarRegenerar] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // "dispositivo" | "google" | null — la elección del selector. No se
  // persiste: lo que persiste es lo que el usuario efectivamente hizo
  // (`metodo`), y el selector es barato de volver a mostrar.
  const [destino, setDestino] = useState(null);
  // Android/dispositivo (calendario "Tribbu" local):
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [errorConexion, setErrorConexion] = useState(null);
  // Guarda el método usado, no solo un booleano, porque el trigger distingue
  // "sincronizado de verdad" de "solo copió el enlace" (todavía falta pegarlo):
  //   "webcal"      iOS/dispositivo         "device"       Android/dispositivo
  //   "suscripcion" Google ("Ya lo agregué"), ambas plataformas
  //   "copia"       copió / mandó por mail el enlace, en cualquier plataforma
  // Legacy: "gcal" (el atajo in-app de iOS/Google que se descartó — cuenta como
  // sincronizado, la suscripción que hizo sigue viva), "google" (un intento
  // anterior en Android que resultó ser un falso positivo → "copia") y "1"
  // (previo a guardar el método → "copia"). No reutilizar esos valores.
  const [metodo, setMetodo] = useState(null);
  const conectadoDispositivo = esAndroid && metodo === "device";
  const sincronizado = ["webcal", "gcal", "device", "suscripcion"].includes(metodo);
  const soloCopiado = ["copia", "google", "1"].includes(metodo);

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
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:\/\//, "webcal://") : null;

  // Android/dispositivo conectado: re-sync silencioso al montar Calendario y
  // al volver a foreground (con throttle adentro de sincronizarSiConectado).
  useEffect(() => {
    if (!conectadoDispositivo || !feedUrl || !userId) return;
    sincronizarSiConectado({ userId, feedUrl });
    const sub = AppState.addEventListener("change", (estado) => {
      if (estado === "active") sincronizarSiConectado({ userId, feedUrl });
    });
    return () => sub.remove();
  }, [conectadoDispositivo, feedUrl, userId]);

  const copiarUrl = async () => {
    if (!feedUrl) return;
    try {
      await Clipboard.setStringAsync(feedUrl);
      setCopiado(true);
      // Si ya está sincronizado, copiar es solo un extra: no degradar el estado.
      if (!sincronizado) marcarSincronizado("copia");
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      console.warn("No se pudo copiar el enlace de calendario:", e?.message);
    }
  };

  // Mandarse el enlace por mail es la forma práctica de pasarlo del teléfono
  // a la computadora, que es donde hay que pegarlo. mailto: abre el cliente
  // que el usuario ya tenga configurado — sin backend de por medio.
  const enviarPorMail = () => {
    if (!feedUrl) return;
    const asunto = "Mi calendario de tribbu";
    const cuerpo =
      "Para ver los eventos del colegio en Google Calendar, abrí calendar.google.com " +
      'en una computadora, tocá el + al lado de "Otros calendarios", elegí "Desde URL" ' +
      "y pegá este enlace:\n\n" +
      feedUrl +
      "\n\nNo compartas este enlace: es personal y da acceso a tu calendario.";
    Linking.openURL(`mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`).catch((e) =>
      console.warn("No se pudo abrir el cliente de mail:", e?.message)
    );
    if (!sincronizado) marcarSincronizado("copia");
  };

  // iOS/dispositivo
  const abrirWebcal = () => {
    if (!webcalUrl) return;
    Linking.openURL(webcalUrl).catch((e) => console.warn("No se pudo abrir el enlace webcal:", e?.message));
    marcarSincronizado("webcal");
  };

  // Android/dispositivo
  const conectarDispositivo = async () => {
    if (!feedUrl) return;
    setErrorConexion(null);
    setConectando(true);
    try {
      const prep = await prepararConexion();
      if (!prep.ok) {
        setErrorConexion("Sin permiso de calendario no se puede conectar. Podés darlo en Ajustes, o elegir Google Calendar.");
        return;
      }
      await sincronizar({ userId, feedUrl });
      // Recién acá: el primer sync terminó sin error (no al pedir permiso).
      marcarSincronizado("device");
    } catch (e) {
      console.warn("No se pudo conectar el calendario:", e?.message);
      setErrorConexion("No se pudo conectar el calendario. Probá de nuevo, o elegí Google Calendar.");
    } finally {
      setConectando(false);
    }
  };

  const desconectarDispositivo = async () => {
    setDesconectando(true);
    try {
      await desconectar({ userId });
      setMetodo(null);
      setDestino(null);
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
    ? conectadoDispositivo ? "✓ Calendario conectado" : "✓ Calendario sincronizado"
    : soloCopiado ? "🔗 Enlace copiado — pegalo en tu calendario" : "📅 Agregar a tu calendario";

  const botonCopiar = (estilo = styles.btnSecondary, estiloTxt = styles.btnSecondaryTxt) => (
    <Pressable onPress={copiarUrl} style={estilo}>
      <Text style={estiloTxt}>{copiado ? "¡Copiado!" : "Copiar enlace"}</Text>
    </Pressable>
  );

  // Panel de la opción elegida — una celda de la tabla del header.
  const renderPanel = () => {
    if (destino === "dispositivo") {
      return esAndroid ? (
        <>
          <View style={styles.row}>
            <Pressable onPress={conectarDispositivo} disabled={conectando} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryTxt}>{conectando ? "Conectando…" : "Conectar con mi calendario"}</Text>
            </Pressable>
          </View>
          {errorConexion ? <Text style={styles.error}>{errorConexion}</Text> : null}
          <Text style={styles.hintSmall}>
            Te va a pedir permiso de calendario. Los eventos se actualizan cada vez que abrís tribbu. Si usás la app de
            Google Calendar, elegí la otra opción: ahí este calendario no se muestra.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Pressable onPress={abrirWebcal} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryTxt}> Abrir Apple Calendar</Text>
            </Pressable>
          </View>
          <Text style={styles.hintSmall}>
            Apple Calendar te va a preguntar si querés suscribirte. Después se actualiza solo.
          </Text>
        </>
      );
    }
    if (destino === "google") {
      return (
        <>
          <View style={styles.aviso}>
            <Text style={styles.avisoTxt}>
              Google no permite suscribirse desde el celular: hay que hacerlo una sola vez desde una computadora.
            </Text>
          </View>
          <View style={styles.row}>
            {botonCopiar(styles.btnPrimary, styles.btnPrimaryTxt)}
            <Pressable onPress={enviarPorMail} style={styles.btnSecondary}>
              <Text style={styles.btnSecondaryTxt}>Enviármelo por mail</Text>
            </Pressable>
          </View>
          <Text style={styles.label}>Cómo agregarlo (una sola vez)</Text>
          <View style={styles.pasos}>
            {PASOS.map((paso, i) => (
              <View key={paso} style={styles.paso}>
                <Text style={styles.pasoNum}>{i + 1}</Text>
                <Text style={styles.pasoTxt}>{paso}</Text>
              </View>
            ))}
          </View>
          {sincronizado ? null : (
            <Pressable onPress={() => marcarSincronizado("suscripcion")} style={styles.btnGhost}>
              <Text style={styles.btnGhostTxt}>Ya lo agregué</Text>
            </Pressable>
          )}
          <Text style={styles.hintSmall}>Google puede tardar unas horas en mostrar los eventos por primera vez.</Text>
        </>
      );
    }
    return null;
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setAbierto(true)} style={[styles.trigger, metodo && styles.triggerHecho]}>
        <Text style={[styles.triggerTxt, metodo && styles.triggerTxtHecho]}>{labelTrigger}</Text>
      </Pressable>

      <Sheet visible={abierto} onClose={() => setAbierto(false)} title="Sincronizar calendario">
        <Text style={styles.hint}>
          Los eventos del colegio — clases, cumpleaños y citas — se agregan a tu calendario y se mantienen al día.
        </Text>

        {conectadoDispositivo ? (
          <>
            <View style={styles.aviso}>
              <Text style={styles.avisoTxt}>
                El calendario “Tribbu” está conectado en este teléfono y se actualiza cada vez que abrís tribbu.
              </Text>
            </View>
            <View style={styles.row}>{botonCopiar()}</View>
            <Pressable onPress={desconectarDispositivo} disabled={desconectando}>
              <Text style={[styles.linkDanger, styles.mtMd]}>
                {desconectando ? "Desconectando…" : "Desconectar (borra el calendario Tribbu de este teléfono)"}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>¿Dónde querés verlos?</Text>
            <View style={styles.opciones}>
              {OPCIONES.map((op) => {
                const activa = destino === op.id;
                return (
                  <Pressable
                    key={op.id}
                    onPress={() => setDestino(op.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: activa }}
                    style={[styles.opcion, activa && styles.opcionActiva]}
                  >
                    <View style={[styles.radio, activa && styles.radioActivo]}>
                      {activa ? <View style={styles.radioPunto} /> : null}
                    </View>
                    <View style={styles.opcionTxt}>
                      <Text style={styles.opcionTitulo}>
                        {op.icono} {op.titulo}
                      </Text>
                      <Text style={styles.opcionDesc}>{op.desc}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {renderPanel()}

            <Text style={styles.hintSmall}>
              ¿Usás otra app (Outlook, etc.)?{" "}
              <Text onPress={copiarUrl} style={styles.linkInline}>
                {copiado ? "¡Copiado!" : "Copiá el enlace"}
              </Text>{" "}
              y pegalo en su opción de "agregar calendario desde una URL" o "suscribirse".
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
  // Selector de destino: filas tipo radio, ≥44px de alto para el pulgar.
  opciones: { gap: 8, marginTop: SPACE.sm },
  opcion: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md,
    paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, backgroundColor: t.surface,
  },
  opcionActiva: { borderColor: t.accent, backgroundColor: t.accentSoft || "#EFF6FF" },
  radio: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: t.border,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  radioActivo: { borderColor: t.accent },
  radioPunto: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: t.accent },
  opcionTxt: { flex: 1, gap: 2 },
  opcionTitulo: { fontSize: 13, fontWeight: "700", color: t.text },
  opcionDesc: { fontSize: 11, color: t.textMuted, lineHeight: 15 },
  btnPrimary: { backgroundColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnPrimaryTxt: { color: t.onAccent, fontSize: 13, fontWeight: "700" },
  btnSecondary: { borderWidth: 1.5, borderColor: t.accent, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center" },
  btnSecondaryTxt: { color: t.accent, fontSize: 13, fontWeight: "700" },
  btnGhost: { alignSelf: "flex-start", borderWidth: 1, borderColor: t.border, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: "center", marginTop: SPACE.md },
  btnGhostTxt: { color: t.textMuted, fontSize: 13, fontWeight: "700" },
  aviso: { backgroundColor: t.surfaceAlt || "#F1F5F9", borderRadius: RADIUS.md, padding: SPACE.sm, marginTop: SPACE.md },
  avisoTxt: { fontSize: 12, color: t.text, lineHeight: 17 },
  pasos: { gap: 8, marginTop: SPACE.sm },
  paso: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  pasoNum: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: t.accent,
    color: t.onAccent, fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 20,
  },
  pasoTxt: { flex: 1, fontSize: 12, color: t.textMuted, lineHeight: 18 },
  hint: { fontSize: 12, color: t.textMuted, lineHeight: 17 },
  hintSmall: { fontSize: 11, color: t.textFaint, lineHeight: 15, marginTop: SPACE.md },
  error: { fontSize: 12, color: T.red, lineHeight: 17, marginTop: SPACE.sm },
  link: { fontSize: 12, fontWeight: "700", color: t.accent, textDecorationLine: "underline", marginTop: SPACE.md },
  linkInline: { fontWeight: "700", color: t.accent, textDecorationLine: "underline" },
  linkDanger: { fontSize: 12, fontWeight: "700", color: T.red, textDecorationLine: "underline" },
  linkMuted: { fontSize: 12, fontWeight: "700", color: t.textMuted },
  mtMd: { marginTop: SPACE.md },
  confirmRow: { gap: 4, marginTop: SPACE.md },
  confirmTxt: { fontSize: 12, color: t.textMuted },
  confirmBtns: { flexDirection: "row", gap: 14 },
});
