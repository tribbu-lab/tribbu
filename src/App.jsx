// @ts-nocheck
import { useState } from "react";

/* ─── PALETA ─────────────────────────────────────────────────── */
const T = {
  primary: "#0F172A", accent: "#3B82F6", green: "#10B981",
  yellow: "#F59E0B", red: "#EF4444", purple: "#8B5CF6",
  bg: "#F8FAFC", card: "#FFFFFF", text: "#0F172A", muted: "#94A3B8",
  border: "#E2E8F0",
};

/* ─── DATOS DEMO ─────────────────────────────────────────────── */
const USUARIOS = [
  { id:1, nombre:"Ana González",   email:"ana@mail.com",   pass:"1234",  rol:"padre", hijos:[1,2], avatar:"AG" },
  { id:2, nombre:"Pedro Martínez", email:"pedro@mail.com", pass:"1234",  rol:"padre", hijos:[1],   avatar:"PM" },
  { id:3, nombre:"Laura Sánchez",  email:"laura@mail.com", pass:"admin", rol:"admin", cursos:[1],  avatar:"LS" },
  { id:4, nombre:"Diego Ríos",     email:"diego@mail.com", pass:"admin", rol:"admin", cursos:[2],  avatar:"DR" },
];

const HIJOS = [
  { id:1, nombre:"Sofía González",  curso:"3°A — Primaria", cursoId:1, avatar:"SG", color:"#3B82F6" },
  { id:2, nombre:"Mateo González",  curso:"6°B — Primaria", cursoId:2, avatar:"MG", color:"#8B5CF6" },
];

const CURSOS = [
  { id:1, nombre:"3°A — Primaria", avatar:"🦁", color:"#3B82F6" },
  { id:2, nombre:"6°B — Primaria", avatar:"🦋", color:"#8B5CF6" },
];

const HORARIOS = {
  1: [
    { dia:"Lunes",    clases:["Matemáticas 8:00","Lengua 9:30","Ed. Física 11:00","Cs. Naturales 14:00"] },
    { dia:"Martes",   clases:["Inglés 8:00","Plástica 9:30","Matemáticas 11:00","Música 14:00"] },
    { dia:"Miércoles",clases:["Lengua 8:00","Cs. Sociales 9:30","Ed. Física 11:00"] },
    { dia:"Jueves",   clases:["Matemáticas 8:00","Inglés 9:30","Lengua 11:00","Tecnología 14:00"] },
    { dia:"Viernes",  clases:["Cs. Naturales 8:00","Lengua 9:30","Música 11:00"] },
  ],
  2: [
    { dia:"Lunes",    clases:["Matemáticas 8:00","Lengua 9:30","Inglés 11:00"] },
    { dia:"Martes",   clases:["Cs. Naturales 8:00","Ed. Física 9:30","Plástica 11:00"] },
    { dia:"Miércoles",clases:["Lengua 8:00","Matemáticas 9:30","Música 11:00"] },
    { dia:"Jueves",   clases:["Inglés 8:00","Cs. Sociales 9:30","Tecnología 11:00"] },
    { dia:"Viernes",  clases:["Lengua 8:00","Ed. Física 9:30","Matemáticas 11:00"] },
  ],
};

