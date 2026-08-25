// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { fmtDM } from "../../lib/helpers";

// ── Centro de notificaciones in-app ──────────────────────────────────────────
// Muestra recordatorios + alertas como un panel deslizable desde el header.
// Se usa en App.jsx junto con el badge de notificaciones.

export function useNotificaciones({ cursoIds, userId, active }) {
  const [notifs,   setNotifs]   = useState([]);
  const [leidos,   setLeidos]   = useState(new Set());
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    if(!cursoIds?.length || !userId) return;
    setCargando(true);
    const hoy = new Date().toISOString().split("T")[0];
    const [recs, leidosData, alertas] = await Promise.all([
      supabase.from("recordatorios").select("*")
        .in("curso_id", cursoIds)
        .or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`)
        .or(`fecha.is.null,fecha.gte.${hoy}`)
        .order("fecha", { ascending: true, nullsFirst: false })
        .limit(30),
      supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id", userId),
      supabase.from("alertas").select("*").in("curso_id", cursoIds).eq("activa", true)
        .order("creado_en", { ascending: false }).limit(3),
    ]);

    const leidosSet = new Set((leidosData.data||[]).map(r => r.recordatorio_id));
    setLeidos(leidosSet);

    // Combinar alertas + recordatorios en una sola lista
    const alertasNotifs = (alertas.data||[]).map(a => ({
      id: `alerta-${a.id}`,
      _tipo: "alerta",
      texto: a.mensaje,
      urgente: true,
      creado_en: a.creado_en,
      curso_id: a.curso_id,
      emoji: "🚨",
    }));

    const recsNotifs = (recs.data||[]).map(r => ({
      ...r,
      _tipo: "recordatorio",
    }));

    setNotifs([...alertasNotifs, ...recsNotifs]);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [cursoIds, userId]);
  useEffect(() => { if(active) cargar(); }, [active]);

  const marcarLeido = async (id) => {
    if(typeof id === "string" && id.startsWith("alerta-")) return; // alertas no se marcan
    if(leidos.has(id)) return;
    setLeidos(p => new Set([...p, id]));
    await supabase.from("recordatorio_leidos").upsert(
      { recordatorio_id: id, usuario_id: userId },
      { onConflict: "recordatorio_id,usuario_id" }
    );
  };

  const noLeidos = notifs.filter(n => n._tipo === "alerta" || !leidos.has(n.id)).length;

  return { notifs, leidos, cargando, noLeidos, marcarLeido, recargar: cargar };
}

export function NotificacionesPanel({ notifs, leidos, cargando, tagDeCurso, onMarcarLeido, onCerrar }) {
  const PRIO = {
    alta:   { c: "#EF4444", bg: "#FEF2F2" },
    media:  { c: "#F59E0B", bg: "#FFFBEB" },
    baja:   { c: "#10B981", bg: "#F0FDF4" },
  };

  const fmtRelativo = (fecha) => {
    if(!fecha) return null;
    const d = new Date(fecha+"T00:00:00");
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const dias = Math.round((d - hoy) / 86400000);
    if(dias === 0) return "hoy";
    if(dias === 1) return "mañana";
    if(dias === -1) return "ayer";
    if(dias < 0) return `hace ${Math.abs(dias)}d`;
    return `en ${dias}d`;
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      display: "flex", justifyContent: "flex-end",
    }} onClick={onCerrar}>
      {/* Overlay semitransparente */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.3)",
      }}/>

      {/* Panel lateral */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "relative", zIndex: 1,
          width: "min(360px, 100vw)",
          height: "100%",
          background: "white",
          display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          animation: "slideInRight 0.2s ease",
        }}
      >
        <style>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>

        {/* Header del panel */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid #F1F5F9",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#0F172A",
        }}>
          <div style={{fontSize:15,fontWeight:800,color:"white"}}>Notificaciones</div>
          <button onClick={onCerrar} style={{
            background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,
            width:30,height:30,cursor:"pointer",fontSize:16,color:"white",
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>✕</button>
        </div>

        {/* Lista */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
          {cargando && (
            <div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>Cargando...</div>
          )}

          {!cargando && notifs.length === 0 && (
            <div style={{textAlign:"center",padding:40}}>
              <div style={{fontSize:32,marginBottom:12}}>🔔</div>
              <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:4}}>Sin notificaciones</div>
              <div style={{fontSize:13,color:"#94A3B8"}}>Acá vas a ver recordatorios y alertas del curso.</div>
            </div>
          )}

          {!cargando && notifs.map(n => {
            const esAlerta = n._tipo === "alerta";
            const leido = !esAlerta && leidos.has(n.id);
            const prio = PRIO[n.prioridad||"media"];
            const relativo = n.fecha ? fmtRelativo(n.fecha) : null;
            const tag = tagDeCurso ? tagDeCurso(n.curso_id) : null;

            return (
              <div
                key={n.id}
                onClick={() => onMarcarLeido(n.id)}
                style={{
                  padding: "12px 14px",
                  marginBottom: 8,
                  borderRadius: 12,
                  background: esAlerta ? "linear-gradient(135deg,#FEF2F2,#FFF5F5)"
                              : leido ? "#FAFAFA" : "white",
                  border: `1px solid ${esAlerta ? "#FCA5A5" : leido ? "#F1F5F9" : "#E2E8F0"}`,
                  borderLeft: `3px solid ${esAlerta ? "#EF4444" : n.urgente ? "#EF4444" : prio.c}`,
                  cursor: leido ? "default" : "pointer",
                  opacity: leido ? 0.6 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:18,flexShrink:0,marginTop:1}}>
                    {n.emoji || (esAlerta ? "🚨" : n.tipo==="regalo_cumple" ? "🎁" : n.tipo==="colecta_vence" ? "💳" : "📌")}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{
                      fontSize:13,fontWeight:leido?400:600,
                      color:leido?"#94A3B8":"#0F172A",
                      lineHeight:1.45,marginBottom:4,
                    }}>
                      {n.texto}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      {relativo && (
                        <span style={{
                          fontSize:10,fontWeight:700,
                          padding:"2px 6px",borderRadius:6,
                          background:prio.bg,color:prio.c,
                        }}>{relativo}</span>
                      )}
                      {n.urgente&&!esAlerta&&(
                        <span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"2px 6px",borderRadius:6}}>Urgente</span>
                      )}
                      {!esAlerta&&n.grupo_id&&(
                        <span style={{fontSize:10,fontWeight:700,color:"#6366F1",background:"#EEF2FF",padding:"2px 6px",borderRadius:6,whiteSpace:"nowrap"}}>🏫 Comunicación del colegio</span>
                      )}
                      {tag && (
                        <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                          <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,display:"inline-block",flexShrink:0}}/>
                          <span style={{fontSize:10,fontWeight:700,color:"#94A3B8"}}>{tag.nombre}</span>
                        </span>
                      )}
                      {!leido && !esAlerta && (
                        <span style={{
                          width:6,height:6,borderRadius:"50%",
                          background:"#3B82F6",display:"inline-block",flexShrink:0,
                        }}/>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{padding:"12px 16px",borderTop:"1px solid #F1F5F9",fontSize:11,color:"#94A3B8",textAlign:"center"}}>
          Tocá una notificación para marcarla como leída
        </div>
      </div>
    </div>
  );
}
