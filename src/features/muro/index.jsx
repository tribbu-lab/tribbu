// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre,
         sanitize, safeUrl, getHijoColor, setHijoColor } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useListControls } from "../../hooks/useListControls";


const TIPO_CONFIG = {
  cumple:      { emoji:"🎂", color:"#EC4899", bg:"#FDF2F8", label:"Cumpleaños" },
  festejo:     { emoji:"🎉", color:"#F59E0B", bg:"#FFFBEB", label:"Festejo" },
  paseo:       { emoji:"🚌", color:"#3B82F6", bg:"#EFF6FF", label:"Paseo" },
  acto:        { emoji:"🎭", color:"#8B5CF6", bg:"#F5F3FF", label:"Acto escolar" },
  dia_especial:{ emoji:"⭐", color:"#10B981", bg:"#F0FDF4", label:"Día especial" },
  comunicado:  { emoji:"📢", color:"#F97316", bg:"#FFF7ED", label:"Comunicado" },
  feriado:     { emoji:"🚩", color:"#EF4444", bg:"#FEF2F2", label:"Feriado" },
  vacaciones:  { emoji:"🏖️", color:"#06B6D4", bg:"#ECFEFF", label:"Vacaciones" },
};


import { sendPush, getUserIdsByCurso } from "../../lib/push";

