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
const fmtF   = s => new Date(s+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"});
const fmtDM  = s => new Date(s+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"});
const dHasta = s => { const h=new Date();h.setHours(0,0,0,0);const f=new Date(s+"T00:00:00");f.setHours(0,0,0,0);return Math.ceil((f-h)/86400000); };
const fmtNombre = (a) => a ? `${a.nombre||""} ${a.apellido||""}`.trim() : "";
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

// ── Selección de perfil (admin con hijos) ────────────────────────────────────
function SeleccionPerfil({ usuario, onElegir }) {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:32,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif",marginBottom:6}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <div style={{fontSize:14,color:"rgba(255,255,255,0.5)"}}>Hola, {usuario.nombre?.split(" ")[0]}. ¿Con qué perfil querés entrar?</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:320}}>
        <button onClick={()=>onElegir("admin")} style={{padding:"20px 24px",borderRadius:16,border:"2px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",cursor:"pointer",textAlign:"left",color:"white"}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Room Parent</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>Gestionar el curso, eventos, recordatorios y más</div>
        </button>
        <button onClick={()=>onElegir("padre")} style={{padding:"20px 24px",borderRadius:16,border:"2px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",cursor:"pointer",textAlign:"left",color:"white"}}>
          <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Apoderado</div>
          <div style={{fontSize:12,color:"rgba(255,255,255,0.5)"}}>Ver el curso de tus hijos, invitaciones y novedades</div>
        </button>
      </div>
    </div>
  );
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

function UploadAlumnosExcel({ cursos, onDone }) {
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
        return { nombre, apellido:apellido||null, curso_id, avatar, color, fecha_nacimiento:parseFecha(r.fecha_nacimiento||r.fecha) };
      }).filter(Boolean);

      if(!inserts.length) throw new Error("No se encontraron filas válidas. Verificá las columnas: nombre, apellido, curso_id, fecha_nacimiento");

      // Delete all alumnos of the courses present in the file
      const cursoIds = [...new Set(inserts.map(r=>r.curso_id))];
      for(const cid of cursoIds) {
        const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id",cid);
        if(hijos?.length) {
          const ids = hijos.map(h=>h.id);
          await supabase.from("usuario_hijos").delete().in("hijo_id",ids);
          await supabase.from("hijos").delete().eq("curso_id",cid);
        }
      }
      const { error } = await supabase.from("hijos").insert(inserts);
      if(error) throw error;
      setMsg(`✅ ${inserts.length} alumnos cargados correctamente`);
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
          <div style={{fontSize:11,color:"#94A3B8"}}>Columnas: nombre, apellido, curso_id, fecha_nacimiento</div>
        </div>
        <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}} disabled={loading}/>
      </label>
      {msg&&<div style={{fontSize:13,marginTop:8,fontWeight:600,color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</div>}
    </div>
  );
}