const DEMO = {
  1: {
    alerta: null,
    recordatorios:[
      { id:1, texto:"Traer autorización paseo al Zoo", emoji:"📋", urgente:false },
      { id:2, texto:"Reunión de padres jueves 19hs", emoji:"👥", urgente:true },
    ],
    menu:[
      { dia:"Lunes",    plato:"Milanesa con puré",   postre:"Fruta de estación" },
      { dia:"Martes",   plato:"Guiso de lentejas",   postre:"Yogur" },
      { dia:"Miércoles",plato:"Tarta de verduras",   postre:"Manzana" },
      { dia:"Jueves",   plato:"Pollo con ensalada",  postre:"Gelatina" },
      { dia:"Viernes",  plato:"Fideos con tuco",     postre:"Naranja" },
    ],
    finanzas:{
      cuotas:[
        { id:1, tipo:"Cuota Marzo",   venc:"2026-03-15", monto:45000, pagado:false },
        { id:2, tipo:"Cuota Abril",   venc:"2026-04-15", monto:45000, pagado:false },
        { id:3, tipo:"Matrícula 2026",venc:"2026-02-28", monto:85000, pagado:true  },
      ],
      beca:{ activa:true, pct:50, venc:"2026-08-01" },
    },
    cumples:[
      { id:1, nombre:"Luna García",      fecha:"2026-03-15", responsable:"Familia López",     comprado:false, asistencia:{} },
      { id:2, nombre:"Pedro Martínez",   fecha:"2026-03-22", responsable:"Familia Rodríguez", comprado:true,  asistencia:{} },
      { id:3, nombre:"Valentina Torres", fecha:"2026-04-03", responsable:"Tu familia 🎁",     comprado:false, asistencia:{} },
      { id:4, nombre:"Santiago Núñez",   fecha:"2026-04-18", responsable:"Familia Gómez",     comprado:false, asistencia:{} },
    ],
    utiles:[
      { item:"Carpeta N°5 negra",          oblig:true  },
      { item:"Cuaderno cuadriculado 48h ×3", oblig:true  },
      { item:"Caja lápices colores ×24",   oblig:true  },
      { item:"Tijera punta roma",          oblig:true  },
      { item:"Regla 30cm",                 oblig:false },
      { item:"Compás básico",              oblig:false },
    ],
    uniformes:[
      { tipo:"Diario",          emoji:"👕", items:["Jogging azul marino","Remera blanca con logo","Zapatillas blancas o negras","Campera azul marino"] },
      { tipo:"Ed. Física",      emoji:"🏃", items:["Short azul marino","Remera deportiva gris","Medias blancas","Zapatillas deportivas"] },
      { tipo:"Actos",           emoji:"⭐", items:["Pantalón/Falda azul marino","Camisa/Blusa blanca","Zapatos negros"] },
    ],
    libros:[
      { item:"Matemáticas en Acción 3 — Ed. Santillana", oblig:true },
      { item:"Lengua y Literatura 3 — Ed. SM",           oblig:true },
      { item:"Ciencias Naturales 3 — Ed. Kapelusz",      oblig:true },
      { item:"Ciencias Sociales 3 — Ed. Aique",          oblig:true },
      { item:"English World 3 — Ed. Macmillan",          oblig:true },
    ],
    contactos:[
      { nombre:"Dirección",         tel:"011-4555-1234", emoji:"🏫" },
      { nombre:"Secretaría",        tel:"011-4555-1235", emoji:"📋" },
      { nombre:"Preceptoría 3°A",   tel:"011-4555-1240", emoji:"👩‍🏫" },
      { nombre:"Emergencias",       tel:"107",           emoji:"🚑" },
    ],
  },
  2: {
    alerta:{ msg:"⚠️ Mañana NO hay clases por paro docente.", hora:"Hace 2hs" },
    recordatorios:[{ id:1, texto:"Traer carpeta de música", emoji:"🎵", urgente:false }],
    menu:[
      { dia:"Lunes",    plato:"Pollo con arroz",      postre:"Gelatina"  },
      { dia:"Martes",   plato:"Milanesa con puré",    postre:"Fruta"     },
      { dia:"Miércoles",plato:"Guiso de lentejas",    postre:"Yogur"     },
      { dia:"Jueves",   plato:"Tarta de verduras",    postre:"Manzana"   },
      { dia:"Viernes",  plato:"Fideos con salsa",     postre:"Naranja"   },
    ],
    finanzas:{
      cuotas:[
        { id:1, tipo:"Cuota Marzo",   venc:"2026-03-15", monto:45000, pagado:true  },
        { id:2, tipo:"Cuota Abril",   venc:"2026-04-15", monto:45000, pagado:false },
        { id:3, tipo:"Matrícula 2026",venc:"2026-02-28", monto:85000, pagado:true  },
      ],
      beca:{ activa:false, pct:0, venc:"" },
    },
    cumples:[
      { id:1, nombre:"Emilia Paredes",   fecha:"2026-03-20", responsable:"Familia Castro",    comprado:false, asistencia:{} },
      { id:2, nombre:"Lucas Torres",     fecha:"2026-04-05", responsable:"Familia Méndez",    comprado:false, asistencia:{} },
    ],
    utiles:[
      { item:"Carpeta N°3 azul",         oblig:true  },
      { item:"Cuaderno doble raya ×4",   oblig:true  },
      { item:"Lápices HB ×6",            oblig:true  },
      { item:"Goma de borrar ×2",        oblig:false },
    ],
    uniformes:[
      { tipo:"Diario",          emoji:"👕", items:["Jogging azul marino","Remera blanca con logo","Zapatillas blancas"] },
      { tipo:"Ed. Física",      emoji:"🏃", items:["Short azul marino","Remera deportiva gris","Zapatillas deportivas"] },
      { tipo:"Actos",           emoji:"⭐", items:["Pantalón/Falda azul marino","Camisa/Blusa blanca","Zapatos negros"] },
    ],
    libros:[
      { item:"Matemáticas 6 — Ed. Santillana", oblig:true },
      { item:"Lengua 6 — Ed. SM",              oblig:true },
      { item:"Ciencias Naturales 6 — Ed. AZ",  oblig:true },
      { item:"English 6 — Ed. Oxford",         oblig:true },
    ],
    contactos:[
      { nombre:"Dirección",         tel:"011-4555-1234", emoji:"🏫" },
      { nombre:"Secretaría",        tel:"011-4555-1235", emoji:"📋" },
      { nombre:"Preceptoría 6°B",   tel:"011-4555-1242", emoji:"👩‍🏫" },
      { nombre:"Emergencias",       tel:"107",           emoji:"🚑" },
    ],
  },
};

