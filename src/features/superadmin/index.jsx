// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtF, fmtNombre, fmtRangoHora, fmtLocalDate, sanitize, uuidLite } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Wordmark } from "../../components/Wordmark";
import { Icono } from "../../components/Icono";
import { SubSeccion } from "../../components/SubSeccion";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { AdjuntosInput } from "../../components/Adjuntos";
import { useIsMobile } from "../../hooks/useIsMobile";
import { LecturasModal } from "../../components/Lecturas";
import { unirLecturasPorFamilia } from "../../lib/lecturas";
import { NIVELES, nombreNivel, textoSecretaria, ordenarNiveles, CARGOS, CARGO_DEFECTO } from "../../lib/niveles";
import { AdopcionTabla } from "../../components/Adopcion";
import { AutorizacionesColegio } from "../autorizaciones";
import { CambiosSalidaColegio } from "../salidas";
import { FotosEscolaresColegio } from "../fotos";
import { ConfiguracionInicio } from "./configuracion";
import { ImportarDatos } from "./importar";
import { FichaAlumno } from "./fichaAlumno";
import { Ayuda } from "../ayuda";
import { preguntasPara } from "../../lib/ayuda";
import { PerdidosColegio } from "../perdidos";
import { MarketplaceColegio } from "../marketplace";
import { TalleresColegio } from "../talleres/colegio";
import { BandejaSoporte, BandejaColegio, DenunciasColegio, SoporteColegioAdmin, Mensajes } from "../mensajes";
import { MateriasAdmin, ClasesCurso, ClasesMaestroEditor } from "./clases";
import { useConfirmar } from "../../hooks/useConfirmar";
import { useNoLeidosPanel, recontarPanel } from "../../hooks/useNoLeidosPanel";
import { cargarClasesMaestro, guardarClasesMaestro } from "./clasesDatos";
import { HorarioCurso, SemanaMaestra, ImportarHorarioModal } from "./horarios";
import { exportarHorarios } from "./clasesDatos";
import { InicioColegio } from "./inicio";
import { EventosColegio } from "../calendario";
import { useListControls } from "../../hooks/useListControls";
import { ListToolbar, AdminFormModal, ConfirmDestructivoModal, CursoListSelector } from "../../components";
import { EmojiPicker } from "../shared";
import { useToast } from "../../hooks/useToast";
import { authAdminCreate, authAdminUpdate, authAdminFind, mensajeErrorAuth } from "../../lib/authAdmin";
import { apoderadoEnCurso, opcionesCursoApoderados } from "../../lib/apoderados";

import { sendPush, getUserIdsByCurso, getUserIdsParaAlerta } from "../../lib/push";
import { Comedor } from "../comedor";
import { Contacto, ApoderadosModal } from "../contacto";
import { CambiarPasswordModal } from "../auth";
import { useCargar } from "../../hooks/useCargar";
import { textoPlano } from "../../lib/formato";
import { EditorFormato } from "../../components/EditorFormato";

// Selector de curso(s) en lista, no chips — con muchos cursos, los chips que
// wrappean se vuelven enormes e inmanejables. Único lugar para este patrón
// (antes copy-pasteado en Comunicaciones/Maestros/Alertas/Horarios/Uniformes
// por separado): `multi` decide checkbox (varios) vs. radio (uno solo).
// Navegación en pocas secciones con pestañas internas (rediseño sobrio
// 2026-10-22, mismo criterio que las 4 secciones del apoderado): cada
// pantalla sigue siendo su propio `sec`; la sección solo agrupa. Íconos de
// línea (Icono). Mismo agrupamiento en mobile (mobile/features/superadmin).
const SECCIONES = [
  { id:"g_inicio", l:"Inicio", icono:"hoy", items: [
    {id:"inicio",l:"Inicio"},
  ]},
  { id:"g_comunicacion", l:"Comunicación", icono:"comunicaciones", items: [
    {id:"comunicaciones",l:"Comunicados"},
    {id:"alertas",l:"Alertas"},
    {id:"eventos",l:"Eventos"},
    {id:"autorizaciones",l:"Autorizaciones"},
    {id:"fotos",l:"Fotos escolares"},
  ]},
  { id:"g_mensajes", l:"Mensajes", icono:"mensaje", items: [
    {id:"mensajes_familias",l:"De familias",soloColegioAdmin:true},
    {id:"mensajes_personal",l:"Del personal",soloColegioAdmin:true},
    {id:"salidas",l:"Cambios en la salida"},
  ]},
  { id:"g_personas", l:"Personas", icono:"usuarios", items: [
    {id:"usuarios",l:"Apoderados"},
    {id:"alumnos",l:"Alumnos"},
  ]},
  { id:"g_comunidad", l:"Comunidad", icono:"corazon", items: [
    {id:"talleres",l:"Talleres"},
    {id:"marketplace",l:"Marketplace"},
    {id:"perdidos",l:"Lost & Found"},
    {id:"denuncias",l:"Denuncias"},
  ]},
  // Modo simple (2026-10-27): lo que se arma una vez o pocas veces por año
  // va aparte, abajo de la barra, separado del día a día.
  { id:"g_config", l:"Configuración", icono:"ajustes", config:true, items: [
    {id:"importar",l:"Importar datos"},
    {id:"cursos",l:"Cursos"},
    {id:"horarios",l:"Horarios"},
    {id:"materias",l:"Materias"},
    {id:"maestros",l:"Maestros"},
    {id:"directivos",l:"Directivos"},
    {id:"menu",l:"Menú"},
    {id:"uniformes",l:"Uniformes"},
    {id:"colegio",l:"Datos y membrete"},
    {id:"adopcion",l:"Adopción"},
    // Última: se usa una vez por año, al pasar a los alumnos al año siguiente.
    {id:"promocion",l:"Promoción"},
  ]},
];

// Botón "+ Crear" único (modo simple): lo que más se crea, sin tener que
// saber en qué sección está. `abre`: el formulario se abre solo al llegar.
const OPCIONES_CREAR = [
  { id:"comunicado", l:"Comunicado", d:"A uno o varios cursos, o a todo el colegio", sec:"comunicaciones", icono:"comunicaciones" },
  { id:"evento", l:"Evento", d:"En el calendario de uno o varios cursos", sec:"eventos", icono:"agenda", abre:true },
  { id:"autorizacion", l:"Autorización", d:"Pedir permiso para una salida o actividad", sec:"autorizaciones", icono:"firma", abre:true },
  { id:"alerta", l:"Alerta", d:"Aviso urgente con notificación", sec:"alertas", icono:"alerta" },
  { id:"alumno", l:"Alumno", d:"Sumar un alumno a un curso", sec:"alumnos", icono:"usuarios", abre:true },
  { id:"apoderado", l:"Apoderado", d:"Crear la cuenta de una familia", sec:"usuarios", icono:"usuarios", abre:true },
];

// Globito rojo de no leídos (mismo que la barra lateral del apoderado).
function Globito({ n }) {
  return n > 0 ? <span style={{background:"#EF4444",color:"white",borderRadius:20,fontSize:10,fontWeight:700,padding:"1px 6px",minWidth:18,textAlign:"center",lineHeight:"16px",boxSizing:"border-box",flexShrink:0}}>{n>99?"99+":n}</span> : null;
}

// Lo que es de todo el colegio: la Secretaría (por nivel) no lo ve. Ver
// specs/roles-por-nivel.md → Permisos.
// Materias no: la Secretaría administra las de sus niveles (materias-por-nivel.sql).
const SOLO_ADMIN_COLEGIO = new Set(["directivos","maestros","cursos","promocion","uniformes","marketplace","perdidos","denuncias","colegio","menu"]);

// Solo para rol "super" (plataforma) — antepuesto a SECCIONES, nunca visible
// para colegio_admin. Ver specs/multi-colegio.md.
const SECCION_PLATAFORMA = { id:"g_plataforma", l:"Plataforma", icono:"globo", items: [ {id:"colegios",l:"Colegios"}, {id:"soporte",l:"Soporte"}, {id:"super_admins",l:"Super Admins"} ] };

// Header contextual por módulo (handoff Tribbu Admin): eyebrow (grupo) +
// título + descripción de qué gestiona la pantalla — reemplaza el título
// fijo "Panel Super Admin" que no cambiaba entre módulos.
const SECCION_INFO = {
  usuarios:       { titulo:"Apoderados", descripcion:"Apoderados y Room Parents de este colegio. El rol de Room Parent es por curso: una misma persona puede ser apoderada en 4°B y Room Parent en 6°A. Los administradores y las Secretarías se gestionan en Directivos." },
  maestros:       { titulo:"Maestros", descripcion:"Los docentes del colegio, con la materia que dictan y los cursos donde dan clase." },
  alumnos:        { titulo:"Alumnos", descripcion:"Los chicos matriculados, agrupados por curso, con sus apoderados vinculados." },
  cursos:         { titulo:"Cursos", descripcion:"Los cursos del colegio, uno por año lectivo — duplicá acá un curso para armar el año que viene." },
  promocion:      { titulo:"Promoción de curso", descripcion:"Pasá a los alumnos de un curso al año lectivo siguiente, revisando quién no se promueve." },
  materias:       { titulo:"Materias", descripcion:"La lista de materias del colegio. Las clases de cada curso (y su horario) se arman eligiendo de acá." },
  horarios:       { titulo:"Horarios", descripcion:"El horario de clases de cada curso, el mismo que ven las familias en Agenda → Horario. Podés exportarlo o cargar muchos cursos de una vez desde Excel." },
  uniformes:      { titulo:"Uniformes", descripcion:"Las prendas del uniforme por categoría, vinculadas a los cursos que las usan." },
  alertas:        { titulo:"Alertas", descripcion:"Avisos urgentes por curso, con notificación push a todas las familias alcanzadas." },
  comunicaciones: { titulo:"Comunicados", descripcion:"Un mismo mensaje publicado en varios cursos a la vez, con push opcional." },
  eventos:        { titulo:"Eventos", descripcion:"Los eventos del calendario de cada curso (actos, paseos, salidas…) con quién los creó: corregí o borrá lo que haga falta, o creá uno nuevo para uno o varios cursos." },
  talleres:       { titulo:"Talleres", descripcion:"Talleres extraprogramáticos: publicalos para los cursos o edades que elijas, decidí cómo se asignan los lugares (orden de llegada, aprobación o sorteo) y gestioná inscriptos y lista de espera." },
  marketplace:    { titulo:"Marketplace", descripcion:"Lo que las familias venden o regalan (uniformes, libros, disfraces…). El colegio lo ve para controlar lo que se ofrece y puede quitar lo que no corresponda; no publica ni se interesa. Las familias se escriben por Mensajes, sin compartir teléfono ni mail." },
  perdidos:       { titulo:"Lost & Found", descripcion:"Publicá lo que tiene el colegio en su caja de objetos perdidos y moderá lo que publican las familias (se ve por curso o en todo el colegio, y vence a los 30 días)." },
  autorizaciones: { titulo:"Autorizaciones", descripcion:"Pedí permiso para salidas y actividades a uno o varios cursos: cada familia responde por hijo si autoriza, quién lo retira y un comentario." },
  salidas:        { titulo:"Cambios en la salida", descripcion:"Los avisos de las familias cuando un alumno se retira distinto a lo habitual (otro horario o con otra persona), con un globito mientras haya alguno sin ver. Marcalos como vistos: la familia lo ve en su pantalla. Las docentes del curso también los ven." },
  mensajes_familias:{ titulo:"Mensajes de familias", descripcion:"Lo que las familias le escriben a Secretaría (respondés como “Secretaría”) y, en solo lectura, sus chats con las maestras." },
  mensajes_personal:{ titulo:"Mensajes del personal", descripcion:"Chats con las maestras, las Secretarías y Dirección del colegio, 1 a 1 o en grupo. Las familias no los ven." },
  denuncias:      { titulo:"Denuncias de Mensajes", descripcion:"Mensajes que una familia denunció en el chat. Ves solo el mensaje denunciado, nunca el resto de la conversación." },
  soporte:        { titulo:"Soporte", descripcion:"Las consultas que mandan los usuarios desde “Ayuda y soporte”. Respondés como “Soporte tribbu”." },
  soporte_colegio:{ titulo:"Ayuda y soporte", descripcion:"Cómo hacer lo básico en el panel. Si algo no funciona o no encontrás tu duda, escribile al equipo de tribbu." },
  cuenta:         { titulo:"Mi cuenta", descripcion:"" },
  importar:       { titulo:"Importar datos", descripcion:"Las cargas masivas desde Excel en un solo lugar: alumnos y familias, horarios y menú." },
  configuracion:  { titulo:"Configuración", descripcion:"Lo que se arma una vez o pocas veces por año. Tocá una tarjeta para entrar." },
  adopcion:       { titulo:"Adopción", descripcion:"Cuántas familias de cada curso tienen la app (les llegan las notificaciones), sincronizaron el calendario y entraron en el último mes." },
  directivos:     { titulo:"Directivos", descripcion:"Quién administra el colegio: los administradores (todo el colegio), los niveles que tiene y los directivos por nivel (Dirección, Secretaría, Coordinación…), que gestionan solo los cursos de sus niveles." },
  colegio:        { titulo:"Datos y membrete", descripcion:"Los datos de contacto del colegio, los contactos internos (secretaría, preceptoría, etc.) y el membrete de los comunicados." },
  menu:           { titulo:"Menú del comedor", descripcion:"El menú del comedor, cargado desde un Excel mensual." },
  colegios:       { titulo:"Colegios", descripcion:"Cada colegio que usa tribbu, con su propio administrador — vos entrás a cualquiera para gestionarlo." },
  super_admins:   { titulo:"Super Admins", descripcion:"Las cuentas con acceso total a la plataforma — ven y gestionan todos los colegios sin restricción. Usalo con cuidado." },
};

