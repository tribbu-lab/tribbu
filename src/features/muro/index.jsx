// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre, fmtRangoHora,
         sanitize, safeUrl, setHijoColor } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { useListControls } from "../../hooks/useListControls";
import { FestejoDetalleModal } from "../cumples";
import { EventoAsistenciaModal } from "../calendario";


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

// Tag de hijo estándar (solo visible en vista Todos: tagDeCurso devuelve null en vista por hijo)
function TagHijo({ tag }) {
  if(!tag) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
      {tag.nombre}
    </span>
  );
}

export function Muro({ cursoId, cursoIds, esVistaTodos=false, tagDeCurso, cursoNombre, isAdmin, userName, userId, misHijos=[], onNavigate, isMobile=true }) {
  misHijos = (misHijos||[]).filter(h=>h && typeof h === "string");
  cursoIds = (cursoIds&&cursoIds.length) ? cursoIds : (cursoId ? [cursoId] : []);
  const tagDe = (cid) => tagDeCurso ? tagDeCurso(cid) : null;
  const [datos,setDatos] = useState(null);
  const [modal,setModal] = useState(false);
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [eventoDetalle,  setEventoDetalle]  = useState(null);
  const [leidosMuro,setLeidosMuro] = useState(new Set());
  const [hijosNombres,setHijosNombres] = useState([]);
  const hoy = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});

  const cursosKey = cursoIds.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ cargar(); },[cursosKey]);

  const cargar = async () => {
    if(!cursoIds.length) return;
    const fechaHoy = new Date().toISOString().split("T")[0];
    const fecha15  = new Date(Date.now() + 15*24*60*60*1000).toISOString().split("T")[0];
    const [alertasRes,menu,recordatorios,cumples,cuotas,hijosData,maestrosData,eventosData,invitacionesData,leidosData,encuestasData] = await Promise.all([
      supabase.from("alertas").select("*").in("curso_id",cursoIds).eq("activa",true).order("creado_en",{ascending:false}).limit(3),
      supabase.from("menu").select("*").eq("fecha",fechaHoy).maybeSingle(),
      supabase.from("recordatorios").select("*").in("curso_id",cursoIds).order("creado_en",{ascending:false}),
      supabase.from("cumples").select("*").in("curso_id",cursoIds).order("id"),
      supabase.from("colectas").select("*").in("curso_id",cursoIds),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id",cursoIds),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").in("maestro_cursos.curso_id",cursoIds),
      supabase.from("eventos").select("*").in("curso_id",cursoIds).gte("fecha",fechaHoy).lte("fecha",fecha15).order("fecha"),
      (userId && misHijos.length) ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,hora_fin,lugar,tipo,alumno_id,imagen_url,url_ubicacion,descripcion,curso_id)").in("alumno_invitado_id", misHijos).eq("asiste","pendiente") : Promise.resolve({data:[]}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",userId) : Promise.resolve({data:[]}),
      supabase.from("encuestas").select("*").in("curso_id",cursoIds),
    ]);
    // Encuestas activas (sin cerrar) donde el usuario todavía no votó.
    let encuestasPend = [];
    const encuestasActivas = (encuestasData.data||[]).filter(e=>!e.cerrada_manual && (!e.fecha_cierre || e.fecha_cierre>=fechaHoy));
    if(userId && encuestasActivas.length) {
      const { data: misVotosData } = await supabase.from("encuesta_votos").select("encuesta_id").eq("usuario_id",userId).in("encuesta_id",encuestasActivas.map(e=>e.id));
      const votadas = new Set((misVotosData||[]).map(v=>v.encuesta_id));
      encuestasPend = encuestasActivas.filter(e=>!votadas.has(e.id));
    }
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
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6", curso_id:a.curso_id,
      })),
      ...(maestrosData.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, nombre:m.nombre, tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6", curso_id:m.maestro_cursos?.[0]?.curso_id,
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
    }).sort((a,b)=> (b.creado_en||"").localeCompare(a.creado_en||""));
    // Colectas pendientes: cada colecta se evalúa contra MIS hijos de SU curso
    // (en vista Todos hay colectas de varios cursos; un hijo de otro curso no
    // cuenta como "impago"). Mismo patrón que mobile/features/muro.
    const misHijosIds = (typeof misHijos !== "undefined" ? misHijos : []).filter(h=>h && typeof h === "string");
    const misHijosPorCurso = new Map();
    for(const h of (hijosData.data||[])){
      if(!misHijosIds.includes(h.id)) continue;
      const arr = misHijosPorCurso.get(h.curso_id)||[];
      arr.push(h.id);
      misHijosPorCurso.set(h.curso_id, arr);
    }
    let colectasPend = [];
    const colectasActivas = (cuotas.data||[]).filter(c=>c.activa&&(!c.vencimiento||c.vencimiento<=fecha15b));
    if(misHijosIds.length && colectasActivas.length) {
      const { data: pagosData } = await supabase.from("colecta_pagos").select("*").in("colecta_id",colectasActivas.map(c=>c.id)).in("alumno_id",misHijosIds);
      const pagados = new Set((pagosData||[]).filter(p=>p.estado==="pagado").map(p=>`${p.colecta_id}-${p.alumno_id}`));
      colectasPend = colectasActivas.filter(c=>(misHijosPorCurso.get(c.curso_id)||[]).some(hid=>!pagados.has(`${c.id}-${hid}`)));
    }
    // Una alerta activa por curso (la más reciente), hasta 3
    const alertasPorCurso = [];
    const cursosConAlerta = new Set();
    for(const a of (alertasRes.data||[])){
      if(!cursosConAlerta.has(a.curso_id)){ cursosConAlerta.add(a.curso_id); alertasPorCurso.push(a); }
    }
    setDatos({ alertas:alertasPorCurso, menu:menu.data||null, recordatorios:recsNoLeidos, cumples:cumples.data||[], cuotas:cuotas.data||[], bdayList, colectasPend, encuestasPend, eventos:(eventosData.data||[]).filter(e=>e.tipo!=="cumple"&&e.tipo!=="festejo"), invitaciones:(invitacionesData.data||[]).filter(i=>i.evento && cursoIds.includes(i.evento.curso_id)), hijosData:hijosData.data||[] });
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
    // Solo los hijos que pertenecen al curso de esta colecta (clave en vista Todos)
    const hijosDelCursoColecta = new Set((datos?.hijosData||[]).filter(h=>h.curso_id===colecta.curso_id).map(h=>h.id));
    const hijosTarget = misHijos.filter(hid=>hijosDelCursoColecta.has(hid));
    if(!hijosTarget.length) return;
    const fecha_pago = new Date().toISOString().slice(0,10);
    await Promise.all(hijosTarget.map(hid=>
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

  const dismissAlerta = async (alerta) => {
    if(alerta){ await supabase.from("alertas").update({activa:false}).eq("id",alerta.id); cargar(); }
  };

  if(!datos) return <Spinner/>;

  // Colecta más próxima a cerrar entre las que YA cerrará; solo para el
  // resumen de la aside de escritorio (no altera la lógica de colectasPend).
  const proximoCumple = (datos.bdayList||[])[0];

  // ── Pendientes unificado (handoff Tribbu Apoderado Web, Parte 1/7): antes
  // cada tipo (recordatorio/colecta/invitación/encuesta) era su propia
  // sección con su propio estilo de card — el mockup los junta en UNA sola
  // lista "Pendientes · N", cada card con el mismo patrón (icono + tipo/tag +
  // título/meta + chip + botón de acción a la derecha). Mismo patrón que ya
  // tiene mobile/features/muro/index.jsx.
  const diasHasta = (fechaStr) => {
    if(!fechaStr) return null;
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    return Math.round((new Date(fechaStr+"T00:00:00")-hoyD)/86400000);
  };
  const fmtDiaMesCorto = (s) => s ? new Date(s+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"}) : null;
  const chipDias = (dias) => dias==null ? null : dias<=0 ? (dias===0?"Hoy":`hace ${-dias}d`) : dias===1 ? "Mañana" : `${dias}d`;

  const pendientes = [
    ...datos.recordatorios.filter(r=>!r.tipo||r.tipo==="recordatorio"||r.tipo==="general").map(r=>({
      key:`r-${r.id}`, tipo:"Recordatorio", color:"#DC2626", soft:"#FEF2F2", borde:"#FECACA",
      icon:"📌", titulo:r.texto,
      meta:`Sin leer${r.fecha?` · ${new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"long"})}`:""}${fmtRangoHora(r.hora_inicio,r.hora_fin)?` · ${fmtRangoHora(r.hora_inicio,r.hora_fin)}`:""}${r.grupo_id?" · 🏫 Comunicación del colegio":""}`,
      accion:"Marcar leído", btnBg:"#EFF6FF", btnFg:"#1D4ED8",
      onAccion:(e)=>{e.stopPropagation();marcarLeidoMuro(r.id);}, onPress:()=>onNavigate?.("recordatorios"),
      tag:tagDe(r.curso_id), chip:chipDias(diasHasta(r.fecha)),
    })),
    ...(datos.colectasPend||[]).map(c=>({
      key:`c-${c.id}`, tipo:"Colecta", color:"#B45309", soft:"#FFFBEB", borde:"#FDE68A",
      icon:"💳", titulo:c.titulo, meta:"Tu aporte todavía no está registrado",
      accion:"Registrar pago", btnBg:"#EFF6FF", btnFg:"#1D4ED8",
      onAccion:(e)=>{e.stopPropagation();onNavigate?.("finanzas",{openColecta:c.id});}, onPress:()=>onNavigate?.("finanzas",{openColecta:c.id}),
      tag:tagDe(c.curso_id), chip: c.monto_sugerido?`${c.moneda||"$"} ${Number(c.monto_sugerido).toLocaleString("es-AR")}`:null,
    })),
    ...(datos.invitaciones||[]).map(inv=>({
      key:`i-${inv.id}`, tipo:"Invitación", color:"#047857", soft:"#F0FDF4", borde:"#A7F3D0",
      icon:"🎉", titulo:inv.evento.titulo, meta:"Falta confirmar asistencia",
      accion:"Responder", btnBg:"#0F172A", btnFg:"white",
      onAccion:(e)=>{e.stopPropagation();setFestejoDetalle(inv.evento);}, onPress:()=>setFestejoDetalle(inv.evento),
      tag:tagDe(inv.evento.curso_id), chip:fmtDiaMesCorto(inv.evento.fecha),
    })),
    ...(datos.encuestasPend||[]).map(e=>({
      key:`enc-${e.id}`, tipo:"Encuesta", color:"#1D4ED8", soft:"#EFF6FF", borde:"#BFDBFE",
      icon:"📊", titulo:e.pregunta, meta:"Todavía no votaste",
      accion:"Votar", btnBg:"#EFF6FF", btnFg:"#1D4ED8",
      onAccion:(e2)=>{e2.stopPropagation();onNavigate?.("encuestas");}, onPress:()=>onNavigate?.("encuestas"),
      tag:tagDe(e.curso_id), chip:fmtDiaMesCorto(e.fecha_cierre),
    })),
  ];

  // ── Agenda unificada: eventos + cumpleaños por proximidad, "Próximos 15
  // días" (ambos ya vienen filtrados a esa ventana desde cargar()).
  const agenda = [
    ...(datos.eventos||[]).map(e=>{
      const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
      return { key:`e-${e.id}`, fecha:e.fecha, dias:diasHasta(e.fecha), emoji:cfg.emoji,
        titulo:e.titulo, meta:e.lugar?`📍 ${e.lugar}`:"Todo el curso", tag:tagDe(e.curso_id),
        onPress:()=>onNavigate?.("clases",{openFecha:e.fecha}) };
    }),
    ...(datos.bdayList||[]).map(a=>{
      const hoyD = new Date(); hoyD.setHours(0,0,0,0);
      const d = new Date(a.fecha_nacimiento+"T00:00:00");
      let next = new Date(hoyD.getFullYear(), d.getMonth(), d.getDate());
      if(next<hoyD) next.setFullYear(hoyD.getFullYear()+1);
      const dias = Math.round((next-hoyD)/86400000);
      return { key:a.id, fecha:next.toISOString().split("T")[0], dias, emoji:"🎂",
        titulo:`Cumple de ${a.nombre}`, meta:a.tipo==="Alumno"?"🎒 Alumno":"👨‍🏫 Maestro", tag:tagDe(a.curso_id),
        onPress:()=>onNavigate?.("cumples") };
    }),
  ].sort((a,b)=>a.dias-b.dias);

  // ── Layout A: original ───────────────────────────────────────────────────
  return (
    <div>
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijos||[]} onClose={()=>{ setFestejoDetalle(null); cargar(); }} onUpdate={cargar}/>}
      {eventoDetalle&&<EventoAsistenciaModal evento={eventoDetalle} onClose={()=>setEventoDetalle(null)} misHijos={misHijos} userId={userId}/>}
      {/* El selector de hijos/Todos vive en la navegación (sidebar en desktop,
          header en mobile) — App.jsx —, no acá: se puede cambiar de vista desde
          cualquier pantalla, igual que en la app mobile. */}
      <div style={isMobile ? undefined : {display:"grid",gridTemplateColumns:"1fr 320px",gap:20,alignItems:"start"}}>
      <div>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:22,fontWeight:900}}>Hola{userName?`, ${userName}`:""} 👋</div>
        <div style={{fontSize:13,color:"#94A3B8",textTransform:"capitalize"}}>{hoy}</div>
      </div>
      {(datos.alertas||[]).map(al=>{
        const tag = tagDe(al.curso_id);
        return (
          <div key={al.id} style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
            <div style={{display:"flex",gap:10}}>
              <span style={{fontSize:22,flexShrink:0}}>🚨</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",marginBottom:3,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span>{cursoNombre?`${cursoNombre} · `:""}{al.hora}</span>
                  {tag&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap",background:"rgba(255,255,255,0.92)",borderRadius:20,padding:"2px 8px",textTransform:"none"}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
                      {tag.nombre}
                    </span>
                  )}
                </div>
                <div style={{fontSize:13,fontWeight:700,color:"white",lineHeight:1.5}}>{al.mensaje}</div>
              </div>
              {isAdmin&&<button onClick={()=>dismissAlerta(al)} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",color:"white",fontSize:14,flexShrink:0}}>✕</button>}
            </div>
          </div>
        );
      })}

      {isMobile&&datos.menu&&(
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

      {/* Pendientes: lista única (handoff Tribbu Apoderado Web) — reemplaza
          las 4 secciones separadas (Invitaciones/Recordatorios/Pendiente de
          pago/Encuestas) por un solo patrón de card con acción a la derecha. */}
      <div style={{marginBottom:18}}>
        <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:11}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,textTransform:"uppercase",color:"#94A3B8"}}>Pendientes{pendientes.length?` · ${pendientes.length}`:""}</div>
          {pendientes.length>0&&<span style={{fontSize:12,fontWeight:700,color:"#94A3B8"}}>Resolvelos desde acá</span>}
        </div>
        {pendientes.length>0 ? (
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {pendientes.map(p=>(
              <div key={p.key} onClick={p.onPress} style={{display:"flex",gap:14,alignItems:"flex-start",padding:18,border:`1px solid ${p.borde}`,borderRadius:16,background:"white",cursor:"pointer"}}>
                <div style={{width:40,height:40,borderRadius:12,background:p.soft,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>{p.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
                    <span style={{fontSize:9.5,fontWeight:800,letterSpacing:1.1,textTransform:"uppercase",color:p.color}}>{p.tipo}</span>
                    {p.tag&&<><span style={{width:3,height:3,borderRadius:999,background:"#CBD5E1",flexShrink:0}}/><TagHijo tag={p.tag}/></>}
                  </div>
                  <div style={{fontSize:16,fontWeight:700,marginTop:5,lineHeight:1.35}}>{p.titulo}</div>
                  <div style={{fontSize:13,color:"#64748B",marginTop:3}}>{p.meta}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                  {p.chip&&<span style={{fontSize:12.5,fontWeight:800,color:"#64748B",background:"#F1F5F9",padding:"7px 12px",borderRadius:999,whiteSpace:"nowrap"}}>{p.chip}</span>}
                  <button onClick={p.onAccion} style={{minHeight:44,padding:"0 18px",border:"none",borderRadius:12,background:p.btnBg,color:p.btnFg,fontSize:13.5,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>{p.accion}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:15,padding:22,border:"1.5px dashed #E2E8F0",borderRadius:16,background:"white"}}>
            <div style={{width:46,height:46,borderRadius:999,background:"#F0FDF4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:23,flexShrink:0}}>✓</div>
            <div>
              <div style={{fontSize:16,fontWeight:800}}>Estás al día ✨</div>
              <div style={{fontSize:13.5,color:"#64748B",marginTop:3,lineHeight:1.5}}>No tenés pendientes. Cuando haya algo para resolver, aparece acá.</div>
            </div>
          </div>
        )}
      </div>

      {/* Próximos 15 días: eventos + cumpleaños unificados por proximidad. */}
      <div style={{fontSize:11,fontWeight:800,letterSpacing:1.2,textTransform:"uppercase",color:"#94A3B8",marginBottom:11}}>Próximos 15 días</div>
      {agenda.length>0 ? (
        <div style={{border:"1px solid #E7ECF3",borderRadius:16,background:"white",overflow:"hidden"}}>
          {agenda.map((e,i)=>{
            const d = new Date(e.fecha+"T00:00:00");
            const c = e.dias<=1 ? {bg:"#3B82F6",fg:"white"} : e.dias<=7 ? {bg:"#EFF6FF",fg:"#1D4ED8"} : {bg:"#F1F5F9",fg:"#64748B"};
            return (
              <div key={e.key} onClick={e.onPress} style={{display:"flex",alignItems:"center",gap:14,padding:"15px 18px",borderTop:i===0?"none":"1px solid #F1F5F9",cursor:"pointer"}}>
                <div style={{width:46,textAlign:"center",flexShrink:0}}>
                  <div style={{fontSize:10,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#94A3B8"}}>{d.toLocaleDateString("es-AR",{weekday:"short"}).replace(".","")}</div>
                  <div style={{fontSize:19,fontWeight:800}}>{d.getDate()}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.titulo} {e.emoji}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3,flexWrap:"wrap"}}>
                    {e.tag?<TagHijo tag={e.tag}/>:<span style={{fontSize:12.5,color:"#64748B"}}>{e.meta}</span>}
                  </div>
                </div>
                <span style={{fontSize:12.5,fontWeight:800,color:c.fg,background:c.bg,padding:"7px 12px",borderRadius:999,flexShrink:0}}>{chipDias(e.dias)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{fontSize:12,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin eventos ni cumpleaños en los próximos 15 días</div>
      )}
      </div>

      {/* Aside de escritorio (handoff Tribbu Apoderado Web, Parte 7): mismo
          contenido ya cargado arriba, solo reordenado — sin queries nuevas.
          "Aprovecha el ancho", no agrega funcionalidad. */}
      {!isMobile&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {datos.menu&&(
            <div style={{border:"1px solid #E7ECF3",borderRadius:16,background:"white",padding:18}}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#94A3B8",marginBottom:12}}>Menú de hoy</div>
              <div style={{fontSize:13,color:"#334155",lineHeight:1.7}}>
                {[datos.menu.entrada,datos.menu.plato,datos.menu.plato2,datos.menu.acompanamiento,datos.menu.postre,datos.menu.postre2].filter(Boolean).join(" · ")}
              </div>
            </div>
          )}
          {(datos.cuotas||[]).filter(c=>c.activa).length>0&&(
            <div style={{border:"1px solid #E7ECF3",borderRadius:16,background:"white",padding:18}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#94A3B8"}}>Colectas abiertas</div>
                <button onClick={()=>onNavigate?.("finanzas")} style={{border:"none",background:"none",color:"#2563EB",fontSize:12,fontWeight:700,cursor:"pointer"}}>Ver todas</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {datos.cuotas.filter(c=>c.activa).slice(0,4).map(c=>{
                  const debo = (datos.colectasPend||[]).some(p=>p.id===c.id);
                  return (
                    <div key={c.id} style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,cursor:"pointer"}} onClick={()=>onNavigate?.("finanzas",{openColecta:c.id})}>
                      <span style={{fontSize:13,fontWeight:600,lineHeight:1.4}}>{c.titulo}</span>
                      <span style={{fontSize:11,fontWeight:800,color:debo?"#F59E0B":"#10B981",whiteSpace:"nowrap"}}>{debo?"Falta tu aporte":"Al día"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {proximoCumple&&(
            <div style={{border:"1px solid #E7ECF3",borderRadius:16,background:"white",padding:18,cursor:"pointer"}} onClick={()=>onNavigate?.("cumples")}>
              <div style={{fontSize:11,fontWeight:800,letterSpacing:1,textTransform:"uppercase",color:"#94A3B8",marginBottom:12}}>El próximo cumple</div>
              <div style={{fontSize:14.5,fontWeight:700}}>{proximoCumple.nombre} 🎂</div>
              <div style={{fontSize:12,color:"#64748B",marginTop:3}}>{new Date(proximoCumple.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