/* ─── HELPERS ────────────────────────────────────────────────── */
const fmtM  = m => `$${Math.abs(m).toLocaleString("es-AR")}`;
const fmtF  = s => new Date(s+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"});
const dHasta= s => { const h=new Date();h.setHours(0,0,0,0);const f=new Date(s+"T00:00:00");f.setHours(0,0,0,0);return Math.ceil((f-h)/86400000); };
const uid   = () => Math.random().toString(36).slice(2,8);
const Card  = ({children,style={}}) => <div style={{background:T.card,borderRadius:16,boxShadow:"0 1px 8px rgba(0,0,0,0.06)",border:`1px solid ${T.border}`,...style}}>{children}</div>;
const Badge = ({n,color}) => n>0 ? <div style={{position:"absolute",top:-4,right:-4,background:color||T.accent,color:"white",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid white"}}>{n}</div> : null;
const Pill  = ({label,color,bg}) => <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:20,background:bg||"#EFF6FF",color:color||T.accent,letterSpacing:0.3}}>{label}</span>;
const DIAS_ES = ["Do","Lu","Ma","Mi","Ju","Vi","Sá"];
const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/* ─── LOGIN ──────────────────────────────────────────────────── */
function Login({ onLogin }) {
  const [email,setEmail] = useState("ana@mail.com");
  const [pass,setPass]   = useState("1234");
  const [err,setErr]     = useState("");
  const [ld,setLd]       = useState(false);

  const go = async () => {
    setErr(""); setLd(true);
    await new Promise(r=>setTimeout(r,600));
    const u = USUARIOS.find(u=>u.email===email && u.pass===pass);
    setLd(false);
    if(u) onLogin(u); else setErr("Correo o contraseña incorrectos");
  };

  const demos = [
    { label:"Apoderado",  hint:"ana@mail.com · 1234",    e:"ana@mail.com",   p:"1234"  },
    { label:"Room Parent",hint:"laura@mail.com · admin", e:"laura@mail.com", p:"admin" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:36,fontWeight:900,color:"white",letterSpacing:-1.5,fontFamily:"Georgia, serif"}}>tribbu<span style={{color:T.accent}}>.</span></div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Comunidad escolar</div>
      </div>
      <div style={{width:"100%",maxWidth:340,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"26px 22px",border:"1px solid rgba(255,255,255,0.10)",backdropFilter:"blur(10px)"}}>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Correo</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} style={{width:"100%",padding:"11px 13px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"}} placeholder="correo@mail.com"/>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Contraseña</div>
          <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} type="password" style={{width:"100%",padding:"11px 13px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"}}/>
        </div>
        {err && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
        <button onClick={go} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:ld?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:18,transition:"all 0.2s"}}>
          {ld?"Ingresando...":"Ingresar"}
        </button>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:14}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",textAlign:"center",marginBottom:10,textTransform:"uppercase",letterSpacing:0.8}}>Accesos demo</div>
          <div style={{display:"flex",gap:8}}>
            {demos.map(d=>(
              <button key={d.label} onClick={()=>{setEmail(d.e);setPass(d.p);}} style={{flex:1,padding:"9px 6px",borderRadius:11,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",cursor:"pointer",textAlign:"center",transition:"all 0.15s"}}>
                <div style={{fontSize:11,fontWeight:800,color:"rgba(255,255,255,0.85)"}}>{d.label}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.35)",marginTop:3}}>{d.hint}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MURO (HOME) ────────────────────────────────────────────── */
function Muro({ d, cursoNombre, isAdmin, onEnviarAlerta, onDismissAlerta }) {
  const hoy = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"});
  const [modal,setModal] = useState(false);
  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontSize:22,fontWeight:900,color:T.text,letterSpacing:-0.5}}>Hola 👋</div>
        <div style={{fontSize:13,color:T.muted,textTransform:"capitalize"}}>{hoy}</div>
      </div>

      {/* Alerta activa */}
      {d.alerta && (
        <div style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"14px 16px",marginBottom:14,position:"relative"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
            <span style={{fontSize:22,flexShrink:0}}>🚨</span>
            <div style={{flex:1}}>
              <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:3}}>{cursoNombre} · {d.alerta.hora}</div>
              <div style={{fontSize:13,fontWeight:700,color:"white",lineHeight:1.5}}>{d.alerta.msg}</div>
            </div>
            {isAdmin && <button onClick={onDismissAlerta} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",color:"white",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✕</button>}
          </div>
        </div>
      )}

      {/* Botón alerta (solo admin) */}
      {isAdmin && (
        <>
          <button onClick={()=>setModal(true)} style={{width:"100%",padding:"13px 16px",borderRadius:14,border:"none",cursor:"pointer",background:d.alerta?"#FFF1F2":"linear-gradient(135deg,#EF4444,#B91C1C)",color:d.alerta?T.red:"white",fontSize:13,fontWeight:800,marginBottom:14,display:"flex",alignItems:"center",gap:10,boxShadow:d.alerta?"none":"0 4px 16px rgba(239,68,68,0.3)",border:d.alerta?`2px solid ${T.red}`:"none"}}>
            <span style={{fontSize:20}}>🚨</span>
            <div style={{textAlign:"left"}}>
              <div>{d.alerta?"Alerta activa — tocar para actualizar":"Enviar alerta a toda la comunidad"}</div>
              <div style={{fontSize:11,opacity:0.75,fontWeight:500}}>Notifica a todas las familias del curso</div>
            </div>
          </button>
          {modal && <AlertaModal onClose={()=>setModal(false)} onEnviar={msg=>{onEnviarAlerta(msg);setModal(false);}}/>}
        </>
      )}

      {/* Menú hoy */}
      <Card style={{padding:"14px 16px",marginBottom:12,display:"flex",gap:12,alignItems:"center"}}>
        <div style={{width:44,height:44,borderRadius:12,background:"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>🍽️</div>
        <div style={{flex:1}}>
          <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:2}}>Menú de hoy — Lunes</div>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>{d.menu[0].plato}</div>
          <div style={{fontSize:11,color:T.muted}}>Postre: {d.menu[0].postre}</div>
        </div>
      </Card>

      {/* Recordatorios */}
      {d.recordatorios.length>0 && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Recordatorios</div>
          {d.recordatorios.map(r=>(
            <div key={r.id} style={{background:r.urgente?"#FFF1F2":T.card,borderRadius:12,padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 6px rgba(0,0,0,0.05)",borderLeft:r.urgente?`3px solid ${T.red}`:"3px solid transparent",border:`1px solid ${r.urgente?"#FECACA":T.border}`}}>
              <span style={{fontSize:20}}>{r.emoji}</span>
              <div style={{fontSize:13,fontWeight:r.urgente?700:500,color:T.text}}>{r.texto}</div>
              {r.urgente && <Pill label="Urgente" color={T.red} bg="#FEE2E2"/>}
            </div>
          ))}
        </div>
      )}

      {/* Próximos cumples */}
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Próximos cumpleaños</div>
      {d.cumples.slice(0,2).map(c=>{
        const dias=dHasta(c.fecha);
        return(
          <Card key={c.id} style={{padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:12,background:"#FFF7ED",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🎂</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{c.nombre}</div>
              <div style={{fontSize:11,color:T.muted}}>📅 {fmtF(c.fecha)}</div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:dias<=7?T.red:T.muted,background:dias<=7?"#FEE2E2":"#F1F5F9",borderRadius:8,padding:"3px 8px"}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>
          </Card>
        );
      })}

      {/* Finanzas vencimiento */}
      {d.finanzas.cuotas.filter(c=>!c.pagado).length>0 && (
        <div style={{marginTop:14}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Pago pendiente</div>
          {d.finanzas.cuotas.filter(c=>!c.pagado).slice(0,1).map(c=>(
            <div key={c.id} style={{background:"#FFFBEB",borderRadius:14,padding:"13px 15px",display:"flex",alignItems:"center",gap:12,border:`1.5px solid #FDE68A`}}>
              <span style={{fontSize:22}}>💳</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700}}>{c.tipo}</div>
                <div style={{fontSize:11,color:T.muted}}>Vence {fmtF(c.venc)}</div>
              </div>
              <div style={{fontSize:16,fontWeight:800,color:T.yellow}}>{fmtM(c.monto)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── MODAL ALERTA ───────────────────────────────────────────── */
function AlertaModal({ onClose, onEnviar }) {
  const [msg,setMsg]   = useState("");
  const [sent,setSent] = useState(false);
  const SUGS = ["🚫 Mañana NO hay clases","⚠️ Reunión urgente hoy 18hs","🌧️ Salida cancelada por lluvia","📢 El colegio cierra a las 12hs hoy","🩺 Médico en el colegio mañana"];
  const enviar = async() => {
    if(!msg.trim()) return;
    await new Promise(r=>setTimeout(r,600));
    onEnviar(msg.trim()); setSent(true);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:"22px 22px 0 0",padding:"22px 18px 36px",width:"100%",maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"#E2E8F0",borderRadius:2,margin:"0 auto 18px"}}/>
        {sent ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:50}}>📣</div>
            <div style={{fontSize:18,fontWeight:900,marginTop:12}}>¡Alerta enviada!</div>
            <div style={{fontSize:13,color:T.muted,marginTop:6}}>Todas las familias fueron notificadas</div>
          </div>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:44,height:44,borderRadius:14,background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🚨</div>
              <div>
                <div style={{fontSize:17,fontWeight:900}}>Alerta a la comunidad</div>
                <div style={{fontSize:12,color:T.muted}}>Solo para avisos urgentes</div>
              </div>
            </div>
            <div style={{background:"#FFF1F2",borderRadius:11,padding:"10px 13px",marginBottom:14,fontSize:12,color:T.red,fontWeight:600,lineHeight:1.5}}>
              ⚠️ Usá este botón solo para emergencias: clases suspendidas, cambios urgentes de horario, incidentes en el colegio.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
              {SUGS.map((s,i)=>(
                <button key={i} onClick={()=>setMsg(s)} style={{textAlign:"left",padding:"9px 13px",borderRadius:11,border:`1.5px solid ${msg===s?T.accent:T.border}`,background:msg===s?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:msg===s?700:500,color:msg===s?T.accent:T.text,transition:"all 0.15s"}}>{s}</button>
              ))}
            </div>
            <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="O escribí un mensaje propio..." style={{width:"100%",border:`1.5px solid ${msg&&!SUGS.includes(msg)?T.accent:T.border}`,borderRadius:11,padding:"10px 12px",fontSize:13,resize:"none",height:70,boxSizing:"border-box",outline:"none",lineHeight:1.5,fontFamily:"inherit"}}/>
            <button onClick={enviar} disabled={!msg.trim()} style={{width:"100%",marginTop:10,padding:13,borderRadius:11,border:"none",cursor:msg.trim()?"pointer":"default",background:msg.trim()?"linear-gradient(135deg,#EF4444,#B91C1C)":"#E2E8F0",color:msg.trim()?"white":T.muted,fontSize:14,fontWeight:800,transition:"all 0.2s"}}>
              🚨 Enviar alerta urgente
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── COMEDOR ────────────────────────────────────────────────── */
function Comedor({ d }) {
  const [vista,setVista] = useState("semanal");
  const [mes,setMes]     = useState(new Date(2026,2,1));
  const diasSemana=["Lu","Ma","Mi","Ju","Vi"];

  const year=mes.getFullYear(), month=mes.getMonth();
  const firstDay = (new Date(year,month,1).getDay()+6)%7; // lunes=0
  const daysInMonth = new Date(year,month+1,0).getDate();
  const cells = Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);

  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Comedor 🍽️</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Menú del curso</div>

      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {["diario","semanal","mensual"].map(v=>(
          <button key={v} onClick={()=>setVista(v)} style={{flex:1,padding:"8px 0",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,textTransform:"capitalize",background:vista===v?T.text:"white",color:vista===v?"white":T.muted,boxShadow:vista===v?"0 3px 10px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>
            {v.charAt(0).toUpperCase()+v.slice(1)}
          </button>
        ))}
      </div>

      {vista==="diario" && (
        <Card style={{padding:16}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>Hoy — Lunes</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"#FFF7ED",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#EA580C",textTransform:"uppercase",letterSpacing:0.6,marginBottom:4}}>🍽️ Almuerzo</div>
              <div style={{fontSize:16,fontWeight:800}}>{d.menu[0].plato}</div>
            </div>
            <div style={{background:"#F0FDF4",borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:10,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:0.6,marginBottom:4}}>🍎 Postre</div>
              <div style={{fontSize:16,fontWeight:800}}>{d.menu[0].postre}</div>
            </div>
          </div>
        </Card>
      )}

      {vista==="semanal" && (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {d.menu.map((m,i)=>(
            <Card key={i} style={{padding:"13px 15px",borderLeft:`3px solid ${T.accent}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:10,background:"#EFF6FF",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:800,color:T.accent,textTransform:"uppercase",letterSpacing:0.3,flexShrink:0,textAlign:"center",lineHeight:1.2}}>{diasSemana[i]}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700}}>{m.plato}</div>
                  <div style={{fontSize:11,color:T.muted}}>🍎 {m.postre}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {vista==="mensual" && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <button onClick={()=>setMes(new Date(year,month-1,1))} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:T.muted}}>‹</button>
            <div style={{fontSize:15,fontWeight:700}}>{MESES_ES[month]} {year}</div>
            <button onClick={()=>setMes(new Date(year,month+1,1))} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:T.muted}}>›</button>
          </div>
          <Card style={{padding:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:10}}>
              {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:T.muted,padding:"4px 0"}}>{d}</div>)}
              {cells.map((day,i)=>{
                const isWeekday = day && (i%7)<5;
                const menuIdx = isWeekday ? (i%7) : -1;
                return (
                  <div key={i} style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:day===10?"#3B82F6":isWeekday?"#EFF6FF":"transparent",color:day===10?"white":day?T.text:"transparent",fontSize:12,fontWeight:day===10?800:500,position:"relative"}}>
                    {day}
                    {isWeekday&&day&&<div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:day===10?"white":"#93C5FD"}}/>}
                  </div>
                );
              })}
            </div>
            <div style={{borderTop:`1px solid ${T.border}`,paddingTop:12,marginTop:4}}>
              <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:8}}>Menú de referencia semanal</div>
              {d.menu.map((m,i)=>(
                <div key={i} style={{display:"flex",gap:8,padding:"7px 0",borderBottom:i<4?`1px solid ${T.border}`:"none"}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.accent,width:26,flexShrink:0}}>{diasSemana[i]}</span>
                  <span style={{fontSize:12,color:T.text}}>{m.plato}</span>
                  <span style={{fontSize:11,color:T.muted,marginLeft:"auto"}}>{m.postre}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ─── CLASES ─────────────────────────────────────────────────── */
function Clases({ cursoId }) {
  const horario = HORARIOS[cursoId] || HORARIOS[1];
  const [mes,setMes] = useState(new Date(2026,2,1));
  const year=mes.getFullYear(), month=mes.getMonth();
  const firstDay = (new Date(year,month,1).getDay()+6)%7;
  const daysInMonth = new Date(year,month+1,0).getDate();
  const cells = Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);
  const eventDays=[3,5,10,17,22,25];

  const colorDia = (i) => {
    const d=i%7;
    const cols=["#EFF6FF","#F0FDF4","#FFF7ED","#F5F3FF","#FEFCE8"];
    return cols[d]||"#F8FAFC";
  };

  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Clases 📅</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Calendario y horario escolar</div>

      {/* Calendario */}
      <Card style={{padding:16,marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <button onClick={()=>setMes(new Date(year,month-1,1))} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:T.muted}}>‹</button>
          <div style={{fontSize:15,fontWeight:700}}>{MESES_ES[month]} {year}</div>
          <button onClick={()=>setMes(new Date(year,month+1,1))} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:9,width:34,height:34,cursor:"pointer",fontSize:16,color:T.muted}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
          {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:T.muted,padding:"4px 0"}}>{d}</div>)}
          {cells.map((day,i)=>(
            <div key={i} style={{aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8,background:day===10?"#3B82F6":day?colorDia(i):"transparent",color:day===10?"white":day?T.text:"transparent",fontSize:12,fontWeight:day===10?800:500,position:"relative",cursor:day?"pointer":"default"}}>
              {day}
              {day&&eventDays.includes(day)&&<div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:day===10?"white":T.accent}}/>}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:12,marginTop:12,fontSize:11,color:T.muted,paddingTop:10,borderTop:`1px solid ${T.border}`}}>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:"50%",background:T.accent,display:"inline-block"}}/>Evento/salida</span>
          <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:16,height:16,borderRadius:4,background:"#3B82F6",display:"inline-block"}}/>Hoy</span>
        </div>
      </Card>

      {/* Horario semanal */}
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Horario semanal</div>
      {horario.map((row,i)=>{
        const bgs=["#EFF6FF","#F0FDF4","#FFF7ED","#F5F3FF","#FEFCE8"];
        const cols=[T.accent,"#10B981","#F59E0B","#8B5CF6","#EAB308"];
        return (
          <Card key={i} style={{padding:"12px 14px",marginBottom:10}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <div style={{width:42,height:42,borderRadius:12,background:bgs[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:cols[i],textTransform:"uppercase",flexShrink:0,letterSpacing:0.3,textAlign:"center",lineHeight:1.2}}>{row.dia.slice(0,3)}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {row.clases.map((c,j)=>(
                    <span key={j} style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:20,background:T.bg,color:T.text,border:`1px solid ${T.border}`}}>{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ─── INFO ÚTIL ──────────────────────────────────────────────── */
function InfoUtil({ d }) {
  const [sec,setSec] = useState("utiles");
  const secs=[{id:"utiles",l:"✏️ Útiles"},{id:"uniformes",l:"👕 Uniformes"},{id:"libros",l:"📚 Libros"}];
  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Info Útil 📋</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Listas y uniformes del curso</div>
      <div style={{display:"flex",gap:7,marginBottom:18,overflowX:"auto",paddingBottom:2}}>
        {secs.map(s=>(
          <button key={s.id} onClick={()=>setSec(s.id)} style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap",flexShrink:0,background:sec===s.id?T.text:"white",color:sec===s.id?"white":T.muted,boxShadow:sec===s.id?"0 3px 12px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>
            {s.l}
          </button>
        ))}
      </div>

      {sec==="utiles" && (
        <div>
          {["Obligatorios","Opcionales"].map(tipo=>{
            const items=d.utiles.filter(u=>tipo==="Obligatorios"?u.oblig:!u.oblig);
            if(!items.length) return null;
            return (
              <div key={tipo}>
                <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8,marginTop:tipo==="Opcionales"?16:0}}>{tipo}</div>
                {items.map((u,i)=>(
                  <Card key={i} style={{padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:16}}>{tipo==="Obligatorios"?"✏️":"📐"}</span>
                    <span style={{fontSize:13,fontWeight:600,flex:1}}>{u.item}</span>
                    {tipo==="Obligatorios"&&<Pill label="Obligatorio" color={T.accent} bg="#EFF6FF"/>}
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {sec==="uniformes" && d.uniformes.map((u,i)=>{
        const bgs=["#EEF2FF","#F0FDF4","#FFF7ED"];
        return (
          <Card key={i} style={{padding:"14px 16px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{width:38,height:38,borderRadius:10,background:bgs[i],display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{u.emoji}</div>
              <div style={{fontSize:14,fontWeight:800}}>Uniforme {u.tipo}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {u.items.map((item,j)=>(
                <div key={j} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",background:T.bg,borderRadius:9}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:T.accent,flexShrink:0}}/>
                  <span style={{fontSize:13}}>{item}</span>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {sec==="libros" && d.libros.map((l,i)=>(
        <Card key={i} style={{padding:"11px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>📖</span>
          <span style={{fontSize:13,fontWeight:600,flex:1}}>{l.item}</span>
        </Card>
      ))}
    </div>
  );
}

/* ─── FINANZAS ───────────────────────────────────────────────── */
function Finanzas({ d }) {
  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Finanzas 💳</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Cuotas, matrícula y beca</div>

      {/* Beca */}
      {d.finanzas.beca.activa && (
        <div style={{background:"linear-gradient(135deg,#10B981,#059669)",borderRadius:16,padding:"16px 18px",marginBottom:16,color:"white"}}>
          <div style={{fontSize:11,opacity:0.8,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8,marginBottom:4}}>Beca activa</div>
          <div style={{fontSize:32,fontWeight:900,marginBottom:4}}>{d.finanzas.beca.pct}% descuento</div>
          <div style={{fontSize:12,opacity:0.8}}>Vigente hasta {fmtF(d.finanzas.beca.venc)}</div>
        </div>
      )}

      {/* Resumen */}
      <div style={{display:"flex",gap:10,marginBottom:16}}>
        <Card style={{flex:1,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Pendientes</div>
          <div style={{fontSize:22,fontWeight:900,color:T.red}}>{d.finanzas.cuotas.filter(c=>!c.pagado).length}</div>
        </Card>
        <Card style={{flex:1,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Pagadas</div>
          <div style={{fontSize:22,fontWeight:900,color:T.green}}>{d.finanzas.cuotas.filter(c=>c.pagado).length}</div>
        </Card>
        <Card style={{flex:1,padding:"14px 16px",textAlign:"center"}}>
          <div style={{fontSize:10,color:T.muted,fontWeight:700,textTransform:"uppercase",marginBottom:4}}>Total pendiente</div>
          <div style={{fontSize:16,fontWeight:900,color:T.yellow}}>{fmtM(d.finanzas.cuotas.filter(c=>!c.pagado).reduce((s,c)=>s+c.monto,0))}</div>
        </Card>
      </div>

      {/* Lista cuotas */}
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Detalle de pagos</div>
      {d.finanzas.cuotas.map((c,i)=>{
        const dias=dHasta(c.venc);
        return (
          <Card key={i} style={{padding:"14px 16px",marginBottom:10,borderLeft:`3px solid ${c.pagado?T.green:dias<=5?T.red:T.yellow}`}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:42,height:42,borderRadius:12,background:c.pagado?"#F0FDF4":dias<=5?"#FEF2F2":"#FFFBEB",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                {c.pagado?"✅":dias<=5?"⚠️":"📅"}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700}}>{c.tipo}</div>
                <div style={{fontSize:11,color:T.muted}}>Vence {fmtF(c.venc)}</div>
              </div>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:c.pagado?T.green:T.text,textAlign:"right"}}>{fmtM(c.monto)}</div>
                {c.pagado
                  ? <Pill label="Pagado" color={T.green} bg="#F0FDF4"/>
                  : <Pill label={dias<=0?"Vencido":dias<=5?`${dias}d`:fmtF(c.venc)} color={dias<=5?T.red:T.yellow} bg={dias<=5?"#FEF2F2":"#FFFBEB"}/>
                }
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ─── CUMPLEAÑOS ─────────────────────────────────────────────── */
function Cumpleanios({ d, userId, isAdmin, upd }) {
  const [tab,setTab]     = useState("proximos");
  const [selCumple,setSel]= useState(null);

  const toggleAsist = (cumpleId, uid) => {
    upd(prev=>({...prev, cumples:prev.cumples.map(c=>{
      if(c.id!==cumpleId) return c;
      const a={...c.asistencia};
      if(a[uid]==="si") delete a[uid]; else a[uid]="si";
      return {...c,asistencia:a};
    })}));
  };

  const toggleComprado = (cumpleId) => {
    upd(prev=>({...prev, cumples:prev.cumples.map(c=>c.id===cumpleId?{...c,comprado:!c.comprado}:c)}));
  };

  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Cumpleaños 🎂</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Calendario y organización del curso</div>

      <div style={{display:"flex",gap:7,marginBottom:18}}>
        {[{id:"proximos",l:"🎂 Próximos"},{id:"regalos",l:"🎁 Regalos"},{id:"asistencia",l:"✅ Asistencia"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"7px 4px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:tab===t.id?T.text:"white",color:tab===t.id?"white":T.muted,boxShadow:tab===t.id?"0 3px 10px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>
            {t.l}
          </button>
        ))}
      </div>

      {tab==="proximos" && d.cumples.map(c=>{
        const dias=dHasta(c.fecha);
        return (
          <Card key={c.id} style={{padding:"13px 15px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg,#FDE68A,#F59E0B)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🎂</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800}}>{c.nombre}</div>
                <div style={{fontSize:11,color:T.muted}}>📅 {fmtF(c.fecha)}</div>
                <div style={{fontSize:11,color:T.muted,marginTop:2}}>🎁 Responsable: {c.responsable}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:13,fontWeight:800,color:dias<=7?T.red:T.muted,background:dias<=7?"#FEE2E2":"#F1F5F9",borderRadius:8,padding:"3px 8px",marginBottom:4}}>{dias===0?"Hoy":dias===1?"Mañana":`${dias}d`}</div>
                {c.comprado ? <Pill label="✓ Listo" color={T.green} bg="#F0FDF4"/> : <Pill label="Pendiente" color={T.yellow} bg="#FFFBEB"/>}
              </div>
            </div>
          </Card>
        );
      })}

      {tab==="regalos" && (
        <div>
          <div style={{background:"#FFFBEB",borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#92400E",fontWeight:600,border:`1px solid #FDE68A`}}>
            🎁 La gestión de regalos es organizada por el Room Parent. Acá podés ver el estado de cada regalo.
          </div>
          {d.cumples.map(c=>(
            <Card key={c.id} style={{padding:"13px 15px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:26}}>🎂</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700}}>{c.nombre}</div>
                  <div style={{fontSize:12,color:T.muted}}>Responsable: {c.responsable}</div>
                  <div style={{fontSize:11,color:T.muted}}>📅 {fmtF(c.fecha)}</div>
                </div>
                {isAdmin
                  ? <button onClick={()=>toggleComprado(c.id)} style={{padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:c.comprado?"#F0FDF4":"#FFFBEB",color:c.comprado?T.green:T.yellow}}>
                      {c.comprado?"✅ Comprado":"⏳ Marcar listo"}
                    </button>
                  : <span>{c.comprado?<Pill label="✅ Listo" color={T.green} bg="#F0FDF4"/>:<Pill label="Pendiente" color={T.yellow} bg="#FFFBEB"/>}</span>
                }
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab==="asistencia" && (
        <div>
          {d.cumples.map(c=>{
            const totalSi=Object.values(c.asistencia).filter(v=>v==="si").length;
            const miRsvp=c.asistencia[userId];
            return (
              <Card key={c.id} style={{padding:"14px 16px",marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <span style={{fontSize:22}}>🎂</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:800}}>{c.nombre}</div>
                    <div style={{fontSize:11,color:T.muted}}>📅 {fmtF(c.fecha)} · {totalSi} confirmaron asistencia</div>
                  </div>
                </div>
                {!isAdmin && (
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>toggleAsist(c.id,userId)} style={{flex:1,padding:9,borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:miRsvp==="si"?T.green:"#F0FDF4",color:miRsvp==="si"?"white":T.green,transition:"all 0.15s"}}>
                      {miRsvp==="si"?"✅ Asistiremos":"✓ Asistimos"}
                    </button>
                    <button onClick={()=>{const a={...c.asistencia};if(a[userId]) delete a[userId];else a[userId]="no"; upd(prev=>({...prev,cumples:prev.cumples.map(x=>x.id===c.id?{...x,asistencia:a}:x)}));}} style={{flex:1,padding:9,borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:c.asistencia[userId]==="no"?T.red:"#FEE2E2",color:c.asistencia[userId]==="no"?"white":T.red}}>
                      {c.asistencia[userId]==="no"?"❌ No vamos":"✗ No vamos"}
                    </button>
                  </div>
                )}
                {isAdmin && totalSi>0 && (
                  <div style={{background:T.bg,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:600,color:T.muted}}>
                    ✅ {totalSi} {totalSi===1?"familia confirmó":"familias confirmaron"} asistencia
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── CONTACTO ───────────────────────────────────────────────── */
function Contacto({ d }) {
  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{fontSize:22,fontWeight:900,color:T.text,marginBottom:4}}>Contacto 📞</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>Datos del colegio</div>
      <Card style={{padding:"6px 16px",marginBottom:16}}>
        {d.contactos.map((c,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:i<d.contactos.length-1?`1px solid ${T.border}`:"none"}}>
            <div style={{width:42,height:42,borderRadius:12,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{c.emoji}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.5}}>{c.nombre}</div>
              <div style={{fontSize:14,fontWeight:700}}>{c.tel}</div>
            </div>
            <a href={`tel:${c.tel}`} style={{background:T.green,color:"white",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,textDecoration:"none",flexShrink:0}}>📞</a>
          </div>
        ))}
      </Card>

      {/* Info general colegio */}
      <Card style={{padding:"14px 16px"}}>
        <div style={{fontSize:12,fontWeight:800,color:T.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12}}>Información general</div>
        {[
          {emoji:"📍",label:"Dirección",value:"Av. Santa Fe 1234, CABA"},
          {emoji:"✉️",label:"Email",value:"info@colegio.edu.ar"},
          {emoji:"🌐",label:"Web",value:"www.colegio.edu.ar"},
          {emoji:"🕐",label:"Horario atención",value:"Lun–Vie 7:30 — 17:00hs"},
        ].map((item,i)=>(
          <div key={i} style={{display:"flex",gap:12,alignItems:"center",padding:"10px 0",borderBottom:i<3?`1px solid ${T.border}`:"none"}}>
            <span style={{fontSize:18}}>{item.emoji}</span>
            <div>
              <div style={{fontSize:10,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:0.4}}>{item.label}</div>
              <div style={{fontSize:13,fontWeight:600}}>{item.value}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ─── ADMIN PANEL ────────────────────────────────────────────── */
function AdminPanel({ d, cursoId, upd }) {
  const [sec,setSec] = useState("stats");
  const curso = CURSOS.find(c=>c.id===cursoId);
  const pendCuotas = 47 - 38; // simulado
  const pendRegals = d.cumples.filter(c=>!c.comprado).length;

  return (
    <div style={{padding:"0 15px 20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
        <div style={{fontSize:22,fontWeight:900,color:T.text}}>Panel Admin</div>
        <span style={{fontSize:10,fontWeight:800,background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",borderRadius:6,padding:"3px 8px",textTransform:"uppercase",letterSpacing:0.5}}>Room Parent</span>
      </div>
      <div style={{fontSize:13,color:T.muted,marginBottom:18}}>{curso?.nombre}</div>

      {/* Stats */}
      <div style={{display:"flex",gap:10,marginBottom:20,overflowX:"auto",paddingBottom:4}}>
        {[
          {n:"47",l:"Familias",c:T.accent,bg:"#EFF6FF"},
          {n:"38",l:"Cuotas OK",c:T.green,bg:"#F0FDF4"},
          {n:`${pendCuotas}`,l:"Sin pagar",c:T.red,bg:"#FEF2F2"},
          {n:`${pendRegals}`,l:"Regalos pend.",c:T.yellow,bg:"#FFFBEB"},
        ].map((s,i)=>(
          <div key={i} style={{minWidth:80,background:s.bg,borderRadius:14,padding:"14px 12px",textAlign:"center",flexShrink:0}}>
            <div style={{fontSize:28,fontWeight:900,color:s.c,lineHeight:1}}>{s.n}</div>
            <div style={{fontSize:10,color:T.muted,fontWeight:700,marginTop:4,whiteSpace:"nowrap"}}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Acciones rápidas */}
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Gestión del curso</div>
      {[
        {emoji:"👨‍👩‍👧",bg:"#EFF6FF",c:T.accent,label:"Directorio de familias",sub:"47 familias registradas"},
        {emoji:"💳",bg:"#FFFBEB",c:T.yellow,label:"Seguimiento de cuotas",sub:`${pendCuotas} familias sin pagar`},
        {emoji:"🎂",bg:"#FEF2F2",c:T.red,label:"Gestión de cumpleaños",sub:`${pendRegals} regalos pendientes`},
        {emoji:"📢",bg:"#F0FDF4",c:T.green,label:"Comunicados enviados",sub:"8 este mes"},
        {emoji:"✅",bg:"#F5F3FF",c:T.purple,label:"Asistencia a eventos",sub:"Próximo: Cumple Luna 15/03"},
      ].map((a,i)=>(
        <Card key={i} style={{padding:"13px 15px",marginBottom:9,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <div style={{width:42,height:42,borderRadius:12,background:a.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{a.emoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700}}>{a.label}</div>
            <div style={{fontSize:11,color:T.muted}}>{a.sub}</div>
          </div>
          <span style={{color:T.muted,fontSize:18}}>›</span>
        </Card>
      ))}

      {/* Últimas novedades */}
      <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:10,marginTop:20}}>Novedades recientes</div>
      {[
        {emoji:"💳",texto:"Familia García pagó cuota Marzo",hora:"Hace 20min",c:T.green},
        {emoji:"🎂",texto:"Familia Rodríguez confirmó regalo Pedro",hora:"Hace 1hs",c:T.yellow},
        {emoji:"✅",texto:"12 familias confirmaron asistencia Cumple Luna",hora:"Hace 2hs",c:T.accent},
      ].map((n,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:i<2?`1px solid ${T.border}`:"none"}}>
          <div style={{width:36,height:36,borderRadius:10,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{n.emoji}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{n.texto}</div>
            <div style={{fontSize:11,color:T.muted}}>{n.hora}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── APP PRINCIPAL ──────────────────────────────────────────── */
export default function App() {
  const [user,setUser]   = useState(null);
  const [hijoIdx,setHijoIdx] = useState(0);
  const [tab,setTab]     = useState("muro");
  const [data,setData]   = useState(DEMO);

  // Para admin: cursor de curso
  const [cursoAdmIdx,setCursoAdmIdx] = useState(0);

  if(!user) return <Login onLogin={u=>{setUser(u);setTab("muro");}}/>;

  const isAdmin = user.rol==="admin";

  // ── contexto hijo (padre) o curso (admin)
  let cursoId, cursoNombre, cursoColor;
  if(isAdmin) {
    const admCursos = CURSOS.filter(c=>user.cursos.includes(c.id));
    const cur = admCursos[cursoAdmIdx] || admCursos[0];
    cursoId    = cur.id;
    cursoNombre= cur.nombre;
    cursoColor = cur.color;
  } else {
    const misHijos = HIJOS.filter(h=>user.hijos.includes(h.id));
    const hijo = misHijos[hijoIdx] || misHijos[0];
    cursoId    = hijo?.cursoId || 1;
    cursoNombre= hijo?.curso || "";
    cursoColor = hijo?.color || T.accent;
  }

  const d   = data[cursoId];
  const upd = (fn) => setData(prev=>({...prev,[cursoId]:typeof fn==="function"?fn(prev[cursoId]):fn}));

  const enviarAlerta  = msg  => upd(d=>({...d,alerta:{msg,hora:"Ahora"}}));
  const dismissAlerta = ()   => upd(d=>({...d,alerta:null}));

  // ── TABS según perfil
  const TABS_PADRE = [
    {id:"muro",    e:"🏠", l:"Inicio",  badge: d.alerta?1:0},
    {id:"clases",  e:"📅", l:"Clases",  badge: 0},
    {id:"comedor", e:"🍽️", l:"Comedor", badge: 0},
    {id:"info",    e:"📋", l:"Info",    badge: 0},
    {id:"finanzas",e:"💳", l:"Finanzas",badge: d.finanzas.cuotas.filter(c=>!c.pagado).length},
    {id:"cumples", e:"🎂", l:"Cumples", badge: 0},
    {id:"contacto",e:"📞", l:"Contacto",badge: 0},
  ];
  const TABS_ADMIN = [
    {id:"muro",    e:"🏠", l:"Inicio",  badge: d.alerta?1:0},
    {id:"clases",  e:"📅", l:"Clases",  badge: 0},
    {id:"comedor", e:"🍽️", l:"Comedor", badge: 0},
    {id:"info",    e:"📋", l:"Info",    badge: 0},
    {id:"finanzas",e:"💳", l:"Finanzas",badge: 0},
    {id:"cumples", e:"🎂", l:"Cumples", badge: 0},
    {id:"contacto",e:"📞", l:"Contacto",badge: 0},
    {id:"admin",   e:"⚙️", l:"Admin",   badge: 0},
  ];
  const TABS = isAdmin ? TABS_ADMIN : TABS_PADRE;

  return (
    <div style={{fontFamily:"'DM Sans', system-ui, -apple-system, sans-serif",background:T.bg,minHeight:"100vh",maxWidth:420,margin:"0 auto",display:"flex",flexDirection:"column"}}>

      {/* ── HEADER */}
      <div style={{background:"white",padding:"12px 15px 0",boxShadow:"0 1px 8px rgba(0,0,0,0.06)",position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div>
            <div style={{fontSize:21,fontWeight:900,color:T.text,letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:T.accent}}>.</span></div>
            <div style={{fontSize:10,color:T.muted,fontWeight:600,marginTop:-1}}>
              {user.nombre}
              {isAdmin && <span style={{fontSize:9,fontWeight:800,background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",borderRadius:5,padding:"1px 6px",marginLeft:5,textTransform:"uppercase",letterSpacing:0.4}}>Admin</span>}
            </div>
          </div>

          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {/* Selector hijo (padre) */}
            {!isAdmin && HIJOS.filter(h=>user.hijos.includes(h.id)).map((h,i)=>(
              <button key={h.id} onClick={()=>{setHijoIdx(i);setTab("muro");}} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:18,border:"none",cursor:"pointer",background:hijoIdx===i?h.color:"#F1F5F9",color:hijoIdx===i?"white":T.muted,fontSize:11,fontWeight:700,boxShadow:hijoIdx===i?`0 3px 10px ${h.color}55`:"none",transition:"all 0.2s"}}>
                <span style={{fontSize:13}}>{h.avatar}</span>
                <span>{h.nombre.split(" ")[0]}</span>
              </button>
            ))}
            {/* Selector curso (admin) */}
            {isAdmin && CURSOS.filter(c=>user.cursos.includes(c.id)).map((c,i)=>(
              <button key={c.id} onClick={()=>{setCursoAdmIdx(i);setTab("muro");}} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:18,border:"none",cursor:"pointer",background:cursoAdmIdx===i?c.color:"#F1F5F9",color:cursoAdmIdx===i?"white":T.muted,fontSize:11,fontWeight:700,boxShadow:cursoAdmIdx===i?`0 3px 10px ${c.color}55`:"none",transition:"all 0.2s"}}>
                <span>{c.avatar}</span>
                <span>{c.nombre.split("—")[0].trim()}</span>
              </button>
            ))}
            <button onClick={()=>setUser(null)} style={{background:"#F1F5F9",border:"none",borderRadius:10,width:32,height:32,cursor:"pointer",fontSize:14,color:T.muted}}>↩</button>
          </div>
        </div>

        {/* ── Tabs */}
        <div style={{display:"flex",overflowX:"auto",paddingBottom:0,gap:2,scrollbarWidth:"none"}}>
          {TABS.map(t=>{
            const act=tab===t.id;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 10px 10px",border:"none",background:"none",cursor:"pointer",flexShrink:0,position:"relative",borderBottom:act?`2.5px solid ${cursoColor}`:"2.5px solid transparent",transition:"border-color 0.15s"}}>
                <div style={{position:"relative"}}>
                  <span style={{fontSize:17}}>{t.e}</span>
                  {t.badge>0 && <div style={{position:"absolute",top:-4,right:-5,background:T.red,color:"white",borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid white"}}>{t.badge}</div>}
                </div>
                <span style={{fontSize:9,fontWeight:act?800:600,color:act?T.text:T.muted,letterSpacing:0.2}}>{t.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT */}
      <div style={{flex:1,paddingTop:14,paddingBottom:20,overflowY:"auto"}}>
        {tab==="muro"    && <Muro        d={d} cursoNombre={cursoNombre} isAdmin={isAdmin} onEnviarAlerta={enviarAlerta} onDismissAlerta={dismissAlerta}/>}
        {tab==="clases"  && <Clases      cursoId={cursoId}/>}
        {tab==="comedor" && <Comedor     d={d}/>}
        {tab==="info"    && <InfoUtil    d={d}/>}
        {tab==="finanzas"&& <Finanzas    d={d}/>}
        {tab==="cumples" && <Cumpleanios d={d} userId={user.id} isAdmin={isAdmin} upd={upd}/>}
        {tab==="contacto"&& <Contacto    d={d}/>}
        {tab==="admin"   && isAdmin && <AdminPanel d={d} cursoId={cursoId} upd={upd}/>}
      </div>
      <style>{`*::-webkit-scrollbar{display:none} @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');`}</style>
    </div>
  );
}