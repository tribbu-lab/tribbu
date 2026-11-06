// @ts-nocheck
import { useState, useCallback } from "react";
import { Icono } from "../../components/Icono";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtNombre } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";


import { useCargar } from "../../hooks/useCargar";
import { useConfirmar } from "../../hooks/useConfirmar";
import { Buscador } from "../../components/Buscador";
import { candidatosRoomParent, filtrarCandidatos } from "../../lib/apoderados";

// Quiénes son Room Parent del curso y nombrar a otro entre sus apoderados.
function RoomParentsCurso({ cursoId }) {
  const [roomParents,setRoomParents] = useState([]);
  const [hijosCurso,setHijosCurso]   = useState([]);
  const [abierto,setAbierto]         = useState(false);
  const [busqueda,setBusqueda]       = useState("");
  const [error,setError]             = useState("");
  const [nombrandoId,setNombrandoId] = useState(null);
  const [confirmar,confirmUI]        = useConfirmar();

  const cargar = useCallback(async () => {
    const [rp, hi] = await Promise.all([
      supabase.from("usuario_cursos").select("usuario_id, usuarios(id,nombre,apellido)").eq("curso_id",cursoId).eq("rol","room"),
      supabase.from("hijos").select("nombre, usuario_hijos(usuarios(id,nombre,apellido,rol,activo))").eq("curso_id",cursoId),
    ]);
    setRoomParents((rp.data||[]).map(r=>r.usuarios).filter(Boolean));
    setHijosCurso(hi.data||[]);
  }, [cursoId]);
  useCargar(cargar);

  const candidatos = filtrarCandidatos(candidatosRoomParent(hijosCurso, roomParents.map(r=>r.id)), busqueda);

  const nombrar = async (c) => {
    const ok = await confirmar({
      titulo:`¿Nombrar a ${fmtNombre(c)} Room Parent?`,
      detalle:`${fmtNombre(c)} va a poder hacer lo mismo que vos en este curso. Para sacarlo, hay que pedírselo al colegio.`,
      textoConfirmar:"Nombrar",
      colorAccion:"#3B82F6",
    });
    if(!ok) return;
    setError(""); setNombrandoId(c.id);
    const { error: e } = await supabase.from("usuario_cursos").insert({usuario_id:c.id, curso_id:cursoId, rol:"room"});
    setNombrandoId(null);
    if(e) { setError("No se pudo nombrar. Probá de nuevo."); return; }
    setAbierto(false); setBusqueda("");
    cargar();
  };

  return (
    <Card style={{padding:20,marginBottom:20}}>
      {confirmUI}
      <div style={{fontSize:14,fontWeight:800,marginBottom:10}}>Room Parents del curso</div>
      {roomParents.map(r=>(
        <div key={r.id} style={{fontSize:13,color:"#1E293B",marginBottom:6}}>{fmtNombre(r)}</div>
      ))}
      {error?<div style={{fontSize:12.5,color:"#DC2626",marginTop:8}}>{error}</div>:null}
      {!abierto?(
        <button onClick={()=>setAbierto(true)} style={{marginTop:8,padding:"8px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontFamily:"inherit"}}>
          <span style={{fontSize:13,fontWeight:700,color:"#1D4ED8"}}>Nombrar a otro</span>
        </button>
      ):(
        <div style={{marginTop:12}}>
          <Buscador value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre o por hijo…"/>
          <div style={{marginTop:8,maxHeight:280,overflowY:"auto"}}>
            {candidatos.length===0?<div style={{fontSize:13,color:"#94A3B8",padding:"12px 0"}}>No hay apoderados para mostrar.</div>:null}
            {candidatos.map(c=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #F1F5F9"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:"#0F172A"}}>{fmtNombre(c)}</div>
                  <div style={{fontSize:11.5,color:"#94A3B8",marginTop:1}}>Familia de {c.hijos.join(" y ")}</div>
                </div>
                <button onClick={()=>nombrar(c)} disabled={nombrandoId===c.id} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"#EFF6FF",cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#1D4ED8"}}>{nombrandoId===c.id?"Nombrando…":"Nombrar"}</span>
                </button>
              </div>
            ))}
          </div>
          <button onClick={()=>{setAbierto(false);setBusqueda("");}} style={{marginTop:10,padding:"6px 0",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit"}}>
            <span style={{fontSize:12.5,fontWeight:600,color:"#64748B"}}>Cancelar</span>
          </button>
        </div>
      )}
    </Card>
  );
}

export function AdminPanel({ cursoId, cursoNombre }) {
  const [form, setForm]   = useState({monto_regalo:"",moneda_regalo:"$"});
  const [saving, setSaving] = useState(false);
  const [alumnosRegalo,setAlumnosRegalo] = useState([]);
  const [cumpleMap,setCumpleMap]         = useState({});
  const [guardandoRegaloId,setGuardandoRegaloId] = useState(null);

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const nextBday = (fecha) => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const d = new Date(fecha+"T00:00:00");
    let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
    if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
    return Math.round((next - hoy) / (1000*60*60*24));
  };

  const cargarRegalos = useCallback(async () => {
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
  }, [cursoId]);

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

  const cargar = useCallback(async () => {
    const [c] = await Promise.all([
      supabase.from("cursos").select("monto_regalo,moneda_regalo").eq("id",cursoId).single(),
      cargarRegalos(),
    ]);
    setForm({monto_regalo:c.data?.monto_regalo||"",moneda_regalo:c.data?.moneda_regalo||"$"});
  }, [cargarRegalos, cursoId]);
  useCargar(cargar);

  const guardarGeneral = async () => {
    setSaving(true);
    await supabase.from("cursos").update({monto_regalo:form.monto_regalo?Number(form.monto_regalo):null,moneda_regalo:form.moneda_regalo||"$"}).eq("id",cursoId);
    setSaving(false); cargar();
  };

  return (
    <div>
      <div style={{fontSize:24,fontWeight:800,marginBottom:4,letterSpacing:-0.3}}>Regalos y Room Parents</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:16}}>{cursoNombre}</div>

      <Card style={{padding:20,marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:800,marginBottom:4}}>Monto sugerido por cumple</div>
        <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:14,lineHeight:1.5}}>Lo que se sugiere gastar en cada regalo. Las familias lo ven en Cumpleaños.</div>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONEDA</div>
          <div style={{display:"flex",gap:8}}>
            {["$","USD"].map(m=>(
              <button key={m} onClick={()=>setForm(p=>({...p,moneda_regalo:m}))} style={{padding:"7px 20px",borderRadius:10,border:`2px solid ${form.moneda_regalo===m?"#3B82F6":"#E2E8F0"}`,background:form.moneda_regalo===m?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:form.moneda_regalo===m?"#3B82F6":"#94A3B8"}}>{m}</button>
            ))}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONTO</div>
          <input type="number" value={form.monto_regalo} onChange={e=>setForm(p=>({...p,monto_regalo:e.target.value}))} placeholder="Ej: 2000" style={inp}/>
        </div>
        <button onClick={guardarGeneral} disabled={saving} style={{width:"100%",padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
      </Card>

      <RoomParentsCurso key={cursoId} cursoId={cursoId}/>

      <div>
        <div style={{fontSize:14,fontWeight:800,marginBottom:4}}>Quién le regala a quién</div>
        <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:16,lineHeight:1.5}}>Elegí qué familia le regala a cada compañero, ordenado por el próximo cumpleaños. Se guarda solo.</div>
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
            <span style={{width:48,height:48,margin:"0 auto",borderRadius:"50%",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center"}}><Icono nombre="check" size={24} color="#475569"/></span>
            <div style={{fontSize:18,fontWeight:800,marginTop:12}}>Alerta enviada</div>
            <button onClick={onClose} style={{marginTop:20,padding:"10px 30px",borderRadius:10,border:"none",cursor:"pointer",background:"#3B82F6",color:"white",fontSize:14,fontWeight:700}}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:"#FEF2F2",display:"flex",alignItems:"center",justifyContent:"center"}}><Icono nombre="sirena" size={22} color="#DC2626"/></div>
              <div style={{flex:1}}><div style={{fontSize:17,fontWeight:900}}>Alerta a la comunidad</div><div style={{fontSize:12,color:"#94A3B8"}}>Solo para avisos urgentes</div></div>
              <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
              {SUGS.map((s,i)=><button key={i} onClick={()=>setMsg(s)} style={{textAlign:"left",padding:"9px 13px",borderRadius:11,border:`1.5px solid ${msg===s?"#3B82F6":"#E2E8F0"}`,background:msg===s?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:msg===s?700:500,color:msg===s?"#3B82F6":"#0F172A"}}>{s}</button>)}
            </div>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="O escribí un mensaje propio..." style={{width:"100%",border:"1.5px solid #E2E8F0",borderRadius:11,padding:"10px 12px",fontSize:13,resize:"none",height:70,boxSizing:"border-box",outline:"none",fontFamily:"inherit"}}/>
            <button onClick={enviar} disabled={!msg.trim()} style={{width:"100%",marginTop:10,padding:13,borderRadius:11,border:"none",cursor:msg.trim()?"pointer":"default",background:msg.trim()?"linear-gradient(135deg,#EF4444,#B91C1C)":"#E2E8F0",color:msg.trim()?"white":"#94A3B8",fontSize:14,fontWeight:800}}>Enviar alerta urgente</button>
          </>
        )}
      </div>
      
    </div>
  );
}
