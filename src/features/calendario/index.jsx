// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre, fmtRangoFecha,
         sanitize, safeUrl, getHijoColor, setHijoColor } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { Paginador } from "../../components/Paginador";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useListControls } from "../../hooks/useListControls";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { FestejoDetalleModal } from "../cumples";
import BotonAgregarCalendario from "./BotonAgregarCalendarioWeb";

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


// Tag de hijo estándar (solo vista "Todos": tagDeCurso devuelve null en vista por hijo).
function TagHijo({ tag }) {
  if(!tag) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,minWidth:0}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
      <span style={{fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tag.nombre}</span>
    </span>
  );
}

export function Calendario({ cursoId, cursoIds, esVistaTodos=false, tagDeCurso=()=>null, userId, isAdmin, misHijos=[], openFecha=null, onClearOpenFecha }) {
  const hoy       = new Date(); hoy.setHours(0,0,0,0);
  const [horarios, setHorarios] = useState([]);
  const [horarioColegio, setHorarioColegio] = useState(null);
  const [filtroTipo,   setFiltroTipo]   = useState("todos");
  const [filtroRango,  setFiltroRango]  = useState("90"); // "7"|"30"|"90"|"custom"
  const [filtroDesde,  setFiltroDesde]  = useState("");
  const [filtroHasta,  setFiltroHasta]  = useState("");
  const [vista,   setVista]   = useState("mes");
  const [mes,     setMes]     = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [eventos, setEventos] = useState([]);
  const [cumples, setCumples] = useState([]);
  const [diaSelec,setDiaSelec]= useState(null);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [festejoDetalle, setFestejoDetalle] = useState(null);
  const [eventoDetalle,  setEventoDetalle]  = useState(null);
  const [recordatorios,  setRecordatorios]  = useState([]);
  const [leidosSet,      setLeidosSet]      = useState(new Set());

  const cargarRecs = async () => {
    if(!cursoIds?.length) return;
    const hoyStr = new Date().toISOString().split("T")[0];
    const [recs, leidos] = await Promise.all([
      supabase.from("recordatorios").select("*").in("curso_id",cursoIds).order("fecha",{ascending:true}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",userId) : Promise.resolve({data:[]}),
    ]);
    setRecordatorios((recs.data||[]).filter(r=> (!r.fecha || r.fecha >= hoyStr) && (r.para_usuario_id===null||r.para_usuario_id===undefined||r.para_usuario_id===userId)));
    setLeidosSet(new Set((leidos.data||[]).map(l=>l.recordatorio_id)));
  };

  const marcarLeido = async (recId) => {
    await supabase.from("recordatorio_leidos").upsert({recordatorio_id:recId, usuario_id:userId},{onConflict:"recordatorio_id,usuario_id"});
    setLeidosSet(p=> new Set([...p, recId]));
  };

  const cargar = async () => {
    if(!cursoIds?.length) return;
    const [ev, al, ma, hor, col] = await Promise.all([
      supabase.from("eventos").select("*").in("curso_id", cursoIds).order("fecha"),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id", cursoIds),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").in("maestro_cursos.curso_id", cursoIds),
      supabase.from("horarios").select("*").in("curso_id", cursoIds).order("hora_inicio"),
      supabase.from("colegio").select("horario_clases").eq("id","d31b5547-246b-46fa-906e-950e51d4af58").single(),
    ]);
    setEventos(ev.data||[]);
    setHorarios(hor.data||[]);
    setHorarioColegio(col.data?.horario_clases||null);
    // Armamos cumples como eventos virtuales (próxima ocurrencia)
    const todos = [
      ...(al.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`c-a-${a.id}`, tipo:"cumple", nombre:fmtNombre(a), color:a.color||"#EC4899",
        fecha_nacimiento: a.fecha_nacimiento, curso_id: a.curso_id,
      })),
      ...(ma.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`c-m-${m.id}`, tipo:"cumple", nombre:m.nombre, color:"#8B5CF6",
        fecha_nacimiento: m.fecha_nacimiento, curso_id: m.maestro_cursos?.[0]?.curso_id ?? null,
      })),
    ];
    setCumples(todos);
  };
  useEffect(()=>{ cargar(); cargarRecs(); },[cursoIds?.join(",")]);

  useEffect(()=>{
    if(!openFecha) return;
    const d = new Date(openFecha+"T00:00:00");
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    setDiaSelec({year:d.getFullYear(), month:d.getMonth(), day:d.getDate()});
    setVista("mes");
    onClearOpenFecha?.();
  },[openFecha]);

  const eliminar = async (id) => {
    await supabase.from("eventos").delete().eq("id", id);
    setConfirm(null); cargar();
  };

  // Devuelve todos los "eventos" (reales + cumples) para un año/mes/día dado.
  // Un evento multi-día (fecha_fin) aparece en cada día de su rango.
  const eventosDelDia = (year, month, day) => {
    const fecha = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const reales = eventos.filter(e => e.fecha <= fecha && (e.fecha_fin || e.fecha) >= fecha);
    const bdayHoy = cumples.filter(c => {
      const d = new Date(c.fecha_nacimiento+"T00:00:00");
      return d.getMonth()===month && d.getDate()===day;
    });
    return [...reales, ...bdayHoy.map(c=>({...c, titulo:c.nombre, fecha}))];
  };

  const year = mes.getFullYear(), month = mes.getMonth();
  const firstDay = (new Date(year,month,1).getDay()+6)%7;
  const daysInMonth = new Date(year,month+1,0).getDate();
  const cells = Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);

  // Lista cronológica: próximos 60 días de eventos + cumples
  const listaEventos = () => {
    let desde = new Date(hoy);
    let hasta = new Date(hoy);
    if(filtroRango==="custom") {
      desde = filtroDesde ? new Date(filtroDesde+"T00:00:00") : new Date(hoy);
      hasta = filtroHasta ? new Date(filtroHasta+"T00:00:00") : new Date(hoy.getFullYear()+1,11,31);
    } else {
      hasta.setDate(hasta.getDate() + Number(filtroRango));
    }
    const reales = eventos
      .filter(e => {
        const ini = new Date(e.fecha+"T00:00:00");
        const fin = e.fecha_fin ? new Date(e.fecha_fin+"T00:00:00") : ini;
        return fin>=desde && ini<=hasta; // solapa el rango del filtro
      })
      .map(e => ({ ...e, _fecha: new Date(e.fecha+"T00:00:00") }));
    const bdayList = cumples.map(c => {
      const d = new Date(c.fecha_nacimiento+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < desde) next = new Date(hoy.getFullYear()+1, d.getMonth(), d.getDate());
      if(next < desde || next > hasta) return null;
      return { ...c, titulo: c.nombre, fecha: next.toISOString().slice(0,10), _fecha: next, tipo:"cumple" };
    }).filter(Boolean);
    const todos = [...reales, ...bdayList].sort((a,b)=>a._fecha-b._fecha);
    return filtroTipo==="todos" ? todos : todos.filter(e=>e.tipo===filtroTipo);
  };

  const bgs = ["#EFF6FF","#F0FDF4","#FFF7ED","#F5F3FF","#FEFCE8"];
  const cols = ["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EAB308"];
  const diaSelecFecha = diaSelec ? `${diaSelec.year}-${String(diaSelec.month+1).padStart(2,"0")}-${String(diaSelec.day).padStart(2,"0")}` : null;
  const evDiaSelec = diaSelec ? eventosDelDia(diaSelec.year, diaSelec.month, diaSelec.day) : [];

  return (
    <div>
      {(modal==="nuevo"||modal?.id) && <EventoModal evento={modal==="nuevo"?null:modal} cursoId={cursoId} userId={userId} onClose={()=>setModal(null)} onSave={()=>{ setModal(null); cargar(); }}/>}
      {eventoDetalle&&<EventoAsistenciaModal evento={eventoDetalle} tag={tagDeCurso(eventoDetalle.curso_id)} misHijos={misHijos} userId={userId} onClose={()=>setEventoDetalle(null)}/>}
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijos||[]} onClose={()=>setFestejoDetalle(null)} onUpdate={cargar}/>}
      {confirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,maxWidth:340,width:"100%"}}>
            <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>¿Eliminar evento?</div>
            <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>{confirm.titulo}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirm(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={()=>eliminar(confirm.id)} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Eliminar</button>
            </div>
          </Card>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:22,fontWeight:900}}>Calendario 📅</div>
        {isAdmin&&<button onClick={()=>setModal("nuevo")} style={{padding:"8px 16px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Evento</button>}
      </div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:14}}>Clases, eventos y cumpleaños</div>

      <BotonAgregarCalendario supabase={supabase} userId={userId}/>

      {/* Tabs vista */}
      <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
        {[{id:"mes",l:"📆 Mes"},{id:"lista",l:"📋 Próximos eventos"},{id:"horario",l:"🕐 Horario de Clases"}].map(t=>(
          <button key={t.id} onClick={()=>setVista(t.id)} style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:vista===t.id?"#0F172A":"white",color:vista===t.id?"white":"#94A3B8",boxShadow:vista===t.id?"0 3px 12px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{t.l}</button>
        ))}
      </div>

      {/* VISTA MES */}
      {vista==="mes"&&(
        <div style={{maxWidth:460}}>
          <Card style={{padding:16,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <button onClick={()=>setMes(new Date(year,month-1,1))} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>‹</button>
              <div style={{fontSize:15,fontWeight:700}}>{MESES[month]} {year}</div>
              <button onClick={()=>setMes(new Date(year,month+1,1))} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>›</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
              {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94A3B8",padding:"4px 0"}}>{d}</div>)}
              {cells.map((day,i)=>{
                if(!day) return <div key={i}/>;
                const esHoy = day===hoy.getDate()&&month===hoy.getMonth()&&year===hoy.getFullYear();
                const evs = eventosDelDia(year,month,day);
                const selec = diaSelec?.day===day&&diaSelec?.month===month&&diaSelec?.year===year;
                return (
                  <div key={i} onClick={()=>setDiaSelec(selec?null:{year,month,day})} style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:8,background:selec?"#0F172A":esHoy?"#3B82F6":"white",color:selec||esHoy?"white":"#0F172A",fontSize:12,fontWeight:esHoy||selec?800:500,cursor:"pointer",position:"relative",border:selec?"none":"1px solid #F1F5F9"}}>
                    {day}
                    {evs.length>0&&<div style={{display:"flex",gap:2,marginTop:2,flexWrap:"wrap",justifyContent:"center"}}>
                      {evs.slice(0,3).map((e,ei)=>{
                        const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
                        return <div key={ei} style={{width:5,height:5,borderRadius:"50%",background:selec||esHoy?"white":cfg.color}}/>;
                      })}
                    </div>}
                  </div>
                );
              })}
            </div>
          </Card>
          {/* Panel del día seleccionado */}
          {diaSelec&&(
            <Card style={{padding:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:14,fontWeight:800}}>
                  {diaSelec.day} de {MESES[diaSelec.month]}
                </div>
                {isAdmin&&<button onClick={()=>setModal("nuevo")} style={{padding:"5px 12px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
              </div>
              {evDiaSelec.length===0
                ? <div style={{fontSize:13,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin eventos este día</div>
                : evDiaSelec.map((e,i)=>{
                    const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
                    return (
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderBottom:i<evDiaSelec.length-1?"1px solid #F1F5F9":"none"}}>
                        <div style={{width:36,height:36,borderRadius:10,background:cfg.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cfg.emoji}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                            <TagHijo tag={tagDeCurso(e.curso_id)}/>
                          </div>
                          <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                            {cfg.label}{e.hora&&!e.todo_el_dia?` · ${e.hora}${e.hora_fin?` – ${e.hora_fin}`:""}`:""}{e.lugar?` · 📍${e.lugar}`:""}
                          </div>
                          {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                          <AdjuntosList adjuntos={e.adjuntos}/>
                        </div>
                        {e.tipo==="festejo"
                        ? <button onClick={()=>setFestejoDetalle(e)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",fontSize:11,fontWeight:700,color:"#F59E0B"}}>Ver invitados</button>
                        : (e.confirma_asistencia ? <button onClick={()=>setEventoDetalle(e)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:600,color:"#64748B"}}>Ver asistencia</button> : null)
                      }
                        {isAdmin&&e.id&&!e.id?.toString().startsWith("c-")&&e.tipo!=="festejo"&&(
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>setModal(e)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>✏️</button>
                            <button onClick={()=>setConfirm(e)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
                          </div>
                        )}
                      </div>
                    );
                  })
              }
            </Card>
          )}
        </div>
      )}

      {/* VISTA LISTA */}
      {vista==="lista"&&(
        <div style={{maxWidth:560}}>
          {/* ── Filtros ── */}
          <div style={{marginBottom:14,display:"flex",flexDirection:"column",gap:10}}>

            {/* Rango rápido */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[{k:"7",l:"Esta semana"},{k:"30",l:"Este mes"},{k:"90",l:"Próx. 3 meses"},{k:"custom",l:"📅 Personalizado"}].map(r=>(
                <button key={r.k} onClick={()=>setFiltroRango(r.k)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:filtroRango===r.k?"#0F172A":"white",color:filtroRango===r.k?"white":"#94A3B8",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",transition:"all 0.15s"}}>
                  {r.l}
                </button>
              ))}
            </div>

            {/* Picker desde/hasta */}
            {filtroRango==="custom"&&(
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#94A3B8"}}>Desde</span>
                  <input type="date" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white",fontFamily:"inherit"}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#94A3B8"}}>Hasta</span>
                  <input type="date" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white",fontFamily:"inherit"}}/>
                </div>
                {(filtroDesde||filtroHasta)&&<button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}} style={{fontSize:11,color:"#94A3B8",background:"none",border:"none",cursor:"pointer",padding:"4px 8px"}}>✕ Limpiar</button>}
              </div>
            )}

            {/* Filtro por tipo */}
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:11,fontWeight:700,color:"#94A3B8",whiteSpace:"nowrap"}}>Tipo</span>
              <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:600,color:"#0F172A",background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
                <option value="todos">Todos los tipos</option>
                {Object.entries(TIPO_CONFIG).filter(([k])=>k!=="festejo").map(([k,v])=>(
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {listaEventos().length===0&&<div style={{fontSize:13,color:"#94A3B8",padding:32,textAlign:"center"}}>No hay eventos para este filtro</div>}
          {listaEventos().map((e,i)=>{
            const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
            const d   = new Date(e.fecha+"T00:00:00");
            const dFin = e.fecha_fin ? new Date(e.fecha_fin+"T00:00:00") : d;
            const enCurso = hoy>=d && hoy<=dFin;
            const dias = enCurso ? 0 : Math.round((d-hoy)/86400000);
            const diasTxt = enCurso ? "En curso" : dias===0?"Hoy":dias===1?"Mañana":`${dias}d`;
            return (
              <Card key={e.id||i} style={{padding:"13px 15px",marginBottom:10,borderLeft:`3px solid ${cfg.color}`}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{width:42,height:42,borderRadius:12,background:cfg.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:18}}>{cfg.emoji}</div>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                      <TagHijo tag={tagDeCurso(e.curso_id)}/>
                    </div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                      {fmtRangoFecha(e.fecha, e.fecha_fin)}
                      {e.hora&&!e.todo_el_dia?` · ${e.hora}${e.hora_fin?` – ${e.hora_fin}`:""}`:""}
                    </div>
                    {e.lugar&&<div style={{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:4}}>
                      📍 {e.lugar}
                      {e.url_ubicacion&&<a href={safeUrl(e.url_ubicacion)||"#"} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginLeft:4}}>Ver mapa</a>}
                    </div>}
                    {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                    <AdjuntosList adjuntos={e.adjuntos}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:enCurso||dias===0?"#FEE2E2":dias<=7?"#FEF3C7":"#F1F5F9",color:enCurso||dias===0?"#EF4444":dias<=7?"#F59E0B":"#94A3B8"}}>{diasTxt}</span>
                    {e.tipo==="festejo"&&<button onClick={()=>setFestejoDetalle(e)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",fontSize:11,fontWeight:700,color:"#F59E0B"}}>Ver invitados</button>}
                    {e.tipo!=="festejo"&&e.confirma_asistencia&&<button onClick={()=>setEventoDetalle(e)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:600,color:"#64748B"}}>Ver asistencia</button>}
                    {isAdmin&&e.id&&!e.id?.toString().startsWith("c-")&&e.tipo!=="festejo"&&(
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>setModal(e)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>✏️</button>
                        <button onClick={()=>setConfirm(e)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* VISTA HORARIO */}
      {vista==="horario"&&(()=>{
        const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes"];
        const DIA_COLORS = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444"];
        const fmtHora = t => t ? t.slice(0,5) : "";

        // Parsear horario del colegio para obtener hora de inicio y fin
        // Formato esperado: "08:00 — 16:00" o "8:00 - 16:00"
        const parsearHorarioColegio = (str) => {
          if(!str) return { inicio: null, fin: null };
          const m = str.match(/(\d{1,2}:\d{2})\s*[—\-–]\s*(\d{1,2}:\d{2})/);
          if(!m) return { inicio: null, fin: null };
          const pad = t => t.length===4 ? "0"+t : t;
          return { inicio: pad(m[1]), fin: pad(m[2]) };
        };
        const { inicio: colegioInicio, fin: colegioFin } = parsearHorarioColegio(horarioColegio);

        // Render de la tabla semanal para un set de horarios (un curso)
        const renderTabla = (hs) => {
          // Slots base: todos los existentes en horarios
          const slotsExistentes = [...new Set(hs.map(h=>h.hora_inicio))].sort();

          // Si hay horario de colegio, agregar slots vacíos cada hora hasta el fin
          let allSlots = [...slotsExistentes];
          if(colegioInicio && colegioFin && slotsExistentes.length > 0) {
            const primerSlot = slotsExistentes[0];
            const slotInicio = colegioInicio < primerSlot ? colegioInicio : primerSlot;
            // Generar slots cada 1h desde inicio hasta fin del colegio
            const [hIni] = slotInicio.split(":").map(Number);
            const [hFin] = colegioFin.split(":").map(Number);
            for(let h = hIni; h < hFin; h++) {
              const slot = String(h).padStart(2,"0")+":00";
              if(!allSlots.includes(slot)) allSlots.push(slot);
            }
            allSlots.sort();
          }

          return (
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",minWidth:520,width:"100%",tableLayout:"fixed"}}>
                  <colgroup>
                    <col style={{width:68}}/>
                    {DIAS.map(d=><col key={d} style={{width:"18%"}}/>)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{padding:"8px 6px",background:"#F8FAFC",border:"1px solid #E2E8F0",fontSize:10,color:"#94A3B8",fontWeight:700}}></th>
                      {DIAS.map((d,i)=>(
                        <th key={d} style={{padding:"8px 6px",background:DIA_COLORS[i]+"18",border:"1px solid #E2E8F0",fontSize:11,fontWeight:800,color:DIA_COLORS[i],textAlign:"center",letterSpacing:0.3}}>
                          {d.slice(0,3).toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allSlots.map((slot,si)=>{
                      // find max hora_fin for this slot to show range
                      const slotClases = hs.filter(h=>h.hora_inicio===slot);
                      const maxFin = slotClases.map(h=>h.hora_fin).sort().pop();
                      return (
                        <tr key={slot}>
                          <td style={{padding:"6px 6px",background:"#F8FAFC",border:"1px solid #E2E8F0",textAlign:"center",verticalAlign:"middle"}}>
                            <div style={{fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap"}}>{fmtHora(slot)}</div>
                            {maxFin&&<div style={{fontSize:9,color:"#CBD5E1",whiteSpace:"nowrap"}}>{fmtHora(maxFin)}</div>}
                          </td>
                          {DIAS.map((dia,di)=>{
                            const clase = hs.find(h=>h.dia===dia&&h.hora_inicio===slot);
                            const dc = DIA_COLORS[di];
                            return (
                              <td key={dia} style={{padding:"5px 5px",border:"1px solid #E2E8F0",verticalAlign:"top",background:"white"}}>
                                {clase ? (
                                  <div style={{background:(clase.color||dc)+"18",border:`1.5px solid ${clase.color||dc}44`,borderRadius:8,padding:"6px 7px",height:"100%",boxSizing:"border-box"}}>
                                    <div style={{fontSize:11,fontWeight:700,color:clase.color||dc,lineHeight:1.3,marginBottom:clase.docente?2:0}}>{clase.materia}</div>
                                    {clase.docente&&<div style={{fontSize:9,color:"#94A3B8",lineHeight:1.2}}>{clase.docente}</div>}
                                    <div style={{fontSize:9,color:"#CBD5E1",marginTop:2}}>{fmtHora(clase.hora_inicio)}–{fmtHora(clase.hora_fin)}</div>
                                  </div>
                                ) : (
                                  <div style={{height:52}}/>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          );
        };

        // En vista "Todos": una sección por curso, encabezada por el tag del hijo
        const cursosConHorario = esVistaTodos
          ? (cursoIds||[]).filter(cid=>horarios.some(h=>h.curso_id===cid))
          : [];

        return (
          <div>
            <div style={{fontSize:16,fontWeight:900,color:"#0F172A",marginBottom:2}}>Horario de Clases</div>
            <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Vista semanal</div>

            {horarios.length===0&&(
              <div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>
                {isAdmin ? "No hay horarios cargados. Agregá desde ⚙️ Admin → Horarios." : "No hay horarios cargados aún."}
              </div>
            )}

            {horarios.length>0&&(esVistaTodos
              ? cursosConHorario.map(cid=>(
                  <div key={cid} style={{marginBottom:24}}>
                    <div style={{marginBottom:8}}><TagHijo tag={tagDeCurso(cid)}/></div>
                    {renderTabla(horarios.filter(h=>h.curso_id===cid))}
                  </div>
                ))
              : renderTabla(horarios)
            )}
          </div>
        );
      })()}

      {/* VISTA RECORDATORIOS */}
    </div>
  );
}

export function EventoModal({ evento, cursoId, userId, onClose, onSave }) {
  const esNuevo = !evento;
  const [form, setForm] = useState({
    titulo:      evento?.titulo      || "",
    tipo:        evento?.tipo        || "acto",
    fecha:       evento?.fecha       || "",
    fecha_fin:   evento?.fecha_fin   || "",
    hora:        evento?.hora        || "",
    hora_fin:    evento?.hora_fin    || "",
    lugar:       evento?.lugar       || "",
    url_ubicacion: evento?.url_ubicacion || "",
    descripcion: evento?.descripcion || "",
    // Un evento nuevo arranca CON hora (no "Todo el día") para que el admin
    // vea el campo de hora de entrada, en vez de tener que acordarse de
    // destildar el toggle — quedaba pasando que la hora terminaba escrita a
    // mano en la Descripción en vez de cargada en el campo real. Al editar
    // se respeta el valor guardado.
    todo_el_dia: esNuevo ? false : evento.todo_el_dia !== false,
    confirma_asistencia: evento?.confirma_asistencia ?? false,
    adjuntos:    evento?.adjuntos    || [],
  });
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  // Escrituras siempre sobre el curso del evento (nunca el de sesión al editar)
  const cursoEvento = evento?.curso_id ?? cursoId;
  const fechaFinInvalida = form.fecha_fin && form.fecha && form.fecha_fin < form.fecha;
  const guardar = async () => {
    if(!form.titulo || !form.fecha || fechaFinInvalida) return;
    // fecha_fin es columna `date`: "" no es válido, tiene que viajar null.
    const payload = { ...form, fecha_fin: form.fecha_fin || null, curso_id: cursoEvento, creado_por: userId };
    let eventoId = evento?.id;
    if(esNuevo) {
      const { data: ev } = await supabase.from("eventos").insert(payload).select().single();
      eventoId = ev?.id;
      const userIds = await getUserIdsByCurso(cursoEvento);
      await sendPush({ type:"evento", payload:{ titulo:form.titulo, fecha:form.fecha||"", userIds } });
    } else {
      await supabase.from("eventos").update(payload).eq("id", evento.id);
    }
    // Si confirma_asistencia: crear filas pendientes para todos los apoderados del curso
    if(form.confirma_asistencia && eventoId) {
      const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id", cursoEvento);
      const hijosIds = (hijos||[]).map(h=>h.id);
      if(hijosIds.length) {
        const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("hijo_id",hijosIds);
        const rows = (uh||[]).map(r=>({ evento_id:eventoId, usuario_id:r.usuario_id, alumno_invitado_id:r.hijo_id, asiste:"pendiente" }));
        if(rows.length) {
          await supabase.from("evento_asistencia").delete().eq("evento_id", eventoId);
          await supabase.from("evento_asistencia").upsert(rows, { onConflict: "evento_id,alumno_invitado_id", ignoreDuplicates: false });
        }
      }
    }
    onSave();
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:16,fontWeight:900,marginBottom:16}}>{esNuevo?"Nuevo evento":"Editar evento"}</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Tipo</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {Object.entries(TIPO_CONFIG).filter(([k])=>k!=="cumple"&&k!=="festejo").map(([k,v])=>(
              <button key={k} onClick={()=>setForm(p=>({...p,tipo:k,confirma_asistencia:["paseo","acto","reunion"].includes(k)?p.confirma_asistencia:false}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.tipo===k?v.color:"#E2E8F0"}`,background:form.tipo===k?v.bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.tipo===k?v.color:"#94A3B8"}}>{v.emoji} {v.label}</button>
            ))}
          </div>
        </div>
        {[
          {label:"Título",      key:"titulo",      type:"text", ph:"Ej: Acto del 25 de mayo"},
          {label:"Fecha",       key:"fecha",       type:"date"},
          {label:"Fecha fin (opcional, si dura varios días)", key:"fecha_fin", type:"date"},
          {label:"Lugar",        key:"lugar",         type:"text", ph:"Ej: Patio del colegio"},
          {label:"URL ubicación", key:"url_ubicacion", type:"url",  ph:"Ej: https://maps.google.com/..."},
          {label:"Descripción",   key:"descripcion",   type:"text", ph:"Detalles adicionales"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
            {f.key==="fecha_fin"&&fechaFinInvalida&&<div style={{fontSize:11,color:"#EF4444",marginTop:4}}>La fecha fin no puede ser anterior a la fecha de inicio</div>}
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setForm(p=>({...p,todo_el_dia:!p.todo_el_dia}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.todo_el_dia?"#3B82F6":"#E2E8F0"}`,background:form.todo_el_dia?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.todo_el_dia?"#3B82F6":"#94A3B8"}}>Todo el día</button>
            {!form.todo_el_dia&&<input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto",flex:1}}/>}
            {!form.todo_el_dia&&form.hora&&<><span style={{fontSize:12,color:"#94A3B8"}}>a</span><input type="time" value={form.hora_fin} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={{...inp,width:"auto",flex:1}}/></>}
          </div>
        </div>
        <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" id="confirma_asist" checked={!!form.confirma_asistencia} onChange={e=>setForm(p=>({...p,confirma_asistencia:e.target.checked}))} style={{width:16,height:16,cursor:"pointer",accentColor:"#3B82F6"}}/>
          <label htmlFor="confirma_asist" style={{fontSize:13,fontWeight:600,cursor:"pointer",color:"#0F172A"}}>Solicitar asistencia</label>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Adjuntos (opcional)</div>
          <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId={cursoEvento} onUploadingChange={setSubiendoAdj}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={guardar} disabled={subiendoAdj||fechaFinInvalida} style={{flex:2,padding:11,borderRadius:10,border:"none",background:subiendoAdj||fechaFinInvalida?"#93C5FD":"#3B82F6",color:"white",cursor:subiendoAdj||fechaFinInvalida?"default":"pointer",fontSize:13,fontWeight:700}}>Guardar</button>
        </div>
      </Card>
    </div>
  );
}

export function EventoAsistenciaModal({ evento, onClose, misHijos=[], userId=null, tag=null }) {
  const [asistencia, setAsistencia] = useState({});
  const [hijosInfo,  setHijosInfo]  = useState({});
  const [todosHijos, setTodosHijos] = useState([]);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [cargando,   setCargando]   = useState(true);

  const cargar = async () => {
    setCargando(true);
    const { data: asist } = await supabase.from("evento_asistencia").select("*").eq("evento_id", evento.id);
    const mapaAsist = {};
    (asist||[]).forEach(r=>{ if(r.alumno_invitado_id) mapaAsist[r.alumno_invitado_id] = r.asiste||"pendiente"; });
    setAsistencia(mapaAsist);
    const { data: hijos } = await supabase.from("hijos").select("id,nombre,apellido,color").eq("curso_id", evento.curso_id);
    const hijosMap = {};
    (hijos||[]).forEach(h=>{ hijosMap[h.id]=h; });
    setHijosInfo(hijosMap);
    setTodosHijos(hijos||[]);
    if(userId) {
      const { data: u } = await supabase.from("usuarios").select("rol").eq("id",userId).single();
      setIsAdmin(u?.rol==="admin"||u?.rol==="super");
    }
    setCargando(false);
  };

  useEffect(()=>{ cargar(); },[evento.id]);

  const responder = async (alumnoId, asiste) => {
    if(!userId) return;
    setAsistencia(prev=>({...prev,[alumnoId]:asiste}));
    await supabase.from("evento_asistencia").upsert(
      { evento_id:evento.id, usuario_id:userId, alumno_invitado_id:alumnoId, asiste },
      { onConflict:"evento_id,alumno_invitado_id" }
    );
  };

  const misHijosEnCurso = misHijos.filter(hid=>hijosInfo[hid]);
  const confirmados = todosHijos.filter(h=>asistencia[h.id]==="si");
  const noVan       = todosHijos.filter(h=>asistencia[h.id]==="no");
  const pendientes  = todosHijos.filter(h=>!asistencia[h.id]||asistencia[h.id]==="pendiente");

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:15,fontWeight:900}}>{evento.titulo}</div>
              <TagHijo tag={tag}/>
            </div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>
              {fmtRangoFecha(evento.fecha, evento.fecha_fin)}
              {evento.hora?` · ${evento.hora}${evento.hora_fin?` – ${evento.hora_fin}`:""}` :""}
            </div>
            {evento.lugar&&<div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>📍 {evento.lugar}</div>}
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#94A3B8",flexShrink:0}}>x</button>
        </div>

        {cargando&&<div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Cargando...</div>}

        {!cargando&&(
          <>
            {misHijosEnCurso.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Tu asistencia</div>
                {misHijosEnCurso.map(hid=>{
                  const al  = hijosInfo[hid];
                  const est = asistencia[hid]||"pendiente";
                  return (
                    <div key={hid} style={{background:"#F8FAFC",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1.5px solid #E2E8F0"}}>
                      {misHijosEnCurso.length>1&&<div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:8}}>{al?.nombre} {al?.apellido}</div>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>responder(hid,"si")} style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${est==="si"?"#10B981":"#E2E8F0"}`,background:est==="si"?"#F0FDF4":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:est==="si"?"#10B981":"#94A3B8"}}>Voy</button>
                        <button onClick={()=>responder(hid,"no")} style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${est==="no"?"#EF4444":"#E2E8F0"}`,background:est==="no"?"#FEF2F2":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:est==="no"?"#EF4444":"#94A3B8"}}>No voy</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen del curso visible para todos */}
            {todosHijos.length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>
                  Resumen del curso · {confirmados.length} van · {noVan.length} no van · {pendientes.length} pendiente
                </div>
                {[{list:confirmados,label:"Confirman",color:"#10B981",bg:"#F0FDF4"},{list:pendientes,label:"Pendiente",color:"#F59E0B",bg:"#FFFBEB"},{list:noVan,label:"No van",color:"#EF4444",bg:"#FEF2F2"}].map(({list,label,color,bg})=>
                  list.length>0&&(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color,marginBottom:5}}>{label} ({list.length})</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {list.map(h=>(
                          <div key={h.id} style={{padding:"7px 10px",background:bg,borderRadius:9,display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:h.color||color,flexShrink:0}}/>
                            <div style={{fontSize:13,fontWeight:600}}>{h.nombre} {h.apellido}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {misHijosEnCurso.length===0&&!isAdmin&&(
              <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>No tenes hijos en este curso</div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
