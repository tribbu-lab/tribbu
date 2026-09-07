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


import { sendPush, getUserIdsByCurso } from "../../lib/push";

export function AdminPanel({ cursoId, cursoNombre }) {
  const [tab, setTab]   = useState("general");
  const [curso, setCurso] = useState(null);
  const [form, setForm]   = useState({monto_regalo:"",moneda_regalo:"$"});
  const [saving, setSaving] = useState(false);
  const [horarios,setHorarios] = useState([]);
  const [maestros,setMaestros] = useState([]);
  const [horForm,setHorForm]   = useState(null);
  const [horSaving,setHorSaving] = useState(false);
  const [alumnosRegalo,setAlumnosRegalo] = useState([]);
  const [cumpleMap,setCumpleMap]         = useState({});
  const [guardandoRegaloId,setGuardandoRegaloId] = useState(null);
  const [familias,setFamilias]     = useState([]);
  const [roomParents,setRoomParents] = useState([]);
  const [alertaModal,setAlertaModal] = useState(false);

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const nextBday = (fecha) => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const d = new Date(fecha+"T00:00:00");
    let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
    if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
    return Math.round((next - hoy) / (1000*60*60*24));
  };

  const cargarRegalos = async () => {
    const { data: al } = await supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id",cursoId).order("nombre");
    const conCumple = (al||[]).filter(a=>a.fecha_nacimiento).sort((a,b)=>nextBday(a.fecha_nacimiento)-nextBday(b.fecha_nacimiento));
    setAlumnosRegalo(conCumple);

    const { data: cu } = await supabase.from("cumples").select("*").eq("curso_id",cursoId).not("alumno_id","is",null);
    const responsableUids = [...new Set((cu||[]).map(c=>c.responsable_id).filter(Boolean))];
    let uidToHijo = {};
    if(responsableUids.length && conCumple.length) {
      const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("usuario_id",responsableUids).in("hijo_id", conCumple.map(a=>a.id));
      const hijoById = {}; conCumple.forEach(a=>{ hijoById[a.id]=a; });
      (uh||[]).forEach(r=>{ if(hijoById[r.hijo_id]) uidToHijo[r.usuario_id]=hijoById[r.hijo_id]; });
    }
    const map = {};
    (cu||[]).forEach(c=>{ if(c.alumno_id) map[c.alumno_id] = {...c, _responsable_hijo: uidToHijo[c.responsable_id]||null}; });
    setCumpleMap(map);
  };

  const asignarRegalo = async (alumnoId, responsableHijoId) => {
    setGuardandoRegaloId(alumnoId);
    let resolvedUserId = null;
    if(responsableHijoId) {
      const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id").eq("hijo_id",responsableHijoId).limit(1);
      resolvedUserId = uh?.[0]?.usuario_id || null;
    }
    const existente = cumpleMap[alumnoId];
    if(existente?.id) await supabase.from("cumples").update({responsable_id:resolvedUserId}).eq("id",existente.id);
    else if(resolvedUserId) await supabase.from("cumples").insert({curso_id:cursoId, alumno_id:alumnoId, responsable_id:resolvedUserId});
    await cargarRegalos();
    setGuardandoRegaloId(null);
  };

  const toggleComprado = async (alumnoId) => {
    const existente = cumpleMap[alumnoId];
    if(!existente?.id) return;
    await supabase.from("cumples").update({comprado:!existente.comprado}).eq("id",existente.id);
    cargarRegalos();
  };

  const cargar = async () => {
    const [c, hor, mae, hijosData, ucData] = await Promise.all([
      supabase.from("cursos").select("*").eq("id",cursoId).single(),
      supabase.from("horarios").select("*").eq("curso_id",cursoId).order("dia").order("hora_inicio"),
      supabase.from("maestros").select("id,nombre,materia").eq("activo",true),
      supabase.from("hijos").select("id,nombre,apellido").eq("curso_id",cursoId).order("apellido"),
      supabase.from("usuario_cursos").select("usuario_id, usuarios(nombre,apellido,email,telefono)").eq("curso_id",cursoId).eq("rol","admin"),
    ]);
    setCurso(c.data);
    setForm({monto_regalo:c.data?.monto_regalo||"",moneda_regalo:c.data?.moneda_regalo||"$"});
    setHorarios(hor.data||[]);
    setMaestros(mae.data||[]);
    setRoomParents((ucData.data||[]).map(r=>r.usuarios).filter(Boolean));

    const hijosCurso = hijosData.data||[];
    const hijoIds = hijosCurso.map(h=>h.id);
    const uh = hijoIds.length
      ? await supabase.from("usuario_hijos").select("hijo_id, usuarios(nombre,apellido,email,telefono)").in("hijo_id",hijoIds)
      : {data:[]};
    const apodPorHijo = new Map();
    for(const r of uh.data||[]) {
      if(!r.usuarios) continue;
      const arr = apodPorHijo.get(r.hijo_id)||[];
      arr.push(r.usuarios);
      apodPorHijo.set(r.hijo_id, arr);
    }
    setFamilias(hijosCurso.map(h=>({...h, apoderados: apodPorHijo.get(h.id)||[]})));
    cargarRegalos();
  };

  useEffect(()=>{ cargar(); },[cursoId]);

  const familiasSinRegistrar = familias.filter(f=>f.apoderados.length===0);

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoId);
    await supabase.from("alertas").insert({curso_id:cursoId, mensaje:msg, hora:"Ahora", activa:true});
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    setAlertaModal(false);
  };

  const guardarGeneral = async () => {
    setSaving(true);
    await supabase.from("cursos").update({monto_regalo:form.monto_regalo?Number(form.monto_regalo):null,moneda_regalo:form.moneda_regalo||"$"}).eq("id",cursoId);
    setSaving(false); cargar();
  };

  const guardarHorario = async () => {
    if(!horForm?.materia?.trim()||!horForm?.dia||!horForm?.hora_inicio||!horForm?.hora_fin) return;
    setHorSaving(true);
    const payload = {materia:horForm.materia.trim(),dia:horForm.dia,hora_inicio:horForm.hora_inicio,hora_fin:horForm.hora_fin,docente:horForm.docente||null,color:horForm.color||"#3B82F6",curso_id:cursoId};
    if(horForm.id) await supabase.from("horarios").update(payload).eq("id",horForm.id);
    else           await supabase.from("horarios").insert(payload);
    setHorSaving(false); setHorForm(null); cargar();
  };

  const eliminarHorario = async (id) => {
    await supabase.from("horarios").delete().eq("id",id);
    cargar();
  };

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Admin</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:16}}>{cursoNombre}</div>

      <button onClick={()=>setAlertaModal(true)} style={{width:"100%",minHeight:52,display:"flex",alignItems:"center",gap:10,borderRadius:14,background:"#FEF2F2",border:"1.5px solid #FCA5A5",padding:"0 16px",cursor:"pointer",marginBottom:16}}>
        <span style={{fontSize:20}}>🚨</span>
        <span style={{fontSize:13.5,fontWeight:700,color:"#DC2626"}}>Publicar alerta urgente al curso</span>
      </button>
      {alertaModal&&<AlertaModal onClose={()=>setAlertaModal(false)} onEnviar={enviarAlerta}/>}

      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {[{id:"general",l:"General"},{id:"horarios",l:"Horarios"},{id:"familias",l:"Familias"},{id:"regalos",l:"🎁 Regalos"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:tab===t.id?"#0F172A":"#F1F5F9",color:tab===t.id?"white":"#64748B"}}>{t.l}</button>
        ))}
      </div>

      {tab==="general"&&(
        <Card style={{padding:20}}>
          <div style={{fontSize:14,fontWeight:800,marginBottom:14}}>Configuracion de regalos</div>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONEDA</div>
            <div style={{display:"flex",gap:8}}>
              {["$","USD"].map(m=>(
                <button key={m} onClick={()=>setForm(p=>({...p,moneda_regalo:m}))} style={{padding:"7px 20px",borderRadius:10,border:`2px solid ${form.moneda_regalo===m?"#3B82F6":"#E2E8F0"}`,background:form.moneda_regalo===m?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:form.moneda_regalo===m?"#3B82F6":"#94A3B8"}}>{m}</button>
              ))}
            </div>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONTO SUGERIDO POR FAMILIA</div>
            <input type="number" value={form.monto_regalo} onChange={e=>setForm(p=>({...p,monto_regalo:e.target.value}))} placeholder="Ej: 2000" style={inp}/>
          </div>
          {form.monto_regalo&&familias.length>0&&(
            <div style={{fontSize:12.5,color:"#3B82F6",fontWeight:600,marginBottom:16,lineHeight:1.5}}>
              Con {familias.length} familia{familias.length!==1?"s":""}, la colecta junta {form.moneda_regalo} {(Number(form.monto_regalo)*familias.length).toLocaleString("es-AR")}
            </div>
          )}
          <button onClick={guardarGeneral} disabled={saving} style={{width:"100%",padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
        </Card>
      )}

      {tab==="horarios"&&(
        <div>
          {horForm!==null&&(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
              <Card style={{padding:24,width:"100%",maxWidth:400}}>
                <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{horForm?.id?"Editar clase":"Nueva clase"}</div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>DIA</div>
                  <select value={horForm.dia||"Lunes"} onChange={e=>setHorForm(p=>({...p,dia:e.target.value}))} style={inp}>
                    {["Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"].map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",gap:10,marginBottom:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>HORA INICIO</div>
                    <input type="time" value={horForm.hora_inicio||""} onChange={e=>setHorForm(p=>({...p,hora_inicio:e.target.value}))} style={inp}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>HORA FIN</div>
                    <input type="time" value={horForm.hora_fin||""} onChange={e=>setHorForm(p=>({...p,hora_fin:e.target.value}))} style={inp}/>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MATERIA</div>
                  <input value={horForm.materia||""} onChange={e=>setHorForm(p=>({...p,materia:e.target.value}))} placeholder="Ej: Matematicas" style={inp}/>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>DOCENTE</div>
                  <select value={horForm.docente||""} onChange={e=>setHorForm(p=>({...p,docente:e.target.value}))} style={inp}>
                    <option value="">-- Sin asignar --</option>
                    {maestros.map(m=><option key={m.id} value={m.nombre}>{m.nombre}{m.materia?" - "+m.materia:""}</option>)}
                  </select>
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}}>COLOR</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899","#06B6D4","#6366F1"].map(c=>(
                      <button key={c} onClick={()=>setHorForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:8,background:c,border:horForm.color===c?"3px solid #0F172A":"2px solid transparent",cursor:"pointer"}}/>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>setHorForm(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
                  <button onClick={guardarHorario} disabled={horSaving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{horSaving?"Guardando...":"Guardar clase"}</button>
                </div>
              </Card>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700}}>Horario de clases</div>
            <button onClick={()=>setHorForm({dia:"Lunes",hora_inicio:"08:00",hora_fin:"09:00",materia:"",docente:"",color:"#3B82F6"})} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nueva clase</button>
          </div>
          {horarios.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Sin clases cargadas</div>}
          {["Lunes","Martes","Miercoles","Jueves","Viernes","Sabado"].map(dia=>{
            const items = horarios.filter(h=>h.dia===dia);
            if(!items.length) return null;
            return (
              <div key={dia} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{dia}</div>
                {items.map(h=>(
                  <div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#F8FAFC",borderRadius:9,marginBottom:5,border:"1px solid #E2E8F0"}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:h.color||"#3B82F6",flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <span style={{fontSize:13,fontWeight:600}}>{h.materia}</span>
                      {h.docente&&<span style={{fontSize:11,color:"#94A3B8",marginLeft:8}}>{h.docente}</span>}
                    </div>
                    <span style={{fontSize:11,color:"#64748B",whiteSpace:"nowrap"}}>{h.hora_inicio?.slice(0,5)} - {h.hora_fin?.slice(0,5)}</span>
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>setHorForm(h)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>Editar</button>
                      <button onClick={()=>eliminarHorario(h.id)} style={{padding:"3px 8px",borderRadius:6,border:"none",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444"}}>Borrar</button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tab==="familias"&&(
        <div>
          <Card style={{padding:20,marginBottom:18}}>
            <div style={{fontSize:14,fontWeight:800,marginBottom:12}}>Room Parents del curso</div>
            {roomParents.length===0
              ? <div style={{fontSize:13,color:"#94A3B8"}}>Sin Room Parents asignados</div>
              : roomParents.map((r,i)=>(
                  <div key={i} style={{fontSize:13,color:"#1E293B",marginBottom:6}}>{fmtNombre(r)} · {r.email}</div>
                ))
            }
          </Card>

          <div style={{fontSize:14,fontWeight:700,marginTop:4,marginBottom:2}}>
            Familias sin registrar{familiasSinRegistrar.length?` · ${familiasSinRegistrar.length}`:""}
          </div>
          <div style={{fontSize:12,color:"#94A3B8",lineHeight:1.5,marginBottom:12}}>
            Alumnos del curso a los que todavía ningún apoderado se vinculó con el código de invitación.
          </div>
          {familiasSinRegistrar.length===0 ? (
            <Card style={{padding:20}}>
              <div style={{fontSize:13,color:"#94A3B8",textAlign:"center"}}>Todas las familias ya se registraron ✨</div>
            </Card>
          ) : (
            familiasSinRegistrar.map(f=>(
              <div key={f.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"white",borderRadius:10,border:"1px solid #E2E8F0",padding:"10px 14px",marginBottom:6}}>
                <span style={{fontSize:13,fontWeight:600,color:"#0F172A"}}>{fmtNombre(f)}</span>
                <span style={{fontSize:11,fontWeight:700,color:"#B45309",background:"#FFFBEB",padding:"3px 8px",borderRadius:20}}>Sin registrar</span>
              </div>
            ))
          )}
        </div>
      )}

      {tab==="regalos"&&(
        <div>
          <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:16,lineHeight:1.5}}>Asigná qué familia le regala a cada compañero — ordenado por el próximo cumpleaños. Se guarda solo, sin ventanas: elegí en el desplegable de cada fila.</div>
          {alumnosRegalo.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Ningún alumno del curso tiene fecha de nacimiento cargada.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {alumnosRegalo.map(a=>{
              const cumple = cumpleMap[a.id];
              const dias = nextBday(a.fecha_nacimiento);
              const bl = dias===0?{l:"Hoy",c:"#EF4444"}:dias===1?{l:"Mañana",c:"#F59E0B"}:dias<=7?{l:`${dias}d`,c:"#F59E0B"}:{l:`${dias}d`,c:"#94A3B8"};
              const guardando = guardandoRegaloId===a.id;
              return (
                <Card key={a.id} style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:12,opacity:guardando?0.6:1}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:(a.color||"#3B82F6")+"1F",color:a.color||"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{a.nombre?.slice(0,1)}{a.apellido?.slice(0,1)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:700,color:"#0F172A"}}>{fmtNombre(a)}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}<span style={{marginLeft:6,fontWeight:700,color:bl.c}}>{bl.l}</span></div>
                  </div>
                  <select
                    value={cumple?._responsable_hijo?.id||""}
                    onChange={e=>asignarRegalo(a.id, e.target.value||null)}
                    disabled={guardando}
                    style={{...inp,width:190,marginBottom:0}}
                  >
                    <option value="">— Sin asignar —</option>
                    {alumnosRegalo.filter(x=>x.id!==a.id).map(x=>(
                      <option key={x.id} value={x.id}>{fmtNombre(x)}</option>
                    ))}
                  </select>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11.5,color:cumple?.id?"#64748B":"#CBD5E1",whiteSpace:"nowrap",cursor:cumple?.id?"pointer":"default"}}>
                    <input type="checkbox" checked={!!cumple?.comprado} disabled={!cumple?.id} onChange={()=>toggleComprado(a.id)}/>
                    Comprado
                  </label>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function AlertaModal({ onClose, onEnviar }) {
  const [msg,setMsg]=useState(""); const [sent,setSent]=useState(false);
  const SUGS=["🚫 Mañana NO hay clases","⚠️ Reunión urgente hoy 18hs","🌧️ Salida cancelada por lluvia","📢 El colegio cierra a las 12hs hoy"];
  const enviar=async()=>{ if(!msg.trim())return; await new Promise(r=>setTimeout(r,400)); onEnviar(msg.trim()); setSent(true); };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:"white",borderRadius:22,padding:"28px 24px",width:"100%",maxWidth:440}} onClick={e=>e.stopPropagation()}>
        {sent ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:50}}>📣</div>
            <div style={{fontSize:18,fontWeight:900,marginTop:12}}>¡Alerta enviada!</div>
            <button onClick={onClose} style={{marginTop:20,padding:"10px 30px",borderRadius:10,border:"none",cursor:"pointer",background:"#3B82F6",color:"white",fontSize:14,fontWeight:700}}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:44,height:44,borderRadius:14,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🚨</div>
              <div style={{flex:1}}><div style={{fontSize:17,fontWeight:900}}>Alerta a la comunidad</div><div style={{fontSize:12,color:"#94A3B8"}}>Solo para avisos urgentes</div></div>
              <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
              {SUGS.map((s,i)=><button key={i} onClick={()=>setMsg(s)} style={{textAlign:"left",padding:"9px 13px",borderRadius:11,border:`1.5px solid ${msg===s?"#3B82F6":"#E2E8F0"}`,background:msg===s?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:msg===s?700:500,color:msg===s?"#3B82F6":"#0F172A"}}>{s}</button>)}
            </div>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="O escribí un mensaje propio..." style={{width:"100%",border:"1.5px solid #E2E8F0",borderRadius:11,padding:"10px 12px",fontSize:13,resize:"none",height:70,boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
            <button onClick={enviar} disabled={!msg.trim()} style={{width:"100%",marginTop:10,padding:13,borderRadius:11,border:"none",cursor:msg.trim()?"pointer":"default",background:msg.trim()?"linear-gradient(135deg,#EF4444,#B91C1C)":"#E2E8F0",color:msg.trim()?"white":"#94A3B8",fontSize:14,fontWeight:800}}>🚨 Enviar alerta urgente</button>
          </>
        )}
      </div>
      
    </div>
  );
}
