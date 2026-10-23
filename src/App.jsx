// @ts-nocheck
import { useState, useEffect, useMemo, memo, lazy, Suspense } from "react";
import { supabase } from "./supabase";

// ── Módulos extraídos ────────────────────────────────────────────────────────
import { T, ROL_LABEL, ROL_COLOR, HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "./lib/theme";
import { getHijoColor, setHijoColor, colorColegio } from "./lib/helpers";
import { nivelDeVista } from "./lib/niveles";
import { Spinner } from "./components/Spinner";
import { Wordmark } from "./components/Wordmark";
import { SignedImg } from "./components/SignedImg";
import { useIsMobile } from "./hooks/useIsMobile";
import { SELECT_USUARIO_SESION, armarUsuario, itemsDeDocente } from "./lib/sesion";
import { TABS_DOCENTE } from "./lib/docentes";
import { TabActivaContext, TAB_ACTIVA, TAB_OCULTA } from "./hooks/useTabActiva";

import { Login, SeleccionPerfil, CambiarPasswordModal, EliminarCuentaModal, NuevaPasswordRecovery } from "./features/auth";
// Cada sección se descarga recién cuando se abre (antes todo iba en un único
// archivo de ~1,3 MB que había que bajar entero antes de ver el login).
const aLazy = (cargar, nombre) => lazy(() => cargar().then((m) => ({ default: m[nombre] })));
const Muro             = aLazy(() => import("./features/muro"), "Muro");
const Calendario       = aLazy(() => import("./features/calendario"), "Calendario");
const Cumpleanios      = aLazy(() => import("./features/cumples"), "Cumpleanios");
const Finanzas         = aLazy(() => import("./features/finanzas"), "Finanzas");
const Comedor          = aLazy(() => import("./features/comedor"), "Comedor");
const RecordatoriosTab = aLazy(() => import("./features/recordatorios"), "RecordatoriosTab");
const InfoUtil         = aLazy(() => import("./features/info"), "InfoUtil");
const Contacto         = aLazy(() => import("./features/contacto"), "Contacto");
const AdminPanel       = aLazy(() => import("./features/admin"), "AdminPanel");
const SuperAdmin       = aLazy(() => import("./features/superadmin"), "SuperAdmin");
const Encuestas        = aLazy(() => import("./features/encuestas"), "Encuestas");
const Autorizaciones   = aLazy(() => import("./features/autorizaciones"), "Autorizaciones");
const Talleres         = aLazy(() => import("./features/talleres"), "Talleres");
const Comunidad        = aLazy(() => import("./features/comunidad"), "Comunidad");
const Perdidos         = aLazy(() => import("./features/perdidos"), "Perdidos");
const Mensajes         = aLazy(() => import("./features/mensajes"), "Mensajes");
const AlumnosDocente   = aLazy(() => import("./features/docente"), "AlumnosDocente");
const Curso            = aLazy(() => import("./features/curso"), "Curso");
const MiCuenta         = aLazy(() => import("./features/curso"), "MiCuenta");
const Ayuda            = aLazy(() => import("./features/ayuda"), "Ayuda");
import { SubSeccion } from "./components/SubSeccion";
import { SelectorHijos } from "./components/SelectorHijos";
import { Icono } from "./components/Icono";
import { AvatarPerfil } from "./components/AvatarPerfil";
import { PreferenciasAvisosModal } from "./components/PreferenciasAvisos";
const BusquedaGlobal   = aLazy(() => import("./features/buscar"), "BusquedaGlobal");
import { useNotificaciones } from "./features/notificaciones";
import { useMensajesNoLeidos } from "./hooks/useMensajesNoLeidos";

// ── Capacitor / OneSignal (solo Android nativo) ──────────────────────────────
// ── Capacitor nativo: solo carga en la app Android, no en la web ──
const isNative = typeof window !== "undefined" && !!(window.Capacitor?.isNativePlatform?.());

let _OS = null;
window._tribbuPendingTab = null;
window._tribbuUserId = null;

// La pestaña activa vive también en la URL (`/app?tab=clases`): se puede
// compartir/guardar el link a una sección, y el botón "atrás" del navegador
// vuelve a la pestaña anterior en vez de sacarte de la app. Query y no hash:
// el hash lo usa el link de recuperación de contraseña (#…&type=recovery).
// "muro" es la home y no lleva parámetro.
const TABS_VALIDOS = new Set(["muro","clases","horario","comedor","info","finanzas","recordatorios","cumples","encuestas","autorizaciones","talleres","perdidos","comunidad","marketplace","servicios","contacto","admin","mensajes","alumnos","curso","cuenta","ayuda"]);
// Navegación en 4 secciones (Hoy · Agenda · Comunicaciones · Curso), igual
// que mobile. Cada una agrupa tabs: queda marcada en cualquiera de ellas y
// tocarla va a la primera. Lo que no está en las tres primeras es de Curso.
const SECCIONES = [
  { id:"hoy",            label:"Hoy",            icono:"hoy", tabs:["muro"] },
  { id:"agenda",         label:"Agenda",         icono:"agenda", tabs:["clases","horario","cumples"] },
  { id:"comunicaciones", label:"Comunicaciones", icono:"comunicaciones", tabs:["recordatorios","mensajes"] },
  { id:"curso",          label:"Curso",          icono:"curso", tabs:["curso"] },
];
const seccionDe = (t) => t==="cuenta"||t==="ayuda" ? null : (SECCIONES.find(x=>x.tabs.includes(t)) || SECCIONES[3]).id;
// Sub-secciones de Comunidad: cada una tiene su ?tab= propio, pero en el menú
// se marca el ítem "comunidad".
const SUBS_COMUNIDAD = new Set(["comunidad","marketplace","servicios"]);
const tabDeUrl = () => {
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    return TABS_VALIDOS.has(t) ? t : null;
  } catch { return null; }
};

