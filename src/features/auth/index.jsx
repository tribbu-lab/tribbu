// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { deleteMyAccount } from "../../lib/authAdmin";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtM, fmtF, fmtDM, dHasta, fmtNombre,
         sanitize, safeUrl, getHijoColor, setHijoColor } from "../../lib/helpers";
import { WEB_APP_URL } from "../../lib/appUrl";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Wordmark } from "../../components/Wordmark";
import { Paginador } from "../../components/Paginador";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useListControls } from "../../hooks/useListControls";

import bcrypt from "bcryptjs"; // TODO: eliminar cuando se borre columna pass de DB

export function Login({ onLogin }) {
  const [email,setEmail]           = useState("");
  const [pass,setPass]             = useState("");
  const [err,setErr]               = useState("");
  const [ld,setLd]                 = useState(false);
  const [vistaReset,setVistaReset] = useState(false);
  const [resetOk,setResetOk]       = useState(false);
  const [resetLd,setResetLd]       = useState(false);

  const go = async (emailArg, passArg) => {
    const loginEmail = emailArg || email;
    const loginPass  = passArg  || pass;
    setErr(""); setLd(true);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail, password: loginPass
    });
    if(authError || !authData?.user) {
      setLd(false);
      setErr("Correo o contraseña incorrectos");
      return;
    }
    const { data, error } = await supabase
      .from("usuarios")
      .select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)")
      .eq("auth_id", authData.user.id)
      .eq("activo", true)
      .single();
    setLd(false);
    if(error || !data) { setErr("Usuario no encontrado o inactivo"); return; }
    onLogin({
      ...data,
      hijos:  [...new Set(data.usuario_hijos.map(r=>r.hijo_id))],
      cursos: data.usuario_cursos.map(r=>r.curso_id),
      cursosConRol: data.usuario_cursos.map(r=>({curso_id:r.curso_id, rol:r.rol||"padre"})),
    });
  };

  const enviarReset = async () => {
    if(!email.trim()) { setErr("Ingresá tu correo primero"); return; }
    setResetLd(true); setErr("");
    // El SPA vive en /app. En prod usamos el origin real (así un deploy de
    // staging manda su propio link); en localhost caemos a la constante porque
    // `http://localhost:5173/app` no existe sin el rewrite de vercel.json — y
    // además Supabase la exige en su allow-list (ver src/lib/appUrl.js).
    const esLocal = /localhost|127\.0\.0\.1/.test(window.location.origin);
    const redirectTo = esLocal ? WEB_APP_URL : window.location.origin + "/app";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setResetLd(false);
    if(error) { setErr("Error al enviar el correo: " + error.message); return; }
    setResetOk(true);
  };

  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"};

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <Wordmark size={40} letterSpacing={-2} />
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Comunidad escolar</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"28px 24px",border:"1px solid rgba(255,255,255,0.10)"}}>

        {resetOk ? (
          <div style={{textAlign:"center",padding:"12px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>📬</div>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:8}}>Revisá tu correo</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Te enviamos un link para restablecer tu contraseña a <strong style={{color:"white"}}>{email}</strong>. Se abre en el navegador y vence en 1 hora.</div>
            <button onClick={()=>{setVistaReset(false);setResetOk(false);}} style={{fontSize:13,color:"rgba(255,255,255,0.5)",background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Volver al inicio</button>
          </div>

        ) : vistaReset ? (
          <>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:4}}>Restablecer contraseña</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:20}}>Te enviamos un link a tu correo para crear una nueva.</div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Correo</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&enviarReset()} style={inputStyle} placeholder="correo@mail.com"/>
            </div>
            {err && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={enviarReset} disabled={resetLd} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:resetLd?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:14}}>
              {resetLd?"Enviando...":"Enviar link"}
            </button>
            <button onClick={()=>{setVistaReset(false);setErr("");}} style={{width:"100%",fontSize:13,color:"rgba(255,255,255,0.4)",background:"none",border:"none",cursor:"pointer"}}>← Volver</button>
          </>

        ) : (
          <>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Correo</div>
              <input value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} placeholder="correo@mail.com"/>
            </div>
            <div style={{marginBottom:8}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Contraseña</div>
              <input value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} type="password" style={inputStyle}/>
            </div>
            <div style={{textAlign:"right",marginBottom:16}}>
              <button onClick={()=>{setVistaReset(true);setErr("");}} style={{fontSize:12,color:"rgba(255,255,255,0.4)",background:"none",border:"none",cursor:"pointer",padding:0}}>¿Olvidaste tu contraseña?</button>
            </div>
            {err && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button id="btn-login" onClick={()=>go()} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:ld?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:14}}>
              {ld?"Ingresando...":"Ingresar"}
            </button>
            <div style={{textAlign:"center"}}>
              <a href="/privacidad.html" target="_blank" rel="noreferrer" style={{fontSize:11,color:"rgba(255,255,255,0.3)",textDecoration:"none"}}>Política de privacidad</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