// Números de cada pantalla (Apoderados, Maestros, Alertas…): una sola
// tarjeta neutra con separadores, como "El colegio en números" del Inicio.
// El color de cada número (`c`) ya no se usa: el panel es sobrio.
function ModuloStats({ items }) {
  return (
    <div style={{display:"flex",flexWrap:"wrap",background:"white",border:"1px solid #E2E8F0",borderRadius:16,overflow:"hidden",marginBottom:16}}>
      {/* Separadores con borde y margen -1: al partirse en dos filas, la última se estira (sin huecos). */}
      {items.map((s,i)=>(
        <div key={i} style={{flex:"1 1 120px",padding:"12px 16px",borderLeft:"1px solid #F1F5F9",borderTop:"1px solid #F1F5F9",marginLeft:-1,marginTop:-1}}>
          <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{s.l}</div>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:4}}>
            <span style={{fontSize:22,fontWeight:800,color:"#0F172A",lineHeight:1.1}}>{s.n}</span>
            {s.sub ? <span style={{fontSize:12,color:"#64748B"}}>{s.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

// Ayuda y soporte del colegio: preguntas frecuentes del panel (las de la
// Secretaría sin lo que es solo del administrador, @shared/ayuda) y, desde
// ahí, el chat con el equipo de tribbu. Con una respuesta sin leer entra
// directo al chat.
function AyudaColegio({ rol, conChat, onIr, chat }) {
  const [verChat, setVerChat] = useState(conChat);
  if (!verChat) return <Ayuda lista={preguntasPara(rol)} destino="panel" sinTitulo onIr={onIr} onSoporte={()=>setVerChat(true)}/>;
  return (
    <div>
      <button onClick={()=>setVerChat(false)} style={{display:"inline-flex",alignItems:"center",gap:2,border:"none",background:"none",padding:0,marginBottom:10,cursor:"pointer",fontFamily:"inherit"}}>
        <Icono nombre="atras" size={17} color="#2563EB"/><span style={{fontSize:14,fontWeight:700,color:"#2563EB"}}>Preguntas frecuentes</span>
      </button>
      {chat}
    </div>
  );
}

// Color de avatar para un alumno nuevo sin color elegido (fuera del componente:
// Math.random no puede correr durante el render).
const COLORES_AVATAR = ["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899"];
const colorAvatarAlAzar = () => COLORES_AVATAR[Math.floor(Math.random()*COLORES_AVATAR.length)];

export function SuperAdmin({ usuario, onCerrarSesion }) {
  // Multi-colegio: super es plataforma (sin colegio_id, ve/gestiona todos);
  // colegio_admin queda acotado al suyo por RLS en cada query de abajo —
  // ninguna de ellas necesita agregar un filtro de colegio_id a mano.
  const esSuper = usuario?.rol==="super";
  const esColegioAdmin = usuario?.rol==="colegio_admin";
  // Secretaría (nivel_admin, specs/roles-por-nivel.md): el mismo panel, pero
  // RLS la acota a los cursos de sus niveles y no ve lo que es de todo el
  // colegio (SOLO_ADMIN_COLEGIO).
  const esSecretaria = usuario?.rol==="nivel_admin";
  const esStaffColegio = esColegioAdmin || esSecretaria;
  const miColegioId = usuario?.colegio_id ?? null;
  // colegio "activo": el fijo del colegio_admin, o el que el super entró en
  // "Colegios". Necesario para insertar filas con colegio_id NOT NULL (cursos).
  const [sec,setSec]           = useState(esSuper?"colegios":"inicio");
  const [navAbierta,setNavAbierta] = useState(false); // mobile: lista de secciones plegada
  const [menuCrear,setMenuCrear] = useState(false);   // botón "+ Crear"
  const [crear,setCrear]         = useState(null);    // { tipo, n }: formulario a abrir al llegar a la sección
  const [colegioId,setColegioId] = useState(null);
  const [colegioNombre,setColegioNombre] = useState("");
  const [colegioNiveles,setColegioNiveles] = useState([]); // niveles que tiene el colegio (roles-por-nivel)
  const [membrete,setMembrete] = useState({ linea:"", firma:"", niveles:{} }); // comunicados-con-formato
  const [colegios,setColegios]           = useState([]);
  const [modalColegio,setModalColegio]   = useState(null);
  const [savingColegio,setSavingColegio] = useState(false);
  // Cuentas "especiales" (super de plataforma / colegio_admin de este
  // colegio) — se gestionan fuera de Usuarios (ver 👑 Super Admins y el
  // bloque "Administradores" dentro de 🏫 Colegio), no mezcladas con
  // apoderados/Room Parents. superAdmins sale de u.data sin el filtro por
  // colegio de cargar() (super no tiene colegio_id) — ver cargar() abajo.
  const [superAdmins,setSuperAdmins]     = useState([]);
  const [modalSuper,setModalSuper]       = useState(null);
  const [formSuper,setFormSuper]         = useState({});
  const [modalAdmin,setModalAdmin]       = useState(null);
  const [formAdmin,setFormAdmin]         = useState({});
  const [cambiarPass,setCambiarPass] = useState(false);
  const [usuarios,setUsuarios] = useState([]);
  const [cursos,setCursos]     = useState([]);
  const [hijos,setHijos]       = useState([]);
  const [loading,setLoading]   = useState(true);
  const [modal,setModal]       = useState(null);
  const [form,setForm]         = useState({});
  const [confirm,setConfirm]   = useState(null);
  const [maestros,setMaestros] = useState([]);
  const [alumnos,setAlumnos]   = useState([]);
  const [verApodSA,setVerApodSA]     = useState(null);
  const [fichaAlumno,setFichaAlumno] = useState(null); // alumno con la ficha abierta
  const [authSyncMsg,setAuthSyncMsg] = useState(null);
  const [anoActual,setAnoActual]     = useState(new Date().getFullYear());
  const [anoCursosSel,setAnoCursosSel] = useState(null);
  const [selUsuarios,setSelUsuarios]   = useState(new Set());
  const [asignarCursoModal,setAsignarCursoModal] = useState(false);
  const isMobile = useIsMobile();
  const [confirmar, confirmUI] = useConfirmar();
  // Sin leer de Mensajes (familias / personal) y de Ayuda y soporte: solo el
  // staff del colegio los tiene. Se recalcula al cambiar de pantalla.
  const noLeidos = useNoLeidosPanel(esStaffColegio, sec);
  const { showToast, Toast } = useToast();

  const activeColegioId = esStaffColegio ? miColegioId : colegioId;

  // Evita el doble-submit: deshabilita el botón mientras corre el guardado.
  const [guardando,setGuardando] = useState(false);
  const conGuardando = (fn) => async (...args) => {
    if(guardando) return;
    setGuardando(true);
    try { await fn(...args); } finally { setGuardando(false); }
  };

  // super y colegio_admin se gestionan aparte (👑 Super Admins / 🏫 Colegio →
  // Administradores) — esta lista es solo apoderado/Room Parent de este colegio.
  // Las docentes se manejan desde Maestros → "Acceso a Mensajes", no acá.
  const usuariosNormales = usuarios.filter(u=>u.rol!=="super"&&u.rol!=="colegio_admin"&&u.rol!=="nivel_admin"&&u.rol!=="docente");
  const ctrlUsuarios = useListControls(usuariosNormales, {
    searchFn: (u,q)=> u.nombre.toLowerCase().includes(q)||u.email.toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre", label:"Nombre", val:u=>u.nombre},
      {key:"rol",    label:"Rol",    val:u=>u.rol},
      {key:"id",     label:"Más reciente", val:u=>u.id},
    ],
    filterOptions: [
      {key:"rol", label:"Rol", options:[{value:"padre",label:"Apoderado"},{value:"room",label:"Room Parent"}], match:(u,v)=>u.rol===v},
      {key:"activo", label:"Estado", options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}], match:(u,v)=>v==="si"?u.activo:!u.activo},
      {key:"curso", label:"Curso", options:[], match:(u,v)=>apoderadoEnCurso(u,v,hijos)},
    ],
    pageSize:12,
  });

  // Selectores de curso fuera de "Cursos" solo muestran el año lectivo vigente
  // — evita acumular años viejos en cada picker (Maestros/Alumnos/Alertas/
  // Horarios/Comunicaciones/Uniformes/Códigos). La pantalla "Cursos" en sí
  // usa `cursosParaListado`, que respeta su propio selector de año.
  const cursosAnoActual = cursos.filter(c=>c.año_lectivo===anoActual);
  const añosDisponibles = [...new Set(cursos.map(c=>c.año_lectivo))].sort((a,b)=>b-a);
  const anoCursosMostrado = anoCursosSel ?? anoActual;
  const cursosParaListado = cursos.filter(c=>c.año_lectivo===anoCursosMostrado);

  const ctrlCursos = useListControls(cursosParaListado, {
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

  const ctrlMaestros = useListControls(maestros, {
    searchFn: (m,q)=> fmtNombre(m).toLowerCase().includes(q)||(m.materia||"").toLowerCase().includes(q),
    sortOptions: [
      {key:"nombre",  label:"Nombre",   val:m=>fmtNombre(m)},
      {key:"materia", label:"Materia",  val:m=>m.materia||""},
    ],
    filterOptions: [
      {key:"activo", label:"Estado", options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}], match:(m,v)=>v==="si"?m.activo:!m.activo},
    ],
    pageSize:12,
  });

  // colegio_admin: fijo a su propio colegio. super: el que haya elegido en
  // "Colegios" (null hasta que elija uno — no hay nada más que mostrar).
  if(esStaffColegio && colegioId!==miColegioId) setColegioId(miColegioId); // ajuste durante el render


  const cargar = useCallback(async () => {
    setLoading(true);
    const [u,c,h,m,mc,col,cols] = await Promise.all([
      supabase.from("usuarios").select("*, usuario_hijos(hijo_id), usuario_cursos(curso_id, rol)").order("id"),
      supabase.from("cursos").select("*").order("nombre"),
      supabase.from("hijos").select("*").order("id"),
      supabase.from("maestros").select("*").order("id"),
      supabase.from("maestro_cursos").select("*"),
      activeColegioId
        ? supabase.from("colegios").select("id,año_lectivo_actual,nombre,niveles,membrete_linea,membrete_firma,membrete_niveles").eq("id",activeColegioId).single()
        : Promise.resolve({data:null}),
      esSuper ? supabase.from("colegios").select("*").order("creado_en") : Promise.resolve({data:[]}),
    ]);
    setColegios(cols.data||[]);
    if(esSuper) setSuperAdmins((u.data||[]).filter(x=>x.rol==="super"));
    // RLS ya acota todo lo de arriba para colegio_admin (su colegio_id) — este
    // filtro client-side solo importa para super, que ve TODOS los colegios
    // sin restricción y necesita elegir uno para que las pantallas de abajo
    // (Usuarios/Cursos/Alumnos/Maestros/...) muestren solo el suyo. Sin
    // colegio elegido, super ve la pantalla "Colegios" y estas listas quedan
    // vacías (no hay "colegio activo" del que mostrar nada todavía).
    const cursosDelColegio = activeColegioId ? (c.data||[]).filter(x=>x.colegio_id===activeColegioId) : (esSuper?[]:(c.data||[]));
    const cursoIdsSet = new Set(cursosDelColegio.map(x=>x.id));
    const hijosDelColegio = activeColegioId ? (h.data||[]).filter(x=>cursoIdsSet.has(x.curso_id)) : (esSuper?[]:(h.data||[]));
    const hijoIdsSet = new Set(hijosDelColegio.map(x=>x.id));
    const usuariosFiltrados = activeColegioId
      ? (u.data||[]).filter(x=>
          x.colegio_id===activeColegioId
          || x.usuario_cursos.some(r=>cursoIdsSet.has(r.curso_id))
          || x.usuario_hijos.some(r=>hijoIdsSet.has(r.hijo_id))
        )
      : (esSuper?[]:(u.data||[]));
    setUsuarios(usuariosFiltrados.map(u=>({...u,hijos:u.usuario_hijos.map(r=>r.hijo_id),cursos:u.usuario_cursos.map(r=>r.curso_id),cursosAdmin:u.usuario_cursos.filter(r=>r.rol==="room").map(r=>r.curso_id),usuarioCursos:u.usuario_cursos})));
    setCursos(cursosDelColegio);
    setHijos(hijosDelColegio);
    if(col.data?.año_lectivo_actual) setAnoActual(col.data.año_lectivo_actual);
    setColegioNombre(col.data?.nombre||"");
    setColegioNiveles(ordenarNiveles(col.data?.niveles));
    setMembrete({ linea:col.data?.membrete_linea||"", firma:col.data?.membrete_firma||"", niveles:col.data?.membrete_niveles||{} });
    const mcData = activeColegioId ? (mc.data||[]).filter(r=>cursoIdsSet.has(r.curso_id)) : (esSuper?[]:(mc.data||[]));
    const maestroIdsDelColegio = new Set(mcData.map(r=>r.maestro_id));
    const maestrosDelColegio = activeColegioId ? (m.data||[]).filter(x=>maestroIdsDelColegio.has(x.id)) : (esSuper?[]:(m.data||[]));
    setMaestros(maestrosDelColegio.map(x=>({...x, cursos: mcData.filter(r=>r.maestro_id===x.id).map(r=>r.curso_id)})));
    if(activeColegioId || !esSuper) {
      const al = await supabase.from("hijos").select("*, usuarios:usuario_hijos(usuario_id, usuarios(id,nombre,apellido,email,telefono))").order("nombre");
      setAlumnos(activeColegioId ? (al.data||[]).filter(x=>cursoIdsSet.has(x.curso_id)) : (al.data||[]));
    } else {
      setAlumnos([]);
    }
    setLoading(false);
  }, [activeColegioId, esSuper]);;
  useCargar(cargar);

  // Alta de un colegio nuevo — solo super (ver specs/multi-colegio.md).
  // Crea la fila en colegios y, si se cargaron los datos del primer admin,
  // su cuenta rol="colegio_admin" acotada a ese colegio_id (mismo patrón de
  // Auth + fila usuarios que ya usa guardarUsuario más abajo).
  const guardarColegioNuevo = async () => {
    if(!form.nombre?.trim()) { showToast("Falta el nombre del colegio","error"); return; }
    setSavingColegio(true);
    const { data: nuevoColegio, error: errCol } = await supabase.from("colegios").insert({
      nombre: sanitize(form.nombre),
      año_lectivo_actual: Number(form.año_lectivo_actual)||new Date().getFullYear(),
    }).select().single();
    if(errCol||!nuevoColegio) { showToast("Error al crear el colegio","error"); setSavingColegio(false); return; }

    if(form.adminEmail?.trim() && form.adminPass?.trim()) {
      try {
        const { auth_id } = await authAdminCreate(sanitize(form.adminEmail).toLowerCase(), form.adminPass);
        if(auth_id) {
          const apellido = form.adminApellido||"";
          const avatar = (`${(form.adminNombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||"CA";
          await supabase.from("usuarios").insert({
            nombre: sanitize(form.adminNombre)||"Admin",
            apellido: sanitize(form.adminApellido)||null,
            email: sanitize(form.adminEmail).toLowerCase(),
            rol: "colegio_admin",
            colegio_id: nuevoColegio.id,
            avatar, activo: true, auth_id,
          });
        }
      } catch(e) {
        console.error("Error creando colegio_admin:", e);
        showToast("Colegio creado, pero falló el alta del administrador — creálo a mano desde Apoderados.", "error");
      }
    }
    setSavingColegio(false); setModalColegio(null);
    showToast(`Colegio "${nuevoColegio.nombre}" creado`,"ok");
    cargar();
  };

  const guardarUsuario = async () => {
    if(!form.nombre||!form.email) return;
    // Al crear nuevo usuario, la contraseña es obligatoria
    if(modal==="nuevo_usuario" && !form.pass) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    // super y colegio_admin ya no se dan de alta acá — ver "👑 Super Admins"
    // y el bloque "Administradores" dentro de "🏫 Colegio" (guardarCuentaEspecial).
    // Esta pantalla solo maneja apoderado/Room Parent de este colegio.
    // Room Parent solo vale en cursos donde el apoderado tiene un hijo: si
    // form.cursosAdmin arrastró un curso sin hijo (asignación huérfana de una
    // promoción/reorganización, invisible en el modal porque no se renderiza
    // toggle para ella), se descarta acá — si no, el delete+reinsert de abajo
    // la volvía a crear y no había forma de sacarla desde el panel.
    const cursosConHijoDelForm = new Set((form.hijos||[]).map(hid=>hijos.find(h=>h.id===hid)?.curso_id).filter(Boolean));
    const cursosAdminLimpio = (form.cursosAdmin||[]).filter(cid=>cursosConHijoDelForm.has(cid));
    const rolGlobal = cursosAdminLimpio.length>0 ? "room" : "padre";

    if(modal==="nuevo_usuario") {
      // Crear en Supabase Auth via Edge Function (sin exponer service key al cliente)
      let auth_id = null;
      try {
        const { auth_id: newId } = await authAdminCreate(
          sanitize(form.email).toLowerCase(),
          form.pass
        );
        auth_id = newId || null;
      } catch(e) {
        console.error("Error creando en Auth:", e);
        showToast(`No se pudo crear el acceso: ${mensajeErrorAuth(e)}`, "error");
        return;
      }
      // id generado en el cliente: un colegio_admin no puede leer de vuelta el
      // usuario recién insertado (RLS lo ve solo vía usuario_cursos/usuario_hijos,
      // que todavía no existen) — con .select().single() el alta "no hacía nada".
      const id = uuidLite();
      const { error } = await supabase.from("usuarios").insert({
        id,
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: sanitize(form.email).toLowerCase(), rol: rolGlobal,
        avatar, activo: form.activo, dni: sanitize(form.dni)||null,
        telefono: sanitize(form.telefono)||null, auth_id,
      });
      if(error) { showToast(`Error al crear el apoderado: ${error.message}`, "error"); return; }
      if(cursosAdminLimpio.length) {
        const { error: e2 } = await supabase.from("usuario_cursos").insert(cursosAdminLimpio.map(cid=>({usuario_id:id,curso_id:cid,rol:"room"})));
        if(e2) showToast(`Apoderado creado, pero falló asignar Room Parent: ${e2.message}`, "error");
      }
      if((form.hijos||[]).length) {
        const { error: e3 } = await supabase.from("usuario_hijos").insert((form.hijos||[]).map(hid=>({usuario_id:id,hijo_id:hid})));
        if(e3) showToast(`Apoderado creado, pero falló vincular los hijos: ${e3.message}`, "error");
      }
    } else {
      const passNueva = form._passNueva && form._passNueva.trim();
      const passEsNueva = !!passNueva;
      const emailNuevo = sanitize(form.email).toLowerCase();
      // Actualizar datos del usuario (sin columna pass)
      const { error: errUpd } = await supabase.from("usuarios").update({
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: emailNuevo, rol: rolGlobal, activo: form.activo,
        dni: sanitize(form.dni)||null, telefono: sanitize(form.telefono)||null,
      }).eq("id", form.id);
      if(errUpd) { showToast(`Error al guardar los cambios: ${errUpd.message}`, "error"); return; }
      // Sincronizar email y/o clave en Supabase Auth via Edge Function.
      // Sin _emailOriginal no se puede saber si cambió — no dispares el sync
      // de Auth (antes eso hacía "fallar" un simple cambio de teléfono).
      // sanitize() en ambos lados: un email guardado con espacios/mayúsculas
      // (arrastre de la migración vieja) comparado "crudo" contra el nuevo
      // (ya sanitizado) daba emailCambio=true de pura casualidad de formato —
      // eso mandaba un email "nuevo" a Auth aunque el admin no tocó el campo,
      // disparando el chequeo real de unicidad de Auth (y sus propios errores)
      // en un simple cambio de contraseña.
      const emailCambio = !!form._emailOriginal && emailNuevo !== sanitize(form._emailOriginal).toLowerCase();
      if(passEsNueva || emailCambio) {
        try {
          let authId = form.auth_id;
          let creado = false;
          if(!authId) {
            // Buscar auth_id por email via Edge Function
            const found = await authAdminFind(form._emailOriginal||form.email);
            authId = found.auth_id || null;
            if(authId) await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
          }
          if(!authId && passEsNueva) {
            // De verdad no tiene cuenta de Auth (típico: la carga por Excel la
            // creó pero falló en silencio — ver UploadApoderadosExcel) — sin
            // esto, "asignar clave para el primer acceso" quedaba en un
            // callejón sin salida ("No se encontró el usuario en Auth") en vez
            // de simplemente crear la cuenta que nunca se creó.
            try {
              const { auth_id: nuevoId } = await authAdminCreate(emailNuevo, passNueva);
              if(nuevoId) {
                authId = nuevoId;
                creado = true;
                await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
              }
            } catch(eCrear) { setAuthSyncMsg({ ok:false, msg:`No se encontró el usuario en Auth y no se pudo crear: ${eCrear.message}` }); return; }
          }
          if(!authId) {
            setAuthSyncMsg({ ok:false, msg:`No se encontró el usuario en Supabase Auth.` });
          } else if(creado) {
            setAuthSyncMsg({ ok:true, msg:`No tenía cuenta de Auth — se creó una nueva con la contraseña para ${emailNuevo}.` });
          } else {
            // current_email: si el auth_id de arriba quedó apuntando a una
            // cuenta borrada/inexistente (resto de la migración bcrypt→Auth o
            // un borrado manual en el dashboard), la Edge Function reubica la
            // cuenta por email o, si de verdad no existe, la recrea con la
            // clave nueva — antes esto fallaba con "User not found" sin forma
            // de repararlo desde acá.
            const { auth_id_reparado } = await authAdminUpdate(authId, {
              ...(emailCambio ? { email: emailNuevo } : {}),
              ...(passEsNueva ? { password: passNueva } : {}),
              current_email: form._emailOriginal||form.email,
            });
            if(auth_id_reparado && auth_id_reparado!==authId) {
              await supabase.from("usuarios").update({ auth_id: auth_id_reparado }).eq("id", form.id);
            }
            const reparadoTxt = auth_id_reparado ? " (se reparó el vínculo con Auth, que estaba roto)" : "";
            setAuthSyncMsg({ ok:true, msg:`${[emailCambio?"Email":"",passEsNueva?"Clave":""].filter(Boolean).join(" y ")} actualizado en Auth para ${emailNuevo}${reparadoTxt}.` });
          }
        } catch(e) { setAuthSyncMsg({ ok:false, msg:`Error: ${e.message}` }); }
      }
      // Re-sincronizar solo las filas admin: las filas rol "padre" (creadas por
      // crear_apoderado en el registro) no se tocan — borrarlas dejaba al
      // apoderado sin membresía de curso. El delete de todas las filas "room"
      // + reinsert de cursosAdminLimpio (ya sin cursos huérfanos) también sirve
      // de auto-limpieza: guardar un apoderado con una asignación Room Parent
      // vieja de un curso donde ya no tiene hijo la elimina.
      await supabase.from("usuario_cursos").delete().eq("usuario_id",form.id).eq("rol","room");
      await supabase.from("usuario_hijos").delete().eq("usuario_id",form.id);
      if(cursosAdminLimpio.length) {
        const { error: e2 } = await supabase.from("usuario_cursos").insert(cursosAdminLimpio.map(cid=>({usuario_id:form.id,curso_id:cid,rol:"room"})));
        if(e2) showToast(`Cambios guardados, pero falló asignar Room Parent: ${e2.message}`, "error");
      }
      if((form.hijos||[]).length) {
        const { error: e3 } = await supabase.from("usuario_hijos").insert((form.hijos||[]).map(hid=>({usuario_id:form.id,hijo_id:hid})));
        if(e3) showToast(`Cambios guardados, pero falló vincular los hijos: ${e3.message}`, "error");
      }
    }
    setModal(null); cargar();
  };

  // Alta/edición de una cuenta "especial" (super de plataforma o colegio_admin
  // de un colegio puntual) — comparte la lógica de Auth + tabla usuarios con
  // guardarUsuario de arriba, pero sin cursos/hijos (no aplica a ninguna de
  // las dos) y con rol/colegio_id fijos según quién la llama. Usado por
  // "👑 Super Admins" (rolFijo="super", colegioIdFijo=null) y el bloque
  // "Administradores" dentro de "🏫 Colegio" (rolFijo="colegio_admin",
  // colegioIdFijo=colegioId entrado). Solo super puede crear/editar estas
  // cuentas (RLS lo exige del lado servidor — ver usuarios_insert/update en
  // multi-colegio.sql — acá solo se oculta la UI para no ofrecer algo que
  // fallaría).
  const guardarCuentaEspecial = async (rolFijo, colegioIdFijo, esNuevo, form, setForm, cerrarModal) => {
    if(!form.nombre||!form.email) return;
    if(esNuevo && !form.pass) return;
    const apellido = form.apellido||"";
    const avatar = (`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||(rolFijo==="super"?"SA":"CA");
    if(esNuevo) {
      let auth_id = null;
      try {
        const { auth_id: newId } = await authAdminCreate(sanitize(form.email).toLowerCase(), form.pass);
        auth_id = newId || null;
      } catch(e) { console.error("Error creando en Auth:", e); showToast(`No se pudo crear la cuenta: ${mensajeErrorAuth(e)}`,"error"); return; }
      const { error } = await supabase.from("usuarios").insert({
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: sanitize(form.email).toLowerCase(), rol: rolFijo, colegio_id: colegioIdFijo,
        avatar, activo: true, auth_id,
        ...(rolFijo==="nivel_admin"?{niveles:ordenarNiveles(form.niveles),cargo:sanitize(form.cargo||"")||CARGO_DEFECTO}:{}),
      });
      if(error) { showToast(`No se pudo guardar la cuenta: ${error.message}`,"error"); return; }
    } else {
      const passNueva = form._passNueva && form._passNueva.trim();
      const emailNuevo = sanitize(form.email).toLowerCase();
      await supabase.from("usuarios").update({
        nombre: sanitize(form.nombre), apellido: sanitize(form.apellido)||null,
        email: emailNuevo, activo: form.activo,
        ...(rolFijo==="nivel_admin"?{niveles:ordenarNiveles(form.niveles),cargo:sanitize(form.cargo||"")||CARGO_DEFECTO}:{}),
      }).eq("id", form.id);
      const emailCambio = emailNuevo !== sanitize(form._emailOriginal||"").toLowerCase();
      if(passNueva || emailCambio) {
        try {
          let authId = form.auth_id;
          if(!authId) {
            const found = await authAdminFind(form._emailOriginal||form.email);
            authId = found.auth_id || null;
            if(authId) await supabase.from("usuarios").update({ auth_id: authId }).eq("id", form.id);
          }
          if(authId) {
            const { auth_id_reparado } = await authAdminUpdate(authId, {
              ...(emailCambio?{email:emailNuevo}:{}),
              ...(passNueva?{password:passNueva}:{}),
              current_email: form._emailOriginal||form.email,
            });
            if(auth_id_reparado && auth_id_reparado!==authId) {
              await supabase.from("usuarios").update({ auth_id: auth_id_reparado }).eq("id", form.id);
            }
          }
        } catch(e) { showToast(`⚠️ Error sincronizando Auth: ${e.message}`,"error"); }
      }
    }
    cerrarModal(); setForm({}); cargar();
  };

  // Clona la configuración estática de un curso (horarios, Room Parent, maestro,
  // uniformes/útiles/libros) a un curso nuevo — usado por "Duplicar para el año
  // siguiente". Los alumnos NO se copian acá: eso lo hace la Promoción de curso.
  const clonarConfiguracionCurso = async (origenId, destinoId) => {
    const withCurso = (rows) => (rows||[]).map(r=>({...r,curso_id:destinoId}));
    // Clases primero (el horario las referencia): ids nuevos generados acá
    // para remapear horarios.clase_id. maestro_cursos lo deriva la base.
    const { data: cls } = await supabase.from("clases").select("id,materia_id,maestro_id,optativa").eq("curso_id",origenId);
    const nuevaClase = Object.fromEntries((cls||[]).map(c=>[c.id, uuidLite()]));
    if(cls?.length) await supabase.from("clases").insert(cls.map(c=>({ id:nuevaClase[c.id], curso_id:destinoId, materia_id:c.materia_id, maestro_id:c.maestro_id, optativa:!!c.optativa })));
    const conClase = new Set((cls||[]).map(c=>c.maestro_id).filter(Boolean));
    const [hor,uc,mcTodos,unic,ut,lib] = await Promise.all([
      supabase.from("horarios").select("dia,hora_inicio,hora_fin,materia,docente,color,clase_id").eq("curso_id",origenId),
      supabase.from("usuario_cursos").select("usuario_id,rol").eq("curso_id",origenId),
      supabase.from("maestro_cursos").select("maestro_id").eq("curso_id",origenId),
      supabase.from("uniforme_cursos").select("uniforme_id").eq("curso_id",origenId),
      supabase.from("utiles").select("item,obligatorio,categoria,cantidad,comentario").eq("curso_id",origenId),
      supabase.from("libros").select("nombre,obligatorio,editorial,materia,imagen_url,url_descarga").eq("curso_id",origenId),
    ]);
    const mc = { data: (mcTodos.data||[]).filter(r=>!conClase.has(r.maestro_id)) }; // las con clase ya las creó el trigger
    const horNuevos = (hor.data||[]).map(h=>({ ...h, clase_id: h.clase_id ? nuevaClase[h.clase_id]||null : null }));
    await Promise.all([
      horNuevos.length  ? supabase.from("horarios").insert(withCurso(horNuevos))      : null,
      uc.data?.length   ? supabase.from("usuario_cursos").insert(withCurso(uc.data))  : null,
      mc.data?.length   ? supabase.from("maestro_cursos").insert(withCurso(mc.data))  : null,
      unic.data?.length ? supabase.from("uniforme_cursos").insert(withCurso(unic.data)): null,
      ut.data?.length   ? supabase.from("utiles").insert(withCurso(ut.data))          : null,
      lib.data?.length  ? supabase.from("libros").insert(withCurso(lib.data))         : null,
    ]);
  };

  const guardarCurso = async () => {
    if(!form.nombre||!form.año_lectivo) return;
    // cursos.colegio_id es NOT NULL — sin esto el insert falla siempre
    // ("Error al guardar el curso" sin más detalle).
    if(!activeColegioId) { showToast("Elegí un colegio primero", "error"); return; }
    const { data, error } = await supabase.from("cursos").insert({nombre:sanitize(form.nombre),avatar:form.avatar||"🏫",color:form.color||"#3B82F6",año_lectivo:form.año_lectivo,colegio_id:activeColegioId,nivel:form.nivel||(colegioNiveles.length===1?colegioNiveles[0]:null)}).select().single();
    if(error) { showToast(`Error al guardar el curso: ${error.message}`, "error"); return; }
    if(form._duplicarDeId && data) await clonarConfiguracionCurso(form._duplicarDeId, data.id);
    setModal(null); cargar();
  };

  const actualizarCurso = async () => {
    if(!form.nombre||!form.año_lectivo) return;
    const { error } = await supabase.from("cursos").update({nombre:sanitize(form.nombre),avatar:form.avatar,color:form.color,año_lectivo:form.año_lectivo,nivel:form.nivel||null}).eq("id",form.id);
    if(error) { showToast(`Error al actualizar el curso: ${error.message}`, "error"); return; }
    setModal(null); cargar();
  };

  const toggleActivo = async (u) => {
    const { error } = await supabase.from("usuarios").update({activo:!u.activo}).eq("id",u.id);
    if(error) { showToast("Error al cambiar el estado", "error"); return; }
    cargar();
  };

  const eliminarUsuario = async (id) => {
    // Las FKs a usuarios no tienen ON DELETE CASCADE — hay que limpiar a mano
    // todo lo que apunta al usuario (mismo set que la Edge Function
    // delete-account, + encuestas). Lo que es "historial del curso" se anula
    // en vez de borrarse. Nota: la fila de Supabase Auth NO se borra desde acá
    // (requiere service key) — queda como huérfana; para eso haría falta una
    // acción "delete" en manage-auth-user.
    for(const [tabla,col] of [
      ["push_tokens","usuario_id"], ["recordatorio_leidos","usuario_id"],
      ["evento_asistencia","usuario_id"], ["libro_adquirido","usuario_id"],
      ["util_adquirido","usuario_id"], ["uniforme_adquirido","usuario_id"],
      ["encuesta_votos","usuario_id"], ["recordatorios","para_usuario_id"],
      ["usuario_cursos","usuario_id"], ["usuario_hijos","usuario_id"],
    ]) {
      await supabase.from(tabla).delete().eq(col,id);
    }
    for(const [tabla,col] of [
      ["colecta_pagos","pagado_por"], ["colectas","responsable_id"],
      ["cumples","responsable_id"], ["encuestas","creado_por"],
    ]) {
      await supabase.from(tabla).update({[col]:null}).eq(col,id);
    }
    const { error } = await supabase.from("usuarios").delete().eq("id",id);
    if(error) {
      console.error("eliminarUsuario:", error);
      showToast(`No se pudo eliminar: ${error.details || error.message}`, "error");
      setConfirm(null); return;
    }
    setConfirm(null); cargar();
  };

  // Selección múltiple + acciones en lote (Parte 3 #3 del handoff): hoy toda
  // acción sobre usuarios es de a uno, con 300+ usuarios hace falta operar
  // sobre varios a la vez.
  const toggleSelUsuario = (id) => {
    setSelUsuarios(prev => {
      const next = new Set(prev);
      if(next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelTodosUsuarios = (idsVisibles) => {
    setSelUsuarios(prev => {
      const todosMarcados = idsVisibles.length>0 && idsVisibles.every(id=>prev.has(id));
      return todosMarcados ? new Set() : new Set(idsVisibles);
    });
  };
  // "Asignar a curso": agrega usuario_cursos (rol Room Parent) para cada
  // usuario seleccionado — la única acción en lote con un equivalente real
  // y bien definido en el modelo de datos hoy (no existe un "reenviar
  // invitación" por usuario: el alta es por código de curso, no por mail).
  const asignarCursoLote = async (cursoId) => {
    if(!cursoId || selUsuarios.size===0) return;
    // Insert (no upsert): no hay certeza de que exista una constraint única
    // sobre (usuario_id, curso_id) para apoyarse en onConflict, así que se
    // filtran del lado del cliente los que ya tienen fila para este curso
    // (con el `usuarioCursos` ya cargado en cada usuario).
    const rows = [...selUsuarios]
      .map(id=>usuarios.find(u=>u.id===id))
      .filter(u=>u && !(u.usuarioCursos||[]).some(r=>r.curso_id===cursoId))
      .map(u=>({usuario_id:u.id, curso_id:cursoId, rol:"room"}));
    if(rows.length===0) { showToast("Los apoderados seleccionados ya tienen ese curso asignado", "error"); return; }
    const { error } = await supabase.from("usuario_cursos").insert(rows);
    if(error) { showToast("Error al asignar el curso", "error"); return; }
    showToast(`${rows.length} usuario${rows.length!==1?"s":""} asignado${rows.length!==1?"s":""} como Room Parent`, "ok");
    setSelUsuarios(new Set());
    setAsignarCursoModal(false);
    cargar();
  };

  const eliminarCurso = async (id) => {
    // Borrar un curso con alumnos o contenido sería un cascade enorme y
    // frágil desde el cliente (cada alumno arrastra festejos/pagos/votos, y
    // RLS puede tapar algún delete a mitad de camino). El caso real de baja
    // es un duplicado recién creado que quedó vacío, así que: si el curso
    // tiene alumnos o contenido, se rechaza con un mensaje claro; si está
    // limpio, se borra junto con su config (lo que clona "Duplicar").
    // El contenido se cuenta en el servidor (contenido_de_curso): el colegio ya
    // no ve las colectas ni las encuestas de las familias (colectas-encuestas-privadas.sql).
    const [al,cont] = await Promise.all([
      supabase.from("hijos").select("id",{count:"exact",head:true}).eq("curso_id",id),
      supabase.rpc("contenido_de_curso",{p_curso:id}),
    ]);
    if(cont.error) { showToast(`No se pudo revisar el curso: ${cont.error.message}`,"error"); setConfirm(null); return; }
    const alumnos = al.count||0;
    const contenido = cont.data||0;
    if(alumnos>0 || contenido>0) {
      const partes = [alumnos>0?`${alumnos} alumno${alumnos!==1?"s":""}`:null, contenido>0?`${contenido} elemento${contenido!==1?"s":""} de contenido`:null].filter(Boolean).join(" y ");
      showToast(`No se puede borrar: el curso tiene ${partes}. Promové/movés los alumnos y archivá el contenido primero.`, "error");
      setConfirm(null); return;
    }
    for(const tabla of ["horarios","usuario_cursos","maestro_cursos","uniforme_cursos","utiles","libros","codigos_invitacion"]) {
      await supabase.from(tabla).delete().eq("curso_id",id);
    }
    const { error } = await supabase.from("cursos").delete().eq("id",id);
    if(error) {
      console.error("eliminarCurso:", error);
      showToast(`No se pudo eliminar: ${error.details || error.message}`, "error");
      setConfirm(null); return;
    }
    setConfirm(null); cargar();
  };

  const guardarMaestro = async () => {
    if(!form.nombre) return;
    const apellido = form.apellido||"";
    const avatar = form.avatar||(`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase()||form.nombre.slice(0,2).toUpperCase();
    let maestroId = form.id;
    if(modal==="nuevo_maestro") {
      // id generado en el cliente: un colegio_admin no puede leer de vuelta un
      // maestro recién insertado (RLS lo ve solo vía maestro_cursos, que todavía
      // no existe) — con .select().single() eso daba "Error al guardar el maestro".
      const id = uuidLite();
      maestroId = id;
      const { error } = await supabase.from("maestros").insert({id,nombre:sanitize(form.nombre),apellido:sanitize(form.apellido)||null,email:sanitize(form.email)||null,avatar,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null});
      if(error) { showToast(`Error al guardar el maestro: ${error.message}`, "error"); return; }
    } else {
      const { error } = await supabase.from("maestros").update({nombre:sanitize(form.nombre),apellido:sanitize(form.apellido)||null,email:sanitize(form.email)||null,activo:form.activo!==false,fecha_nacimiento:form.fecha_nacimiento||null}).eq("id",form.id);
      if(error) { showToast("Error al actualizar el maestro", "error"); return; }
    }
    // Clases (materia × curso). maestro_cursos y el texto de materia los
    // deriva la base. Solo se tocan las clases de los cursos del año vigente.
    const eClases = await guardarClasesMaestro(maestroId, form.clases||[], form._clasesOrig||[], cursosAnoActual.map(c=>c.id));
    if(eClases) { showToast(`Maestro guardado, pero falló guardar sus clases: ${eClases.message}`, "error"); return; }
    if(form.darAcceso && !form.usuario_id) {
      const ok = await crearAccesoDocente(maestroId);
      if(!ok) return;
    } else if(form.usuario_id && form.accesoPass?.trim()) {
      const ok = await cambiarPassDocente(form.usuario_id, form.accesoPass.trim());
      if(!ok) return;
    }
    setModal(null); cargar();
  };

  // ── Acceso a Mensajes para docentes (rol "docente", specs/mensajes.md) ──
  // Cuenta propia vinculada a la ficha (maestros.usuario_id): solo ve Mensajes
  // con las familias de sus cursos. Mismo flujo de alta que un apoderado.
  const crearAccesoDocente = async (maestroId) => {
    const email = sanitize(form.email||"").toLowerCase().trim();
    if(!maestroId) { showToast("Guardá el maestro y después dale acceso desde Editar", "error"); return false; }
    if(!email || !form.accesoPass?.trim()) { showToast("Para dar acceso hacen falta email y contraseña", "error"); return false; }
    if(!activeColegioId) { showToast("Elegí un colegio primero", "error"); return false; }
    let auth_id = null;
    try {
      ({ auth_id } = await authAdminCreate(email, form.accesoPass.trim()));
    } catch(e) { showToast(`No se pudo crear el acceso: ${mensajeErrorAuth(e)}`, "error"); return false; }
    const usuarioId = uuidLite();
    const apellido = form.apellido||"";
    const { error: eU } = await supabase.from("usuarios").insert({
      id: usuarioId, nombre: sanitize(form.nombre), apellido: sanitize(apellido)||null, email,
      rol: "docente", colegio_id: activeColegioId, auth_id, activo: true,
      avatar: (`${(form.nombre||"")[0]||""}${apellido[0]||""}`).toUpperCase(),
    });
    if(eU) { showToast(`No se pudo crear la cuenta: ${eU.message}`, "error"); return false; }
    const { error: eM } = await supabase.from("maestros").update({ usuario_id: usuarioId }).eq("id", maestroId);
    if(eM) { showToast(`Cuenta creada, pero no se pudo vincular: ${eM.message}`, "error"); return false; }
    showToast("✓ Acceso creado: ya puede entrar a tribbu con ese email", "success");
    return true;
  };
  const cambiarPassDocente = async (usuarioId, pass) => {
    const { data: u } = await supabase.from("usuarios").select("auth_id,email").eq("id", usuarioId).maybeSingle();
    try {
      const r = await authAdminUpdate(u?.auth_id, { password: pass, current_email: u?.email });
      if(r?.auth_id_reparado) await supabase.from("usuarios").update({ auth_id: r.auth_id_reparado }).eq("id", usuarioId);
    } catch(e) { showToast(`No se pudo cambiar la contraseña: ${e.message||e}`, "error"); return false; }
    showToast("✓ Contraseña actualizada", "success");
    return true;
  };
  const quitarAccesoDocente = async () => {
    if(!form.usuario_id || !(await confirmar({ titulo:"¿Quitarle el acceso?", detalle:"Ya no va a poder entrar a tribbu; sus conversaciones se conservan.", textoConfirmar:"Quitar acceso" }))) return;
    await supabase.from("usuarios").update({ activo: false }).eq("id", form.usuario_id);
    const { error } = await supabase.from("maestros").update({ usuario_id: null }).eq("id", form.id);
    if(error) { showToast("No se pudo quitar el acceso", "error"); return; }
    setForm(p=>({ ...p, usuario_id: null }));
    showToast("Acceso quitado", "success");
    cargar();
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
    const color = form.color||colorAvatarAlAzar();
    let error;
    if(modal==="nuevo_alumno") {
      ({ error } = await supabase.from("hijos").insert({nombre:sanitize(form.nombre),apellido:sanitize(form.apellido)||null,curso_id:form.curso_id,avatar,color,fecha_nacimiento:form.fecha_nacimiento||null,dni:sanitize(form.dni)||null}));
    } else {
      ({ error } = await supabase.from("hijos").update({nombre:sanitize(form.nombre),apellido:sanitize(form.apellido)||null,curso_id:form.curso_id,fecha_nacimiento:form.fecha_nacimiento||null,dni:sanitize(form.dni)||null}).eq("id",form.id));
    }
    if(error) { showToast(`Error al guardar el alumno: ${error.message}`, "error"); return; }
    setModal(null); cargar();
  };

  const eliminarAlumno = async (id) => {
    // No hay ON DELETE CASCADE en las FKs que apuntan a hijos, así que hay que
    // limpiar a mano todo lo que referencia al alumno antes del delete final,
    // o Postgres lo rechaza (23503) y la baja "no anda" sin motivo visible.
    // Orden: asistencias (dependen de eventos y de hijos) → festejos propios →
    // pagos de colecta → config de cumpleaños → vínculo con apoderados → hijo.
    const { data: festejos } = await supabase.from("eventos").select("id").eq("tipo","festejo").eq("alumno_id",id);
    const festejoIds = (festejos||[]).map(e=>e.id);
    await supabase.from("evento_asistencia").delete().eq("alumno_invitado_id",id);
    if(festejoIds.length) {
      await supabase.from("evento_asistencia").delete().in("evento_id",festejoIds);
      await supabase.from("eventos").delete().in("id",festejoIds);
    }
    await supabase.from("colecta_pagos").delete().eq("alumno_id",id);
    await supabase.from("cumples").delete().eq("alumno_id",id);
    await supabase.from("usuario_hijos").delete().eq("hijo_id",id);
    const { error } = await supabase.from("hijos").delete().eq("id",id);
    if(error) {
      console.error("eliminarAlumno:", error);
      showToast(`No se pudo eliminar: ${error.details || error.message}`, "error");
      setConfirm(null); return;
    }
    setConfirm(null); cargar();
  };

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,boxSizing:"border-box",outline:"none",fontFamily:"inherit",background:"#F8FAFC"};

  if(loading) return <Spinner/>;

  // Secciones visibles: super sin colegio elegido solo tiene "Plataforma";
  // con uno elegido se suman las del colegio, sin Mensajes (de familias y
  // del personal son del staff; el super atiende Plataforma → Soporte). La
  // Secretaría no ve lo que es de todo el colegio. Una sección que se queda
  // sin pestañas no se muestra.
  // Una sección que queda con una sola pantalla (p. ej. la Secretaría en
  // Colegio solo tiene Horarios) toma el nombre y el ícono de esa pantalla:
  // "Colegio" con un horario adentro confundía.
  const ICONO_PANTALLA = { horarios:"reloj", usuarios:"usuarios", talleres:"paleta", adopcion:"grafico" };
  const filtrarSecciones = (lista, ok) => lista.map(g=>({ ...g, items: g.items.filter(ok) })).filter(g=>g.items.length)
    .map(g=>g.items.length===1&&g.id!=="g_inicio" ? { ...g, l:g.items[0].l, icono:ICONO_PANTALLA[g.items[0].id]||g.icono } : g);
  const seccionesVisibles = esSuper
    ? (colegioId ? [SECCION_PLATAFORMA, ...filtrarSecciones(SECCIONES, i=>!i.soloColegioAdmin)] : [SECCION_PLATAFORMA])
    : esSecretaria
      ? filtrarSecciones(SECCIONES, i=>!SOLO_ADMIN_COLEGIO.has(i.id))
      : SECCIONES;
  const grupoActivo = seccionesVisibles.find(g=>g.items.some(i=>i.id===sec) || (g.config && sec==="configuracion")) || null;
  // Navegar a mano limpia el pedido de "+ Crear" (si no, al volver a Eventos se reabriría el alta).
  const irSec = (id) => { setSec(id); setCrear(null); };
  // Configuración abre su página de tarjetas (no la primera pestaña).
  const irAGrupo = (g) => { irSec(g.config ? "configuracion" : g.items[0].id); setNavAbierta(false); };
  const irA = (id) => { irSec(id); setNavAbierta(false); };
  // Día a día arriba; Configuración aparte (abajo en la barra, al final en el celular).
  const seccionesDiaADia = seccionesVisibles.filter(g=>!g.config);
  const seccionConfig = seccionesVisibles.find(g=>g.config) || null;
  const puedeCrear = esStaffColegio || (esSuper && !!colegioId);
  const opcionesCrear = OPCIONES_CREAR.filter(o=>seccionesVisibles.some(g=>g.items.some(i=>i.id===o.sec)));
  const elegirCrear = (o) => {
    setMenuCrear(false); setNavAbierta(false); setSec(o.sec);
    if(o.id==="alumno"){ setForm({nombre:"",curso_id:cursosAnoActual[0]?.id,fecha_nacimiento:"",color:""}); setModal("nuevo_alumno"); }
    else if(o.id==="apoderado"){ setForm({nombre:"",apellido:"",email:"",pass:"",cursosAdmin:[],hijos:[],activo:true}); setModal("nuevo_usuario"); }
    else if(o.abre) setCrear(p=>({ tipo:o.id, n:(p?.n||0)+1 }));
  };
  const menuCrearUI = menuCrear ? (
    <>
      <div onClick={()=>setMenuCrear(false)} style={{position:"fixed",inset:0,zIndex:250,background:isMobile?"rgba(15,23,42,0.35)":"transparent"}}/>
      <div role="menu" aria-label="Crear" style={{position:"fixed",zIndex:251,background:"white",border:"1px solid #E2E8F0",borderRadius:14,boxShadow:"0 12px 32px rgba(15,23,42,0.18)",padding:6,...(isMobile?{left:16,right:16,top:64}:{left:248,top:64,width:320})}}>
        {opcionesCrear.map(o=>(
          <button key={o.id} role="menuitem" onClick={()=>elegirCrear(o)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"10px 12px",border:"none",borderRadius:10,background:"white",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
            <span style={{width:34,height:34,borderRadius:10,background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icono nombre={o.icono} size={17} color="#475569"/></span>
            <span style={{display:"block",minWidth:0}}>
              <span style={{display:"block",fontSize:14,fontWeight:700,color:"#0F172A"}}>{o.l}</span>
              <span style={{display:"block",fontSize:12,color:"#64748B",marginTop:1}}>{o.d}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  ) : null;
  const badgeDe = (id) => id==="mensajes_familias" ? noLeidos.familias : id==="mensajes_personal" ? noLeidos.personal : id==="salidas" ? noLeidos.salidas : id==="fotos" ? noLeidos.fotos : id==="soporte_colegio" ? noLeidos.soporte : 0;
  const badgeGrupo = (g) => g.items.reduce((n,i)=>n+badgeDe(i.id),0);
  const totalNoLeidos = noLeidos.familias + noLeidos.personal + noLeidos.salidas + noLeidos.fotos + noLeidos.soporte;
  const rolTexto = esSuper ? "Super Admin" : esSecretaria ? textoSecretaria(usuario?.niveles, usuario?.cargo) : "Administración del colegio";
  const inicialesUsuario = `${(usuario?.nombre||"?").slice(0,1)}${(usuario?.apellido||"").slice(0,1)}`.toUpperCase();

  return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",fontFamily:"'DM Sans',system-ui,sans-serif",colorScheme:"light",overflowX:"hidden"}}>
      <style>{`#tribbu-sa-nav::-webkit-scrollbar{width:6px}#tribbu-sa-nav::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.18);border-radius:3px}#tribbu-sa-nav::-webkit-scrollbar-track{background:transparent}`}</style>
      <Toast />
      {confirmUI}
      {menuCrearUI}
      {fichaAlumno&&(
        <FichaAlumno alumno={fichaAlumno} curso={cursos.find(c=>c.id===fichaAlumno.curso_id)} onCerrar={()=>setFichaAlumno(null)}
          onEditar={()=>{ const a=fichaAlumno; setFichaAlumno(null); setForm({...a}); setModal("editar_alumno"); }}
          onIr={(id)=>{ setFichaAlumno(null); irSec(id); }}/>
      )}
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
              <button onClick={()=>setConfirm(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={confirm.action} style={{flex:1,padding:10,borderRadius:10,border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Eliminar</button>
            </div>
          </Card>
        </div>
      )}

      {verApodSA&&<ApoderadosModal alumno={verApodSA} onClose={()=>setVerApodSA(null)}/>}
      {(modal==="nuevo_usuario"||modal?.edit) && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:18}}>{modal==="nuevo_usuario"?"Nuevo apoderado":"Editar apoderado"}</div>
            {[{label:"Nombre",key:"nombre",type:"text",ph:"Ej: María"},{label:"Apellido",key:"apellido",type:"text",ph:"Ej: García"},{label:"Email",key:"email",type:"email",ph:"maria@mail.com"},{label:"DNI",key:"dni",type:"text",ph:"Ej: 12345678"},{label:"Teléfono",key:"telefono",type:"tel",ph:"Ej: +54 11 1234-5678"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            {/* Contraseña — al editar mostrar vacío, solo llenar si quiere cambiarla */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>
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

            {/* super y colegio_admin ya no se dan de alta acá — ver
                "👑 Super Admins" y el bloque "Administradores" dentro de
                "🏫 Colegio". Esta pantalla es solo apoderado/Room Parent. */}
            {(
              <>
                {/* ── Sección 1: Hijos vinculados ── */}
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:6}}>Hijos vinculados</div>
                  {/* Chips de seleccionados */}
                  {(form.hijos||[]).length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                      {(form.hijos||[]).map(hid=>{
                        const h=hijos.find(x=>x.id===hid); if(!h) return null;
                        const c=cursos.find(x=>x.id===h.curso_id);
                        return (
                          <div key={hid} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px 3px 10px",borderRadius:20,background:"#F8FAFC",border:"1px solid #E2E8F0"}}>
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
                    <Icono nombre="lupa" size={15} color="#94A3B8" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
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
                      <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:6}}>Room Parent</div>
                      <div style={{fontSize:11,color:"#94A3B8",marginBottom:8}}>Solo puede ser Room Parent en cursos donde tiene un hijo.</div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {cursosConHijos.map(cid=>{
                          const c=cursos.find(x=>x.id===cid); if(!c) return null;
                          const esAdmin=(form.cursosAdmin||[]).includes(cid);
                          const hijosAqui=(form.hijos||[]).filter(hid=>hijos.find(h=>h.id===hid)?.curso_id===cid).map(hid=>hijos.find(h=>h.id===hid)).filter(Boolean);
                          return (
                            <div key={cid} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderRadius:12,border:`1px solid ${esAdmin?"#BFDBFE":"#E2E8F0"}`,background:esAdmin?"#F8FAFC":"white"}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{c.nombre}</div>
                                <div style={{fontSize:11,color:"#64748B",marginTop:1}}>{hijosAqui.map(h=>`${h.nombre} ${h.apellido||""}`).join(", ")}</div>
                              </div>
                              <button onClick={()=>setForm(p=>({...p,cursosAdmin:esAdmin?p.cursosAdmin.filter(x=>x!==cid):[...(p.cursosAdmin||[]),cid]}))}
                                style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${esAdmin?"#2563EB":"#E2E8F0"}`,background:esAdmin?"#2563EB":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:esAdmin?"white":"#334155",flexShrink:0,fontFamily:"inherit"}}>
                                {esAdmin?"✓ Room Parent":"Hacer Room Parent"}
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
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Estado</div>
              <label style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer"}}><input type="checkbox" checked={form.activo} onChange={()=>setForm(p=>({...p,activo:!(p.activo)}))} style={{width:16,height:16,accentColor:"#2563EB",cursor:"pointer"}}/><span style={{fontSize:13.5,color:"#0F172A"}}>Cuenta activa (puede entrar a tribbu)</span></label>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={conGuardando(guardarUsuario)} disabled={guardando} style={{flex:2,padding:11,borderRadius:10,border:"none",background:guardando?"#93C5FD":"#2563EB",color:"white",cursor:guardando?"default":"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando…":modal==="nuevo_usuario"?"Crear apoderado":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Administradores del colegio (colegio_admin) — desde "🏫 Colegio",
          no desde Usuarios. Comparte guardarCuentaEspecial con el modal de
          Super Admins de abajo, cambia solo rol/colegio_id fijos y color. */}
      {(modalAdmin==="nuevo"||modalAdmin?.edit) && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:4}}>{formAdmin.rol==="nivel_admin"?(modalAdmin==="nuevo"?"Nuevo directivo por nivel":"Editar directivo"):(modalAdmin==="nuevo"?"Nuevo administrador":"Editar administrador")}</div>
            <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:18}}>{formAdmin.rol==="nivel_admin"?`Directivo de ${colegioNombre}: gestiona solo los cursos de sus niveles. El cargo es solo el nombre que se ve; todos pueden lo mismo.`:`Administrador de ${colegioNombre}.`}</div>
            {formAdmin.rol==="nivel_admin"&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Cargo</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                  {CARGOS.map(c=>{
                    const on=(formAdmin.cargo||CARGO_DEFECTO)===c;
                    return <button key={c} onClick={()=>setFormAdmin(p=>({...p,cargo:c}))} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#3B82F6":"#E2E8F0"}`,background:on?"#EFF6FF":"white",color:on?"#1D4ED8":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700}}>{on?"✓ ":""}{c}</button>;
                  })}
                </div>
                <input value={CARGOS.includes(formAdmin.cargo||CARGO_DEFECTO)?"":(formAdmin.cargo||"")} onChange={e=>setFormAdmin(p=>({...p,cargo:e.target.value}))} placeholder="Otro cargo (opcional): Ej. Vicedirección" style={inp}/>
              </div>
            )}
            {formAdmin.rol==="nivel_admin"&&(
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Niveles</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {colegioNiveles.map(k=>{
                    const on=(formAdmin.niveles||[]).includes(k);
                    return <button key={k} onClick={()=>setFormAdmin(p=>({...p,niveles:on?(p.niveles||[]).filter(x=>x!==k):[...(p.niveles||[]),k]}))} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#3B82F6":"#E2E8F0"}`,background:on?"#EFF6FF":"white",color:on?"#1D4ED8":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700}}>{on?"✓ ":""}{nombreNivel(k)}</button>;
                  })}
                </div>
              </div>
            )}
            {[{label:"Nombre",key:"nombre",type:"text",ph:"Ej: María"},{label:"Apellido",key:"apellido",type:"text",ph:"Ej: García"},{label:"Email",key:"email",type:"email",ph:"maria@mail.com"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{f.label}</div>
                <input value={formAdmin[f.key]||""} onChange={e=>setFormAdmin(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{modalAdmin==="nuevo"?"Contraseña":"Nueva contraseña"}</div>
              <input
                value={modalAdmin==="nuevo"?(formAdmin.pass||""):(formAdmin._passNueva||"")}
                onChange={e=>modalAdmin==="nuevo"?setFormAdmin(p=>({...p,pass:e.target.value})):setFormAdmin(p=>({...p,_passNueva:e.target.value,pass:e.target.value}))}
                type="password"
                placeholder={modalAdmin==="nuevo"?"Contraseña de acceso":"Dejar vacío para no cambiar"}
                style={inp}
              />
            </div>
            {modalAdmin?.edit&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer"}}><input type="checkbox" checked={formAdmin.activo} onChange={()=>setFormAdmin(p=>({...p,activo:!(p.activo)}))} style={{width:16,height:16,accentColor:"#2563EB",cursor:"pointer"}}/><span style={{fontSize:13.5,color:"#0F172A"}}>Cuenta activa (puede entrar a tribbu)</span></label>
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{ setModalAdmin(null); setFormAdmin({}); }} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={()=>{
                if(formAdmin.rol==="nivel_admin"&&!(formAdmin.niveles||[]).length){ showToast("Elegí al menos un nivel","error"); return; }
                guardarCuentaEspecial(formAdmin.rol||"colegio_admin",colegioId,modalAdmin==="nuevo",formAdmin,setFormAdmin,()=>setModalAdmin(null));
              }} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modalAdmin==="nuevo"?(formAdmin.rol==="nivel_admin"?"Crear directivo":"Crear administrador"):"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Super Admins de plataforma — desde "👑 Super Admins", nunca desde
          Usuarios ni desde un colegio puntual (colegio_id siempre null). */}
      {(modalSuper==="nuevo"||modalSuper?.edit) && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:4}}>{modalSuper==="nuevo"?"Nuevo Super Admin":"Editar Super Admin"}</div>
            <div style={{fontSize:12.5,color:"#94A3B8",marginBottom:18}}>Acceso total a la plataforma — todos los colegios, sin restricción.</div>
            {[{label:"Nombre",key:"nombre",type:"text",ph:"Ej: María"},{label:"Apellido",key:"apellido",type:"text",ph:"Ej: García"},{label:"Email",key:"email",type:"email",ph:"maria@mail.com"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{f.label}</div>
                <input value={formSuper[f.key]||""} onChange={e=>setFormSuper(p=>({...p,[f.key]:e.target.value}))} type={f.type} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{modalSuper==="nuevo"?"Contraseña":"Nueva contraseña"}</div>
              <input
                value={modalSuper==="nuevo"?(formSuper.pass||""):(formSuper._passNueva||"")}
                onChange={e=>modalSuper==="nuevo"?setFormSuper(p=>({...p,pass:e.target.value})):setFormSuper(p=>({...p,_passNueva:e.target.value,pass:e.target.value}))}
                type="password"
                placeholder={modalSuper==="nuevo"?"Contraseña de acceso":"Dejar vacío para no cambiar"}
                style={inp}
              />
            </div>
            {modalSuper?.edit&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer"}}><input type="checkbox" checked={formSuper.activo} onChange={()=>setFormSuper(p=>({...p,activo:!(p.activo)}))} style={{width:16,height:16,accentColor:"#2563EB",cursor:"pointer"}}/><span style={{fontSize:13.5,color:"#0F172A"}}>Cuenta activa (puede entrar a tribbu)</span></label>
              </div>
            )}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{ setModalSuper(null); setFormSuper({}); }} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={()=>guardarCuentaEspecial("super",null,modalSuper==="nuevo",formSuper,setFormSuper,()=>setModalSuper(null))} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modalSuper==="nuevo"?"Crear Super Admin":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_curso"||modal==="editar_curso") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:18}}>{modal==="editar_curso"?"Editar curso":form._duplicarDeId?"Duplicar curso":"Nuevo curso"}</div>
            {form._duplicarDeId&&<div style={{fontSize:12,color:"#94A3B8",marginTop:-10,marginBottom:14}}>Se copian horarios, Room Parent, maestro, uniformes, útiles y libros al curso nuevo.</div>}
            <div style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Nombre del curso</div>
                <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: 4°B — Primaria" style={inp}/>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Icono</div>
                <EmojiPicker value={form.avatar||"🏫"} onChange={v=>setForm(p=>({...p,avatar:v}))}/>
              </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899","#0EA5E9","#14B8A6"].map(c=>(
                  <button key={c} onClick={()=>setForm(p=>({...p,color:c}))} style={{width:32,height:32,borderRadius:"50%",background:c,border:form.color===c?"3px solid #0F172A":"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
            </div>
            {colegioNiveles.length>1&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Nivel</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {[...colegioNiveles.map(k=>({k,l:nombreNivel(k)})),{k:null,l:"Sin nivel"}].map(n=>{
                    const on=(form.nivel||null)===n.k;
                    return <button key={n.k||"ninguno"} onClick={()=>setForm(p=>({...p,nivel:n.k}))} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#3B82F6":"#E2E8F0"}`,background:on?"#EFF6FF":"white",color:on?"#1D4ED8":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700}}>{n.l}</button>;
                  })}
                </div>
              </div>
            )}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Año lectivo</div>
              <input type="number" value={form.año_lectivo||""} onChange={e=>setForm(p=>({...p,año_lectivo:Number(e.target.value)||""}))} placeholder="Ej: 2026" style={inp}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={conGuardando(modal==="editar_curso"?actualizarCurso:guardarCurso)} disabled={guardando} style={{flex:2,padding:11,borderRadius:10,border:"none",background:guardando?"#93C5FD":"#2563EB",color:"white",cursor:guardando?"default":"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando…":modal==="editar_curso"?"Guardar cambios":form._duplicarDeId?"Crear duplicado":"Crear curso"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_maestro"||modal==="editar_maestro") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:18}}>{modal==="nuevo_maestro"?"Nuevo maestro":"Editar maestro"}</div>
            {[{label:"Nombre",key:"nombre",ph:"Ej: Carlos"},{label:"Apellido",key:"apellido",ph:"Ej: Gómez"},{label:"Email",key:"email",ph:"carlos@mail.com"}].map(f=>(
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{f.label}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Cumpleaños</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} placeholder="dd/mm/aaaa" style={inp}/>

            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Clases que da</div>
              {form.clases===null
                ? <div style={{fontSize:12.5,color:"#94A3B8"}}>Cargando clases…</div>
                : <ClasesMaestroEditor colegioId={activeColegioId} cursos={cursosAnoActual} value={(form.clases||[]).filter(c=>cursosAnoActual.some(x=>x.id===c.curso_id))} onChange={v=>setForm(p=>({...p,clases:v}))}/>}
            </div>
            {form.id?(()=>{
              const otroAno = (form.clases||[]).filter(c=>c.id&&!cursosAnoActual.some(x=>x.id===c.curso_id)).length;
              return (
                <div style={{marginBottom:12,padding:12,borderRadius:12,border:"1px solid #E2E8F0",background:"#F8FAFC"}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Su semana</div>
                  <SemanaMaestra maestroId={form.id} cursos={cursosAnoActual}/>
                  {otroAno?<div style={{fontSize:11.5,color:"#B45309",marginTop:8}}>Además tiene {otroAno} {otroAno===1?"clase":"clases"} en cursos de otros años (se ven y se quitan desde 📚 Materias).</div>:null}
                </div>
              );
            })():null}
            <div style={{marginBottom:12,padding:12,borderRadius:12,border:"1px solid #E2E8F0",background:"#F8FAFC"}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:6}}>Acceso a tribbu</div>
              {form.usuario_id ? (
                <>
                  <div style={{fontSize:12.5,color:"#065F46",fontWeight:700,marginBottom:8}}>✓ Puede entrar a tribbu: ve sus cursos y chatea con las familias{form.email?` (${form.email})`:""}.</div>
                  <input type="password" value={form.accesoPass||""} onChange={e=>setForm(p=>({...p,accesoPass:e.target.value}))} placeholder="Nueva contraseña (opcional)" autoComplete="new-password" style={{...inp,marginBottom:8}}/>
                  <button onClick={quitarAccesoDocente} style={{border:"none",background:"none",color:"#EF4444",fontSize:12,fontWeight:700,cursor:"pointer",padding:0}}>Quitar acceso</button>
                </>
              ) : (
                <>
                  <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}>
                    <input type="checkbox" checked={!!form.darAcceso} onChange={e=>setForm(p=>({...p,darAcceso:e.target.checked}))}/>
                    <span style={{color:"#0F172A"}}>Darle acceso a tribbu</span>
                  </label>
                  {form.darAcceso?(
                    <div style={{marginTop:8}}>
                      <div style={{fontSize:11.5,color:"#64748B",marginBottom:6}}>Entra con el email de arriba y esta contraseña. Ve sus cursos y chatea con las familias; el colegio puede leer sus chats.</div>
                      <input type="password" value={form.accesoPass||""} onChange={e=>setForm(p=>({...p,accesoPass:e.target.value}))} placeholder="Contraseña inicial" autoComplete="new-password" style={inp}/>
                    </div>
                  ):null}
                </>
              )}
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Estado</div>
              <label style={{display:"inline-flex",alignItems:"center",gap:8,cursor:"pointer"}}><input type="checkbox" checked={form.activo!==false} onChange={()=>setForm(p=>({...p,activo:!(p.activo!==false)}))} style={{width:16,height:16,accentColor:"#2563EB",cursor:"pointer"}}/><span style={{fontSize:13.5,color:"#0F172A"}}>Cuenta activa (puede entrar a tribbu)</span></label>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={conGuardando(guardarMaestro)} disabled={guardando} style={{flex:2,padding:11,borderRadius:10,border:"none",background:guardando?"#93C5FD":"#2563EB",color:"white",cursor:guardando?"default":"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando…":modal==="nuevo_maestro"?"Crear maestro":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {(modal==="nuevo_alumno"||modal==="editar_alumno") && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:18}}>{modal==="nuevo_alumno"?"Nuevo alumno":"Editar alumno"}</div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Nombre</div>
                <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Sofía" style={inp}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Apellido</div>
                <input value={form.apellido||""} onChange={e=>setForm(p=>({...p,apellido:e.target.value}))} placeholder="Ej: García" style={inp}/>
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Fecha de nacimiento</div>
              <input type="date" value={form.fecha_nacimiento||""} onChange={e=>setForm(p=>({...p,fecha_nacimiento:e.target.value}))} style={inp}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>DNI</div>
              <input value={form.dni||""} onChange={e=>setForm(p=>({...p,dni:e.target.value}))} placeholder="Ej: 12345678" style={inp}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Icono</div>
              <EmojiPicker value={form.avatar||""} onChange={v=>setForm(p=>({...p,avatar:v}))}/>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {["#3B82F6","#8B5CF6","#10B981","#F59E0B","#EF4444","#EC4899","#0EA5E9","#14B8A6","#F97316","#6366F1"].map(c=>(
                  <button key={c} type="button" onClick={()=>setForm(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,border:(form.color||"#3B82F6")===c?"3px solid #0F172A":"3px solid transparent",cursor:"pointer"}}/>
                ))}
              </div>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Curso</div>
              <select value={form.curso_id||""} onChange={e=>setForm(p=>({...p,curso_id:e.target.value}))} style={{...inp,cursor:"pointer"}}>
                <option value="" disabled>Elegir curso...</option>
                {cursosAnoActual.map(c=>(
                  <option key={c.id} value={c.id}>{c.avatar} {c.nombre}</option>
                ))}
              </select>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={conGuardando(guardarAlumno)} disabled={guardando} style={{flex:2,padding:11,borderRadius:10,border:"none",background:guardando?"#93C5FD":"#2563EB",color:"white",cursor:guardando?"default":"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando…":modal==="nuevo_alumno"?"Crear alumno":"Guardar cambios"}</button>
            </div>
          </Card>
        </div>
      )}

      {cambiarPass&&<CambiarPasswordModal onClose={()=>setCambiarPass(false)}/>}

      {isMobile ? (
        // Celular: barra arriba con la sección actual; al tocarla se
        // despliega la lista de secciones (antes, chips por grupo).
        <div style={{padding:"14px 16px 0"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:12}}>
            <div style={{minWidth:0}}>
              <Wordmark size={20} letterSpacing={-0.8} color="#0F172A"/>
              <div style={{fontSize:11.5,color:"#64748B",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{[rolTexto, colegioNombre].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
              {puedeCrear&&opcionesCrear.length>0&&(
                <button onClick={()=>setMenuCrear(m=>!m)} aria-expanded={menuCrear} aria-haspopup="menu" style={{height:38,padding:"0 14px",borderRadius:999,border:"none",background:"#2563EB",cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{fontSize:13.5,fontWeight:800,color:"white"}}>+ Crear</span>
                </button>
              )}
              <button onClick={()=>irA("cuenta")} aria-label="Mi cuenta" style={{width:38,height:38,borderRadius:999,border:"1px solid #E2E8F0",background:sec==="cuenta"?"#F1F5F9":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0}}>
                <span style={{fontSize:12.5,fontWeight:800,color:"#334155"}}>{inicialesUsuario}</span>
              </button>
            </div>
          </div>
          <button onClick={()=>setNavAbierta(a=>!a)} aria-expanded={navAbierta} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 14px",borderRadius:12,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",marginBottom:navAbierta?8:16,fontFamily:"inherit"}}>
            <Icono nombre={grupoActivo?.icono||(sec==="cuenta"?"usuarios":"salvavidas")} size={18} color="#475569"/>
            <span style={{flex:1,textAlign:"left",fontSize:14,fontWeight:800,color:"#0F172A"}}>{grupoActivo?.l || SECCION_INFO[sec]?.titulo || "Secciones"}</span>
            {navAbierta ? null : <Globito n={totalNoLeidos}/>}
            <Icono nombre="chevron" size={16} color="#64748B" style={{transform:navAbierta?"rotate(180deg)":"none"}}/>
          </button>
          {navAbierta&&(
            <nav style={{border:"1px solid #E2E8F0",borderRadius:14,background:"white",marginBottom:16,overflow:"hidden"}}>
              {[...seccionesDiaADia, ...(seccionConfig?[seccionConfig]:[])].map((g,i)=>{
                const on = grupoActivo?.id===g.id;
                return (
                  <button key={g.id} onClick={()=>irAGrupo(g)} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 14px",border:"none",borderTop:g.config?"6px solid #F1F5F9":i?"1px solid #F1F5F9":"none",background:on?"#F8FAFC":"white",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                    <Icono nombre={g.icono} size={18} color={on?"#1D4ED8":"#475569"}/>
                    <span style={{flex:1,fontSize:14,fontWeight:on?800:600,color:on?"#1D4ED8":"#0F172A"}}>{g.l}</span>
                    <Globito n={badgeGrupo(g)}/>
                  </button>
                );
              })}
              {esStaffColegio&&(
                <button onClick={()=>irA("soporte_colegio")} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 14px",border:"none",borderTop:"1px solid #F1F5F9",background:"white",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                  <Icono nombre="salvavidas" size={18} color="#475569"/>
                  <span style={{flex:1,fontSize:14,fontWeight:600,color:"#0F172A"}}>Ayuda y soporte</span>
                  <Globito n={noLeidos.soporte}/>
                </button>
              )}
            </nav>
          )}
        </div>
      ) : (
        // Barra lateral fija (mismo patrón que la del apoderado en App.jsx):
        // pocas secciones con íconos de línea; las pantallas de cada una van
        // como pestañas arriba del contenido. Abajo, Ayuda y Mi cuenta.
        <nav style={{width:236,position:"fixed",top:0,left:0,bottom:0,background:"#0F172A",display:"flex",flexDirection:"column",zIndex:100,overflow:"hidden"}}>
          <div style={{padding:"22px 20px 14px",flexShrink:0}}>
            <Wordmark size={22} letterSpacing={-0.8}/>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",textTransform:"uppercase",letterSpacing:1,marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{colegioNombre || rolTexto}</div>
          </div>
          {puedeCrear&&opcionesCrear.length>0&&(
            <div style={{padding:"0 12px 10px",flexShrink:0}}>
              <button onClick={()=>setMenuCrear(m=>!m)} aria-expanded={menuCrear} aria-haspopup="menu" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"none",background:"#2563EB",cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:14,fontWeight:800,color:"white"}}>+ Crear</span>
              </button>
            </div>
          )}
          <div id="tribbu-sa-nav" style={{flex:1,minHeight:0,padding:"4px 12px 0",overflowY:"auto",scrollbarWidth:"thin",scrollbarColor:"rgba(255,255,255,0.25) transparent"}}>
            {seccionesDiaADia.map(g=>{
              const on = grupoActivo?.id===g.id;
              return (
                <button key={g.id} onClick={()=>irAGrupo(g)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"11px 12px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",background:on?"rgba(255,255,255,0.12)":"transparent",marginBottom:2}}>
                  <Icono nombre={g.icono} size={18} color={on?"white":"rgba(255,255,255,0.55)"}/>
                  <span style={{flex:1,fontSize:13.5,fontWeight:on?700:500,color:on?"white":"rgba(255,255,255,0.6)"}}>{g.l}</span>
                  <Globito n={badgeGrupo(g)}/>
                </button>
              );
            })}
          </div>
          <div style={{padding:"10px 12px 16px",flexShrink:0}}>
            {seccionConfig&&(
              <button onClick={()=>irAGrupo(seccionConfig)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"10px 12px",borderRadius:12,border:"none",borderTop:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",fontFamily:"inherit",background:grupoActivo?.id===seccionConfig.id?"rgba(255,255,255,0.12)":"transparent",marginBottom:2}}>
                <Icono nombre={seccionConfig.icono} size={18} color={grupoActivo?.id===seccionConfig.id?"white":"rgba(255,255,255,0.55)"}/>
                <span style={{flex:1,fontSize:13,fontWeight:grupoActivo?.id===seccionConfig.id?700:500,color:grupoActivo?.id===seccionConfig.id?"white":"rgba(255,255,255,0.6)"}}>{seccionConfig.l}</span>
              </button>
            )}
            {esStaffColegio&&(
              <button onClick={()=>irA("soporte_colegio")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"inherit",background:sec==="soporte_colegio"?"rgba(255,255,255,0.12)":"transparent",marginBottom:6}}>
                <Icono nombre="salvavidas" size={18} color={sec==="soporte_colegio"?"white":"rgba(255,255,255,0.55)"}/>
                <span style={{flex:1,fontSize:13,fontWeight:sec==="soporte_colegio"?700:500,color:sec==="soporte_colegio"?"white":"rgba(255,255,255,0.6)"}}>Ayuda y soporte</span>
                <Globito n={noLeidos.soporte}/>
              </button>
            )}
            <button onClick={()=>irA("cuenta")} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,border:"none",cursor:"pointer",background:sec==="cuenta"?"rgba(255,255,255,0.14)":"rgba(255,255,255,0.06)",textAlign:"left",fontFamily:"inherit"}}>
              <span style={{width:32,height:32,borderRadius:"50%",background:"rgba(255,255,255,0.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:12,fontWeight:800,color:"white"}}>{inicialesUsuario}</span>
              </span>
              <span style={{flex:1,minWidth:0,display:"block"}}>
                <span style={{display:"block",fontSize:12,fontWeight:700,color:"white",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{usuario?.nombre} {usuario?.apellido||""}</span>
                <span style={{display:"block",fontSize:10,color:"rgba(255,255,255,0.5)",marginTop:1}}>Mi cuenta</span>
              </span>
            </button>
          </div>
        </nav>
      )}
        <div style={{marginLeft:isMobile?0:236,padding:isMobile?"0 16px 24px":"24px 36px 36px",maxWidth:isMobile?undefined:1200,boxSizing:"border-box"}}>
      {sec!=="inicio"&&(() => {
        // Encabezado: la sección (sin emoji), sus pestañas y, abajo, qué
        // gestiona la pantalla + la acción de crear (BotonNuevo).
        const info = SECCION_INFO[sec] || { titulo:"Panel del colegio", descripcion:"" };
        // Pantallas de Configuración: su propio título y "‹ Configuración", sin fila de pestañas.
        const enConfig = !!grupoActivo?.config && sec!=="configuracion";
        const titulo = enConfig ? (grupoActivo.items.find(i=>i.id===sec)?.l || info.titulo) : grupoActivo?.l || info.titulo;
        const pestanas = grupoActivo && !grupoActivo.config && grupoActivo.items.length>1 ? grupoActivo.items : null;
        const btnSec = {display:"inline-flex",alignItems:"center",gap:6,minHeight:36,padding:"0 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155",fontFamily:"inherit",whiteSpace:"nowrap"};
        return (
          <div style={{marginBottom:18}}>
            {esSuper&&colegioId&&sec!=="colegios"&&(
              <button onClick={()=>{ setColegioId(null); setSec("colegios"); }} style={{display:"inline-flex",alignItems:"center",gap:4,border:"none",background:"transparent",cursor:"pointer",padding:0,marginBottom:8,fontFamily:"inherit"}}>
                <Icono nombre="atras" size={15} color="#2563EB"/>
                <span style={{fontSize:13,fontWeight:700,color:"#2563EB"}}>Colegios · {colegioNombre}</span>
              </button>
            )}
            {enConfig&&(
              <button onClick={()=>irSec("configuracion")} style={{display:"inline-flex",alignItems:"center",gap:4,border:"none",background:"transparent",cursor:"pointer",padding:0,marginBottom:8,fontFamily:"inherit"}}>
                <Icono nombre="atras" size={15} color="#2563EB"/>
                <span style={{fontSize:13,fontWeight:700,color:"#2563EB"}}>Configuración</span>
              </button>
            )}
            {/* En el celular el título ya está en el selector de sección de arriba (salvo dentro de Configuración). */}
            {isMobile && !enConfig ? null : <div style={{fontSize:isMobile?24:28,fontWeight:800,color:"#0F172A",letterSpacing:-0.4,marginBottom:pestanas?14:6}}>{titulo}</div>}
            {pestanas&&<SubSeccion desplazable items={pestanas.map(i=>({id:i.id,label:i.l,badge:badgeDe(i.id)}))} activo={sec} onIr={irSec}/>}
            {info.descripcion&&(
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap",marginTop:pestanas?-4:0}}>
                <div style={{fontSize:13,color:"#64748B",lineHeight:1.5,maxWidth:640,flex:"1 1 320px"}}>{info.descripcion}</div>
                {sec==="usuarios" && (
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <button onClick={()=>irSec("importar")} style={btnSec}>
                      <Icono nombre="documento" size={15} color="#475569"/>
                      <span style={{color:"#334155"}}>Importar Excel</span>
                    </button>
                    <BotonNuevo ariaLabel="Nuevo apoderado" onClick={()=>{ setForm({nombre:"",apellido:"",email:"",pass:"",cursosAdmin:[],hijos:[],activo:true}); setModal("nuevo_usuario"); }}/>
                  </div>
                )}
                {sec==="maestros" && (
                  <BotonNuevo ariaLabel="Nuevo maestro" onClick={()=>{ setForm({nombre:"",apellido:"",email:"",clases:[],_clasesOrig:[],activo:true}); setModal("nuevo_maestro"); }}/>
                )}
                {sec==="colegios" && (
                  <BotonNuevo ariaLabel="Nuevo colegio" onClick={()=>{ setForm({nombre:"",año_lectivo_actual:new Date().getFullYear(),adminNombre:"",adminApellido:"",adminEmail:"",adminPass:""}); setModalColegio("nuevo"); }}/>
                )}
                {sec==="super_admins" && (
                  <BotonNuevo ariaLabel="Nuevo Super Admin" onClick={()=>{ setFormSuper({nombre:"",apellido:"",email:"",pass:"",activo:true}); setModalSuper("nuevo"); }}/>
                )}
                {sec==="alumnos" && (
                  <BotonNuevo ariaLabel="Nuevo alumno" onClick={()=>{ setForm({nombre:"",curso_id:cursosAnoActual[0]?.id,fecha_nacimiento:"",color:""}); setModal("nuevo_alumno"); }}/>
                )}
                {sec==="cursos" && (
                  <BotonNuevo ariaLabel="Nuevo curso" onClick={()=>{ setForm({nombre:"",avatar:"🏫",color:"#3B82F6",año_lectivo:anoCursosMostrado}); setModal("nuevo_curso"); }}/>
                )}
              </div>
            )}
          </div>
        );
      })()}
      {sec==="cuenta"&&(
        <div style={{maxWidth:560}}>
          <div style={{display:"flex",alignItems:"center",gap:14,padding:"16px 18px",border:"1px solid #E2E8F0",borderRadius:16,background:"white",marginBottom:14}}>
            <span style={{width:48,height:48,borderRadius:"50%",background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:16,fontWeight:800,color:"#334155"}}>{inicialesUsuario}</span>
            </span>
            <span style={{display:"block",minWidth:0}}>
              <span style={{display:"block",fontSize:16,fontWeight:800,color:"#0F172A"}}>{usuario?.nombre} {usuario?.apellido||""}</span>
              {usuario?.email&&<span style={{display:"block",fontSize:13,color:"#64748B",marginTop:2,overflow:"hidden",textOverflow:"ellipsis"}}>{usuario.email}</span>}
              <span style={{display:"block",fontSize:13,color:"#64748B",marginTop:2}}>{[rolTexto, colegioNombre].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
          <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
            {[
              {icono:"llave", l:"Cambiar contraseña", fn:()=>setCambiarPass(true)},
              esStaffColegio ? {icono:"salvavidas", l:"Ayuda y soporte", fn:()=>irA("soporte_colegio"), n:noLeidos.soporte} : null,
              {icono:"salir", l:"Cerrar sesión", fn:onCerrarSesion},
            ].filter(Boolean).map((f,i)=>(
              <button key={f.l} onClick={f.fn} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"14px 18px",border:"none",borderTop:i?"1px solid #F1F5F9":"none",background:"white",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                <Icono nombre={f.icono} size={18} color="#475569"/>
                <span style={{flex:1,fontSize:14.5,fontWeight:600,color:"#0F172A"}}>{f.l}</span>
                <Globito n={f.n||0}/>
                <Icono nombre="flecha" size={15} color="#94A3B8"/>
              </button>
            ))}
          </div>
        </div>
      )}
      {sec==="usuarios" && (() => {
        // Header de módulo con 4 stats (handoff Tribbu Admin, Parte 3 #5):
        // usuarios totales / Room Parents (+ en cuántos cursos) / familias
        // sin registrarse todavía / usuarios inactivos. Antes esta tarjeta se
        // mostraba SIEMPRE, en los 12 módulos, con las mismas 4 métricas de
        // usuarios — ahora cada módulo tiene las suyas (ver sec==="maestros"
        // más abajo para el primer ejemplo).
        const roomParents = usuarios.filter(u=>u.rol==="room");
        const cursosConRP = new Set(roomParents.flatMap(u=>u.cursosAdmin||[])).size;
        const hijosConApoderado = new Set(usuarios.flatMap(u=>u.hijos||[]));
        const sinRegistrarse = hijos.filter(h=>!hijosConApoderado.has(h.id)).length;
        const inactivos = usuariosNormales.filter(u=>!u.activo).length;
        return (
          <ModuloStats items={[
          {n:usuariosNormales.length, l:"Apoderados", sub:null},
          {n:roomParents.length, l:"Room Parents", sub:cursosConRP?`en ${cursosConRP} curso${cursosConRP!==1?"s":""}`:null},
          {n:sinRegistrarse, l:"Sin registrarse", sub:sinRegistrarse?"invitados":null},
          {n:inactivos, l:"Inactivos", sub:null},
          ]}/>
        );
      })()}

      {sec==="usuarios" && (() => {
            const cursoOpts = opcionesCursoApoderados(cursos, anoActual);
            // Un chip por acceso real a un curso: filas explícitas de
            // usuario_cursos (cualquier rol) + acceso derivado por hijo para
            // apoderados sin fila propia (ver "Fix RLS: padres sin fila en
            // usuario_cursos" — es el caso normal, no la excepción).
            const accesosDeUsuario = (u) => {
              const vistos = new Set();
              const chips = [];
              for(const r of (u.usuarioCursos||[])) {
                const curso = cursos.find(c=>c.id===r.curso_id);
                if(!curso || vistos.has(r.curso_id)) continue;
                vistos.add(r.curso_id);
                chips.push({label:`${ROL_LABEL[r.rol]||r.rol} · ${curso.nombre}`, color:ROL_COLOR[r.rol]||"#94A3B8"});
              }
              for(const hid of (u.hijos||[])) {
                const hijo = hijos.find(h=>h.id===hid);
                if(!hijo || vistos.has(hijo.curso_id)) continue;
                const curso = cursos.find(c=>c.id===hijo.curso_id);
                if(!curso) continue;
                vistos.add(hijo.curso_id);
                chips.push({label:`Apoderado · ${curso.nombre}`, color:ROL_COLOR.padre});
              }
              return chips;
            };
            const idsVisibles = ctrlUsuarios.items.map(u=>u.id);
            const todosMarcados = idsVisibles.length>0 && idsVisibles.every(id=>selUsuarios.has(id));
            const gridCols = "44px minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,1fr) 118px 96px";
            return (
        <>
          <ListToolbar busqueda={ctrlUsuarios.busqueda} setBusqueda={ctrlUsuarios.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"rol",label:"Rol"},{key:"id",label:"Más reciente"}]} sortKey={ctrlUsuarios.sortKey} sortAsc={ctrlUsuarios.sortAsc} toggleSort={ctrlUsuarios.toggleSort} filterOptions={[{key:"rol",label:"Rol",options:[{value:"padre",label:"Apoderado"},{value:"room",label:"Room Parent"}]},{key:"activo",label:"Estado",options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}]},{key:"curso",label:"Curso",options:cursoOpts}]} filtros={ctrlUsuarios.filtros} setFiltro={ctrlUsuarios.setFiltro} resetFiltros={ctrlUsuarios.resetFiltros} total={ctrlUsuarios.total} placeholder="Buscar por nombre o email..."/>

          <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
            {selUsuarios.size>0 && (
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"#0F172A"}}>
                <span style={{fontSize:12.5,fontWeight:700,color:"white"}}>{selUsuarios.size} apoderado{selUsuarios.size!==1?"s":""} seleccionado{selUsuarios.size!==1?"s":""}</span>
                <div style={{flex:1}}/>
                <button onClick={()=>setAsignarCursoModal(true)} style={{minHeight:32,padding:"0 12px",border:"none",borderRadius:8,background:"rgba(255,255,255,0.14)",color:"white",fontSize:12,fontWeight:700,cursor:"pointer"}}>Asignar a curso</button>
                <button onClick={()=>setSelUsuarios(new Set())} style={{minHeight:32,padding:"0 10px",border:"none",background:"transparent",color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:700,cursor:"pointer"}}>Cancelar</button>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,alignItems:"center",gap:12,padding:"10px 14px",background:"#F8FAFC",borderBottom:"1px solid #F1F5F9"}}>
              {!isMobile && <>
                <button onClick={()=>toggleSelTodosUsuarios(idsVisibles)} aria-label="Seleccionar todos" style={{width:18,height:18,border:`1.5px solid ${todosMarcados?"#0F172A":"#CBD5E1"}`,borderRadius:5,background:todosMarcados?"#0F172A":"white",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {todosMarcados && <span style={{color:"white",fontSize:11}}>✓</span>}
                </button>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Nombre</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Acceso</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Hijos</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"center"}}>Estado</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"right"}}>Acciones</div>
              </>}
              {isMobile && <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{ctrlUsuarios.total} apoderados</div>}
            </div>

            {ctrlUsuarios.items.length===0 ? (
              <EmptyState sinBorde icono="lupa" titulo="Ningún apoderado coincide" nota="Probá con otro nombre, o saliendo de los filtros de rol, estado y curso." accion="Limpiar filtros" onAccion={ctrlUsuarios.resetFiltros} style={{padding:"28px 20px"}}/>
            ) : ctrlUsuarios.items.map(u=>{
              const marcado = selUsuarios.has(u.id);
              const hijosNombres = (u.hijos||[]).map(hid=>hijos.find(h=>h.id===hid)?.nombre).filter(Boolean).join(", ");
              return (
                <div key={u.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,alignItems:isMobile?"flex-start":"center",gap:12,padding:isMobile?"12px 14px":"11px 14px",borderBottom:"1px solid #F8FAFC",background:marcado?"#EFF6FF":"white",opacity:u.activo?1:0.55}}>
                  {!isMobile && (
                    <button onClick={()=>toggleSelUsuario(u.id)} aria-label="Seleccionar" style={{width:18,height:18,border:`1.5px solid ${marcado?"#0F172A":"#CBD5E1"}`,borderRadius:5,background:marcado?"#0F172A":"white",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {marcado && <span style={{color:"white",fontSize:11}}>✓</span>}
                    </button>
                  )}
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    {isMobile && (
                      <button onClick={()=>toggleSelUsuario(u.id)} aria-label="Seleccionar" style={{width:18,height:18,flexShrink:0,border:`1.5px solid ${marcado?"#0F172A":"#CBD5E1"}`,borderRadius:5,background:marcado?"#0F172A":"white",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {marcado && <span style={{color:"white",fontSize:11}}>✓</span>}
                      </button>
                    )}
                    <div style={{width:34,height:34,borderRadius:999,background:"#F1F5F9",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{`${(u.nombre||"")[0]||""}${(u.apellido||"")[0]||""}`.toUpperCase()}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</div>
                      <div style={{fontSize:11.5,color:"#94A3B8",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,minWidth:0}}>
                    {accesosDeUsuario(u).map((a,i)=>(
                      <span key={i} style={{display:"flex",alignItems:"center",padding:"3px 8px",borderRadius:999,background:"#F8FAFC",border:"1px solid #E2E8F0"}}>
                        <span style={{fontSize:11.5,fontWeight:600,color:"#475569"}}>{a.label}</span>
                      </span>
                    ))}
                    {/* super/colegio_admin ya no aparecen en esta lista — ver
                        "👑 Super Admins" y "🏫 Colegio" → Administradores. */}
                  </div>
                  <div style={{fontSize:12,color:"#64748B",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{hijosNombres || "—"}</div>
                  <div style={{display:"flex",justifyContent:isMobile?"flex-start":"center"}}>
                    <span style={{fontSize:12.5,fontWeight:600,color:u.activo?"#334155":"#94A3B8"}}>{u.activo?"Activo":"Inactivo"}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:isMobile?"flex-start":"flex-end",gap:6}}>
                    <button onClick={()=>{ setForm({...u,cursosAdmin:[...(u.cursosAdmin||[])],hijos:[...(u.hijos||[])],_emailOriginal:u.email}); setModal({edit:u}); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>toggleActivo(u)} title={u.activo?"Desactivar":"Activar"} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer"}}><Icono nombre={u.activo?"cerrar":"check"} size={15} color="#64748B" style={{margin:"0 auto"}}/></button>
                    {u.rol!=="super"&&<button onClick={()=>setConfirm({nombre:`${u.nombre}${u.apellido?" "+u.apellido:""}`,msg:"Esta acción no se puede deshacer.",action:()=>eliminarUsuario(u.id)})} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>}
                  </div>
                </div>
              );
            })}
            {ctrlUsuarios.items.length>0 && (
              <div style={{padding:"10px 14px"}}>
                <Paginador pagina={ctrlUsuarios.pagina} totalPag={ctrlUsuarios.totalPag} setPagina={ctrlUsuarios.setPagina}/>
              </div>
            )}
          </div>

          {asignarCursoModal && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setAsignarCursoModal(false)}>
              <div style={{background:"white",borderRadius:16,padding:22,width:"100%",maxWidth:380}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>Asignar a curso</div>
                <div style={{fontSize:12,color:"#64748B",marginBottom:14}}>Los {selUsuarios.size} apoderados seleccionados quedan como Room Parent del curso que elijas.</div>
                <CursoListSelector cursos={cursosAnoActual} seleccionados={[]} onToggle={(cid)=>asignarCursoLote(cid)} multi={false} maxHeight={260}/>
                <button onClick={()=>setAsignarCursoModal(false)} style={{width:"100%",marginTop:14,padding:"10px 16px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>Cancelar</button>
              </div>
            </div>
          )}
        </>
            );
      })()}

      {sec==="cursos" && (() => {
        const conRP = cursosParaListado.filter(c=>usuarios.some(u=>u.rol==="room"&&u.cursos.includes(c.id))).length;
        const totalAlumnos = hijos.filter(h=>cursosParaListado.some(c=>c.id===h.curso_id)).length;
        const gridCols = "1.8fr 1.8fr 100px 130px";
        return (
        <>
          <ModuloStats items={[
            {n:cursosParaListado.length, l:`Cursos ${anoCursosMostrado}`},
            {n:conRP, l:"Con Room Parent", c:"#10B981", sub:`de ${cursosParaListado.length}`},
            {n:cursosParaListado.length-conRP, l:"Sin Room Parent", c:"#B45309"},
            {n:totalAlumnos, l:"Alumnos"},
          ]}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
            <span style={{fontSize:12.5,fontWeight:600,color:"#475569"}}>Año lectivo</span>
            <select value={anoCursosMostrado} onChange={e=>setAnoCursosSel(Number(e.target.value))} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,fontWeight:700,background:"white",outline:"none",fontFamily:"inherit",cursor:"pointer"}}>
              {(añosDisponibles.includes(anoActual+1)?añosDisponibles:[...añosDisponibles,anoActual+1]).sort((a,b)=>b-a).map(a=>(
                <option key={a} value={a}>{a}{a===anoActual?" (vigente)":""}</option>
              ))}
            </select>
          </div>
          <ListToolbar busqueda={ctrlCursos.busqueda} setBusqueda={ctrlCursos.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"id",label:"Más reciente"}]} sortKey={ctrlCursos.sortKey} sortAsc={ctrlCursos.sortAsc} toggleSort={ctrlCursos.toggleSort} filtros={{}} setFiltro={()=>{}} resetFiltros={ctrlCursos.resetFiltros} total={ctrlCursos.total} placeholder="Buscar curso..."/>

          <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,gap:12,padding:"10px 14px",background:"#F8FAFC",borderBottom:"1px solid #F1F5F9"}}>
              {!isMobile && <>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Curso</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Room Parent</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"center"}}>Alumnos</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"right"}}>Acciones</div>
              </>}
              {isMobile && <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{ctrlCursos.total} cursos</div>}
            </div>

            {ctrlCursos.items.length===0 ? (
              <EmptyState sinBorde icono="lupa" titulo="Ningún curso coincide" nota="Probá con otro nombre." accion="Limpiar filtros" onAccion={ctrlCursos.resetFiltros} style={{padding:"28px 20px"}}/>
            ) : ctrlCursos.items.map(c=>{
              const admins=usuarios.filter(u=>u.rol==="room"&&u.cursos.includes(c.id));
              const alumnosCurso=hijos.filter(h=>h.curso_id===c.id).length;
              return (
                <div key={c.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,alignItems:isMobile?"flex-start":"center",gap:12,padding:isMobile?"12px 14px":"11px 14px",borderBottom:"1px solid #F8FAFC"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <span style={{width:10,height:10,borderRadius:999,background:c.color||"#94A3B8",flexShrink:0}}/>
                    <div style={{fontSize:13.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nombre}</div>
                  </div>
                  <div style={{fontSize:12.5,color:"#64748B"}}>{admins.length>0?admins.map(a=>a.nombre).join(", "):<span style={{color:"#B45309",fontWeight:700}}>Sin asignar</span>}</div>
                  <div style={{fontSize:13,fontWeight:700,textAlign:isMobile?"left":"center"}}>{alumnosCurso}</div>
                  <div style={{display:"flex",gap:6,justifyContent:isMobile?"flex-start":"flex-end"}}>
                    <button onClick={()=>{ setForm({nombre:c.nombre,avatar:c.avatar,color:c.color,año_lectivo:c.año_lectivo+1,nivel:c.nivel||null,_duplicarDeId:c.id}); setModal("nuevo_curso"); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}} title={`Duplicar para ${c.año_lectivo+1}`}><Icono nombre="copiar" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>{ setForm({...c}); setModal("editar_curso"); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>setConfirm({nombre:c.nombre,msg:"Solo se puede borrar un curso sin alumnos ni contenido (recordatorios, eventos, colectas…). Se borra también su configuración: horarios, Room Parents, maestros, uniformes, útiles y libros.",action:()=>eliminarCurso(c.id)})} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>
                  </div>
                </div>
              );
            })}
          </div>
          <Paginador pagina={ctrlCursos.pagina} totalPag={ctrlCursos.totalPag} setPagina={ctrlCursos.setPagina}/>
        </>
        );
      })()}
      {sec==="alumnos" && (() => {
        const conApoderado = alumnos.filter(a=>(a.usuarios||[]).length>0).length;
        const sinCumple = alumnos.filter(a=>!a.fecha_nacimiento).length;
        const gridCols = "1.8fr 1.2fr 1.6fr 110px 96px";
        return (
        <>
          <ModuloStats items={[
            {n:alumnos.length, l:"Alumnos"},
            {n:conApoderado, l:"Con apoderado", c:"#10B981", sub:`de ${alumnos.length}`},
            {n:alumnos.length-conApoderado, l:"Sin apoderado", c:"#B45309"},
            {n:sinCumple, l:"Sin cumpleaños", c:"#94A3B8"},
          ]}/>
          <ImportarDesdeExcel onIr={()=>irSec("importar")}/>
          <ListToolbar busqueda={ctrlAlumnos.busqueda} setBusqueda={ctrlAlumnos.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"apellido",label:"Apellido"},{key:"nacimiento",label:"Cumpleaños"}]} sortKey={ctrlAlumnos.sortKey} sortAsc={ctrlAlumnos.sortAsc} toggleSort={ctrlAlumnos.toggleSort} filterOptions={[{key:"curso",label:"Curso",options:cursos.map(c=>({value:String(c.id),label:c.nombre}))}]} filtros={ctrlAlumnos.filtros} setFiltro={ctrlAlumnos.setFiltro} resetFiltros={ctrlAlumnos.resetFiltros} total={ctrlAlumnos.total} placeholder="Buscar alumno..."/>

          <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,gap:12,padding:"10px 14px",background:"#F8FAFC",borderBottom:"1px solid #F1F5F9"}}>
              {!isMobile && <>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Alumno</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Curso</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Apoderados</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Cumpleaños</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"right"}}>Acciones</div>
              </>}
              {isMobile && <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{ctrlAlumnos.total} alumnos</div>}
            </div>

            {ctrlAlumnos.items.length===0 ? (
              <EmptyState sinBorde icono="lupa" titulo="Ningún alumno coincide" nota="Probá con otro nombre, o saliendo del filtro de curso." accion="Limpiar filtros" onAccion={ctrlAlumnos.resetFiltros} style={{padding:"28px 20px"}}/>
            ) : ctrlAlumnos.items.map(a=>{
              const curso = cursos.find(c=>c.id===a.curso_id);
              const apoderados = (a.usuarios||[]).map(u=>u.usuarios).filter(Boolean);
              return (
                <div key={a.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,alignItems:isMobile?"flex-start":"center",gap:12,padding:isMobile?"12px 14px":"11px 14px",borderBottom:"1px solid #F8FAFC"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:34,height:34,borderRadius:999,background:"#F1F5F9",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{`${(a.nombre||"")[0]||""}${(a.apellido||"")[0]||""}`.toUpperCase()}</div>
                    <div style={{minWidth:0}}>
                      <button onClick={()=>setFichaAlumno(a)} title="Ver la ficha" style={{display:"block",maxWidth:"100%",border:"none",background:"none",padding:0,cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
                        <span style={{display:"block",fontSize:13.5,fontWeight:700,color:"#1D4ED8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fmtNombre(a)}</span>
                      </button>
                      {a.dni&&<div style={{fontSize:11.5,color:"#94A3B8",marginTop:1}}>DNI: {a.dni}</div>}
                    </div>
                  </div>
                  <div style={{fontSize:12.5,color:curso?"#334155":"#94A3B8"}}>{curso?curso.nombre:"—"}</div>
                  <div style={{fontSize:12.5,color:"#64748B"}}>{apoderados.length>0?apoderados.map(p=>`${p.nombre}${p.apellido?` ${p.apellido}`:""}`).join(", "):<span style={{color:"#B45309",fontWeight:700}}>Sin registrar</span>}</div>
                  <div style={{fontSize:12.5,color:a.fecha_nacimiento?"#334155":"#CBD5E1"}}>{a.fecha_nacimiento?fmtF(a.fecha_nacimiento):"—"}</div>
                  <div style={{display:"flex",gap:6,justifyContent:isMobile?"flex-start":"flex-end"}}>
                    <button onClick={()=>setFichaAlumno(a)} title="Ficha: familia, salidas, autorizaciones y mensajes" aria-label={`Ficha de ${fmtNombre(a)}`} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer"}}><Icono nombre="documento" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>{ setForm({...a}); setModal("editar_alumno"); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>setConfirm({nombre:fmtNombre(a),msg:"Esta acción no se puede deshacer.",action:()=>eliminarAlumno(a.id)})} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>
                  </div>
                </div>
              );
            })}
          </div>
          <Paginador pagina={ctrlAlumnos.pagina} totalPag={ctrlAlumnos.totalPag} setPagina={ctrlAlumnos.setPagina}/>
          <div style={{marginTop:14,fontSize:12,color:"#94A3B8",textAlign:"center"}}>Sin fecha de nacimiento el alumno no aparece en Cumpleaños.</div>
        </>
        );
      })()}

      {sec==="maestros" && (() => {
        const conCursos = maestros.filter(m=>(m.cursos||[]).length>0).length;
        const gridCols = "1.8fr 1.3fr 1.4fr 110px 90px";
        return (
        <>
          <ModuloStats items={[
            {n:maestros.length, l:"Maestros"},
            {n:maestros.filter(m=>m.activo).length, l:"Activos", c:"#10B981"},
            {n:maestros.filter(m=>!m.activo).length, l:"Inactivos", c:"#B45309"},
            {n:conCursos, l:"Con cursos", c:"#3B82F6", sub:`de ${maestros.length}`},
          ]}/>
          <ListToolbar busqueda={ctrlMaestros.busqueda} setBusqueda={ctrlMaestros.setBusqueda} sortOptions={[{key:"nombre",label:"Nombre"},{key:"materia",label:"Materia"}]} sortKey={ctrlMaestros.sortKey} sortAsc={ctrlMaestros.sortAsc} toggleSort={ctrlMaestros.toggleSort} filterOptions={[{key:"activo",label:"Estado",options:[{value:"si",label:"Activo"},{value:"no",label:"Inactivo"}]}]} filtros={ctrlMaestros.filtros} setFiltro={ctrlMaestros.setFiltro} resetFiltros={ctrlMaestros.resetFiltros} total={ctrlMaestros.total} placeholder="Buscar maestro o materia..."/>

          <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,gap:12,padding:"10px 14px",background:"#F8FAFC",borderBottom:"1px solid #F1F5F9"}}>
              {!isMobile && <>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Maestro</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Materia</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Cursos</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"center"}}>Estado</div>
                <div style={{fontSize:12,fontWeight:600,color:"#64748B",textAlign:"right"}}>Acciones</div>
              </>}
              {isMobile && <div style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{ctrlMaestros.total} maestros</div>}
            </div>

            {ctrlMaestros.items.length===0 ? (
              <EmptyState sinBorde icono="lupa" titulo="Ningún maestro coincide" nota="Probá con otro nombre, o saliendo del filtro de estado." accion="Limpiar filtros" onAccion={ctrlMaestros.resetFiltros} style={{padding:"28px 20px"}}/>
            ) : ctrlMaestros.items.map(m=>{
              const nombreCursos = (m.cursos||[]).map(cid=>cursos.find(c=>c.id===cid)?.nombre).filter(Boolean).join(", ");
              return (
                <div key={m.id} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":gridCols,alignItems:isMobile?"flex-start":"center",gap:12,padding:isMobile?"12px 14px":"11px 14px",borderBottom:"1px solid #F8FAFC",opacity:m.activo?1:0.55}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:34,height:34,borderRadius:999,background:"#F1F5F9",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{`${(m.nombre||"")[0]||""}${(m.apellido||"")[0]||""}`.toUpperCase()}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fmtNombre(m)}</div>
                      {m.email&&<div style={{fontSize:11.5,color:"#94A3B8",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.email}</div>}
                    </div>
                  </div>
                  <div style={{fontSize:13,color:"#334155"}}>{m.materia||"—"}</div>
                  <div style={{fontSize:12.5,color:"#64748B"}}>{nombreCursos||"—"}</div>
                  <div style={{textAlign:isMobile?"left":"center"}}>
                    <span style={{fontSize:12.5,fontWeight:600,color:m.activo?"#334155":"#94A3B8"}}>{m.activo?"Activo":"Inactivo"}</span>
                  </div>
                  <div style={{display:"flex",gap:6,justifyContent:isMobile?"flex-start":"flex-end"}}>
                    <button onClick={()=>{ setForm({...m,clases:null,_clasesOrig:[]}); setModal("editar_maestro"); cargarClasesMaestro(m.id).then(cl=>setForm(p=>p.id===m.id?{...p,clases:cl,_clasesOrig:cl}:p)); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                    <button onClick={()=>setConfirm({nombre:fmtNombre(m),msg:"Esta acción no se puede deshacer.",action:()=>eliminarMaestro(m.id)})} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>
                  </div>
                </div>
              );
            })}
          </div>
          <Paginador pagina={ctrlMaestros.pagina} totalPag={ctrlMaestros.totalPag} setPagina={ctrlMaestros.setPagina}/>
        </>
        );
      })()}

      {sec==="promocion"&&(
        <PromocionCurso cursos={cursos} anoActual={anoActual}/>
      )}
      {sec==="alertas"&&(
        <AlertasAdmin cursos={cursosAnoActual}/>
      )}
      {sec==="comunicaciones"&&(
        <ComunicacionesAdmin cursos={cursosAnoActual}/>
      )}
      {sec==="eventos"&&(
        <EventosColegio cursos={cursosAnoActual} userId={usuario?.id} esSuper={esSuper} usuarios={usuarios} abrirNuevo={crear?.tipo==="evento"?crear.n:null}/>
      )}
      {sec==="marketplace"&&(
        <MarketplaceColegio cursos={cursosAnoActual} userId={usuario?.id}/>
      )}
      {sec==="inicio"&&(
        <InicioColegio usuario={usuario} colegioNombre={colegioNombre} colegioId={activeColegioId} cursos={cursosAnoActual} hijos={hijos} usuarios={usuarios} maestros={maestros} esColegioAdmin={esStaffColegio} ocultas={esSecretaria?SOLO_ADMIN_COLEGIO:null} onIr={irSec} onCrear={(id)=>{ const o = OPCIONES_CREAR.find(x=>x.id===id); if(o) elegirCrear(o); }}/>
      )}
      {sec==="talleres"&&(
        <TalleresColegio colegioId={activeColegioId} cursos={cursosAnoActual} anoActual={anoActual}/>
      )}
      {sec==="mensajes_familias"&&!esSuper&&(
        <BandejaColegio userId={usuario?.id} isMobile={isMobile}/>
      )}
      {sec==="mensajes_personal"&&!esSuper&&(
        <Mensajes userId={usuario?.id} soloPersonal isMobile={isMobile}/>
      )}
      {sec==="denuncias"&&(
        <DenunciasColegio colegioId={activeColegioId}/>
      )}
      {sec==="soporte"&&esSuper&&(
        <BandejaSoporte userId={usuario?.id} isMobile={isMobile}/>
      )}
      {sec==="soporte_colegio"&&(
        <AyudaColegio rol={usuario?.rol} conChat={noLeidos.soporte>0} onIr={setSec}
          chat={<SoporteColegioAdmin userId={usuario?.id} colegioNombre={colegioNombre} isMobile={isMobile}/>}/>
      )}
      {sec==="perdidos"&&(
        <PerdidosColegio cursos={cursosAnoActual} colegioId={activeColegioId} userId={usuario?.id}/>
      )}
      {sec==="autorizaciones"&&(
        <AutorizacionesColegio cursos={cursosAnoActual} userId={usuario?.id} abrirNuevo={crear?.tipo==="autorizacion"?crear.n:null}/>
      )}
      {sec==="fotos"&&(
        <FotosEscolaresColegio cursos={cursosAnoActual} hijos={hijos} colegioNombre={colegioNombre}/>
      )}
      {sec==="salidas"&&(
        <CambiosSalidaColegio cursos={cursosAnoActual} onCambio={recontarPanel}/>
      )}
      {sec==="importar"&&(
        <ImportarDatos cursos={cursosAnoActual} hijos={hijos} usuarios={usuarios} colegioId={activeColegioId}
          puedeMenu={seccionesVisibles.some(g=>g.items.some(i=>i.id==="menu"))} onIr={irSec} onCambio={cargar} showToast={showToast}/>
      )}
      {sec==="configuracion"&&seccionConfig&&(
        <ConfiguracionInicio items={seccionConfig.items} cursos={cursosAnoActual} maestros={maestros}
          directivos={usuarios.filter(u=>u.rol==="colegio_admin"||u.rol==="nivel_admin").length}
          membreteListo={!!(membrete.linea||membrete.firma)} onIr={irSec}/>
      )}
      {sec==="adopcion"&&(
        <Card style={{padding:18}}><AdopcionTabla cursos={cursosAnoActual}/></Card>
      )}
      {sec==="materias"&&(
        <MateriasAdmin colegioId={activeColegioId} anoActual={anoActual} showToast={showToast} niveles={colegioNiveles} nivelesPropios={esSecretaria?(usuario?.niveles||[]):null}/>
      )}
      {sec==="horarios"&&(
        <HorariosAdmin cursos={cursosAnoActual} colegioId={activeColegioId} showToast={showToast}/>
      )}
      {sec==="uniformes"&&(
        <UniformesAdmin cursos={cursosAnoActual}/>
      )}
      {sec==="colegios"&&esSuper&&(
        <div>
          {colegios.length===0&&<EmptyState icono="escuela" titulo="Todavía no hay colegios" nota="Creá el primero con “Nuevo”."/>}
          {colegios.length>0&&(
            <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
              {colegios.map((c,i)=>(
                <button key={c.id} onClick={()=>{ setColegioId(c.id); setSec("inicio"); }} style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"14px 18px",border:"none",borderTop:i?"1px solid #F1F5F9":"none",background:"white",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                  <Icono nombre="escuela" size={20} color="#475569"/>
                  <span style={{flex:1,minWidth:0,display:"block"}}>
                    <span style={{display:"block",fontSize:14.5,fontWeight:700,color:"#0F172A"}}>{c.nombre||"(sin nombre)"}</span>
                    <span style={{display:"block",fontSize:12.5,color:"#64748B",marginTop:2}}>Año lectivo {c.año_lectivo_actual}</span>
                  </span>
                  <span style={{fontSize:13,fontWeight:700,color:"#2563EB"}}>Entrar</span>
                  <Icono nombre="flecha" size={15} color="#2563EB"/>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sec==="super_admins"&&esSuper&&(
        <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
          {superAdmins.length===0&&<EmptyState sinBorde icono="usuarios" titulo="No hay cuentas Super Admin" style={{padding:16}}/>}
          {superAdmins.map(u=>(
            <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                <div style={{width:38,height:38,borderRadius:999,background:"#F1F5F9",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,flexShrink:0}}>{`${(u.nombre||"")[0]||""}${(u.apellido||"")[0]||""}`.toUpperCase()}</div>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</div>
                  <div style={{fontSize:12.5,color:"#64748B",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                {!u.activo&&<Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                <button onClick={()=>{ setFormSuper({...u,_emailOriginal:u.email}); setModalSuper({edit:u}); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                <button onClick={()=>toggleActivo(u)} title={u.activo?"Desactivar":"Activar"} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer"}}><Icono nombre={u.activo?"cerrar":"check"} size={15} color="#64748B" style={{margin:"0 auto"}}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalColegio==="nuevo"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginBottom:4}}>Nuevo colegio</div>
            <div style={{fontSize:12.5,color:"#64748B",marginBottom:16}}>Crea el colegio y, si querés, su primer administrador.</div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Nombre del colegio</div>
              <input value={form.nombre||""} onChange={e=>setForm(p=>({...p,nombre:e.target.value}))} placeholder="Ej: Colegio San Martín" style={inp}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Año lectivo inicial</div>
              <input type="number" value={form.año_lectivo_actual||""} onChange={e=>setForm(p=>({...p,año_lectivo_actual:e.target.value}))} style={inp}/>
            </div>
            <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:8,borderTop:"1px solid #F1F5F9",paddingTop:12}}>Primer administrador (opcional)</div>
            {[{l:"Nombre",k:"adminNombre"},{l:"Apellido",k:"adminApellido"},{l:"Email",k:"adminEmail"}].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>{f.l}</div>
                <input value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Contraseña</div>
              <input type="password" value={form.adminPass||""} onChange={e=>setForm(p=>({...p,adminPass:e.target.value}))} style={inp}/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setModalColegio(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={guardarColegioNuevo} disabled={savingColegio} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{savingColegio?"Creando...":"Crear colegio"}</button>
            </div>
          </Card>
        </div>
      )}

      {(sec==="colegio"||sec==="directivos")&&(() => {
        const colegioIdActivo = esStaffColegio?miColegioId:colegioId;
        // Solo super gestiona los colegio_admin de un colegio (RLS bloquea a
        // un colegio_admin crear/editar pares suyos — ver usuarios_insert/
        // update en multi-colegio.sql), así que este bloque no se ofrece a
        // colegio_admin. `usuarios` ya viene scopeado a este colegio por
        // cargar() (colegio_id===colegioIdActivo), colegio_admin incluido.
        const adminsDelColegio = usuarios.filter(u=>u.rol==="colegio_admin");
        const secretarias = usuarios.filter(u=>u.rol==="nivel_admin");
        const guardarNiveles = async (lista) => {
          const niveles = ordenarNiveles(lista);
          const { error } = await supabase.from("colegios").update({ niveles }).eq("id", colegioIdActivo);
          if(error) { showToast(`No se pudieron guardar los niveles: ${error.message}`,"error"); return; }
          setColegioNiveles(niveles);
        };
        return (
          <>
            {sec==="directivos"&&<>
            {(
              <div style={{marginBottom:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>Administradores de {colegioNombre}</div>
                    <div style={{fontSize:12.5,color:"#64748B",marginTop:2}}>Gestionan todo este colegio (usuarios, cursos, alumnos, etc). No requieren curso ni hijos.{esSuper?"":" Los da de alta el equipo de tribbu."}</div>
                  </div>
                  {esSuper&&<BotonNuevo label="Nuevo administrador" onClick={()=>{ setFormAdmin({nombre:"",apellido:"",email:"",pass:"",activo:true,rol:"colegio_admin"}); setModalAdmin("nuevo"); }}/>}
                </div>
                <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
                  {adminsDelColegio.length===0 && <EmptyState sinBorde icono="usuarios" titulo="Todavía no hay administradores" nota="Los da de alta el equipo de tribbu." style={{padding:16}}/>}
                  {adminsDelColegio.map(u=>(
                    <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid #F1F5F9"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                        <div style={{width:34,height:34,borderRadius:999,background:"#F1F5F9",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{`${(u.nombre||"")[0]||""}${(u.apellido||"")[0]||""}`.toUpperCase()}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</div>
                          <div style={{fontSize:11.5,color:"#94A3B8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.email}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        {!u.activo&&<Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                        {esSuper&&<button onClick={()=>{ setFormAdmin({...u,rol:"colegio_admin",_emailOriginal:u.email}); setModalAdmin({edit:u}); }} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>}
                        {esSuper&&<button onClick={()=>toggleActivo(u)} title={u.activo?"Desactivar":"Activar"} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer"}}><Icono nombre={u.activo?"cerrar":"check"} size={15} color="#64748B" style={{margin:"0 auto"}}/></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>Niveles</div>
              <div style={{fontSize:12.5,color:"#64748B",marginTop:2,marginBottom:10}}>Los niveles que tiene el colegio. Con más de uno, cada curso lleva su nivel y podés mandar comunicados o cargar el menú por nivel, y sumar directivos por nivel (Dirección, Secretaría…).</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {NIVELES.map(n=>{
                  const on=colegioNiveles.includes(n.k);
                  return <button key={n.k} onClick={()=>guardarNiveles(on?colegioNiveles.filter(x=>x!==n.k):[...colegioNiveles,n.k])} style={{padding:"6px 12px",borderRadius:999,border:`1px solid ${on?"#3B82F6":"#E2E8F0"}`,background:on?"#EFF6FF":"white",color:on?"#1D4ED8":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700}}>{on?"✓ ":""}{n.l}</button>;
                })}
              </div>
            </div>
            {colegioNiveles.length>1&&(
              <div style={{marginBottom:24}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>Directivos por nivel</div>
                    <div style={{fontSize:12.5,color:"#64748B",marginTop:2}}>Dirección, Secretaría, Coordinación… Gestionan solo los cursos de sus niveles (todos pueden lo mismo, el cargo es el nombre que se ve): comunicados, eventos, autorizaciones, alertas, horarios, alumnos y familias, Room Parents y los mensajes a Secretaría. No tocan cursos, maestras, menú ni datos del colegio.</div>
                  </div>
                  <BotonNuevo label="Nuevo directivo" onClick={()=>{ setFormAdmin({nombre:"",apellido:"",email:"",pass:"",activo:true,rol:"nivel_admin",niveles:[],cargo:CARGO_DEFECTO}); setModalAdmin("nuevo"); }}/>
                </div>
                <div style={{border:"1px solid #E2E8F0",borderRadius:16,background:"white",overflow:"hidden"}}>
                  {secretarias.length===0 && <EmptyState sinBorde icono="usuarios" titulo="Todavía no hay directivos por nivel" nota="Dirección, Secretaría o Coordinación de un nivel: gestionan solo los cursos de sus niveles." style={{padding:16}}/>}
                  {secretarias.map(u=>(
                    <div key={u.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid #F1F5F9"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{u.nombre}{u.apellido?` ${u.apellido}`:""}</div>
                        <div style={{fontSize:11.5,color:"#94A3B8",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{textoSecretaria(u.niveles, u.cargo)} · {u.email}</div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        {!u.activo&&<Pill label="Inactivo" color="#94A3B8" bg="#F1F5F9"/>}
                        <button onClick={()=>{ setFormAdmin({...u,rol:"nivel_admin",niveles:u.niveles||[],cargo:u.cargo||CARGO_DEFECTO,_emailOriginal:u.email}); setModalAdmin({edit:u}); }} aria-label="Editar" style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                        <button onClick={()=>toggleActivo(u)} aria-label={u.activo?"Desactivar":"Activar"} title={u.activo?"Desactivar":"Activar"} style={{width:32,height:32,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer"}}><Icono nombre={u.activo?"cerrar":"check"} size={15} color="#64748B" style={{margin:"0 auto"}}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {colegioNiveles.length<2&&(
              <div style={{marginBottom:24,padding:"12px 14px",borderRadius:12,background:"#F8FAFC",border:"1px solid #E2E8F0",fontSize:12.5,color:"#64748B"}}>Para dar de alta directivos por nivel (Dirección, Secretaría…), marcá al menos dos niveles arriba.</div>
            )}
            </>}
            {sec==="colegio"&&<>
            <MembreteColegio colegioId={colegioIdActivo} colegioNombre={colegioNombre} niveles={colegioNiveles} valor={membrete} onGuardado={setMembrete} showToast={showToast}/>
            <Contacto isSuperAdmin={true} colegioId={colegioIdActivo}/>
            </>}
          </>
        );
      })()}

      {sec==="menu"&&(
        <div>
          <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:4}}>Menú del comedor</div>
          <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>Cargá el menú mensual desde un archivo Excel, revisá lo ya cargado (incluidos meses anteriores) y editá un día puntual sin tener que resubir todo.</div>
          <Comedor cursoId="superadmin-menu" isAdmin={false} isSuper={true} isMobile={isMobile} colegioId={esStaffColegio?miColegioId:colegioId} niveles={colegioNiveles}/>
          <div style={{marginTop:16,background:"#F8FAFC",borderRadius:14,padding:"16px 18px",border:"1px solid #E2E8F0"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:10}}>Formato esperado del Excel</div>
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
            <div style={{marginTop:12,fontSize:11,color:"#94A3B8"}}>Los nombres de columna se detectan automáticamente por palabra clave — cualquier columna que contenga "fecha", "plato", "postre", etc. es reconocida.</div>
          </div>
        </div>
      )}
        </div>
    </div>
  );
}

// Promoción de curso: bloque origen (año vigente) → destino (año siguiente,
// ya creado vía "Duplicar" en Cursos), lista de alumnos pre-tildada con
// posibilidad de destildar repitentes/egresados antes de confirmar. Un solo
// update en bloque de hijos.curso_id — recordatorios/eventos/colectas/etc.
// del curso de origen quedan intactos, atados a esa fila de curso vieja.
function PromocionCurso({ cursos, anoActual }) {
  const [origenId, setOrigenId]         = useState(null);
  const [destinoId, setDestinoId]       = useState(null);
  const [alumnos, setAlumnos]           = useState([]);
  const [seleccionados, setSeleccionados] = useState([]);
  const [cargando, setCargando]         = useState(false);
  const [confirmando, setConfirmando]   = useState(false);
  const [promoviendo, setPromoviendo]   = useState(false);
  const [hecho, setHecho]               = useState(null);
  const [conteos, setConteos]           = useState({}); // curso_id -> nº alumnos
  const { showToast, Toast } = useToast();

  const cursosOrigen  = cursos.filter(c=>c.año_lectivo===anoActual);
  const cursosDestino = cursos.filter(c=>c.año_lectivo===anoActual+1);
  const destinoDeOrigen = (nombreOrigen) => cursosDestino.find(c=>c.nombre===nombreOrigen);

  // Tabla resumen origen → destino: se calcula una sola vez por curso vigente,
  // para mostrar de un vistazo qué cursos ya tienen destino creado y cuántos
  // alumnos hay que promover, antes de entrar al detalle de uno.
  useEffect(()=>{
    if(cursosOrigen.length===0) return;
    supabase.from("hijos").select("curso_id").in("curso_id", cursosOrigen.map(c=>c.id)).then(({data})=>{
      const c = {};
      for(const h of (data||[])) c[h.curso_id] = (c[h.curso_id]||0)+1;
      setConteos(c);
    });
  },[cursos, anoActual]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegirOrigen = async (id) => {
    setOrigenId(id); setDestinoId(null); setHecho(null); setConfirmando(false);
    setCargando(true);
    const { data } = await supabase.from("hijos").select("id,nombre,apellido").eq("curso_id",id).order("nombre");
    setAlumnos(data||[]);
    setSeleccionados((data||[]).map(a=>a.id));
    setCargando(false);
  };

  const toggleAlumno = (id) => setSeleccionados(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const confirmar = async () => {
    if(!destinoId||!seleccionados.length) return;
    setPromoviendo(true);
    const { error } = await supabase.from("hijos").update({curso_id:destinoId}).in("id",seleccionados);
    setPromoviendo(false); setConfirmando(false);
    if(error) { showToast("Error al promover alumnos", "error"); return; }
    setHecho({ n:seleccionados.length, cursoNombre: cursosDestino.find(c=>c.id===destinoId)?.nombre });
    setOrigenId(null); setDestinoId(null); setAlumnos([]); setSeleccionados([]);
  };

  return (
    <div>
      <Toast />
      <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:4}}>Promoción de curso</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:20}}>Pasá a los alumnos de un curso al año siguiente. Los recordatorios, eventos, colectas y demás información del curso de origen quedan intactos — no se mueven ni se mezclan con el curso nuevo.</div>

      {hecho&&(
        <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:12,padding:"12px 16px",marginBottom:16,fontSize:13,fontWeight:700,color:"#10B981"}}>
          ✅ {hecho.n} alumno{hecho.n!==1?"s":""} promovido{hecho.n!==1?"s":""} a {hecho.cursoNombre}.
        </div>
      )}

      {cursosOrigen.length>0&&(
        <div style={{marginBottom:20,border:"1.5px solid #E2E8F0",borderRadius:12,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1.4fr 24px 1.4fr 90px",gap:8,padding:"8px 14px",background:"#F8FAFC",fontSize:10.5,fontWeight:800,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.5}}>
            <span>Origen ({anoActual})</span><span/><span>Destino ({anoActual+1})</span><span>Estado</span>
          </div>
          {cursosOrigen.map((co,i)=>{
            const dest = destinoDeOrigen(co.nombre);
            const n = conteos[co.id]||0;
            return (
              <div key={co.id} style={{display:"grid",gridTemplateColumns:"1.4fr 24px 1.4fr 90px",gap:8,alignItems:"center",padding:"10px 14px",borderTop:i>0?"1px solid #F1F5F9":"none"}}>
                <span style={{fontSize:12.5,fontWeight:600,color:"#0F172A"}}>{co.avatar} {co.nombre} <span style={{color:"#94A3B8",fontWeight:500}}>({n})</span></span>
                <span style={{color:"#CBD5E1",fontSize:12}}>→</span>
                <span style={{fontSize:12.5,color:dest?"#0F172A":"#CBD5E1",fontWeight:dest?600:500}}>{dest?`${dest.avatar} ${dest.nombre}`:"— sin crear —"}</span>
                <span style={{fontSize:10.5,fontWeight:800,padding:"3px 8px",borderRadius:8,textAlign:"center",background:dest?"#F0FDF4":"#FFFBEB",color:dest?"#10B981":"#B45309"}}>{dest?"Listo":"Falta"}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{marginBottom:16}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:6}}>Curso de origen ({anoActual})</div>
        <CursoListSelector cursos={cursosOrigen} seleccionados={origenId?[origenId]:[]} onToggle={elegirOrigen} multi={false}/>
      </div>

      {origenId&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:6}}>Curso de destino ({anoActual+1})</div>
          {cursosDestino.length===0?(
            <div style={{fontSize:12,color:"#94A3B8",padding:14,border:"1.5px dashed #E2E8F0",borderRadius:12,textAlign:"center"}}>Todavía no hay ningún curso creado para {anoActual+1}. Duplicá el curso desde "🏫 Cursos" primero.</div>
          ):(
            <CursoListSelector cursos={cursosDestino} seleccionados={destinoId?[destinoId]:[]} onToggle={setDestinoId} multi={false}/>
          )}
        </div>
      )}

      {origenId&&cargando&&<Spinner/>}

      {origenId&&!cargando&&alumnos.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:12.5,fontWeight:600,color:"#475569"}}>Alumnos ({seleccionados.length}/{alumnos.length})</div>
            <button onClick={()=>setSeleccionados(seleccionados.length===alumnos.length?[]:alumnos.map(a=>a.id))} style={{fontSize:11,fontWeight:700,color:"#3B82F6",background:"none",border:"none",cursor:"pointer"}}>{seleccionados.length===alumnos.length?"Ninguno":"Todos"}</button>
          </div>
          <div style={{border:"1.5px solid #E2E8F0",borderRadius:12,maxHeight:280,overflowY:"auto"}}>
            {alumnos.map((a,i)=>{
              const sel = seleccionados.includes(a.id);
              return (
                <label key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderTop:i>0?"1px solid #F1F5F9":"none",background:sel?"#EFF6FF":"white"}}>
                  <input type="checkbox" checked={sel} onChange={()=>toggleAlumno(a.id)} style={{width:16,height:16,cursor:"pointer",flexShrink:0}}/>
                  <span style={{fontSize:13,fontWeight:sel?700:500,color:sel?"#0F172A":"#475569"}}>{fmtNombre(a)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {origenId&&!cargando&&alumnos.length===0&&(
        <div style={{fontSize:13,color:"#94A3B8",marginBottom:16}}>Este curso no tiene alumnos.</div>
      )}

      {origenId&&destinoId&&seleccionados.length>0&&(
        confirmando?(
          <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#92400E",marginBottom:6}}>¿Promover {seleccionados.length} alumno{seleccionados.length!==1?"s":""} a {cursosDestino.find(c=>c.id===destinoId)?.nombre}?</div>
            <div style={{fontSize:12,color:"#92400E",lineHeight:1.5,marginBottom:10}}>
              {alumnos.length-seleccionados.length>0&&<>{alumnos.length-seleccionados.length} alumno{alumnos.length-seleccionados.length!==1?"s":""} de este curso NO se promueve{alumnos.length-seleccionados.length!==1?"n":""} y queda{alumnos.length-seleccionados.length!==1?"n":""} con su curso actual. </>}
              Los que sí se promuevan van a ver el curso nuevo apenas confirmes — recordatorios, eventos, colectas y encuestas del curso {cursosOrigen.find(c=>c.id===origenId)?.nombre} quedan donde están, no se mueven ni se borran.
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setConfirmando(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={confirmar} disabled={promoviendo} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{promoviendo?"Promoviendo...":"Sí, promover"}</button>
            </div>
          </div>
        ):(
          <button onClick={()=>setConfirmando(true)} style={{width:"100%",padding:12,borderRadius:12,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Promover {seleccionados.length} alumno{seleccionados.length!==1?"s":""}</button>
        )
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
        <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>Enviar alerta</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Este mensaje se mostrará de forma destacada a todos los apoderados del curso.</div>
        <textarea value={msg} onChange={e=>setMsg(e.target.value)} placeholder="Ej: Se suspenden las clases de mañana por paro docente." rows={4} style={{...inp,resize:"vertical",marginBottom:16}}/>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
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
  const [cursosConAlerta, setCursosConAlerta] = useState(new Set());

  // Header de módulo con stats (handoff Tribbu Admin, Parte 5): cuántos
  // cursos tienen una alerta activa AHORA, antes de elegir uno.
  useEffect(()=>{
    if(!cursos.length) return;
    supabase.from("alertas").select("curso_id").in("curso_id", cursos.map(c=>c.id)).eq("activa",true).then(({data})=>{
      setCursosConAlerta(new Set((data||[]).map(a=>a.curso_id)));
    });
  },[cursos]);

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
    const userIds = await getUserIdsParaAlerta(cursoSel.id);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    setLoading(false); setModal(false); cargar(cursoSel.id);
    setCursosConAlerta(p=>new Set([...p, cursoSel.id]));
  };

  const dismiss = async () => {
    if(alerta) {
      await supabase.from("alertas").update({activa:false}).eq("id",alerta.id);
      cargar(cursoSel.id);
      setCursosConAlerta(p=>{ const n=new Set(p); n.delete(cursoSel.id); return n; });
    }
  };

  return (
    <div>
      {modal&&<AlertaModal onClose={()=>setModal(false)} onEnviar={enviar}/>}
      <ModuloStats items={[
        {n:cursos.length, l:"Cursos"},
        {n:cursosConAlerta.size, l:"Con alerta activa", c:"#EF4444"},
        {n:cursos.length-cursosConAlerta.size, l:"Sin alerta", c:"#10B981"},
      ]}/>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Seleccioná un curso para enviar una alerta</div>
      <div style={{marginBottom:20}}>
        <CursoListSelector cursos={cursos} seleccionados={cursoSel?[cursoSel.id]:[]} onToggle={id=>selCurso(cursos.find(c=>c.id===id))} multi={false}/>
      </div>
      {cursoSel&&(
        <div>
          {alerta?(
            <div style={{background:"white",border:"1px solid #FECACA",borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:12,marginBottom:12,flexWrap:"wrap"}}>
              <Icono nombre="alerta" size={20} color="#DC2626" style={{marginTop:2}}/>
              <div style={{flex:"1 1 220px",minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:"#B91C1C",marginBottom:2}}>Alerta activa · {cursoSel.nombre}</div>
                <div style={{fontSize:14,fontWeight:600,color:"#0F172A",lineHeight:1.45}}>{alerta.mensaje}</div>
              </div>
              <div style={{display:"flex",gap:16,alignItems:"center"}}>
                <button onClick={()=>setModal(true)} style={{padding:0,border:"none",background:"none",cursor:"pointer",fontSize:13.5,fontWeight:700,color:"#2563EB",fontFamily:"inherit"}}>Editar</button>
                <button onClick={dismiss} style={{padding:0,border:"none",background:"none",cursor:"pointer",fontSize:13.5,fontWeight:700,color:"#64748B",fontFamily:"inherit"}}>Desactivar</button>
              </div>
            </div>
          ):(
            <EmptyState icono="alerta" titulo={`Sin alerta activa en ${cursoSel.nombre}`} nota="Las alertas suenan en el celular de todas las familias del curso: usalas solo para avisos urgentes." accion="Enviar alerta" onAccion={()=>!loading&&setModal(true)}/>
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
// Membrete de los comunicados (specs/comunicados-con-formato.md): una línea
// debajo del nombre del colegio y una firma; por nivel se puede cambiar.
function MembreteColegio({ colegioId, colegioNombre, niveles, valor, onGuardado, showToast }) {
  const [form, setForm] = useState(valor);
  const [guardando, setGuardando] = useState(false);
  const [base, setBase] = useState(valor);
  if (valor !== base) { setBase(valor); setForm(valor); } // ajuste en render al recargar
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const lbl = {fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5};
  const setNivel = (k, campo, v) => setForm(p=>({...p,niveles:{...p.niveles,[k]:{...(p.niveles?.[k]||{}),[campo]:v}}}));
  const guardar = async () => {
    setGuardando(true);
    const membrete_niveles = Object.fromEntries(Object.entries(form.niveles||{}).map(([k,v])=>[k,{linea:sanitize(v?.linea||"")||null,firma:sanitize(v?.firma||"")||null}]).filter(([,v])=>v.linea||v.firma));
    const fila = { membrete_linea:sanitize(form.linea)||null, membrete_firma:sanitize(form.firma)||null, membrete_niveles };
    const { error } = await supabase.from("colegios").update(fila).eq("id", colegioId);
    setGuardando(false);
    if (error) { showToast(`No se pudo guardar el membrete: ${error.message}`,"error"); return; }
    showToast("Membrete guardado","ok");
    onGuardado({ linea:fila.membrete_linea||"", firma:fila.membrete_firma||"", niveles:membrete_niveles });
  };
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontSize:16,fontWeight:800,color:"#0F172A"}}>Membrete de los comunicados</div>
      <div style={{fontSize:12.5,color:"#64748B",marginTop:2,marginBottom:10}}>Los comunicados que mandes con “Con membrete” se ven con el logo y el nombre de {colegioNombre||"el colegio"} arriba, esta línea debajo y la firma al final.</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
        <div style={{flex:"1 1 220px"}}><div style={lbl}>Línea (opcional)</div><input value={form.linea||""} onChange={e=>setForm(p=>({...p,linea:e.target.value}))} placeholder="Ej: Ciclo lectivo 2026" style={inp}/></div>
        <div style={{flex:"1 1 220px"}}><div style={lbl}>Firma (opcional)</div><input value={form.firma||""} onChange={e=>setForm(p=>({...p,firma:e.target.value}))} placeholder="Ej: Dirección" style={inp}/></div>
      </div>
      {niveles.length>1&&niveles.map(k=>(
        <div key={k} style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:10}}>
          <div style={{flex:"1 1 220px"}}><div style={lbl}>Línea · {nombreNivel(k)}</div><input value={form.niveles?.[k]?.linea||""} onChange={e=>setNivel(k,"linea",e.target.value)} placeholder="Si queda vacía, va la general" style={inp}/></div>
          <div style={{flex:"1 1 220px"}}><div style={lbl}>Firma · {nombreNivel(k)}</div><input value={form.niveles?.[k]?.firma||""} onChange={e=>setNivel(k,"firma",e.target.value)} placeholder={`Ej: Dirección de ${nombreNivel(k)}`} style={inp}/></div>
        </div>
      ))}
      <button onClick={guardar} disabled={guardando} style={{padding:"9px 16px",borderRadius:10,border:"none",background:guardando?"#93C5FD":"#2563EB",color:"white",cursor:guardando?"default":"pointer",fontSize:12.5,fontWeight:700}}>{guardando?"Guardando…":"Guardar membrete"}</button>
    </div>
  );
}

export function ComunicacionesAdmin({ cursos }) {
  const [userId, setUserId] = useState(null);
  const [cursosSel, setCursosSel] = useState([]);
  const [form, setForm] = useState({ titulo:"", texto:"", fecha:fmtLocalDate(), hora_inicio:"", hora_fin:"", prioridad:"media", urgente:false, adjuntos:[], enviarPush:true, conMembrete:true });
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
    if(!form.titulo?.trim() || !form.texto?.trim() || !form.fecha || cursosSel.length===0) return;
    setPublicando(true);
    setError(null);
    try {
      const grupo_id = uuidLite();
      const rows = cursosSel.map(curso_id=>({
        titulo: sanitize(form.titulo), texto: sanitize(form.texto), fecha: form.fecha, hora_inicio: form.hora_inicio||null, hora_fin: form.hora_fin||null,
        prioridad: form.prioridad||"media", urgente: form.urgente||false, adjuntos: form.adjuntos||[], curso_id, grupo_id, creado_por: userId,
        con_membrete: !!form.conMembrete,
      }));
      const { error: insertErr } = await supabase.from("recordatorios").insert(rows);
      if(insertErr) throw insertErr;
      if(form.enviarPush) {
        const userIds = [...new Set((await Promise.all(cursosSel.map(getUserIdsByCurso))).flat())];
        // `grupo`: cada familia recibe la fila de SU curso; la app la busca por grupo_id.
        if(userIds.length) await sendPush({ type:"recordatorio", payload:{ titulo:form.titulo, grupo:grupo_id, userIds } });
      }
      setConfirmando(false);
      setOk(`Publicado en ${cursosSel.length} curso${cursosSel.length!==1?"s":""}${form.enviarPush?" · con push":" · sin push"}.`);
      setForm({ titulo:"", texto:"", fecha:fmtLocalDate(), hora_inicio:"", hora_fin:"", prioridad:"media", urgente:false, adjuntos:[], enviarPush:true, conMembrete:true });
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
      {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12.5,fontWeight:700,color:"#B91C1C"}}>{error}</div>}

      <div style={{marginBottom:10}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Título</div>
        <input value={form.titulo} onChange={e=>setForm(p=>({...p,titulo:e.target.value}))} placeholder="Ej: Reunión general de padres" style={inp}/>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Descripción</div>
        <EditorFormato value={form.texto} onChange={v=>setForm(p=>({...p,texto:v}))} placeholder="Ej: El viernes 15 a las 18hs, en el SUM." rows={6} style={{...inp,resize:"vertical"}}/>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:140}}>
          <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Fecha</div>
          <input type="date" value={form.fecha||""} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={inp}/>
        </div>
        <div style={{minWidth:100}}>
          <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Hora inicio (opcional)</div>
          <input type="time" value={form.hora_inicio||""} onChange={e=>setForm(p=>({...p,hora_inicio:e.target.value}))} style={inp}/>
        </div>
        <div style={{minWidth:100}}>
          <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Hora fin (opcional)</div>
          <input type="time" value={form.hora_fin||""} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={inp}/>
        </div>
        <div>
          <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Prioridad</div>
          <div style={{display:"flex",gap:6}}>
            {["alta","media","baja"].map(p=>(
              <button key={p} onClick={()=>setForm(f=>({...f,prioridad:p}))} style={{padding:"7px 12px",borderRadius:8,border:`1.5px solid ${form.prioridad===p?PRIO[p].c:"#E2E8F0"}`,background:form.prioridad===p?PRIO[p].bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.prioridad===p?PRIO[p].c:"#94A3B8"}}>{PRIO[p].l}</button>
            ))}
          </div>
        </div>
      </div>
      {/* Opciones como casillas con su explicación (antes, tres pastillas con colores). */}
      <div style={{marginBottom:16,display:"flex",flexDirection:"column",gap:10}}>
        {[
          {k:"enviarPush", t:"Mandar notificación", n:"Les suena en el celular a las familias de los cursos elegidos."},
          {k:"conMembrete", t:"Con membrete del colegio", n:"Al abrirlo se ve con el logo, la línea y la firma del colegio."},
          {k:"urgente", t:"Marcar como urgente", n:"Aparece arriba de todo en Avisos, en rojo."},
        ].map(o=>(
          <label key={o.k} style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer"}}>
            <input type="checkbox" checked={!!form[o.k]} onChange={()=>setForm(p=>({...p,[o.k]:!p[o.k]}))} style={{width:16,height:16,marginTop:2,accentColor:"#2563EB",cursor:"pointer",flexShrink:0}}/>
            <span style={{display:"block"}}>
              <span style={{display:"block",fontSize:13.5,fontWeight:600,color:"#0F172A"}}>{o.t}</span>
              <span style={{display:"block",fontSize:12.5,color:"#64748B",marginTop:1}}>{o.n}</span>
            </span>
          </label>
        ))}
      </div>
      <div style={{marginBottom:20}}>
        <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Adjuntos (opcional)</div>
        <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId="comunicaciones" onUploadingChange={setSubiendoAdj}/>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <div style={{fontSize:14,fontWeight:700,color:"#0F172A"}}>¿A qué cursos va?</div>
        {cursos.length>0&&<button onClick={seleccionarTodos} style={{border:"none",background:"none",color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:700}}>{todosSeleccionados?"Ninguno":"Seleccionar todos"}</button>}
      </div>
      <div style={{marginBottom:20}}>
        <CursoListSelector cursos={cursos} seleccionados={cursosSel} onToggle={toggleCurso}/>
      </div>

      {!confirmando ? (
        <button onClick={()=>setConfirmando(true)} disabled={!form.titulo?.trim()||!form.texto?.trim()||!form.fecha||cursosSel.length===0||subiendoAdj} style={{width:"100%",padding:"12px 16px",borderRadius:12,border:"none",background:(!form.titulo?.trim()||!form.texto?.trim()||!form.fecha||cursosSel.length===0||subiendoAdj)?"#CBD5E1":"#3B82F6",color:"white",fontSize:13,fontWeight:700,cursor:(!form.titulo?.trim()||!form.texto?.trim()||!form.fecha||cursosSel.length===0||subiendoAdj)?"default":"pointer"}}>
          Publicar
        </button>
      ) : (
        <div style={{background:"white",border:"1px solid #E2E8F0",borderRadius:12,padding:"14px 16px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:12}}>¿Publicar en {cursosSel.length} curso{cursosSel.length!==1?"s":""}?</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmando(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
            <button onClick={publicar} disabled={publicando} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#2563EB",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{publicando?"Publicando...":"Sí, publicar"}</button>
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
  const [editando,       setEditando]       = useState(null); // grupo_id en edición, o null
  const [editForm,       setEditForm]       = useState({ titulo:"", texto:"", hora_inicio:"", hora_fin:"" });
  const [guardandoEdit,  setGuardandoEdit]  = useState(false);
  const [editError,      setEditError]      = useState(null);
  const [verLecturas,    setVerLecturas]    = useState(null); // comunicación con "¿quién la leyó?" abierto

  const cursoPorId = new Map(cursos.map(c=>[c.id,c]));

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("recordatorios")
      .select("id,titulo,texto,fecha,hora_inicio,hora_fin,prioridad,urgente,curso_id,grupo_id,creado_en")
      .not("grupo_id","is",null)
      .order("creado_en",{ascending:false})
      .limit(300);
    // Una comunicación multi-curso genera N filas (una por curso) con el mismo
    // grupo_id — se agrupan en una sola entrada del historial.
    const grupos = new Map();
    for(const r of (data||[])) {
      const g = grupos.get(r.grupo_id);
      if(g) { g.cursoIds.push(r.curso_id); g.ids.push(r.id); }
      else grupos.set(r.grupo_id, { ...r, cursoIds:[r.curso_id], ids:[r.id] });
    }
    const lista = [...grupos.values()].sort((a,b)=> (b.creado_en||"").localeCompare(a.creado_en||""));

    // Lectura por comunicación, con la misma RPC que el "¿quién lo leyó?" de
    // Recordatorios (lecturas_de_recordatorios: destinatarios = familias con
    // hijos en el curso). Una familia con hijos en dos de los cursos alcanzados
    // cuenta una vez: leída si leyó cualquiera de sus filas.
    const allIds = (data||[]).map(r=>r.id);
    const { data: lecturasRows } = allIds.length
      ? await supabase.rpc("lecturas_de_recordatorios", { p_ids: allIds })
      : { data: [] };
    const filasPorRec = new Map();
    for(const l of (lecturasRows||[])) {
      if(!filasPorRec.has(l.recordatorio_id)) filasPorRec.set(l.recordatorio_id, []);
      filasPorRec.get(l.recordatorio_id).push(l);
    }

    const conLectura = lista.map((g)=>{
      const lecturas = unirLecturasPorFamilia(g.ids.flatMap(id=>filasPorRec.get(id)||[]));
      const total = lecturas.length;
      const totalLeidos = lecturas.filter(l=>l.leido_en).length;
      return { ...g, lecturas, totalDestinatarios: total, totalLeidos, pctLeido: total ? Math.round((totalLeidos/total)*100) : null };
    });

    setComunicaciones(conLectura);
    setCargando(false);
  };

  const toggle = () => {
    if(!abierto && comunicaciones.length===0) cargar();
    setAbierto(p=>!p);
  };

  // Recargar cuando se publica una nueva comunicación (ok pasa de null a un mensaje).
  // Solo reacciona a recargarVer (a propósito no a cargar/abierto). Diferido,
  // como useCargar, para no hacer setState dentro del efecto.
  useEffect(()=>{
    if(!recargarVer || !abierto) return;
    let vigente = true;
    Promise.resolve().then(()=>{ if(vigente) cargar(); });
    return ()=>{ vigente = false; };
  },[recargarVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtFecha = (iso) => iso ? new Date(iso).toLocaleDateString("es-AR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "";

  const empezarEdicion = (c) => {
    setEditError(null);
    setEditForm({ titulo:c.titulo||"", texto:c.texto||"", hora_inicio:c.hora_inicio||"", hora_fin:c.hora_fin||"" });
    setEditando(c.grupo_id);
  };

  // Todas las filas de una misma comunicación comparten grupo_id — un solo
  // update por grupo_id las actualiza a todas (mismo criterio que el insert
  // multi-fila de ComunicacionesAdmin).
  const guardarEdicion = async () => {
    if(!editForm.titulo?.trim() || !editForm.texto?.trim()) return;
    setGuardandoEdit(true);
    setEditError(null);
    const { error } = await supabase.from("recordatorios")
      .update({ titulo: sanitize(editForm.titulo), texto: sanitize(editForm.texto), hora_inicio: editForm.hora_inicio||null, hora_fin: editForm.hora_fin||null })
      .eq("grupo_id", editando);
    setGuardandoEdit(false);
    if(error) { setEditError(error.message || "No se pudo guardar."); return; }
    setEditando(null);
    cargar();
  };
  const inpEdit = {width:"100%",padding:"8px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12.5,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  return (
    <div style={{marginTop:24}}>
      {verLecturas&&<LecturasModal titulo={verLecturas.titulo||textoPlano(verLecturas.texto)} filas={verLecturas.lecturas} onClose={()=>setVerLecturas(null)}/>}
      <button onClick={toggle} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderRadius:12,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#0F172A"}}>
        <span>Historial de comunicaciones</span>
        <span style={{fontSize:16,color:"#94A3B8",transform:abierto?"rotate(180deg)":"none",transition:"transform 0.2s"}}>▾</span>
      </button>

      {abierto && (
        <div style={{marginTop:8}}>
          {cargando && <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Cargando...</div>}
          {!cargando && comunicaciones.length===0 && (
            <EmptyState sinBorde icono="comunicaciones" titulo="Todavía no hay comunicados este año" nota="Lo que publiques para varios cursos aparece acá, con quién lo leyó." style={{padding:16}}/>
          )}
          {!cargando && comunicaciones.map(c=>(
            <div key={c.grupo_id} style={{padding:"12px 14px",marginBottom:6,borderRadius:12,background:"white",border:"1px solid #E2E8F0"}}>
              {editando===c.grupo_id ? (
                <div style={{marginBottom:10}}>
                  {editError&&<div style={{fontSize:12.5,fontWeight:700,color:"#B91C1C",marginBottom:6}}>{editError}</div>}
                  <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Título</div>
                  <input value={editForm.titulo} onChange={e=>setEditForm(p=>({...p,titulo:e.target.value}))} style={{...inpEdit,marginBottom:8}}/>
                  <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Descripción</div>
                  <textarea value={editForm.texto} onChange={e=>setEditForm(p=>({...p,texto:e.target.value}))} rows={3} style={{...inpEdit,resize:"vertical",marginBottom:8}}/>
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Hora inicio (opcional)</div>
                      <input type="time" value={editForm.hora_inicio} onChange={e=>setEditForm(p=>({...p,hora_inicio:e.target.value}))} style={inpEdit}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Hora fin (opcional)</div>
                      <input type="time" value={editForm.hora_fin} onChange={e=>setEditForm(p=>({...p,hora_fin:e.target.value}))} style={inpEdit}/>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setEditando(null)} style={{flex:1,padding:8,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:"#334155"}}>Cancelar</button>
                    <button onClick={guardarEdicion} disabled={guardandoEdit||!editForm.titulo?.trim()||!editForm.texto?.trim()} style={{flex:2,padding:8,borderRadius:8,border:"none",background:(guardandoEdit||!editForm.titulo?.trim()||!editForm.texto?.trim())?"#CBD5E1":"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>{guardandoEdit?"Guardando...":"Guardar"}</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:c.titulo?2:6}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0F172A",lineHeight:1.4}}>{c.titulo||textoPlano(c.texto)}</div>
                  <button onClick={()=>empezarEdicion(c)} style={{flexShrink:0,padding:"3px 9px",borderRadius:7,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,fontWeight:700,color:"#64748B"}}>Editar</button>
                </div>
              )}
              {editando!==c.grupo_id&&c.titulo&&<div style={{fontSize:12,color:"#64748B",lineHeight:1.4,marginBottom:6}}>{textoPlano(c.texto)}</div>}
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:12,color:"#64748B"}}>Publicado {fmtFecha(c.creado_en)}</span>
                <span style={{fontSize:12,color:"#64748B"}}>· {c.cursoIds.length} curso{c.cursoIds.length!==1?"s":""}</span>
                {c.urgente&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"2px 7px",borderRadius:8}}>Urgente</span>}
              </div>
              {(c.fecha||c.hora_inicio)&&(
                <div style={{fontSize:11,color:"#64748B",marginTop:4}}>
                  {c.fecha?new Date(c.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"}):"Sin fecha"}
                  {fmtRangoHora(c.hora_inicio,c.hora_fin)?` · ${fmtRangoHora(c.hora_inicio,c.hora_fin)}`:""}
                </div>
              )}
              {c.pctLeido!==null&&(
                <div onClick={()=>setVerLecturas(c)} title="Ver quién la leyó" style={{marginTop:8,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10.5,color:"#94A3B8",fontWeight:700,marginBottom:3}}>
                    <span>Leído por {c.totalLeidos} de {c.totalDestinatarios} · ver quién</span>
                    <span>{c.pctLeido}%</span>
                  </div>
                  <div style={{height:5,borderRadius:3,background:"#F1F5F9",overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:3,background:c.pctLeido>=50?"#10B981":"#F59E0B",width:`${c.pctLeido}%`}}/>
                  </div>
                </div>
              )}
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

const DIAS_SEMANA = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

export function HorariosAdmin({ cursos, colegioId, showToast }) {
  const [cursoSel, setCursoSel] = useState(null);
  const [maestros, setMaestros] = useState([]);
  const [clasesPorCurso, setClasesPorCurso] = useState(null); // curso_id -> nº bloques (null = cargando)
  const [importar, setImportar] = useState(false);
  const [version, setVersion] = useState(0); // recargar el editor después de una carga masiva

  // Header de módulo con 4 stats (handoff Tribbu Admin, Parte 5): antes de
  // elegir un curso, orienta cuántos ya tienen horario cargado. Una sola
  // consulta liviana (solo curso_id) para todos los cursos del año vigente.
  const cargarStats = useCallback(()=>{
    if(!cursos.length) return;
    supabase.from("horarios").select("curso_id").in("curso_id", cursos.map(c=>c.id)).then(({data})=>{
      const conteo = {};
      for(const h of (data||[])) conteo[h.curso_id] = (conteo[h.curso_id]||0)+1;
      setClasesPorCurso(conteo);
    });
  },[cursos]);
  useEffect(()=>{ cargarStats(); },[cargarStats]);

  // Maestras del colegio (para asignar clases): las que dan clase en algún
  // curso de este colegio — RLS ya acota a colegio_admin; el filtro por
  // colegio es para super.
  useEffect(()=>{
    (async()=>{
      const { data: mc } = await supabase.from("maestro_cursos").select("maestro_id,cursos!inner(colegio_id)").eq("cursos.colegio_id", colegioId||"");
      const ids = [...new Set((mc||[]).map(r=>r.maestro_id))];
      const { data: mae } = ids.length ? await supabase.from("maestros").select("id,nombre,apellido").eq("activo",true).in("id",ids).order("nombre") : { data: [] };
      setMaestros(mae||[]);
    })();
  },[colegioId]);

  // Una sola línea arriba (rediseño 2026-10-27, "mucha información"): curso
  // en un desplegable (marca los que no tienen horario) + exportar / cargar
  // desde Excel para todos los cursos.
  const sinHorario = clasesPorCurso ? cursos.filter(c=>!clasesPorCurso[c.id]).length : 0;
  const btn = {padding:"9px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155",whiteSpace:"nowrap",fontFamily:"inherit"};
  return (
    <div>
      {importar&&<ImportarHorarioModal cursos={cursos} colegioId={colegioId} cursoActual={cursoSel} onClose={()=>setImportar(false)}
        onHecho={(m)=>{ setImportar(false); showToast?.(m,"success"); cargarStats(); setVersion(v=>v+1); }}/>}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:6}}>
        <select value={cursoSel?.id||""} onChange={e=>setCursoSel(cursos.find(c=>c.id===e.target.value)||null)} aria-label="Curso"
          style={{flex:"1 1 240px",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:14,fontWeight:600,background:"white",color:"#0F172A",fontFamily:"inherit"}}>
          <option value="">Elegí un curso…</option>
          {cursos.map(c=><option key={c.id} value={c.id}>{c.nombre}{!clasesPorCurso||clasesPorCurso[c.id]?"":" · sin horario"}</option>)}
        </select>
        <button onClick={()=>exportarHorarios(cursos, "horarios")} disabled={!Object.keys(clasesPorCurso||{}).length} style={{...btn,opacity:Object.keys(clasesPorCurso||{}).length?1:0.5}}>Exportar Excel</button>
        <button onClick={()=>setImportar(true)} style={btn}>Cargar desde Excel</button>
      </div>
      <div style={{fontSize:12.5,color:"#64748B",marginBottom:16}}>
        {clasesPorCurso ? `${cursos.length-sinHorario} de ${cursos.length} cursos con horario${sinHorario?` · ${sinHorario} sin cargar`:""}.` : " "}
      </div>

      {!cursoSel&&<div style={{textAlign:"center",padding:40,color:"#94A3B8",fontSize:13}}>Elegí un curso para ver y editar su horario, o cargá todos de una vez desde Excel.</div>}

      {cursoSel&&<HorarioCurso key={`${cursoSel.id}-${version}`} curso={cursoSel} colegioId={colegioId} cursos={cursos} maestros={maestros} showToast={showToast} onCambio={cargarStats}/>}
    </div>
  );
}

export function UniformesAdmin({ cursos }) {
  const [uniformes, setUniformes] = useState([]);
  const [links,     setLinks]     = useState([]); // [{uniforme_id, curso_id}]
  const [modal,     setModal]     = useState(null); // null | {mode:"newU"|"editU"|"newItem"|"editItem", u?, it?}
  const [form,      setForm]      = useState({tipo:"",emoji:"👕",item:""});
  const [saving,    setSaving]    = useState(false);
  const [confirmElimU, setConfirmElimU] = useState(null); // uniforme (categoría) a eliminar
  const [confirmElimItem, setConfirmElimItem] = useState(null); // ítem a eliminar

  const EMOJIS_UNI = ["👕","👖","👟","🧥","🎽","🧢","👗","🩳"];
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const cargar = useCallback(async () => {
    const [uni, lnk] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").order("tipo"),
      supabase.from("uniforme_cursos").select("uniforme_id,curso_id"),
    ]);
    setUniformes(uni.data||[]);
    setLinks(lnk.data||[]);
  }, []);
  useCargar(cargar);


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

  const eliminarU    = async (id) => { await supabase.from("uniformes").delete().eq("id",id); setConfirmElimU(null); cargar(); };
  const eliminarItem = async (id) => { await supabase.from("uniforme_items").delete().eq("id",id); setConfirmElimItem(null); cargar(); };

  const openModal = (mode,u=null,it=null) => {
    setModal({mode,u,it});
    if(mode==="newU")     setForm({tipo:"",emoji:"👕",item:""});
    if(mode==="editU")    setForm({tipo:u.tipo||"",emoji:u.emoji||"👕",item:""});
    if(mode==="newItem")  setForm({tipo:"",emoji:"",item:""});
    if(mode==="editItem") setForm({tipo:"",emoji:"",item:it.item||""});
  };

  const modalTitle = modal ? ({newU:"Nueva categoría",editU:"Editar categoría",newItem:"Agregar ítem",editItem:"Editar ítem"}[modal.mode]) : "";

  const totalItems = uniformes.reduce((n,u)=>n+(u.uniforme_items?.length||0),0);
  const cursosConUniforme = new Set(links.map(l=>l.curso_id)).size;

  return (
    <div>
      <ModuloStats items={[
        {n:uniformes.length, l:"Categorías"},
        {n:totalItems, l:"Ítems"},
        {n:cursosConUniforme, l:"Cursos con uniforme", c:"#10B981", sub:`de ${cursos.length}`},
        {n:cursos.length-cursosConUniforme, l:"Sin uniforme", c:"#B45309"},
      ]}/>
      {confirmElimU&&(
        <ConfirmDestructivoModal
          titulo="¿Eliminar esta categoría de uniforme?"
          detalle={`"${confirmElimU.tipo}" y todos sus ítems se eliminan. Esta acción no se puede deshacer.`}
          textoConfirmar="Eliminar categoría"
          onCancelar={()=>setConfirmElimU(null)}
          onConfirmar={()=>eliminarU(confirmElimU.id)}
        />
      )}
      {confirmElimItem&&(
        <ConfirmDestructivoModal
          titulo="¿Eliminar este ítem?"
          detalle={`"${confirmElimItem.item}" se elimina de la lista de uniforme.`}
          textoConfirmar="Eliminar ítem"
          onCancelar={()=>setConfirmElimItem(null)}
          onConfirmar={()=>eliminarItem(confirmElimItem.id)}
        />
      )}
      {/* Modal */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:16,fontWeight:800,color:"#0F172A",marginBottom:14}}>{modalTitle}{modal.u?" — "+modal.u.tipo:""}</div>
            {(modal.mode==="newU"||modal.mode==="editU")&&(<>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Nombre</div>
                <input value={form.tipo} onChange={e=>setForm(p=>({...p,tipo:e.target.value}))} placeholder="Ej: Deportivo, Formal..." style={inp} autoFocus/>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Emoji</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {EMOJIS_UNI.map(e=>(
                    <button key={e} onClick={()=>setForm(p=>({...p,emoji:e}))} style={{width:36,height:36,borderRadius:8,border:form.emoji===e?"2.5px solid #3B82F6":"1.5px solid #E2E8F0",background:form.emoji===e?"#EFF6FF":"white",fontSize:18,cursor:"pointer"}}>{e}</button>
                  ))}
                </div>
              </div>
            </>)}
            {(modal.mode==="newItem"||modal.mode==="editItem")&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:5}}>Ítem</div>
                <input value={form.item} onChange={e=>setForm(p=>({...p,item:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&guardar()} placeholder="Ej: Remera blanca manga corta" style={inp} autoFocus/>
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:700,color:"#334155"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:13,color:"#64748B"}}>Categorías de uniforme del colegio</div>
        <BotonNuevo label="Nueva categoría" onClick={()=>openModal("newU")}/>
      </div>

      {uniformes.length===0&&<EmptyState icono="bolsa" titulo="Todavía no hay categorías de uniforme" nota="Creá una (por ejemplo “Uniforme diario” o “Educación física”) y sumale las prendas." accion="Nueva categoría" onAccion={()=>openModal("newU")}/>}

      {uniformes.map((u)=>{
        const items = u.uniforme_items||[];
        const cursosLinked = links.filter(l=>l.uniforme_id===u.id).map(l=>l.curso_id);
                return (
          <Card key={u.id} style={{marginBottom:14,overflow:"hidden"}}>
            {/* Header categoría */}
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#F8FAFC",borderBottom:"1px solid #F1F5F9"}}>
              <div style={{width:34,height:34,borderRadius:10,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{u.emoji||"👕"}</div>
              <span style={{fontSize:14,fontWeight:800,flex:1}}>{u.tipo}</span>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>openModal("newItem",u)} style={{fontSize:13,padding:"4px 6px",border:"none",background:"none",color:"#2563EB",cursor:"pointer",fontWeight:700,fontFamily:"inherit"}}>+ Ítem</button>
                <button onClick={()=>openModal("editU",u)} style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#64748B"}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                <button onClick={()=>setConfirmElimU(u)} style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",color:"#EF4444"}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>
              </div>
            </div>

            {/* Ítems */}
            {items.sort((a,b)=>a.item.localeCompare(b.item,"es")).map((it,j)=>(
              <div key={it.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderBottom:"1px solid #F8FAFC",background:j%2===0?"white":"#FAFAFA"}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:"#CBD5E1",flexShrink:0}}/>
                <span style={{fontSize:13,flex:1}}>{it.item}</span>
                <button onClick={()=>openModal("editItem",u,it)} style={{fontSize:11,padding:"3px 7px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#64748B"}}><Icono nombre="lapiz" size={15} color="#475569" style={{margin:"0 auto"}}/></button>
                <button onClick={()=>setConfirmElimItem(it)} style={{fontSize:11,padding:"3px 7px",borderRadius:6,border:"none",background:"transparent",cursor:"pointer",color:"#EF4444"}}><Icono nombre="papelera" size={15} color="#DC2626" style={{margin:"0 auto"}}/></button>
              </div>
            ))}
            {items.length===0&&<div style={{padding:"8px 14px",fontSize:12.5,color:"#64748B"}}>Todavía no tiene prendas.</div>}

            {/* Cursos asignados */}
            <div style={{padding:"10px 14px",borderTop:"1px solid #F1F5F9",background:"#FAFAFA"}}>
              <div style={{fontSize:12.5,fontWeight:600,color:"#475569",marginBottom:8}}>Cursos que usan esta categoría</div>
              <CursoListSelector cursos={cursos} seleccionados={cursosLinked} onToggle={id=>toggleCurso(u.id,id)} maxHeight={150}/>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Alumnos y familias se cargan por Configuración → Importar datos (modelo,
// vista previa con errores y carga); acá queda el acceso.
function ImportarDesdeExcel({ onIr }) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:12,border:"1px dashed #CBD5E1",background:"white",marginBottom:16,maxWidth:640}}>
      <Icono nombre="documento" size={20} color="#475569"/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13.5,fontWeight:700,color:"#0F172A"}}>¿Muchos alumnos juntos?</div>
        <div style={{fontSize:12,color:"#64748B"}}>Descargá el modelo de Excel, completalo y revisá la vista previa antes de cargar.</div>
      </div>
      <button onClick={onIr} style={{border:"1px solid #E2E8F0",background:"white",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:700,color:"#0F172A",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Importar datos</button>
    </div>
  );
}