const TAB_MAP = {
  recordatorio: "recordatorios",
  evento:       "clases",
  colecta:      "finanzas",
  colecta_pago: "finanzas",
  alerta:       "muro",
  festejo:      "cumples",
  encuesta:     "encuestas",
  autorizacion: "autorizaciones",
  taller:       "talleres",
  perdido:      "perdidos",
  marketplace:  "marketplace",
  resumen:      "muro", // resumen semanal (avisos-automaticos)
  mensaje:      "mensajes",
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
    } catch { /* StatusBar no disponible (web) */ }
  }).catch(() => {});
}
// Enviar push notification via Edge Function

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Una pestaña en caché (ver renderTabs). Mientras SIGUE oculta no se
// re-renderiza: antes cada render de App (cambiar de pestaña, el poll de
// notificaciones cada 30 s) re-renderizaba todas las pestañas ya visitadas,
// y la navegación se ponía más lenta cuanto más se usaba. Al volver a ser la
// visible se pone al día con las props actuales.
const TabCacheada = memo(function TabCacheada({ activa, children }) {
  return (
    <div style={activa ? undefined : {display:"none"}}>
      <TabActivaContext.Provider value={activa ? TAB_ACTIVA : TAB_OCULTA}>
        <Suspense fallback={<Spinner/>}>{children}</Suspense>
      </TabActivaContext.Provider>
    </div>
  );
}, (prev, next) => !prev.activa && !next.activa);