export function SeleccionPerfil({ usuario, onElegir }) {
  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <Wordmark size={32} letterSpacing={-1} style={{marginBottom:6}} />
        <div style={{fontSize:14,color:"rgba(255,255,255,0.5)"}}>Hola, {usuario.nombre?.split(" ")[0]}. ¿Con qué perfil querés entrar?</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:14,width:"100%",maxWidth:320}}>
        <button onClick={()=>onElegir("room")} style={{padding:"20px 24px",borderRadius:16,border:"2px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.07)",cursor:"pointer",textAlign:"left",color:"white"}}>
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

export function CambiarPasswordModal({ onClose }) {
  const [nueva,    setNueva]    = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [ok,       setOk]       = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [verConf,  setVerConf]  = useState(false);

  const inp = {flex:1,padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const btnVer = {padding:"0 12px",borderRadius:10,border:"1.5px solid #E2E8F0",background:"#F8FAFC",cursor:"pointer",fontSize:14,color:"#94A3B8",flexShrink:0};

  const guardar = async () => {
    setErr("");
    if(!nueva || !confirma) { setErr("Completá todos los campos"); return; }
    if(nueva.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    if(nueva !== confirma) { setErr("Las contraseñas no coinciden"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if(error) { setErr("Error al cambiar la contraseña: " + error.message); setSaving(false); return; }
    // Supabase Auth es la fuente de verdad — no necesitamos actualizar nada más
    setSaving(false);
    setOk(true);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:380}}>
        <div style={{fontSize:15,fontWeight:900,marginBottom:4}}>Cambiar contraseña</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:20}}>Ingresa tu nueva contraseña</div>
        {ok ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:32,marginBottom:8}}>✅</div>
            <div style={{fontSize:14,fontWeight:700,color:"#10B981",marginBottom:16}}>Contraseña actualizada</div>
            <button onClick={onClose} style={{padding:"10px 24px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Cerrar</button>
          </div>
        ) : (
          <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>NUEVA CONTRASEÑA</div>
              <div style={{display:"flex",gap:6}}>
                <input type={verNueva?"text":"password"} value={nueva} onChange={e=>setNueva(e.target.value)} style={inp} placeholder="Mínimo 6 caracteres"/>
                <button onClick={()=>setVerNueva(p=>!p)} style={btnVer}>{verNueva?"🙈":"👁"}</button>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>CONFIRMAR CONTRASEÑA</div>
              <div style={{display:"flex",gap:6}}>
                <input type={verConf?"text":"password"} value={confirma} onChange={e=>setConfirma(e.target.value)} style={inp} placeholder="Repetí la contraseña"/>
                <button onClick={()=>setVerConf(p=>!p)} style={btnVer}>{verConf?"🙈":"👁"}</button>
              </div>
            </div>
            {err&&<div style={{fontSize:12,color:"#EF4444",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Cambiar contraseña"}</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// Pantalla de "crear nueva contraseña" tras tocar el link del mail de reseteo.
// La monta App.jsx cuando detecta una sesión de recovery (evento
// PASSWORD_RECOVERY o `type=recovery` en el hash), por encima del login y de la
// app — aunque ya exista una sesión temporal. `onListo` continúa a la app (la
// sesión queda válida, sin re-login). Estética del login (gradiente oscuro).
export function NuevaPasswordRecovery({ onListo }) {
  const [nueva,    setNueva]    = useState("");
  const [confirma, setConfirma] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");
  const [estado,   setEstado]   = useState("form"); // form | ok | expirado
  const [verNueva, setVerNueva] = useState(false);
  const [verConf,  setVerConf]  = useState(false);

  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"};
  const btnVer = {padding:"0 12px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:14,flexShrink:0};

  const volverAlInicio = () => {
    // Limpia el hash de recovery y recarga: sin sesión → login; con sesión
    // válida → la app. `pathname` respeta dev (/) y prod (/app).
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* noop */ }
    window.location.reload();
  };

  const guardar = async () => {
    setErr("");
    if(!nueva || !confirma) { setErr("Completá los dos campos"); return; }
    if(nueva.length < 6)    { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    if(nueva !== confirma)  { setErr("Las contraseñas no coinciden"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: nueva });
    setSaving(false);
    if(error) {
      // Sin sesión de recovery (link vencido, ya usado o abierto en otro
      // dispositivo) updateUser devuelve "Auth session missing".
      if(/session/i.test(error.message)) { setEstado("expirado"); return; }
      setErr("No se pudo cambiar la contraseña: " + error.message);
      return;
    }
    setEstado("ok");
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <Wordmark size={40} letterSpacing={-2} />
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Comunidad escolar</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"28px 24px",border:"1px solid rgba(255,255,255,0.10)"}}>

        {estado === "ok" ? (
          <div style={{textAlign:"center",padding:"12px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>✅</div>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:8}}>Contraseña actualizada</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Ya podés usar tu nueva contraseña.</div>
            <button onClick={onListo || volverAlInicio} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800}}>
              Ir a la app
            </button>
          </div>

        ) : estado === "expirado" ? (
          <div style={{textAlign:"center",padding:"12px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>⏳</div>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:8}}>El enlace expiró o ya se usó</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Pedí uno nuevo desde "¿Olvidaste tu contraseña?" en el inicio.</div>
            <button onClick={volverAlInicio} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800}}>
              Volver al inicio
            </button>
          </div>

        ) : (
          <>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:4}}>Crear nueva contraseña</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:20}}>Elegí una contraseña para tu cuenta en tribbu.</div>

            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Nueva contraseña</div>
              <div style={{display:"flex",gap:6}}>
                <input type={verNueva?"text":"password"} value={nueva} onChange={e=>setNueva(e.target.value)} style={inputStyle} placeholder="Mínimo 6 caracteres"/>
                <button onClick={()=>setVerNueva(p=>!p)} style={btnVer} type="button">{verNueva?"🙈":"👁"}</button>
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8}}>Repetir contraseña</div>
              <div style={{display:"flex",gap:6}}>
                <input type={verConf?"text":"password"} value={confirma} onChange={e=>setConfirma(e.target.value)} onKeyDown={e=>e.key==="Enter"&&guardar()} style={inputStyle} placeholder="Repetí la contraseña"/>
                <button onClick={()=>setVerConf(p=>!p)} style={btnVer} type="button">{verConf?"🙈":"👁"}</button>
              </div>
            </div>
            {err && <div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={guardar} disabled={saving} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:saving?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:14}}>
              {saving?"Guardando...":"Guardar contraseña"}
            </button>
            <button onClick={volverAlInicio} style={{width:"100%",fontSize:13,color:"rgba(255,255,255,0.4)",background:"none",border:"none",cursor:"pointer"}} type="button">← Volver al inicio</button>
          </>
        )}
      </div>
    </div>
  );
}

