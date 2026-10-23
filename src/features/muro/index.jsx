// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM } from "../../lib/theme";
import { fmtNombre, fmtRangoHora, fmtLocalDate } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { FestejoDetalleModal } from "../cumples";


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


import { autorizacionesPendientes } from "../../lib/autorizaciones";
import { talleresParaAnotarse, claveTalleresVistos, leerTalleresVistos, marcarTallerVisto } from "../../lib/talleres";
import { filtroAlcance, encontradosDeLaSemana, cargarReclamados, claveEncontradosVistos } from "../../lib/perdidos";
import { getStorageBackend } from "../../lib/storage";
import { proximoCumple as calcProximoCumple, recordatoriosPendientes, colectasActivas, colectasPendientes, colectasPorCerrar, diasVencida, festejosPendientes, festejosRechazados, encuestasAbiertas, alertasUnaPorCurso, textoRespuestasPendientes, ordenarPorVencimiento, avisoVencimiento, fechaCorta, filasMenu, DIAS_PROXIMOS } from "../../lib/muro";
import { menuParaNivel, nivelDeVista } from "../../lib/niveles";
import { Icono } from "../../components/Icono";
import { TablaMenu } from "../../components/TablaMenu";
import { useTabActiva } from "../../hooks/useTabActiva";
import { SELECT_REC_CON_LEIDO, separarLeidos, conLeidoDe } from "../../lib/leidos";
import { useAutoresDocentes as useAutoresDocentesHook } from "../../hooks/useAutoresDocentes";
import { etiquetaDocente, separarCumplesDocente } from "../../lib/docentes";
import { textoPlano } from "../../lib/formato";

// Tag de hijo estándar (solo visible en vista Todos: tagDeCurso devuelve null en vista por hijo)
function TagHijo({ tag }) {
  if(!tag) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
      {tag.nombre}
    </span>
  );
}

// Estado de error de red (Tanda 1 del handoff): versión web de
// mobile/features/muro/index.jsx's ErrorMuro — mismo copy y misma idea
// (si ya había datos, se avisa que se está mostrando lo último cargado
// en vez de tapar la pantalla).
function ErrorMuro({ onReintentar, tieneDatos, style }) {
  return (
    <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:16,padding:"20px 18px",textAlign:"center",...style}}>
      <div style={{fontSize:28,marginBottom:8}}>☁️</div>
      <div style={{fontSize:14,fontWeight:800,color:"#0F172A",marginBottom:4}}>No pudimos actualizar el muro</div>
      <div style={{fontSize:12.5,color:"#64748B",marginBottom:14}}>
        {tieneDatos ? "Estás viendo lo último cargado. Revisá tu conexión." : "Revisá tu conexión e intentá de nuevo."}
      </div>
      <button onClick={onReintentar} style={{padding:"9px 18px",borderRadius:10,border:"none",background:"#0F172A",color:"white",fontSize:13,fontWeight:700,cursor:"pointer"}}>Reintentar</button>
    </div>
  );
}

