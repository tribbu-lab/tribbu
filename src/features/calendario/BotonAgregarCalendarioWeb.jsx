// src/features/calendario/BotonAgregarCalendarioWeb.jsx
//
// Botón para la vista de Calendario web: suscribe el feed ICS de tribbu
// (eventos + cumpleaños + festejos de todos los cursos del usuario) al
// Google Calendar del apoderado, o copia el enlace para Apple/Outlook.
// El token (usuarios.calendar_token) se crea solo la primera vez que se
// monta (RPC regenerar_calendar_token, ver supabase/calendar-sync.sql —
// la policy usuarios_update solo permite super, así que no se puede
// escribir la fila usuarios directo desde el cliente).
//
// Uso dentro de features/calendario/index.jsx (donde ya tenés supabase y userId):
//   import BotonAgregarCalendario from "./BotonAgregarCalendarioWeb";
//   ...
//   <BotonAgregarCalendario supabase={supabase} userId={userId} />

import { useEffect, useState } from "react";
import { T } from "../../lib/theme";
import { getRuntimeConfig } from "../../lib/runtimeConfig";

export default function BotonAgregarCalendario({ supabase, userId }) {
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
        const { data, error } = await supabase
          .from("usuarios")
          .select("calendar_token")
          .eq("id", userId)
          .single();
        if (!activo) return;
        if (error) throw error;
        if (data?.calendar_token) {
          setToken(data.calendar_token);
        } else {
          // Primera vez: se crea solo, sin pedirle nada al usuario.
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
  }, [supabase, userId]);

  const { supabaseUrl } = getRuntimeConfig();
  const feedUrl = token && supabaseUrl ? `${supabaseUrl}/functions/v1/calendar-feed?token=${token}` : null;

  const abrirEnGoogle = () => {
    if (!feedUrl) return;
    const googleUrl = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(feedUrl);
    window.open(googleUrl, "_blank", "noopener,noreferrer");
  };

  const copiarUrl = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback si el navegador bloquea el clipboard (o prompt() no está
      // disponible en el contexto — evita una excepción sin capturar).
      try {
        window.prompt("Copiá este enlace para tu calendario:", feedUrl);
      } catch {
        // prompt() no disponible en este contexto — no hay más fallback posible.
      }
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

  return (
    <div style={{ margin: "10px 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={abrirEnGoogle}
          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: T.accent, color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >
          📅 Agregar a Google Calendar
        </button>

        <button
          onClick={copiarUrl}
          style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${T.accent}`, background: "transparent", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >
          {copiado ? "¡Copiado!" : "Copiar enlace (Apple, Outlook…)"}
        </button>
      </div>

      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>
        Los eventos de la escuela aparecerán en tu calendario y se actualizan solos. Google puede tardar unas horas en reflejar los cambios.{" "}
        {confirmarRegenerar ? (
          <span>
            ¿Seguro? Los calendarios ya suscriptos con el enlace actual van a dejar de actualizarse.{" "}
            <button
              onClick={regenerar}
              disabled={regenerando}
              style={{ border: "none", background: "none", color: T.red, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, textDecoration: "underline" }}
            >
              {regenerando ? "Regenerando…" : "Sí, regenerar"}
            </button>{" "}
            <button
              onClick={() => setConfirmarRegenerar(false)}
              style={{ border: "none", background: "none", color: T.muted, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmarRegenerar(true)}
            style={{ border: "none", background: "none", color: T.accent, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0, textDecoration: "underline" }}
          >
            ¿Problema con el enlace? Regenerar
          </button>
        )}
      </div>
    </div>
  );
}