// Eliminar cuenta (Apple 5.1.1(v) — la Edge Function delete-account ya existe
// y borra exactamente esto; acá solo falta decirlo antes de apretar. Mismo
// alcance que mobile/app/(tabs)/mas.jsx.
export function EliminarCuentaModal({ onClose, onEliminada }) {
  const [texto, setTexto] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [err, setErr] = useState("");

  const confirmar = async () => {
    if(texto.trim().toUpperCase()!=="ELIMINAR") return;
    setEliminando(true);
    setErr("");
    try {
      await deleteMyAccount();
      await onEliminada();
    } catch(e) {
      setErr(e.message || "No se pudo eliminar la cuenta. Probá de nuevo en unos minutos.");
      setEliminando(false);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:420}}>
        <div style={{fontSize:15,fontWeight:900,marginBottom:4,color:"#EF4444"}}>🗑️ Eliminar mi cuenta</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Esta acción es permanente y no se puede deshacer.</div>

        <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 12px",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:800,color:"#EF4444",marginBottom:6}}>SE BORRA</div>
          <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#7F1D1D",lineHeight:1.7}}>
            <li>Tu cuenta y tu contraseña</li>
            <li>Tus recordatorios personales y confirmaciones de lectura/asistencia</li>
            <li>Lo que marcaste comprado en Info Útil</li>
            <li>Tus dispositivos registrados para notificaciones</li>
            <li>Tu vínculo con tus hijos en la app</li>
          </ul>
        </div>
        <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:10,padding:"10px 12px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:800,color:"#10B981",marginBottom:6}}>SE MANTIENE</div>
          <ul style={{margin:0,paddingLeft:18,fontSize:12,color:"#065F46",lineHeight:1.7}}>
            <li>Los datos de tus hijos en el colegio (son del colegio, no tuyos)</li>
            <li>El historial de colectas del curso (tu aporte queda sin nombre)</li>
          </ul>
        </div>

        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>ESCRIBÍ "ELIMINAR" PARA CONFIRMAR</div>
        <input value={texto} onChange={e=>setTexto(e.target.value)} placeholder="ELIMINAR" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box",marginBottom:12}}/>

        {err&&<div style={{fontSize:12,color:"#EF4444",marginBottom:12,textAlign:"center"}}>{err}</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} disabled={eliminando} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={confirmar} disabled={eliminando||texto.trim().toUpperCase()!=="ELIMINAR"} style={{flex:2,padding:11,borderRadius:10,border:"none",background:texto.trim().toUpperCase()==="ELIMINAR"?"#EF4444":"#FCA5A5",color:"white",cursor:texto.trim().toUpperCase()==="ELIMINAR"?"pointer":"default",fontSize:13,fontWeight:700}}>{eliminando?"Eliminando...":"Eliminar definitivamente"}</button>
        </div>
      </Card>
    </div>
  );
}