export function Muro({ cursoId, cursoNombre, isAdmin, userName, userId, misHijos=[], items=[], cursoIdx=0, setCursoIdx, hijoColorsMap={}, cambiarColorHijo, colorPickerIdx, setColorPickerIdx, onNavigate }) {
  misHijos = (misHijos||[]).filter(h=>h && typeof h === "string");
  const [datos,setDatos] = useState(null);
  const [modal,setModal] = useState(false);
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [eventoDetalle,  setEventoDetalle]  = useState(null);
  const [leidosMuro,setLeidosMuro] = useState(new Set());
  const [hijosNombres,setHijosNombres] = useState([]);
  const isMobile = useIsMobile();
  const hoy = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});

  useEffect(()=>{ cargar(); },[cursoId]);

  const cargar = async () => {
    const fechaHoy = new Date().toISOString().split("T")[0];
    const fecha15  = new Date(Date.now() + 15*24*60*60*1000).toISOString().split("T")[0];
    const [alerta,menu,recordatorios,cumples,cuotas,hijosData,maestrosData,eventosData,invitacionesData,leidosData] = await Promise.all([
      supabase.from("alertas").select("*").eq("curso_id",cursoId).eq("activa",true).order("creado_en",{ascending:false}).limit(1),
      supabase.from("menu").select("*").eq("fecha",fechaHoy).maybeSingle(),
      supabase.from("recordatorios").select("*").eq("curso_id",cursoId),
      supabase.from("cumples").select("*").eq("curso_id",cursoId).order("id"),
      supabase.from("colectas").select("*").eq("curso_id",cursoId),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id",cursoId),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id",cursoId),
      supabase.from("eventos").select("*").eq("curso_id",cursoId).gte("fecha",fechaHoy).lte("fecha",fecha15).order("fecha"),
      (userId && misHijos.length) ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,hora_fin,lugar,tipo,alumno_id,imagen_url,url_ubicacion,descripcion,curso_id)").in("alumno_invitado_id", misHijos).eq("asiste","pendiente") : Promise.resolve({data:[]}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",userId) : Promise.resolve({data:[]}),
    ]);
    const fecha15b = new Date(Date.now() + 15*24*60*60*1000).toISOString().split("T")[0];
    const nextBday = (fecha) => {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const d = new Date(fecha+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
      return Math.round((next - hoy) / (1000*60*60*24));
    };
    // Build unified birthday list sorted by next occurrence — solo próximos 15 días
    const bdayList = [
      ...(hijosData.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`a-${a.id}`, nombre:fmtNombre(a), tipo:"Alumno",
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6",
      })),
      ...(maestrosData.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, nombre:m.nombre, tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6",
      })),
    ].filter(a=>nextBday(a.fecha_nacimiento)<=15)
     .sort((a,b)=>nextBday(a.fecha_nacimiento)-nextBday(b.fecha_nacimiento));
    const leidosIds = new Set((leidosData.data||[]).map(l=>l.recordatorio_id));
    setLeidosMuro(new Set([...leidosIds]));
    const hoyStr = new Date().toISOString().split("T")[0];
    // Recordatorios manuales no leídos, dentro de 15 días
    const recsNoLeidos = (recordatorios.data||[]).filter(r=> {
      if(r.tipo==="regalo_cumple" || r.tipo==="colecta_vence") return false;
      if(leidosIds.has(r.id)) return false;
      // Mostrar si es para todo el curso (para_usuario_id null) o para este usuario
      if(r.para_usuario_id && r.para_usuario_id !== userId) return false;
      if(r.fecha && r.fecha < hoyStr) return false;
      if(r.fecha && r.fecha > fecha15b) return false;
      return true;
    }).sort((a,b)=>{ if(a.fecha&&b.fecha) return a.fecha.localeCompare(b.fecha); if(a.fecha&&!b.fecha) return -1; if(!a.fecha&&b.fecha) return 1; return 0; });
    // colectas pendientes para mis hijos — solo hijos del curso actual, vencen en 15 días
    const misHijosIds = (typeof misHijos !== "undefined" ? misHijos : []).filter(h=>h && typeof h === "string");
    const hijosDelCurso = (hijosData.data||[]).map(h=>h.id);
    const misHijosEnCurso = misHijosIds.filter(hid=>hijosDelCurso.includes(hid));
    let colectasPend = [];
    if(misHijosEnCurso.length && (cuotas.data||[]).length) {
      const colIds = (cuotas.data||[]).filter(c=>c.activa&&(!c.vencimiento||c.vencimiento<=fecha15b)).map(c=>c.id);
      const { data: pagosData } = colIds.length
        ? await supabase.from("colecta_pagos").select("*").in("colecta_id",colIds).in("alumno_id",misHijosEnCurso)
        : {data:[]};
      const pagados = new Set((pagosData||[]).filter(p=>p.estado==="pagado").map(p=>`${p.colecta_id}-${p.alumno_id}`));
      colectasPend = (cuotas.data||[]).filter(c=>c.activa&&(!c.vencimiento||c.vencimiento<=fecha15b)&&misHijosEnCurso.some(hid=>!pagados.has(`${c.id}-${hid}`)));
    }
    setDatos({ alerta:alerta.data?.[0]||null, menu:menu.data||null, recordatorios:recsNoLeidos, cumples:cumples.data||[], cuotas:cuotas.data||[], bdayList, colectasPend, eventos:(eventosData.data||[]).filter(e=>e.tipo!=="cumple"&&e.tipo!=="festejo"), invitaciones:(invitacionesData.data||[]).filter(i=>i.evento && i.evento.curso_id===cursoId), hijosData:hijosData.data||[] });
  };

  const marcarLeidoMuro = async (recId) => {
    if(!userId) return;
    const nid = recId;
    if(leidosMuro.has(nid)) {
      const {error} = await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id",nid).eq("usuario_id",userId);
      if(error) { console.error("desmarcarLeido error:", error); return; }
      setLeidosMuro(p=>{ const n=new Set(p); n.delete(nid); return n; });
    } else {
      const {error} = await supabase.from("recordatorio_leidos").upsert({recordatorio_id:nid, usuario_id:userId},{onConflict:"recordatorio_id,usuario_id"});
      if(error) { console.error("marcarLeido error:", error); return; }
      setLeidosMuro(p=> new Set([...p, nid]));
    }
  };

  const marcarPagadoMuro = async (colecta, e) => {
    e.stopPropagation();
    if(!userId || !misHijos.length) return;
    const fecha_pago = new Date().toISOString().slice(0,10);
    await Promise.all(misHijos.map(hid=>
      supabase.from("colecta_pagos").upsert(
        { colecta_id:colecta.id, alumno_id:hid, estado:"pagado", fecha_pago, pagado_por:userId },
        { onConflict:"colecta_id,alumno_id" }
      )
    ));
    setDatos(d=> d ? {...d, colectasPend: (d.colectasPend||[]).filter(c=>c.id!==colecta.id)} : d);
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoId);
    await supabase.from("alertas").insert({curso_id:cursoId,mensaje:msg,hora:"Ahora",activa:true});
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    cargar();
  };

  const dismissAlerta = async () => {
    if(datos.alerta){ await supabase.from("alertas").update({activa:false}).eq("id",datos.alerta.id); cargar(); }
  };

  if(!datos) return <Spinner/>;

  // ── Layout A: original ───────────────────────────────────────────────────
  return (
    <div>
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijos||[]} onClose={()=>{ setFestejoDetalle(null); cargar(); }} onUpdate={cargar}/>}
      {eventoDetalle&&<EventoAsistenciaModal evento={eventoDetalle} onClose={()=>setEventoDetalle(null)} misHijos={misHijos} userId={userId}/>}
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:18,gap:16}}>
        <div>
          <div style={{fontSize:22,fontWeight:900}}>Hola{userName?`, ${userName}`:""} 👋</div>
          <div style={{fontSize:13,color:"#94A3B8",textTransform:"capitalize"}}>{hoy}</div>
        </div>
        {!isMobile&&items.length>0&&(
          <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",marginTop:2,alignItems:"center"}}>
            {items.map((item,i)=>{
              const active = i===cursoIdx;
              const sc = hijoColorsMap[`${userId}_${item.id}`]||getHijoColor(userId,item.id)||null;
              const iColor = (sc&&sc!==HIJO_COLOR_DEFAULT)?sc:(item.color||"#3B82F6");
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                  <button onClick={()=>setCursoIdx?.(i)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 14px",borderRadius:20,border:`2px solid ${active?"rgba(255,255,255,0.25)":"#E2E8F0"}`,background:active?"#0F172A":"#F1F5F9",cursor:"pointer",fontSize:12,fontWeight:active?700:500,color:active?"white":"#64748B"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:iColor,flexShrink:0}}/>
                    {item.nombre}
                  </button>
                  {active&&<button onClick={()=>setColorPickerIdx?.(colorPickerIdx===i?null:i)} style={{background:"#F1F5F9",border:"none",borderRadius:6,width:26,height:26,cursor:"pointer",fontSize:12}}>🎨</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {datos.alerta&&(
        <div style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
          <div style={{display:"flex",gap:10}}>
            <span style={{fontSize:22,flexShrink:0}}>🚨</span>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",marginBottom:3}}>{cursoNombre} · {datos.alerta.hora}</div>
              <div style={{fontSize:13,fontWeight:700,color:"white",lineHeight:1.5}}>{datos.alerta.mensaje}</div>
            </div>
            {isAdmin&&<button onClick={dismissAlerta} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",color:"white",fontSize:14,flexShrink:0}}>✕</button>}
          </div>
        </div>
      )}

      {datos.invitaciones?.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>🎉 Invitaciones pendientes</div>
          {datos.invitaciones.map(inv=>{
            const e = inv.evento;
            const d = new Date(e.fecha+"T00:00:00");
            return (
              <div key={inv.id} style={{background:"#FFFBEB",borderRadius:12,padding:"13px 15px",marginBottom:8,border:"1px solid #FCD34D",borderLeft:"3px solid #F59E0B"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎉</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"long"})}{e.hora?` · ${e.hora}${e.hora_fin?` – ${e.hora_fin}`:""}`:""}{e.lugar?` · 📍${e.lugar}`:""}</div>
                  </div>
                  <button onClick={()=>setFestejoDetalle(e)} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>Responder</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {datos.menu&&(
        <div style={{background:"#FFFBEB",border:"1px solid #FCD34D",borderRadius:12,padding:"10px 14px",marginBottom:12,display:"flex",gap:10,alignItems:"flex-start"}}>
          <span style={{fontSize:20,flexShrink:0}}>🍽️</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:9,fontWeight:700,color:"#D97706",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:3}}>Menú de hoy</div>
            <div style={{fontSize:12,color:"#0F172A",lineHeight:1.6}}>
              {[datos.menu.entrada,datos.menu.plato,datos.menu.plato2,datos.menu.acompanamiento,datos.menu.postre,datos.menu.postre2].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
      )}
      {datos.recordatorios.filter(r=>!r.tipo||r.tipo==="recordatorio"||r.tipo==="general").length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Recordatorios</div>
          {datos.recordatorios.filter(r=>!r.tipo||r.tipo==="recordatorio"||r.tipo==="general").map(r=>{
            const prioColor = r.tipo==="regalo_cumple" ? "#8B5CF6" : {alta:"#EF4444",media:"#F59E0B",baja:"#10B981"}[r.prioridad||"media"];
            return (
              <div key={r.id} style={{background:"white",borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:12,border:"1px solid #E2E8F0",borderLeft:`3px solid ${r.urgente?"#EF4444":prioColor}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:r.urgente?700:500}}>{r.texto}</div>
                  <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
                    {r.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444"}}>Urgente</span>}
                    {r.fecha&&<span style={{fontSize:11,color:"#94A3B8"}}>{new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>}
                  </div>
                </div>
                {r.tipo==="regalo_cumple"&&!leidosMuro.has(r.id) ? (
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>marcarLeidoMuro(r.id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #BBF7D0",background:"#F0FDF4",cursor:"pointer",fontSize:11,fontWeight:700,color:"#10B981",whiteSpace:"nowrap"}}>✅ Sí</button>
                    <button onClick={()=>{}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:600,color:"#94A3B8",whiteSpace:"nowrap"}}>🕐 No</button>
                  </div>
                ) : (
                  <button onClick={()=>marcarLeidoMuro(r.id)} style={{padding:"5px 12px",borderRadius:8,border:`1px solid ${leidosMuro.has(r.id)?"#10B981":"#E2E8F0"}`,background:leidosMuro.has(r.id)?"#F0FDF4":"#F8FAFC",cursor:"pointer",fontSize:12,fontWeight:600,color:leidosMuro.has(r.id)?"#10B981":"#64748B",flexShrink:0}}>{leidosMuro.has(r.id)?"✓ Leído":"Leído"}</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(datos.colectasPend||[]).length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Pendiente de pago</div>
          {datos.colectasPend.map(c=>(
            <div key={c.id} style={{background:"white",borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,border:"1px solid #E2E8F0",borderLeft:"3px solid #F59E0B",cursor:"pointer"}} onClick={()=>onNavigate?.("finanzas",{openColecta:c.id})}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{c.titulo}</div>
                <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
                  {c.monto_sugerido&&<span style={{fontSize:11,color:"#94A3B8"}}>{(c.moneda||"$")} {Number(c.monto_sugerido).toLocaleString("es-AR")}</span>}
                  {c.fecha_limite&&<span style={{fontSize:11,color:"#94A3B8"}}>Límite: {new Date(c.fecha_limite+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>}
                </div>
              </div>
              <span style={{fontSize:11,fontWeight:700,padding:"4px 8px",borderRadius:8,background:"#FFFBEB",color:"#F59E0B"}}>Pendiente</span>
            </div>
          ))}
        </div>
      )}
      {datos.eventos?.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Eventos del mes</div>
          {datos.eventos.map(e=>{
            const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
            const d   = new Date(e.fecha+"T00:00:00");
            const hoyD = new Date(); hoyD.setHours(0,0,0,0);
            const dias = Math.round((d-hoyD)/86400000);
            return (
              <div key={e.id} onClick={()=>onNavigate?.("clases",{openFecha:e.fecha})} style={{background:"white",borderRadius:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",padding:"12px 14px",marginBottom:8,borderLeft:`3px solid ${cfg.color}`,cursor:"pointer"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:12,background:cfg.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cfg.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                      {d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"long"})}
                      {e.lugar?` · 📍${e.lugar}`:""}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:dias===0?"#FEE2E2":dias<0?"#F1F5F9":dias<=7?"#FEF3C7":"#F1F5F9",color:dias===0?"#EF4444":dias<0?"#CBD5E1":dias<=7?"#F59E0B":"#94A3B8",flexShrink:0}}>
                    {dias===0?"Hoy":dias===1?"Mañana":dias<0?"Pasado":`${dias}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state: cuando no hay nada relevante en el muro */}
      {!datos.alerta &&
       !datos.menu &&
       !(datos.invitaciones?.length) &&
       !(datos.recordatorios?.filter(r=>!r.tipo||r.tipo==="recordatorio"||r.tipo==="general").length) &&
       !(datos.colectasPend?.length) &&
       !(datos.eventos?.length) && (
        <div style={{textAlign:"center",padding:"32px 16px",background:"white",borderRadius:16,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:14}}>
          <div style={{fontSize:32,marginBottom:10}}>📭</div>
          <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:4}}>Todo tranquilo por acá</div>
          <div style={{fontSize:13,color:"#94A3B8",lineHeight:1.6}}>El Room Parent publicará los avisos, eventos y novedades del curso acá.</div>
        </div>
      )}

      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Próximos cumpleaños</div>
      {(datos.bdayList||[]).slice(0,3).map(a=>{
        const hoy = new Date(); hoy.setHours(0,0,0,0);
        const d = new Date(a.fecha_nacimiento+"T00:00:00");
        let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
        if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
        const dias = Math.round((next - hoy) / (1000*60*60*24));
        const isAlumno = a.tipo==="Alumno";
        return(
          <div key={a.id} onClick={()=>onNavigate?.("cumples")} style={{background:"white",borderRadius:16,boxShadow:"0 1px 4px rgba(0,0,0,0.06)",padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>

            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{a.nombre}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:isAlumno?"#EFF6FF":"#F5F3FF",color:isAlumno?"#3B82F6":"#8B5CF6"}}>{isAlumno?"🎒 Alumno":"👨‍🏫 Maestro"}</span>
                <span style={{fontSize:11,color:"#94A3B8"}}>{new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:dias===0?"#EF4444":dias<=7?"#F59E0B":"#94A3B8",background:dias===0?"#FEE2E2":dias<=7?"#FEF3C7":"#F1F5F9",borderRadius:8,padding:"3px 8px",flexShrink:0}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>
          </div>
        );
      })}
      {(datos.bdayList||[]).length===0&&<div style={{fontSize:12,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin cumpleaños registrados</div>}
    </div>
  );
}
