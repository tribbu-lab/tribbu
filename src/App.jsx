// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

const T = {
  primary:"#0F172A", accent:"#3B82F6", green:"#10B981",
  yellow:"#F59E0B", red:"#EF4444", purple:"#8B5CF6",
  bg:"#F8FAFC", card:"#FFFFFF", text:"#0F172A", muted:"#94A3B8", border:"#E2E8F0",
};

const fmtM   = m => `$${Math.abs(m).toLocaleString("es-AR")}`;
const fmtF   = s => new Date(s+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"});
const dHasta = s => { const h=new Date();h.setHours(0,0,0,0);const f=new Date(s+"T00:00:00");f.setHours(0,0,0,0);return Math.ceil((f-h)/86400000); };
const MESES  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const ROL_LABEL = { padre:"Apoderado", admin:"Room Parent", super:"Super Admin" };
const ROL_COLOR = { padre:"#3B82F6", admin:"#10B981", super:"#8B5CF6" };
const ROL_BG    = { padre:"#EFF6FF", admin:"#F0FDF4", super:"#F5F3FF" };

const HORARIOS = {
  1:[
    { dia:"Lunes",    clases:["Matemáticas 8:00","Lengua 9:30","Ed. Física 11:00","Cs. Naturales 14:00"] },
    { dia:"Martes",   clases:["Inglés 8:00","Plástica 9:30","Matemáticas 11:00","Música 14:00"] },
    { dia:"Miércoles",clases:["Lengua 8:00","Cs. Sociales 9:30","Ed. Física 11:00"] },
    { dia:"Jueves",   clases:["Matemáticas 8:00","Inglés 9:30","Lengua 11:00","Tecnología 14:00"] },
    { dia:"Viernes",  clases:["Cs. Naturales 8:00","Lengua 9:30","Música 11:00"] },
  ],
  2:[
    { dia:"Lunes",    clases:["Matemáticas 8:00","Lengua 9:30","Inglés 11:00"] },
    { dia:"Martes",   clases:["Cs. Naturales 8:00","Ed. Física 9:30","Plástica 11:00"] },
    { dia:"Miércoles",clases:["Lengua 8:00","Matemáticas 9:30","Música 11:00"] },
    { dia:"Jueves",   clases:["Inglés 8:00","Cs. Sociales 9:30","Tecnología 11:00"] },
    { dia:"Viernes",  clases:["Lengua 8:00","Ed. Física 9:30","Matemáticas 11:00"] },
  ],
};

const Card = ({children,style={}}) => (
  <div style={{background:"#FFFFFF",borderRadius:16,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",border:"1px solid #E2E8F0",...style}}>{children}</div>
);
const Pill = ({label,color,bg}) => (
  <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:bg||"#EFF6FF",color:color||"#3B82F6",whiteSpace:"nowrap"}}>{label}</span>
);
const Spinner = () => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60}}>
    <div style={{width:36,height:36,border:"3px solid #E2E8F0",borderTop:"3px solid #3B82F6",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

function useIsMobile() {
  const [v,setV] = useState(window.innerWidth < 768);
  useEffect(()=>{ const h=()=>setV(window.innerWidth<768); window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h); },[]);
  return v;
}

function Login({ onLogin }) {
  const [email,setEmail] = useState("dam@mail.com");
  const [pass,setPass]   = useState("dam1234");
  const [err,setErr]     = useState("");
  const [ld,setLd]       = useState(false);

  const go = async () => {
    setErr(""); setLd(true);
    const { data, error } = await supabase
      .from("usuarios")
      .select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id)")
      .eq("email", email)
      .eq("pass", pass)
      .eq("activo", true)
      .single();
    setLd(false);
    if(error || !data) { setErr("Correo o contraseña incorrectos"); return; }
    onLogin({
      ...data,
      hijos:  data.usuario_hijos.map(r=>r.hijo_id),
      cursos: data.usuario_cursos.map(r=>r.curso_id),
    });
  };

  const demos = [
    { label:"Apoderado",   hint:"dam@mail.com · dam1234",      e:"dam@mail.com",   p:"dam1234" },
    { label:"Room Parent", hint:"luciana@mail.com · 1234",     e:"luciana@mail.com", p:"1234"  },
    { label:"Super Admin", hint:"admin@mail.com · super",      e:"admin@mail.com", p:"super"   },
  ];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:40,fontWeight:900,color:"white",letterSpacing:-2,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Comunidad escolar</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"28px 24px",border:"1px solid rgba(255,255,255,0.10)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Correo</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"}} placeholder="correo@mail.com"/>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Contraseña</div>
          <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} type="password" style={{width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"}}/>
        </div>
        {err && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
        <button onClick={go} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:ld?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:18}}>
          {ld?"Ingresando...":"Ingresar"}
        </button>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:16}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textAlign:"center",marginBottom:10,textTransform:"uppercase",letterSpacing:0.8}}>Accesos demo</div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {demos.map(d=>(
              <button key={d.label} onClick={()=>{setEmail(d.e);setPass(d.p);}} style={{flex:1,minWidth:90,padding:"9px 6px",borderRadius:11,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",cursor:"pointer",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.85)"}}>{d.label}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:2}}>{d.hint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SuperAdmin() {
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

  useEffect(()=>{ cargar(); },[]);

  const cargar = async () => {
    setLoading(true);
    const [u,c,h,m,mc] = await Promise.all([
      supabase.from("usuarios").select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id)").order("id"),
      supabase.from("cursos").select("*").order("id"),
      supabase.from("hijos").select("*").order("id"),
      supabase.from("maestros").select("*").order("id"),
      supabase.from("maestro_cursos").select("*"),
    ]);
    setUsuarios((u.data||[]).map(u=>({...u,hijos:u.usuario_hijos.map(r=>r.hijo_id),cursos:u.usuario_cursos.map(r=>r.curso_id)})));
    setCursos(c.data||[]);
    setHijos(h.data||[]);
    const mcData = mc.data||[];
    setMaestros((m.data||[]).map(x=>({...x, cursos: mcData.filter(r=>r.maestro_id===x.id).map(r=>r.curso_id)})));
    const al = await supabase.from("hijos").select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,email,telefono))").order("nombre");
    setAlumnos(al.data||[]);
    setLoading(false);
  };

  const guardarUsuario = async () => {
    if(!form.nombre||!form.email||!form.pass) return;
    const avatar = form.avatar||form.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    if(modal==="nuevo_usuario") {
      const { data } = await supabase.from("usuarios").insert({nombre:form.nombre,email:form.email,pass:form.pass,rol:form.rol,avatar,activo:form.activo}).select().single();
      if(data) {
        if(form.rol==="admin"&&form.cursos.length) await supabase.from("usuario_cursos").insert(form.cursos.map(cid=>({usuario_id:data.id,curso_id:cid})));
        if(form.rol==="padre"&&form.hijos.length)  await supabase.from("usuario_hijos").insert(form.hijos.map(hid=>({usuario_id:data.id,hijo_id:hid})));
      }
    } else {
      await supabase.from("usuarios").update({nombre:form.nombre,email:form.email,pass:form.pass,rol:form.rol,activo:form.activo}).eq("id",form.id);
      await supabase.from("usuario_cursos").delete().eq("usuario_id",form.id);
      await supabase.from("usuario_hijos").delete().eq("usuario_id",form.id);
      if(form.rol==="admin"&&form.cursos.length) await supabase.from("usuario_cursos").insert(form.cursos.map(cid=>({usuario_id:form.id,curso_id:cid})));
      if(form.rol==="padre"&&form.hijos.length)  await supabase.from("usuario_hijos").insert(form.hijos.map(hid=>({usuario_id:form.id,hijo_id:hid})));
    }
    setModal(null); cargar();
  };

  const guardarCurso = async () => {
    if(!form.nombre) return;
    await supabase.from("cursos").insert({nombre:form.nombre,avatar:form.avatar||"🏫",color:form.color||"#3B82F6"});
    setModal(null); cargar();
  };

  const actualizarCurso = async () => {
    if(!form.nombre) return;
    await supabase.from("cursos").update({nombre:form.nombre,avatar:form.avatar,color:form.color}).eq("id",form.id);
    setModal(null); cargar();
  };

  const toggleActivo = async (u) => {
    await supabase.from("usuarios").update({activo:!u.activo}).eq("id",u.id);
    cargar();
  };

  const eliminarUsuario = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("usuario_id",id);
    await supabase.from("usuario_cursos").delete().eq("usuario_id",id);
    await supabase.from("usuarios").delete().eq("id",id);
    setConfirm(null); cargar();
  };

  const eliminarCurso = async (id) => {
    await supabase.from("cursos").delete().eq("id",id);
    setConfirm(null); cargar();
  };

  const guardarMaestro = async () => {
    if(!form.nombre) return;
    const avatar = form.avatar||form.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    if(modal==="nuevo_maestro") {
      const { data } = await supabase.from("maestros").insert({nombre:form.nombre,materia:form.materia||null,email:form.email||null,avatar,activo:form.activo!==false}).select().single();
      if(data && form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map(cid=>({maestro_id:data.id,curso_id:cid})));
    } else {
      await supabase.from("maestros").update({nombre:form.nombre,materia:form.materia||null,email:form.email||null,activo:form.activo!==false}).eq("id",form.id);
      await supabase.from("maestro_cursos").delete().eq("maestro_id",form.id);
      if(form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map(cid=>({maestro_id:form.id,curso_id:cid})));
    }
    setModal(null); cargar();
  };

  const eliminarMaestro = async (id) => {
    await supabase.from("maestro_cursos").delete().eq("maestro_id",id);
    await supabase.from("maestros").delete().eq("id",id);
    setConfirm(null); cargar();
  };

  const guardarAlumno = async () => {
    if(!form.nombre||!form.curso_id) return;
    const avatar = form.avatar||form.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
    const color = form.color||colors[Math.floor(Math.random()*colors.length)];
    if(modal==="nuevo_alumno") {
      await supabase.from("hijos").insert({nombre:form.nombre,curso_id:form.curso_id,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null});
    } else {
      await supabase.from("hijos").update({nombre:form.nombre,curso_id:form.curso_id,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
    }
    setModal(null); cargar();
  };

  const eliminarAlumno = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("hijo_id",id);
    await supabase.from("hijos").delete().eq("id",id);
    setConfirm(null); cargar();
  };

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit",background:"#F8FAFC"};

  if(loading) return <Spinner/>;

  return (
    <div>
      {confirm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,maxWidth:340,width:"100%"}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>¿Estás segura?</div>
            <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>{confirm.msg}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirm(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={confirm.action} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Eliminar</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_usuario"||modal?.edit) && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="nuevo_usuario"?"Nuevo usuario":"Editar usuario"}</div>
            {[{label:"Nombre completo",key:"nombre",type:"text",ph:"Ej: María García"},{label:"Email",key:"email",type:"email",ph:"maria@mail.com"},{label:"Contraseña",key:"pass",type:"text",ph:"Contraseña de acceso"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Rol</div>
              <div style={{display:"flex",gap:8}}>
                {["padre","admin","super"].map(r=>(
                  <button key={r} onClick={()=>setForm(p=>({...p,rol:r}))} style={{flex:1,padding:"8px 4px",borderRadius:10,border:`2px solid ${form.rol===r?ROL_COLOR[r]:"#E2E8F0"}`,background:form.rol===r?ROL_BG[r]:"white",cursor:"pointer",fontSize:11,fontWeight:700,color:form.rol===r?ROL_COLOR[r]:"#94A3B8"}}>{ROL_LABEL[r]}</button>
                ))}
              </div>
            </div>
            {form.rol==="admin" && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Cursos asignados</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {cursos.map(c=>{ const sel=(form.cursos||[]).includes(c.id); return <button key={c.id} onClick={()=>setForm(p=>({...p,cursos:sel?p.cursos.filter(x=>x!==c.id):[...(p.cursos||[]),c.id]}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${sel?c.color:"#E2E8F0"}`,background:sel?c.color+"18":"white",cursor:"pointer",fontSize:12,fontWeight:600,color:sel?c.color:"#94A3B8"}}>{c.avatar} {c.nombre}</button>; })}
                </div>
              </div>
            )}
            {form.rol==="padre" && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hijos vinculados</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {hijos.map(h=>{ const sel=(form.hijos||[]).includes(h.id); return <button key={h.id} onClick={()=>setForm(p=>({...p,hijos:sel?p.hijos.filter(x=>x!==h.id):[...(p.hijos||[]),h.id]}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${sel?h.color:"#E2E8F0"}`,background:sel?h.color+"18":"white",cursor:"pointer",fontSize:12,fontWeight:600,color:sel?h.color:"#94A3B8"}}>{h.nombre}</button>; })}
                </div>
              </div>
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
            {[{label:"Nombre del curso",key:"nombre",ph:"Ej: 4°B — Primaria"},{label:"Emoji",key:"avatar",ph:"🏫"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={inp}/>
              </div>
            ))}
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
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Cursos asignados</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {cursos.map(c=>{ const sel=(form.cursos||[]).includes(c.id); return <button key={c.id} onClick={()=>setForm(p=>({...p,cursos:sel?p.cursos.filter(x=>x!==c.id):[...(p.cursos||[]),c.id]}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${sel?c.color:"#E2E8F0"}`,background:sel?c.color+"18":"white",cursor:"pointer",fontSize:12,fontWeight:600,color:sel?c.color:"#94A3B8"}}>{c.avatar} {c.nombre}</button>; })}
              </div>
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
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Nombre completo</div>
              <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Sofía García" style={inp}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Fecha de nacimiento</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Curso</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {cursos.map(c=>{ const sel=form.curso_id===c.id; return <button key={c.id} onClick={()=>setForm(p=>({...p,curso_id:c.id}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${sel?c.color:"#E2E8F0"}`,background:sel?c.color+"18":"white",cursor:"pointer",fontSize:12,fontWeight:600,color:sel?c.color:"#94A3B8"}}>{c.avatar} {c.nombre}</button>; })}
              </div>
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
        {[{id:"usuarios",l:"👤 Usuarios"},{id:"cursos",l:"🏫 Cursos"},{id:"maestros",l:"👨‍🏫 Maestros"},{id:"alumnos",l:"🎒 Alumnos"}].map(t=>(
          <button key={t.id} onClick={()=>setSec(t.id)} style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sec===t.id?"#0F172A":"white",color:sec===t.id?"white":"#94A3B8",boxShadow:sec===t.id?"0 3px 10px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{t.l}</button>
        ))}
      </div>

      {sec==="usuarios" && (
        <>
          <button onClick={()=>{ setForm({nombre:"",email:"",pass:"",rol:"padre",cursos:[],hijos:[],activo:true}); setModal("nuevo_usuario"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",color:"#3B82F6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo usuario</button>
          {usuarios.map(u=>(
            <Card key={u.id} style={{padding:"14px 16px",marginBottom:10,opacity:u.activo?1:0.55}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:12,background:ROL_BG[u.rol],display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:ROL_COLOR[u.rol],flexShrink:0}}>{u.avatar}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:14,fontWeight:700}}>{u.nombre}</div>
                    <Pill label={ROL_LABEL[u.rol]} color={ROL_COLOR[u.rol]} bg={ROL_BG[u.rol]}/>
                    {!u.activo && <Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                  </div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{u.email}</div>
                  {u.rol==="admin"&&u.cursos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Cursos: {u.cursos.map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ")}</div>}
                  {u.rol==="padre"&&u.hijos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Hijos: {u.hijos.map(hid=>hijos.find(h=>h.id===hid)?.nombre).filter(Boolean).join(", ")}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>{ setForm({...u,cursos:[...(u.cursos||[])],hijos:[...(u.hijos||[])]}); setModal({edit:u}); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                  <button onClick={()=>toggleActivo(u)} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${u.activo?"#EF4444":"#10B981"}`,background:u.activo?"#FEF2F2":"#F0FDF4",cursor:"pointer",fontSize:12,color:u.activo?"#EF4444":"#10B981"}}>{u.activo?"🚫":"✓"}</button>
                  {u.rol!=="super"&&<button onClick={()=>setConfirm({msg:`¿Eliminar a ${u.nombre}?`,action:()=>eliminarUsuario(u.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>}
                </div>
              </div>
            </Card>
          ))}
        </>
      )}

      {sec==="cursos" && (
        <>
          <button onClick={()=>{ setForm({nombre:"",avatar:"🏫",color:"#3B82F6"}); setModal("nuevo_curso"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",color:"#3B82F6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo curso</button>
          {cursos.map(c=>{
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
                  <button onClick={()=>setConfirm({msg:`¿Eliminar el curso ${c.nombre}?`,action:()=>eliminarCurso(c.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </Card>
            );
          })}
        </>
      )}
      {sec==="alumnos" && (
        <>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <button onClick={()=>setCursoFiltro(null)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:cursoFiltro===null?"#0F172A":"white",color:cursoFiltro===null?"white":"#94A3B8",boxShadow:"0 1px 6px rgba(0,0,0,0.08)"}}>Todos</button>
            {cursos.map(c=><button key={c.id} onClick={()=>setCursoFiltro(c.id)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:cursoFiltro===c.id?c.color:"white",color:cursoFiltro===c.id?"white":"#94A3B8",boxShadow:"0 1px 6px rgba(0,0,0,0.08)"}}>{c.avatar} {c.nombre}</button>)}
          </div>
          <button onClick={()=>{ setForm({nombre:"",curso_id:cursoFiltro||cursos[0]?.id,fecha_nacimiento:"",color:""}); setModal("nuevo_alumno"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #10B981",background:"#F0FDF4",color:"#10B981",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo alumno</button>
          {(cursoFiltro?alumnos.filter(a=>a.curso_id===cursoFiltro):alumnos).map(a=>{
            const curso = cursos.find(c=>c.id===a.curso_id);
            const apoderados = (a.usuarios||[]).map(u=>u.usuarios).filter(Boolean);
            return (
              <Card key={a.id} style={{padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:12,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>{a.avatar||a.nombre?.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{fontSize:14,fontWeight:700}}>{a.nombre}</div>
                      {curso&&<Pill label={curso.nombre} color={curso.color} bg={curso.color+"18"}/>}
                    </div>
                    {a.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtF(a.fecha_nacimiento)}</div>}
                    {apoderados.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👨‍👩‍👧 {apoderados.map(p=>p.nombre).join(", ")}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>{ setForm({...a}); setModal("editar_alumno"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                    <button onClick={()=>setConfirm({msg:`¿Eliminar a ${a.nombre}?`,action:()=>eliminarAlumno(a.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {sec==="maestros" && (
        <>
          <button onClick={()=>{ setForm({nombre:"",materia:"",email:"",cursos:[],activo:true}); setModal("nuevo_maestro"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #8B5CF6",background:"#F5F3FF",color:"#8B5CF6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar nuevo maestro</button>
          {maestros.map(m=>(
            <Card key={m.id} style={{padding:"14px 16px",marginBottom:10,opacity:m.activo?1:0.55}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:12,background:"#F5F3FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#8B5CF6",flexShrink:0}}>{m.avatar||"👨‍🏫"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <div style={{fontSize:14,fontWeight:700}}>{m.nombre}</div>
                    {m.materia&&<Pill label={m.materia} color="#8B5CF6" bg="#F5F3FF"/>}
                    {!m.activo&&<Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                  </div>
                  {m.email&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{m.email}</div>}
                  {m.cursos.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>Cursos: {m.cursos.map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ")}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>{ setForm({...m,cursos:[...(m.cursos||[])]}); setModal("editar_maestro"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                  <button onClick={()=>setConfirm({msg:`¿Eliminar a ${m.nombre}?`,action:()=>eliminarMaestro(m.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

function AlertaModal({ onClose, onEnviar }) {
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

function Muro({ cursoId, cursoNombre, isAdmin }) {
  const [datos,setDatos] = useState(null);
  const [modal,setModal] = useState(false);
  const hoy = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});

  useEffect(()=>{ cargar(); },[cursoId]);

  const cargar = async () => {
    const fechaHoy = new Date().toISOString().split("T")[0];
    const [alerta,menu,recordatorios,cumples,cuotas] = await Promise.all([
      supabase.from("alertas").select("*").eq("curso_id",cursoId).eq("activa",true).order("creado_en",{ascending:false}).limit(1),
      supabase.from("menu").select("*").eq("curso_id",cursoId).eq("fecha",fechaHoy).single(),
      supabase.from("recordatorios").select("*").eq("curso_id",cursoId),
      supabase.from("cumples").select("*").eq("curso_id",cursoId).order("fecha"),
      supabase.from("cuotas").select("*").eq("curso_id",cursoId),
    ]);
    setDatos({ alerta:alerta.data?.[0]||null, menu:menu.data||null, recordatorios:recordatorios.data||[], cumples:cumples.data||[], cuotas:cuotas.data||[] });
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoId);
    await supabase.from("alertas").insert({curso_id:cursoId,mensaje:msg,hora:"Ahora",activa:true});
    cargar();
  };

  const dismissAlerta = async () => {
    if(datos.alerta){ await supabase.from("alertas").update({activa:false}).eq("id",datos.alerta.id); cargar(); }
  };

  if(!datos) return <Spinner/>;

  return (
    <div>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:22,fontWeight:900}}>Hola 👋</div>
        <div style={{fontSize:13,color:"#94A3B8",textTransform:"capitalize"}}>{hoy}</div>
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
      {isAdmin&&(
        <>
          <button onClick={()=>setModal(true)} style={{width:"100%",padding:"13px 16px",borderRadius:14,border:`2px solid ${datos.alerta?"#EF4444":"transparent"}`,cursor:"pointer",background:datos.alerta?"#FFF1F2":"linear-gradient(135deg,#EF4444,#B91C1C)",color:datos.alerta?"#EF4444":"white",fontSize:13,fontWeight:800,marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:20}}>🚨</span>
            <div style={{textAlign:"left"}}>
              <div>{datos.alerta?"Alerta activa — tocar para actualizar":"Enviar alerta a toda la comunidad"}</div>
              <div style={{fontSize:11,opacity:0.75,fontWeight:500}}>Notifica a todas las familias del curso</div>
            </div>
          </button>
          {modal&&<AlertaModal onClose={()=>setModal(false)} onEnviar={msg=>{enviarAlerta(msg);setModal(false);}}/>}
        </>
      )}
      {datos.menu&&(
        <Card style={{padding:"14px 16px",marginBottom:12}}>
          <div style={{fontSize:10,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",marginBottom:8}}>🍽️ Menú de hoy</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {datos.menu.entrada&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#8B5CF6"}}>Entrada: </span>{datos.menu.entrada}</div>}
            {datos.menu.plato&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#3B82F6"}}>Plato 1: </span>{datos.menu.plato}</div>}
            {datos.menu.plato2&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#0EA5E9"}}>Plato 2: </span>{datos.menu.plato2}</div>}
            {datos.menu.acompanamiento&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#F59E0B"}}>Acomp.: </span>{datos.menu.acompanamiento}</div>}
            {datos.menu.postre&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#10B981"}}>Postre: </span>{datos.menu.postre}{datos.menu.postre2&&` / ${datos.menu.postre2}`}</div>}
          </div>
        </Card>
      )}
      {datos.recordatorios.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Recordatorios</div>
          {datos.recordatorios.map(r=>(
            <div key={r.id} style={{background:r.urgente?"#FFF1F2":"#FFFFFF",borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,border:`1px solid ${r.urgente?"#FECACA":"#E2E8F0"}`,borderLeft:r.urgente?"3px solid #EF4444":"1px solid #E2E8F0"}}>
              <span style={{fontSize:20}}>{r.emoji}</span>
              <div style={{fontSize:13,fontWeight:r.urgente?700:500,flex:1}}>{r.texto}</div>
              {r.urgente&&<Pill label="Urgente" color="#EF4444" bg="#FEE2E2"/>}
            </div>
          ))}
        </div>
      )}
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Próximos cumpleaños</div>
      {datos.cumples.slice(0,2).map(c=>{
        const dias=dHasta(c.fecha);
        return(
          <Card key={c.id} style={{padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎂</div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div><div style={{fontSize:11,color:"#94A3B8"}}>📅 {fmtF(c.fecha)}</div></div>
            <div style={{fontSize:12,fontWeight:700,color:dias<=7?"#EF4444":"#94A3B8",background:dias<=7?"#FEE2E2":"#F1F5F9",borderRadius:8,padding:"3px 8px"}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>
          </Card>
        );
      })}
      {datos.cuotas.filter(c=>!c.pagado).length>0&&(
        <div style={{marginTop:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Pago pendiente</div>
          {datos.cuotas.filter(c=>!c.pagado).slice(0,1).map(c=>(
            <div key={c.id} style={{background:"#FFFBEB",borderRadius:14,padding:"13px 15px",display:"flex",alignItems:"center",gap:12,border:"1.5px solid #FDE68A"}}>
              <span style={{fontSize:22}}>💳</span>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>{c.tipo}</div><div style={{fontSize:11,color:"#94A3B8"}}>Vence {fmtF(c.vencimiento)}</div></div>
              <div style={{fontSize:16,fontWeight:800,color:"#F59E0B"}}>{fmtM(c.monto)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadMenuExcel({ cursoId, onDone }) {
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
      if(rows.length===0) throw new Error("El archivo está vacío.");
      console.log("Columnas detectadas:", Object.keys(rows[0]));
      console.log("Primera fila:", rows[0]);
      // Detectar nombre real de la columna fecha (case-insensitive)
      const colFecha  = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("fech")) || null;
      const colEntrada = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("entrada")) || null;
      const colPlato1  = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("plato") && k.includes("1")) || null;
      const colPlato2  = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("plato") && k.includes("2")) || null;
      const colPlato3  = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("plato") && k.includes("3")) || null;
      const colAcomp   = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("acomp")) || null;
      const colPostre1 = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("postre") && k.includes("1")) || null;
      const colPostre2 = Object.keys(rows[0]).find(k=>k.toLowerCase().includes("postre") && k.includes("2")) || null;
      if(!colFecha) throw new Error(`No encontré columna de fecha. Columnas: ${Object.keys(rows[0]).join(", ")}`);
      const parseFecha = (val) => {
        if(!val) return null;
        // Si es objeto Date (cellDates:true lo convierte directo)
        if(val instanceof Date) {
          return val.toISOString().split("T")[0];
        }
        const s = String(val).trim();
        // YYYY-MM-DD
        if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
        // DD/MM/YYYY
        if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
          const [d,m,y]=s.split("/");
          return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        }
        // M/D/YYYY (formato americano que genera xlsx)
        if(/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
          const parts=s.split("/");
          const y=parts[2], m=parts[0].padStart(2,"0"), d=parts[1].padStart(2,"0");
          return `${y}-${m}-${d}`;
        }
        // Número de serie Excel (fallback)
        const n = Number(s);
        if(!isNaN(n) && n > 40000) {
          const d = new Date(Math.round((n - 25569) * 86400 * 1000));
          return d.toISOString().split("T")[0];
        }
        return s;
      };
      const inserts = rows.map(r=>({
        curso_id: cursoId,
        fecha:          parseFecha(r[colFecha]),
        entrada:        colEntrada ?r[colEntrada]||null :null,
        plato:          colPlato1  ?r[colPlato1]||null  :null,
        plato2:         colPlato2  ?r[colPlato2]||null  :null,
        acompanamiento: colPlato3  ?r[colPlato3]||null  :colAcomp?r[colAcomp]||null:null,
        postre:         colPostre1 ?r[colPostre1]||null :null,
        postre2:        colPostre2 ?r[colPostre2]||null :null,
        dia: null,
      })).filter(r=>r.fecha);
      if(inserts.length===0) throw new Error(`Columna fecha encontrada ('${colFecha}') pero ningún valor válido.`);
      await supabase.from("menu").delete().eq("curso_id",cursoId);
      const { error } = await supabase.from("menu").insert(inserts);
      if(error) throw error;
      setMsg(`✅ ${inserts.length} días cargados correctamente`);
      onDone();
    } catch(err) {
      setMsg("❌ Error al leer el archivo. Verificá el formato.");
      console.error(err);
    }
    setLoading(false);
    e.target.value="";
  };

  return (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Cargar menú desde Excel</div>
      <label style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",cursor:"pointer",maxWidth:560}}>
        <span style={{fontSize:20}}>📤</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#3B82F6"}}>{loading?"Procesando...":"Subir archivo Excel"}</div>
          <div style={{fontSize:11,color:"#94A3B8"}}>Formato: menu_tribbu.xlsx</div>
        </div>
        <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}}/>
      </label>
      {msg&&<div style={{fontSize:13,marginTop:10,fontWeight:600,color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</div>}
    </div>
  );
}

function Comedor({ cursoId, isAdmin }) {
  const [menu,setMenu]         = useState([]);
  const [vista,setVista]       = useState("diario");
  const [fechaSel,setFechaSel] = useState(new Date().toISOString().split("T")[0]);
  const [mes,setMes]           = useState(new Date());

  const cargarMenu = () => {
    supabase.from("menu").select("*").eq("curso_id",cursoId).order("fecha").then(r=>setMenu(r.data||[]));
  };
  useEffect(()=>{ cargarMenu(); },[cursoId]);

  const diaActual = menu.find(m=>m.fecha===fechaSel);
  const year=mes.getFullYear(), month=mes.getMonth();
  const firstDay=(new Date(year,month,1).getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);
  const pad = n => String(n).padStart(2,"0");
  const tieneMenu = day => menu.some(m=>m.fecha===`${year}-${pad(month+1)}-${pad(day)}`);
  const selDia = day => { setFechaSel(`${year}-${pad(month+1)}-${pad(day)}`); setVista("diario"); };

  const campos = [
    {key:"entrada",       label:"Entrada",          color:"#8B5CF6", emoji:"🥣"},
    {key:"plato",         label:"Plato Principal 1", color:"#3B82F6", emoji:"🍽️"},
    {key:"plato2",        label:"Plato Principal 2", color:"#0EA5E9", emoji:"🍽️"},
    {key:"acompanamiento",label:"Plato Principal 3", color:"#6366F1", emoji:"🍽️"},
    {key:"postre",        label:"Postre 1",          color:"#10B981", emoji:"🍎"},
    {key:"postre2",       label:"Postre 2",          color:"#34D399", emoji:"🍊"},
  ];

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Comedor 🍽️</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Menú del curso</div>
      {isAdmin && <UploadMenuExcel cursoId={cursoId} onDone={cargarMenu}/>}
      <div style={{display:"flex",gap:6,marginBottom:18,maxWidth:260}}>
        {[{id:"diario",l:"Día"},{id:"mensual",l:"Mes"}].map(v=>(
          <button key={v.id} onClick={()=>setVista(v.id)} style={{flex:1,padding:"8px 0",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:vista===v.id?"#0F172A":"white",color:vista===v.id?"white":"#94A3B8",boxShadow:vista===v.id?"0 3px 10px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{v.l}</button>
        ))}
      </div>

      {vista==="diario"&&(
        <div style={{maxWidth:520}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <input type="date" value={fechaSel} onChange={e=>setFechaSel(e.target.value)} style={{padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,fontWeight:600,outline:"none",background:"white",color:"#0F172A"}}/>
            <div style={{fontSize:12,color:"#94A3B8",textTransform:"capitalize"}}>{new Date(fechaSel+"T00:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}</div>
          </div>
          {diaActual ? (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {campos.map(c=>diaActual[c.key]&&(
                <Card key={c.key} style={{padding:"13px 16px",borderLeft:`3px solid ${c.color}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:c.color,textTransform:"uppercase",marginBottom:4}}>{c.emoji} {c.label}</div>
                  <div style={{fontSize:15,fontWeight:700}}>{diaActual[c.key]}</div>
                </Card>
              ))}
            </div>
          ) : (
            <Card style={{padding:24,textAlign:"center"}}>
              <div style={{fontSize:32,marginBottom:8}}>🍽️</div>
              <div style={{fontSize:13,fontWeight:600,color:"#94A3B8"}}>No hay menú cargado para este día</div>
            </Card>
          )}
        </div>
      )}

      {vista==="mensual"&&(
        <div style={{maxWidth:400}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button onClick={()=>setMes(new Date(year,month-1,1))} style={{background:"white",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>‹</button>
            <div style={{fontSize:15,fontWeight:700}}>{MESES[month]} {year}</div>
            <button onClick={()=>setMes(new Date(year,month+1,1))} style={{background:"white",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>›</button>
          </div>
          <Card style={{padding:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
              {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94A3B8",padding:"4px 0"}}>{d}</div>)}
              {cells.map((day,i)=>{
                const tieneM=day&&tieneMenu(day);
                const isHoy=day&&`${year}-${pad(month+1)}-${pad(day)}`===new Date().toISOString().split("T")[0];
                return <div key={i} onClick={()=>day&&selDia(day)} style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:isHoy?"#3B82F6":tieneM?"#DBEAFE":"transparent",color:isHoy?"white":day?"#0F172A":"transparent",fontSize:12,fontWeight:isHoy?800:500,cursor:day?"pointer":"default",position:"relative"}}>
                  {day}
                  {tieneM&&!isHoy&&<div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:"#3B82F6"}}/>}
                </div>;
              })}
            </div>
            <div style={{fontSize:11,color:"#94A3B8",textAlign:"center",marginTop:8}}>Tocá un día para ver el menú</div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Clases({ cursoId }) {
  const horario=HORARIOS[cursoId]||HORARIOS[1];
  const [mes,setMes]=useState(new Date(2026,2,1));
  const year=mes.getFullYear(),month=mes.getMonth();
  const firstDay=(new Date(year,month,1).getDay()+6)%7;
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);
  const bgs=["#EFF6FF","#F0FDF4","#FFF7ED","#F5F3FF","#FEFCE8"];
  const cols=["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EAB308"];
  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Clases 📅</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Calendario y horario escolar</div>
      <Card style={{padding:16,marginBottom:16,maxWidth:360}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <button onClick={()=>setMes(new Date(year,month-1,1))} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>‹</button>
          <div style={{fontSize:15,fontWeight:700}}>{MESES[month]} {year}</div>
          <button onClick={()=>setMes(new Date(year,month+1,1))} style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#94A3B8",padding:"4px 0"}}>{d}</div>)}
          {cells.map((day,i)=>(
            <div key={i} style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:day===10?"#3B82F6":day?bgs[i%5]:"transparent",color:day===10?"white":day?"#0F172A":"transparent",fontSize:12,fontWeight:day===10?800:500}}>{day}</div>
          ))}
        </div>
      </Card>
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Horario semanal</div>
      <div style={{maxWidth:640}}>
        {horario.map((row,i)=>(
          <Card key={i} style={{padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:42,height:42,borderRadius:12,background:bgs[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:cols[i],flexShrink:0}}>{row.dia.slice(0,3)}</div>
              <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:6,paddingTop:4}}>
                {row.clases.map((c,j)=><span key={j} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20,background:"#F8FAFC",border:"1px solid #E2E8F0"}}>{c}</span>)}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function InfoUtil({ cursoId }) {
  const [sec,setSec]=useState("utiles");
  const [utiles,setUtiles]=useState([]);
  const [uniformes,setUniformes]=useState([]);
  const [libros,setLibros]=useState([]);
  useEffect(()=>{
    supabase.from("utiles").select("*").eq("curso_id",cursoId).then(r=>setUtiles(r.data||[]));
    supabase.from("uniformes").select("*, uniforme_items(item)").eq("curso_id",cursoId).then(r=>setUniformes(r.data||[]));
    supabase.from("libros").select("*").eq("curso_id",cursoId).then(r=>setLibros(r.data||[]));
  },[cursoId]);
  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Info Útil 📋</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Listas y uniformes del curso</div>
      <div style={{display:"flex",gap:7,marginBottom:18,maxWidth:400}}>
        {[{id:"utiles",l:"✏️ Útiles"},{id:"uniformes",l:"👕 Uniformes"},{id:"libros",l:"📚 Libros"}].map(s=>(
          <button key={s.id} onClick={()=>setSec(s.id)} style={{flex:1,padding:"8px 6px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sec===s.id?"#0F172A":"white",color:sec===s.id?"white":"#94A3B8",boxShadow:sec===s.id?"0 3px 12px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{s.l}</button>
        ))}
      </div>
      {sec==="utiles"&&["Obligatorios","Opcionales"].map(tipo=>{
        const items=utiles.filter(u=>tipo==="Obligatorios"?u.obligatorio:!u.obligatorio);
        if(!items.length) return null;
        return(<div key={tipo}><div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,marginTop:tipo==="Opcionales"?16:0}}>{tipo}</div>{items.map((u,i)=><Card key={i} style={{padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,maxWidth:560}}><span style={{fontSize:16}}>{tipo==="Obligatorios"?"✏️":"📐"}</span><span style={{fontSize:13,fontWeight:600,flex:1}}>{u.item}</span>{tipo==="Obligatorios"&&<Pill label="Obligatorio" color="#3B82F6" bg="#EFF6FF"/>}</Card>)}</div>);
      })}
      {sec==="uniformes"&&uniformes.map((u,i)=>(
        <Card key={i} style={{padding:"14px 16px",marginBottom:12,maxWidth:560}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}><div style={{width:38,height:38,borderRadius:10,background:["#EEF2FF","#F0FDF4","#FFF7ED"][i%3],display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{u.emoji}</div><div style={{fontSize:14,fontWeight:800}}>Uniforme {u.tipo}</div></div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>{(u.uniforme_items||[]).map((it,j)=><div key={j} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",background:"#F8FAFC",borderRadius:9}}><div style={{width:6,height:6,borderRadius:"50%",background:"#3B82F6",flexShrink:0}}/><span style={{fontSize:13}}>{it.item}</span></div>)}</div>
        </Card>
      ))}
      {sec==="libros"&&libros.map((l,i)=><Card key={i} style={{padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,maxWidth:560}}><span style={{fontSize:18}}>📖</span><span style={{fontSize:13,fontWeight:600,flex:1}}>{l.item}</span></Card>)}
    </div>
  );
}

function Finanzas({ cursoId }) {
  const [cuotas,setCuotas]=useState([]);
  const [beca,setBeca]=useState(null);
  useEffect(()=>{
    supabase.from("cuotas").select("*").eq("curso_id",cursoId).then(r=>setCuotas(r.data||[]));
    supabase.from("becas").select("*").eq("curso_id",cursoId).single().then(r=>setBeca(r.data));
  },[cursoId]);
  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Finanzas 💳</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Cuotas, matrícula y beca</div>
      {beca?.activa&&(
        <div style={{background:"linear-gradient(135deg,#10B981,#059669)",borderRadius:16,padding:"16px 18px",marginBottom:16,color:"white",maxWidth:480}}>
          <div style={{fontSize:11,opacity:0.8,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Beca activa</div>
          <div style={{fontSize:32,fontWeight:900,marginBottom:4}}>{beca.porcentaje}% descuento</div>
          <div style={{fontSize:12,opacity:0.8}}>Vigente hasta {fmtF(beca.vencimiento)}</div>
        </div>
      )}
      <div style={{display:"flex",gap:10,marginBottom:16,maxWidth:560}}>
        {[{l:"Pendientes",v:cuotas.filter(c=>!c.pagado).length,c:"#EF4444",bg:"#FEF2F2"},{l:"Pagadas",v:cuotas.filter(c=>c.pagado).length,c:"#10B981",bg:"#F0FDF4"}].map((s,i)=>(
          <Card key={i} style={{flex:1,padding:"14px 10px",textAlign:"center"}}><div style={{fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",marginBottom:4}}>{s.l}</div><div style={{fontSize:24,fontWeight:900,color:s.c}}>{s.v}</div></Card>
        ))}
      </div>
      <div style={{maxWidth:560}}>
        {cuotas.map((c,i)=>{
          const dias=dHasta(c.vencimiento);
          return(
            <Card key={i} style={{padding:"14px 16px",marginBottom:10,borderLeft:`3px solid ${c.pagado?"#10B981":dias<=5?"#EF4444":"#F59E0B"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:12,background:c.pagado?"#F0FDF4":dias<=5?"#FEF2F2":"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{c.pagado?"✅":dias<=5?"⚠️":"📅"}</div>
                <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{c.tipo}</div><div style={{fontSize:11,color:"#94A3B8"}}>Vence {fmtF(c.vencimiento)}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontSize:15,fontWeight:900,color:c.pagado?"#10B981":"#0F172A"}}>{fmtM(c.monto)}</div>{c.pagado?<Pill label="✓ Pagado" color="#10B981" bg="#F0FDF4"/>:<Pill label={dias<=0?"Vencido":dias<=5?`⚠ ${dias}d`:fmtF(c.vencimiento)} color={dias<=5?"#EF4444":"#F59E0B"} bg={dias<=5?"#FEF2F2":"#FFFBEB"}/>}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CumpleModal({ cumple, onClose, onSave }) {
  const [form,setForm] = useState({
    fecha_festejo: cumple?.fecha_festejo||"",
    hora_festejo:  cumple?.hora_festejo||"",
    lugar_festejo: cumple?.lugar_festejo||"",
    responsable:   cumple?.responsable||"",
    comprado:      cumple?.comprado||false,
  });
  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit",background:"#F8FAFC"};
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <Card style={{padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:17,fontWeight:900,marginBottom:4}}>🎂 {cumple.nombre}</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:18}}>
          Cumpleaños: {cumple.fecha ? fmtF(cumple.fecha) : "Sin fecha de nacimiento"}
          {cumple.tipo&&<span style={{marginLeft:8}}><Pill label={cumple.tipo==="maestro"?"👨‍🏫 Maestro":"🎒 Alumno"} color={cumple.tipo==="maestro"?"#8B5CF6":"#3B82F6"} bg={cumple.tipo==="maestro"?"#F5F3FF":"#EFF6FF"}/></span>}
        </div>
        {[
          {label:"Fecha del festejo",key:"fecha_festejo",type:"date"},
          {label:"Hora del festejo", key:"hora_festejo", type:"text", ph:"Ej: 15:00"},
          {label:"Lugar",            key:"lugar_festejo",type:"text", ph:"Ej: Salón de actos"},
          {label:"Responsable",      key:"responsable",  type:"text", ph:"Ej: Mamá de Sofía"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type||"text"} value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Regalo</div>
          <button onClick={()=>setForm(p=>({...p,comprado:!p.comprado}))} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${form.comprado?"#10B981":"#E2E8F0"}`,background:form.comprado?"#F0FDF4":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.comprado?"#10B981":"#94A3B8"}}>{form.comprado?"✓ Comprado":"Pendiente"}</button>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={()=>onSave(form)} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Guardar</button>
        </div>
      </Card>
    </div>
  );
}

function Cumpleanios({ cursoId, userId, isAdmin }) {
  const [tab,setTab]           = useState("proximos");
  const [cumples,setCumples]   = useState([]);
  const [asistencias,setAsist] = useState([]);
  const [editando,setEditando] = useState(null);

  const cargar = async () => {
    const { data } = await supabase.from("cumples").select("*").eq("curso_id",cursoId).order("fecha_festejo",{ascending:true,nullsFirst:false});
    setCumples(data||[]);
    const { data:as } = await supabase.from("cumple_asistencia").select("*").eq("usuario_id",userId);
    setAsist(as||[]);
  };
  useEffect(()=>{ cargar(); },[cursoId]);

  const guardarCumple = async (form) => {
    await supabase.from("cumples").update({
      fecha_festejo: form.fecha_festejo||null,
      hora_festejo:  form.hora_festejo||null,
      lugar_festejo: form.lugar_festejo||null,
      responsable:   form.responsable||null,
      comprado:      form.comprado,
    }).eq("id",editando.id);
    setEditando(null); cargar();
  };

  const setAsistencia = async (cumpleId,valor) => {
    const existe=asistencias.find(a=>a.cumple_id===cumpleId);
    if(existe) await supabase.from("cumple_asistencia").update({asiste:valor}).eq("cumple_id",cumpleId).eq("usuario_id",userId);
    else await supabase.from("cumple_asistencia").insert({cumple_id:cumpleId,usuario_id:userId,asiste:valor});
    setAsist(prev=>[...prev.filter(a=>a.cumple_id!==cumpleId),{cumple_id:cumpleId,usuario_id:userId,asiste:valor}]);
  };

  const fechaMostrar = (c) => c.fecha_festejo || c.fecha;
  const diasHasta    = (c) => c.fecha_festejo ? dHasta(c.fecha_festejo) : c.fecha ? dHasta(c.fecha) : null;

  return (
    <div>
      {editando&&<CumpleModal cumple={editando} onClose={()=>setEditando(null)} onSave={guardarCumple}/>}
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Cumpleaños 🎂</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Calendario y organización del curso</div>
      <div style={{display:"flex",gap:7,marginBottom:18,maxWidth:420}}>
        {[{id:"proximos",l:"🎂 Próximos"},{id:"regalos",l:"🎁 Regalos"},{id:"asistencia",l:"✅ Asistencia"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"8px 6px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===t.id?"#0F172A":"white",color:tab===t.id?"white":"#94A3B8",boxShadow:tab===t.id?"0 3px 12px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{t.l}</button>
        ))}
      </div>

      {tab==="proximos"&&cumples.map(c=>{
        const dias=diasHasta(c);
        const fm=fechaMostrar(c);
        return(
          <Card key={c.id} style={{padding:"13px 15px",marginBottom:10,maxWidth:560}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:44,height:44,borderRadius:12,background:c.tipo==="maestro"?"#F5F3FF":"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.tipo==="maestro"?"👨‍🏫":"🎂"}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <div style={{fontSize:14,fontWeight:700}}>{c.nombre}</div>
                  <Pill label={c.tipo==="maestro"?"Maestro":"Alumno"} color={c.tipo==="maestro"?"#8B5CF6":"#3B82F6"} bg={c.tipo==="maestro"?"#F5F3FF":"#EFF6FF"}/>
                </div>
                {c.fecha&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 Cumple: {new Date(c.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</div>}
                {c.fecha_festejo&&<div style={{fontSize:11,color:"#3B82F6",fontWeight:600,marginTop:2}}>🎉 Festejo: {fmtF(c.fecha_festejo)}{c.hora_festejo&&` · ${c.hora_festejo}`}</div>}
                {c.lugar_festejo&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>📍 {c.lugar_festejo}</div>}
                {c.responsable&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👤 {c.responsable}</div>}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                {dias!==null&&<div style={{fontSize:12,fontWeight:700,color:dias<=7?"#EF4444":"#94A3B8",background:dias<=7?"#FEE2E2":"#F1F5F9",borderRadius:8,padding:"3px 8px",whiteSpace:"nowrap"}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>}
                {isAdmin&&<button onClick={()=>setEditando(c)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:600}}>✏️ Editar</button>}
              </div>
            </div>
          </Card>
        );
      })}

      {tab==="regalos"&&cumples.map(c=>(
        <Card key={c.id} style={{padding:"13px 15px",marginBottom:10,maxWidth:560}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎁</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
              <div style={{fontSize:11,color:"#94A3B8"}}>{c.responsable&&`${c.responsable} · `}{c.fecha_festejo?fmtF(c.fecha_festejo):c.fecha?fmtF(c.fecha):"Sin fecha"}</div>
            </div>
            {isAdmin
              ?<button onClick={async()=>{ await supabase.from("cumples").update({comprado:!c.comprado}).eq("id",c.id); cargar(); }} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${c.comprado?"#10B981":"#E2E8F0"}`,background:c.comprado?"#F0FDF4":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:c.comprado?"#10B981":"#94A3B8"}}>{c.comprado?"✓ Comprado":"Marcar"}</button>
              :<Pill label={c.comprado?"✓ Comprado":"Pendiente"} color={c.comprado?"#10B981":"#F59E0B"} bg={c.comprado?"#F0FDF4":"#FFFBEB"}/>
            }
          </div>
        </Card>
      ))}

      {tab==="asistencia"&&cumples.map(c=>{ const asi=asistencias.find(a=>a.cumple_id===c.id); return(
        <Card key={c.id} style={{padding:"13px 15px",marginBottom:10,maxWidth:560}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
              <div style={{fontSize:11,color:"#94A3B8"}}>
                {c.fecha_festejo?`🎉 ${fmtF(c.fecha_festejo)}`:c.fecha?`🎂 ${fmtF(c.fecha)}`:"Sin fecha"}
                {c.hora_festejo&&` · ${c.hora_festejo}`}
              </div>
              {c.lugar_festejo&&<div style={{fontSize:11,color:"#94A3B8"}}>📍 {c.lugar_festejo}</div>}
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>setAsistencia(c.id,"si")} style={{padding:"6px 10px",borderRadius:20,border:`2px solid ${asi?.asiste==="si"?"#10B981":"#E2E8F0"}`,background:asi?.asiste==="si"?"#F0FDF4":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:asi?.asiste==="si"?"#10B981":"#94A3B8"}}>✓ Voy</button>
              <button onClick={()=>setAsistencia(c.id,"no")} style={{padding:"6px 10px",borderRadius:20,border:`2px solid ${asi?.asiste==="no"?"#EF4444":"#E2E8F0"}`,background:asi?.asiste==="no"?"#FEF2F2":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:asi?.asiste==="no"?"#EF4444":"#94A3B8"}}>✗ No voy</button>
            </div>
          </div>
        </Card>
      );})}
    </div>
  );
}

function Alumnos({ cursoId, isAdmin }) {
  const [alumnos,setAlumnos]   = useState([]);
  const [modal,setModal]       = useState(null);
  const [form,setForm]         = useState({});
  const [confirm,setConfirm]   = useState(null);
  const [busqueda,setBusqueda] = useState("");

  useEffect(()=>{ cargar(); },[cursoId]);

  const cargar = async () => {
    const { data } = await supabase.from("hijos")
      .select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,email,telefono))")
      .eq("curso_id",cursoId).order("nombre");
    setAlumnos(data||[]);
  };

  const guardar = async () => {
    if(!form.nombre) return;
    const avatar = form.avatar||form.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
    const color = form.color||colors[Math.floor(Math.random()*colors.length)];
    if(modal==="nuevo") {
      await supabase.from("hijos").insert({nombre:form.nombre,curso_id:cursoId,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null});
    } else {
      await supabase.from("hijos").update({nombre:form.nombre,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
    }
    setModal(null); cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("usuario_hijos").delete().eq("hijo_id",id);
    await supabase.from("hijos").delete().eq("id",id);
    setConfirm(null); cargar();
  };

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit",background:"#F8FAFC"};
  const filtrados = alumnos.filter(a=>a.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <div>
      {confirm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,maxWidth:340,width:"100%"}}>
            <div style={{fontSize:16,fontWeight:800,marginBottom:8}}>¿Estás segura?</div>
            <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>{confirm.msg}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirm(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>Cancelar</button>
              <button onClick={confirm.action} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Eliminar</button>
            </div>
          </Card>
        </div>
      )}
      {(modal==="nuevo"||modal==="editar")&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:18}}>{modal==="nuevo"?"Nuevo alumno":"Editar alumno"}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Nombre completo</div>
              <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Sofía García" style={inp}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Fecha de nacimiento</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} style={inp}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal==="nuevo"?"Crear":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Alumnos 🎒</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>{alumnos.length} alumnos en el curso</div>
      {isAdmin&&<button onClick={()=>{ setForm({nombre:"",fecha_nacimiento:""}); setModal("nuevo"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #10B981",background:"#F0FDF4",color:"#10B981",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar alumno</button>}
      <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar alumno..." style={{width:"100%",padding:"10px 14px",borderRadius:12,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",marginBottom:14,boxSizing:"border-box",background:"white"}}/>
      <div style={{maxWidth:560}}>
        {filtrados.map(a=>{
          const apoderados=(a.usuarios||[]).map(u=>u.usuarios).filter(Boolean);
          return (
            <Card key={a.id} style={{padding:"14px 16px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:12,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>{a.avatar||a.nombre?.slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700}}>{a.nombre}</div>
                  {a.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtF(a.fecha_nacimiento)}</div>}
                  {apoderados.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👨‍👩‍👧 {apoderados.map(p=>p.nombre).join(", ")}{apoderados[0]?.telefono&&` · ${apoderados[0].telefono}`}</div>}
                </div>
                {isAdmin&&<div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>{ setForm({...a}); setModal("editar"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                  <button onClick={()=>setConfirm({msg:`¿Eliminar a ${a.nombre}?`,action:()=>eliminar(a.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                </div>}
              </div>
            </Card>
          );
        })}
        {filtrados.length===0&&<div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>No se encontraron alumnos</div>}
      </div>
    </div>
  );
}

function Contacto({ cursoId }) {
  const [contactos,setContactos]=useState([]);
  useEffect(()=>{ supabase.from("contactos").select("*").eq("curso_id",cursoId).then(r=>setContactos(r.data||[])); },[cursoId]);
  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Contacto 📞</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Directorio del colegio</div>
      <div style={{maxWidth:560}}>
        {contactos.map((c,i)=>(
          <Card key={i} style={{padding:"14px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.emoji}</div>
            <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{c.nombre}</div><div style={{fontSize:13,color:"#94A3B8"}}>{c.telefono}</div></div>
            <a href={`tel:${c.telefono}`} style={{padding:"8px 14px",borderRadius:20,background:"#3B82F6",color:"white",fontSize:12,fontWeight:700,textDecoration:"none"}}>Llamar</a>
          </Card>
        ))}
        <Card style={{padding:"16px 18px",marginTop:16,background:"#F8FAFC"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:10}}>Info general</div>
          {[{l:"Horario de clases",v:"8:00 — 16:00"},{l:"Horario secretaría",v:"8:00 — 17:00"},{l:"Dirección",v:"Av. Corrientes 1234, CABA"}].map((r,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<2?"1px solid #E2E8F0":"none"}}>
              <span style={{fontSize:12,color:"#94A3B8"}}>{r.l}</span>
              <span style={{fontSize:12,fontWeight:600}}>{r.v}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function AdminPanel({ cursoId, cursoNombre }) {
  const [stats,setStats]=useState({cuotasOk:0,sinPagar:0,regalos:0});
  useEffect(()=>{
    Promise.all([
      supabase.from("cuotas").select("*").eq("curso_id",cursoId),
      supabase.from("cumples").select("*").eq("curso_id",cursoId),
    ]).then(([c,cu])=>{
      const cuotas=c.data||[],cumples=cu.data||[];
      setStats({cuotasOk:cuotas.filter(x=>x.pagado).length,sinPagar:cuotas.filter(x=>!x.pagado).length,regalos:cumples.filter(x=>!x.comprado).length});
    });
  },[cursoId]);
  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Admin Panel ⚙️</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>{cursoNombre}</div>
      <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
        {[{n:stats.cuotasOk,l:"Cuotas OK",c:"#10B981",bg:"#F0FDF4"},{n:stats.sinPagar,l:"Sin pagar",c:"#EF4444",bg:"#FEF2F2"},{n:stats.regalos,l:"Regalos pend.",c:"#F59E0B",bg:"#FFFBEB"}].map((s,i)=>(
          <div key={i} style={{flex:1,minWidth:80,background:s.bg,borderRadius:14,padding:"14px 10px",textAlign:"center"}}>
            <div style={{fontSize:28,fontWeight:900,color:s.c}}>{s.n}</div>
            <div style={{fontSize:10,color:"#94A3B8",fontWeight:700,marginTop:3}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Acciones rápidas</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:560}}>
        {["📢 Enviar comunicado al curso","📋 Ver lista completa de familias","💳 Gestionar cuotas del curso","🎂 Organizar próximo cumpleaños"].map((a,i)=>(
          <Card key={i} style={{padding:"13px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <span style={{fontSize:18}}>{a.split(" ")[0]}</span>
            <span style={{fontSize:13,fontWeight:600}}>{a.split(" ").slice(1).join(" ")}</span>
            <span style={{marginLeft:"auto",color:"#94A3B8",fontSize:16}}>›</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [usuario,setUsuario]   = useState(null);
  const [tab,setTab]           = useState("muro");
  const [cursoIdx,setCursoIdx] = useState(0);
  const [items,setItems]       = useState([]);

  useEffect(()=>{
    if(!usuario||usuario.rol==="super") return;
    if(usuario.rol==="padre") {
      supabase.from("hijos").select("*, cursos(nombre,color,avatar)").in("id",usuario.hijos).then(r=>setItems(r.data||[]));
    } else {
      supabase.from("cursos").select("*").in("id",usuario.cursos).then(r=>setItems(r.data||[]));
    }
  },[usuario]);

  if(!usuario) return <Login onLogin={u=>{ setUsuario(u); setTab("muro"); setCursoIdx(0); setItems([]); }}/>;

  if(usuario.rol==="super") return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light"}}>
      <div style={{background:"#0F172A",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{fontSize:22,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <button onClick={()=>setUsuario(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:12}}>Salir</button>
      </div>
      <div style={{padding:"24px 20px",maxWidth:800,margin:"0 auto"}}><SuperAdmin/></div>
    </div>
  );

  const esPadre    = usuario.rol==="padre";
  const itemActual = items[cursoIdx];
  const cursoId    = esPadre ? itemActual?.curso_id    : itemActual?.id;
  const cursoNombre= esPadre ? itemActual?.cursos?.nombre : itemActual?.nombre;
  const isAdmin    = usuario.rol==="admin";

  const TABS = [
    {id:"muro",    label:"Inicio",   emoji:"🏠"},
    {id:"clases",  label:"Clases",   emoji:"📅"},
    {id:"comedor", label:"Comedor",  emoji:"🍽️"},
    {id:"info",    label:"Info",     emoji:"📋"},
    {id:"finanzas",label:"Finanzas", emoji:"💳"},
    {id:"cumples", label:"Cumples",  emoji:"🎂"},
    {id:"contacto",label:"Contacto", emoji:"📞"},
    {id:"alumnos",  label:"Alumnos",  emoji:"🎒"},
    ...(isAdmin?[{id:"admin",label:"Admin",emoji:"⚙️"}]:[]),
  ];

  const renderTab = () => {
    if(!cursoId) return <Spinner/>;
    switch(tab) {
      case "muro":     return <Muro cursoId={cursoId} cursoNombre={cursoNombre} isAdmin={isAdmin}/>;
      case "clases":   return <Clases cursoId={cursoId}/>;
      case "comedor":  return <Comedor cursoId={cursoId} isAdmin={isAdmin}/>;
      case "info":     return <InfoUtil cursoId={cursoId}/>;
      case "finanzas": return <Finanzas cursoId={cursoId}/>;
      case "cumples":  return <Cumpleanios cursoId={cursoId} userId={usuario.id} isAdmin={isAdmin}/>;
      case "contacto": return <Contacto cursoId={cursoId}/>;
      case "alumnos":  return <Alumnos cursoId={cursoId} isAdmin={isAdmin}/>;
      case "admin":    return <AdminPanel cursoId={cursoId} cursoNombre={cursoNombre}/>;
      default: return null;
    }
  };

  if(isMobile) return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",paddingBottom:80,colorScheme:"light"}}>
      <div style={{background:"#0F172A",position:"sticky",top:0,zIndex:100}}>
        <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{fontSize:20,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {cursoNombre&&<div style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontWeight:600}}>{cursoNombre}</div>}
            <button onClick={()=>setUsuario(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"5px 10px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:11}}>Salir</button>
          </div>
        </div>
        {items.length>1&&(
          <div style={{display:"flex",gap:6,padding:"0 16px 8px",overflowX:"auto"}}>
            {items.map((item,i)=>(
              <button key={i} onClick={()=>setCursoIdx(i)} style={{flexShrink:0,padding:"5px 12px",borderRadius:20,border:`2px solid ${i===cursoIdx?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.15)"}`,background:i===cursoIdx?"rgba(255,255,255,0.15)":"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:i===cursoIdx?"white":"rgba(255,255,255,0.5)",whiteSpace:"nowrap"}}>
                {esPadre?item.nombre?.split(" ")[0]:item.nombre}
              </button>
            ))}
          </div>
        )}
        <div style={{display:"flex",overflowX:"auto",padding:"0 16px 10px",gap:4,scrollbarWidth:"none"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flexShrink:0,padding:"7px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===t.id?"rgba(255,255,255,0.2)":"transparent",color:tab===t.id?"white":"rgba(255,255,255,0.5)",whiteSpace:"nowrap"}}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:"20px 16px",color:"#0F172A"}}>{renderTab()}</div>
    </div>
  );

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif"}}>
      <div style={{width:220,background:"#0F172A",position:"fixed",top:0,left:0,bottom:0,display:"flex",flexDirection:"column",zIndex:100,overflowY:"auto"}}>
        <div style={{padding:"24px 20px 16px"}}>
          <div style={{fontSize:26,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif",marginBottom:4}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1}}>Comunidad escolar</div>
        </div>
        {items.length>0&&(
          <div style={{padding:"0 12px 16px"}}>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingLeft:8}}>{esPadre?"Mis hijos":"Mis cursos"}</div>
            {items.map((item,i)=>(
              <button key={i} onClick={()=>setCursoIdx(i)} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",background:i===cursoIdx?"rgba(255,255,255,0.12)":"transparent",color:i===cursoIdx?"white":"rgba(255,255,255,0.5)",fontSize:12,fontWeight:i===cursoIdx?700:500,textAlign:"left",marginBottom:2}}>
                {esPadre?item.nombre:`${item.avatar} ${item.nombre}`}
              </button>
            ))}
          </div>
        )}
        <div style={{padding:"0 12px",flex:1}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,paddingLeft:8}}>Menú</div>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{width:"100%",padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:tab===t.id?"rgba(255,255,255,0.12)":"transparent",color:tab===t.id?"white":"rgba(255,255,255,0.5)",fontSize:13,fontWeight:tab===t.id?700:400,textAlign:"left",marginBottom:2,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>
        <div style={{padding:"16px 12px",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.06)",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"white"}}>{usuario.nombre}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{ROL_LABEL[usuario.rol]}</div>
          </div>
          <button onClick={()=>setUsuario(null)} style={{width:"100%",padding:"9px 12px",borderRadius:12,border:"none",cursor:"pointer",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:600,textAlign:"left"}}>← Cerrar sesión</button>
        </div>
      </div>
      <div style={{marginLeft:220,flex:1,padding:"36px 40px",boxSizing:"border-box",minWidth:0,color:"#0F172A"}}>
        <div style={{maxWidth:800}}>{renderTab()}</div>
      </div>
    </div>
  );
}
