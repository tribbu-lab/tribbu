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

export function Finanzas({ cursoId, cursoIds, esVistaTodos, tagDeCurso, userId, isAdmin, misHijos=[], openColectaId=null, onClearOpen }) {
  const [colectas,   setColectas]   = useState([]);
  const [alumnos,    setAlumnos]    = useState([]);
  const [usuarios,   setUsuarios]   = useState([]);
  const [pagos,      setPagos]      = useState([]); // todos los colecta_pagos del curso
  const [modal,      setModal]      = useState(null); // null | {} | {id,...}
  const [form,       setForm]       = useState({titulo:"",descripcion:"",monto_sugerido:"",moneda:"$",responsable_id:"",fecha_limite:""});
  const [saving,     setSaving]     = useState(false);
  const [vistaAdmin, setVistaAdmin] = useState(null); // colecta para ver detalle admin

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const cargar = async () => {
    if(!cursoIds?.length) return;
    // traer ids de colectas de los cursos del scope primero
const { data: colData } = await supabase.from("colectas").select("*").in("curso_id",cursoIds).order("vencimiento",{ascending:true}).order("id",{ascending:false});
    const colIds = (colData||[]).map(c=>c.id);

    // responsables de los cursos del scope
    const [alum, pag] = await Promise.all([
      supabase.from("hijos").select("id,nombre,apellido,color,curso_id").in("curso_id",cursoIds).order("nombre"),
      colIds.length
        ? supabase.from("colecta_pagos").select("*").in("colecta_id",colIds)
        : Promise.resolve({data:[]}),
    ]);
    const alumnosIds = (alum.data||[]).map(a=>a.id);
    const uidsSet = new Set();
    // Siempre incluir al usuario logueado (room parent puede asignarse a sí mismo)
    if(userId) uidsSet.add(userId);
    if(alumnosIds.length) {
      const { data: uhData } = await supabase.from("usuario_hijos").select("usuario_id").in("hijo_id", alumnosIds);
      (uhData||[]).forEach(r=>{ if(r.usuario_id) uidsSet.add(r.usuario_id); });
    }
    const uids = [...uidsSet];
    if(uids.length) {
      const { data: usData } = await supabase.from("usuarios").select("id,nombre,apellido,activo").in("id", uids);
      setUsuarios(usData||[]);
    }
    setColectas(colData||[]);
    setAlumnos(alum.data||[]);
    setPagos(pag.data||[]);
  };

  useEffect(()=>{ cargar(); },[cursoIds?.join(",")]);
  useEffect(()=>{
    if(openColectaId && colectas.length) {
      const c = colectas.find(x=>x.id===openColectaId);
      if(c){ setVistaAdmin(c); onClearOpen?.(); }
    }
  },[openColectaId, colectas]);

  const guardar = async () => {
    if(!form.titulo?.trim()) return;
    setSaving(true);
    const payload = {
      titulo:         form.titulo.trim(),
      tipo:           "colecta",
      descripcion:    form.descripcion?.trim()||null,
      monto_sugerido: form.monto_sugerido ? Number(form.monto_sugerido) : null,
      moneda:         form.moneda||"$",
      responsable_id: form.responsable_id ? form.responsable_id : null,
      fecha_limite:   form.fecha_limite||null,
      vencimiento:    form.fecha_limite||new Date().toISOString().slice(0,10),
      // Al editar, conservar el curso de la colecta; el cursoId de sesión solo
      // aplica al crear (acción admin, nunca disponible en vista Todos)
      curso_id:       modal?.id ? modal.curso_id : cursoId,
      activa:         true,
    };
    let err;
    if(modal?.id) { const r = await supabase.from("colectas").update(payload).eq("id",modal.id); err=r.error; }
    else {
      const r = await supabase.from("colectas").insert(payload).select().single(); err=r.error;
      if(!err) {
        const nuevaColecta = r.data;
        // Recordatorio para los apoderados del curso — persiste hasta que cada uno lo marca leído
        if(nuevaColecta?.id) {
          const montoTxt = payload.monto_sugerido ? ` — ${payload.moneda||"$"} ${Number(payload.monto_sugerido).toLocaleString("es-AR")}` : "";
          const vencTxt  = payload.fecha_limite ? ` · vence ${fmtF(payload.fecha_limite)}` : "";
          await supabase.from("recordatorios").insert({
            curso_id:   nuevaColecta.curso_id,
            tipo:       "colecta_vence",
            ref_id:     nuevaColecta.id,
            texto:      `Colecta "${payload.titulo}"${montoTxt}${vencTxt}. Recordá abonar.`,
            fecha:      payload.fecha_limite || null,
            prioridad:  "media",
            urgente:    false,
            creado_por: userId,
          });
        }
        const userIds = await getUserIdsByCurso(nuevaColecta?.curso_id ?? cursoId);
        await sendPush({ type:"colecta", payload:{ descripcion:form.titulo||form.descripcion||"Nueva colecta", userIds } });
      }
    }
    if(err) { console.error("colectas error:", JSON.stringify(err)); setSaving(false); return; }
    setSaving(false); setModal(null); cargar();
  };

  const toggleActiva = async (c) => {
    await supabase.from("colectas").update({activa:!c.activa}).eq("id",c.id);
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("colecta_pagos").delete().eq("colecta_id",id);
    // Borrar los "leídos" de los recordatorios de esta colecta antes de borrar los recordatorios
    const { data: recsCol } = await supabase.from("recordatorios").select("id").eq("ref_id",id).eq("tipo","colecta_vence");
    const recIds = (recsCol||[]).map(r=>r.id);
    if(recIds.length) await supabase.from("recordatorio_leidos").delete().in("recordatorio_id",recIds);
    await supabase.from("recordatorios").delete().eq("ref_id",id).eq("tipo","colecta_vence");
    await supabase.from("colectas").delete().eq("id",id);
    cargar();
  };

  const togglePago = async (colectaId, alumnoId, estadoActual) => {
    const nuevoEstado = estadoActual==="pagado" ? "pendiente" : "pagado";
    const fecha_pago  = nuevoEstado==="pagado" ? new Date().toISOString().slice(0,10) : null;
    // Actualización optimista — UI responde inmediatamente
    setPagos(prev => {
      const idx = prev.findIndex(p=>p.colecta_id===colectaId&&p.alumno_id===alumnoId);
      if(idx>=0) {
        const updated = [...prev];
        updated[idx] = {...updated[idx], estado:nuevoEstado, fecha_pago};
        return updated;
      }
      return [...prev, {colecta_id:colectaId, alumno_id:alumnoId, estado:nuevoEstado, fecha_pago, pagado_por:userId}];
    });
    // Sync con Supabase en background
    const { data: existe } = await supabase.from("colecta_pagos")
      .select("id").eq("colecta_id",colectaId).eq("alumno_id",alumnoId).maybeSingle();
    if(existe?.id) {
      await supabase.from("colecta_pagos").update({estado:nuevoEstado,fecha_pago,pagado_por:userId}).eq("id",existe.id);
    } else {
      await supabase.from("colecta_pagos").insert({colecta_id:colectaId,alumno_id:alumnoId,estado:nuevoEstado,fecha_pago,pagado_por:userId});
    }
  };

  const getPago = (colectaId, alumnoId) =>
    pagos.find(p=>p.colecta_id===colectaId&&p.alumno_id===alumnoId);

  const fmtM = (n, moneda="$") => n!=null ? `${moneda} ${Number(n).toLocaleString("es-AR")}` : "";

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Colectas</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>{esVistaTodos?"Colectas de todos tus cursos":"Colectas del curso"}</div>

      {/* Modal nueva/editar colecta */}
      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{modal?.id?"Editar colecta":"Nueva colecta"}</div>
            {[
              {l:"Título",        k:"titulo",         ph:"Ej: Regalo día del maestro"},
              {l:"Descripción",   k:"descripcion",    ph:"Detalles opcionales"},
            ].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>{f.l.toUpperCase()}</div>
                <input type={f.type||"text"} value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONTO SUGERIDO</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <div style={{display:"flex",gap:4}}>
                  {["$","USD"].map(m=>(
                    <button key={m} type="button" onClick={()=>setForm(p=>({...p,moneda:m}))} style={{padding:"8px 14px",borderRadius:8,border:`2px solid ${(form.moneda||"$")===m?"#3B82F6":"#E2E8F0"}`,background:(form.moneda||"$")===m?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:(form.moneda||"$")===m?"#3B82F6":"#94A3B8"}}>{m}</button>
                  ))}
                </div>
                <input type="number" value={form.monto_sugerido||""} onChange={e=>setForm(p=>({...p,monto_sugerido:e.target.value}))} placeholder="Ej: 2000" style={{...inp,flex:1}}/>
              </div>
            </div>
            {[
              {l:"Fecha límite",  k:"fecha_limite",   type:"date"},
            ].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>{f.l.toUpperCase()}</div>
                <input type={f.type||"text"} value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>RESPONSABLE</div>
              <select value={form.responsable_id||""} onChange={e=>setForm(p=>({...p,responsable_id:e.target.value}))} style={inp}>
                <option value="">— Sin asignar —</option>
                {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal detalle admin */}
      {vistaAdmin&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:900}}>{vistaAdmin.titulo}</div>
              <button onClick={()=>setVistaAdmin(null)} style={{fontSize:18,background:"none",border:"none",cursor:"pointer",color:"#94A3B8"}}>✕</button>
            </div>
            {alumnos.filter(a=>a.curso_id===vistaAdmin.curso_id).map(a=>{
              const pago = getPago(vistaAdmin.id, a.id);
              const pagado = pago?.estado==="pagado";
              const esResponsable = isAdmin || userId===vistaAdmin.responsable_id;
              return (
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid #F1F5F9"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{a.nombre} {a.apellido}</div>
                    {pagado&&pago.fecha_pago&&<div style={{fontSize:11,color:"#94A3B8"}}>Pagado el {fmtF(pago.fecha_pago)}</div>}
                  </div>
                  {esResponsable
                    ? <button onClick={()=>togglePago(vistaAdmin.id,a.id,pago?.estado)} style={{padding:"5px 14px",borderRadius:20,border:"none",background:pagado?"#10B981":"#F1F5F9",color:pagado?"white":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all 0.15s"}}>
                        {pagado?"✓ Pagado":"Marcar pagado"}
                      </button>
                    : <span style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,background:pagado?"#F0FDF4":"#F8FAFC",color:pagado?"#10B981":"#94A3B8",border:`1px solid ${pagado?"#BBF7D0":"#E2E8F0"}`}}>
                        {pagado?"✓ Pagado":"Pendiente"}
                      </span>
                  }
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* Botón nueva colecta (admin) */}
      {isAdmin&&(
        <div style={{marginBottom:16}}>
          <button onClick={()=>{setModal({});setForm({titulo:"",descripcion:"",monto_sugerido:"",responsable_id:"",fecha_limite:"",});}} style={{padding:"8px 18px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Nueva colecta</button>
        </div>
      )}

      {colectas.length===0&&<div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>No hay colectas activas</div>}

      {colectas.map(c=>{
        // En vista Todos `alumnos` trae hijos de varios cursos: todo lo de esta
        // colecta se calcula solo con los alumnos de SU curso (no-op por hijo)
        const alumnosCurso   = alumnos.filter(a=>a.curso_id===c.curso_id);
        const alumnosPagados = alumnosCurso.filter(a=>getPago(c.id,a.id)?.estado==="pagado");
        const total          = alumnosCurso.length;
        const recaudado      = alumnosPagados.length * (c.monto_sugerido||0);
        const esperado       = total * (c.monto_sugerido||0);
        const pct            = total ? Math.round(alumnosPagados.length/total*100) : 0;
        const resp           = usuarios.find(u=>u.id===c.responsable_id);
        const dias           = c.fecha_limite ? dHasta(c.fecha_limite) : null;
        const vencida        = dias!==null && dias<0;
        const tag            = tagDeCurso?.(c.curso_id) ?? null;
        const misAlumnosCurso = alumnosCurso.filter(a=>misHijos.includes(a.id));

        return (
          <Card key={c.id} style={{marginBottom:14,overflow:"hidden",opacity:c.activa?1:0.6}}>
            {/* Header */}
            <div style={{padding:"12px 16px",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                <div style={{flex:1}}>
                  {tag&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:5,marginBottom:3}}>
                      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:700,color:"#64748B"}}>{tag.nombre}</span>
                    </span>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:800}}>{c.titulo}</span>
                    {!c.activa&&<Pill label="Cerrada" color="#94A3B8" bg="#F1F5F9"/>}
                    {c.activa&&vencida&&<Pill label="Vencida" color="#EF4444" bg="#FEF2F2"/>}
                    {c.activa&&!vencida&&dias!==null&&dias<=7&&<Pill label={`${dias}d`} color="#F59E0B" bg="#FFFBEB"/>}
                  </div>
                  {c.descripcion&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{c.descripcion}</div>}
                  <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap"}}>
                    {resp&&<span style={{fontSize:11,color:"#64748B"}}>Responsable: {resp.nombre}{resp.apellido?` ${resp.apellido}`:""}</span>}
                    {c.fecha_limite&&<span style={{fontSize:11,color:"#64748B"}}>Límite: {fmtF(c.fecha_limite)}</span>}
                    {c.monto_sugerido&&<span style={{fontSize:11,color:"#64748B"}}>Monto sugerido: {fmtM(c.monto_sugerido, c.moneda||"$")}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                    <button onClick={()=>setVistaAdmin(c)} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:700,color:"#3B82F6"}}>Ver pagos</button>
                    {isAdmin&&<>
                      <button onClick={()=>{setModal(c);setForm({titulo:c.titulo||"",descripcion:c.descripcion||"",monto_sugerido:c.monto_sugerido||"",moneda:c.moneda||"$",responsable_id:c.responsable_id||"",fecha_limite:c.fecha_limite||""});}} style={{padding:"4px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>✏️</button>
                      <button onClick={()=>toggleActiva(c)} style={{padding:"4px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,color:c.activa?"#F59E0B":"#10B981"}}>{c.activa?"Cerrar":"Reabrir"}</button>
                      <button onClick={()=>eliminar(c.id)} style={{padding:"4px 8px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
                    </>}
                  </div>
              </div>
            </div>

            {/* Progreso */}
            {c.monto_sugerido&&(
              <div style={{padding:"10px 16px",borderBottom:"1px solid #F8FAFC"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,color:"#64748B",marginBottom:5}}>
                  <span>Recaudado</span>
                  <span>{fmtM(recaudado, c.moneda||"$")} <span style={{color:"#CBD5E1"}}>/ {fmtM(esperado, c.moneda||"$")}</span></span>
                </div>
                <div style={{height:6,borderRadius:10,background:"#E2E8F0",overflow:"hidden"}}>
                  <div style={{height:"100%",width:pct+"%",background:"#10B981",borderRadius:10,transition:"width 0.3s"}}/>
                </div>
                <div style={{fontSize:10,color:"#94A3B8",marginTop:4}}>{alumnosPagados.length} de {total} alumnos pagaron</div>
              </div>
            )}

            {/* Vista apoderado — mis alumnos (del curso de esta colecta) */}
            {!isAdmin&&misAlumnosCurso.length>0&&(
              <div style={{padding:"10px 16px"}}>
                {misAlumnosCurso.map(a=>{
                  const pago        = getPago(c.id,a.id);
                  const pagado      = pago?.estado==="pagado";
                  const esResponsable = isAdmin || userId===c.responsable_id;
                  return (
                    <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0"}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600}}>{a.nombre} {a.apellido}</div>
                        {pagado&&pago.fecha_pago&&<div style={{fontSize:11,color:"#94A3B8"}}>Pagado el {fmtF(pago.fecha_pago)}</div>}
                      </div>
                      {esResponsable
                        ? <button onClick={()=>c.activa&&togglePago(c.id,a.id,pago?.estado)} style={{padding:"6px 16px",borderRadius:20,border:`1.5px solid ${pagado?"#10B981":"#E2E8F0"}`,background:pagado?"#10B981":"white",color:pagado?"white":"#64748B",cursor:c.activa?"pointer":"default",fontSize:12,fontWeight:700,transition:"all 0.15s",opacity:c.activa?1:0.5}}>
                            {pagado?"✓ Pagado":"Marcar pagado"}
                          </button>
                        : <span style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,background:pagado?"#F0FDF4":"#F8FAFC",color:pagado?"#10B981":"#94A3B8",border:`1px solid ${pagado?"#BBF7D0":"#E2E8F0"}`}}>
                            {pagado?"✓ Pagado":"Pendiente"}
                          </span>
                      }
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
