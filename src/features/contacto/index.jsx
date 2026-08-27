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


export function Contacto({ cursoId, isSuperAdmin=false }) {
  const [colegio,    setColegio]    = useState(null);
  const [contactos,  setContactos]  = useState([]);
  const [editColegio,setEditColegio]= useState(false);
  const [colegioForm,setColegioForm]= useState({});
  const [modal,      setModal]      = useState(null);
  const [form,       setForm]       = useState({nombre:"",rol:"",telefono:"",email:"",orden:0});
  const [saving,     setSaving]     = useState(false);

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const cargar = async () => {
    const [col, con] = await Promise.all([
      supabase.from("colegio").select("*").eq("id","d31b5547-246b-46fa-906e-950e51d4af58").single(),
      supabase.from("contactos").select("*").order("nombre"),
    ]);
    setColegio(col.data||{});
    setContactos(con.data||[]);
  };

  useEffect(()=>{ cargar(); },[]);

  const guardarColegio = async () => {
    setSaving(true);
    const {id:_id, ...colegioData} = colegioForm;
    if(colegioData.año_lectivo_actual!=null) colegioData.año_lectivo_actual = Number(colegioData.año_lectivo_actual)||null;
    await supabase.from("colegio").update(colegioData).eq("id","d31b5547-246b-46fa-906e-950e51d4af58");
    setSaving(false); setEditColegio(false); cargar();
  };

  const guardarContacto = async () => {
    if(!form.nombre?.trim()) return;
    setSaving(true);
    const payload = { nombre:sanitize(form.nombre)||null, rol:sanitize(form.rol)||null, telefono:sanitize(form.telefono)||null, email:sanitize(form.email)||null };
    let err;
    if(modal?.id) { const r = await supabase.from("contactos").update(payload).eq("id",modal.id); err=r.error; }
    else          { const r = await supabase.from("contactos").insert(payload); err=r.error; }
    if(err) { console.error("contactos error:", err); setSaving(false); return; }
    setSaving(false); setModal(null); cargar();
  };

  const eliminarContacto = async (id) => {
    await supabase.from("contactos").delete().eq("id",id);
    cargar();
  };

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:16}}>Contacto</div>

      {/* Info colegio */}
      <Card style={{padding:18,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:800}}>{colegio?.nombre||"Colegio"}</div>
          {isSuperAdmin&&!editColegio&&<button onClick={()=>{setColegioForm({...colegio});setEditColegio(true);}} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,fontWeight:600}}>Editar</button>}
        </div>
        {editColegio?(
          <div>
            {[{l:"Nombre del colegio",k:"nombre"},{l:"Telefono",k:"telefono"},{l:"Email",k:"email"},{l:"Direccion",k:"direccion"},{l:"URL Google Maps",k:"url_maps"},{l:"Horario de clases",k:"horario_clases",ph:"Ej: 8:00 - 16:00"},{l:"Horario secretaria",k:"horario_secretaria",ph:"Ej: 8:00 - 17:00"},{l:"Sitio web",k:"sitio_web"}].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>{f.l.toUpperCase()}</div>
                <input value={colegioForm[f.k]||""} onChange={e=>setColegioForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>AÑO LECTIVO ACTUAL</div>
              <input type="number" value={colegioForm.año_lectivo_actual??""} onChange={e=>setColegioForm(p=>({...p,año_lectivo_actual:e.target.value}))} placeholder="Ej: 2026" style={inp}/>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>Define qué cursos son "el año vigente" en toda la app. Cambialo al empezar un ciclo lectivo nuevo.</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditColegio(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarColegio} disabled={saving} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[{l:"Telefono",v:colegio?.telefono,link:colegio?.telefono?`tel:${colegio.telefono}`:null},{l:"Email",v:colegio?.email,link:colegio?.email?`mailto:${colegio.email}`:null},{l:"Direccion",v:colegio?.direccion},{l:"Horario clases",v:colegio?.horario_clases},{l:"Secretaria",v:colegio?.horario_secretaria},{l:"Sitio web",v:colegio?.sitio_web,link:colegio?.sitio_web?safeUrl(colegio.sitio_web):null}].filter(x=>x.v).map(x=>(
              <div key={x.l} style={{display:"flex",gap:10,fontSize:13,alignItems:"center"}}>
                <span style={{color:"#94A3B8",fontWeight:600,minWidth:100}}>{x.l}</span>
                {x.link?<a href={x.link} target={x.l==="Sitio web"?"_blank":undefined} rel={x.l==="Sitio web"?"noreferrer":undefined} style={{color:"#3B82F6",fontWeight:600}}>{x.v}</a>:<span style={{color:"#0F172A"}}>{x.v}</span>}
                {x.l==="Telefono"&&colegio?.telefono&&(
                  <a href={`https://wa.me/${colegio.telefono.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{color:"#25D366",fontSize:16,textDecoration:"none"}}>💬</a>
                )}
              </div>
            ))}
            {colegio?.url_maps&&<a href={safeUrl(colegio.url_maps)||"#"} target="_blank" rel="noreferrer" style={{fontSize:12,fontWeight:700,color:"#3B82F6",marginTop:4}}>Ver en mapa</a>}
            {!colegio?.horario_clases&&!colegio?.telefono&&!colegio?.email&&!colegio?.direccion&&(
              <div style={{fontSize:13,color:"#94A3B8"}}>Sin informacion cargada.</div>
            )}
          </div>
        )}
      </Card>

      {/* Contactos */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:14,fontWeight:800}}>Contactos</div>
        {isSuperAdmin&&<button onClick={()=>{setModal({});setForm({nombre:"",rol:"",telefono:"",email:""});}} style={{padding:"6px 14px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
      </div>
      {contactos.map(c=>(
        <Card key={c.id} style={{padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
            {c.rol&&<div style={{fontSize:11,color:"#94A3B8"}}>{c.rol}</div>}
            <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
              {c.telefono&&<a href={`tel:${c.telefono}`} style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>Tel: {c.telefono}</a>}
              {c.telefono&&<a href={`https://wa.me/${c.telefono.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer" title="WhatsApp" style={{fontSize:14,textDecoration:"none"}}>💬</a>}
              {c.email&&<a href={`mailto:${c.email}`} style={{fontSize:12,color:"#3B82F6",fontWeight:600}}>{c.email}</a>}
            </div>
          </div>
          {isSuperAdmin&&<div style={{display:"flex",gap:6}}>
            <button onClick={()=>{setModal(c);setForm({nombre:c.nombre||"",rol:c.rol||"",telefono:c.telefono||"",email:c.email||""});}} style={{padding:"5px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>Editar</button>
            <button onClick={()=>eliminarContacto(c.id)} style={{padding:"5px 8px",borderRadius:8,border:"none",background:"#FEF2F2",cursor:"pointer",fontSize:12,color:"#EF4444"}}>Borrar</button>
          </div>}
        </Card>
      ))}
      {contactos.length===0&&<div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Sin contactos cargados</div>}

      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:14}}>{modal?.id?"Editar contacto":"Nuevo contacto"}</div>
            {[{l:"Nombre",k:"nombre"},{l:"Rol",k:"rol"},{l:"Telefono",k:"telefono"},{l:"Email",k:"email"}].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>{f.l.toUpperCase()}</div>
                <input value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={inp}/>
              </div>
            ))}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarContacto} disabled={saving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ApoderadosModal({ alumno, onClose, canEdit=true }) {
  const [vinculados,setVinculados] = useState([]);
  const [todos,setTodos]           = useState([]);
  const [busqueda,setBusqueda]     = useState("");

  useEffect(()=>{ cargar(); },[alumno.id]);

  const cargar = async () => {
    const [v,t] = await Promise.all([
      supabase.from("usuario_hijos").select("*, usuarios(id,nombre,apellido,email,telefono)").eq("hijo_id",alumno.id),
      supabase.from("usuarios").select("id,nombre,apellido,email,telefono,rol").eq("activo",true).order("nombre"),
    ]);
    const aptos = (t.data||[]).filter(u => u.rol !== "super");
    setVinculados(v.data||[]);
    setTodos(aptos);
  };

  const vincular = async (userId) => {
    await supabase.from("usuario_hijos").insert({usuario_id:userId, hijo_id:alumno.id});
    cargar();
  };

  const desvincular = async (userId) => {
    await supabase.from("usuario_hijos").delete().eq("usuario_id",userId).eq("hijo_id",alumno.id);
    cargar();
  };

  const vinculadosIds = vinculados.map(v=>v.usuario_id);
  const disponibles = todos.filter(u=>!vinculadosIds.includes(u.id)&&(fmtNombre(u).toLowerCase().includes(busqueda.toLowerCase())||u.email?.toLowerCase().includes(busqueda.toLowerCase())));

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontSize:15,fontWeight:900}}>Apoderados de {alumno.nombre}</div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#94A3B8"}}>x</button>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}}>VINCULADOS ({vinculados.length})</div>
          {vinculados.length===0&&<div style={{fontSize:13,color:"#94A3B8"}}>Sin apoderados vinculados</div>}
          {vinculados.map(v=>{
            const u = v.usuarios||{};
            return (
              <div key={v.usuario_id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"#F0FDF4",borderRadius:10,marginBottom:6,border:"1px solid #BBF7D0"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{fmtNombre(u)}</div>
                  {u.email&&<div style={{fontSize:11,color:"#94A3B8"}}>{u.email}</div>}
                  {u.telefono&&<div style={{fontSize:11,color:"#94A3B8"}}>{u.telefono}</div>}
                </div>
                {canEdit&&<button onClick={()=>desvincular(v.usuario_id)} style={{padding:"4px 10px",borderRadius:8,border:"none",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444",fontWeight:700}}>Quitar</button>}
              </div>
            );
          })}
        </div>
        {canEdit&&(
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}}>AGREGAR APODERADO</div>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre o email..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box",marginBottom:8}}/>
            <div style={{maxHeight:200,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
              {disponibles.slice(0,20).map(u=>(
                <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:"white",borderRadius:10,border:"1px solid #E2E8F0"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{fmtNombre(u)}</div>
                    {u.email&&<div style={{fontSize:11,color:"#94A3B8"}}>{u.email}</div>}
                  </div>
                  <button onClick={()=>vincular(u.id)} style={{padding:"4px 10px",borderRadius:8,border:"none",background:"#EFF6FF",cursor:"pointer",fontSize:11,color:"#3B82F6",fontWeight:700}}>Vincular</button>
                </div>
              ))}
              {disponibles.length===0&&<div style={{fontSize:13,color:"#94A3B8",padding:8}}>Sin resultados</div>}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export function Alumnos({ cursoIds, esVistaTodos, tagDeCurso, isAdmin }) {
  const [hijos,    setHijos]    = useState([]);
  const [apodMap,  setApodMap]  = useState({});
  const [busqueda, setBusqueda] = useState("");

  const cargar = async () => {
    if(!cursoIds?.length) { setHijos([]); setApodMap({}); return; }
    const { data: hijosData } = await supabase
      .from("hijos").select("*").in("curso_id",cursoIds).order("apellido").order("nombre");
    setHijos(hijosData||[]);
    const ids = (hijosData||[]).map(h=>h.id);
    if(ids.length) {
      const { data: uh } = await supabase
        .from("usuario_hijos")
        .select("hijo_id, usuario_id, usuarios(id,nombre,apellido,email,telefono)")
        .in("hijo_id", ids);
      const m = {};
      (uh||[]).forEach(r=>{
        if(!m[r.hijo_id]) m[r.hijo_id]=[];
        if(r.usuarios) m[r.hijo_id].push(r.usuarios);
      });
      setApodMap(m);
    }
  };

  const cursosKey = (cursoIds||[]).join(",");
  useEffect(()=>{ cargar(); },[cursosKey]);

  const filtrados = hijos.filter(h=>fmtNombre(h).toLowerCase().includes(busqueda.toLowerCase()));
  // Listado de alumnos: "Apellido, Nombre" (orden de planilla escolar),
  // acorde al order("apellido") de la query — los apoderados de abajo
  // siguen en "Nombre Apellido" (fmtNombre), sin cambios.
  const fmtAlumno = (h) => h?.apellido ? `${h.apellido}, ${h.nombre||""}`.trim() : fmtNombre(h);

  // En vista "Todos" se agrupa por curso (orden = cursoIds); en vista por hijo
  // hay un solo grupo sin encabezado, idéntico al comportamiento actual.
  const grupos = esVistaTodos
    ? (cursoIds||[])
        .map(cid=>({ cursoId: cid, hijos: filtrados.filter(h=>h.curso_id===cid) }))
        .filter(g=>g.hijos.length>0)
    : [{ cursoId: null, hijos: filtrados }];
  const conEncabezados = grupos.length>1;

  const renderAlumno = (h) => {
    const apods = apodMap[h.id]||[];
    return (
      <div key={h.id} style={{background:"white",borderRadius:12,marginBottom:6,border:"1px solid #E2E8F0",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700}}>{fmtAlumno(h)}</div>
            {h.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8"}}>{new Date(h.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric"})}</div>}
          </div>
          {h.dni&&<div style={{fontSize:11,color:"#94A3B8"}}>DNI: {h.dni}</div>}
        </div>
        {apods.length>0&&(
          <div style={{borderTop:"1px solid #F1F5F9",padding:"8px 14px",display:"flex",flexWrap:"wrap",gap:10}}>
            {apods.map(a=>(
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:"#3B82F6",flexShrink:0}}/>
                <div>
                  <span style={{fontSize:12,fontWeight:600,color:"#0F172A"}}>{fmtNombre(a)}</span>
                  {a.telefono&&<span style={{fontSize:11,color:"#94A3B8",marginLeft:6}}>{a.telefono}</span>}
                  {a.email&&<span style={{fontSize:11,color:"#94A3B8",marginLeft:6}}>{a.email}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {apods.length===0&&(
          <div style={{borderTop:"1px solid #F1F5F9",padding:"6px 14px"}}>
            <span style={{fontSize:11,color:"#CBD5E1"}}>Sin apoderados vinculados</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:16}}>Alumnos</div>
      <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar alumno..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"white",boxSizing:"border-box",marginBottom:12}}/>
      <div style={{fontSize:12,color:"#94A3B8",marginBottom:10}}>{filtrados.length} alumnos</div>
      {grupos.map(g=>{
        const tag = conEncabezados ? tagDeCurso?.(g.cursoId) : null;
        return (
          <div key={g.cursoId ?? "curso-actual"}>
            {tag&&(
              <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:4,marginBottom:8}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
                <span style={{fontSize:11,fontWeight:700,color:"#64748B"}}>{tag.nombre}</span>
              </div>
            )}
            {g.hijos.map(renderAlumno)}
          </div>
        );
      })}
    </div>
  );
}