// Estilos sobrios (prototipo): blanco, bordes finos, grises; azul solo en la acción.
const card = {border:"1px solid #E2E8F0",borderRadius:16,background:"white"};
const tituloSeccion = {fontSize:18,fontWeight:800,color:"#0F172A",letterSpacing:-0.2};
const enlace = {display:"inline-flex",alignItems:"center",gap:6,padding:0,border:"none",background:"none",cursor:"pointer",fontSize:13.5,fontWeight:700,color:"#2563EB",fontFamily:"inherit"};
function Hijo({tag}) { return tag ? (
  <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,color:"#475569",whiteSpace:"nowrap"}}>
    <span style={{width:8,height:8,borderRadius:999,background:tag.color,flexShrink:0}}/>
    <span style={{color:"#475569"}}>{tag.nombre}</span>
  </span>
) : null;
}
const Enlace = ({texto,onClick,style}) => (
  <button onClick={onClick} style={{...enlace,...style}}>
    <span style={{color:"#2563EB"}}>{texto}</span>
    <Icono nombre="flecha" size={15} color="#2563EB"/>
  </button>
);
const Encabezado = ({titulo,cuenta,derecha}) => (
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
    <div style={tituloSeccion}>{titulo}</div>
    {cuenta>0&&<span style={{minWidth:22,height:22,padding:"0 7px",borderRadius:999,background:"#F1F5F9",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#475569",boxSizing:"border-box"}}>{cuenta}</span>}
    <div style={{flex:1}}/>
    {derecha}
  </div>
);


export function Muro({ selector, cursoId, cursoIds: cursoIdsProp, items, tagDeCurso, isAdmin, cursosAdmin=[], esDocente=false, userName, userId, misHijos: misHijosProp=[], onNavigate, isMobile=true }) {
  const misHijos = (misHijosProp||[]).filter(h=>h && typeof h === "string");
  const cursoIds = (cursoIdsProp&&cursoIdsProp.length) ? cursoIdsProp : (cursoId ? [cursoId] : []);
  const tagDe = (cid) => tagDeCurso ? tagDeCurso(cid) : null;
  const [datos,setDatos] = useState(null);
  // Talleres que la familia ya miró desde Novedades (guardado en el dispositivo).
  const [talleresVistos,setTalleresVistos] = useState(()=>leerTalleresVistos(getStorageBackend()?.getItem(claveTalleresVistos(userId))));
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [error,setError] = useState(false);
  const hoy = (() => { const t = new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"}).replace(",",""); return t.charAt(0).toUpperCase()+t.slice(1); })();

  const cursosKey = cursoIds.join(",");
  const tabActiva = useTabActiva(); // oculta: no carga; al volver, recarga en segundo plano
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{ if(tabActiva) cargar(); },[cursosKey, tabActiva]);

  async function cargar() {
    if(!cursoIds.length) return;
    try {
    const fechaHoy = fmtLocalDate();
    const fecha15  = fmtLocalDate(new Date(Date.now() + 15*24*60*60*1000));
    // Dos lotes en paralelo (antes eran ~8 consultas en fila después del
    // primero, cada una un viaje a us-east-1). Lote 1: todo lo que solo
    // depende de los cursos/usuario. Lote 2: lo que necesita ids del lote 1.
    // colegio_id por curso sale de "Mi acceso" (items), sin ir a "cursos".
    const colegios = [...new Set(cursoIds.map(cid=>(items||[]).find(i=>i.curso_id===cid)?.cursos?.colegio_id).filter(Boolean))];
    const cumplesDoc = esDocente ? supabase.rpc("cumples_para_docente",{p_cursos:cursoIds}).then(r=>separarCumplesDocente(r.data)) : null;
    const [alertasRes,menu,recordatorios,cumples,cuotas,hijosData,maestrosData,eventosData,invitacionesData,encuestasData,objsData,autsData,talleresData,tallerInscData] = await Promise.all([
      supabase.from("alertas").select("*").in("curso_id",cursoIds).eq("activa",true).order("creado_en",{ascending:false}).limit(3),
      // Puede haber un menú general y otros por nivel (roles-por-nivel): se elige abajo.
      supabase.from("menu").select("*").eq("fecha",fechaHoy),
      // Solo los que pueden ser "pendientes" (recordatoriosPendientes): sin
      // fecha o de hoy en adelante, para todos o para mí — no
      // el historial completo del año.
      // "¿Lo leí?" viene embebido (lib/leidos): sin pedir aparte todos mis leídos.
      conLeidoDe(supabase.from("recordatorios").select(SELECT_REC_CON_LEIDO), userId).in("curso_id",cursoIds)
        .or(`para_usuario_id.is.null${userId?`,para_usuario_id.eq.${userId}`:""}`)
        .or(`fecha.is.null,fecha.gte.${fechaHoy}`)
        .order("creado_en",{ascending:false}),
      supabase.from("cumples").select("*").in("curso_id",cursoIds).order("id"),
      supabase.from("colectas").select("*").in("curso_id",cursoIds),
      // Docente: la RLS no le deja leer hijos/maestros → cumpleaños por RPC (una sola llamada para las dos listas).
      cumplesDoc ? cumplesDoc.then(x=>({data:x.hijos})) : supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id",cursoIds),
      cumplesDoc ? cumplesDoc.then(x=>({data:x.maestros})) : supabase.from("maestros").select("id,nombre,apellido,fecha_nacimiento, maestro_cursos!inner(curso_id)").in("maestro_cursos.curso_id",cursoIds),
      supabase.from("eventos").select("*").in("curso_id",cursoIds).gte("fecha",fechaHoy).lte("fecha",fecha15).order("fecha"),
      (userId && misHijos.length) ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,hora_fin,lugar,tipo,alumno_id,imagen_url,url_ubicacion,descripcion,curso_id)").in("alumno_invitado_id", misHijos).in("asiste",["pendiente","no"]) : Promise.resolve({data:[]}),
      supabase.from("encuestas").select("*").in("curso_id",cursoIds),
      // Perdidos y encontrados: objetos encontrados esta semana en mis cursos / colegio.
      supabase.from("objetos_perdidos").select("id,tipo,estado,vence_en,creado_en,publicado_por")
        .or(filtroAlcance(cursoIds, colegios)).eq("tipo","encontrado").eq("estado","abierto")
        .gte("creado_en", new Date(Date.now()-7*86400000).toISOString()),
      misHijos.length ? supabase.from("autorizaciones").select("id,titulo,descripcion,curso_id,fecha_limite,fecha_evento").in("curso_id",cursoIds) : Promise.resolve({data:[]}),
      // Talleres con inscripción abierta (RLS: solo los que ve la familia) y
      // en qué ya están anotados mis hijos → tarjeta "Inscripción abierta".
      misHijos.length ? supabase.from("talleres").select("id,nombre,estado,elegibilidad,edad_min,edad_max,inscripcion_desde,inscripcion_hasta,fecha_inicio,taller_cursos(curso_id)").eq("estado","publicado") : Promise.resolve({data:[]}),
      misHijos.length ? supabase.from("taller_inscripciones").select("taller_id,hijo_id,estado").in("hijo_id",misHijos) : Promise.resolve({data:[]}),
    ]);
    const objs = objsData.data||[];
    const auts = autsData.data||[];
    const encuestasActivas = encuestasAbiertas(encuestasData.data||[], fechaHoy);
    const activas = colectasActivas(cuotas.data||[], fecha15);
    const [reclamados, respData, votosData, pagosData] = await Promise.all([
      cargarReclamados(supabase, objs.map(o=>o.id)),
      auts.length ? supabase.from("autorizacion_respuestas").select("autorizacion_id,hijo_id").in("autorizacion_id",auts.map(a=>a.id)).in("hijo_id",misHijos) : Promise.resolve({data:[]}),
      (userId && encuestasActivas.length) ? supabase.from("encuesta_votos").select("encuesta_id").eq("usuario_id",userId).in("encuesta_id",encuestasActivas.map(e=>e.id)) : Promise.resolve({data:[]}),
      (misHijos.length && activas.length) ? supabase.from("colecta_pagos").select("*").in("colecta_id",activas.map(c=>c.id)).in("alumno_id",misHijos) : Promise.resolve({data:[]}),
    ]);
    const encontradosSemana = encontradosDeLaSemana(objs, userId, { reclamados, vistosHasta: getStorageBackend()?.getItem(claveEncontradosVistos(userId)) });
    // Autorizaciones abiertas con algún hijo mío sin responder.
    const misHijosObj = (hijosData.data||[]).filter(h=>misHijos.includes(h.id));
    const talleresAbiertos = talleresParaAnotarse(talleresData.data||[], misHijosObj, {
      cursosPorTaller: Object.fromEntries((talleresData.data||[]).map(t=>[t.id,(t.taller_cursos||[]).map(x=>x.curso_id)])),
      inscripciones: tallerInscData.data||[],
    });
    const autorizacionesPend = auts.length ? autorizacionesPendientes(auts, misHijosObj, respData.data||[], fechaHoy) : [];
    // Encuestas abiertas (ni cerradas ni eliminadas) donde el usuario todavía no votó.
    const votadas = new Set((votosData.data||[]).map(v=>v.encuesta_id));
    const encuestasPend = userId ? encuestasActivas.filter(e=>!votadas.has(e.id)) : [];
    // Cumpleaños (alumnos + maestros) de los próximos 15 días, del más cercano al más lejano.
    const bdayList = [
      ...(hijosData.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`a-${a.id}`, nombre:fmtNombre(a), tipo:"Alumno",
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6", curso_id:a.curso_id,
        dias:calcProximoCumple(a.fecha_nacimiento).dias,
      })),
      ...(maestrosData.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, nombre:fmtNombre(m), tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6", curso_id:m.maestro_cursos?.[0]?.curso_id,
        dias:calcProximoCumple(m.fecha_nacimiento).dias,
      })),
    ].filter(a=>a.dias<=15)
     .sort((a,b)=>a.dias-b.dias);
    const { recs: recsVigentes, leidos: leidosIds } = separarLeidos(recordatorios.data);
    const recsNoLeidos = recordatoriosPendientes(recsVigentes, leidosIds, userId, fechaHoy);
    // Colectas pendientes: cada colecta se evalúa contra MIS hijos de SU curso
    // (en vista Todos hay colectas de varios cursos; un hijo de otro curso no
    // cuenta como "impago"). Mismo patrón que mobile/features/muro.
    const misHijosIds = misHijos;
    const misHijosPorCurso = new Map();
    for(const h of (hijosData.data||[])){
      if(!misHijosIds.includes(h.id)) continue;
      const arr = misHijosPorCurso.get(h.curso_id)||[];
      arr.push(h.id);
      misHijosPorCurso.set(h.curso_id, arr);
    }
    // Colectas que gestiono y llevan 15+ días vencidas → "¿la cerrás?"
    const porCerrar = colectasPorCerrar(cuotas.data||[], userId, cursosAdmin, fechaHoy);
    const colectasPend = (misHijosIds.length && activas.length) ? colectasPendientes(activas, pagosData.data||[], misHijosPorCurso) : [];
    // Una alerta activa por curso (la más reciente), hasta 3
    const alertasPorCurso = alertasUnaPorCurso(alertasRes.data||[]);
    // Un festejo por card (aunque haya varios hijos invitados) y solo los que no pasaron.
    const filasInv = (invitacionesData.data||[]).filter(i=>i.evento && cursoIds.includes(i.evento.curso_id));
    const invitaciones = festejosPendientes(filasInv.filter(i=>i.asiste==="pendiente"), fechaHoy);
    // Festejos en "Próximos días" (la RLS ya trae solo los que me tocan), menos
    // los que rechazamos.
    const rechazados = festejosRechazados(filasInv);
    setDatos({ alertas:alertasPorCurso, menu:menuParaNivel(menu.data, nivelDeVista(items, cursoIds)), recordatorios:recsNoLeidos, cumples:cumples.data||[], cuotas:cuotas.data||[], bdayList, colectasPend, porCerrar, encuestasPend, autorizacionesPend, talleresAbiertos, encontradosSemana, eventos:(eventosData.data||[]).filter(e=>e.tipo!=="cumple"&&!(e.tipo==="festejo"&&rechazados.has(e.id))), invitaciones, hijosData:hijosData.data||[] });
    setError(false);
    } catch(e) {
      console.warn("No se pudo actualizar el muro:", e?.message);
      setError(true);
    }
  };

  // "No" en "¿Alguno es de tu hijo?": deja de preguntar por estos objetos.
  const noEsMio = () => {
    getStorageBackend()?.setItem(claveEncontradosVistos(userId), new Date().toISOString());
    setDatos((d) => ({ ...d, encontradosSemana: 0 }));
  };

  const dismissAlerta = async (alerta) => {
    if(alerta){ await supabase.from("alertas").update({activa:false}).eq("id",alerta.id); cargar(); }
  };

  // Sin datos todavía: si ya falló el primer intento, mostrar el error con
  // reintentar en vez de un Spinner eterno.
  // Avisos de docentes: "Laura · Inglés" como origen en Novedades.
  const docenteDe = useAutoresDocentesHook((datos?.recordatorios||[]).map(r=>r.creado_por));
  if(!datos) return error ? <ErrorMuro onReintentar={cargar} tieneDatos={false}/> : <Spinner/>;

  const fechaHoy = fmtLocalDate();
  const diasHasta = (fechaStr) => {
    if(!fechaStr) return null;
    const hoyD = new Date(); hoyD.setHours(0,0,0,0);
    return Math.round((new Date(fechaStr+"T00:00:00")-hoyD)/86400000);
  };
  const hora = (h) => h ? `${String(h).slice(0,5)} hs` : null;
  const montoTxt = (c) => c.monto_sugerido ? `Aporte ${(c.moneda||"$")==="$"?"$":`${c.moneda} `}${Number(c.monto_sugerido).toLocaleString("es-AR")}` : null;
  const unir = (...partes) => partes.filter(Boolean).join(" · ");

  // ── Respuestas pendientes (prototipo "Hoy"): solo lo que pide una acción de
  // la familia — los avisos sin leer van aparte, en Comunicaciones. Ordenadas
  // por vencimiento (@shared/muro); la primera va destacada con botón azul.
  const pendientes = ordenarPorVencimiento([
    ...(datos.autorizacionesPend||[]).map(a=>({
      key:`aut-${a.id}`, tipo:"Autorización", tag:tagDe(a.curso_id), titulo:a.titulo,
      dato:unir(a.fecha_evento?`Salida: ${fechaCorta(a.fecha_evento)}`:null, avisoVencimiento("x", a.fecha_limite, fechaHoy)?null:a.fecha_limite?`Responder hasta el ${fechaCorta(a.fecha_limite)}`:"Falta tu respuesta"),
      detalle:a.descripcion||null, vence:a.fecha_limite||null, urgencia:avisoVencimiento("Respondé hasta", a.fecha_limite, fechaHoy),
      accion:"Responder autorización", ir:()=>onNavigate?.("autorizaciones",{openAutorizacion:a.id}),
    })),
    ...(datos.colectasPend||[]).map(c=>({
      key:`c-${c.id}`, tipo:"Colecta", tag:tagDe(c.curso_id), titulo:c.titulo,
      dato:unir(montoTxt(c), (c.fecha_limite||c.vencimiento)&&!avisoVencimiento("x", c.fecha_limite||c.vencimiento, fechaHoy)?`Cierra el ${fechaCorta(c.fecha_limite||c.vencimiento)}`:null), detalle:null,
      vence:c.fecha_limite||c.vencimiento||null, urgencia:avisoVencimiento("Vence", c.fecha_limite||c.vencimiento, fechaHoy),
      accion:"Ver datos para pagar", ir:()=>onNavigate?.("finanzas",{openColecta:c.id}),
    })),
    ...(datos.invitaciones||[]).map(ev=>({
      key:`i-${ev.id}`, tipo:"Invitación", tag:tagDe(ev.curso_id), titulo:ev.titulo,
      dato:unir(avisoVencimiento("x", ev.fecha, fechaHoy)?null:fechaCorta(ev.fecha), hora(ev.hora), ev.lugar), detalle:null,
      vence:ev.fecha, urgencia:avisoVencimiento("Es", ev.fecha, fechaHoy),
      accion:"Confirmar asistencia", ir:()=>setFestejoDetalle(ev),
    })),
    ...(datos.encuestasPend||[]).map(e=>({
      key:`enc-${e.id}`, tipo:"Encuesta", tag:tagDe(e.curso_id), titulo:e.pregunta,
      dato:e.fecha_cierre&&!avisoVencimiento("x", e.fecha_cierre, fechaHoy)?`Cierra el ${fechaCorta(e.fecha_cierre)}`:null, detalle:null,
      vence:e.fecha_cierre||null, urgencia:avisoVencimiento("Cierra", e.fecha_cierre, fechaHoy),
      accion:"Votar en la encuesta", ir:()=>onNavigate?.("encuestas"),
    })),
    ...(datos.porCerrar||[]).map(c=>({
      key:`pc-${c.id}`, tipo:"Colecta para cerrar", tag:tagDe(c.curso_id), titulo:c.titulo,
      dato:`Venció hace ${diasVencida(c, fechaHoy)} días · ¿Terminó la colecta?`, detalle:null, vence:null, urgencia:null,
      accion:"Ver la colecta", ir:()=>onNavigate?.("finanzas",{openColecta:c.id}),
    })),
  ]);
  const [destacado, ...resto] = pendientes;

  // ── Novedades: avisos sin leer (leerlo lo marca como leído en Avisos) y
  // talleres con inscripción abierta. Un taller es optativo: se informa acá,
  // no va en "respuestas pendientes" (si no lo anotan, no hay nada que responder).
  const avisos = datos.recordatorios.filter(r=>!r.tipo||r.tipo==="recordatorio"||r.tipo==="general").map(r=>({
    key:`r-${r.id}`, etiqueta:"Sin leer", accion:"Leer aviso", tag:tagDe(r.curso_id), titulo:r.titulo||textoPlano(r.texto),
    dato:unir(r.grupo_id?"Comunicación del colegio":docenteDe(r.creado_por)?etiquetaDocente(docenteDe(r.creado_por)).replace(/^👩‍🏫\s*/,""):"Aviso del curso", r.fecha?fechaCorta(r.fecha):null, fmtRangoHora(r.hora_inicio,r.hora_fin)||null),
    ir:()=>onNavigate?.("recordatorios",{openAviso:r.id}),
  }));

  const novedades = [
    ...avisos,
    ...(datos.talleresAbiertos||[]).filter(({taller:t})=>!talleresVistos.has(t.id)).map(({taller:t,hijos:hs})=>({
      key:`tal-${t.id}`, etiqueta:"Inscripción abierta", etiquetaGris:true, accion:"Ver el taller", tag:null, titulo:t.nombre,
      dato:unir(`Para ${hs.map(h=>h.nombre?.split(" ")[0]).join(" y ")}`, t.inscripcion_hasta?`hasta el ${fechaCorta(t.inscripcion_hasta)}`:null),
      ir:()=>{
        // Mirarlo lo saca de Novedades (sigue en Curso → Talleres).
        const guardado = marcarTallerVisto(getStorageBackend()?.getItem(claveTalleresVistos(userId)), t.id);
        getStorageBackend()?.setItem(claveTalleresVistos(userId), guardado);
        setTalleresVistos(leerTalleresVistos(guardado));
        onNavigate?.("talleres",{openTaller:t.id});
      },
    })),
  ];

  // ── Próximos días: eventos + cumpleaños de los próximos 15 días.
  const agenda = [
    ...(datos.eventos||[]).map(e=>e.tipo==="festejo"
      ? { key:`e-${e.id}`, fecha:e.fecha, dias:diasHasta(e.fecha), titulo:e.titulo, meta:unir("Festejo", hora(e.hora), e.lugar), tag:tagDe(e.curso_id), ir:()=>setFestejoDetalle(e) }
      : { key:`e-${e.id}`, fecha:e.fecha, dias:diasHasta(e.fecha), titulo:e.titulo, meta:e.lugar||"Todo el curso", tag:tagDe(e.curso_id), ir:()=>onNavigate?.("clases",{openFecha:e.fecha}) }),
    ...(datos.bdayList||[]).map(a=>{
      const { dias, fecha } = calcProximoCumple(a.fecha_nacimiento);
      return { key:a.id, fecha, dias, titulo:`Cumple de ${a.nombre}`, meta:"Cumpleaños", tag:tagDe(a.curso_id), ir:()=>onNavigate?.("cumples") };
    }),
  ].filter(e=>e.dias>=0&&e.dias<=DIAS_PROXIMOS).sort((a,b)=>a.dias-b.dias);
  const menuFilas = filasMenu(datos.menu);
  const colectasAbiertas = (datos.cuotas||[]).filter(c=>c.activa);

  const bloquePendientes = (
    <div style={{marginBottom:28}}>
      {pendientes.length ? (
        <>
          <div style={{...tituloSeccion,marginBottom:12}}>{textoRespuestasPendientes(pendientes.length)}</div>
          {/* La más urgente, destacada con la acción principal. */}
          <div style={{...card,padding:"16px 18px",marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <span style={{fontSize:12.5,fontWeight:600,color:"#64748B"}}>{destacado.tipo}</span>
              <Hijo tag={destacado.tag}/>
            </div>
            {destacado.urgencia&&(
              <div style={{display:"inline-flex",alignItems:"center",gap:6,marginTop:10,padding:"4px 10px",borderRadius:8,background:"#FEF2F2"}}>
                <Icono nombre="reloj" size={14} color="#B91C1C"/>
                <span style={{fontSize:12.5,fontWeight:700,color:"#B91C1C"}}>{destacado.urgencia}</span>
              </div>
            )}
            <div style={{fontSize:18,fontWeight:800,color:"#0F172A",marginTop:10,lineHeight:1.3}}>{destacado.titulo}</div>
            {destacado.dato&&<div style={{fontSize:13,color:"#64748B",marginTop:6,lineHeight:1.45}}>{destacado.dato}</div>}
            {destacado.detalle&&<div style={{fontSize:13,color:"#64748B",marginTop:2,lineHeight:1.45,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{destacado.detalle}</div>}
            {/* Mismo enlace que el resto de los pendientes (antes era un botón azul solo en el primero). */}
            <Enlace texto={destacado.accion} onClick={destacado.ir} style={{marginTop:12}}/>
          </div>
          {/* El resto, en una sola tarjeta con separadores y un enlace cada uno. */}
          {resto.length>0&&(
            <div style={card}>
              {resto.map((p,i)=>(
                <div key={p.key} style={{padding:"14px 18px",borderTop:i?"1px solid #F1F5F9":"none"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <span style={{fontSize:12,fontWeight:600,color:"#64748B"}}>{p.tipo}</span>
                    <Hijo tag={p.tag}/>
                  </div>
                  <div style={{fontSize:15,fontWeight:700,color:"#0F172A",marginTop:4,lineHeight:1.3}}>{p.titulo}</div>
                  {p.dato&&<div style={{fontSize:12.5,color:"#64748B",marginTop:3,lineHeight:1.45}}>{p.urgencia?<span style={{color:"#B91C1C",fontWeight:700}}>{p.urgencia} · </span>:null}<span style={{color:"#64748B"}}>{p.dato}</span></div>}
                  <Enlace texto={p.accion} onClick={p.ir} style={{marginTop:10}}/>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={{...card,display:"flex",alignItems:"center",gap:12,padding:"16px 18px"}}>
          <span style={{width:36,height:36,borderRadius:999,background:"#F1F5F9",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icono nombre="check" size={18} color="#475569"/></span>
          <span style={{display:"block"}}>
            <span style={{display:"block",fontSize:15,fontWeight:700,color:"#0F172A"}}>Estás al día</span>
            <span style={{display:"block",fontSize:13,color:"#64748B",marginTop:2}}>No tenés nada para responder. Cuando haya algo, aparece acá.</span>
          </span>
        </div>
      )}
    </div>
  );

  const bloqueComunicaciones = (
    <div style={{marginBottom:28}}>
      <Encabezado titulo="Novedades" cuenta={novedades.length}
        derecha={<button onClick={()=>onNavigate?.("mensajes")} style={{...enlace,fontSize:13}}><span style={{color:"#2563EB"}}>Mensajes</span></button>}/>
      {!novedades.length&&<div style={{fontSize:13,color:"#64748B",margin:"-6px 0 12px"}}>No tenés avisos sin leer.</div>}
      {(novedades.length>0||datos.encontradosSemana>0)&&(
        <div style={card}>
          {novedades.map((a,i)=>(
            <div key={a.key} style={{padding:"14px 18px",borderTop:i?"1px solid #F1F5F9":"none"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <span style={{fontSize:12,fontWeight:a.etiquetaGris?600:700,color:a.etiquetaGris?"#64748B":"#2563EB"}}>{a.etiqueta}</span>
                <Hijo tag={a.tag}/>
              </div>
              <div style={{fontSize:15,fontWeight:700,color:"#0F172A",marginTop:4,lineHeight:1.3}}>{a.titulo}</div>
              {a.dato&&<div style={{fontSize:12.5,color:"#64748B",marginTop:3}}>{a.dato}</div>}
              <Enlace texto={a.accion} onClick={a.ir} style={{marginTop:10}}/>
            </div>
          ))}
          {datos.encontradosSemana>0&&(
            <div style={{padding:"14px 18px",borderTop:novedades.length?"1px solid #F1F5F9":"none"}}>
              <span style={{fontSize:12,fontWeight:600,color:"#64748B"}}>Lost &amp; Found</span>
              <div style={{fontSize:15,fontWeight:700,color:"#0F172A",marginTop:4,lineHeight:1.3}}>{datos.encontradosSemana} {datos.encontradosSemana===1?"objeto encontrado":"objetos encontrados"} esta semana</div>
              <div style={{fontSize:12.5,color:"#64748B",marginTop:3}}>¿{datos.encontradosSemana===1?"Es":"Alguno es"} de tu hijo?</div>
              <div style={{display:"flex",gap:18,marginTop:10}}>
                <Enlace texto="Ver" onClick={()=>onNavigate?.("perdidos",{tabPerdidos:"encontrado"})}/>
                <button onClick={noEsMio} style={{...enlace}}><span style={{color:"#64748B"}}>No</span></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const bloqueAgenda = (
    <div style={{marginBottom:28}}>
      <Encabezado titulo="Próximos días" derecha={<button onClick={()=>onNavigate?.("clases")} style={{...enlace,fontSize:13}}><span style={{color:"#2563EB"}}>Agenda</span></button>}/>
      {agenda.length ? (
        <div style={card}>
          {agenda.map((e,i)=>{
            const d = new Date(e.fecha+"T00:00:00");
            return (
              <div key={e.key} onClick={e.ir} style={{display:"flex",alignItems:"center",gap:14,padding:"12px 18px",borderTop:i?"1px solid #F1F5F9":"none",cursor:"pointer"}}>
                <div style={{width:34,textAlign:"center",flexShrink:0}}>
                  <div style={{fontSize:10.5,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:"#64748B"}}>{d.toLocaleDateString("es-AR",{weekday:"short"}).replace(".","")}</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#0F172A",lineHeight:1.1}}>{d.getDate()}</div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14.5,fontWeight:700,color:"#0F172A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.titulo}</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2,minWidth:0}}>
                    <Hijo tag={e.tag}/>
                    <span style={{fontSize:12.5,color:"#64748B",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{e.meta}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{fontSize:13,color:"#64748B"}}>{`Sin eventos ni cumpleaños en los próximos ${DIAS_PROXIMOS} días.`}</div>
      )}
    </div>
  );

  const bloqueMenu = menuFilas.length>0 && (
    <div style={{marginBottom:28}}>
      <Encabezado titulo="Menú de hoy" derecha={<button onClick={()=>onNavigate?.("comedor")} style={{...enlace,fontSize:13}}><span style={{color:"#2563EB"}}>Semana</span></button>}/>
      <TablaMenu menu={datos.menu}/>
    </div>
  );

  // Escritorio: colectas abiertas como información complementaria (no repite pendientes).
  const bloqueColectas = !isMobile && colectasAbiertas.length>0 && (
    <div style={{marginBottom:28}}>
      <Encabezado titulo="Colectas abiertas" derecha={<button onClick={()=>onNavigate?.("finanzas")} style={{...enlace,fontSize:13}}><span style={{color:"#2563EB"}}>Ver todas</span></button>}/>
      <div style={card}>
        {colectasAbiertas.slice(0,4).map((c,i)=>{
          const debo = (datos.colectasPend||[]).some(p=>p.id===c.id);
          return (
            <div key={c.id} onClick={()=>onNavigate?.("finanzas",{openColecta:c.id})} style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",gap:10,padding:"12px 18px",borderTop:i?"1px solid #F1F5F9":"none",cursor:"pointer"}}>
              <span style={{fontSize:14,fontWeight:600,color:"#0F172A"}}>{c.titulo}</span>
              <span style={{fontSize:12,fontWeight:600,color:debo?"#0F172A":"#64748B",whiteSpace:"nowrap"}}>{unir(debo?"Falta tu aporte":"Al día", (c.fecha_limite||c.vencimiento)?`cierra el ${fechaCorta(c.fecha_limite||c.vencimiento)}`:null)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // Alertas del curso: lo único que se marca en rojo (son urgencias reales).
  const bloqueAlertas = (datos.alertas||[]).map(al=>{
    const tag = tagDe(al.curso_id);
    return (
      <div key={al.id} style={{display:"flex",gap:12,alignItems:"flex-start",padding:"14px 16px",marginBottom:16,borderRadius:16,border:"1px solid #FECACA",background:"#FEF2F2"}}>
        <Icono nombre="alerta" size={20} color="#DC2626" style={{marginTop:1}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#B91C1C"}}>Alerta del curso{al.hora?` · ${al.hora}`:""}</span>
            <Hijo tag={tag}/>
          </div>
          <div style={{fontSize:14,fontWeight:600,color:"#0F172A",marginTop:3,lineHeight:1.45}}>{al.mensaje}</div>
        </div>
        {isAdmin&&<button onClick={()=>dismissAlerta(al)} aria-label="Quitar alerta" style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#94A3B8",padding:2}}>✕</button>}
      </div>
    );
  });


  return (
    <div>
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijos||[]} onClose={()=>{ setFestejoDetalle(null); cargar(); }} onUpdate={cargar}/>}
      {/* Encabezado: fecha, saludo y el selector "Todos mis hijos ▾" (lo arma App.jsx). */}
      <div style={{marginBottom:22}}>
        <div style={{fontSize:13,color:"#64748B"}}>{hoy}</div>
        <div style={{fontSize:28,fontWeight:800,color:"#0F172A",letterSpacing:-0.4,marginTop:2}}>Hola{userName?`, ${userName}`:""}</div>
        {selector ? <div style={{marginTop:12}}>{selector}</div> : null}
      </div>
      {error&&<ErrorMuro onReintentar={cargar} tieneDatos style={{marginBottom:18}}/>}
      <div style={isMobile ? undefined : {display:"grid",gridTemplateColumns:"minmax(0,1fr) 340px",gap:28,alignItems:"start"}}>
        <div style={{minWidth:0}}>
          {bloqueAlertas}
          {bloquePendientes}
          {bloqueComunicaciones}
          {isMobile&&bloqueAgenda}
          {isMobile&&bloqueMenu}
        </div>
        {!isMobile&&(
          <div style={{minWidth:0}}>
            {bloqueAgenda}
            {bloqueMenu}
            {bloqueColectas}
          </div>
        )}
      </div>
    </div>
  );
}
