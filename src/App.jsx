// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

// ── Módulos extraídos ────────────────────────────────────────────────────────
import { T, ROL_LABEL, HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "./lib/theme";
import { getHijoColor, setHijoColor } from "./lib/helpers";
import { Spinner } from "./components/Spinner";
import { useIsMobile } from "./hooks/useIsMobile";

import { Login, SeleccionPerfil, CambiarPasswordModal } from "./features/auth";
import { Muro }            from "./features/muro";
import { Calendario }      from "./features/calendario";
import { Cumpleanios }     from "./features/cumples";
import { Finanzas }        from "./features/finanzas";
import { Comedor }         from "./features/comedor";
import { RecordatoriosTab } from "./features/recordatorios";
import { InfoUtil }        from "./features/info";
import { Contacto, Alumnos } from "./features/contacto";
import { AdminPanel }      from "./features/admin";
import { SuperAdmin }      from "./features/superadmin";
import { Encuestas }       from "./features/encuestas";
import { useNotificaciones, NotificacionesPanel } from "./features/notificaciones";

// ── Capacitor / OneSignal (solo Android nativo) ──────────────────────────────
// ── Capacitor nativo: solo carga en la app Android, no en la web ──
const isNative = typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.());

let _OS = null;
window._tribbuPendingTab = null;
window._tribbuUserId = null;

const TAB_MAP = {
  recordatorio: "recordatorios",
  evento:       "clases",
  colecta:      "finanzas",
  alerta:       "muro",
  festejo:      "cumples",
  encuesta:     "encuestas",
};

// Inicializar OneSignal via import dinámico con reintentos
const _initOneSignal = (attempt = 0) => {
  import("onesignal-cordova-plugin").then(m => {
    _OS = m.default;
    if (!_OS) { if(attempt < 5) setTimeout(()=>_initOneSignal(attempt+1), 1000); return; }
    try {
      _OS.Debug.setLogLevel(6);
      _OS.initialize(import.meta.env.VITE_ONESIGNAL_APP_ID);
      _OS.Notifications.requestPermission(true).catch(() => {});
      console.log("OneSignal inicializado OK, attempt:", attempt);

      // Si ya hay usuario logueado, vincularlo
      if(window._tribbuUserId) {
        _OS.login(window._tribbuUserId);
        console.log("OneSignal login OK (init):", window._tribbuUserId);
      }

      // Click en notificacion (background/foreground)
      _OS.Notifications.addClickListener((event) => {
        const data = event?.notification?.additionalData || {};
        console.log("tribbu:click data:", JSON.stringify(data));
        const destTab = TAB_MAP[data.type];
        if (destTab) window.dispatchEvent(new CustomEvent("tribbu:navigate", { detail: { tab: destTab } }));
      });

      // App cerrada: notificacion que lanzó la app
      _OS.Notifications.getLaunchNotification().then((notification) => {
        if (!notification) return;
        const data = notification?.additionalData || {};
        const destTab = TAB_MAP[data.type];
        if (destTab) {
          window._tribbuPendingTab = destTab;
          window.dispatchEvent(new CustomEvent("tribbu:navigate", { detail: { tab: destTab } }));
        }
      }).catch(() => {});

    } catch(e) { console.log("OneSignal setup error:", e); }
  }).catch(() => {
    if(attempt < 5) setTimeout(()=>_initOneSignal(attempt+1), 1000);
  });
};

