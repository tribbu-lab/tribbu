// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre,
         sanitize, safeUrl, getHijoColor, setHijoColor, uuidLite } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { AdjuntosInput } from "../../components/Adjuntos";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useListControls } from "../../hooks/useListControls";
import { ListToolbar } from "../../components";
import { EmojiPicker } from "../shared";
import { useToast } from "../../hooks/useToast";
import { authAdminCreate, authAdminUpdate, authAdminFind } from "../../lib/authAdmin";

import { sendPush, getUserIdsByCurso } from "../../lib/push";
import * as XLSX from "xlsx";
import { UploadMenuExcel } from "../comedor";
import { Contacto, ApoderadosModal } from "../contacto";

// Selector de curso(s) en lista, no chips — con muchos cursos, los chips que
// wrappean se vuelven enormes e inmanejables. Único lugar para este patrón
// (antes copy-pasteado en Comunicaciones/Maestros/Alertas/Horarios/Uniformes
// por separado): `multi` decide checkbox (varios) vs. radio (uno solo).
function CursoListSelector({ cursos, seleccionados, onToggle, multi=true, maxHeight=220 }) {
  return (
    <div style={{border:"1.5px solid #E2E8F0",borderRadius:12,maxHeight,overflowY:"auto"}}>
      {cursos.map((c,i)=>{
        const sel = seleccionados.includes(c.id);
        return (
          <label key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderTop:i>0?"1px solid #F1F5F9":"none",background:sel?(c.color+"0D"):"white"}}>
            <input type={multi?"checkbox":"radio"} name={multi?undefined:"curso-list-selector"} checked={sel} onChange={()=>onToggle(c.id)} style={{width:16,height:16,accentColor:c.color,cursor:"pointer",flexShrink:0}}/>
            <span style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>
            <span style={{fontSize:13,fontWeight:sel?700:500,color:sel?"#0F172A":"#475569",flex:1}}>{c.avatar} {c.nombre}</span>
          </label>
        );
      })}
      {cursos.length===0&&<div style={{padding:14,fontSize:12,color:"#94A3B8",textAlign:"center"}}>Sin cursos</div>}
    </div>
  );
}

