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

import bcrypt from "bcryptjs"; // TODO: eliminar cuando se borre columna pass de DB

export function Login({ onLogin }) {
  const [email,setEmail]           = useState("");
  const [pass,setPass]             = useState("");
  const [err,setErr]               = useState("");
  const [ld,setLd]                 = useState(false);
  const [vistaReset,setVistaReset] = useState(false);
  const [resetOk,setResetOk]       = useState(false);
  const [resetLd,setResetLd]       = useState(false);
  const [vistaReg,setVistaReg]     = useState(false);

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
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setResetLd(false);
    if(error) { setErr("Error al enviar el correo: " + error.message); return; }
    setResetOk(true);
  };

  const inputStyle = {width:"100%",padding:"12px 14px",borderRadius:11,border:"1.5px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.08)",color:"white",fontSize:14,boxSizing:"border-box",outline:"none"};

  if(vistaReg) return (
    <RegistroConCodigo onVolver={()=>setVistaReg(false)} onLogin={onLogin}/>
  );

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:40,fontWeight:900,color:"white",letterSpacing:-2,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Comunidad escolar</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"28px 24px",border:"1px solid rgba(255,255,255,0.10)"}}>

        {resetOk ? (
          <div style={{textAlign:"center",padding:"12px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>📬</div>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:8}}>Revisá tu correo</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:20}}>Te enviamos un link para restablecer tu contraseña a <strong style={{color:"white"}}>{email}</strong>.</div>
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
            <button onClick={()=>{setVistaReg(true);setErr("");}} style={{width:"100%",padding:11,borderRadius:11,border:"1.5px solid rgba(255,255,255,0.15)",background:"transparent",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:14}}>
              Registrarme con código de invitación
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


// ── Registro con código de invitación ────────────────────────────────────────
// Requiere tabla en Supabase:
//   CREATE TABLE codigos_invitacion (
//     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//     codigo text UNIQUE NOT NULL,
//     curso_id int REFERENCES cursos(id),
//     usos_max int DEFAULT 10,
//     usos_actuales int DEFAULT 0,
//     activo boolean DEFAULT true,
//     creado_en timestamptz DEFAULT now()
//   );
//   -- RLS: SELECT público; UPDATE solo service role o función edge
export function RegistroConCodigo({ onVolver, onLogin }) {
  const [paso,     setPaso]     = useState(1); // 1=código, 2=datos, 3=listo
  const [codigo,   setCodigo]   = useState("");
  const [cursoData,setCursoData]= useState(null); // { id, nombre, codigo_id }
  const [nombre,   setNombre]   = useState("");
  const [apellido, setApellido] = useState("");
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [err,      setErr]      = useState("");
  const [ld,       setLd]       = useState(false);

  const inputStyle = {
    width:"100%",padding:"12px 14px",borderRadius:11,
    border:"1.5px solid rgba(255,255,255,0.12)",
    background:"rgba(255,255,255,0.08)",color:"white",
    fontSize:14,boxSizing:"border-box",outline:"none",
  };
  const label = {fontSize:10,color:"rgba(255,255,255,0.5)",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:0.8};

  const verificarCodigo = async () => {
    if(!codigo.trim()) { setErr("Ingresá el código de invitación"); return; }
    setLd(true); setErr("");
    const { data, error } = await supabase
      .from("codigos_invitacion")
      .select("id, curso_id, usos_max, usos_actuales, activo, cursos(nombre)")
      .eq("codigo", codigo.trim().toUpperCase())
      .maybeSingle();
    setLd(false);
    if(error || !data) { setErr("Código inválido. Pedile uno nuevo al Room Parent."); return; }
    if(!data.activo)    { setErr("Este código ya no está activo."); return; }
    if(data.usos_actuales >= data.usos_max) { setErr("Este código llegó al límite de usos."); return; }
    setCursoData({ id: data.curso_id, nombre: data.cursos?.nombre, codigo_id: data.id });
    setPaso(2);
  };

  const registrar = async () => {
    if(!nombre.trim()||!email.trim()||!pass.trim()) { setErr("Completá todos los campos"); return; }
    if(pass.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres"); return; }
    setLd(true); setErr("");
    try {
      // 1. Crear usuario en Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: pass,
      });
      if(authErr) throw new Error(authErr.message);
      const auth_id = authData.user?.id;

      // 2. Crear registro en tabla usuarios
      const avatar = `${nombre[0]||""}${apellido[0]||""}`.toUpperCase() || nombre.slice(0,2).toUpperCase();
      const { data: nuevoUsuario, error: dbErr } = await supabase.from("usuarios").insert({
        nombre: nombre.trim(), apellido: apellido.trim()||null,
        email: email.trim().toLowerCase(), rol:"padre",
        avatar, activo:true, auth_id,
      }).select().single();
      if(dbErr) throw new Error("Error al crear el usuario");

      // 3. Vincular al curso
      if(cursoData?.id && nuevoUsuario?.id) {
        await supabase.from("usuario_cursos").insert({
          usuario_id: nuevoUsuario.id, curso_id: cursoData.id, rol:"padre"
        });
        // Incrementar uso del código
        await supabase.from("codigos_invitacion")
          .update({ usos_actuales: supabase.rpc ? undefined : undefined }) // ver nota
          .eq("id", cursoData.codigo_id);
        // Alternativa simple sin RPC:
        const { data: cod } = await supabase.from("codigos_invitacion")
          .select("usos_actuales").eq("id", cursoData.codigo_id).single();
        if(cod) await supabase.from("codigos_invitacion")
          .update({ usos_actuales: (cod.usos_actuales||0) + 1 })
          .eq("id", cursoData.codigo_id);
      }

      setPaso(3);
    } catch(e) {
      setErr(e.message || "Error al registrarse");
    }
    setLd(false);
  };

  const s = {minHeight:"100vh",background:"linear-gradient(160deg,#0F172A 0%,#1E3A5F 50%,#0F172A 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24};

  return (
    <div style={s}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:40,fontWeight:900,color:"white",letterSpacing:-2,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.45)",marginTop:4,letterSpacing:1,textTransform:"uppercase"}}>Registro de apoderado</div>
      </div>
      <div style={{width:"100%",maxWidth:360,background:"rgba(255,255,255,0.07)",borderRadius:22,padding:"28px 24px",border:"1px solid rgba(255,255,255,0.10)"}}>

        {paso===3 ? (
          <div style={{textAlign:"center",padding:"12px 0"}}>
            <div style={{fontSize:36,marginBottom:12}}>🎉</div>
            <div style={{fontSize:16,fontWeight:800,color:"white",marginBottom:8}}>¡Bienvenido/a a tribbu!</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:24,lineHeight:1.6}}>
              Tu cuenta fue creada y ya estás conectado/a al curso <strong style={{color:"white"}}>{cursoData?.nombre}</strong>.
            </div>
            <button onClick={onVolver} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800}}>
              Ir al inicio de sesión
            </button>
          </div>

        ) : paso===1 ? (
          <>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:4}}>Ingresá tu código</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:20}}>El Room Parent de tu curso te compartió un código de invitación.</div>
            <div style={{marginBottom:16}}>
              <div style={label}>Código de invitación</div>
              <input
                value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==="Enter"&&verificarCodigo()}
                placeholder="Ej: ABC123" maxLength={10}
                style={{...inputStyle,textAlign:"center",fontSize:20,fontWeight:800,letterSpacing:4}}
              />
            </div>
            {err&&<div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={verificarCodigo} disabled={ld} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:ld?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#3B82F6,#1D4ED8)",color:"white",fontSize:14,fontWeight:800,marginBottom:14}}>
              {ld?"Verificando...":"Continuar"}
            </button>
            <button onClick={onVolver} style={{width:"100%",fontSize:13,color:"rgba(255,255,255,0.4)",background:"none",border:"none",cursor:"pointer"}}>← Volver al inicio de sesión</button>
          </>

        ) : (
          <>
            <div style={{fontSize:15,fontWeight:700,color:"white",marginBottom:2}}>Creá tu cuenta</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:20}}>Curso: <strong style={{color:"white"}}>{cursoData?.nombre}</strong></div>
            {[
              {label:"Nombre",      val:nombre,   set:setNombre,   ph:"Tu nombre",       type:"text"},
              {label:"Apellido",    val:apellido, set:setApellido, ph:"Tu apellido",      type:"text"},
              {label:"Correo",      val:email,    set:setEmail,    ph:"correo@mail.com",  type:"email"},
              {label:"Contraseña",  val:pass,     set:setPass,     ph:"Mínimo 6 caracteres", type:"password"},
            ].map(f=>(
              <div key={f.label} style={{marginBottom:12}}>
                <div style={label}>{f.label}</div>
                <input value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph} type={f.type} style={inputStyle}/>
              </div>
            ))}
            {err&&<div style={{fontSize:12,color:"#FCA5A5",marginBottom:12,textAlign:"center"}}>{err}</div>}
            <button onClick={registrar} disabled={ld} style={{width:"100%",padding:13,borderRadius:11,border:"none",cursor:"pointer",background:ld?"rgba(255,255,255,0.1)":"linear-gradient(135deg,#10B981,#059669)",color:"white",fontSize:14,fontWeight:800,marginBottom:14}}>
              {ld?"Registrando...":"Crear cuenta"}
            </button>
            <button onClick={()=>{setPaso(1);setErr("");}} style={{width:"100%",fontSize:13,color:"rgba(255,255,255,0.4)",background:"none",border:"none",cursor:"pointer"}}>← Cambiar código</button>
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