if (isNative) {
  // Esperar 2s para que el plugin nativo esté listo antes de inicializar
  setTimeout(_initOneSignal, 2000);

  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    try {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: "#0F172A" });
      StatusBar.setOverlaysWebView({ overlay: false });
    } catch(e) {}
  }).catch(() => {});
}
// Enviar push notification via Edge Function

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function App() {
  const [usuario,       setUsuario]       = useState(null);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [tab,           setTab]           = useState("muro");
  const [openColecta,   setOpenColecta]   = useState(null);
  const [openFecha,     setOpenFecha]     = useState(null);
  const [cursoIdx,      setCursoIdx]      = useState(0);
  const [items,         setItems]         = useState([]);
  const [hijoColorsMap, setHijoColorsMap] = useState({});
  const [colorPickerIdx,setColorPickerIdx]= useState(null);
  const [badgeCount,    setBadgeCount]    = useState(0);
  const [menuMas,       setMenuMas]       = useState(false);
  const [cambiarPass,   setCambiarPass]   = useState(false);
  const [panelNotifs,   setPanelNotifs]   = useState(false);
  const isMobile = useIsMobile();

  // Derivar el scope de cursos del item actual (puede estar vacío sin sesión).
  // En la vista "Todos" (pseudo-item, default con hijos en >1 curso) cursoId es
  // null y cursoIds abarca todos los cursos con hijos.
  const _itemActual   = items[cursoIdx];
  const _esVistaTodos = _itemActual?._tipo==="todos";
  const _cursoId      = _esVistaTodos ? null : _itemActual?.curso_id ?? null;
  // Identidad estable: las features dependen de cursoIds en sus efectos y un
  // array nuevo por render dispararía refetches en cadena.
  const _cursoIds = useMemo(()=>{
    if(_esVistaTodos) return [...new Set(items.filter(i=>i._tipo==="hijo").map(i=>i.curso_id).filter(Boolean))];
    return _cursoId ? [_cursoId] : [];
  },[items, _esVistaTodos, _cursoId]);

  // Color de un item: el personalizado si guardó uno (cambiarColorHijo), si
  // no null — un solo lugar para esta regla, antes copiada suelta 5 veces
  // (headerBg, el dot del selector, el picker, tagDeCurso...), lo que ya
  // causó un bug real (headerBg quedó con el fallback viejo en un solo sitio
  // sin arreglar los demás). getHijoColorEfectivo agrega el fallback final a
  // item.color/"#3B82F6" para los usos que sí quieren mostrar algo siempre
  // (dots, tags) — headerBg usa el custom solo, sin ese último fallback.
  const getHijoColorCustom = (item) => {
    if(!item) return null;
    const sc = hijoColorsMap[`${usuario?.id}_${item.id}`] || getHijoColor(usuario?.id, item.id) || null;
    return (sc && sc!==HIJO_COLOR_DEFAULT) ? sc : null;
  };
  const getHijoColorEfectivo = (item) => getHijoColorCustom(item) || (item?.color || "#3B82F6");

  // {nombre, color} de los hijos de un curso, SOLO en vista Todos (null por
  // hijo): las pantallas lo llaman incondicionalmente para etiquetar filas.
  const tagDeCurso = (cid) => {
    if(!_esVistaTodos || !cid) return null;
    const hs = items.filter(i=>i._tipo==="hijo" && i.curso_id===cid);
    if(!hs.length) return null;
    return {
      nombre: hs.map(h=>h.nombre?.split(" ")[0]).filter(Boolean).join(", "),
      color: getHijoColorEfectivo(hs[0]),
    };
  };

  // Hook de notificaciones — siempre se llama, usa guards internos cuando no hay sesión
  const { notifs, leidos, cargando: cargandoNotifs, noLeidos,
          marcarLeido, recargar: recargarNotifs } = useNotificaciones({
    cursoIds: _cursoIds, userId: usuario?.id ?? null, active: panelNotifs,
  });

  useEffect(()=>{
    if(!usuario||usuario.rol==="super") return;
    const cargarItems = async () => {
      // 1. Hijos del usuario
      const { data: uhData } = await supabase
        .from("usuario_hijos")
        .select("hijo_id, hijos(*, cursos(nombre,color,avatar))")
        .eq("usuario_id", usuario.id);

      // 2. Cursos donde es Room Parent
      const { data: ucData } = await supabase
        .from("usuario_cursos")
        .select("curso_id")
        .eq("usuario_id", usuario.id)
        .eq("rol", "admin");

      const cursosAdmin = new Set((ucData||[]).map(r=>r.curso_id));

      const items = (uhData||[])
        .map(r=>r.hijos)
        .filter(Boolean)
        .map(h=>({
          ...h,
          _tipo: "hijo",
          rolEfectivo: cursosAdmin.has(h.curso_id) ? "admin" : "padre",
        }));

      // Con hijos en más de un curso, "Todos" es un acceso más (el primero y el
      // default): la vista unificada domina todas las pantallas vía cursoIds.
      const cursosDistintos = new Set(items.map(h=>h.curso_id).filter(Boolean));
      setItems(cursosDistintos.size>1 ? [{_tipo:"todos", id:"__todos__", nombre:"Todos"}, ...items] : items);
    };
    cargarItems();
  },[usuario]);

  // Badge: recarga al cambiar de curso/usuario, cada 30s, y cuando cambia el
  // estado de lectura — NO al cambiar de tab (ver nota más abajo). Reusa el
  // `recordatorio_leidos` que ya trae useNotificaciones (misma consulta
  // exacta, sin filtro de curso ni fecha) en vez de pedirlo de nuevo: antes
  // cada cambio de hijo/curso disparaba esa consulta 3 veces en paralelo
  // (Muro, este badge y notificaciones), cada una compitiendo por conexión
  // con las demás.
  const cargarBadge = (usr, itmList, idx, leidosSet) => {
    if(!usr) return;
    const itm_ = itmList[idx];
    const cids_ = itm_?._tipo==="todos"
      ? [...new Set(itmList.filter(i=>i._tipo==="hijo").map(i=>i.curso_id).filter(Boolean))]
      : [itm_?._tipo==="hijo" ? itm_?.curso_id : itm_?.id].filter(Boolean);
    if(!cids_.length) return;
    const hoy = new Date().toISOString().split("T")[0];
    supabase.from("recordatorios").select("id").in("curso_id", cids_)
      .or(`para_usuario_id.is.null,para_usuario_id.eq.${usr.id}`)
      .or(`fecha.is.null,fecha.gte.${hoy}`)
      .then(({data:recs}) => {
        setBadgeCount((recs||[]).filter(r=>!leidosSet.has(r.id)).length);
      });
  };
  // NO al cambiar de tab: la cuenta de no leídos no depende de qué pantalla
  // se está mirando, así que recalcularla en cada navegación solo agrega un
  // round-trip innecesario a cada cambio de módulo. `leidos` en las deps
  // hace que se recalcule solo cuando el estado de lectura realmente
  // cambió (incluye el refresh explícito de Recordatorios vía onBadgeChange
  // más abajo, que llama a recargarNotifs en vez de a cargarBadge directo).
  useEffect(()=>{
    cargarBadge(usuario, items, cursoIdx, leidos);
    const iv = setInterval(()=>cargarBadge(usuario, items, cursoIdx, leidos), 30000);
    return ()=>clearInterval(iv);
  },[usuario, items, cursoIdx, leidos]);

  // Restaurar sesión al recargar la página
  useEffect(()=>{
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if(session?.user) {
        const { data } = await supabase
          .from("usuarios")
          .select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)")
          .eq("auth_id", session.user.id)
          .eq("activo", true)
          .single();
        if(data) {
          setUsuario({
            ...data,
            hijos:  [...new Set(data.usuario_hijos.map(r=>r.hijo_id))],
            cursos: data.usuario_cursos.map(r=>r.curso_id),
            cursosConRol: data.usuario_cursos.map(r=>({curso_id:r.curso_id, rol:r.rol||"padre"})),
          });
          // Consumir tab pendiente de notificación (app cerrada)
          if(window._tribbuPendingTab) {
            setTab(window._tribbuPendingTab);
            window._tribbuPendingTab = null;
          }
          // Vincular dispositivo con OneSignal
          window._tribbuUserId = data.id;
          if(isNative && _OS) {
            try { _OS.login(data.id); } catch(e) {}
          }
        }
      }
      setAuthLoading(false);
    });
  },[]);

  // Deep link: escuchar evento de navegación desde notificación push
  useEffect(() => {
    const handler = (e) => {
      const { tab } = e.detail || {};
      if(!tab) return;
      // Solo navegar si el usuario ya está autenticado, sino guardar para después
      if(usuario) setTab(tab);
      else window._tribbuPendingTab = tab;
    };
    window.addEventListener("tribbu:navigate", handler);
    return () => window.removeEventListener("tribbu:navigate", handler);
  }, [usuario]);

  // Fix WebView Android: los inputs date/time no abren el calendario nativo al tocar.
  // Forzamos la apertura con showPicker() en cualquier tap sobre el campo.
  useEffect(() => {
    const abrirPicker = (e) => {
      const el = e.target;
      if(!el || el.tagName !== "INPUT") return;
      if(el.type !== "date" && el.type !== "time" && el.type !== "month" && el.type !== "datetime-local") return;
      if(typeof el.showPicker !== "function") return;
      try { el.showPicker(); } catch(_) {}
    };
    document.addEventListener("click", abrirPicker);
    return () => document.removeEventListener("click", abrirPicker);
  }, []);

  const handleLogin = (u) => {
    setUsuario(u);
    // Si hay un tab pendiente de una notificación, navegar ahí en lugar del muro
    const pendingTab = window._tribbuPendingTab;
    setTab(pendingTab || "muro");
    if(pendingTab) window._tribbuPendingTab = null;
    setCursoIdx(0);
    setItems([]);
    // Vincular dispositivo con usuario en OneSignal (reintenta hasta que _OS esté listo)
    window._tribbuUserId = u.id;
    if(isNative) {
      if(_OS) {
        try { _OS.login(u.id); console.log("OneSignal login OK (handleLogin):", u.id); } catch(e) { console.log("OneSignal login error:", e); }
      }
      // _OS puede no estar listo aún — _initOneSignal lo vinculará cuando esté listo
    }
  };

  if(authLoading) return <Spinner/>;
  if(!usuario) return <Login onLogin={handleLogin}/>;

  const itemActual   = items[cursoIdx];
  const esVistaTodos = _esVistaTodos;
  const cursoIds     = _cursoIds;
  // En "Todos" no hay curso único: sin rol admin (las acciones por curso
  // requieren elegir un hijo) y cursoId null; las lecturas van por cursoIds.
  const rolEfectivo = esVistaTodos ? "padre" : itemActual?.rolEfectivo || "padre";
  const esPadre     = rolEfectivo==="padre";
  const isAdmin     = rolEfectivo==="admin";
  const cursoId     = _cursoId;
  const cursoNombre = esVistaTodos ? "Todos mis hijos" : itemActual?.cursos?.nombre;
  // Cursos donde el usuario es Room Parent — para permisos por fila en Todos.
  const cursosAdmin = items.filter(i=>i.rolEfectivo==="admin").map(i=>i.curso_id);

  if(usuario.rol==="super") return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light"}}>
      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}
      <div style={{background:"#0F172A",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{fontSize:22,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setCambiarPass(true)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:12}}>🔑 Contraseña</button>
          <button onClick={async ()=>{ await supabase.auth.signOut(); setUsuario(null); }} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"6px 12px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:12}}>Salir</button>
        </div>
      </div>
      <div style={{padding:"24px 20px",maxWidth:1200,margin:"0 auto"}}><SuperAdmin/></div>
    </div>
  );

  const hijoColor = itemActual?._tipo==="hijo" ? getHijoColorCustom(itemActual) : null;
  // El color del hijo activo tiñe el header SOLO si eligió uno personalizado —
  // sin custom, cae al neutro (mismo que "Todos"), para que "Restablecer color"
  // realmente vuelva al estado sin personalizar. No usar item.color acá (eso
  // es el color de identidad del hijo en la BD, no un "color por defecto de
  // vista" — se sigue usando en hijoDotColor/tagDeCurso para diferenciar hijos
  // en listas, pero no debe teñir el header entero).
  const headerBg  = hijoColor || "#0F172A";
  const hijoDotColor = hijoColor || (esPadre && itemActual?.color) || "#3B82F6";

  const cambiarColorHijo = (idx, color) => {
    const item = items[idx];
    if(!item) return;
    if(color===null) {
      try { localStorage.removeItem(`hcolor_${usuario?.id}_${item.id}`); } catch{}
      setHijoColorsMap(p=>{ const n={...p}; delete n[`${usuario?.id}_${item.id}`]; return n; });
    } else {
      setHijoColor(usuario?.id, item.id, color);
      setHijoColorsMap(p=>({...p,[`${usuario?.id}_${item.id}`]:color}));
    }
    setColorPickerIdx(null);
  };

  const TABS = [
    {id:"muro",          label:"Inicio",        emoji:"🏠"},
    {id:"clases",        label:"Calendario",    emoji:"📅"},
    {id:"comedor",       label:"Comedor",       emoji:"🍽️"},
    {id:"cumples",       label:"Cumpleaños",    emoji:"🎂"},
    {id:"recordatorios", label:"Recordatorios", emoji:"📌"},
    {id:"encuestas",     label:"Encuestas",     emoji:"📊"},
    {id:"finanzas",      label:"Colectas",      emoji:"💳"},
    {id:"info",          label:"Info Util",     emoji:"📋"},
    {id:"contacto",      label:"Contacto",      emoji:"📞"},
    ...(isAdmin?[{id:"alumnos",label:"Alumnos",emoji:"🎒"},{id:"admin",label:"Admin",emoji:"⚙️"}]:[]),
  ];

  const renderTab = () => {
    if(!cursoIds.length) return <Spinner/>;
    // Si es padre, solo pasar el hijo activo (no todos los hijos)
    const hijoActivoId = itemActual?._tipo==="hijo" ? itemActual?.id : null;
    const misHijosActivos = items.filter(i=>i._tipo==="hijo").map(i=>i.id);
    switch(tab) {
      case "muro":     return <Muro cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursoNombre={cursoNombre} isAdmin={isAdmin} userName={usuario.nombre?.split(" ")[0]||""} userId={usuario.id} misHijos={misHijosActivos} onNavigate={(t,extra)=>{ setTab(t); if(extra?.openColecta) setOpenColecta(extra.openColecta); if(extra?.openFecha) setOpenFecha(extra.openFecha); }}/>;
      case "clases":   return <Calendario cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} openFecha={openFecha} onClearOpenFecha={()=>setOpenFecha(null)}/>;
      case "comedor":  return <Comedor cursoId={cursoId} isAdmin={isAdmin} isSuper={usuario?.rol==="super"}/>;
      case "info":     return <InfoUtil cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} isAdmin={isAdmin} userId={usuario.id} cursoNombre={cursoNombre}/>;
      case "finanzas": return <Finanzas cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} openColectaId={openColecta} onClearOpen={()=>setOpenColecta(null)}/>;
      case "recordatorios": return <RecordatoriosTab cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} cursoNombre={cursoNombre} userId={usuario.id} isAdmin={isAdmin} isSuper={usuario?.rol==="super"} active={tab==="recordatorios"} onBadgeChange={()=>recargarNotifs()}/>;
      case "cumples":  return <Cumpleanios cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} hijoActivo={hijoActivoId}/>;
      case "encuestas": return <Encuestas cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} isAdmin={isAdmin}/>;
      case "contacto": return <Contacto cursoId={cursoId} cursoIds={cursoIds} isSuperAdmin={usuario?.rol==="super"}/>;
      case "alumnos":  return <Alumnos cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} isAdmin={isAdmin}/>;
      case "admin":    return <AdminPanel cursoId={cursoId} cursoNombre={cursoNombre}/>;
      default: return null;
    }
  };

  const pickerItem = colorPickerIdx!==null ? items[colorPickerIdx] : null;


  // Sidebar items compartido entre mobile y desktop
  const SidebarItems = () => (
    <>
      {items.length>0&&(
        <div style={{padding:"0 12px 12px"}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6,paddingLeft:8}}>Mi acceso</div>
          {items.map((item,i)=>(
            <div key={i} style={{position:"relative",marginBottom:2}}>
              <button onClick={()=>{ setCursoIdx(i); setColorPickerIdx(null); }} style={{width:"100%",padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",background:i===cursoIdx?"rgba(255,255,255,0.12)":"transparent",color:"white",fontSize:12,fontWeight:i===cursoIdx?800:500,textAlign:"left",display:"flex",alignItems:"center",gap:8,WebkitTextFillColor:"white"}}>
                {item._tipo==="todos"&&<span style={{fontSize:12,flexShrink:0}}>👥</span>}
                {item._tipo==="hijo"&&<span style={{width:10,height:10,borderRadius:"50%",background:getHijoColorEfectivo(item),flexShrink:0,border:"2px solid rgba(255,255,255,0.3)"}}/>}
                <span style={{flex:1,color:"white"}}>{item._tipo==="hijo"||item._tipo==="todos"?item.nombre:`${item.avatar||""} ${item.nombre}`}</span>
                {item._tipo==="hijo"&&i===cursoIdx&&<span onClick={e=>{e.stopPropagation();setColorPickerIdx(colorPickerIdx===i?null:i);}} style={{fontSize:12,opacity:0.6,cursor:"pointer",color:"white"}}>🎨</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  // Color picker overlay (compartido)
  const ColorPicker = () => {
    if(!pickerItem) return null;
    const pickerActiveColor = getHijoColorCustom(pickerItem);
    return (
      <div style={{position:"fixed",inset:0,zIndex:500}} onClick={()=>setColorPickerIdx(null)}>
        <div style={{position:"absolute",...(isMobile?{top:60}:{bottom:0}),left:0,width:isMobile?"100%":220,background:"#1E293B",padding:16,boxShadow:"4px 4px 20px rgba(0,0,0,0.4)",borderRadius:isMobile?"0 0 16px 16px":"0 16px 0 0"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.5)",textTransform:"uppercase",letterSpacing:0.6,marginBottom:10}}>Color de {pickerItem.nombre}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
            {HIJO_COLORS_CUSTOM.map(col=>(
              <button key={col} onClick={()=>cambiarColorHijo(colorPickerIdx,col)} style={{width:36,height:36,borderRadius:8,background:col,border:pickerActiveColor===col?"3px solid white":"2px solid transparent",cursor:"pointer"}}/>
            ))}
          </div>
          <button onClick={()=>cambiarColorHijo(colorPickerIdx,null)} style={{width:"100%",padding:"8px 0",borderRadius:8,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:12,fontWeight:700}}>Restablecer color</button>
        </div>
      </div>
    );
  };

  if(isMobile) return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light",display:"flex",flexDirection:"column"}}>
      <ColorPicker/>
      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}
      {panelNotifs&&(
        <NotificacionesPanel
          notifs={notifs} leidos={leidos} cargando={cargandoNotifs} tagDeCurso={tagDeCurso}
          onMarcarLeido={marcarLeido}
          onCerrar={()=>setPanelNotifs(false)}
        />
      )}

      {/* Header mobile */}
      <div style={{background:headerBg,position:"sticky",top:0,zIndex:100,transition:"background 0.3s",paddingTop:"env(safe-area-inset-top)"}}>

        {/* Barra superior: logo + usuario */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px"}}>
          <div style={{fontSize:22,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif"}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:600}}>{usuario.nombre?.split(" ")[0]}</div>
            {/* Campana de notificaciones */}
            <button onClick={()=>setPanelNotifs(p=>!p)} style={{position:"relative",background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"4px 8px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:16}}>
              🔔
              {noLeidos>0&&<span style={{position:"absolute",top:0,right:0,background:"#EF4444",color:"white",borderRadius:20,fontSize:8,fontWeight:800,padding:"0 3px",minWidth:14,textAlign:"center",lineHeight:"14px",transform:"translate(4px,-4px)"}}>{noLeidos>9?"9+":noLeidos}</span>}
            </button>
            <button onClick={()=>setCambiarPass(true)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"4px 8px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:10}}>🔑</button>
            <button onClick={async ()=>{ await supabase.auth.signOut(); setUsuario(null); }} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:8,padding:"4px 8px",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:10}}>Salir</button>
          </div>
        </div>
        {/* Selector de hijos/cursos */}
        {items.length>1&&(
          <div style={{display:"flex",gap:6,padding:"0 16px 10px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            {items.map((item,i)=>{
              const active = i===cursoIdx;
              const iColor = getHijoColorEfectivo(item);
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                  <button onClick={()=>{ setCursoIdx(i); setColorPickerIdx(null); }} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",background:active?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)",color:"white",fontSize:12,fontWeight:active?700:400,display:"flex",alignItems:"center",gap:5}}>
                    {item._tipo==="todos"&&<span style={{fontSize:11}}>👥</span>}
                    {item._tipo==="hijo"&&<span style={{width:8,height:8,borderRadius:"50%",background:active?iColor:"rgba(255,255,255,0.3)",display:"inline-block",flexShrink:0}}/>}
                    {item._tipo==="hijo"||item._tipo==="todos"?item.nombre:`${item.avatar||""} ${item.nombre}`}
                  </button>
                  {item._tipo==="hijo"&&active&&<button onClick={()=>setColorPickerIdx(colorPickerIdx===i?null:i)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,width:24,height:24,cursor:"pointer",fontSize:12}}>🎨</button>}
                </div>
              );
            })}
          </div>
        )}
        {items.length===1&&items[0]?._tipo==="hijo"&&(
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 16px 10px"}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{items[0]?.nombre}</span>
            <button onClick={()=>setColorPickerIdx(colorPickerIdx===0?null:0)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,width:24,height:24,cursor:"pointer",fontSize:12}}>🎨</button>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div style={{flex:1,padding:"16px 16px 80px",boxSizing:"border-box",overflowY:"auto"}}>
        {renderTab()}
      </div>

      {/* Barra de navegacion inferior */}
      {/* Barra inferior mobile: 4 tabs fijos + Más */}
      {(()=>{
        const TAB_FIJOS = ["muro","clases","cumples","recordatorios"];
        const tabsFijos = TABS.filter(t=>TAB_FIJOS.includes(t.id));
        const tabsExtra = TABS.filter(t=>!TAB_FIJOS.includes(t.id));
        const masActivo = tabsExtra.some(t=>t.id===tab);
        return (
          <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200}}>
            {menuMas&&(
              <div style={{background:headerBg,borderTop:"1px solid rgba(255,255,255,0.15)",padding:"8px 12px",display:"flex",flexWrap:"wrap",gap:4}} onClick={()=>setMenuMas(false)}>
                {tabsExtra.map(t=>(
                  <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id==="recordatorios") setBadgeCount(0); }} style={{flex:"1 0 calc(33% - 4px)",padding:"10px 4px",border:"none",background:tab===t.id?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.06)",cursor:"pointer",color:"white",display:"flex",flexDirection:"column",alignItems:"center",gap:2,borderRadius:10}}>
                    <span style={{fontSize:20}}>{t.emoji}</span>
                    <span style={{fontSize:10,fontWeight:tab===t.id?700:400,color:"white"}}>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{background:headerBg,borderTop:"1px solid rgba(255,255,255,0.1)",display:"flex",transition:"background 0.3s",paddingBottom:"env(safe-area-inset-bottom)"}}>
              {tabsFijos.map(t=>(
                <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id==="recordatorios") setBadgeCount(0); setMenuMas(false); }} style={{flex:1,padding:"8px 4px 10px",border:"none",background:"transparent",cursor:"pointer",color:tab===t.id?"white":"rgba(255,255,255,0.45)",display:"flex",flexDirection:"column",alignItems:"center",gap:1,position:"relative"}}>
                  <span style={{fontSize:18}}>{t.emoji}</span>
                  <span style={{fontSize:9,fontWeight:tab===t.id?700:400,whiteSpace:"nowrap",color:tab===t.id?"white":"rgba(255,255,255,0.45)"}}>{t.label.length>7?t.label.slice(0,7)+"…":t.label}</span>
                  {t.id==="recordatorios"&&badgeCount>0&&<span style={{position:"absolute",top:4,right:"50%",transform:"translateX(8px)",background:"#EF4444",color:"white",borderRadius:20,fontSize:9,fontWeight:800,padding:"0 4px",minWidth:16,textAlign:"center",lineHeight:"16px"}}>{badgeCount>99?"99+":badgeCount}</span>}
                  {tab===t.id&&<span style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:hijoDotColor,borderRadius:2}}/>}
                </button>
              ))}
              <button onClick={()=>setMenuMas(p=>!p)} style={{flex:1,padding:"8px 4px 10px",border:"none",background:menuMas||masActivo?"rgba(255,255,255,0.12)":"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1,position:"relative"}}>
                <span style={{fontSize:20,color:"white",lineHeight:1,letterSpacing:2,fontWeight:900}}>···</span>
                <span style={{fontSize:9,fontWeight:menuMas||masActivo?700:400,color:menuMas||masActivo?"white":"rgba(255,255,255,0.45)"}}>Mas</span>
                {masActivo&&!menuMas&&<span style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:hijoDotColor,borderRadius:2}}/>}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );

  // Desktop layout
  return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light",display:"flex"}}>
      <ColorPicker/>
      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}
      {panelNotifs&&(
        <NotificacionesPanel
          notifs={notifs} leidos={leidos} cargando={cargandoNotifs} tagDeCurso={tagDeCurso}
          onMarcarLeido={marcarLeido}
          onCerrar={()=>setPanelNotifs(false)}
        />
      )}

      {/* Sidebar izquierdo fijo */}
      <style>{`#tribbu-sidebar button, #tribbu-sidebar span, #tribbu-sidebar div { color: white !important; -webkit-text-fill-color: white !important; }`}</style>
      <div id="tribbu-sidebar" style={{width:220,background:headerBg,position:"fixed",top:0,left:0,bottom:0,display:"flex",flexDirection:"column",zIndex:100,overflowY:"auto",transition:"background 0.3s"}}>
        <div style={{padding:"24px 20px 16px"}}>
          <div style={{fontSize:26,fontWeight:900,color:"white",letterSpacing:-1,fontFamily:"Georgia,serif",marginBottom:4}}>tribbu<span style={{color:"#3B82F6"}}>.</span></div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1}}>Comunidad escolar</div>
        </div>

        <div style={{padding:"0 12px",flex:1,paddingTop:8}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>{ setTab(t.id); if(t.id==="recordatorios") setBadgeCount(0); }} style={{width:"100%",padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:tab===t.id?"rgba(255,255,255,0.12)":"transparent",color:tab===t.id?"white":"rgba(255,255,255,0.55)",fontSize:13,fontWeight:tab===t.id?700:400,textAlign:"left",marginBottom:2,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:16}}>{t.emoji}</span>
              <span style={{flex:1}}>{t.label}</span>
              {t.id==="recordatorios"&&badgeCount>0&&(
                <span style={{background:"#EF4444",color:"white",borderRadius:20,fontSize:10,fontWeight:800,padding:"1px 6px",minWidth:18,textAlign:"center",lineHeight:"16px"}}>{badgeCount>99?"99+":badgeCount}</span>
              )}
            </button>
          ))}
          {/* Botón notificaciones in-app */}
          <button onClick={()=>setPanelNotifs(p=>!p)} style={{width:"100%",padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:panelNotifs?"rgba(255,255,255,0.12)":"transparent",fontSize:13,fontWeight:400,textAlign:"left",marginBottom:2,display:"flex",alignItems:"center",gap:10,position:"relative"}}>
            <span style={{fontSize:16}}>🔔</span>
            <span style={{flex:1}}>Notificaciones</span>
            {noLeidos>0&&<span style={{background:"#EF4444",color:"white",borderRadius:20,fontSize:10,fontWeight:800,padding:"1px 6px",minWidth:18,textAlign:"center",lineHeight:"16px"}}>{noLeidos>99?"99+":noLeidos}</span>}
          </button>
        </div>

        {/* Selector de hijos/Todos en la navegación (como el header de mobile):
            cambia la vista desde cualquier pantalla con un click. Va al pie,
            justo arriba del usuario. */}
        <div style={{paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.08)"}}>
          <SidebarItems/>
        </div>

        <div style={{padding:"0 12px 16px"}}>
          <div style={{padding:"10px 12px",borderRadius:12,background:"rgba(255,255,255,0.06)",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:"white"}}>{usuario.nombre} {usuario.apellido||""}</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginTop:2}}>{ROL_LABEL[rolEfectivo]}</div>
          </div>

          <button onClick={()=>setCambiarPass(true)} style={{width:"100%",padding:"8px 12px",borderRadius:12,border:"none",cursor:"pointer",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:600,textAlign:"left",marginBottom:6}}>🔑 Cambiar contraseña</button>
          <button onClick={async ()=>{ await supabase.auth.signOut(); setUsuario(null); }} style={{width:"100%",padding:"9px 12px",borderRadius:12,border:"none",cursor:"pointer",background:"rgba(255,255,255,0.06)",color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:600,textAlign:"left"}}>&larr; Cerrar sesion</button>
        </div>
      </div>

      {/* Contenido principal */}
      <div style={{marginLeft:220,flex:1,padding:"36px 40px",boxSizing:"border-box",minWidth:0,color:"#0F172A"}}>
        <div style={{maxWidth:800}}>{renderTab()}</div>
      </div>
    </div>
  );
}

export default App;