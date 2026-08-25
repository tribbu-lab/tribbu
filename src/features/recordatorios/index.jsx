// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre, fmtRangoHora,
         sanitize, safeUrl, getHijoColor, setHijoColor } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useListControls } from "../../hooks/useListControls";


import { sendPush, getUserIdsByCurso } from "../../lib/push";

export function RecordatoriosTab({ cursoId, cursoIds=[], esVistaTodos=false, tagDeCurso=null, cursosAdmin=[], userId, isAdmin, isSuper=false, active, onBadgeChange }) {
  const [recordatorios, setRecordatorios] = useState([]);
  const [leidosSet,     setLeidosSet]     = useState(new Set());
  const [modal,         setModal]         = useState(null);
  const [form,          setForm]          = useState({texto:"",fecha:"",prioridad:"media",urgente:false,adjuntos:[],curso_id:null});
  const [saving,        setSaving]        = useState(false);
  const [subiendoAdj,   setSubiendoAdj]   = useState(false);
  const [alerta,        setAlerta]        = useState(null);
  const [alertaModal,   setAlertaModal]   = useState(false);
  const [filtroRango,   setFiltroRango]   = useState("all");
  const [filtroDesde,   setFiltroDesde]   = useState("");
  const [filtroHasta,   setFiltroHasta]   = useState("");
  const [filtroPrio,    setFiltroPrio]    = useState("all");
  const [filtroLeido,   setFiltroLeido]   = useState("all");
  const [filtroOrigen,  setFiltroOrigen]  = useState("all");
  const [pagina,        setPagina]        = useState(1);
  const POR_PAG = 10;

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const PRIO = { alta:{l:"Alta",c:"#EF4444",bg:"#FEF2F2"}, media:{l:"Media",c:"#F59E0B",bg:"#FFFBEB"}, baja:{l:"Baja",c:"#10B981",bg:"#F0FDF4"} };
  const hoyStr = new Date().toISOString().split("T")[0];

  // Opciones de curso destino para el alta en vista "Todos" (label = hijo/s).
  const cursosOpciones = esVistaTodos
    ? cursoIds.map(cid=>({curso_id:cid, tag:tagDeCurso?.(cid)})).filter(o=>o.tag)
    : [];

  const cargar = async () => {
    if(!cursoIds?.length) return;
    const [recs, leidos, al] = await Promise.all([
      supabase.from("recordatorios").select("*").in("curso_id",cursoIds).order("creado_en",{ascending:false}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",userId) : Promise.resolve({data:[]}),
      cursoId
        ? supabase.from("alertas").select("*").eq("curso_id",cursoId).eq("activa",true).order("creado_en",{ascending:false}).limit(1)
        : Promise.resolve({data:[]}),
    ]);
    setRecordatorios(recs.data||[]);
    setLeidosSet(new Set((leidos.data||[]).map(r=>r.recordatorio_id)));
    setAlerta((al.data||[])[0]||null);
  };

  useEffect(()=>{ cargar(); },[cursoIds]);
  useEffect(()=>{ if(active) cargar(); },[active]);

  const esPropio = (r) => r.creado_por === userId;
  // En vista "Todos" el permiso se resuelve contra el rol en el curso de la fila.
  const puedeEditar = (r) => esVistaTodos ? (esPropio(r) || cursosAdmin.includes(r.curso_id)) : (isAdmin || esPropio(r));

  const guardar = async () => {
    if(!form.texto?.trim()) return;
    // En vista "Todos" el alta exige un curso destino elegido en el modal.
    const cursoDestino = cursoId || form.curso_id;
    if(!modal?.id && !cursoDestino) return;
    setSaving(true);
    const payload = { texto:sanitize(form.texto), fecha:form.fecha||null, prioridad:form.prioridad||"media", urgente:form.urgente||false, adjuntos:form.adjuntos||[], curso_id:cursoDestino };
    if(modal?.id) {
      // Al editar no se pisa curso_id: en vista "Todos" la fila puede ser de
      // otro curso y el payload la movería.
      const { curso_id:_cid, ...upd } = payload;
      await supabase.from("recordatorios").update(upd).eq("id",modal.id);
    } else {
      await supabase.from("recordatorios").insert({...payload, creado_por:userId});
      if(isAdmin) {
        const userIds = await getUserIdsByCurso(cursoDestino);
        await sendPush({ type:"recordatorio", payload:{ titulo:form.texto, userIds } });
      }
    }
    setSaving(false); setModal(null); cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id",id);
    await supabase.from("recordatorios").delete().eq("id",id);
    cargar();
  };

  const marcarLeido = async (id) => {
    if(!userId) return;
    const nid = id;
    if(leidosSet.has(nid)) {
      await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id",nid).eq("usuario_id",userId);
      setLeidosSet(p=>{ const n=new Set(p); n.delete(nid); return n; });
    } else {
      await supabase.from("recordatorio_leidos").upsert({recordatorio_id:nid,usuario_id:userId},{onConflict:"recordatorio_id,usuario_id"});
      setLeidosSet(p=>new Set([...p,nid]));
      onBadgeChange?.();
    }
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoId);
    await supabase.from("alertas").insert({curso_id:cursoId,mensaje:msg,hora:"Ahora",activa:true});
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    cargar();
  };

  const dismissAlerta = async () => {
    if(alerta){ await supabase.from("alertas").update({activa:false}).eq("id",alerta.id); cargar(); }
  };

  const filtrados = recordatorios.filter(r=>{
    // Ocultar recordatorios de regalo (se manejan aparte). Los de colecta (colecta_vence) sí se muestran.
    if(r.tipo==="regalo_cumple") return false;
    if(filtroRango==="proximos" && r.fecha && r.fecha < hoyStr) return false;
    if(filtroRango==="pasados"  && (!r.fecha || r.fecha >= hoyStr)) return false;
    if(filtroRango==="personalizado"){
      if(filtroDesde && r.fecha && r.fecha < filtroDesde) return false;
      if(filtroHasta && r.fecha && r.fecha > filtroHasta) return false;
      if(filtroDesde && !r.fecha) return false;
    }
    if(filtroPrio!=="all" && r.prioridad!==filtroPrio) return false;
    if(filtroLeido==="leidos"   && !leidosSet.has(r.id)) return false;
    if(filtroLeido==="noleidos" &&  leidosSet.has(r.id)) return false;
    if(filtroOrigen==="colegio" && !r.grupo_id) return false;
    if(filtroOrigen==="normal"  &&  r.grupo_id) return false;
    return true;
  }).sort((a,b)=> (b.creado_en||"").localeCompare(a.creado_en||""));

  const totalPags = Math.max(1,Math.ceil(filtrados.length/POR_PAG));
  const pagina_ = Math.min(pagina,totalPags);
  const visible = filtrados.slice((pagina_-1)*POR_PAG, pagina_*POR_PAG);

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Recordatorios</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:16}}>Avisos y recordatorios del curso</div>

      {isSuper&&(
        <div style={{marginBottom:16}}>
          {alerta?(
            <div style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <span style={{fontSize:20}}>🚨</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",marginBottom:2}}>Alerta activa</div>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{alerta.mensaje}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setAlertaModal(true)} style={{padding:"5px 10px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.2)",color:"white",cursor:"pointer",fontSize:11,fontWeight:700}}>Editar</button>
                <button onClick={dismissAlerta} style={{padding:"5px 10px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"white",cursor:"pointer",fontSize:11,fontWeight:700}}>x</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setAlertaModal(true)} style={{width:"100%",padding:"12px 16px",borderRadius:14,border:"2px dashed #FCA5A5",background:"#FFF1F2",color:"#EF4444",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:18}}>🚨</span>
              <div style={{textAlign:"left"}}>
                <div>Enviar alerta a toda la comunidad</div>
                <div style={{fontSize:11,fontWeight:500,color:"#F87171"}}>Solo para avisos urgentes</div>
              </div>
            </button>
          )}
          {alertaModal&&<AlertaModal onClose={()=>setAlertaModal(false)} onEnviar={msg=>{enviarAlerta(msg);setAlertaModal(false);}}/>}
        </div>
      )}

      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{minHeight:"100%",display:"flex",alignItems:"center",justifyContent:"center",padding:20,boxSizing:"border-box"}}>
          <Card style={{padding:24,width:"100%",maxWidth:420}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:14}}>{modal?.id?"Editar recordatorio":"Nuevo recordatorio"}</div>
            {!modal?.id&&cursosOpciones.length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PARA EL CURSO DE</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {cursosOpciones.map(o=>{
                    const act = form.curso_id===o.curso_id;
                    return (
                      <button key={o.curso_id} onClick={()=>setForm(p=>({...p,curso_id:o.curso_id}))} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:`1.5px solid ${act?"#3B82F6":"#E2E8F0"}`,background:act?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:act?"#3B82F6":"#94A3B8"}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:o.tag.color,display:"inline-block"}}/>
                        {o.tag.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>TEXTO</div>
              <textarea value={form.texto} onChange={e=>setForm(p=>({...p,texto:e.target.value}))} placeholder="Ej: Reunion de padres el viernes" rows={3} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>FECHA (opcional)</div>
              <input type="date" value={form.fecha||""} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PRIORIDAD</div>
              <div style={{display:"flex",gap:6}}>
                {["alta","media","baja"].map(p=>(
                  <button key={p} onClick={()=>setForm(f=>({...f,prioridad:p}))} style={{flex:1,padding:"7px 0",borderRadius:8,border:`1.5px solid ${form.prioridad===p?PRIO[p].c:"#E2E8F0"}`,background:form.prioridad===p?PRIO[p].bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.prioridad===p?PRIO[p].c:"#94A3B8"}}>{PRIO[p].l}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <button onClick={()=>setForm(p=>({...p,urgente:!p.urgente}))} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${form.urgente?"#EF4444":"#E2E8F0"}`,background:form.urgente?"#FEF2F2":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.urgente?"#EF4444":"#94A3B8"}}>
                {form.urgente?"Urgente":"Marcar urgente"}
              </button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>ADJUNTOS (opcional)</div>
              <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId={cursoId||form.curso_id} onUploadingChange={setSubiendoAdj}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving||subiendoAdj} style={{flex:2,padding:11,borderRadius:10,border:"none",background:subiendoAdj?"#93C5FD":"#3B82F6",color:"white",cursor:subiendoAdj?"default":"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:filtroRango==="personalizado"?8:12,flexWrap:"wrap",alignItems:"center"}}>
        <select value={filtroRango} onChange={e=>{setFiltroRango(e.target.value);setPagina(1);}} style={{padding:"7px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:600,background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
          <option value="all">Todos</option>
          <option value="proximos">Proximos</option>
          <option value="pasados">Pasados</option>
          <option value="personalizado">Personalizado</option>
        </select>
        <select value={filtroPrio} onChange={e=>{setFiltroPrio(e.target.value);setPagina(1);}} style={{padding:"7px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:600,background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
          <option value="all">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <select value={filtroLeido} onChange={e=>{setFiltroLeido(e.target.value);setPagina(1);}} style={{padding:"7px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:600,background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
          <option value="all">Leídos y no leídos</option>
          <option value="noleidos">Sin leer</option>
          <option value="leidos">Leídos</option>
        </select>
        <select value={filtroOrigen} onChange={e=>{setFiltroOrigen(e.target.value);setPagina(1);}} style={{padding:"7px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:600,background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
          <option value="all">Todos los orígenes</option>
          <option value="colegio">🏫 Comunicaciones del colegio</option>
          <option value="normal">Recordatorios normales</option>
        </select>
        <button onClick={()=>{setModal({});setForm({texto:"",fecha:"",prioridad:"media",urgente:false,adjuntos:[],curso_id:cursoId||cursoIds[0]||null});}} style={{marginLeft:"auto",padding:"7px 16px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nuevo</button>
      </div>
      {filtroRango==="personalizado"&&(
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748B",fontWeight:600}}>Desde</span>
            <input type="date" value={filtroDesde} onChange={e=>{setFiltroDesde(e.target.value);setPagina(1);}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",fontFamily:"inherit",background:"white"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748B",fontWeight:600}}>Hasta</span>
            <input type="date" value={filtroHasta} onChange={e=>{setFiltroHasta(e.target.value);setPagina(1);}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",fontFamily:"inherit",background:"white"}}/>
          </div>
          {(filtroDesde||filtroHasta)&&<button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,color:"#94A3B8"}}>Limpiar</button>}
        </div>
      )}

      {visible.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"#94A3B8",fontSize:13}}>Sin recordatorios</div>}
      {visible.map(r=>{
        const prio = PRIO[r.prioridad||"media"];
        const esLeido = leidosSet.has(r.id);
        const dias = r.fecha ? Math.round((new Date(r.fecha+"T00:00:00")-new Date().setHours(0,0,0,0))/86400000) : null;
        const diasLabel = dias===null ? null : dias===0 ? "hoy" : dias===1 ? "manana" : dias<0 ? `hace ${Math.abs(dias)}d` : `en ${dias}d`;
        return (
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:0,padding:"11px 14px",marginBottom:6,borderRadius:12,background:"white",border:"1px solid #E2E8F0",opacity:esLeido?0.55:1,borderLeft:`3px solid ${r.urgente?"#EF4444":prio.c}`}}>
            <div style={{width:72,flexShrink:0,marginRight:12,textAlign:"center"}}>
              {r.fecha?(
                <>
                  <div style={{fontSize:18,fontWeight:900,color:"#0F172A",lineHeight:1}}>{new Date(r.fecha+"T00:00:00").getDate()}</div>
                  <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase"}}>{new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{month:"short"})}</div>
                  {diasLabel&&<div style={{fontSize:9,fontWeight:700,marginTop:2,color:dias<0?"#94A3B8":dias<=3?"#EF4444":"#10B981",background:dias<0?"#F8FAFC":dias<=3?"#FEF2F2":"#F0FDF4",borderRadius:6,padding:"1px 4px"}}>{diasLabel}</div>}
                </>
              ):(
                <div style={{fontSize:10,color:"#CBD5E1",fontWeight:600}}>--</div>
              )}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:esLeido?400:600,color:esLeido?"#94A3B8":"#0F172A",lineHeight:1.4}}>{r.texto}</div>
              <div style={{display:"flex",gap:5,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                {tagDeCurso?.(r.curso_id)&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#F1F5F9",color:"#64748B",whiteSpace:"nowrap"}}><span style={{width:8,height:8,borderRadius:"50%",background:tagDeCurso(r.curso_id).color,display:"inline-block"}}/>{tagDeCurso(r.curso_id).nombre}</span>}
                {r.grupo_id&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#EEF2FF",color:"#6366F1",whiteSpace:"nowrap"}}>🏫 Comunicación del colegio</span>}
                {fmtRangoHora(r.hora_inicio,r.hora_fin)&&<span style={{fontSize:10,fontWeight:700,color:"#94A3B8",whiteSpace:"nowrap"}}>🕐 {fmtRangoHora(r.hora_inicio,r.hora_fin)}</span>}
                {r.tipo==="regalo_cumple"
                  ? <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#FDF4FF",color:"#8B5CF6"}}>Regalo</span>
                  : r.tipo==="colecta_vence"
                  ? <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#EFF6FF",color:"#3B82F6"}}>💳 Colecta</span>
                  : <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:prio.bg,color:prio.c}}>{prio.l}</span>
                }
                {r.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"2px 7px",borderRadius:8}}>Urgente</span>}
              </div>
              <AdjuntosList adjuntos={r.adjuntos}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0,marginLeft:8,alignItems:"flex-end"}}>
              {r.tipo==="regalo_cumple"&&!esLeido ? (
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>marcarLeido(r.id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #BBF7D0",background:"#F0FDF4",cursor:"pointer",fontSize:11,fontWeight:700,color:"#10B981",whiteSpace:"nowrap"}}>Si</button>
                  <button onClick={()=>{}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:600,color:"#94A3B8",whiteSpace:"nowrap"}}>No</button>
                </div>
              ) : (
                <button onClick={()=>marcarLeido(r.id)} style={{padding:"5px 8px",borderRadius:8,border:`1px solid ${esLeido?"#10B981":"#E2E8F0"}`,background:esLeido?"#F0FDF4":"white",cursor:"pointer",fontSize:11,fontWeight:700,color:esLeido?"#10B981":"#64748B"}}>{esLeido?"Leido":"Leido"}</button>
              )}
              {puedeEditar(r)&&r.tipo!=="regalo_cumple"&&r.tipo!=="colecta_vence"&&<div style={{display:"flex",gap:4}}>
                <button onClick={()=>{setModal(r);setForm({texto:r.texto||"",fecha:r.fecha||"",prioridad:r.prioridad||"media",urgente:r.urgente||false,adjuntos:r.adjuntos||[]});}} style={{padding:"5px 7px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>Editar</button>
                <button onClick={()=>eliminar(r.id)} style={{padding:"5px 7px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Borrar</button>
              </div>}
              {isAdmin&&(r.tipo==="regalo_cumple"||r.tipo==="colecta_vence")&&<div style={{display:"flex",gap:4}}>
                <button onClick={()=>eliminar(r.id)} style={{padding:"5px 7px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Borrar</button>
              </div>}
            </div>
          </div>
        );
      })}

      {totalPags>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16}}>
          <button onClick={()=>setPagina(p=>Math.max(1,p-1))} disabled={pagina_===1} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:pagina_===1?"default":"pointer",fontSize:12,color:pagina_===1?"#CBD5E1":"#0F172A"}}>Ant</button>
          <span style={{fontSize:12,color:"#64748B"}}>Pag {pagina_} de {totalPags}</span>
          <button onClick={()=>setPagina(p=>Math.min(totalPags,p+1))} disabled={pagina_===totalPags} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:pagina_===totalPags?"default":"pointer",fontSize:12,color:pagina_===totalPags?"#CBD5E1":"#0F172A"}}>Sig</button>
        </div>
      )}

      {/* ── Historial de comunicados ────────────────────────────────── */}
      <HistorialComunicados cursoIds={cursoIds} tagDeCurso={tagDeCurso} isAdmin={isAdmin} />
    </div>
  );
}

function HistorialComunicados({ cursoIds=[], tagDeCurso=null, isAdmin }) {
  const [alertas,    setAlertas]    = useState([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [abierto,    setAbierto]    = useState(false);
  const [cargando,   setCargando]   = useState(false);

  const cargar = async () => {
    if(!cursoIds?.length) return;
    setCargando(true);
    const { data } = await supabase
      .from("alertas")
      .select("*")
      .in("curso_id", cursoIds)
      .order("creado_en", { ascending: false })
      .limit(100);
    setAlertas(data||[]);
    setCargando(false);
  };

  const toggle = () => {
    if(!abierto && alertas.length === 0) cargar();
    setAbierto(p => !p);
  };

  const filtradas = alertas.filter(a =>
    !busqueda.trim() ||
    a.mensaje?.toLowerCase().includes(busqueda.toLowerCase())
  );

  const fmtFecha = (iso) => {
    if(!iso) return "";
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div style={{marginTop:24}}>
      <button
        onClick={toggle}
        style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"12px 16px",borderRadius:12,border:"1px solid #E2E8F0",
          background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#0F172A"}}
      >
        <span>📢 Historial de comunicados</span>
        <span style={{fontSize:16,color:"#94A3B8",transform:abierto?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
      </button>

      {abierto && (
        <div style={{marginTop:8}}>
          <input
            value={busqueda}
            onChange={e=>setBusqueda(e.target.value)}
            placeholder="Buscar en comunicados..."
            style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",
              fontSize:13,outline:"none",fontFamily:"inherit",background:"white",
              boxSizing:"border-box",marginBottom:10}}
          />

          {cargando && (
            <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Cargando...</div>
          )}

          {!cargando && filtradas.length === 0 && (
            <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>
              {busqueda ? "Sin resultados para esa búsqueda" : "Sin comunicados anteriores"}
            </div>
          )}

          {!cargando && filtradas.map(a => (
            <div key={a.id} style={{
              padding:"12px 14px", marginBottom:6, borderRadius:12,
              background: a.activa ? "linear-gradient(135deg,#FEF2F2,#FFF5F5)" : "white",
              border: `1px solid ${a.activa ? "#FCA5A5" : "#E2E8F0"}`,
              borderLeft: `3px solid ${a.activa ? "#EF4444" : "#CBD5E1"}`,
            }}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <span style={{fontSize:18,flexShrink:0}}>{a.activa ? "🚨" : "📢"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#0F172A",lineHeight:1.4,marginBottom:4}}>
                    {a.mensaje}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#94A3B8"}}>{fmtFecha(a.creado_en)}</span>
                    {tagDeCurso?.(a.curso_id) && (
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:10,fontWeight:700,color:"#64748B"}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:tagDeCurso(a.curso_id).color,display:"inline-block"}}/>
                        {tagDeCurso(a.curso_id).nombre}
                      </span>
                    )}
                    {a.activa && (
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,
                        background:"#FEE2E2",color:"#EF4444"}}>Activa</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