function App() {
  const [usuario,       setUsuario]       = useState(null);
  // Foto de perfil cambiada en esta sesión (undefined = la del usuario). Aparte
  // de `usuario` para no recargar "Mi acceso" al cambiarla.
  const [fotoLocal,     setFotoLocal]     = useState(undefined);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [tab,           setTab]           = useState(() => tabDeUrl() || "muro");
  // Pestañas ya visitadas que quedan montadas (ocultas) — ver renderTabs.
  const [tabsMontadas,  setTabsMontadas]  = useState({ ctx: null, tabs: {} });
  const [openColecta,   setOpenColecta]   = useState(null);
  const [openFecha,     setOpenFecha]     = useState(null);
  const [openAviso,     setOpenAviso]     = useState(null); // { id, n } — aviso a resaltar en Avisos
  const [openTaller,    setOpenTaller]    = useState(null); // { id, n } — taller a resaltar en Talleres
  const [abrirTabPerdidos, setAbrirTabPerdidos] = useState(null); // { tipo, n } — pestaña de Lost & Found (desde Hoy)
  const [openAutorizacion, setOpenAutorizacion] = useState(null); // { id, n } — autorización a responder (desde Hoy)
  // Pedido de navegación a Mensajes ({ conversacionId | soporte | usuarioId, n }).
  // `?tab=mensajes&c=<id>` (link de una conversación) abre esa al entrar.
  const [abrirMensajes, setAbrirMensajes] = useState(() => {
    try {
      const c = new URLSearchParams(window.location.search).get("c");
      return c ? { conversacionId: c, n: 1 } : null;
    } catch { return null; }
  });
  const [cursoIdx,      setCursoIdx]      = useState(0);
  const [items,         setItems]         = useState([]);
  const [colegiosPorId, setColegiosPorId] = useState({});
  const [hijoColorsMap, setHijoColorsMap] = useState({});
  const [colorPickerIdx,setColorPickerIdx]= useState(null);
  const [badgeVisto,    setBadgeVisto]    = useState(-1); // avisosVersion al tocar la pestaña Avisos
  const [cambiarPass,   setCambiarPass]   = useState(false);
  const [prefsAvisos,   setPrefsAvisos]   = useState(false); // modal "⚙️ Configurar notificaciones" (avisos automáticos)
  const [eliminarCuenta,setEliminarCuenta]= useState(false);
  const [busquedaGlobal,setBusquedaGlobal]= useState("");
  // Reseteo de contraseña por mail: el link cae en /app con
  // `#access_token=…&type=recovery`. Init lazy por si el evento
  // PASSWORD_RECOVERY llega antes de que monte el listener de abajo — así nunca
  // parpadea el login.
  const [recoveryMode, setRecoveryMode] = useState(
    () => typeof window !== "undefined" &&
      /[#&?]type=recovery(&|$)/.test(window.location.hash + window.location.search)
  );
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
    if(_esVistaTodos) return [...new Set(items.filter(i=>i._tipo==="hijo"||i._tipo==="curso").map(i=>i.curso_id).filter(Boolean))];
    return _cursoId ? [_cursoId] : [];
  },[items, _esVistaTodos, _cursoId]);
  // Ids de mis hijos, memoizado: las pantallas lo usan como dependencia de su
  // carga (useCallback) — un array nuevo en cada render las recargaría en loop.
  const misHijosActivos = useMemo(()=>items.filter(i=>i._tipo==="hijo").map(i=>i.id),[items]);

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
    // Docente: el tag es el curso mismo (nombre corto: "4°B - Primaria" → "4°B").
    const cur = items.find(i=>i._tipo==="curso" && i.curso_id===cid);
    if(cur) return { nombre: cur.nombre?.split(" - ")[0]?.trim() || cur.nombre, color: getHijoColorEfectivo(cur) };
    const hs = items.filter(i=>i._tipo==="hijo" && i.curso_id===cid);
    if(!hs.length) return null;
    return {
      nombre: hs.map(h=>h.nombre?.split(" ")[0]).filter(Boolean).join(", "),
      color: getHijoColorEfectivo(hs[0]),
    };
  };

  // Hook de notificaciones — siempre se llama, usa guards internos cuando no hay sesión
  // Sin campana (2026-10-14): solo el contador de avisos para Comunicaciones.
  const { avisosSinLeer, avisosVersion, recargar: recargarNotifs } = useNotificaciones({
    cursoIds: _cursoIds, userId: usuario?.id ?? null, active: false,
  });
  const badgeCount = avisosVersion === badgeVisto ? 0 : avisosSinLeer;
  // Mensajes: no leídos + la única suscripción Realtime de la sesión (también
  // la usa la bandeja de soporte del super, que acá no cuenta badge).
  const esPanelAdmin = usuario?.rol==="super" || usuario?.rol==="colegio_admin" || usuario?.rol==="nivel_admin";
  const { noLeidos: mensajesSinLeer, recargar: recargarMensajes } = useMensajesNoLeidos(usuario?.id ?? null, { contar: !!usuario && !esPanelAdmin });

  useEffect(()=>{
    if(!usuario||["super","colegio_admin","nivel_admin"].includes(usuario.rol)) return;
    const cargarItems = async () => {
      // Docente: "Mi acceso" = sus cursos (de sus clases, ya en la sesión).
      if(usuario.rol==="docente") {
        setItems(itemsDeDocente(usuario.cursosDocente));
        const colegioIds = [...new Set((usuario.cursosDocente||[]).map(c=>c.colegio_id).filter(Boolean))];
        if(colegioIds.length) {
          const { data: cols } = await supabase.from("colegios").select("id,nombre,logo_url,color_primario").in("id",colegioIds);
          setColegiosPorId(Object.fromEntries((cols||[]).map(c=>[c.id,c])));
        }
        return;
      }
      // 1. Hijos del usuario: ya vienen con el usuario (SELECT_USUARIO_SESION
      // en lib/sesion.js), sin otro viaje a usuario_hijos.
      const uhData = usuario.usuario_hijos || [];

      // 2. Cursos donde es Room Parent: ya vienen con el usuario
      // (usuario_cursos(curso_id, rol) en la consulta de sesión/login), no
      // hace falta otro viaje al servidor.
      const cursosAdmin = new Set((usuario.cursosConRol||[]).filter(r=>r.rol==="room").map(r=>r.curso_id));

      const items = (uhData||[])
        .map(r=>r.hijos)
        .filter(Boolean)
        .map(h=>({
          ...h,
          _tipo: "hijo",
          rolEfectivo: cursosAdmin.has(h.curso_id) ? "room" : "padre",
        }));

      // Con hijos en más de un curso, "Todos" es un acceso más (el primero y el
      // default): la vista unificada domina todas las pantallas vía cursoIds.
      const cursosDistintos = new Set(items.map(h=>h.curso_id).filter(Boolean));
      setItems(cursosDistintos.size>1 ? [{_tipo:"todos", id:"__todos__", nombre:"Todos"}, ...items] : items);

      // Logo del colegio activo (sidebar/header) — un query chico, solo los
      // colegios realmente en juego. En "Todos" (>1 colegio posible, aunque
      // hoy no pasa en la práctica) no se resuelve ninguno en particular acá:
      // el picker de abajo usa itemActual, que en Todos es null.
      const colegioIds = [...new Set(items.map(h=>h.cursos?.colegio_id).filter(Boolean))];
      if(colegioIds.length) {
        const { data: cols } = await supabase.from("colegios").select("id,nombre,logo_url,color_primario").in("id",colegioIds);
        setColegiosPorId(Object.fromEntries((cols||[]).map(c=>[c.id,c])));
      } else {
        setColegiosPorId({});
      }
    };
    cargarItems();
  },[usuario]);

  // Badge de Avisos: sale de useNotificaciones (avisosSinLeer), que ya trae
  // los recordatorios y los leídos — antes App pedía los mismos avisos otra
  // vez por su cuenta (al arrancar, al cambiar los leídos y cada 30 s).
  // Tocar la pestaña Avisos lo oculta hasta el próximo refresco del hook.

  // Restaurar sesión al recargar la página
  useEffect(()=>{
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if(session?.user) {
        const { data } = await supabase
          .from("usuarios")
          .select(SELECT_USUARIO_SESION)
          .eq("auth_id", session.user.id)
          .eq("activo", true)
          .single();
        if(data) {
          setUsuario(armarUsuario(data));
          // Consumir tab pendiente de notificación (app cerrada)
          if(window._tribbuPendingTab) {
            setTab(window._tribbuPendingTab);
            window._tribbuPendingTab = null;
          }
          // Vincular dispositivo con OneSignal
          window._tribbuUserId = data.id;
          if(isNative && _OS) {
            try { _OS.login(data.id); } catch { /* OneSignal todavía no está listo */ }
          }
        }
      }
      setAuthLoading(false);
    });
  },[]);

  // Reseteo de contraseña: Supabase procesa el hash del link y dispara
  // PASSWORD_RECOVERY. Se muestra <NuevaPasswordRecovery/> por encima de todo
  // (hay una sesión temporal, pero no queremos meter al usuario a la app sin
  // que elija una contraseña nueva).
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if(event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Pestaña → URL. Tras un "atrás" la URL ya coincide con la pestaña que
  // restaura popstate, así que no se vuelve a apilar (no hace falta flag).
  useEffect(() => {
    if(!usuario) return;
    if((tabDeUrl() || "muro") === tab) return;
    try {
      const url = new URL(window.location.href);
      if(tab === "muro") url.searchParams.delete("tab"); else url.searchParams.set("tab", tab);
      window.history.pushState({ tab }, "", url.pathname + url.search + url.hash);
    } catch { /* noop */ }
  }, [tab, usuario]);

  // URL → pestaña ("atrás"/"adelante" del navegador).
  useEffect(() => {
    const onPop = () => setTab(tabDeUrl() || "muro");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
      try { el.showPicker(); } catch { /* showPicker no soportado */ }
    };
    document.addEventListener("click", abrirPicker);
    return () => document.removeEventListener("click", abrirPicker);
  }, []);

  const handleLogin = (u) => {
    setUsuario(u);
    // Si hay un tab pendiente de una notificación, navegar ahí en lugar del muro
    const pendingTab = window._tribbuPendingTab;
    // Un link a una sección abierto sin sesión: después del login, ir ahí.
    setTab(pendingTab || tabDeUrl() || "muro");
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

  // La cuenta ya no existe del lado del servidor tras deleteMyAccount(): el
  // signOut solo limpia la sesión local (puede fallar si Supabase ya la
  // invalidó, no importa) y vuelve al login.
  const cerrarSesionTrasEliminar = async () => {
    try { await supabase.auth.signOut(); } catch { /* sesión ya invalidada */ }
    setUsuario(null);
    setFotoLocal(undefined);
  };

  // Tras crear la contraseña nueva la sesión ya es válida: limpiamos el hash de
  // recovery y recargamos — el bootstrap de arriba levanta la sesión de
  // localStorage y entra a la app sin re-login.
  const handleRecoveryDone = () => {
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch { /* noop */ }
    window.location.reload();
  };

  if(recoveryMode) return <NuevaPasswordRecovery onListo={handleRecoveryDone}/>;
  if(authLoading) return <Spinner/>;
  if(!usuario) return <Login onLogin={handleLogin}/>;

  const itemActual   = items[cursoIdx];
  const esVistaTodos = _esVistaTodos;
  const cursoIds     = _cursoIds;
  // Logo del colegio para el header/sidebar (ver LogoUploadInput en Contacto
  // y cargarItems más arriba) — solo con un colegio inequívoco (no en Todos,
  // no para super/colegio_admin, que no pasan por acá).
  const colegioActivo = !esVistaTodos ? colegiosPorId[itemActual?.cursos?.colegio_id] : null;
  // En "Todos" no hay curso único: sin rol admin (las acciones por curso
  // requieren elegir un hijo) y cursoId null; las lecturas van por cursoIds.
  // Docente: rol propio también en "Todos" (sus cursos), nunca "padre".
  const esDocente   = usuario.rol==="docente";
  const rolEfectivo = esVistaTodos ? (esDocente?"docente":"padre") : itemActual?.rolEfectivo || "padre";
  // Cursos donde la docente publica (avisos, eventos, autorizaciones, encuestas).
  const cursosDocente = esDocente ? (usuario.cursosDocente||[]).map(c=>c.id) : [];
  const esPadre     = rolEfectivo==="padre";
  const isAdmin     = rolEfectivo==="room";
  const cursoId     = _cursoId;
  const cursoNombre = esVistaTodos ? "Todos mis hijos" : itemActual?.cursos?.nombre;
  // Solo para el placeholder del buscador global (mockup: "Buscar en 4°B y
  // 6°A...") — a diferencia de cursoNombre (usado en exports/encabezados,
  // donde "Todos mis hijos" es más claro), acá listamos los cursos reales.
  // Los nombres de curso en la base son largos ("K3 Ants - Kinder", "1ºA -
  // Primaria 2026"): se corta en " - " para quedarse con la parte corta.
  const nombresCursosBusqueda = esVistaTodos
    ? (() => {
        const nombres = [...new Map(
          items.filter(i=>(i._tipo==="hijo"||i._tipo==="curso") && i.curso_id)
            .map(i=>[i.curso_id, i.cursos?.nombre?.split(" - ")[0]?.trim() || i.cursos?.nombre])
        ).values()].filter(Boolean);
        if(nombres.length<=1) return nombres[0] || "tus cursos";
        if(nombres.length===2) return nombres.join(" y ");
        return nombres.slice(0,-1).join(", ")+" y "+nombres[nombres.length-1];
      })()
    : cursoNombre;
  // Cursos donde el usuario es Room Parent — para permisos por fila en Todos.
  const cursosAdmin = items.filter(i=>i.rolEfectivo==="room").map(i=>i.curso_id);
  const fotoPerfil = fotoLocal !== undefined ? fotoLocal : usuario?.foto_url || null;

  // colegio_admin (multi-colegio): mismo panel que super, acotado a su
  // colegio_id vía RLS — sin "Mi acceso" propio, igual que super.
  if(esPanelAdmin) return (
    <Suspense fallback={<Spinner/>}><SuperAdmin usuario={usuario} onCerrarSesion={async ()=>{ await supabase.auth.signOut(); setUsuario(null); }}/></Suspense>
  );

  const hijoColor = itemActual?._tipo==="hijo" ? getHijoColorCustom(itemActual) : null;
  // El color del hijo activo tiñe el header SOLO si eligió uno personalizado —
  // sin custom, cae al neutro (mismo que "Todos"), para que "Restablecer color"
  // realmente vuelva al estado sin personalizar. No usar item.color acá (eso
  // es el color de identidad del hijo en la BD, no un "color por defecto de
  // vista" — se sigue usando en hijoDotColor/tagDeCurso para diferenciar hijos
  // en listas, pero no debe teñir el header entero).
  const headerBg  = hijoColor || "#0F172A";
  // Color de marca del colegio activo: reemplaza al azul por defecto (punto del
  // wordmark, indicador de pestaña) pero nunca a un color que eligió el usuario.
  const acentoColegio = colorColegio(colegioActivo?.color_primario);
  const hijoDotColor = hijoColor || (esPadre && itemActual?.color) || acentoColegio || "#3B82F6";

  const cambiarColorHijo = (idx, color) => {
    const item = items[idx];
    if(!item) return;
    if(color===null) {
      try { localStorage.removeItem(`hcolor_${usuario?.id}_${item.id}`); } catch { /* storage bloqueado */ }
      setHijoColorsMap(p=>{ const n={...p}; delete n[`${usuario?.id}_${item.id}`]; return n; });
    } else {
      setHijoColor(usuario?.id, item.id, color);
      setHijoColorsMap(p=>({...p,[`${usuario?.id}_${item.id}`]:color}));
    }
    setColorPickerIdx(null);
  };

  const seccionActiva = seccionDe(SUBS_COMUNIDAD.has(tab) ? "comunidad" : tab);
  const irASeccion = (sec) => {
    const destino = sec.tabs[0];
    setTab(destino);
    if(destino==="recordatorios") setBadgeVisto(avisosVersion);
  };
  const badgeSeccion = (id) => id==="comunicaciones" ? badgeCount + (mensajesSinLeer||0) : 0;
  // Pestañas internas de Agenda y Comunicaciones (arriba del contenido).
  const renderSubSeccion = () => {
    if(seccionActiva==="agenda") return <SubSeccion activo={tab} onIr={setTab} items={[{id:"clases",label:"Calendario"},{id:"horario",label:"Horario"},{id:"cumples",label:"Cumpleaños"}]}/>;
    if(seccionActiva==="comunicaciones") return <SubSeccion activo={tab} onIr={(t)=>{ setTab(t); if(t==="recordatorios") setBadgeVisto(avisosVersion); }} items={[{id:"recordatorios",label:"Avisos",badge:badgeCount},{id:"mensajes",label:"Mensajes",badge:mensajesSinLeer||0}]}/>;
    return null;
  };
  // Selector "Todos mis hijos ▾" (prototipo): arriba de cada sección; en Hoy lo
  // pone el Muro debajo del saludo. Reemplaza los botones del header/sidebar.
  const selectorHijos = (
    <SelectorHijos items={items} cursoIdx={cursoIdx} onElegir={(i)=>{ setCursoIdx(i); setColorPickerIdx(null); }}
      colorDe={getHijoColorEfectivo} colorCustomDe={getHijoColorCustom} onColor={cambiarColorHijo} esDocente={esDocente}/>
  );
  // "‹ Curso" arriba de las pantallas de esa sección (Comedor, Colectas…): sin
  // esto la única forma de volver era la barra. Siempre va a Curso.
  const renderVolverCurso = () => (seccionActiva!=="curso"||tab==="curso") ? null : (
    <button onClick={()=>setTab("curso")} style={{display:"inline-flex",alignItems:"center",gap:2,marginBottom:10,padding:"4px 8px 4px 0",border:"none",background:"none",cursor:"pointer",fontFamily:"inherit"}}>
      <Icono nombre="atras" size={18} color="#2563EB"/>
      <span style={{fontSize:14,fontWeight:700,color:"#2563EB"}}>Curso</span>
    </button>
  );
  const renderSelectorSeccion = () => (tab==="muro"||tab==="cuenta"||tab==="ayuda"||items.length<2) ? null : <div style={{marginBottom:14}}>{selectorHijos}</div>;
  const cerrarSesion = async () => { await supabase.auth.signOut(); setUsuario(null); };

  // Compartida entre Muro y la búsqueda global (header desktop): navegar a
  // otro tab, opcionalmente abriendo una colecta/fecha puntual.
  const navegarA = (t, extra) => {
    setBusquedaGlobal("");
    setTab(t);
    if(extra?.openColecta) setOpenColecta(extra.openColecta);
    if(extra?.openFecha) setOpenFecha(extra.openFecha);
    if(extra?.openAviso) setOpenAviso({ id: extra.openAviso, n: Date.now() });
    if(extra?.openTaller) setOpenTaller({ id: extra.openTaller, n: Date.now() });
    if(extra?.tabPerdidos) setAbrirTabPerdidos({ tipo: extra.tabPerdidos, n: Date.now() });
    if(extra?.openAutorizacion) setOpenAutorizacion({ id: extra.openAutorizacion, n: Date.now() });
    if(extra?.conversacionId || extra?.soporte || extra?.usuarioId || extra?.alumnoDocente || extra?.docente || extra?.secretaria || extra?.articulo) {
      setAbrirMensajes({ conversacionId: extra.conversacionId, soporte: !!extra.soporte, usuarioId: extra.usuarioId, alumnoDocente: extra.alumnoDocente, docente: extra.docente, secretaria: extra.secretaria, articulo: extra.articulo, n: Date.now() });
    }
  };
  // "💬 Escribir" en Alumnos → abre (o crea) el 1 a 1 con ese apoderado.
  const escribirA = (usuarioId) => navegarA("mensajes", { usuarioId });

  const renderTab = (t) => {
    // Si es padre, solo pasar el hijo activo (no todos los hijos)
    const hijoActivoId = itemActual?._tipo==="hijo" ? itemActual?.id : null;
    switch(t) {
      case "muro":     return <Muro selector={selectorHijos} cursoId={cursoId} cursoIds={cursoIds} items={items} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursoNombre={cursoNombre} isAdmin={isAdmin} cursosAdmin={cursosAdmin} esDocente={esDocente} userName={usuario.nombre?.split(" ")[0]||""} userId={usuario.id} misHijos={misHijosActivos} onNavigate={navegarA} onBadgeChange={()=>recargarNotifs()} isMobile={isMobile}/>;
      case "clases":   return <Calendario cursosDocente={cursosDocente} cursosAdmin={cursosAdmin} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} hijoActivo={hijoActivoId} openFecha={openFecha} onClearOpenFecha={()=>setOpenFecha(null)}/>;
      // Horario de clases: pestaña propia de Agenda (antes era una vista del Calendario).
      case "horario":  return <Calendario soloHorario cursosDocente={cursosDocente} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} hijoActivo={hijoActivoId}/>;
      case "comedor":  return <Comedor cursoId={cursoId} nivel={nivelDeVista(items, cursoIds)} isAdmin={isAdmin} isSuper={usuario?.rol==="super"} isMobile={isMobile}/>;
      case "info":     return <InfoUtil cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} isAdmin={isAdmin} userId={usuario.id} cursoNombre={cursoNombre} onEscribir={escribirA}/>;
      case "finanzas": return <Finanzas cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} openColectaId={openColecta} onClearOpen={()=>setOpenColecta(null)} isMobile={isMobile}/>;
      case "recordatorios": return <RecordatoriosTab items={items} cursosDocente={cursosDocente} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} cursoNombre={cursoNombre} userId={usuario.id} isAdmin={isAdmin} isSuper={usuario?.rol==="super"} active={tab==="recordatorios"} onBadgeChange={()=>recargarNotifs()} openAviso={openAviso}/>;
      case "cumples":  return <Cumpleanios cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} hijoActivo={hijoActivoId} esDocente={esDocente}/>;
      case "comunidad": case "marketplace": case "servicios":
        return <Comunidad sub={t==="comunidad"?"marketplace":t} onSub={setTab} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} items={items} onEscribir={(articulo)=>navegarA("mensajes",{articulo})}/>;
      case "perdidos": return <Perdidos abrirTab={abrirTabPerdidos} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} items={items}/>;
      case "autorizaciones": return <Autorizaciones cursosDocente={cursosDocente} cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} isAdmin={isAdmin} misHijos={misHijosActivos} abrir={openAutorizacion}/>;
      case "talleres":  return <Talleres items={items} esVistaTodos={esVistaTodos} hijoActivo={hijoActivoId} tagDeCurso={tagDeCurso} esDocente={esDocente} openTaller={openTaller}/>;
      case "encuestas": return <Encuestas cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} cursosAdmin={cursosAdmin} userId={usuario.id} isAdmin={isAdmin} esDocente={esDocente}/>;
      case "contacto": return <Contacto cursoId={cursoId} cursoIds={cursoIds} isSuperAdmin={usuario?.rol==="super"} items={items} esDocente={esDocente} onEscribir={(extra)=>navegarA("mensajes",extra)}/>;
      case "admin":    return <AdminPanel cursoId={cursoId} cursoNombre={cursoNombre}/>;
      case "mensajes": return <Mensajes userId={usuario.id} items={items} tagDeCurso={tagDeCurso} isMobile={isMobile} abrir={abrirMensajes} onCambio={recargarMensajes} esDocente={esDocente} hijoActivoId={hijoActivoId} cursoIds={cursoIds}/>;
      case "alumnos":  return <AlumnosDocente cursoIds={cursoIds} tagDeCurso={tagDeCurso} esVistaTodos={esVistaTodos} maestroId={usuario.maestros?.[0]?.id} onEscribir={(a)=>navegarA("mensajes",{alumnoDocente:a})}/>;
      case "curso":    return <Curso cursoIds={cursoIds} items={items} userId={usuario.id} isAdmin={isAdmin} esDocente={esDocente} onNavigate={navegarA}/>;
      // Preguntas frecuentes de las familias (src/lib/ayuda.js) + "Escribile al equipo de tribbu".
      case "ayuda":    return <Ayuda onIr={(t)=>navegarA(t)} onSoporte={()=>navegarA("mensajes",{soporte:true})} onVolver={()=>setTab("cuenta")}/>;
      case "cuenta":   return <MiCuenta usuario={usuario} foto={fotoPerfil} onFoto={setFotoLocal} cursosRoom={[...new Set(items.filter(i=>i.rolEfectivo==="room").map(i=>i.cursos?.nombre).filter(Boolean))]} esDocente={esDocente} onNotificaciones={()=>setPrefsAvisos(true)} onSoporte={()=>esDocente?navegarA("mensajes",{soporte:true}):navegarA("ayuda")} onCambiarPass={()=>setCambiarPass(true)} onCerrarSesion={cerrarSesion} onEliminar={()=>setEliminarCuenta(true)}/>;
      default: return null;
    }
  };

  // Pestañas en caché: la que se deja queda montada y oculta (display:none),
  // así volver a ella es instantáneo — antes cada cambio de pestaña desmontaba
  // la pantalla y la recargaba de cero con spinner. Cada una recibe por
  // TabActivaContext si es la visible: useCargar/Muro no cargan ocultas y
  // recargan en segundo plano al volver. Cambiar de hijo/curso (ctx) descarta
  // todas menos la actual, para no recargar pantallas ocultas con otro curso.
  // Marketplace/Servicios/Comunidad son una sola pantalla (Comunidad).
  const claveTab = (t) => (t==="comunidad"||t==="marketplace"||t==="servicios") ? "comunidad" : t;
  const renderTabs = () => {
    if(!cursoIds.length) return <Spinner/>;
    // ?tab=admin sin ser Room Parent de este curso (link ajeno, o cambió de
    // hijo/"Todos" estando en Admin): mostrar el Muro, no el panel.
    // Docente: solo sus pestañas; "Alumnos" (vista docente) solo para docentes.
    const tabEfectiva = (tab === "admin" && !isAdmin) || (esDocente && !TABS_DOCENTE.includes(tab)) || (!esDocente && tab === "alumnos") ? "muro" : tab;
    const clave = claveTab(tabEfectiva);
    const ctx = `${usuario?.id}|${cursoIdx}|${cursoIds.join(",")}`;
    let montadas = tabsMontadas;
    if(montadas.ctx !== ctx || montadas.tabs[clave] !== tabEfectiva) {
      montadas = { ctx, tabs: { ...(montadas.ctx === ctx ? montadas.tabs : {}), [clave]: tabEfectiva } };
      setTabsMontadas(montadas); // ajuste en render (mismo patrón que Comunidad)
    }
    return Object.entries(montadas.tabs).map(([k, t]) => (
      <TabCacheada key={k} activa={k === clave}>{renderTab(t)}</TabCacheada>
    ));
  };

  const pickerItem = colorPickerIdx!==null ? items[colorPickerIdx] : null;


  // Color picker overlay (compartido)
  const renderColorPicker = () => {
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
      {renderColorPicker()}
      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}
      {prefsAvisos&&<PreferenciasAvisosModal userId={usuario.id} onClose={()=>setPrefsAvisos(false)}/>}
      {eliminarCuenta&&<EliminarCuentaModal onClose={()=>setEliminarCuenta(false)} onEliminada={cerrarSesionTrasEliminar}/>}

      {/* Header mobile */}
      <div style={{background:headerBg,position:"sticky",top:0,zIndex:100,transition:"background 0.3s",paddingTop:"env(safe-area-inset-top)"}}>

        {/* Barra superior: logo + usuario */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Wordmark size={22} letterSpacing={-1} dotColor={acentoColegio||undefined} />
            {/* Logo del colegio — chico, al lado del wordmark, nunca lo
                reemplaza. Ausente en Todos/sin logo cargado (colegioActivo). */}
            {colegioActivo?.logo_url&&<SignedImg src={colegioActivo.logo_url} bucket="adjuntos" alt={colegioActivo.nombre} style={{width:22,height:22,borderRadius:6,objectFit:"contain",background:"rgba(255,255,255,0.9)",padding:2}}/>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {/* Acceso directo a Mensajes (además de la pestaña en Comunicaciones). */}
            <button onClick={()=>setTab("mensajes")} aria-label={mensajesSinLeer?`Mensajes, ${mensajesSinLeer} sin leer`:"Mensajes"} style={{position:"relative",width:34,height:34,borderRadius:10,border:"none",background:tab==="mensajes"?"rgba(255,255,255,0.22)":"rgba(255,255,255,0.1)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <Icono nombre="mensaje" size={18} color="rgba(255,255,255,0.88)"/>
              {mensajesSinLeer>0&&<span style={{position:"absolute",top:-5,right:-6,minWidth:17,height:17,padding:"0 4px",borderRadius:999,background:"#EF4444",border:"1.5px solid #0F172A",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}><span style={{fontSize:9.5,fontWeight:800,color:"white"}}>{mensajesSinLeer>9?"9+":mensajesSinLeer}</span></span>}
            </button>
            {/* Mi cuenta (contraseña, notificaciones, salir…). */}
            <button onClick={()=>setTab("cuenta")} aria-label="Mi cuenta" style={{width:34,height:34,borderRadius:999,border:"none",background:"none",cursor:"pointer",padding:0}}>
              <AvatarPerfil usuario={usuario} foto={fotoPerfil} size={34} oscuro/>
            </button>
          </div>
        </div>
        {items.length===1&&items[0]?._tipo==="hijo"&&(
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 16px 10px"}}>
            <span style={{fontSize:12,color:"rgba(255,255,255,0.7)",fontWeight:600}}>{items[0]?.nombre}</span>
            <button onClick={()=>setColorPickerIdx(colorPickerIdx===0?null:0)} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:6,width:24,height:24,cursor:"pointer",fontSize:12}}>🎨</button>
          </div>
        )}
      </div>

      {/* Contenido */}
      <div style={{flex:1,padding:"16px 16px 80px",boxSizing:"border-box",overflowY:"auto"}}>
        {renderVolverCurso()}
        {renderSelectorSeccion()}
        {renderSubSeccion()}
        {renderTabs()}
      </div>

      {/* Barra inferior mobile: Hoy · Agenda · Comunicaciones · Curso */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:headerBg,borderTop:"1px solid rgba(255,255,255,0.1)",display:"flex",transition:"background 0.3s",paddingBottom:"env(safe-area-inset-bottom)"}}>
        {SECCIONES.map(sec=>{
          const on = seccionActiva===sec.id;
          const n = badgeSeccion(sec.id);
          return (
            <button key={sec.id} onClick={()=>irASeccion(sec)} style={{flex:1,padding:"8px 2px 10px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:1,position:"relative"}}>
              <Icono nombre={sec.icono} size={21} color={on?"white":"rgba(255,255,255,0.5)"}/>
              <span style={{fontSize:9.5,fontWeight:on?700:400,whiteSpace:"nowrap",color:on?"white":"rgba(255,255,255,0.5)"}}>{sec.label}</span>
              {n>0&&<span style={{position:"absolute",top:4,right:"50%",transform:"translateX(14px)",background:"#EF4444",color:"white",borderRadius:20,fontSize:9,fontWeight:600,padding:"0 4px",minWidth:16,textAlign:"center",lineHeight:"16px"}}>{n>99?"99+":n}</span>}
              {on&&<span style={{position:"absolute",bottom:0,left:"20%",right:"20%",height:2,background:hijoDotColor,borderRadius:2}}/>}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Desktop layout
  return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light",display:"flex"}}>
      {renderColorPicker()}
      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}
      {prefsAvisos&&<PreferenciasAvisosModal userId={usuario.id} onClose={()=>setPrefsAvisos(false)}/>}
      {eliminarCuenta&&<EliminarCuentaModal onClose={()=>setEliminarCuenta(false)} onEliminada={cerrarSesionTrasEliminar}/>}

      {/* Sidebar izquierdo fijo */}
      <style>{`#tribbu-sidebar button, #tribbu-sidebar span, #tribbu-sidebar div { color: white !important; -webkit-text-fill-color: white !important; }`}</style>
      <div id="tribbu-sidebar" style={{width:220,background:headerBg,position:"fixed",top:0,left:0,bottom:0,display:"flex",flexDirection:"column",zIndex:100,overflowY:"auto",transition:"background 0.3s"}}>
        <div style={{padding:"24px 20px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <Wordmark size={26} letterSpacing={-1} dotColor={acentoColegio||undefined} />
            {/* Logo del colegio — chico, al lado del wordmark, nunca lo
                reemplaza. Ausente en Todos/sin logo cargado (colegioActivo). */}
            {colegioActivo?.logo_url&&<SignedImg src={colegioActivo.logo_url} bucket="adjuntos" alt={colegioActivo.nombre} style={{width:26,height:26,borderRadius:7,objectFit:"contain",background:"rgba(255,255,255,0.9)",padding:2,flexShrink:0}}/>}
          </div>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:1,display:"flex",alignItems:"center",gap:6,overflow:"hidden"}}>
            {acentoColegio&&<span style={{width:6,height:6,borderRadius:"50%",background:acentoColegio,flexShrink:0}}/>}
            <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{colegioActivo?.nombre||"Comunidad escolar"}</span>
          </div>
        </div>

        <div style={{padding:"0 12px",flex:1,paddingTop:8}}>
          {SECCIONES.map(sec=>{
            const on = seccionActiva===sec.id;
            const n = badgeSeccion(sec.id);
            return (
              <button key={sec.id} onClick={()=>irASeccion(sec)} style={{width:"100%",padding:"11px 12px",borderRadius:12,border:"none",cursor:"pointer",background:on?"rgba(255,255,255,0.12)":"transparent",color:on?"white":"rgba(255,255,255,0.55)",fontSize:13.5,fontWeight:on?700:500,textAlign:"left",marginBottom:2,display:"flex",alignItems:"center",gap:10}}>
                <Icono nombre={sec.icono} size={18} color={on?"white":"rgba(255,255,255,0.55)"}/>
                <span style={{flex:1}}>{sec.label}</span>
                {n>0&&<span style={{background:"#EF4444",color:"white",borderRadius:20,fontSize:10,fontWeight:600,padding:"1px 6px",minWidth:18,textAlign:"center",lineHeight:"16px"}}>{n>99?"99+":n}</span>}
              </button>
            );
          })}
        </div>

        <div style={{padding:"0 12px 16px"}}>
          <button onClick={()=>setTab("cuenta")} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:tab==="cuenta"?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.06)",textAlign:"left",fontFamily:"inherit"}}>
            <AvatarPerfil usuario={usuario} foto={fotoPerfil} size={32} oscuro/>
            <span style={{flex:1,minWidth:0,display:"block"}}>
              <span style={{display:"block",fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usuario.nombre} {usuario.apellido||""}</span>
              <span style={{display:"block",fontSize:10,opacity:0.55,marginTop:1}}>Mi cuenta</span>
            </span>
          </button>
        </div>
      </div>

      {/* Contenido principal — Parte 7 del handoff (Tribbu Apoderado Web):
          ancho liberado (antes maxWidth:800 fijo) para que los módulos que
          usan grilla de dos columnas (Inicio/Colectas 1fr+340px, Comedor
          tabla) tengan lugar; cada feature sigue acotando su propio ancho
          donde corresponde (Recordatorios 900px, etc.) */}
      <div style={{marginLeft:220,flex:1,padding:"20px 40px 36px",boxSizing:"border-box",minWidth:0,color:"#0F172A"}}>
        <div style={{maxWidth:1240}}>
          {/* Búsqueda global: filtra recordatorios/eventos/colectas del
              alcance actual, resultado se muestra como panel sobre el
              módulo activo (mismo criterio que mobile/features/buscar). */}
          <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:10,marginBottom:busquedaGlobal.trim()?12:14}}>
            <button onClick={()=>{ setBusquedaGlobal(""); setTab("mensajes"); }} aria-label={mensajesSinLeer?`Mensajes, ${mensajesSinLeer} sin leer`:"Mensajes"} title="Mensajes" style={{position:"relative",width:44,height:44,borderRadius:999,border:"1px solid #E7ECF3",background:tab==="mensajes"?"#F1F5F9":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
              <Icono nombre="mensaje" size={19} color="#475569"/>
              {mensajesSinLeer>0&&<span style={{position:"absolute",top:-3,right:-3,minWidth:18,height:18,padding:"0 4px",borderRadius:999,background:"#EF4444",border:"2px solid white",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}><span style={{fontSize:10,fontWeight:800,color:"white"}}>{mensajesSinLeer>9?"9+":mensajesSinLeer}</span></span>}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:9,minHeight:44,padding:"0 16px",border:"1px solid #E7ECF3",borderRadius:999,background:"white",width:300,boxSizing:"border-box"}}>
              <span style={{fontSize:15,color:"#94A3B8"}}>🔍</span>
              <input
                value={busquedaGlobal}
                onChange={e=>setBusquedaGlobal(e.target.value)}
                placeholder={`Buscar en ${nombresCursosBusqueda||"tu curso"}...`}
                style={{flex:1,minWidth:0,border:"none",outline:"none",background:"transparent",fontSize:13.5,color:"#1E293B",fontFamily:"inherit"}}
              />
            </div>
          </div>
          {/* La búsqueda tapa las pestañas sin desmontarlas (no pierden su caché). */}
          {busquedaGlobal.trim() ? (
            <Suspense fallback={<Spinner/>}>
              <BusquedaGlobal query={busquedaGlobal} cursoIds={cursoIds} tagDeCurso={tagDeCurso} onNavigate={navegarA} onLimpiar={()=>setBusquedaGlobal("")}/>
            </Suspense>
          ) : null}
          <div style={busquedaGlobal.trim() ? {display:"none"} : undefined}>{renderVolverCurso()}{renderSelectorSeccion()}{renderSubSeccion()}{renderTabs()}</div>
        </div>
      </div>
    </div>
  );
}

export default App;