function UploadApoderadosExcel({ onDone }) {
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
        const nombre = String(r.nombre||"").trim();
        const email  = String(r.email||"").trim().toLowerCase();
        const pass   = String(r.pass||r.contraseña||r.password||"1234").trim();
        if(!nombre||!email) return null;
        const avatar = nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        return {
          nombre, email, pass, avatar,
          telefono: r.telefono ? String(r.telefono).trim() : null,
          rol:      r.rol||"padre",
          activo:   true,
        };
      }).filter(Boolean);

      if(!inserts.length) throw new Error("No se encontraron filas válidas. Verificá las columnas: nombre, email, pass, telefono");

      // Delete existing padres and their relations
      const { data: padres } = await supabase.from("usuarios").select("id").eq("rol","padre");
      if(padres?.length) {
        const ids = padres.map(p=>p.id);
        await supabase.from("usuario_hijos").delete().in("usuario_id",ids);
        await supabase.from("usuario_cursos").delete().in("usuario_id",ids);
        await supabase.from("usuarios").delete().in("id",ids);
      }
      const { error } = await supabase.from("usuarios").insert(inserts);
      if(error) throw error;
      setMsg(`✅ ${inserts.length} apoderados cargados correctamente`);
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
          <div style={{fontSize:11,color:"#94A3B8"}}>Columnas: nombre, email, pass, telefono, rol</div>
        </div>
        <input type="file" accept=".xlsx" onChange={handleFile} style={{display:"none"}} disabled={loading}/>
      </label>
      {msg&&<div style={{fontSize:13,marginTop:8,fontWeight:600,color:msg.startsWith("✅")?"#10B981":"#EF4444"}}>{msg}</div>}
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
  const [verApodSA,setVerApodSA]     = useState(null);

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
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
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
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    if(modal==="nuevo_maestro") {
      const { data } = await supabase.from("maestros").insert({nombre:form.nombre,materia:form.materia||null,email:form.email||null,avatar,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null}).select().single();
      if(data && form.cursos?.length) await supabase.from("maestro_cursos").insert(form.cursos.map(cid=>({maestro_id:data.id,curso_id:cid})));
    } else {
      await supabase.from("maestros").update({nombre:form.nombre,materia:form.materia||null,email:form.email||null,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
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
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
    const color = form.color||colors[Math.floor(Math.random()*colors.length)];
    if(modal==="nuevo_alumno") {
      await supabase.from("hijos").insert({nombre:form.nombre,apellido:form.apellido||null,curso_id:form.curso_id,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null});
    } else {
      await supabase.from("hijos").update({nombre:form.nombre,apellido:form.apellido||null,curso_id:form.curso_id,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
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

      {verApodSA&&<ApoderadosModal alumno={verApodSA} onClose={()=>setVerApodSA(null)}/>}
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
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Cumpleaños</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} placeholder="dd/mm/aaaa" style={inp}/>

            </div>
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
          <UploadApoderadosExcel onDone={cargar}/>
          <button onClick={()=>{ setForm({nombre:"",email:"",pass:"",rol:"padre",cursos:[],hijos:[],activo:true}); setModal("nuevo_usuario"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #3B82F6",background:"#EFF6FF",color:"#3B82F6",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar usuario individual</button>
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
          <UploadAlumnosExcel cursos={cursos} onDone={cargar}/>
          <button onClick={()=>{ setForm({nombre:"",curso_id:cursoFiltro||cursos[0]?.id,fecha_nacimiento:"",color:""}); setModal("nuevo_alumno"); }} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"2px dashed #10B981",background:"#F0FDF4",color:"#10B981",fontSize:13,fontWeight:700,cursor:"pointer",marginBottom:16}}>+ Agregar alumno individual</button>
          {(cursoFiltro?alumnos.filter(a=>a.curso_id===cursoFiltro):alumnos).map(a=>{
            const curso = cursos.find(c=>c.id===a.curso_id);
            const apoderados = (a.usuarios||[]).map(u=>u.usuarios).filter(Boolean);
            return (
              <Card key={a.id} style={{padding:"14px 16px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:42,height:42,borderRadius:12,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>{a.avatar||a.nombre?.slice(0,2).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <div style={{fontSize:14,fontWeight:700}}>{fmtNombre(a)}</div>
                      {curso&&<Pill label={curso.nombre} color={curso.color} bg={curso.color+"18"}/>}
                    </div>
                    {a.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtF(a.fecha_nacimiento)}</div>}
                    {apoderados.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👨‍👩‍👧 {apoderados.map(p=>p.nombre).join(", ")}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <button onClick={()=>setVerApodSA(a)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",fontSize:11,fontWeight:600,color:"#3B82F6"}}>👨‍👩‍👧</button>
                    <button onClick={()=>{ setForm({...a}); setModal("editar_alumno"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                    <button onClick={()=>setConfirm({msg:`¿Eliminar a ${fmtNombre(a)}?`,action:()=>eliminarAlumno(a.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
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
                  {m.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtDM(m.fecha_nacimiento)}</div>}
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

function Muro({ cursoId, cursoNombre, isAdmin, userName, userId }) {
  const [datos,setDatos] = useState(null);
  const [modal,setModal] = useState(false);
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [leidosMuro,setLeidosMuro] = useState(new Set());
  const hoy = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});

  useEffect(()=>{ cargar(); },[cursoId]);

  const cargar = async () => {
    const fechaHoy = new Date().toISOString().split("T")[0];
    const mesInicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const mesFin    = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).toISOString().slice(0,10);
    const [alerta,menu,recordatorios,cumples,cuotas,hijosData,maestrosData,eventosData,invitacionesData,leidosData] = await Promise.all([
      supabase.from("alertas").select("*").eq("curso_id",cursoId).eq("activa",true).order("creado_en",{ascending:false}).limit(1),
      supabase.from("menu").select("*").eq("fecha",fechaHoy).single(),
      supabase.from("recordatorios").select("*").eq("curso_id",cursoId),
      supabase.from("cumples").select("*").eq("curso_id",cursoId).order("fecha"),
      supabase.from("cuotas").select("*").eq("curso_id",cursoId),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id",cursoId),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id",cursoId),
      supabase.from("eventos").select("*").eq("curso_id",cursoId).gte("fecha",mesInicio).lte("fecha",mesFin).order("fecha"),
      userId ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,lugar,tipo,alumno_id)").eq("usuario_id",Number(userId)).eq("asiste","pendiente") : Promise.resolve({data:[]}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",Number(userId)) : Promise.resolve({data:[]}),
    ]);
    // Build unified birthday list sorted by next occurrence
    const nextBday = (fecha) => {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const d = new Date(fecha+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
      return Math.round((next - hoy) / (1000*60*60*24));
    };
    // Show all alumnos of the course + maestros assigned to that course
    const bdayList = [
      ...(hijosData.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`a-${a.id}`, nombre:fmtNombre(a), tipo:"Alumno",
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6",
      })),
      ...(maestrosData.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, nombre:m.nombre, tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6",
      })),
    ].sort((a,b)=>nextBday(a.fecha_nacimiento)-nextBday(b.fecha_nacimiento));
    const leidosIds = new Set((leidosData.data||[]).map(l=>l.recordatorio_id));
    const hoyStr = new Date().toISOString().split("T")[0];
    const recsNoLeidos = (recordatorios.data||[]).filter(r=> !leidosIds.has(r.id) && (!r.fecha || r.fecha >= hoyStr));
    setDatos({ alerta:alerta.data?.[0]||null, menu:menu.data||null, recordatorios:recsNoLeidos, cumples:cumples.data||[], cuotas:cuotas.data||[], bdayList, eventos:(eventosData.data||[]).filter(e=>e.tipo!=="cumple"&&e.tipo!=="festejo"), invitaciones:(invitacionesData.data||[]).filter(i=>i.evento) });
  };

  const marcarLeidoMuro = async (recId) => {
    if(!userId) return;
    await supabase.from("recordatorio_leidos").upsert({recordatorio_id:recId, usuario_id:Number(userId)},{onConflict:"recordatorio_id,usuario_id"});
    setLeidosMuro(p=> new Set([...p, recId]));
    setDatos(d=> d ? {...d, recordatorios: d.recordatorios.filter(r=>r.id!==recId)} : d);
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
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} onClose={()=>{ setFestejoDetalle(null); cargar(); }} onUpdate={cargar}/>}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:22,fontWeight:900}}>Hola{userName?`, ${userName}`:""} 👋</div>
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
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"long"})}{e.hora?` · ${e.hora}`:""}{e.lugar?` · 📍${e.lugar}`:""}</div>
                  </div>
                  <button onClick={()=>setFestejoDetalle(e)} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>Responder</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {datos.menu&&(
        <>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>🍽️ Menú de hoy</div>
          <Card style={{padding:"14px 16px",marginBottom:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {datos.menu.entrada&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#8B5CF6"}}>Entrada: </span>{datos.menu.entrada}</div>}
            {datos.menu.plato&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#3B82F6"}}>Plato 1: </span>{datos.menu.plato}</div>}
            {datos.menu.plato2&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#0EA5E9"}}>Plato 2: </span>{datos.menu.plato2}</div>}
            {datos.menu.acompanamiento&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#F59E0B"}}>Acomp.: </span>{datos.menu.acompanamiento}</div>}
            {datos.menu.postre&&<div style={{fontSize:13}}><span style={{fontWeight:700,color:"#10B981"}}>Postre: </span>{datos.menu.postre}{datos.menu.postre2&&` / ${datos.menu.postre2}`}</div>}
          </div>
        </Card>
        </>
      )}
      {datos.recordatorios.length>0&&(
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Recordatorios</div>
          {datos.recordatorios.map(r=>{
            const prioColor = {alta:"#EF4444",media:"#F59E0B",baja:"#10B981"}[r.prioridad||"media"];
            return (
              <div key={r.id} style={{background:"white",borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:12,border:"1px solid #E2E8F0",borderLeft:`3px solid ${r.urgente?"#EF4444":prioColor}`}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:r.urgente?700:500}}>{r.texto}</div>
                  <div style={{display:"flex",gap:8,marginTop:3,alignItems:"center"}}>
                    {r.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444"}}>Urgente</span>}
                    {r.fecha&&<span style={{fontSize:11,color:"#94A3B8"}}>{new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>}
                  </div>
                </div>
                <button onClick={()=>marcarLeidoMuro(r.id)} style={{padding:"5px 12px",borderRadius:8,border:"1px solid #E2E8F0",background:"#F8FAFC",cursor:"pointer",fontSize:12,fontWeight:600,color:"#64748B",flexShrink:0}}>Leído</button>
              </div>
            );
          })}
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
              <Card key={e.id} style={{padding:"12px 14px",marginBottom:8,borderLeft:`3px solid ${cfg.color}`}}>
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
              </Card>
            );
          })}
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
          <Card key={a.id} style={{padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>
              {a.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{a.nombre}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:isAlumno?"#EFF6FF":"#F5F3FF",color:isAlumno?"#3B82F6":"#8B5CF6"}}>{isAlumno?"🎒 Alumno":"👨‍🏫 Maestro"}</span>
                <span style={{fontSize:11,color:"#94A3B8"}}>{new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>
              </div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:dias===0?"#EF4444":dias<=7?"#F59E0B":"#94A3B8",background:dias===0?"#FEE2E2":dias<=7?"#FEF3C7":"#F1F5F9",borderRadius:8,padding:"3px 8px",flexShrink:0}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>
          </Card>
        );
      })}
      {(datos.bdayList||[]).length===0&&<div style={{fontSize:12,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin cumpleaños registrados</div>}
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

function UploadMenuExcel({ onDone }) {
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
      await supabase.from("menu").delete();
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

function Comedor({ cursoId, isAdmin, isSuper }) {
  const [menu,setMenu]         = useState([]);
  const [vista,setVista]       = useState("diario");
  const [fechaSel,setFechaSel] = useState(new Date().toISOString().split("T")[0]);
  const [mes,setMes]           = useState(new Date());

  const cargarMenu = () => {
    supabase.from("menu").select("*").order("fecha").then(r=>setMenu(r.data||[]));
  };
  useEffect(()=>{ cargarMenu(); },[cursoId]);

  const diaActual = menu.find(m=>m.fecha===fechaSel);
  const year=mes.getFullYear(), month=mes.getMonth();

  // Semana helpers
  const getInicioSemana = (fecha) => {
    const d = new Date(fecha+"T00:00:00");
    const day = d.getDay(); // 0=dom
    const diff = day===0 ? -6 : 1-day; // lunes
    d.setDate(d.getDate()+diff);
    return d;
  };
  const semanaBase = getInicioSemana(fechaSel);
  const diasSemana = Array.from({length:5},(_,i)=>{
    const d = new Date(semanaBase);
    d.setDate(d.getDate()+i);
    return d.toISOString().split("T")[0];
  });
  const navSemana = (dir) => {
    const d = new Date(fechaSel+"T00:00:00");
    d.setDate(d.getDate()+(dir*7));
    setFechaSel(d.toISOString().split("T")[0]);
  };
  const semanaLabel = () => {
    const ini = new Date(diasSemana[0]+"T00:00:00");
    const fin = new Date(diasSemana[4]+"T00:00:00");
    return `${ini.getDate()} al ${fin.getDate()} de ${MESES[fin.getMonth()]} ${fin.getFullYear()}`;
  };
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
      {isSuper && <UploadMenuExcel onDone={cargarMenu}/>}
      <div style={{display:"flex",gap:6,marginBottom:18,maxWidth:360}}>
        {[{id:"diario",l:"Día"},{id:"semanal",l:"Semana"},{id:"mensual",l:"Mes"}].map(v=>(
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

      {vista==="semanal"&&(
        <div style={{maxWidth:680}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <button onClick={()=>navSemana(-1)} style={{background:"white",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>‹</button>
            <div style={{fontSize:14,fontWeight:700,textAlign:"center"}}>{semanaLabel()}</div>
            <button onClick={()=>navSemana(1)} style={{background:"white",border:"1px solid #E2E8F0",borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
            {diasSemana.map(fecha=>{
              const d = new Date(fecha+"T00:00:00");
              const m = menu.find(x=>x.fecha===fecha);
              const isHoy = fecha===new Date().toISOString().split("T")[0];
              const isSel = fecha===fechaSel;
              return (
                <div key={fecha} onClick={()=>{ setFechaSel(fecha); setVista("diario"); }}
                  style={{borderRadius:14,border:`2px solid ${isHoy?"#3B82F6":isSel?"#0F172A":"#E2E8F0"}`,background:isHoy?"#EFF6FF":"white",cursor:"pointer",overflow:"hidden",transition:"box-shadow 0.15s"}}>
                  <div style={{background:isHoy?"#3B82F6":"#F8FAFC",padding:"8px 6px",textAlign:"center",borderBottom:"1px solid #E2E8F0"}}>
                    <div style={{fontSize:10,fontWeight:700,color:isHoy?"white":"#94A3B8",textTransform:"uppercase"}}>{d.toLocaleDateString("es-AR",{weekday:"short"}).replace(".","")}</div>
                    <div style={{fontSize:18,fontWeight:900,color:isHoy?"white":"#0F172A"}}>{d.getDate()}</div>
                  </div>
                  <div style={{padding:"8px 6px",minHeight:80}}>
                    {m ? (
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {campos.filter(c=>m[c.key]).slice(0,3).map(c=>(
                          <div key={c.key} style={{fontSize:10,lineHeight:1.3}}>
                            <span style={{fontWeight:700,color:c.color}}>{c.emoji} </span>
                            <span style={{color:"#0F172A"}}>{m[c.key]}</span>
                          </div>
                        ))}
                        {campos.filter(c=>m[c.key]).length>3&&(
                          <div style={{fontSize:9,color:"#94A3B8",marginTop:2}}>+{campos.filter(c=>m[c.key]).length-3} más</div>
                        )}
                      </div>
                    ) : (
                      <div style={{fontSize:10,color:"#CBD5E1",textAlign:"center",marginTop:16}}>Sin menú</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:11,color:"#94A3B8",marginTop:10,textAlign:"center"}}>Tocá un día para ver el detalle completo</div>
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

// Tipo → color/emoji
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

function EventoModal({ evento, cursoId, userId, onClose, onSave }) {
  const esNuevo = !evento;
  const [form, setForm] = useState({
    titulo:      evento?.titulo      || "",
    tipo:        evento?.tipo        || "acto",
    fecha:       evento?.fecha       || "",
    hora:        evento?.hora        || "",
    lugar:       evento?.lugar       || "",
    descripcion: evento?.descripcion || "",
    todo_el_dia: evento?.todo_el_dia !== false,
  });
  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const guardar = async () => {
    if(!form.titulo || !form.fecha) return;
    const payload = { ...form, curso_id: cursoId, creado_por: userId };
    if(esNuevo) await supabase.from("eventos").insert(payload);
    else        await supabase.from("eventos").update(payload).eq("id", evento.id);
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
              <button key={k} onClick={()=>setForm(p=>({...p,tipo:k}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.tipo===k?v.color:"#E2E8F0"}`,background:form.tipo===k?v.bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.tipo===k?v.color:"#94A3B8"}}>{v.emoji} {v.label}</button>
            ))}
          </div>
        </div>
        {[
          {label:"Título",      key:"titulo",      type:"text", ph:"Ej: Acto del 25 de mayo"},
          {label:"Fecha",       key:"fecha",       type:"date"},
          {label:"Lugar",       key:"lugar",       type:"text", ph:"Ej: Patio del colegio"},
          {label:"Descripción", key:"descripcion", type:"text", ph:"Detalles adicionales"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setForm(p=>({...p,todo_el_dia:!p.todo_el_dia}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.todo_el_dia?"#3B82F6":"#E2E8F0"}`,background:form.todo_el_dia?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.todo_el_dia?"#3B82F6":"#94A3B8"}}>Todo el día</button>
            {!form.todo_el_dia&&<input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto",flex:1}}/>}
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={guardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Guardar</button>
        </div>
      </Card>
    </div>
  );
}

function Calendario({ cursoId, userId, isAdmin }) {
  const horario   = HORARIOS[cursoId]||HORARIOS[1];
  const hoy       = new Date(); hoy.setHours(0,0,0,0);
  const [vista,   setVista]   = useState("mes");
  const [mes,     setMes]     = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [eventos, setEventos] = useState([]);
  const [cumples, setCumples] = useState([]);
  const [diaSelec,setDiaSelec]= useState(null);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [festejoDetalle, setFestejoDetalle] = useState(null);
  const [recordatorios,  setRecordatorios]  = useState([]);
  const [leidosSet,      setLeidosSet]      = useState(new Set());

  const cargarRecs = async () => {
    const hoyStr = new Date().toISOString().split("T")[0];
    const [recs, leidos] = await Promise.all([
      supabase.from("recordatorios").select("*").eq("curso_id",cursoId).order("fecha",{ascending:true}),
      userId ? supabase.from("recordatorio_leidos").select("recordatorio_id").eq("usuario_id",Number(userId)) : Promise.resolve({data:[]}),
    ]);
    setRecordatorios((recs.data||[]).filter(r=> !r.fecha || r.fecha >= hoyStr));
    setLeidosSet(new Set((leidos.data||[]).map(l=>l.recordatorio_id)));
  };

  const marcarLeido = async (recId) => {
    await supabase.from("recordatorio_leidos").upsert({recordatorio_id:recId, usuario_id:Number(userId)},{onConflict:"recordatorio_id,usuario_id"});
    setLeidosSet(p=> new Set([...p, recId]));
  };

  const cargar = async () => {
    const [ev, al, ma] = await Promise.all([
      supabase.from("eventos").select("*").eq("curso_id", cursoId).order("fecha"),
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id", cursoId),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id", cursoId),
    ]);
    setEventos(ev.data||[]);
    // Armamos cumples como eventos virtuales (próxima ocurrencia)
    const todos = [
      ...(al.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`c-a-${a.id}`, tipo:"cumple", nombre:fmtNombre(a), color:a.color||"#EC4899",
        fecha_nacimiento: a.fecha_nacimiento,
      })),
      ...(ma.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`c-m-${m.id}`, tipo:"cumple", nombre:m.nombre, color:"#8B5CF6",
        fecha_nacimiento: m.fecha_nacimiento,
      })),
    ];
    setCumples(todos);
  };
  useEffect(()=>{ cargar(); cargarRecs(); },[cursoId]);

  const eliminar = async (id) => {
    await supabase.from("eventos").delete().eq("id", id);
    setConfirm(null); cargar();
  };

  // Devuelve todos los "eventos" (reales + cumples) para un año/mes/día dado
  const eventosDelDia = (year, month, day) => {
    const fecha = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const reales = eventos.filter(e => e.fecha === fecha);
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
    const limite = new Date(hoy); limite.setDate(limite.getDate()+90);
    const reales = eventos
      .filter(e => { const d=new Date(e.fecha+"T00:00:00"); return d>=hoy && d<=limite; })
      .map(e => ({ ...e, titulo: e.titulo, _fecha: new Date(e.fecha+"T00:00:00") }));
    const bdayList = cumples.map(c => {
      const d = new Date(c.fecha_nacimiento+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < hoy) next = new Date(hoy.getFullYear()+1, d.getMonth(), d.getDate());
      if(next > limite) return null;
      return { ...c, titulo: c.nombre, fecha: next.toISOString().slice(0,10), _fecha: next };
    }).filter(Boolean);
    return [...reales, ...bdayList].sort((a,b)=>a._fecha-b._fecha);
  };

  const bgs = ["#EFF6FF","#F0FDF4","#FFF7ED","#F5F3FF","#FEFCE8"];
  const cols = ["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EAB308"];
  const diaSelecFecha = diaSelec ? `${diaSelec.year}-${String(diaSelec.month+1).padStart(2,"0")}-${String(diaSelec.day).padStart(2,"0")}` : null;
  const evDiaSelec = diaSelec ? eventosDelDia(diaSelec.year, diaSelec.month, diaSelec.day) : [];

  return (
    <div>
      {(modal==="nuevo"||modal?.id) && <EventoModal evento={modal==="nuevo"?null:modal} cursoId={cursoId} userId={userId} onClose={()=>setModal(null)} onSave={()=>{ setModal(null); cargar(); }}/>}
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

      {/* Tabs vista */}
      <div style={{display:"flex",gap:7,marginBottom:16,flexWrap:"wrap"}}>
        {[{id:"mes",l:"📆 Mes"},{id:"lista",l:"📋 Próximos"},{id:"horario",l:"🕐 Horario"},{id:"recordatorios",l:"📌 Recordatorios"}].map(t=>(
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
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                          <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                            {cfg.label}{e.hora&&!e.todo_el_dia?` · ${e.hora}`:""}{e.lugar?` · 📍${e.lugar}`:""}
                          </div>
                          {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                        </div>
                        {e.tipo==="festejo"&&<button onClick={()=>setFestejoDetalle(e)} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",fontSize:11,fontWeight:700,color:"#F59E0B"}}>Ver invitados</button>}
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
          {listaEventos().length===0&&<div style={{fontSize:13,color:"#94A3B8",padding:32,textAlign:"center"}}>No hay eventos próximos</div>}
          {listaEventos().map((e,i)=>{
            const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
            const d   = new Date(e.fecha+"T00:00:00");
            const dias = Math.round((d-hoy)/86400000);
            return (
              <Card key={e.id||i} style={{padding:"13px 15px",marginBottom:10,borderLeft:`3px solid ${cfg.color}`}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  <div style={{width:42,height:42,borderRadius:12,background:cfg.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <div style={{fontSize:18}}>{cfg.emoji}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                      {d.toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
                      {e.hora&&!e.todo_el_dia?` · ${e.hora}`:""}
                    </div>
                    {e.lugar&&<div style={{fontSize:11,color:"#94A3B8"}}>📍 {e.lugar}</div>}
                    {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:dias===0?"#FEE2E2":dias<=7?"#FEF3C7":"#F1F5F9",color:dias===0?"#EF4444":dias<=7?"#F59E0B":"#94A3B8"}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</span>
                    {e.tipo==="festejo"&&<button onClick={()=>setFestejoDetalle(e)} style={{padding:"3px 10px",borderRadius:6,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",fontSize:11,fontWeight:700,color:"#F59E0B"}}>Ver invitados</button>}
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
      {vista==="horario"&&(
        <div style={{maxWidth:640}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Horario semanal</div>
          {horario.map((row,i)=>(
            <Card key={i} style={{padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:42,height:42,borderRadius:12,background:bgs[i%5],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:cols[i%5],flexShrink:0}}>{row.dia.slice(0,3)}</div>
                <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:6,paddingTop:4}}>
                  {row.clases.map((c,j)=><span key={j} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20,background:"#F8FAFC",border:"1px solid #E2E8F0"}}>{c}</span>)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* VISTA RECORDATORIOS */}
      {vista==="recordatorios"&&(()=>{
        const PRIO = { alta:{l:"Alta",c:"#EF4444",bg:"#FEF2F2"}, media:{l:"Media",c:"#F59E0B",bg:"#FFFBEB"}, baja:{l:"Baja",c:"#10B981",bg:"#F0FDF4"} };
        const hoyStr = new Date().toISOString().split("T")[0];
        const noLeidos = recordatorios.filter(r=>!leidosSet.has(r.id));
        const leidos   = recordatorios.filter(r=> leidosSet.has(r.id));
        const vencidos = recordatorios.filter(r=> r.fecha && r.fecha < hoyStr);
        const renderRec = (r, showLeido=true) => {
          const prio = PRIO[r.prioridad||"media"];
          const dias = r.fecha ? Math.round((new Date(r.fecha+"T00:00:00")-new Date().setHours(0,0,0,0))/86400000) : null;
          const esLeido = leidosSet.has(r.id);
          return (
            <Card key={r.id} style={{padding:"12px 14px",marginBottom:8,maxWidth:560,opacity:esLeido?0.6:1,borderLeft:`3px solid ${r.urgente?"#EF4444":prio.c}`}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:esLeido?400:600,textDecoration:esLeido?"line-through":"none",color:esLeido?"#94A3B8":"#0F172A"}}>{r.texto}</div>
                  <div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:10,background:prio.bg,color:prio.c}}>{prio.l}</span>
                    {r.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444"}}>Urgente</span>}
                    {r.fecha&&<span style={{fontSize:11,color:"#94A3B8"}}>{new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}{dias!==null&&dias>=0?` · ${dias===0?"hoy":dias===1?"mañana":`${dias}d`}`:dias<0?" · vencido":""}</span>}
                  </div>
                </div>
                {showLeido&&!esLeido&&(
                  <button onClick={()=>marcarLeido(r.id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:700,color:"#64748B",flexShrink:0,whiteSpace:"nowrap"}}>✓ Leído</button>
                )}
              </div>
            </Card>
          );
        };
        return (
          <div style={{maxWidth:560}}>
            {noLeidos.length===0&&leidos.length===0&&(
              <div style={{textAlign:"center",padding:"32px 0",color:"#94A3B8",fontSize:13}}>Sin recordatorios activos</div>
            )}
            {noLeidos.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Pendientes ({noLeidos.length})</div>
                {noLeidos.sort((a,b)=>{
                  const pa={alta:0,media:1,baja:2}; const ua=pa[a.prioridad||"media"]||1; const ub=pa[b.prioridad||"media"]||1;
                  if(a.urgente&&!b.urgente) return -1; if(!a.urgente&&b.urgente) return 1;
                  if(ua!==ub) return ua-ub;
                  if(a.fecha&&b.fecha) return a.fecha.localeCompare(b.fecha);
                  return 0;
                }).map(r=>renderRec(r,true))}
              </div>
            )}
            {leidos.length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#CBD5E1",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Historial leídos ({leidos.length})</div>
                {leidos.map(r=>renderRec(r,false))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function InfoUtil({ cursoId, isAdmin }) {
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
        {[{id:"utiles",l:"✏️ Útiles"},{id:"uniformes",l:"👕 Uniformes"},{id:"libros",l:"📚 Libros"},{id:"alumnos",l:"🎒 Alumnos"}].map(s=>(
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
      {sec==="alumnos"&&<Alumnos cursoId={cursoId} isAdmin={isAdmin}/>}
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

// ── Festejo Modal (apoderado crea/edita su festejo) ──────────────────────────
function FestejoModal({ alumnoId, alumnoNombre, cursoId, userId, festejoExistente, onClose, onSave }) {
  const [form, setForm] = useState({
    titulo:      festejoExistente?.titulo      || `🎉 Festejo de ${alumnoNombre}`,
    fecha:       festejoExistente?.fecha       || "",
    hora:        festejoExistente?.hora        || "",
    lugar:       festejoExistente?.lugar       || "",
    descripcion: festejoExistente?.descripcion || "",
    todo_el_dia: festejoExistente?.todo_el_dia !== false ? false : false,
  });
  const [alumnos,    setAlumnos]    = useState([]);
  const [invitados,  setInvitados]  = useState([]);   // alumno_ids seleccionados
  const [guardando,  setGuardando]  = useState(false);

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  useEffect(()=>{
    supabase.from("hijos").select("id,nombre,apellido,color").eq("curso_id",cursoId).order("nombre")
      .then(r=>{ setAlumnos(r.data||[]); });
    if(festejoExistente?.id) {
      supabase.from("evento_asistencia").select("alumno_invitado_id").eq("evento_id", festejoExistente.id)
        .then(r=>setInvitados((r.data||[]).map(x=>x.alumno_invitado_id).filter(Boolean)));
    }
  },[]);

  const toggleAlumno = (id) => setInvitados(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const invitarTodos = () => setAlumnos(al => { setInvitados(al.filter(a=>a.id!==alumnoId).map(a=>a.id)); return al; });

  const guardar = async () => {
    if(!form.fecha || !form.titulo) return;
    setGuardando(true);
    let eventoId = festejoExistente?.id;
    if(eventoId) {
      await supabase.from("eventos").update({...form, tipo:"festejo", alumno_id:alumnoId, curso_id:cursoId, creado_por:userId}).eq("id", eventoId);
      await supabase.from("evento_asistencia").delete().eq("evento_id", eventoId).not("usuario_id","is",null);
    } else {
      const { data } = await supabase.from("eventos").insert({...form, tipo:"festejo", alumno_id:alumnoId, curso_id:cursoId, creado_por:userId}).select().single();
      eventoId = data?.id;
    }
    if(eventoId && invitados.length) {
      // Para cada alumno invitado, buscar sus apoderados y crear asistencia pendiente
      const { data: vinculos } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("hijo_id", invitados);
      if(vinculos?.length) {
        const rows = vinculos.map(v=>({ evento_id:eventoId, usuario_id:v.usuario_id, alumno_invitado_id:v.hijo_id, asiste:"pendiente" }));
        await supabase.from("evento_asistencia").upsert(rows, {onConflict:"evento_id,usuario_id"});
      }
    }
    setGuardando(false);
    onSave();
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:460,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{fontSize:16,fontWeight:900,marginBottom:4}}>🎉 {festejoExistente?"Editar festejo":"Nuevo festejo"}</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Festejo de {alumnoNombre}</div>

        {[
          {label:"Título",      key:"titulo",      type:"text", ph:`Festejo de ${alumnoNombre}`},
          {label:"Fecha",       key:"fecha",       type:"date"},
          {label:"Lugar",       key:"lugar",       type:"text", ph:"Ej: Salón de eventos, casa, etc."},
          {label:"Descripción", key:"descripcion", type:"text", ph:"Info adicional para los invitados"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
          </div>
        ))}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
          <input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto"}}/>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6}}>Invitados ({invitados.length})</div>
            <button onClick={invitarTodos} style={{fontSize:11,fontWeight:700,color:"#3B82F6",background:"#EFF6FF",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>Invitar a todo el curso</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
            {alumnos.filter(a=>a.id!==alumnoId).map(a=>{
              const sel = invitados.includes(a.id);
              return (
                <div key={a.id} onClick={()=>toggleAlumno(a.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,border:`2px solid ${sel?(a.color||"#3B82F6"):"#E2E8F0"}`,background:sel?(a.color||"#3B82F6")+"12":"white",cursor:"pointer"}}>
                  <div style={{width:28,height:28,borderRadius:7,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>{fmtNombre(a).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                  <span style={{fontSize:13,fontWeight:sel?700:400,flex:1}}>{fmtNombre(a)}</span>
                  {sel&&<span style={{fontSize:13,color:a.color||"#3B82F6"}}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={guardar} disabled={guardando} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando...":"Publicar festejo"}</button>
        </div>
      </Card>
    </div>
  );
}

// ── Festejo Detalle Modal (todos ven el festejo y confirman asistencia) ────────
function FestejoDetalleModal({ evento, userId, onClose, onUpdate }) {
  const [asistencia, setAsistencia] = useState([]);
  const [miRespuesta, setMiRespuesta] = useState(null);  // {asiste, comentario, hermanos}
  const [comentario, setComentario] = useState("");
  const [hermanos,   setHermanos]   = useState("");
  const [guardando,  setGuardando]  = useState(false);

  useEffect(()=>{
    cargar();
  },[evento.id]);

  const cargar = async () => {
    const { data: asist } = await supabase.from("evento_asistencia")
      .select("*")
      .eq("evento_id", evento.id);
    const rows = asist||[];
    // fetch usuarios separately
    const uids = [...new Set(rows.map(r=>r.usuario_id).filter(Boolean))];
    let usuariosMap = {};
    if(uids.length) {
      const { data: usrs } = await supabase.from("usuarios").select("id,nombre,avatar").in("id", uids);
      (usrs||[]).forEach(u=>{ usuariosMap[Number(u.id)]=u; });
    }
    const data = rows.map(r=>({...r, usuario: usuariosMap[Number(r.usuario_id)]||null}));
    setAsistencia(data);
    const uid = Number(userId);
    const mia = data.find(a=>Number(a.usuario_id)===uid);
    if(mia) {
      setMiRespuesta(mia);
      setComentario(mia.comentario||"");
      setHermanos(mia.hermanos||"");
    }
  };

  const responder = async (asiste) => {
    setGuardando(true);
    await supabase.from("evento_asistencia")
      .update({ asiste, comentario, hermanos })
      .eq("evento_id", evento.id)
      .eq("usuario_id", Number(userId));
    await cargar();
    setGuardando(false);
    onUpdate?.();
  };

  const uid = Number(userId);
  const confirmados = asistencia.filter(a=>a.asiste==="si");
  const noVan      = asistencia.filter(a=>a.asiste==="no");
  const pendientes = asistencia.filter(a=>a.asiste==="pendiente"||!a.asiste);
  const miAsiste   = asistencia.find(a=>Number(a.usuario_id)===uid)?.asiste;
  const esInvitado = asistencia.some(a=>Number(a.usuario_id)===uid);

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:460,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontSize:17,fontWeight:900,marginBottom:2}}>{evento.titulo}</div>
            <div style={{fontSize:12,color:"#94A3B8"}}>
              {new Date(evento.fecha+"T00:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
              {evento.hora?` · ${evento.hora}`:""}
            </div>
            {evento.lugar&&<div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>📍 {evento.lugar}</div>}
            {evento.descripcion&&<div style={{fontSize:12,color:"#64748B",marginTop:4}}>{evento.descripcion}</div>}
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#94A3B8",flexShrink:0}}>✕</button>
        </div>

        {/* Mi respuesta */}
        {esInvitado&&(
          <div style={{background:"#F8FAFC",borderRadius:12,padding:14,marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Mi respuesta</div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={()=>responder("si")} style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${miAsiste==="si"?"#10B981":"#E2E8F0"}`,background:miAsiste==="si"?"#F0FDF4":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:miAsiste==="si"?"#10B981":"#94A3B8"}}>✓ Voy</button>
              <button onClick={()=>responder("no")} style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${miAsiste==="no"?"#EF4444":"#E2E8F0"}`,background:miAsiste==="no"?"#FEF2F2":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:miAsiste==="no"?"#EF4444":"#94A3B8"}}>✗ No voy</button>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>Hermanos que asisten</div>
              <input value={hermanos} onChange={e=>setHermanos(e.target.value)} placeholder="Ej: Martina (4 años), Lucas (7 años)" style={inp}/>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>Comentario</div>
              <input value={comentario} onChange={e=>setComentario(e.target.value)} placeholder="Alergias, restricciones, etc." style={inp}/>
            </div>
            {(hermanos||comentario)&&<button onClick={()=>responder(miAsiste||"pendiente")} disabled={guardando} style={{width:"100%",padding:"8px 0",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando...":"Guardar comentarios"}</button>}
          </div>
        )}

        {/* Lista de asistencia */}
        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>
          Lista de asistencia · {confirmados.length} confirman
        </div>
        {confirmados.length===0&&pendientes.length===0&&noVan.length===0&&(
          <div style={{fontSize:13,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin respuestas aún</div>
        )}
        {[{list:confirmados,label:"✓ Van",color:"#10B981",bg:"#F0FDF4"},{list:pendientes,label:"⏳ Pendiente",color:"#F59E0B",bg:"#FFFBEB"},{list:noVan,label:"✗ No van",color:"#EF4444",bg:"#FEF2F2"}].map(({list,label,color,bg})=>
          list.length>0&&(
            <div key={label} style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color,marginBottom:5}}>{label} ({list.length})</div>
              {list.map((a,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"8px 10px",background:bg,borderRadius:10,marginBottom:5}}>
                  <div style={{width:30,height:30,borderRadius:8,background:color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color,flexShrink:0}}>
                    {(a.usuario?.nombre||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600}}>{a.usuario?.nombre||"—"}</div>
                    {a.hermanos&&<div style={{fontSize:11,color:"#64748B",marginTop:1}}>👨‍👩‍👧 {a.hermanos}</div>}
                    {a.comentario&&<div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>💬 {a.comentario}</div>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Card>
    </div>
  );
}

function ResponsableModal({ cumple, alumnos, onClose, onSave }) {
  const [responsableId, setResponsableId] = useState(cumple?.responsable_id||null);
  const [comprado, setComprado]           = useState(cumple?.comprado||false);

  const handleGuardar = (e) => {
    e.stopPropagation();
    onSave({ responsable_id: responsableId, comprado });
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:17,fontWeight:900,marginBottom:4}}>🎁 Regalo de {cumple.nombre}</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:18}}>
          🎂 {new Date(cumple.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}
          <span style={{marginLeft:8}}><Pill label={cumple.tipo==="Maestro"?"👨‍🏫 Maestro":"🎒 Alumno"} color={cumple.tipo==="Maestro"?"#8B5CF6":"#3B82F6"} bg={cumple.tipo==="Maestro"?"#F5F3FF":"#EFF6FF"}/></span>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Responsable del regalo</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
            <div onClick={()=>setResponsableId(null)} style={{padding:"9px 12px",borderRadius:10,border:`2px solid ${!responsableId?"#94A3B8":"#E2E8F0"}`,background:!responsableId?"#F8FAFC":"white",cursor:"pointer",fontSize:13,color:"#94A3B8",fontWeight:600}}>Sin asignar</div>
            {alumnos.filter(a=>a.tipo==="Alumno").map(a=>{
              const sel = responsableId===a.rawId;
              return (
                <div key={a.rawId} onClick={()=>setResponsableId(a.rawId)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:`2px solid ${sel?a.color:"#E2E8F0"}`,background:sel?a.color+"18":"white",cursor:"pointer"}}>
                  <div style={{width:30,height:30,borderRadius:8,background:a.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:a.color,flexShrink:0}}>{a.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                  <span style={{fontSize:13,fontWeight:sel?700:500}}>{a.nombre}</span>
                  {sel&&<span style={{marginLeft:"auto",fontSize:14,color:a.color}}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Estado del regalo</div>
          <button onClick={()=>setComprado(p=>!p)} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${comprado?"#10B981":"#E2E8F0"}`,background:comprado?"#F0FDF4":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:comprado?"#10B981":"#94A3B8"}}>{comprado?"✓ Comprado":"Pendiente"}</button>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={handleGuardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Guardar</button>
        </div>
      </Card>
    </div>
  );
}

function Cumpleanios({ cursoId, userId, isAdmin, misHijos }) {
  const [lista,setLista]               = useState([]);
  const [cumpleMap,setCumpleMap]       = useState({});
  const [festejoMap,setFestejoMap]     = useState({});  // alumno_id → evento festejo
  const [editando,setEditando]         = useState(null);
  const [festejoModal,setFestejoModal] = useState(null);
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [invitaciones,setInvitaciones] = useState([]);
  const [busqueda,setBusqueda]         = useState("");
  const [mesFiltro,setMesFiltro]       = useState("all");
  const [montoRegalo,setMontoRegalo]   = useState(null);

  const cargar = async () => {
    const [al,ma,cu,curso,fest,inv] = await Promise.all([
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id",cursoId).order("nombre"),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id",cursoId),
      supabase.from("cumples").select("*, responsable:responsable_id(id,nombre,apellido,color)").eq("curso_id",cursoId),
      supabase.from("cursos").select("monto_regalo").eq("id",cursoId).single(),
      supabase.from("eventos").select("*").eq("curso_id",cursoId).eq("tipo","festejo"),
      userId ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,lugar,tipo)").eq("usuario_id",Number(userId)) : Promise.resolve({data:[]}),
    ]);
    setMontoRegalo(curso.data?.monto_regalo||null);
    setInvitaciones((inv.data||[]).filter(i=>i.evento));
    const fmap = {};
    (fest.data||[]).forEach(f=>{ if(f.alumno_id) fmap[f.alumno_id]=f; });
    setFestejoMap(fmap);
    // Build unified list
    const unified = [
      ...(al.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`a-${a.id}`, rawId:a.id, nombre:fmtNombre(a), tipo:"Alumno",
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6",
      })),
      ...(ma.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, rawId:m.id, nombre:m.nombre, tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6",
      })),
    ];
    // Sort by next birthday
    const nextBday = (fecha) => {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const d = new Date(fecha+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
      return (next - hoy) / (1000*60*60*24);
    };
    unified.sort((a,b)=>nextBday(a.fecha_nacimiento)-nextBday(b.fecha_nacimiento));
    setLista(unified);
    // Map cumples by alumno_id or maestro_id_ref
    const map = {};
    (cu.data||[]).forEach(c=>{
      if(c.alumno_id)      map[`a-${c.alumno_id}`]      = c;
      if(c.maestro_id_ref) map[`m-${c.maestro_id_ref}`] = c;
    });
    setCumpleMap(map);
  };
  useEffect(()=>{ cargar(); },[cursoId]);

  const guardarResponsable = async ({responsable_id, comprado}) => {
    const isAlumno = editando.tipo==="Alumno";
    const campo = isAlumno ? "alumno_id" : "maestro_id_ref";
    const { data: rows } = await supabase
      .from("cumples")
      .select("id")
      .eq(campo, editando.rawId)
      .limit(1);
    const existente = rows && rows.length > 0 ? rows[0] : null;
    if(existente) {
      await supabase.from("cumples")
        .update({ responsable_id: responsable_id || null, comprado })
        .eq("id", existente.id);
    } else {
      await supabase.from("cumples").insert({
        curso_id: cursoId,
        alumno_id: isAlumno ? editando.rawId : null,
        maestro_id_ref: !isAlumno ? editando.rawId : null,
        responsable_id: responsable_id || null,
        comprado,
      });
    }
    setEditando(null);
    await cargar();
  };

  const nextBday = (fecha) => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const d = new Date(fecha+"T00:00:00");
    let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
    if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
    return Math.round((next - hoy) / (1000*60*60*24));
  };

  const bdayLabel = (dias) => {
    if(dias===0) return {l:"Hoy",     c:"#EF4444", bg:"#FEE2E2"};
    if(dias===1) return {l:"Mañana",  c:"#F59E0B", bg:"#FEF3C7"};
    if(dias<=7)  return {l:`${dias}d`, c:"#F59E0B", bg:"#FEF3C7"};
    return              {l:`${dias}d`, c:"#94A3B8", bg:"#F1F5F9"};
  };

  const mesesNombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const listaFiltrada = lista
    .filter(a => !busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .filter(a => mesFiltro==="all" || new Date(a.fecha_nacimiento+"T00:00:00").getMonth()===parseInt(mesFiltro));

  return (
    <div>
      {editando&&<ResponsableModal cumple={{...editando, responsable_id:cumpleMap[editando.id]?.responsable_id, comprado:cumpleMap[editando.id]?.comprado||false, monto_regalo:cumpleMap[editando.id]?.monto_regalo}} alumnos={lista} onClose={()=>setEditando(null)} onSave={guardarResponsable}/>}
      {festejoModal&&<FestejoModal alumnoId={festejoModal.alumnoId} alumnoNombre={festejoModal.alumnoNombre} cursoId={cursoId} userId={userId} festejoExistente={festejoModal.festejo} onClose={()=>setFestejoModal(null)} onSave={()=>{ setFestejoModal(null); cargar(); }}/>}
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} onClose={()=>setFestejoDetalle(null)} onUpdate={cargar}/>}
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Cumpleaños 🎂</div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:"#94A3B8"}}>{lista.length} cumpleaños en el curso</div>
        {montoRegalo&&<div style={{fontSize:12,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"4px 12px",borderRadius:20,border:"1px solid #BBF7D0"}}>🎁 Monto por familia: ${Number(montoRegalo).toLocaleString("es-AR")}</div>}
      </div>

      <div style={{maxWidth:700}}>
          <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar nombre..." style={{flex:1,minWidth:160,padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",background:"white"}}/>
            <select value={mesFiltro} onChange={e=>setMesFiltro(e.target.value)} style={{padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",background:"white",color:"#0F172A"}}>
              <option value="all">Todos los meses</option>
              {mesesNombres.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <Card style={{overflow:"hidden",padding:0}}>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"#F8FAFC"}}>
                  {["Nombre","Tipo","Fecha","Festejo","Responsable regalo","Faltan"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,textAlign:"left",borderBottom:"1px solid #E2E8F0"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.length===0&&(
                  <tr><td colSpan={7} style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Sin cumpleaños para mostrar</td></tr>
                )}
                {listaFiltrada.map((a,i)=>{
                  const dias    = nextBday(a.fecha_nacimiento);
                  const badge   = bdayLabel(dias);
                  const cumple  = cumpleMap[a.id];
                  const resp    = cumple?.responsable;
                  const isAlumno = a.tipo==="Alumno";
                  return (
                    <tr key={a.id} style={{borderBottom:"1px solid #F1F5F9",background:i%2===0?"white":"#FAFAFA"}}>
                      <td style={{padding:"11px 14px"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:34,height:34,borderRadius:10,background:(a.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:a.color||"#3B82F6",flexShrink:0}}>
                            {a.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
                          </div>
                          <span style={{fontSize:13,fontWeight:700}}>{a.nombre}</span>
                        </div>
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:isAlumno?"#EFF6FF":"#F5F3FF",color:isAlumno?"#3B82F6":"#8B5CF6"}}>
                          {isAlumno?"Alumno":"Maestro"}
                        </span>
                      </td>
                      <td style={{padding:"11px 14px",fontSize:13,color:"#0F172A"}}>
                        {new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        {isAlumno&&(()=>{
                          const fest = festejoMap[a.rawId];
                          const esMiHijo = misHijos?.includes(a.rawId);
                          if(fest) return (
                            <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <button onClick={()=>setFestejoDetalle(fest)} style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",color:"#F59E0B"}}>🎉 {new Date(fest.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"})}</button>
                              {esMiHijo&&<button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre,festejo:fest})} style={{fontSize:10,padding:"3px 7px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#94A3B8"}}>✏️</button>}
                            </div>
                          );
                          if(esMiHijo) return (
                            <button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre})} style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",color:"#3B82F6"}}>+ Crear festejo</button>
                          );
                          return <span style={{fontSize:12,color:"#CBD5E1"}}>—</span>;
                        })()}
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        {resp
                          ? <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{width:26,height:26,borderRadius:7,background:(resp.color||"#3B82F6")+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:resp.color||"#3B82F6",flexShrink:0}}>{fmtNombre(resp).split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                              <span style={{fontSize:12,fontWeight:600}}>{fmtNombre(resp)}</span>
                              {isAdmin&&<button onClick={()=>setEditando(a)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:10,color:"#94A3B8"}}>✏️</button>}
                            </div>
                          : <div style={{display:"flex",alignItems:"center",gap:6}}>
                              <span style={{fontSize:12,color:"#CBD5E1"}}>Sin asignar</span>
                              {isAdmin&&<button onClick={()=>setEditando(a)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",fontSize:10,color:"#3B82F6",fontWeight:600}}>+ Asignar</button>}
                            </div>
                        }
                      </td>
                      <td style={{padding:"11px 14px"}}>
                        <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:badge.bg,color:badge.c}}>{badge.l}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>

      {/* Mis invitaciones a festejos */}
      {invitaciones.length>0&&(
        <div style={{marginTop:24,maxWidth:700}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>🎉 Mis invitaciones</div>
          {invitaciones.map(inv=>{
            const e   = inv.evento;
            const d   = new Date(e.fecha+"T00:00:00");
            const hoyD = new Date(); hoyD.setHours(0,0,0,0);
            const dias = Math.round((d-hoyD)/86400000);
            const badge = inv.asiste==="si"  ? {l:"✓ Voy",    c:"#10B981",bg:"#F0FDF4"}
                        : inv.asiste==="no"  ? {l:"✗ No voy", c:"#EF4444",bg:"#FEF2F2"}
                        :                     {l:"Pendiente", c:"#F59E0B",bg:"#FFFBEB"};
            return (
              <Card key={inv.id} style={{padding:"13px 15px",marginBottom:10,borderLeft:`3px solid ${inv.asiste==="si"?"#10B981":inv.asiste==="no"?"#EF4444":"#F59E0B"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:40,height:40,borderRadius:12,background:"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎉</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                      {d.toLocaleDateString("es-AR",{weekday:"short",day:"numeric",month:"long"})}
                      {e.hora?` · ${e.hora}`:""}
                      {e.lugar?` · 📍${e.lugar}`:""}
                    </div>
                    {inv.hermanos&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>👨‍👩‍👧 {inv.hermanos}</div>}
                    {inv.comentario&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>💬 {inv.comentario}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:badge.bg,color:badge.c}}>{badge.l}</span>
                    <span style={{fontSize:10,color:dias<0?"#CBD5E1":dias===0?"#EF4444":dias<=7?"#F59E0B":"#94A3B8",fontWeight:600}}>{dias<0?"Pasado":dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</span>
                    <button onClick={()=>setFestejoDetalle(e)} style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:8,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",color:"#F59E0B"}}>Ver / Responder</button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApoderadosModal({ alumno, onClose, canEdit=true }) {
  const [vinculados,setVinculados] = useState([]);
  const [todos,setTodos]           = useState([]);
  const [busqueda,setBusqueda]     = useState("");

  useEffect(()=>{ cargar(); },[alumno.id]);

  const cargar = async () => {
    const [v,t] = await Promise.all([
      supabase.from("usuario_hijos").select("*, usuarios(id,nombre,email,telefono)").eq("hijo_id",alumno.id),
      supabase.from("usuarios").select("id,nombre,email,telefono,rol").eq("activo",true).order("nombre"),
    ]);
    // Exclude only super admins — room parents can also be apoderados
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
  const disponibles = todos.filter(u=>
    !vinculadosIds.includes(u.id) &&
    (u.nombre.toLowerCase().includes(busqueda.toLowerCase()) || u.email.toLowerCase().includes(busqueda.toLowerCase()))
  );

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:900}}>Apoderados</div>
            <div style={{fontSize:12,color:"#94A3B8"}}>{alumno.nombre}</div>
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16,color:"#94A3B8"}}>✕</button>
        </div>

        {vinculados.length>0&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Vinculados</div>
            {vinculados.map(v=>(
              <div key={v.usuario_id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#F0FDF4",border:"1px solid #BBF7D0",marginBottom:7}}>
                <div style={{width:34,height:34,borderRadius:10,background:"#10B981",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"white",flexShrink:0}}>{v.usuarios?.nombre?.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>{v.usuarios?.nombre}</div>
                  <div style={{fontSize:11,color:"#94A3B8"}}>{v.usuarios?.email}{v.usuarios?.telefono&&` · ${v.usuarios.telefono}`}</div>
                </div>
                {canEdit&&<button onClick={()=>desvincular(v.usuario_id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #FCA5A5",background:"#FEF2F2",cursor:"pointer",fontSize:11,fontWeight:700,color:"#EF4444",flexShrink:0}}>Quitar</button>}
              </div>
            ))}
          </div>
        )}

        {canEdit&&<>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Agregar apoderado</div>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar por nombre o email..." style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",marginBottom:10,boxSizing:"border-box",background:"#F8FAFC"}}/>
          <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:6}}>
            {disponibles.length===0&&<div style={{textAlign:"center",padding:20,fontSize:12,color:"#94A3B8"}}>No hay apoderados disponibles</div>}
            {disponibles.map(u=>(
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#F8FAFC",border:"1px solid #E2E8F0"}}>
                <div style={{width:34,height:34,borderRadius:10,background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#3B82F6",flexShrink:0}}>{u.nombre.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700}}>{u.nombre}</div>
                  <div style={{fontSize:11,color:"#94A3B8"}}>{u.email}{u.telefono&&` · ${u.telefono}`}</div>
                </div>
                <button onClick={()=>vincular(u.id)} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",fontSize:11,fontWeight:700,color:"#3B82F6",flexShrink:0}}>Vincular</button>
              </div>
            ))}
          </div>
        </>}
      </Card>
    </div>
  );
}

function Alumnos({ cursoId, isAdmin }) {
  const [alumnos,setAlumnos]   = useState([]);
  const [modal,setModal]       = useState(null);
  const [form,setForm]         = useState({});
  const [confirm,setConfirm]   = useState(null);
  const [busqueda,setBusqueda]       = useState("");
  const [verApoderados,setVerApoderados] = useState(null);

  useEffect(()=>{ cargar(); },[cursoId]);

  const cargar = async () => {
    const { data } = await supabase.from("hijos")
      .select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,email,telefono))")
      .eq("curso_id",cursoId).order("nombre");
    setAlumnos(data||[]);
  };

  const guardar = async () => {
    if(!form.nombre) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    const colors = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
    const color = form.color||colors[Math.floor(Math.random()*colors.length)];
    if(modal==="nuevo") {
      await supabase.from("hijos").insert({nombre:form.nombre,apellido:form.apellido||null,curso_id:cursoId,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null});
    } else {
      await supabase.from("hijos").update({nombre:form.nombre,apellido:form.apellido||null,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
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
      {verApoderados&&<ApoderadosModal alumno={verApoderados} onClose={()=>setVerApoderados(null)} canEdit={isAdmin}/>}
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
                  <div style={{fontSize:14,fontWeight:700}}>{fmtNombre(a)}</div>
                  {a.fecha_nacimiento&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>🎂 {fmtF(a.fecha_nacimiento)}</div>}
                  {apoderados.length>0&&<div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>👨‍👩‍👧 {apoderados.map(p=>p.nombre).join(", ")}{apoderados[0]?.telefono&&` · ${apoderados[0].telefono}`}</div>}
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>setVerApoderados(a)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",fontSize:11,fontWeight:600,color:"#3B82F6"}}>👨‍👩‍👧</button>
                  {isAdmin&&<>
                    <button onClick={()=>{ setForm({...a}); setModal("editar"); }} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>✏️</button>
                    <button onClick={()=>setConfirm({msg:`¿Eliminar a ${fmtNombre(a)}?`,action:()=>eliminar(a.id)})} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}>🗑️</button>
                  </>}
                </div>
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
  const [stats,setStats]       = useState({cuotasOk:0,sinPagar:0,regalos:0});
  const [monto,setMonto]       = useState("");
  const [montoGuardado,setMontoGuardado] = useState(null);
  const [savingMonto,setSavingMonto]     = useState(false);
  const [recordatorios,setRecordatorios] = useState([]);
  const [recForm,setRecForm]   = useState(null); // null | {} | {id,...}
  const [savingRec,setSavingRec] = useState(false);

  const EMOJIS = ["📌","📢","⚠️","✅","📅","💰","🎒","📝","🏥","🚌"];

  const cargar = () => {
    Promise.all([
      supabase.from("cuotas").select("*").eq("curso_id",cursoId),
      supabase.from("cumples").select("*").eq("curso_id",cursoId),
      supabase.from("cursos").select("monto_regalo").eq("id",cursoId).single(),
      supabase.from("recordatorios").select("*").eq("curso_id",cursoId).order("id",{ascending:false}),
    ]).then(([c,cu,curso,rec])=>{
      const cuotas=c.data||[],cumples=cu.data||[];
      setStats({cuotasOk:cuotas.filter(x=>x.pagado).length,sinPagar:cuotas.filter(x=>!x.pagado).length,regalos:cumples.filter(x=>!x.comprado).length});
      const m = curso.data?.monto_regalo;
      setMontoGuardado(m);
      setMonto(m ? String(m) : "");
      setRecordatorios(rec.data||[]);
    });
  };

  useEffect(()=>{ cargar(); },[cursoId]);

  const guardarRec = async () => {
    if(!recForm?.texto?.trim()) return;
    setSavingRec(true);
    const payload = {texto:recForm.texto, emoji:recForm.emoji||"📌", urgente:recForm.urgente||false, prioridad:recForm.prioridad||"media", fecha:recForm.fecha||null};
    if(recForm.id) {
      await supabase.from("recordatorios").update(payload).eq("id",recForm.id);
    } else {
      await supabase.from("recordatorios").insert({...payload, curso_id:cursoId});
    }
    setSavingRec(false);
    setRecForm(null);
    cargar();
  };

  const eliminarRec = async (id) => {
    await supabase.from("recordatorios").delete().eq("id",id);
    cargar();
  };

  const guardarMonto = async () => {
    setSavingMonto(true);
    await supabase.from("cursos").update({monto_regalo: monto ? Number(monto) : null}).eq("id",cursoId);
    setMontoGuardado(monto ? Number(monto) : null);
    setSavingMonto(false);
  };

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

      <Card style={{padding:"16px 18px",marginBottom:20,maxWidth:400}}>
        <div style={{fontSize:13,fontWeight:800,marginBottom:12}}>🎁 Monto regalo por alumno</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:12}}>Este monto se muestra a todos los apoderados del curso en la sección Cumpleaños.</div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flex:1,border:"1.5px solid #E2E8F0",borderRadius:10,padding:"8px 12px",background:"#F8FAFC"}}>
            <span style={{fontSize:14,fontWeight:700,color:"#94A3B8"}}>$</span>
            <input
              type="number"
              value={monto}
              onChange={e=>setMonto(e.target.value)}
              placeholder="Ej: 5000"
              style={{border:"none",outline:"none",background:"transparent",fontSize:14,fontWeight:600,width:"100%",color:"#0F172A"}}
            />
          </div>
          <button onClick={guardarMonto} disabled={savingMonto} style={{padding:"9px 16px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700,whiteSpace:"nowrap"}}>
            {savingMonto?"Guardando...":"Guardar"}
          </button>
        </div>
        {montoGuardado&&<div style={{fontSize:11,color:"#10B981",fontWeight:600,marginTop:8}}>✓ Monto actual: ${Number(montoGuardado).toLocaleString("es-AR")} por familia</div>}
      </Card>

      {/* Recordatorios */}
      <div style={{maxWidth:560,marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1}}>📌 Recordatorios</div>
          <button onClick={()=>setRecForm({texto:"",emoji:"📌",urgente:false,prioridad:"media",fecha:""})} style={{fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer"}}>+ Nuevo</button>
        </div>
        {recordatorios.length===0&&<div style={{fontSize:13,color:"#94A3B8",padding:"10px 0"}}>Sin recordatorios</div>}
        {recordatorios.map(r=>(
          <Card key={r.id} style={{padding:"11px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:10,borderLeft:r.urgente?"3px solid #EF4444":"3px solid #E2E8F0",background:r.urgente?"#FFF1F2":"white"}}>
            <span style={{fontSize:20}}>{r.emoji}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:r.urgente?700:500}}>{r.texto}</div>
              <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                {r.urgente&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#FEE2E2",color:"#EF4444"}}>⚠️ Urgente</span>}
                {{alta:{l:"Alta",c:"#EF4444",bg:"#FEF2F2"},media:{l:"Media",c:"#F59E0B",bg:"#FFFBEB"},baja:{l:"Baja",c:"#10B981",bg:"#F0FDF4"}}[r.prioridad||"media"]&&(
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:{alta:"#FEF2F2",media:"#FFFBEB",baja:"#F0FDF4"}[r.prioridad||"media"],color:{alta:"#EF4444",media:"#F59E0B",baja:"#10B981"}[r.prioridad||"media"]}}>{r.prioridad||"media"}</span>
                )}
                {r.fecha&&<span style={{fontSize:10,color:"#94A3B8"}}>📅 {new Date(r.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"})}</span>}
              </div>
            </div>
            <button onClick={()=>setRecForm({...r,fecha:r.fecha||"",prioridad:r.prioridad||"media"})} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,color:"#64748B"}}>✏️</button>
            <button onClick={()=>eliminarRec(r.id)} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
          </Card>
        ))}
      </div>

      {/* Modal recordatorio */}
      {recForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{recForm.id?"Editar recordatorio":"Nuevo recordatorio"}</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:6}}>EMOJI</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {EMOJIS.map(e=>(
                  <button key={e} onClick={()=>setRecForm(p=>({...p,emoji:e}))} style={{width:36,height:36,borderRadius:8,border:`2px solid ${recForm.emoji===e?"#3B82F6":"#E2E8F0"}`,background:recForm.emoji===e?"#EFF6FF":"white",cursor:"pointer",fontSize:18}}>{e}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:6}}>TEXTO</div>
              <textarea value={recForm.texto} onChange={e=>setRecForm(p=>({...p,texto:e.target.value}))} placeholder="Ej: Traer autorización firmada el viernes" rows={3} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",resize:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>FECHA LÍMITE</div>
                <input type="date" value={recForm.fecha||""} onChange={e=>setRecForm(p=>({...p,fecha:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PRIORIDAD</div>
                <select value={recForm.prioridad||"media"} onChange={e=>setRecForm(p=>({...p,prioridad:e.target.value}))} style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"}}>
                  <option value="alta">🔴 Alta</option>
                  <option value="media">🟡 Media</option>
                  <option value="baja">🟢 Baja</option>
                </select>
              </div>
            </div>
            <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <input type="checkbox" id="urgente" checked={recForm.urgente||false} onChange={e=>setRecForm(p=>({...p,urgente:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/>
              <label htmlFor="urgente" style={{fontSize:13,fontWeight:600,cursor:"pointer",color:recForm.urgente?"#EF4444":"#0F172A"}}>⚠️ Marcar como urgente</label>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setRecForm(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardarRec} disabled={savingRec} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{savingRec?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [usuario,setUsuario]       = useState(null);
  const [perfilElegido,setPerfilElegido] = useState(null); // null | "admin" | "padre"
  const [tab,setTab]               = useState("muro");
  const [cursoIdx,setCursoIdx]     = useState(0);
  const [items,setItems]           = useState([]);

  useEffect(()=>{
    if(!usuario||usuario.rol==="super") return;
    const rolEfectivo = perfilElegido || usuario.rol;
    if(rolEfectivo==="padre") {
      supabase.from("hijos").select("*, cursos(nombre,color,avatar)").in("id",usuario.hijos).then(r=>setItems(r.data||[]));
    } else {
      supabase.from("cursos").select("*").in("id",usuario.cursos).then(r=>setItems(r.data||[]));
    }
  },[usuario,perfilElegido]);

  const handleLogin = (u) => { setUsuario(u); setPerfilElegido(null); setTab("muro"); setCursoIdx(0); setItems([]); };
  if(!usuario) return <Login onLogin={handleLogin}/>;
  // Admin con hijos → elegir perfil
  if(usuario.rol==="admin" && usuario.hijos?.length>0 && !perfilElegido) {
    return <SeleccionPerfil usuario={usuario} onElegir={(p)=>{ setPerfilElegido(p); setTab("muro"); setCursoIdx(0); setItems([]); }}/>;
  }

  if(usuario.rol==="super") return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light"}}>
      <div style={{background:"#0F172A",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{fontSize:22,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <button onClick={()=>setUsuario(null)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:12}}>Salir</button>
      </div>
      <div style={{padding:"24px 20px",maxWidth:800,margin:"0 auto"}}><SuperAdmin/></div>
    </div>
  );

  const rolEfectivo = perfilElegido || usuario.rol;
  const esPadre    = rolEfectivo==="padre";
  const itemActual = items[cursoIdx];
  const cursoId    = esPadre ? itemActual?.curso_id    : itemActual?.id;
  const cursoNombre= esPadre ? itemActual?.cursos?.nombre : itemActual?.nombre;
  const isAdmin    = rolEfectivo==="admin";

  const TABS = [
    {id:"muro",    label:"Inicio",    emoji:"🏠"},
    {id:"clases",  label:"Calendario",emoji:"📅"},
    {id:"comedor", label:"Comedor",   emoji:"🍽️"},
    {id:"cumples", label:"Cumples",   emoji:"🎂"},
    {id:"info",    label:"Info Útil", emoji:"📋"},
    {id:"contacto",label:"Contacto",  emoji:"📞"},
    {id:"finanzas",label:"Finanzas",  emoji:"💳"},
    ...(isAdmin?[{id:"alumnos",label:"Alumnos",emoji:"🎒"},{id:"admin",label:"Admin",emoji:"⚙️"}]:[]),
  ];

  const renderTab = () => {
    if(!cursoId) return <Spinner/>;
    switch(tab) {
      case "muro":     return <Muro cursoId={cursoId} cursoNombre={cursoNombre} isAdmin={isAdmin} userName={usuario.nombre?.split(" ")[0]||""} userId={usuario.id}/>;
      case "clases":   return <Calendario cursoId={cursoId} userId={usuario.id} isAdmin={isAdmin}/>;
      case "comedor":  return <Comedor cursoId={cursoId} isAdmin={isAdmin} isSuper={usuario?.rol==="super"}/>;
      case "info":     return <InfoUtil cursoId={cursoId} isAdmin={isAdmin}/>;
      case "finanzas": return <Finanzas cursoId={cursoId}/>;
      case "cumples":  return <Cumpleanios cursoId={cursoId} userId={usuario.id} isAdmin={isAdmin} misHijos={usuario.hijos||[]}/>;

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
            {usuario.rol==="admin"&&usuario.hijos?.length>0&&<button onClick={()=>{ setPerfilElegido(null); setItems([]); }} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"5px 10px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:11,marginRight:6}}>Cambiar perfil</button>}
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