export function SuperAdmin() {
  const [sec,setSec]           = useState("usuarios");
  const [usuarios,setUsuarios] = useState([]);
  const [cursos,setCursos]     = useState([]);
  const [hijos,setHijos]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [modal,setModal]       = useState(null);
  const [form,setForm]         = useState({});
  const [confirm,setConfirm]   = useState(null);
  const [maestros,setMaestros] = useState([]);
  const [alumnos,setAlumnos]   = useState([]);
  const [cursoFiltro,setCursoFiltro] = useState(null);
  const [verApodSA,setVerApodSA]     = useState(null);
  const [authSyncMsg,setAuthSyncMsg] = useState(null);
  const { showToast, Toast } = useToast();

  const ctrlUsuarios = useListControls(usuarios, {
    searchFn: (u,q)=> u.nombre.toLowerCase().includes(q)||u.email.toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre", label:"Nombre", val:u=>u.nombre},
      {key:"rol",    label:"Rol",    val:u=>u.rol},
      {key:"id",     label:"Más reciente", val:u=>u.id},
    ],
    filterOptions: [
      {key:"rol", label:"Rol", options:[{value:"padre",label:"Apoderado"},{value:"admin",label:"Room Parent"},{value:"super",label:"Super Admin"}], match:(u,v)=>u.rol===v},
      {key:"activo", label:"Estado", options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}], match:(u,v)=>v==="si"?u.activo:!u.activo},
      {key:"curso", label:"Curso", options:[], match:(u,v)=>{
        const cid=v;
        if(u.rol==="admin") return (u.cursos||[]).includes(cid);
        if(u.rol==="padre") return (u.hijos||[]).some(hid=>hijos.find(h=>h.id===hid&&h.curso_id===cid));
        return false;
      }},
    ],
    pageSize:12,
  });

  const ctrlCursos = useListControls(cursos, {
    searchFn: (c,q)=> c.nombre.toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre", label:"Nombre", val:c=>c.nombre},
      {key:"id",     label:"Más reciente", val:c=>c.id},
    ],
    pageSize:12,
  });

  const ctrlAlumnos = useListControls(alumnos, {
    searchFn: (a,q)=> (`${a.nombre} ${a.apellido||""}`).toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre",    label:"Nombre",     val:a=>a.nombre},
      {key:"apellido",  label:"Apellido",   val:a=>a.apellido||""},
      {key:"nacimiento",label:"Cumpleaños", val:a=>a.fecha_nacimiento||"z"},
    ],
    filterOptions: [
      {key:"curso", label:"Curso", options:[], match:(a,v)=>a.curso_id===v},
    ],
    pageSize:12,
  });
  // Populate curso filter options dynamically
  ctrlAlumnos.filterOptions = [{
    key:"curso", label:"Curso",
    options: cursos.map(c=>({value:String(c.id), label:c.nombre})),
    match:(a,v)=>a.curso_id===v
  }];

  const ctrlMaestros = useListControls(maestros, {
    searchFn: (m,q)=> m.nombre.toLowerCase().includes(q)||(m.materia||"").toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre",  label:"Nombre",   val:m=>m.nombre},
      {key:"materia", label:"Materia",  val:m=>m.materia||""},
    ],
    filterOptions: [
      {key:"activo", label:"Estado", options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}], match:(m,v)=>v==="si"?m.activo:!m.activo},
    ],
    pageSize:12,
  });

  useEffect(()=>{ cargar(); },[]);

  const cargar = async () => {
    setLoading(true);
    const [u,c,h,m,mc] = await Promise.all([
      supabase.from("usuarios").select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)").order("id"),
      supabase.from("cursos").select("*").order("nombre"),
      supabase.from("hijos").select("*").order("id"),
      supabase.from("maestros").select("*").order("id"),
      supabase.from("maestro_cursos").select("*"),
    ]);
    setUsuarios((u.data||[]).map(u=>({...u,hijos:u.usuario_hijos.map(r=>r.hijo_id),cursos:u.usuario_cursos.map(r=>r.curso_id),cursosAdmin:u.usuario_cursos.filter(r=>r.rol==="admin").map(r=>r.curso_id)})));
    setCursos(c.data||[]);
    setHijos(h.data||[]);
    const mcData = mc.data||[];
    setMaestros((m.data||[]).map(x=>({...x, cursos: mcData.filter(r=>r.maestro_id===x.id).map(r=>r.curso_id)})));
    const al = await supabase.from("hijos").select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,apellido,email,telefono))").order("nombre");
    setAlumnos(al.data||[]);
    setLoading(false);
  };

  const guardarUsuario = async () => {
    if(!form.nombre||!form.email) return;
    // Al crear nuevo usuario, la contraseña es obligatoria
    if(modal==="nuevo_usuario" && !form.pass) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    const rolGlobal = form.esSuper ? "super" : (form.cursosAdmin||[]).length>0 ? "admin" : "padre";

    if(modal==="nuevo_usuario") {
      // Crear en Supabase Auth via Edge Function (sin exponer service key al cliente)
      let auth_id = null;
      try {
        const { auth_id: newId } = await authAdminCreate(
          sanitize(form.email).toLowerCase(),
          form.pass
        );
        auth_id = newId || null;
      } catch(e) { console.error("Error creando en Auth:", e); }
      const { data } = await supabase.from("usuarios").insert({
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: sanitize(form.email).toLowerCase(), rol: rolGlobal,
        avatar, activo: form.activo, dni: sanitize(form.dni)||null,
        telefono: sanitize(form.telefono)||null, auth_id,
      }).select().single();
      if(data) {
        if((form.cursosAdmin||[]).length) await supabase.from("usuario_cursos").insert((form.cursosAdmin||[]).map(cid=>({usuario_id:data.id,curso_id:cid,rol:"admin"})));
        if((form.hijos||[]).length)       await supabase.from("usuario_hijos").insert((form.hijos||[]).map(hid=>({usuario_id:data.id,hijo_id:hid})));
      }
    } else {
      const passNueva = form._passNueva && form._passNueva.trim();
      const passEsNueva = !!passNueva;
      const emailNuevo = sanitize(form.email).toLowerCase();
      // Actualizar datos del usuario (sin columna pass)
      await supabase.from("usuarios").update({
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: emailNuevo, rol: rolGlobal, activo: form.activo,
        dni: sanitize(form.dni)||null, telefono: sanitize(form.telefono)||null,
      }).eq("id", form.id);
      // Sincronizar email y/o clave en Supabase Auth via Edge Function
      const emailCambio = emailNuevo !== (form._emailOriginal||"").toLowerCase();
      if(passEsNueva || emailCambio) {
        try {
          let authId = form.auth_id;
          if(!authId) {
            // Buscar auth_id por email via Edge Function
            const found = await authAdminFind(form._emailOriginal||form.email);
            authId = found.auth_id || null;
            if(authId) await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
          }
          if(!authId) {
            setAuthSyncMsg({ ok:false, msg:`⚠️ No se encontró el usuario en Supabase Auth.` });
          } else {
            await authAdminUpdate(authId, {
              ...(emailCambio ? { email: emailNuevo } : {}),
              ...(passEsNueva ? { password: passNueva } : {}),
            });
            setAuthSyncMsg({ ok:true, msg:`✅ ${[emailCambio?"Email":"",passEsNueva?"Clave":""].filter(Boolean).join(" y ")} actualizado en Auth para ${emailNuevo}.` });
          }
        } catch(e) { setAuthSyncMsg({ ok:false, msg:`⚠️ Error: ${e.message}` }); }
      }
      await supabase.from("usuario_cursos").delete().eq("usuario_id",form.id);
      await supabase.from("usuario_hijos").delete().eq("usuario_id",form.id);
      if((form.cursosAdmin||[]).length) await supabase.from("usuario_cursos").insert((form.cursosAdmin||[]).map(cid=>({usuario_id:form.id,curso_id:cid,rol:"admin"})));
      if((form.hijos||[]).length)       await supabase.from("usuario_hijos").insert((form.hijos||[]).map(hid=>({usuario_id:form.id,hijo_id:hid})));
    }
    setModal(null); cargar();
  };

  const guardarCurso = async () => {
    if(!form.nombre) return;
    const { error } = await supabase.from("cursos").insert({nombre:form.nombre,avatar:form.avatar||"🏫",color:form.color||"#3B82F6"});
    if(error) { showToast("Error al guardar el curso", "error"); return; }
    setModal(null); cargar();
  };

  const actualizarCurso = async () => {
    if(!form.nombre) return;
    const { error } = await supabase.from("cursos").update({nombre:form.nombre,avatar:form.avatar,color:form.color}).eq("id",form.id);
    if(error) { showToast("Error al actualizar el curso", "error"); return; }
    setModal(null); cargar();
  };

  const toggleActivo = async (u) => {
    const { error } = await supabase.from("usuarios").update({activo:!u.activo}).eq("id",u.id);
    if(error) { showToast("Error al cambiar el estado", "error"); return; }
    cargar();
  };

  const eliminarUsuario = async (id) => {
    const { error } = await supabase.from("usuario_hijos").delete().eq("usuario_id",id)
      .then(() => supabase.from("usuario_cursos").delete().eq("usuario_id",id))
      .then(() => supabase.from("usuarios").delete().eq("id",id));
    if(error) { showToast("Error al eliminar el usuario", "error"); setConfirm(null); return; }
    setConfirm(null); cargar();
  };

  const eliminarCurso = async (id) => {
    const { error } = await supabase.from("cursos").delete().eq("id",id);
    if(error) { showToast("Error al eliminar el curso", "error"); setConfirm(null); return; }
    setConfirm(null); cargar();
  };

  const guardarMaestro = async () => {
    if(!form.nombre) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    if(modal==="nuevo_maestro") {
      const { data, error } = await supabase.from("maestros").insert({nombre:sanitize(form.nombre),materia:sanitize(form.materia)||null,email:sanitize(form.email)||null,avatar,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null}).select().single();
      if(error) { showToast("Error al guardar el maestro", "error"); return; }
      if(data && form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map(cid=>({maestro_id:data.id,curso_id:cid})));
    } else {
      const { error } = await supabase.from("maestros").update({nombre:sanitize(form.nombre),materia:sanitize(form.materia)||null,email:sanitize(form.email)||null,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
      if(error) { showToast("Error al actualizar el maestro", "error"); return; }
      await supabase.from("maestro_cursos").delete().eq("maestro_id",form.id);
      if(form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map(cid=>({maestro_id:form.id,curso_id:cid})));
    }
    setModal(null); cargar();
  };

  const eliminarMaestro = async (id) => {
    await supabase.from("maestro_cursos").delete().eq("maestro_id",id);
    const { error } = await supabase.from("maestros").delete().eq("id",id);
    if(error) { showToast("Error al eliminar el maestro", "error"); setConfirm(null); return; }
    setConfirm(null); cargar();
  };

  const guardarAlumno = async () => {
    if(!form.nombre||!form.curso_id) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
    const color = form.color||colors[Math.floor(Math.random()*colors.length)];
    let error;
    if(modal==="nuevo_alumno") {
      ({ error } = await supabase.from("hijos").insert({nombre:form.nombre,apellido:form.apellido||null,curso_id:form.curso_id,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null,dni:sanitize(form.dni)||null}));
    } else {
      ({ error } = await supabase.from("hijos").update({nombre:form.nombre,apellido:form.apellido||null,curso_id:form.curso_id,fecha_nacimiento:form.fecha_nacimiento||null,dni:sanitize(form.dni)||null}).eq("id",form.id));
    }
    if(error) { showToast("Error al guardar el alumno", "error"); return; }
    setModal(null); cargar();
  };

  const eliminarAlumno = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("hijo_id",id);
    const { error } = await supabase.from("hijos").delete().eq("id",id);
    if(error) { showToast("Error al eliminar el alumno", "error"); setConfirm(null); return; }
    setConfirm(null); cargar();
  };

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit",background:"#F8FAFC"};

  if(loading) return <Spinner/>;

  return (
    <div>
      <Toast />
      {/* Feedback banner para operaciones de Auth */}
      {authSyncMsg&&(
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:400,maxWidth:480,width:"90%",background:authSyncMsg.ok?"#F0FDF4":"#FFFBEB",border:`1.5px solid ${authSyncMsg.ok?"#10B981":"#F59E0B"}`,borderRadius:14,padding:"14px 18px",boxShadow:"0 8px 24px rgba(0,0,0,0.12)",display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1,fontSize:13,color:authSyncMsg.ok?"#065F46":"#92400E",lineHeight:1.5}}>{authSyncMsg.msg}</div>
          <button onClick={()=>setAuthSyncMsg(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#94A3B8",flexShrink:0,lineHeight:1,padding:0}}>✕</button>
        </div>
      )}
      {confirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,maxWidth:340,width:"100%"}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>¿Eliminar?</div>
            {confirm.nombre && <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:4}}>{confirm.nombre}</div>}
            <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>{confirm.msg}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirm(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={confirm.action} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Eliminar</button>
            </div>
          </Card>
        </div>
      )}

      {verApodSA&&<ApoderadosModal alumno={verApodSA} onClose={()=>setVerApodSA(null)}/>}
      {(modal==="nuevo_usuario"||modal?.edit) && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="nuevo_usuario"?"Nuevo usuario":"Editar usuario"}</div>
            {[{label:"Nombre",key:"nombre",type:"text",ph:"Ej: María"},{label:"Apellido",key:"apellido",type:"text",ph:"Ej: García"},{label:"Email",key:"email",type:"email",ph:"maria@mail.com"},{label:"DNI",key:"dni",type:"text",ph:"Ej: 12345678"},{label:"Teléfono",key:"telefono",type:"tel",ph:"Ej: +54 11 1234-5678"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            {/* Contraseña — al editar mostrar vacío, solo llenar si quiere cambiarla */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>
                {modal==="nuevo_usuario"?"Contraseña":"Nueva contraseña"}
              </div>
              <input
                value={modal==="nuevo_usuario"?(form.pass||""):(form._passNueva||"")}
                onChange={e=>modal==="nuevo_usuario"?setForm(p=>({...p,pass:e.target.value})):setForm(p=>({...p,_passNueva:e.target.value,pass:e.target.value}))}
                type="password"
                placeholder={modal==="nuevo_usuario"?"Contraseña de acceso":"Dejar vacío para no cambiar"}
                style={inp}
              />
            </div>

            {/* Super Admin toggle */}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Acceso especial</div>
              <button onClick={()=>setForm(p=>({...p,esSuper:!p.esSuper}))} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${form.esSuper?"#8B5CF6":"#E2E8F0"}`,background:form.esSuper?"#F5F3FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.esSuper?"#8B5CF6":"#94A3B8"}}>
                {form.esSuper?"★ Super Admin":"◇ Super Admin"}
              </button>
              {form.esSuper&&<div style={{fontSize:11,color:"#8B5CF6",marginTop:4}}>Acceso total al sistema. No necesita cursos ni hijos.</div>}
            </div>

            {!form.esSuper&&(
              <>
                {/* ── Sección 1: Hijos vinculados ── */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>👶 Hijos vinculados</div>
                  {/* Chips de seleccionados */}
                  {(form.hijos||[]).length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                      {(form.hijos||[]).map(hid=>{
                        const h=hijos.find(x=>x.id===hid); if(!h) return null;
                        const c=cursos.find(x=>x.id===h.curso_id);
                        return (
                          <div key={hid} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px 3px 10px",borderRadius:20,background:"#EFF6FF",border:"1.5px solid #BFDBFE"}}>
                            <span style={{fontSize:12,fontWeight:700,color:"#3B82F6"}}>{h.nombre} {h.apellido}</span>
                            {c&&<span style={{fontSize:10,color:"#94A3B8"}}>· {c.nombre}</span>}
                            <button onClick={()=>setForm(p=>{
                              const newHijos=p.hijos.filter(x=>x!==hid);
                              // Si al quitar este hijo el curso queda sin hijos, quitar también el rol admin de ese curso
                              const cursosConHijos=new Set(newHijos.map(id=>hijos.find(x=>x.id===id)?.curso_id).filter(Boolean));
                              const newAdmin=(p.cursosAdmin||[]).filter(cid=>cursosConHijos.has(cid));
                              return {...p,hijos:newHijos,cursosAdmin:newAdmin};
                            })} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#94A3B8",padding:"0 2px",lineHeight:1}}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Buscador */}
                  <div style={{position:"relative"}}>
                    <input
                      placeholder="Buscar alumno por nombre o curso..."
                      value={form._busqHijo||""}
                      onChange={e=>setForm(p=>({...p,_busqHijo:e.target.value}))}
                      style={{...inp,paddingLeft:32}}
                    />
                    <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,pointerEvents:"none"}}>🔍</span>
                  </div>
                  {/* Dropdown con resultados */}
                  {(form._busqHijo||"").length>0&&(()=>{
                    const busq=(form._busqHijo||"").toLowerCase();
                    const filtrados=hijos.filter(h=>{
                      const nombre=`${h.nombre} ${h.apellido||""}`.toLowerCase();
                      const curso=cursos.find(c=>c.id===h.curso_id);
                      return nombre.includes(busq)||(curso?.nombre||"").toLowerCase().includes(busq);
                    }).slice(0,8);
                    if(!filtrados.length) return <div style={{fontSize:12,color:"#94A3B8",padding:"8px 12px",background:"#F8FAFC",borderRadius:10,marginTop:4}}>Sin resultados</div>;
                    return (
                      <div style={{border:"1px solid #E2E8F0",borderRadius:10,marginTop:4,background:"white",boxShadow:"0 4px 12px rgba(0,0,0,0.08)",maxHeight:200,overflowY:"auto"}}>
                        {filtrados.map((h,i,arr)=>{
                          const sel=(form.hijos||[]).includes(h.id);
                          const c=cursos.find(x=>x.id===h.curso_id);
                          return (
                            <div key={h.id} onClick={()=>setForm(p=>({...p,hijos:sel?p.hijos.filter(x=>x!==h.id):[...(p.hijos||[]),h.id],_busqHijo:""}))}
                              style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderBottom:i<arr.length-1?"1px solid #F8FAFC":"none",cursor:"pointer",background:sel?"#EFF6FF":"white"}}>
                              <div style={{flex:1}}>
                                <div style={{fontSize:13,fontWeight:sel?700:500,color:sel?"#3B82F6":"#0F172A"}}>{h.nombre} {h.apellido}</div>
                                {c&&<div style={{fontSize:11,color:"#94A3B8"}}>{c.avatar} {c.nombre}</div>}
                              </div>
                              {sel&&<span style={{fontSize:13,color:"#3B82F6",fontWeight:700}}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* ── Sección 2: Room Parent — solo en cursos donde tiene hijos ── */}
                {(()=>{
                  // Cursos donde este usuario tiene al menos un hijo seleccionado
                  const cursosConHijos=[...new Set((form.hijos||[]).map(hid=>hijos.find(h=>h.id===hid)?.curso_id).filter(Boolean))];
                  if(!cursosConHijos.length) return null;
                  return (
                    <div style={{marginBottom:16}}>
                      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>🏫 Room Parent</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginBottom:8}}>Solo puede ser Room Parent en cursos donde tiene un hijo.</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {cursosConHijos.map(cid=>{
                          const c=cursos.find(x=>x.id===cid); if(!c) return null;
                          const esAdmin=(form.cursosAdmin||[]).includes(cid);
                          const hijosAqui=(form.hijos||[]).filter(hid=>hijos.find(h=>h.id===hid)?.curso_id===cid).map(hid=>hijos.find(h=>h.id===hid)).filter(Boolean);
                          return (
                            <div key={cid} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${esAdmin?"#10B981":"#E2E8F0"}`,background:esAdmin?"#F0FDF4":"white"}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{c.avatar} {c.nombre}</div>
                                <div style={{fontSize:11,color:"#64748B",marginTop:1}}>{hijosAqui.map(h=>`${h.nombre} ${h.apellido||""}`).join(", ")}</div>
                              </div>
                              <button onClick={()=>setForm(p=>({...p,cursosAdmin:esAdmin?p.cursosAdmin.filter(x=>x!==cid):[...(p.cursosAdmin||[]),cid]}))}
                                style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${esAdmin?"#10B981":"#E2E8F0"}`,background:esAdmin?"#10B981":"white",cursor:"pointer",fontSize:11,fontWeight:700,color:esAdmin?"white":"#94A3B8",flexShrink:0}}>
                                {esAdmin?"✓ Room Parent":"+ Room Parent"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Estado</div>
              <button onClick={()=>setForm(p=>({...p,activo:!p.activo}))} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${form.activo?"#10B981":"#EF4444"}`,background:form.activo?"#F0FDF4":"#FEF2F2",cursor:"pointer",fontSize:12,fontWeight:700,color:form.activo?"#10B981":"#EF4444"}}>{form.activo?"✓ Activo":"✗ Inactivo"}</button>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarUsuario} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal==="nuevo_usuario"?"Crear usuario":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_curso"||modal==="editar_curso") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="editar_curso"?"Editar curso":"Nuevo curso"}</div>
            <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Nombre del curso</div>
                <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: 4°B — Primaria" style={inp}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Icono</div>
                <EmojiPicker value={form.avatar||"🏫"} onChange={v=>setForm(p=>({...p,avatar:v}))}/>
              </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899","#0EA5E9","#14B8A6"].map(c=>(
                  <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{width:32,height:32,borderRadius:"50%",background:c,border:form.color===c?"3px solid #0F172A":"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={modal==="editar_curso"?actualizarCurso:guardarCurso} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal==="editar_curso"?"Guardar cambios":"Crear curso"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_maestro"||modal==="editar_maestro") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="nuevo_maestro"?"Nuevo maestro":"Editar maestro"}</div>
            {[{label:"Nombre completo",key:"nombre",ph:"Ej: Carlos Gómez"},{label:"Materia",key:"materia",ph:"Ej: Matemáticas"},{label:"Email",key:"email",ph:"carlos@mail.com"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Cumpleaños</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} placeholder="dd/mm/aaaa" style={inp}/>

            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Cursos asignados</div>
              <CursoListSelector cursos={cursos} seleccionados={form.cursos||[]} onToggle={id=>setForm(p=>{ const sel=(p.cursos||[]).includes(id); return {...p,cursos:sel?p.cursos.filter(x=>x!==id):[...(p.cursos||[]),id]}; })}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Estado</div>
              <button onClick={()=>setForm(p=>({...p,activo:!p.activo}))} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${form.activo!==false?"#10B981":"#EF4444"}`,background:form.activo!==false?"#F0FDF4":"#FEF2F2",cursor:"pointer",fontSize:12,fontWeight:700,color:form.activo!==false?"#10B981":"#EF4444"}}>{form.activo!==false?"✓ Activo":"✗ Inactivo"}</button>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarMaestro} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal==="nuevo_maestro"?"Crear maestro":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_alumno"||modal==="editar_alumno") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="nuevo_alumno"?"Nuevo alumno":"Editar alumno"}</div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Nombre</div>
                <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Sofía" style={inp}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Apellido</div>
                <input value={form.apellido||""} onChange={e=>setForm(p=>({...p,apellido:e.target.value}))} placeholder="Ej: García" style={inp}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Fecha de nacimiento</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>DNI</div>
              <input value={form.dni||""} onChange={e=>setForm(p=>({...p,dni:e.target.value}))} placeholder="Ej: 12345678" style={inp}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Icono</div>
              <EmojiPicker value={form.avatar||""} onChange={v=>setForm(p=>({...p,avatar:v}))}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899","#0EA5E9","#14B8A6","#F97316","#6366F1"].map(c=>(
                  <button key={c} type="button" onClick={()=>setForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,border:(form.color||"#3B82F6")===c?"3px solid #0F172A":"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Curso</div>
              <select value={form.curso_id||""} onChange={e=>setForm(p=>({...p,curso_id:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                <option value="" disabled>Elegir curso...</option>
                {cursos.map(c=>(
                  <option key={c.id} value={c.id}>{c.avatar} {c.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarAlumno} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal==="nuevo_alumno"?"Crear alumno":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
          <div style={{fontSize:22,fontWeight:900}}>Panel Super Admin</div>
          <Pill label="Super Admin" color="#8B5CF6" bg="#F5F3FF"/>
        </div>
        <div style={{fontSize:13,color:"#94A3B8"}}>Gestión global de usuarios, roles y cursos</div>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
        {[
          {n:usuarios.filter(u=>u.activo).length,  l:"Usuarios activos",   c:"#10B981", bg:"#F0FDF4"},
          {n:usuarios.filter(u=>u.rol==="padre").length, l:"Apoderados",   c:"#3B82F6", bg:"#EFF6FF"},
          {n:usuarios.filter(u=>u.rol==="admin").length, l:"Room Parents", c:"#8B5CF6", bg:"#F5F3FF"},
          {n:cursos.length,                         l:"Cursos",            c:"#F59E0B", bg:"#FFFBEB"},
        ].map((s,i)=>(
          <div key={i} style={{minWidth:100,background:s.bg,borderRadius:14,padding:"14px 16px",textAlign:"center",flex:1}}>
            <div style={{fontSize:30,fontWeight:900,color:s.c,lineHeight:1}}>{s.n}</div>
            <div style={{fontSize:11,color:"#94A3B8",fontWeight:700,marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {[{id:"usuarios",l:"👤 Usuarios"},{id:"cursos",l:"🏫 Cursos"},{id:"maestros",l:"👨‍🏫 Maestros"},{id:"alumnos",l:"🎒 Alumnos"},{id:"codigos",l:"🔑 Códigos"},{id:"horarios",l:"🕐 Horarios"},{id:"uniformes",l:"👕 Uniformes"},{id:"colegio",l:"🏫 Colegio"},{id:"alertas",l:"🚨 Alertas"},{id:"comunicaciones",l:"📢 Comunicaciones"},{id:"menu",l:"🍽️ Menú"}].map(t=>(
          <button key={t.id} onClick={()=>setSec(t.id)} style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sec===t.id?"#0F172A":"white",color:sec===t.id?"white":"#94A3B8",boxShadow:sec===t.id?"0 3px 10px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{t.l}</button>
        ))}
      </div>

      {sec==="usuarios" && (
        <>
          <UploadApoderadosExcel onDone={cargar}/>
          <button onClick={()=>{ setForm({nombre:"",apellido:"",email:"",pass:"",esSuper:false,cursosAdmin:[],hijos:[],activo:true}); setModal("nuevo_usuario"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",color:"#3B82F6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar usuario individual</button>
          {(() => {
            const cursoOpts = cursos.map(c=>({value:String(c.id),label:c.nombre}));
            return <ListToolbar busqueda={ctrlUsuarios.busqueda} setBusqueda={ctrlUsuarios.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"rol",label:"Rol"},{key:"id",label:"Más reciente"}]} sortKey={ctrlUsuarios.sortKey} sortAsc={ctrlUsuarios.sortAsc} toggleSort={ctrlUsuarios.toggleSort} filterOptions={[{key:"rol",label:"Rol",options:[{value:"padre",label:"Apoderado"},{value:"admin",label:"Room Parent"},{value:"super",label:"Super Admin"}]},{key:"activo",label:"Estado",options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}]},{key:"curso",label:"Curso",options:cursoOpts}]} filtros={ctrlUsuarios.filtros} setFiltro={ctrlUsuarios.setFiltro} resetFiltros={ctrlUsuarios.resetFiltros} total={ctrlUsuarios.total} placeholder="Buscar por nombre o email..."/>;
          })()}
          {ctrlUsuarios.items.map(u=>(
            <Card key={u.id} style={{padding:"14px 16px",marginBottom:10,opacity:u.activo?1:0.55}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>

                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:14,fontWeight:700}}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</div>
                    <Pill label={ROL_LABEL[u.rol]} color={ROL_COLOR[u.rol]} bg={ROL_BG[u.rol]}/>
                    {!u.activo && <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                  </div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{u.email}</div>
                  {u.telefono&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}><a href={`tel:${u.telefono}`} style={{color:"#3B82F6",fontWeight:600,textDecoration:"none"}}>📞 {u.telefono}</a></div>}
                  {u.dni&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>DNI: {u.dni}</div>}
                  {u.rol==="admin"&&u.cursos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Cursos: {u.cursos.map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ")}</div>}
                  {(u.cursosAdmin||[]).length>0&&<div style={{fontSize:11,color:"#10B981",marginTop:2}}>Room Parent: {(u.cursosAdmin||[]).map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ")}</div>}
                  {u.hijos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Hijos: {u.hijos.map(hid=>hijos.find(h=>h.id===hid)?.nombre).filter(Boolean).join(", ")}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>{ setForm({...u,esSuper:u.rol==="super",cursosAdmin:[...(u.cursosAdmin||[])],hijos:[...(u.hijos||[])],_emailOriginal:u.email}); setModal({edit:u}); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                  <button onClick={()=>toggleActivo(u)} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${u.activo?"#EF4444":"#10B981"}`,background:u.activo?"#FEF2F2":"#F0FDF4",cursor:"pointer",fontSize:12,color:u.activo?"#EF4444":"#10B981"}}>{u.activo?"🚫":"✓"}</button>
                  {u.rol!=="super"&&<button onClick={()=>setConfirm({nombre:`${u.nombre}${u.apellido?" "+u.apellido:""}`,msg:"Esta acción no se puede deshacer.",action:()=>eliminarUsuario(u.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>}
                </div>
              </div>
            </Card>
          ))}
          <Paginador pagina={ctrlUsuarios.pagina} totalPag={ctrlUsuarios.totalPag} setPagina={ctrlUsuarios.setPagina}/>
        </>
      )}

      {sec==="cursos" && (
        <>
          <button onClick={()=>{ setForm({nombre:"",avatar:"🏫",color:"#3B82F6"}); setModal("nuevo_curso"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",color:"#3B82F6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo curso</button>
          <ListToolbar busqueda={ctrlCursos.busqueda} setBusqueda={ctrlCursos.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"id",label:"Más reciente"}]} sortKey={ctrlCursos.sortKey} sortAsc={ctrlCursos.sortAsc} toggleSort={ctrlCursos.toggleSort} filtros={{}} setFiltro={()=>{}} resetFiltros={ctrlCursos.resetFiltros} total={ctrlCursos.total} placeholder="Buscar curso..."/>
          {ctrlCursos.items.map(c=>{
            const admins=usuarios.filter(u=>u.rol==="admin"&&u.cursos.includes(c.id));
            const padres=usuarios.filter(u=>u.rol==="padre"&&hijos.filter(h=>h.curso_id===c.id).some(h=>u.hijos.includes(h.id)));
            return (
              <Card key={c.id} style={{padding:"14px 16px",marginBottom:10,borderLeft:`4px solid ${c.color}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:12,background:c.color+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.avatar}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:800}}>{c.nombre}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{admins.length} Room Parent{admins.length!==1?"s":""} · {padres.length} familias</div>
                    {admins.length>0&&<div style={{fontSize:11,color:"#94A3B8"}}>Admin: {admins.map(a=>a.nombre).join(", ")}</div>}
                  </div>
                  <button onClick={()=>{ setForm({...c}); setModal("editar_curso"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,marginRight:6}}>✏️</button>
                  <button onClick={()=>setConfirm({nombre:c.nombre,msg:"Se eliminarán todos los datos asociados al curso.",action:()=>eliminarCurso(c.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </Card>
            );
          })}
          <Paginador pagina={ctrlCursos.pagina} totalPag={ctrlCursos.totalPag} setPagina={ctrlCursos.setPagina}/>
        </>
      )}
      {sec==="alumnos" && (
        <>
          <UploadAlumnosExcel cursos={cursos} onDone={cargar}/>
          <button onClick={()=>{ setForm({nombre:"",curso_id:cursos[0]?.id,fecha_nacimiento:"",color:""}); setModal("nuevo_alumno"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #10B981",background:"#F0FDF4",color:"#10B981",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar alumno individual</button>
          <ListToolbar busqueda={ctrlAlumnos.busqueda} setBusqueda={ctrlAlumnos.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"apellido",label:"Apellido"},{key:"nacimiento",label:"Cumpleaños"}]} sortKey={ctrlAlumnos.sortKey} sortAsc={ctrlAlumnos.sortAsc} toggleSort={ctrlAlumnos.toggleSort} filterOptions={[{key:"curso",label:"Curso",options:cursos.map(c=>({value:String(c.id),label:c.nombre}))}]} filtros={ctrlAlumnos.filtros} setFiltro={ctrlAlumnos.setFiltro} resetFiltros={ctrlAlumnos.resetFiltros} total={ctrlAlumnos.total} placeholder="Buscar alumno..."/>
          {ctrlAlumnos.items.map(a=>{
            const curso = cursos.find(c=>c.id===a.curso_id);
            const apoderados = (a.usuarios||[]).map(u=>u.usuarios).filter(Boolean);
            return (
              <Card key={a.id} style={{padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{fontSize:14,fontWeight:700}}>{fmtNombre(a)}</div>
                      {curso&&<Pill label={curso.nombre} color={curso.color} bg={curso.color+"18"}/>}
                    </div>
                    {a.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtF(a.fecha_nacimiento)}</div>}
                    {a.dni&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>DNI: {a.dni}</div>}
                    {apoderados.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👨‍👩‍👧 {apoderados.map(p=>`${p.nombre}${p.apellido?` ${p.apellido}`:""}`).join(", ")}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>setVerApodSA(a)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",fontSize:11,fontWeight:600,color:"#3B82F6"}}>👨‍👩‍👧</button>
                    <button onClick={()=>{ setForm({...a}); setModal("editar_alumno"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                    <button onClick={()=>setConfirm({nombre:fmtNombre(a),msg:"Esta acción no se puede deshacer.",action:()=>eliminarAlumno(a.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                  </div>
                </div>
              </Card>
            );
          })}
          <Paginador pagina={ctrlAlumnos.pagina} totalPag={ctrlAlumnos.totalPag} setPagina={ctrlAlumnos.setPagina}/>
        </>
      )}

      {sec==="maestros" && (
        <>
          <button onClick={()=>{ setForm({nombre:"",materia:"",email:"",cursos:[],activo:true}); setModal("nuevo_maestro"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #8B5CF6",background:"#F5F3FF",color:"#8B5CF6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo maestro</button>
          <ListToolbar busqueda={ctrlMaestros.busqueda} setBusqueda={ctrlMaestros.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"materia",label:"Materia"}]} sortKey={ctrlMaestros.sortKey} sortAsc={ctrlMaestros.sortAsc} toggleSort={ctrlMaestros.toggleSort} filterOptions={[{key:"activo",label:"Estado",options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}]}]} filtros={ctrlMaestros.filtros} setFiltro={ctrlMaestros.setFiltro} resetFiltros={ctrlMaestros.resetFiltros} total={ctrlMaestros.total} placeholder="Buscar maestro o materia..."/>
          {ctrlMaestros.items.map(m=>(
            <Card key={m.id} style={{padding:"14px 16px",marginBottom:10,opacity:m.activo?1:0.55}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:14,fontWeight:700}}>{m.nombre}</div>
                    {m.materia&&<Pill label={m.materia} color="#8B5CF6" bg="#F5F3FF"/>}
                    {!m.activo&&<Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                  </div>
                  {m.email&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{m.email}</div>}
                  {m.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtDM(m.fecha_nacimiento)}</div>}
                  {m.cursos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Cursos: {m.cursos.map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ")}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>{ setForm({...m,cursos:[...(m.cursos||[])]}); setModal("editar_maestro"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                  <button onClick={()=>setConfirm({nombre:m.nombre,msg:"Esta acción no se puede deshacer.",action:()=>eliminarMaestro(m.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </div>
            </Card>
          ))}
          <Paginador pagina={ctrlMaestros.pagina} totalPag={ctrlMaestros.totalPag} setPagina={ctrlMaestros.setPagina}/>
        </>
      )}

      {sec==="codigos"&&(
        <CodigosInvitacion cursos={cursos}/>
      )}

      {sec==="alertas"&&(
        <AlertasAdmin cursos={cursos}/>
      )}
      {sec==="comunicaciones"&&(
        <ComunicacionesAdmin cursos={cursos}/>
      )}
      {sec==="horarios"&&(
        <HorariosAdmin cursos={cursos}/>
      )}
      {sec==="uniformes"&&(
        <UniformesAdmin cursos={cursos}/>
      )}
      {sec==="colegio"&&(
        <Contacto isSuperAdmin={true}/>
      )}

      {sec==="menu"&&(
        <div>
          <div style={{fontSize:15,fontWeight:900,marginBottom:4}}>🍽️ Menú comedor</div>
          <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>Cargá el menú mensual desde un archivo Excel. Se reemplaza el menú completo con cada carga.</div>
          <UploadMenuExcel onDone={()=>{}}/>
          <div style={{marginTop:16,background:"#F8FAFC",borderRadius:14,padding:"16px 18px",border:"1px solid #E2E8F0"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:10}}>📋 Formato esperado del Excel</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {[
                {col:"fecha",    desc:"Fecha del día (DD/MM/YYYY o YYYY-MM-DD)", req:true},
                {col:"entrada",  desc:"Entrada o sopa",                           req:false},
                {col:"plato 1",  desc:"Plato principal 1",                        req:false},
                {col:"plato 2",  desc:"Plato principal 2 (opcional)",             req:false},
                {col:"plato 3",  desc:"Plato principal 3 / acompañamiento",       req:false},
                {col:"postre 1", desc:"Postre principal",                         req:false},
                {col:"postre 2", desc:"Postre alternativo (opcional)",            req:false},
              ].map(f=>(
                <div key={f.col} style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                  <code style={{fontSize:11,fontWeight:700,background:"#E2E8F0",padding:"2px 7px",borderRadius:5,color:"#0F172A",flexShrink:0}}>{f.col}</code>
                  <span style={{fontSize:12,color:"#64748B"}}>{f.desc}</span>
                  {f.req&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"1px 6px",borderRadius:8,flexShrink:0}}>requerida</span>}
                </div>
              ))}
            </div>
            <div style={{marginTop:12,fontSize:11,color:"#94A3B8"}}>⚠️ Los nombres de columna se detectan automáticamente por palabra clave — cualquier columna que contenga "fecha", "plato", "postre", etc. es reconocida.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function AlertaModal({ onClose, onEnviar }) {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const enviar = async () => {
    if(!msg.trim()) return;
    setLoading(true);
    await onEnviar(msg);
    setLoading(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:400}}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🚨 Enviar alerta</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Este mensaje se mostrará de forma destacada a todos los apoderados del curso.</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Ej: Se suspenden las clases de mañana por paro docente." rows={4} style={{...inp,resize:"vertical",marginBottom:16}}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={enviar} disabled={loading||!msg.trim()} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{loading?"Enviando...":"Enviar alerta"}</button>
        </div>
      </Card>
    </div>
  );
}

export function AlertasAdmin({ cursos }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [alerta,   setAlerta]   = useState(null);
  const [modal,    setModal]    = useState(false);
  const [loading,  setLoading]  = useState(false);

  const cargar = async (cid) => {
    if(!cid) return;
    const { data } = await supabase.from("alertas").select("*").eq("curso_id",cid).eq("activa",true).order("creado_en",{ascending:false}).limit(1);
    setAlerta((data||[])[0]||null);
  };

  const selCurso = (c) => { setCursoSel(c); cargar(c.id); };

  const enviar = async (msg) => {
    if(!cursoSel||!msg.trim()) return;
    setLoading(true);
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoSel.id);
    await supabase.from("alertas").insert({curso_id:cursoSel.id,mensaje:msg,hora:"Ahora",activa:true});
    const userIds = await getUserIdsByCurso(cursoSel.id);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    setLoading(false); setModal(false); cargar(cursoSel.id);
  };

  const dismiss = async () => {
    if(alerta) { await supabase.from("alertas").update({activa:false}).eq("id",alerta.id); cargar(cursoSel.id); }
  };

  return (
    <div>
      {modal&&<AlertaModal onClose={()=>setModal(false)} onEnviar={enviar}/>}
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Seleccioná un curso para enviar una alerta</div>
      <div style={{marginBottom:20}}>
        <CursoListSelector cursos={cursos} seleccionados={cursoSel?[cursoSel.id]:[]} onToggle={id=>selCurso(cursos.find(c=>c.id===id))} multi={false}/>
      </div>
      {cursoSel&&(
        <div>
          {alerta?(
            <div style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <span style={{fontSize:22}}>🚨</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",marginBottom:2}}>Alerta activa — {cursoSel.nombre}</div>
                <div style={{fontSize:14,fontWeight:700,color:"white"}}>{alerta.mensaje}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setModal(true)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.2)",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>Editar</button>
                <button onClick={dismiss} style={{padding:"6px 12px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>Desactivar</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setModal(true)} disabled={loading} style={{width:"100%",padding:"14px 16px",borderRadius:14,border:"2px dashed #FCA5A5",background:"#FFF1F2",color:"#EF4444",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>🚨</span>
              <div style={{textAlign:"left"}}>
                <div>Enviar alerta a {cursoSel.nombre}</div>
                <div style={{fontSize:11,fontWeight:500,color:"#F87171"}}>Solo para avisos urgentes</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Publica un recordatorio idéntico en varios cursos a la vez (el Room Parent
// sigue publicando solo en su propio curso, sin cambios — esto es exclusivo
// de Super Admin). Un `grupo_id` (uuid) compartido marca las filas como parte
// de la misma comunicación, aunque cada una se edita/borra por curso como
// cualquier recordatorio (ver specs/comunicaciones-multi-curso.md).
export function ComunicacionesAdmin({ cursos }) {
  const [userId, setUserId] = useState(null);
  const [cursosSel, setCursosSel] = useState([]);
  const [form, setForm] = useState({ texto:"", fecha:"", prioridad:"media", urgente:false, adjuntos:[] });
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [ok, setOk] = useState(null);
  const [error, setError] = useState(null);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(!session?.user) return;
      supabase.from("usuarios").select("id").eq("auth_id",session.user.id).single()
        .then(({data})=>setUserId(data?.id??null));
    });
  },[]);

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const PRIO = { alta:{l:"Alta",c:"#EF4444",bg:"#FEF2F2"}, media:{l:"Media",c:"#F59E0B",bg:"#FFFBEB"}, baja:{l:"Baja",c:"#10B981",bg:"#F0FDF4"} };

  const toggleCurso = (id) => setCursosSel(p=> p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const todosSeleccionados = cursos.length>0 && cursosSel.length===cursos.length;
  const seleccionarTodos = () => setCursosSel(todosSeleccionados ? [] : cursos.map(c=>c.id));

  const publicar = async () => {
    if(!form.texto?.trim() || cursosSel.length===0) return;
    setPublicando(true);
    setError(null);
    try {
      const grupo_id = uuidLite();
      const rows = cursosSel.map(curso_id=>({
        texto: sanitize(form.texto), fecha: form.fecha||null, prioridad: form.prioridad||"media",
        urgente: form.urgente||false, adjuntos: form.adjuntos||[], curso_id, grupo_id, creado_por: userId,
      }));
      const { error: insertErr } = await supabase.from("recordatorios").insert(rows);
      if(insertErr) throw insertErr;
      const userIds = [...new Set((await Promise.all(cursosSel.map(getUserIdsByCurso))).flat())];
      if(userIds.length) await sendPush({ type:"recordatorio", payload:{ titulo:form.texto, userIds } });
      setConfirmando(false);
      setOk(`Publicado en ${cursosSel.length} curso${cursosSel.length!==1?"s":""}.`);
      setForm({ texto:"", fecha:"", prioridad:"media", urgente:false, adjuntos:[] });
      setCursosSel([]);
      setTimeout(()=>setOk(null),4000);
    } catch(e) {
      console.error("ComunicacionesAdmin.publicar:", e);
      setError(e?.message || "No se pudo publicar. Probá de nuevo.");
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4}}>Comunicación para varios cursos</div>
      <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Se publica como un recordatorio independiente en cada curso elegido.</div>

      {ok&&<div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,fontWeight:700,color:"#10B981"}}>✓ {ok}</div>}
      {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,fontWeight:700,color:"#EF4444"}}>⚠️ {error}</div>}

      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>TEXTO</div>
        <textarea value={form.texto} onChange={e=>setForm(p=>({...p,texto:e.target.value}))} placeholder="Ej: Reunión general de padres el viernes 15 a las 18hs" rows={3} style={{...inp,resize:"vertical"}}/>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:160}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>FECHA (opcional)</div>
          <input type="date" value={form.fecha||""} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PRIORIDAD</div>
          <div style={{display:"flex",gap:6}}>
            {["alta","media","baja"].map(p=>(
              <button key={p} onClick={()=>setForm(f=>({...f,prioridad:p}))} style={{padding:"7px 12px",borderRadius:8,border:`1.5px solid ${form.prioridad===p?PRIO[p].c:"#E2E8F0"}`,background:form.prioridad===p?PRIO[p].bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.prioridad===p?PRIO[p].c:"#94A3B8"}}>{PRIO[p].l}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <button onClick={()=>setForm(p=>({...p,urgente:!p.urgente}))} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${form.urgente?"#EF4444":"#E2E8F0"}`,background:form.urgente?"#FEF2F2":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.urgente?"#EF4444":"#94A3B8"}}>
          {form.urgente?"Urgente":"Marcar urgente"}
        </button>
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>ADJUNTOS (opcional)</div>
        <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId="comunicaciones" onUploadingChange={setSubiendoAdj}/>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700}}>¿A qué cursos aplica?</div>
        {cursos.length>0&&<button onClick={seleccionarTodos} style={{border:"none",background:"none",color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:700}}>{todosSeleccionados?"Ninguno":"Seleccionar todos"}</button>}
      </div>
      <div style={{marginBottom:20}}>
        <CursoListSelector cursos={cursos} seleccionados={cursosSel} onToggle={toggleCurso}/>
      </div>

      {!confirmando ? (
        <button onClick={()=>setConfirmando(true)} disabled={!form.texto?.trim()||cursosSel.length===0||subiendoAdj} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"none",background:(!form.texto?.trim()||cursosSel.length===0||subiendoAdj)?"#CBD5E1":"#3B82F6",color:"white",fontSize:13,fontWeight:700,cursor:(!form.texto?.trim()||cursosSel.length===0||subiendoAdj)?"default":"pointer"}}>
          Publicar
        </button>
      ) : (
        <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>¿Publicar en {cursosSel.length} curso{cursosSel.length!==1?"s":""}?</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmando(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
            <button onClick={publicar} disabled={publicando} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{publicando?"Publicando...":"Sí, publicar"}</button>
          </div>
        </div>
      )}

      <HistorialComunicaciones cursos={cursos} recargarVer={ok}/>
    </div>
  );
}

function HistorialComunicaciones({ cursos, recargarVer }) {
  const [comunicaciones, setComunicaciones] = useState([]);
  const [abierto,        setAbierto]        = useState(false);
  const [cargando,       setCargando]       = useState(false);

  const cursoPorId = new Map(cursos.map(c=>[c.id,c]));

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("recordatorios")
      .select("id,texto,fecha,prioridad,urgente,curso_id,grupo_id,creado_en")
      .not("grupo_id","is",null)
      .order("creado_en",{ascending:false})
      .limit(300);
    // Una comunicación multi-curso genera N filas (una por curso) con el mismo
    // grupo_id — se agrupan en una sola entrada del historial.
    const grupos = new Map();
    for(const r of (data||[])) {
      const g = grupos.get(r.grupo_id);
      if(g) g.cursoIds.push(r.curso_id);
      else grupos.set(r.grupo_id, { ...r, cursoIds:[r.curso_id] });
    }
    setComunicaciones([...grupos.values()].sort((a,b)=> (b.creado_en||"").localeCompare(a.creado_en||"")));
    setCargando(false);
  };

  const toggle = () => {
    if(!abierto && comunicaciones.length===0) cargar();
    setAbierto(p=>!p);
  };

  // Recargar cuando se publica una nueva comunicación (ok pasa de null a un mensaje).
  useEffect(()=>{ if(recargarVer && abierto) cargar(); },[recargarVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";

  return (
    <div style={{marginTop:24}}>
      <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#0F172A"}}>
        <span>📋 Historial de comunicaciones</span>
        <span style={{fontSize:16,color:"#94A3B8",transform:abierto?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
      </button>

      {abierto && (
        <div style={{marginTop:8}}>
          {cargando && <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Cargando...</div>}
          {!cargando && comunicaciones.length===0 && (
            <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Todavía no se publicó ninguna comunicación este año.</div>
          )}
          {!cargando && comunicaciones.map(c=>(
            <div key={c.grupo_id} style={{padding:"12px 14px",marginBottom:6,borderRadius:12,background:"white",border:"1px solid #E2E8F0",borderLeft:`3px solid ${c.urgente?"#EF4444":"#3B82F6"}`}}>
              <div style={{fontSize:13,fontWeight:600,color:"#0F172A",lineHeight:1.4,marginBottom:6}}>{c.texto}</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:"#94A3B8"}}>{fmtFecha(c.creado_en)}</span>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#EFF6FF",color:"#3B82F6"}}>{c.cursoIds.length} curso{c.cursoIds.length!==1?"s":""}</span>
                {c.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"2px 7px",borderRadius:8}}>Urgente</span>}
              </div>
              <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                {c.cursoIds.map(cid=>{
                  const curso = cursoPorId.get(cid);
                  if(!curso) return null;
                  return <span key={cid} style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#F1F5F9",color:"#64748B"}}>{curso.avatar} {curso.nombre}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HorariosAdmin({ cursos }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [horarios, setHorarios] = useState([]);
  const [maestros, setMaestros] = useState([]);
  const [horForm,  setHorForm]  = useState(null);
  const [saving,   setSaving]   = useState(false);

  const cargar = async (cid) => {
    if(!cid) return;
    const [hor, mae] = await Promise.all([
      supabase.from("horarios").select("*").eq("curso_id",cid).order("dia").order("hora_inicio"),
      supabase.from("maestros").select("id,nombre,materia").eq("activo",true)
        .in("id", (await supabase.from("maestro_cursos").select("maestro_id").eq("curso_id",cid)).data?.map(r=>r.maestro_id)||[]),
    ]);
    setHorarios(hor.data||[]);
    setMaestros(mae.data||[]);
  };

  const selCurso = (c) => { setCursoSel(c); cargar(c.id); };

  const guardar = async () => {
    if(!horForm?.materia?.trim()||!horForm?.dia||!horForm?.hora_inicio||!horForm?.hora_fin||!cursoSel) return;
    setSaving(true);
    const payload = { materia:horForm.materia.trim(), dia:horForm.dia, hora_inicio:horForm.hora_inicio, hora_fin:horForm.hora_fin, docente:horForm.docente||null, color:horForm.color||"#3B82F6", curso_id:cursoSel.id };
    if(horForm.id) await supabase.from("horarios").update(payload).eq("id",horForm.id);
    else           await supabase.from("horarios").insert(payload);
    setSaving(false); setHorForm(null); cargar(cursoSel.id);
  };

  const eliminar = async (id) => {
    await supabase.from("horarios").delete().eq("id",id);
    cargar(cursoSel.id);
  };

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  return (
    <div>
      {/* Modal */}
      {horForm!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{horForm?.id?"Editar clase":"Nueva clase"} — {cursoSel?.nombre}</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>DÍA</div>
              <select value={horForm.dia||"Lunes"} onChange={e=>setHorForm(p=>({...p,dia:e.target.value}))} style={inp}>
                {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"].map(d=><option key={d} value={d}>{d}</option>)}
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
              <input value={horForm.materia||""} onChange={e=>setHorForm(p=>({...p,materia:e.target.value}))} placeholder="Ej: Matemáticas" style={inp}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>DOCENTE</div>
              <select value={horForm.docente||""} onChange={e=>setHorForm(p=>({...p,docente:e.target.value}))} style={inp}>
                <option value="">— Sin asignar —</option>
                {maestros.map(m=><option key={m.id} value={m.nombre}>{m.nombre}{m.materia?" · "+m.materia:""}</option>)}
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
              <button onClick={guardar} disabled={saving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar clase"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Selector de curso */}
      <div style={{marginBottom:20}}>
        <CursoListSelector cursos={cursos} seleccionados={cursoSel?[cursoSel.id]:[]} onToggle={id=>selCurso(cursos.find(c=>c.id===id))} multi={false}/>
      </div>

      {!cursoSel&&<div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>Seleccioná un curso para ver y editar su horario</div>}

      {cursoSel&&(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:14,fontWeight:700}}>{cursoSel.avatar} {cursoSel.nombre}</div>
            <button onClick={()=>setHorForm({dia:"Lunes",hora_inicio:"08:00",hora_fin:"09:00",materia:"",docente:"",color:"#3B82F6"})} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nueva clase</button>
          </div>
          {horarios.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Sin clases cargadas para este curso</div>}
          {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"].map(dia=>{
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
                    <span style={{fontSize:11,color:"#64748B",whiteSpace:"nowrap"}}>{h.hora_inicio?.slice(0,5)} – {h.hora_fin?.slice(0,5)}</span>
                    <button onClick={()=>setHorForm({...h})} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11}}>✏️</button>
                    <button onClick={()=>eliminar(h.id)} style={{padding:"3px 8px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export function UniformesAdmin({ cursos }) {
  const [uniformes, setUniformes] = useState([]);
  const [links,     setLinks]     = useState([]); // [{uniforme_id, curso_id}]
  const [modal,     setModal]     = useState(null); // null | {mode:"newU"|"editU"|"newItem"|"editItem", u?, it?}
  const [form,      setForm]      = useState({tipo:"",emoji:"👕",item:""});
  const [saving,    setSaving]    = useState(false);

  const EMOJIS_UNI = ["👕","👖","👟","🧥","🎽","🧢","👗","🩳"];
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const cargar = async () => {
    const [uni, lnk] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").order("tipo"),
      supabase.from("uniforme_cursos").select("uniforme_id,curso_id"),
    ]);
    setUniformes(uni.data||[]);
    setLinks(lnk.data||[]);
  };

  useEffect(()=>{ cargar(); },[]);

  const toggleCurso = async (uniformeId, cursoId) => {
    const exists = links.some(l=>l.uniforme_id===uniformeId&&l.curso_id===cursoId);
    if(exists) {
      await supabase.from("uniforme_cursos").delete().eq("uniforme_id",uniformeId).eq("curso_id",cursoId);
      setLinks(p=>p.filter(l=>!(l.uniforme_id===uniformeId&&l.curso_id===cursoId)));
    } else {
      await supabase.from("uniforme_cursos").insert({uniforme_id:uniformeId,curso_id:cursoId});
      setLinks(p=>[...p,{uniforme_id:uniformeId,curso_id:cursoId}]);
    }
  };

  const guardar = async () => {
    if(!modal) return;
    setSaving(true);
    if(modal.mode==="newU") {
      if(!form.tipo.trim()) { setSaving(false); return; }
      await supabase.from("uniformes").insert({tipo:form.tipo.trim(),emoji:form.emoji||"👕"});
    } else if(modal.mode==="editU") {
      await supabase.from("uniformes").update({tipo:form.tipo.trim(),emoji:form.emoji||"👕"}).eq("id",modal.u.id);
    } else if(modal.mode==="newItem") {
      if(!form.item.trim()) { setSaving(false); return; }
      await supabase.from("uniforme_items").insert({uniforme_id:modal.u.id,item:form.item.trim()});
    } else if(modal.mode==="editItem") {
      if(!form.item.trim()) { setSaving(false); return; }
      await supabase.from("uniforme_items").update({item:form.item.trim()}).eq("id",modal.it.id);
    }
    setSaving(false); setModal(null); cargar();
  };

  const eliminarU    = async (id) => { await supabase.from("uniformes").delete().eq("id",id); cargar(); };
  const eliminarItem = async (id) => { await supabase.from("uniforme_items").delete().eq("id",id); cargar(); };

  const openModal = (mode,u=null,it=null) => {
    setModal({mode,u,it});
    if(mode==="newU")     setForm({tipo:"",emoji:"👕",item:""});
    if(mode==="editU")    setForm({tipo:u.tipo||"",emoji:u.emoji||"👕",item:""});
    if(mode==="newItem")  setForm({tipo:"",emoji:"",item:""});
    if(mode==="editItem") setForm({tipo:"",emoji:"",item:it.item||""});
  };

  const modalTitle = modal ? ({newU:"Nueva categoría",editU:"Editar categoría",newItem:"Agregar ítem",editItem:"Editar ítem"}[modal.mode]) : "";

  return (
    <div>
      {/* Modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:14,fontWeight:900,marginBottom:14}}>{modalTitle}{modal.u?" — "+modal.u.tipo:""}</div>
            {(modal.mode==="newU"||modal.mode==="editU")&&(<>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>NOMBRE</div>
                <input value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))} placeholder="Ej: Deportivo, Formal..." style={inp} autoFocus/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:8}}>EMOJI</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {EMOJIS_UNI.map(e=>(
                    <button key={e} onClick={()=>setForm(p=>({...p,emoji:e}))} style={{width:36,height:36,borderRadius:8,border:form.emoji===e?"2.5px solid #3B82F6":"1.5px solid #E2E8F0",background:form.emoji===e?"#EFF6FF":"white",fontSize:18,cursor:"pointer"}}>{e}</button>
                  ))}
                </div>
              </div>
            </>)}
            {(modal.mode==="newItem"||modal.mode==="editItem")&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>ÍTEM</div>
                <input value={form.item} onChange={e=>setForm(p=>({...p,item:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&guardar()} placeholder="Ej: Remera blanca manga corta" style={inp} autoFocus/>
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:13,color:"#94A3B8"}}>Categorías de uniforme del colegio</div>
        <button onClick={()=>openModal("newU")} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Nueva categoría</button>
      </div>

      {uniformes.length===0&&<div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>Sin categorías creadas aún</div>}

      {uniformes.map((u,i)=>{
        const items = u.uniforme_items||[];
        const cursosLinked = links.filter(l=>l.uniforme_id===u.id).map(l=>l.curso_id);
        const bg = ["#EEF2FF","#F0FDF4","#FFF7ED"][i%3];
        return (
          <Card key={u.id} style={{marginBottom:14,overflow:"hidden"}}>
            {/* Header categoría */}
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:bg,borderBottom:"1px solid #F1F5F9"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{u.emoji||"👕"}</div>
              <span style={{fontSize:14,fontWeight:800,flex:1}}>{u.tipo}</span>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>openModal("newItem",u)} style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontWeight:700}}>+ Ítem</button>
                <button onClick={()=>openModal("editU",u)} style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#64748B"}}>✏️</button>
                <button onClick={()=>eliminarU(u.id)} style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#EF4444"}}>🗑</button>
              </div>
            </div>

            {/* Ítems */}
            {items.sort((a,b)=>a.item.localeCompare(b.item,"es")).map((it,j)=>(
              <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderBottom:"1px solid #F8FAFC",background:j%2===0?"white":"#FAFAFA"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
                <span style={{fontSize:13,flex:1}}>{it.item}</span>
                <button onClick={()=>openModal("editItem",u,it)} style={{fontSize:11,padding:"3px 7px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#64748B"}}>✏️</button>
                <button onClick={()=>eliminarItem(it.id)} style={{fontSize:11,padding:"3px 7px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",color:"#EF4444"}}>🗑</button>
              </div>
            ))}
            {items.length===0&&<div style={{padding:"8px 14px",fontSize:12,color:"#94A3B8"}}>Sin ítems aún.</div>}

            {/* Cursos asignados */}
            <div style={{padding:"10px 14px",borderTop:"1px solid #F1F5F9",background:"#FAFAFA"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Cursos que usan esta categoría</div>
              <CursoListSelector cursos={cursos} seleccionados={cursosLinked} onToggle={id=>toggleCurso(u.id,id)} maxHeight={150}/>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function UploadAlumnosExcel({ cursos, onDone }) {
  const [loading,setLoading] = useState(false);
  const [msg,setMsg]         = useState("");

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setLoading(true); setMsg("");
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, {cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {raw:true});
      if(!rows.length) throw new Error("Archivo vacío");
      console.log("Alumnos - primera fila:", rows[0]);

      const parseFecha = (val) => {
        if(!val) return null;
        if(val instanceof Date) return val.toISOString().split("T")[0];
        const s = String(val).trim();
        if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
        if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
          const [d,m,y]=s.split("/");
          return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        }
        return null;
      };

      const findCurso = (val) => {
        if(!val) return null;
        const n = Number(val);
        if(!isNaN(n)) return n;
        const s = String(val).trim().toLowerCase();
        const c = cursos.find(c=>c.nombre.toLowerCase()===s);
        return c?.id||null;
      };

      const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
      const inserts = rows.map(r=>{
        const nombre   = String(r.nombre||"").trim();
        const apellido = String(r.apellido||"").trim();
        const curso_id = findCurso(r.curso_id||r.curso);
        if(!nombre||!curso_id) return null;
        const avatar = `${nombre[0]||""}${apellido[0]||""}`.toUpperCase() || nombre.slice(0,2).toUpperCase();
        const color  = colors[Math.floor(Math.random()*colors.length)];
        const dni = r.dni ? String(r.dni).trim() : null;
        return { nombre, apellido:apellido||null, curso_id, avatar, color, fecha_nacimiento:parseFecha(r.fecha_nacimiento||r.fecha), dni };
      }).filter(Boolean);

      if(!inserts.length) throw new Error("No se encontraron filas válidas. Verificá las columnas: nombre, apellido, curso_id, fecha_nacimiento, dni");

      // Upsert por nombre+apellido+curso_id — NO borrar relaciones usuario_hijos
      let ok = 0;
      for(const alumno of inserts) {
        const { data: existing } = await supabase.from("hijos")
          .select("id")
          .eq("nombre", alumno.nombre)
          .eq("apellido", alumno.apellido||"")
          .eq("curso_id", alumno.curso_id)
          .maybeSingle();
        if(existing?.id) {
          await supabase.from("hijos").update({
            fecha_nacimiento: alumno.fecha_nacimiento||null,
            dni: alumno.dni||null,
            avatar: alumno.avatar,
            color: alumno.color,
          }).eq("id", existing.id);
        } else {
          await supabase.from("hijos").insert(alumno);
        }
        ok++;
      }
      setMsg(`✅ ${ok} alumnos procesados correctamente`);
      onDone();
    } catch(err) {
      setMsg(`❌ ${err.message}`);
      console.error(err);
    }
    setLoading(false);
    e.target.value="";
  };

  return (
    <div style={{marginBottom:16}}>
      <label style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:12,border:"2px dashed #10B981",background:"#F0FDF4",cursor:"pointer",maxWidth:"100%"}}>
        <span style={{fontSize:20}}>📤</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#10B981"}}>{loading?"Procesando...":"Carga masiva desde Excel"}</div>
          <div style={{fontSize:11,color:"#94A3B8"}}>Columnas: nombre, apellido, curso_id, fecha_nacimiento, dni</div>
        </div>
        <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}} disabled={loading}/>
      </label>
      {msg&&<div style={{fontSize:13,marginTop:8,fontWeight:600,color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</div>}
    </div>
  );
}

export function UploadApoderadosExcel({ onDone }) {
  const [loading,setLoading] = useState(false);
  const [msg,setMsg]         = useState("");

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setLoading(true); setMsg("");
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, {cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {raw:true});
      if(!rows.length) throw new Error("Archivo vacío");
      console.log("Apoderados - primera fila:", rows[0]);

      const inserts = rows.map(r=>{
        // Soportar columna "nombre" (nombre completo) o "nombre" + "apellido" por separado
        const nombre   = String(r.nombre||"").trim();
        const apellido = String(r.apellido||"").trim();
        const email    = String(r.email||"").trim().toLowerCase();
        const pass     = String(r.pass||r.contraseña||r.password||"1234").trim();
        if(!nombre||!email) return null;
        // Avatar: iniciales de nombre + apellido si están separados, si no del nombre completo
        const avatar = apellido
          ? `${nombre[0]||""}${apellido[0]||""}`.toUpperCase()
          : nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const dni = r.dni ? String(r.dni).trim() : null;
        return {
          nombre, apellido: apellido||null, email, pass, avatar, dni,
          telefono: r.telefono ? String(r.telefono).trim() : null,
          rol:      r.rol||"padre",
          activo:   true,
        };
      }).filter(Boolean);

      if(!inserts.length) throw new Error("No se encontraron filas válidas. Verificá las columnas: nombre, apellido, email, pass, telefono, dni");

      // Upsert por email — actualizar si existe, crear en Auth si no. NO borrar relaciones.
      let ok = 0, err2 = null;
      for(const u of inserts) {
        const { data: existing } = await supabase.from("usuarios").select("id,auth_id").eq("email", u.email).maybeSingle();
        if(existing?.id) {
          // Ya existe — solo actualizar datos, no tocar pass ni auth
          const { error: e } = await supabase.from("usuarios").update({
            nombre:u.nombre, apellido:u.apellido||null, telefono:u.telefono||null, dni:u.dni||null, activo:true
          }).eq("id", existing.id);
          if(e) err2 = e; else ok++;
        } else {
          // Nuevo usuario — crear en Supabase Auth via Edge Function
          let auth_id = null;
          try {
            const { auth_id: newId } = await authAdminCreate(u.email, u.pass);
            auth_id = newId || null;
          } catch(authErr) {
            console.error("Error creando en Auth:", u.email, authErr);
          }
          const { error: e } = await supabase.from("usuarios").insert({
            nombre: u.nombre, apellido: u.apellido||null, email: u.email,
            avatar: u.avatar, dni: u.dni||null,
            telefono: u.telefono||null, rol: u.rol||"padre",
            activo: true, auth_id,
          });
          if(e) err2 = e; else ok++;
        }
      }
      if(err2) throw err2;
      setMsg(`✅ ${ok} apoderados procesados correctamente`);
      onDone();
    } catch(err) {
      setMsg(`❌ ${err.message}`);
      console.error(err);
    }
    setLoading(false);
    e.target.value="";
  };

  return (
    <div style={{marginBottom:16}}>
      <label style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",cursor:"pointer",maxWidth:"100%"}}>
        <span style={{fontSize:20}}>📤</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#3B82F6"}}>{loading?"Procesando...":"Carga masiva desde Excel"}</div>
          <div style={{fontSize:11,color:"#94A3B8"}}>Columnas: nombre, apellido, email, pass, telefono, dni, rol</div>
        </div>
        <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}} disabled={loading}/>
      </label>
      {msg&&<div style={{fontSize:13,marginTop:8,fontWeight:600,color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</div>}
    </div>
  );
}

// ── Gestión de códigos de invitación ─────────────────────────────────────────
// Requiere tabla en Supabase (ver instrucciones en features/auth/index.jsx)
function CodigosInvitacion({ cursos }) {
  const [codigos,    setCodigos]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [cursoSel,   setCursoSel]   = useState("");
  const [usosMax,    setUsosMax]    = useState(10);
  const [saving,     setSaving]     = useState(false);
  const [copiado,    setCopiado]    = useState(null);
  const inp = {padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC"};

  const cargar = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("codigos_invitacion")
      .select("*, cursos(nombre)")
      .order("creado_en", { ascending: false });
    setCodigos(data||[]);
    setLoading(false);
  };

  useEffect(()=>{ cargar(); },[]);

  const genCodigo = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusión
    return Array.from({length:6}, ()=>chars[Math.floor(Math.random()*chars.length)]).join("");
  };

  const crear = async () => {
    if(!cursoSel) return;
    setSaving(true);
    const codigo = genCodigo();
    await supabase.from("codigos_invitacion").insert({
      codigo, curso_id: Number(cursoSel),
      usos_max: Number(usosMax)||10, usos_actuales:0, activo:true,
    });
    setSaving(false);
    cargar();
  };

  const toggleActivo = async (id, activo) => {
    await supabase.from("codigos_invitacion").update({ activo: !activo }).eq("id", id);
    cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("codigos_invitacion").delete().eq("id", id);
    cargar();
  };

  const copiar = (codigo) => {
    navigator.clipboard?.writeText(codigo).catch(()=>{});
    setCopiado(codigo);
    setTimeout(()=>setCopiado(null), 2000);
  };

  return (
    <div>
      <div style={{fontSize:15,fontWeight:900,marginBottom:4}}>🔑 Códigos de invitación</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>
        Generá un código para que los apoderados puedan registrarse solos en la app.
      </div>

      {/* Crear nuevo código */}
      <Card style={{padding:"16px 20px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Nuevo código</div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:2,minWidth:160}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>Curso</div>
            <select value={cursoSel} onChange={e=>setCursoSel(e.target.value)} style={{...inp,width:"100%"}}>
              <option value="">— Seleccioná un curso —</option>
              {cursos.map(c=><option key={c.id} value={c.id}>{c.avatar} {c.nombre}</option>)}
            </select>
          </div>
          <div style={{width:100}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>Usos máx.</div>
            <input type="number" min="1" max="200" value={usosMax} onChange={e=>setUsosMax(e.target.value)} style={{...inp,width:"100%"}}/>
          </div>
          <button onClick={crear} disabled={!cursoSel||saving} style={{padding:"9px 18px",borderRadius:10,border:"none",background:(!cursoSel||saving)?"#E2E8F0":"#3B82F6",color:(!cursoSel||saving)?"#94A3B8":"white",cursor:(!cursoSel||saving)?"default":"pointer",fontSize:13,fontWeight:700,flexShrink:0}}>
            {saving?"Generando...":"+ Generar"}
          </button>
        </div>
      </Card>

      {/* Lista de códigos */}
      {loading && <div style={{textAlign:"center",padding:32,color:"#94A3B8"}}>Cargando...</div>}
      {!loading && codigos.length===0 && (
        <div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>No hay códigos generados aún</div>
      )}
      {!loading && codigos.map(c=>(
        <Card key={c.id} style={{padding:"14px 16px",marginBottom:10,opacity:c.activo?1:0.55}}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            {/* Código grande y copiable */}
            <div
              onClick={()=>copiar(c.codigo)}
              style={{fontFamily:"monospace",fontSize:22,fontWeight:900,letterSpacing:4,color:"#0F172A",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:10,padding:"6px 14px",cursor:"pointer",userSelect:"all",flexShrink:0}}
              title="Clic para copiar"
            >
              {c.codigo}
            </div>
            {copiado===c.codigo&&<span style={{fontSize:11,color:"#10B981",fontWeight:700}}>✓ Copiado</span>}

            <div style={{flex:1,minWidth:120}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{c.cursos?.nombre||"—"}</div>
              <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                {c.usos_actuales}/{c.usos_max} usos
                {!c.activo&&<span style={{marginLeft:8,color:"#EF4444",fontWeight:700}}>Inactivo</span>}
                {c.activo&&c.usos_actuales>=c.usos_max&&<span style={{marginLeft:8,color:"#F59E0B",fontWeight:700}}>Agotado</span>}
              </div>
            </div>

            {/* Barra de progreso de usos */}
            <div style={{width:80,flexShrink:0}}>
              <div style={{height:6,borderRadius:3,background:"#F1F5F9",overflow:"hidden"}}>
                <div style={{height:"100%",borderRadius:3,background:c.usos_actuales>=c.usos_max?"#EF4444":"#10B981",width:`${Math.min(100,(c.usos_actuales/c.usos_max)*100)}%`}}/>
              </div>
            </div>

            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>copiar(c.codigo)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:700,color:"#3B82F6"}}>
                {copiado===c.codigo?"✓":"📋"} Copiar
              </button>
              <button onClick={()=>toggleActivo(c.id,c.activo)} style={{padding:"5px 10px",borderRadius:8,border:`1px solid ${c.activo?"#FCA5A5":"#BBF7D0"}`,background:c.activo?"#FEF2F2":"#F0FDF4",cursor:"pointer",fontSize:11,fontWeight:700,color:c.activo?"#EF4444":"#10B981"}}>
                {c.activo?"Desactivar":"Activar"}
              </button>
              <button onClick={()=>eliminar(c.id)} style={{padding:"5px 8px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:12,color:"#94A3B8"}}>🗑</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
