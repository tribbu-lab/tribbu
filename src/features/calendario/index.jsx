// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { Icono } from "../../components/Icono";
import { EmptyState } from "../../components/EmptyState";
import { Buscador } from "../../components/Buscador";
import { supabase } from "../../supabase";
import { BotonNuevo } from "../../components/BotonNuevo";
import { BotonFiltros, FiltrosModal } from "../../components/Filtros";
import { borrarArchivos } from "../../lib/storageUrl";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtNombre, fmtRangoFecha, fmtLocalDate, safeUrl, uuidLite } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { Spinner } from "../../components/Spinner";
import { AdjuntosInput, AdjuntosList, ImagenAmpliable } from "../../components/Adjuntos";
import { Paginador } from "../../components/Paginador";
import { ConfirmDestructivoModal } from "../../components/ConfirmDestructivoModal";
import { CursoListSelector } from "../../components/CursoListSelector";
import { useToast } from "../../hooks/useToast";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { FestejoDetalleModal } from "../cumples";
import BotonAgregarCalendario from "./BotonAgregarCalendarioWeb";
import { useCargar } from "../../hooks/useCargar";
import { rangoNecesario, cubre, unirRangos, filtroDesdeEventos } from "../../lib/calendarioRango";
import { useAutoresDocentes } from "../../hooks/useAutoresDocentes";
import { etiquetaDocente, separarCumplesDocente } from "../../lib/docentes";
import { diasVisibles, normalizarDia, grillaHorario } from "../../lib/horarios";
import { bloquesDeTalleres } from "../../lib/talleres";
import { textoPlano } from "../../lib/formato";

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


// Tag de hijo estándar (solo vista "Todos": tagDeCurso devuelve null en vista por hijo).
function TagHijo({ tag }) {
  if(!tag) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:5,minWidth:0}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
      <span style={{fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{tag.nombre}</span>
    </span>
  );
}

export function Calendario({ cursoId, cursoIds, esVistaTodos=false, tagDeCurso=()=>null, userId, isAdmin, misHijos=[], hijoActivo=null, openFecha=null, onClearOpenFecha, cursosDocente=[], cursosAdmin=[], soloHorario=false }) {
  // Room Parent o docente de este curso: pueden cargar eventos (no en "Todos").
  // En "Todos" (sin curso elegido) se puede crear en los cursos donde es
  // docente o Room Parent: el formulario pide "Para el curso de" (como Avisos).
  const cursosCreables = cursoId ? [] : (cursoIds||[]).filter(c=>cursosDocente.includes(c)||cursosAdmin.includes(c));
  const opcionesCurso = cursosCreables.map(c=>({ curso_id:c, tag:tagDeCurso(c) }));
  const puedeCrear = isAdmin || (!!cursoId && cursosDocente.includes(cursoId)) || cursosCreables.length>0;
  const hoy       = new Date(); hoy.setHours(0,0,0,0);
  const [horarios, setHorarios] = useState([]);
  const [talleresInsc, setTalleresInsc] = useState([]); // inscripciones "inscripto" de mis hijos con su taller
  const [cursoDeHijo, setCursoDeHijo] = useState({});   // hijo_id → curso_id (de mis hijos)
  const [horarioColegio, setHorarioColegio] = useState(null);
  const [filtroTipo,   setFiltroTipo]   = useState("todos");
  const [filtroRango,  setFiltroRango]  = useState("90"); // "7"|"30"|"90"|"custom"
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [filtroDesde,  setFiltroDesde]  = useState("");
  const [filtroHasta,  setFiltroHasta]  = useState("");
  // soloHorario: la pestaña "Horario" de Agenda (App.jsx, tab "horario").
  const [vista,   setVista]   = useState(soloHorario ? "horario" : "mes");
  const [mes,     setMes]     = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [eventos, setEventos] = useState([]);
  // Eventos publicados por docentes: etiqueta "👩‍🏫 Laura · Inglés".
  const docenteDe = useAutoresDocentes(eventos.map(e=>e.creado_por));
  const [cumples, setCumples] = useState([]);
  const [diaSelec,setDiaSelec]= useState(null);
  const [modal,   setModal]   = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [festejoDetalle, setFestejoDetalle] = useState(null);
  const [eventoDetalle,  setEventoDetalle]  = useState(null);
  const [recordatorios,  setRecordatorios]  = useState([]);
  const { showToast, Toast } = useToast();

  // Rango de eventos cargado (lib/calendarioRango): arranca en [1° del mes
  // actual, hoy + 90 días] y se amplía acá, en el render, cuando la vista pide
  // fechas fuera (otro mes, rango personalizado, deep-link). Antes se pedían
  // todos los eventos del año en cada apertura.
  const esCustom = filtroRango==="custom";
  const necesario = rangoNecesario({
    hoy, mes, vista,
    desdeCustom: esCustom ? (filtroDesde||null) : null,
    hastaCustom: esCustom ? (filtroHasta||fmtLocalDate(new Date(hoy.getFullYear()+1,11,31))) : null,
  });
  const [rangoEventos, setRangoEventos] = useState(null);
  if(!cubre(rangoEventos, necesario)) setRangoEventos(unirRangos(rangoEventos, necesario));

  // Comunicados = recordatorios con fecha de hoy en adelante, para todos o
  // para mí (filtrado en la consulta; antes se traían todos y se filtraba acá).
  const cargarRecs = useCallback(async () => {
    if(!cursoIds?.length) return;
    let q = supabase.from("recordatorios").select("*").in("curso_id",cursoIds).gte("fecha", fmtLocalDate(new Date()));
    q = userId ? q.or(`para_usuario_id.is.null,para_usuario_id.eq.${userId}`) : q.is("para_usuario_id", null);
    const recs = await q.order("fecha",{ascending:true});
    setRecordatorios(recs.data||[]);
  }, [cursoIds, userId]);

  // Booleano (no el array cursosDocente, que llega nuevo en cada render) para no recargar en bucle.
  const esDocente = cursosDocente.length > 0;
  const cargar = useCallback(async () => {
    if(!cursoIds?.length || !rangoEventos) return;
    const cumplesDoc = esDocente ? supabase.rpc("cumples_para_docente", { p_cursos: cursoIds }).then(r=>separarCumplesDocente(r.data)) : null;
    const [ev, al, ma, hor, col, tal] = await Promise.all([
      // Solo los que se solapan con el rango cargado (ver rangoEventos arriba).
      supabase.from("eventos").select("*").in("curso_id", cursoIds)
        .lte("fecha", rangoEventos.hasta).or(filtroDesdeEventos(rangoEventos.desde)).order("fecha"),
      // Docente: la RLS no le deja leer hijos/maestros → cumpleaños por RPC (una sola llamada para las dos listas).
      cumplesDoc ? cumplesDoc.then(x=>({data:x.hijos})) : supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color,curso_id").in("curso_id", cursoIds),
      cumplesDoc ? cumplesDoc.then(x=>({data:x.maestros})) : supabase.from("maestros").select("id,nombre,apellido,fecha_nacimiento, maestro_cursos!inner(curso_id)").in("maestro_cursos.curso_id", cursoIds),
      // clases(optativa, clase_alumnos): talleres optativos — por RLS cada
      // familia recibe solo las filas de sus hijos (ver horariosVisibles abajo).
      supabase.from("horarios").select("*, clases(optativa, clase_alumnos(hijo_id))").in("curso_id", cursoIds).order("hora_inicio"),
      // Horario de clases del colegio de estos cursos (tabla multi-colegio
      // "colegios", la que se edita en Contacto/panel del colegio — antes se
      // leía de la singleton vieja "colegio", que ya no se actualiza).
      supabase.from("cursos").select("colegios(horario_clases)").in("id", cursoIds),
      // Talleres extraprogramáticos en los que mis hijos están inscriptos
      // (supabase/talleres.sql): se suman al horario del hijo.
      misHijos.length
        ? supabase.from("taller_inscripciones").select("taller_id, hijo_id, estado, talleres(id, nombre, estado, fecha_inicio, fecha_fin, profe_texto, taller_horarios(id, taller_id, dia, hora_inicio, hora_fin))").in("hijo_id", misHijos).eq("estado", "inscripto")
        : { data: [] },
    ]);
    setEventos(ev.data||[]);
    setHorarios(hor.data||[]);
    setTalleresInsc(tal.data||[]);
    setCursoDeHijo(Object.fromEntries((al.data||[]).filter(a=>misHijos.includes(a.id)).map(a=>[a.id,a.curso_id])));
    setHorarioColegio((col.data||[]).map(c=>c.colegios?.horario_clases).find(Boolean)||null);
    // Armamos cumples como eventos virtuales (próxima ocurrencia)
    const todos = [
      ...(al.data||[]).filter(a=>a.fecha_nacimiento).map(a=>({
        id:`c-a-${a.id}`, tipo:"cumple", nombre:fmtNombre(a), color:a.color||"#EC4899",
        fecha_nacimiento: a.fecha_nacimiento, curso_id: a.curso_id,
      })),
      ...(ma.data||[]).filter(m=>m.fecha_nacimiento).map(m=>({
        id:`c-m-${m.id}`, tipo:"cumple", nombre:fmtNombre(m), color:"#8B5CF6",
        fecha_nacimiento: m.fecha_nacimiento, curso_id: m.maestro_cursos?.[0]?.curso_id ?? null,
      })),
    ];
    setCumples(todos);
  }, [cursoIds, rangoEventos, misHijos, esDocente]);
  useCargar(cargar);
  useCargar(cargarRecs);

  // Deep-link a una fecha (Muro, push): se aplica durante el render — el patrón
  // de React para ajustar estado cuando cambia una prop — y el efecto solo le
  // avisa al padre que ya se usó. fechaAplicada vuelve a null cuando el padre
  // la limpia, así el mismo link se puede volver a abrir.
  const [fechaAplicada, setFechaAplicada] = useState(null);
  if(openFecha && openFecha!==fechaAplicada) {
    setFechaAplicada(openFecha);
    const d = new Date(openFecha+"T00:00:00");
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    setDiaSelec({year:d.getFullYear(), month:d.getMonth(), day:d.getDate()});
    setVista("mes");
  }
  if(!openFecha && fechaAplicada) setFechaAplicada(null);
  useEffect(()=>{ if(openFecha) onClearOpenFecha?.(); },[openFecha, onClearOpenFecha]);

  const eliminar = async (id) => {
    // Sin ON DELETE CASCADE hacia evento_asistencia: si el evento tiene RSVPs
    // (confirma_asistencia) el delete de "eventos" viola la FK y falla en
    // silencio (mismo patrón que eliminarAlumno en superadmin) — limpiar antes.
    // Las asistencias se borran en cascada (eventos-permisos-edicion.sql).
    const { data: borrados, error } = await supabase.from("eventos").delete().eq("id", id).select("adjuntos,imagen_url");
    setConfirm(null);
    if(error) { showToast(`No se pudo eliminar: ${error.message}`, "error"); return; }
    borrarArchivos(borrados?.[0]?.adjuntos, "adjuntos");
    if(borrados?.[0]?.imagen_url) borrarArchivos([borrados[0].imagen_url], "eventos");
    cargar();
  };

  // Recordatorios con fecha (incluye Comunicaciones del colegio con grupo_id)
  // se muestran como eventos virtuales tipo "comunicado" — con horario si lo
  // cargaron, si no como "todo el día". Uno sin fecha es un aviso permanente
  // sin lugar en el calendario.
  const comunicados = recordatorios.filter(r=>r.fecha).map(r=>({
    id:`r-${r.id}`, tipo:"comunicado",
    titulo:(r.grupo_id?"🏫 ":"")+(r.titulo||textoPlano(r.texto)),
    descripcion: r.titulo ? textoPlano(r.texto) : null,
    fecha:r.fecha, hora:r.hora_inicio, hora_fin:r.hora_fin, curso_id:r.curso_id, adjuntos:r.adjuntos,
  }));

  // Devuelve todos los "eventos" (reales + cumples + comunicados) para un año/mes/día dado.
  // Un evento multi-día (fecha_fin) aparece en cada día de su rango.
  const eventosDelDia = (year, month, day) => {
    const fecha = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const reales = eventos.filter(e => e.fecha <= fecha && (e.fecha_fin || e.fecha) >= fecha);
    const citas = comunicados.filter(c => c.fecha === fecha);
    const bdayHoy = cumples.filter(c => {
      const d = new Date(c.fecha_nacimiento+"T00:00:00");
      return d.getMonth()===month && d.getDate()===day;
    });
    return [...reales, ...citas, ...bdayHoy.map(c=>({...c, titulo:c.nombre, fecha}))];
  };

  const year = mes.getFullYear(), month = mes.getMonth();
  const firstDay = (new Date(year,month,1).getDay()+6)%7;
  const daysInMonth = new Date(year,month+1,0).getDate();
  const cells = Array(firstDay).fill(null);
  for(let i=1;i<=daysInMonth;i++) cells.push(i);

  // Lista cronológica: próximos 60 días de eventos + cumples
  const listaEventos = () => {
    let desde = new Date(hoy);
    let hasta = new Date(hoy);
    if(filtroRango==="custom") {
      desde = filtroDesde ? new Date(filtroDesde+"T00:00:00") : new Date(hoy);
      hasta = filtroHasta ? new Date(filtroHasta+"T00:00:00") : new Date(hoy.getFullYear()+1,11,31);
    } else {
      hasta.setDate(hasta.getDate() + Number(filtroRango));
    }
    const reales = eventos
      .filter(e => {
        const ini = new Date(e.fecha+"T00:00:00");
        const fin = e.fecha_fin ? new Date(e.fecha_fin+"T00:00:00") : ini;
        return fin>=desde && ini<=hasta; // solapa el rango del filtro
      })
      .map(e => ({ ...e, _fecha: new Date(e.fecha+"T00:00:00") }));
    const citasList = comunicados
      .map(c => ({ ...c, _fecha: new Date(c.fecha+"T00:00:00") }))
      .filter(c => c._fecha>=desde && c._fecha<=hasta);
    const bdayList = cumples.map(c => {
      const d = new Date(c.fecha_nacimiento+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < desde) next = new Date(hoy.getFullYear()+1, d.getMonth(), d.getDate());
      if(next < desde || next > hasta) return null;
      return { ...c, titulo: c.nombre, fecha: fmtLocalDate(next), _fecha: next, tipo:"cumple" };
    }).filter(Boolean);
    const todos = [...reales, ...citasList, ...bdayList].sort((a,b)=>a._fecha-b._fecha);
    return filtroTipo==="todos" ? todos : todos.filter(e=>e.tipo===filtroTipo);
  };

  const evDiaSelec = diaSelec ? eventosDelDia(diaSelec.year, diaSelec.month, diaSelec.day) : [];

  return (
    <div>
      <Toast/>
      {(modal==="nuevo"||modal?.id) && <EventoModal evento={modal==="nuevo"?null:modal} cursoId={cursoId} userId={userId} cursosOpciones={opcionesCurso} onClose={()=>setModal(null)} onSave={()=>{ setModal(null); cargar(); }}/>}
      {eventoDetalle&&<EventoAsistenciaModal evento={eventoDetalle} tag={tagDeCurso(eventoDetalle.curso_id)} misHijos={misHijos} userId={userId} onClose={()=>setEventoDetalle(null)}/>}
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijos||[]} onClose={()=>setFestejoDetalle(null)} onUpdate={cargar}/>}
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

      {/* Una sola fila arriba del contenido (el título lo da la pestaña de
          Agenda): Mes / Próximos + sincronizar + nuevo evento. El Horario es
          su propia pestaña (soloHorario). */}
      {!soloHorario&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{display:"flex",gap:20,flex:1}}>
            {[{id:"mes",l:"Mes"},{id:"lista",l:"Próximos"}].map(t=>(
              <button key={t.id} onClick={()=>setVista(t.id)} style={{padding:"8px 0",border:"none",borderBottom:`2px solid ${vista===t.id?"#0F172A":"transparent"}`,background:"none",cursor:"pointer",fontFamily:"inherit"}}>
                <span style={{fontSize:14,fontWeight:vista===t.id?800:600,color:vista===t.id?"#0F172A":"#64748B"}}>{t.l}</span>
              </button>
            ))}
          </div>
          <BotonAgregarCalendario supabase={supabase} userId={userId} compacto/>
          {puedeCrear&&<BotonNuevo onClick={()=>setModal("nuevo")} ariaLabel="Nuevo evento"/>}
        </div>
      )}

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
                {puedeCrear&&<button onClick={()=>setModal("nuevo")} style={{padding:"5px 12px",borderRadius:8,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
              </div>
              {evDiaSelec.length===0
                ? <div style={{fontSize:13,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin eventos este día</div>
                : evDiaSelec.map((e,i)=>{
                    const cfg = TIPO_CONFIG[e.tipo]||TIPO_CONFIG.acto;
                    return (
                      <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 0",borderBottom:i<evDiaSelec.length-1?"1px solid #F1F5F9":"none"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                            <TagHijo tag={tagDeCurso(e.curso_id)}/>
                            {docenteDe(e.creado_por)?<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#F0F9FF",color:"#0369A1"}}>{etiquetaDocente(docenteDe(e.creado_por))}</span>:null}
                          </div>
                          <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                            {cfg.label}{e.hora?` · ${e.hora}${e.hora_fin?` – ${e.hora_fin}`:""}`:""}{e.lugar?` · ${e.lugar}`:""}
                          </div>
                          {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                          {e.tipo==="festejo"&&e.imagen_url&&<ImagenAmpliable src={e.imagen_url} bucket="eventos" alt="Invitación" style={{width:64,height:64,objectFit:"cover",borderRadius:8,marginTop:6,display:"block"}}/>}
                          <AdjuntosList adjuntos={e.adjuntos}/>
                        </div>
                        {e.tipo==="festejo"
                        ? <button onClick={()=>setFestejoDetalle(e)} style={{border:"none",background:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}><span style={{fontSize:12.5,fontWeight:700,color:"#2563EB",whiteSpace:"nowrap"}}>Invitados →</span></button>
                        : (e.confirma_asistencia ? <button onClick={()=>setEventoDetalle(e)} style={{border:"none",background:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}><span style={{fontSize:12.5,fontWeight:700,color:"#2563EB",whiteSpace:"nowrap"}}>Asistencia →</span></button> : null)
                      }
                        {userId&&e.creado_por===userId&&e.id&&!e.id?.toString().startsWith("c-")&&!e.id?.toString().startsWith("r-")&&e.tipo!=="festejo"&&(
                          <div style={{display:"flex",gap:4}}>
                            <button onClick={()=>setModal(e)} style={{width:30,height:30,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label="Editar evento"><Icono nombre="lapiz" size={15} color="#64748B"/></button>
                            <button onClick={()=>setConfirm(e)} style={{width:30,height:30,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label="Borrar evento"><Icono nombre="papelera" size={15} color="#64748B"/></button>
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
          {/* ── Filtros: un botón que abre el modal (mismo criterio en toda la app) ── */}
          {(()=>{
            const grupos = [
              { key:"rango", label:"Período", defecto:"90", value:filtroRango, onChange:setFiltroRango, options:[{value:"7",label:"Esta semana"},{value:"30",label:"Este mes"},{value:"90",label:"Próximos 3 meses"},{value:"custom",label:"Elegir fechas"}] },
              { key:"tipo", label:"Tipo de evento", value:filtroTipo, onChange:setFiltroTipo, options:[{value:"todos",label:"Todos"},...Object.entries(TIPO_CONFIG).filter(([k])=>k!=="festejo").map(([k,v])=>({value:k,label:v.label}))] },
            ];
            const n = listaEventos().length;
            return (
              <>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                  <span style={{flex:1,fontSize:13.5,fontWeight:600,color:"#64748B"}}>{n===1?"1 evento":`${n} eventos`}</span>
                  <BotonFiltros grupos={grupos} onClick={()=>setFiltrosAbiertos(true)}/>
                </div>
                {filtrosAbiertos&&(
                  <FiltrosModal grupos={grupos} onClose={()=>setFiltrosAbiertos(false)} onLimpiar={()=>{setFiltroRango("90");setFiltroTipo("todos");setFiltroDesde("");setFiltroHasta("");}}>
                    {filtroRango==="custom"&&(
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",margin:"-6px 0 18px"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#64748B"}}>Desde</span>
                        <input type="date" value={filtroDesde} onChange={e=>setFiltroDesde(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white",fontFamily:"inherit"}}/>
                        <span style={{fontSize:12,fontWeight:700,color:"#64748B"}}>Hasta</span>
                        <input type="date" value={filtroHasta} onChange={e=>setFiltroHasta(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white",fontFamily:"inherit"}}/>
                      </div>
                    )}
                  </FiltrosModal>
                )}
              </>
            );
          })()}

          {listaEventos().length===0&&<EmptyState icono="agenda" titulo="No hay eventos" nota="Probá con otros filtros, o creá uno con + Nuevo."/>}
          {listaEventos().map((e,i)=>{
            const d   = new Date(e.fecha+"T00:00:00");
            const dFin = e.fecha_fin ? new Date(e.fecha_fin+"T00:00:00") : d;
            const enCurso = hoy>=d && hoy<=dFin;
            const dias = enCurso ? 0 : Math.round((d-hoy)/86400000);
            const diasTxt = enCurso ? "En curso" : dias===0?"Hoy":dias===1?"Mañana":`${dias}d`;
            return (
              <Card key={e.id||i} style={{padding:"13px 15px",marginBottom:10}}>
                <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                  {/* Fecha en columna, como "Próximos días" del Inicio. */}
                  <div style={{width:38,flexShrink:0,textAlign:"center"}}>
                    <span style={{display:"block",fontSize:10.5,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:"#64748B"}}>{d.toLocaleDateString("es-AR",{weekday:"short"}).replace(".","")}</span>
                    <span style={{display:"block",fontSize:20,fontWeight:800,color:"#0F172A",lineHeight:1.15}}>{d.getDate()}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                      <div style={{fontSize:13,fontWeight:700}}>{e.titulo}</div>
                      <TagHijo tag={tagDeCurso(e.curso_id)}/>
                      {docenteDe(e.creado_por)?<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"#F0F9FF",color:"#0369A1"}}>{etiquetaDocente(docenteDe(e.creado_por))}</span>:null}
                    </div>
                    <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>
                      {[TIPO_CONFIG[e.tipo]?.label, e.fecha_fin&&e.fecha_fin!==e.fecha?fmtRangoFecha(e.fecha, e.fecha_fin):null, e.hora?`${e.hora}${e.hora_fin?` – ${e.hora_fin}`:""}`:null].filter(Boolean).join(" · ")}
                    </div>
                    {e.lugar&&<div style={{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:4}}>
                      {e.lugar}
                      {e.url_ubicacion&&<a href={safeUrl(e.url_ubicacion)||"#"} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginLeft:4}}>Ver mapa</a>}
                    </div>}
                    {e.descripcion&&<div style={{fontSize:11,color:"#64748B",marginTop:2}}>{e.descripcion}</div>}
                    {e.tipo==="festejo"&&e.imagen_url&&<ImagenAmpliable src={e.imagen_url} bucket="eventos" alt="Invitación" style={{width:64,height:64,objectFit:"cover",borderRadius:8,marginTop:6,display:"block"}}/>}
                    <AdjuntosList adjuntos={e.adjuntos}/>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:12,background:enCurso||dias<=2?"#FEE2E2":"#F1F5F9",color:enCurso||dias<=2?"#DC2626":"#64748B"}}>{diasTxt}</span>
                    {e.tipo==="festejo"&&<button onClick={()=>setFestejoDetalle(e)} style={{border:"none",background:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}><span style={{fontSize:12.5,fontWeight:700,color:"#2563EB",whiteSpace:"nowrap"}}>Invitados →</span></button>}
                    {e.tipo!=="festejo"&&e.confirma_asistencia&&<button onClick={()=>setEventoDetalle(e)} style={{border:"none",background:"none",padding:0,cursor:"pointer",fontFamily:"inherit"}}><span style={{fontSize:12.5,fontWeight:700,color:"#2563EB",whiteSpace:"nowrap"}}>Asistencia →</span></button>}
                    {userId&&e.creado_por===userId&&e.id&&!e.id?.toString().startsWith("c-")&&!e.id?.toString().startsWith("r-")&&e.tipo!=="festejo"&&(
                      <div style={{display:"flex",gap:4}}>
                        <button onClick={()=>setModal(e)} style={{width:30,height:30,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label="Editar evento"><Icono nombre="lapiz" size={15} color="#64748B"/></button>
                        <button onClick={()=>setConfirm(e)} style={{width:30,height:30,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label="Borrar evento"><Icono nombre="papelera" size={15} color="#64748B"/></button>
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
      {vista==="horario"&&(()=>{
        const diaHoyHorario = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][new Date().getDay()-1] || null;
        // Talleres optativos: los ve quien gestiona el curso (Room Parent,
        // docente) y cada familia solo si su hijo está anotado.
        const verTodo = (cid) => (isAdmin && cid===cursoId) || cursosDocente.includes(cid);
        const hijosFiltro = esVistaTodos || !hijoActivo ? misHijos : [hijoActivo];
        const talleresVis = talleresInsc.filter(i=>i.talleres && hijosFiltro.includes(i.hijo_id));
        const bloquesTaller = bloquesDeTalleres([...new Map(talleresVis.map(i=>[i.talleres.id,i.talleres])).values()], {
          horarios: talleresVis.flatMap(i=>i.talleres.taller_horarios||[]),
          inscripciones: talleresVis, hijos: Object.entries(cursoDeHijo).map(([id,curso_id])=>({id,curso_id})),
        });
        const horariosVisibles = [...horarios.filter(h=>!h.clases?.optativa || verTodo(h.curso_id)
          || (h.clases.clase_alumnos||[]).some(a=>hijosFiltro.includes(a.hijo_id))), ...bloquesTaller];
        const fmtHora = t => t ? t.slice(0,5) : "";

        // Parsear horario del colegio para obtener hora de inicio y fin
        // Formato esperado: "08:00 — 16:00" o "8:00 - 16:00"
        const parsearHorarioColegio = (str) => {
          if(!str) return { inicio: null, fin: null };
          const m = str.match(/(\d{1,2}:\d{2})\s*[—\-–]\s*(\d{1,2}:\d{2})/);
          if(!m) return { inicio: null, fin: null };
          const pad = t => t.length===4 ? "0"+t : t;
          return { inicio: pad(m[1]), fin: pad(m[2]) };
        };
        const { inicio: colegioInicio, fin: colegioFin } = parsearHorarioColegio(horarioColegio);

        // Render de la tabla semanal para un set de horarios (un curso)
        const renderTabla = (hs) => {
          const DIAS = diasVisibles(hs);
          const delDia = (h, dia) => normalizarDia(h.dia)===dia;
          // Slots base: todos los existentes en horarios
          const slotsExistentes = [...new Set(hs.map(h=>h.hora_inicio))].sort();

          // Si hay horario de colegio, agregar slots vacíos cada hora hasta el fin
          let allSlots = [...slotsExistentes];
          if(colegioInicio && colegioFin && slotsExistentes.length > 0) {
            const primerSlot = slotsExistentes[0];
            const slotInicio = colegioInicio < primerSlot ? colegioInicio : primerSlot;
            // Generar slots cada 1h desde inicio hasta fin del colegio
            const [hIni] = slotInicio.split(":").map(Number);
            const [hFin] = colegioFin.split(":").map(Number);
            for(let h = hIni; h < hFin; h++) {
              const slot = String(h).padStart(2,"0")+":00";
              if(!allSlots.includes(slot)) allSlots.push(slot);
            }
            allSlots.sort();
          }

          return (
            <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",minWidth:520,width:"100%",tableLayout:"fixed"}}>
                  <colgroup>
                    <col style={{width:68}}/>
                    {DIAS.map(d=><col key={d} style={{width:`${90/DIAS.length}%`}}/>)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{padding:"8px 6px",background:"#F8FAFC",border:"1px solid #E2E8F0",fontSize:10,color:"#94A3B8",fontWeight:700}}></th>
                      {DIAS.map(d=>(
                        <th key={d} style={{padding:"9px 6px",background:"#F8FAFC",border:"1px solid #E2E8F0",textAlign:"center"}}>
                          <span style={{fontSize:12,fontWeight:d===diaHoyHorario?800:700,color:d===diaHoyHorario?"#1D4ED8":"#475569"}}>{d.slice(0,3)}{d===diaHoyHorario?" · hoy":""}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allSlots.map((slot)=>{
                      // find max hora_fin for this slot to show range
                      const slotClases = hs.filter(h=>h.hora_inicio===slot);
                      const maxFin = slotClases.map(h=>h.hora_fin).sort().pop();
                      return (
                        <tr key={slot}>
                          <td style={{padding:"6px 6px",background:"#F8FAFC",border:"1px solid #E2E8F0",textAlign:"center",verticalAlign:"middle"}}>
                            <div style={{fontSize:10,fontWeight:700,color:"#64748B",whiteSpace:"nowrap"}}>{fmtHora(slot)}</div>
                            {maxFin&&<div style={{fontSize:9,color:"#CBD5E1",whiteSpace:"nowrap"}}>{fmtHora(maxFin)}</div>}
                          </td>
                          {DIAS.map(dia=>{
                            const clase = hs.find(h=>delDia(h,dia)&&h.hora_inicio===slot);
                            return (
                              <td key={dia} style={{padding:"5px 5px",border:"1px solid #E2E8F0",verticalAlign:"top",background:"white"}}>
                                {clase ? (
                                  <div style={{borderLeft:`3px solid ${clase.color||"#CBD5E1"}`,padding:"4px 8px",height:"100%",boxSizing:"border-box"}}>
                                    <div style={{fontSize:12.5,fontWeight:700,color:"#0F172A",lineHeight:1.3}}>{clase.clases?.optativa?"✦ ":""}{clase.materia}</div>
                                    {clase.docente&&<div style={{fontSize:11,color:"#64748B",lineHeight:1.3,marginTop:1}}>{clase.docente}</div>}
                                  </div>
                                ) : (
                                  <div style={{height:52}}/>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          );
        };

        // En vista "Todos": una sección por curso, encabezada por el tag del hijo
        const cursosConHorario = esVistaTodos
          ? (cursoIds||[]).filter(cid=>horariosVisibles.some(h=>h.curso_id===cid))
          : [];

        // Descargar el horario (Excel con la grilla; una hoja por curso en "Todos").
        const descargar = async () => {
          const XLSX = await import("xlsx");
          const wb = XLSX.utils.book_new();
          const grupos = esVistaTodos ? cursosConHorario.map(cid=>({ nombre: tagDeCurso(cid)?.nombre || "Horario", hs: horariosVisibles.filter(h=>h.curso_id===cid) })) : [{ nombre: "Horario", hs: horariosVisibles }];
          const usados = new Set();
          for(const g of grupos) {
            const ws = XLSX.utils.json_to_sheet(grillaHorario(g.hs));
            ws["!cols"] = [{ wch: 13 }, ...diasVisibles(g.hs).map(()=>({ wch: 26 }))];
            let n = g.nombre.replace(/[\\/?*[\]:]/g,"").slice(0,28) || "Horario", i = 2;
            while(usados.has(n)) n = `${n.slice(0,25)} ${i++}`;
            usados.add(n);
            XLSX.utils.book_append_sheet(wb, ws, n);
          }
          XLSX.writeFile(wb, "Horario de clases.xlsx");
        };

        return (
          <div>
            {/* El título lo da la pestaña "Horario" de Agenda. */}
            {horariosVisibles.length>0&&(
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                <button onClick={descargar} style={{padding:"8px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontFamily:"inherit"}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#334155"}}>Descargar Excel</span>
                </button>
              </div>
            )}

            {horariosVisibles.length===0&&(
              <EmptyState icono="reloj" titulo="Todavía no hay horario"
                nota={isAdmin ? "Cargalo desde Curso → Administrar el curso → Horarios." : "Cuando el colegio cargue el horario de clases, aparece acá."}/>
            )}

            {horariosVisibles.some(h=>h.clases?.optativa)&&<div style={{fontSize:11.5,color:"#7C3AED",marginBottom:10}}>✦ Taller</div>}
            {horariosVisibles.length>0&&(esVistaTodos
              ? cursosConHorario.map(cid=>(
                  <div key={cid} style={{marginBottom:24}}>
                    <div style={{marginBottom:8}}><TagHijo tag={tagDeCurso(cid)}/></div>
                    {renderTabla(horariosVisibles.filter(h=>h.curso_id===cid))}
                  </div>
                ))
              : renderTabla(horariosVisibles)
            )}
          </div>
        );
      })()}

      {/* VISTA RECORDATORIOS */}
    </div>
  );
}

// Una fila "pendiente" por alumno del curso (y cada apoderado) en un evento que
// pide confirmar asistencia. No toca las filas que ya existen: editar el evento
// no borra lo que las familias respondieron.
async function crearAsistenciaPendiente(eventoId, cursoId) {
  const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id", cursoId);
  const hijosIds = (hijos||[]).map(h=>h.id);
  if(!hijosIds.length) return;
  const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("hijo_id",hijosIds);
  const rows = (uh||[]).map(r=>({ evento_id:eventoId, usuario_id:r.usuario_id, alumno_invitado_id:r.hijo_id, asiste:"pendiente" }));
  if(rows.length) await supabase.from("evento_asistencia").upsert(rows, { onConflict: "evento_id,alumno_invitado_id", ignoreDuplicates: true });
}

// Lo que se copia a los otros cursos de un evento multi-curso al editarlo.
const CAMPOS_GRUPO = ["titulo","tipo","fecha","fecha_fin","hora","hora_fin","todo_el_dia","lugar","url_ubicacion","descripcion","adjuntos","confirma_asistencia"];

// cursosOpciones: en la vista "Todos" (sin curso elegido), los cursos donde se
// puede crear — [{curso_id, tag:{nombre,color}}]; se elige con "PARA EL CURSO DE".
export function EventoModal({ evento, cursoId, userId, cursosOpciones = [], onClose, onSave }) {
  const esNuevo = !evento;
  const [form, setForm] = useState({
    titulo:      evento?.titulo      || "",
    tipo:        evento?.tipo        || "acto",
    fecha:       evento?.fecha       || "",
    fecha_fin:   evento?.fecha_fin   || "",
    hora:        evento?.hora        || "",
    hora_fin:    evento?.hora_fin    || "",
    lugar:       evento?.lugar       || "",
    url_ubicacion: evento?.url_ubicacion || "",
    descripcion: evento?.descripcion || "",
    // Un evento nuevo arranca CON hora (no "Todo el día") para que el admin
    // vea el campo de hora de entrada, en vez de tener que acordarse de
    // destildar el toggle — quedaba pasando que la hora terminaba escrita a
    // mano en la Descripción en vez de cargada en el campo real. Al editar
    // se respeta el valor guardado.
    todo_el_dia: esNuevo ? false : evento.todo_el_dia !== false,
    confirma_asistencia: evento?.confirma_asistencia ?? false,
    adjuntos:    evento?.adjuntos    || [],
  });
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  // Escrituras siempre sobre el curso del evento (nunca el de sesión al editar)
  const [cursoElegido, setCursoElegido] = useState(cursosOpciones[0]?.curso_id ?? null);
  const cursoEvento = evento?.curso_id ?? cursoId ?? cursoElegido;
  const fechaFinInvalida = form.fecha_fin && form.fecha && form.fecha_fin < form.fecha;
  const guardar = async () => {
    if(!form.titulo || !form.fecha || fechaFinInvalida) return;
    setGuardando(true);
    // fecha_fin es columna `date`: "" no es válido, tiene que viajar null.
    const payload = { ...form, fecha_fin: form.fecha_fin || null, curso_id: cursoEvento };
    let eventoId = evento?.id;
    try {
      if(esNuevo) {
        const { data: ev } = await supabase.from("eventos").insert({ ...payload, creado_por: userId }).select().single();
        eventoId = ev?.id;
      } else {
        await supabase.from("eventos").update(payload).eq("id", evento.id); // sin creado_por: editar no cambia quién lo creó
      }
    } catch(e) {
      console.error("EventoModal.guardar (insert/update):", e);
      setGuardando(false);
      return; // no se guardó — dejar el modal abierto para reintentar
    }
    // El evento ya existe en la base a partir de acá: push y asistencia son
    // best-effort, un error o una red lenta ahí no debe dejar el modal
    // trabado sin cerrarse (el evento se creaba bien pero el botón quedaba
    // pegado en "Guardando…" para siempre si sendPush/getUserIdsByCurso fallaba).
    try {
      if(esNuevo) {
        const userIds = await getUserIdsByCurso(cursoEvento);
        await sendPush({ type:"evento", payload:{ titulo:form.titulo, fecha:form.fecha||"", userIds } });
      }
      // Si confirma_asistencia: filas pendientes para los alumnos del curso que
      // todavía no tienen (al editar no se pisan las respuestas que ya llegaron).
      if(form.confirma_asistencia && eventoId) await crearAsistenciaPendiente(eventoId, cursoEvento);
    } catch(e) {
      console.error("EventoModal.guardar (push/asistencia):", e);
    } finally {
      setGuardando(false);
      onSave();
    }
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:16,fontWeight:900,marginBottom:16}}>{esNuevo?"Nuevo evento":"Editar evento"}</div>
        {esNuevo && !cursoId && cursosOpciones.length>1 ? (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Para el curso de</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {cursosOpciones.map(o=>{
                const act = cursoElegido===o.curso_id;
                return (
                  <button key={o.curso_id} onClick={()=>setCursoElegido(o.curso_id)} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:`1.5px solid ${act?"#3B82F6":"#E2E8F0"}`,background:act?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:act?"#3B82F6":"#94A3B8"}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:o.tag?.color||"#94A3B8",display:"inline-block"}}/>
                    {o.tag?.nombre||"Curso"}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Tipo</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {Object.entries(TIPO_CONFIG).filter(([k])=>k!=="cumple"&&k!=="festejo").map(([k,v])=>(
              <button key={k} onClick={()=>setForm(p=>({...p,tipo:k,confirma_asistencia:["paseo","acto","reunion"].includes(k)?p.confirma_asistencia:false}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.tipo===k?v.color:"#E2E8F0"}`,background:form.tipo===k?v.bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.tipo===k?v.color:"#94A3B8"}}>{v.emoji} {v.label}</button>
            ))}
          </div>
        </div>
        {[
          {label:"Título",      key:"titulo",      type:"text", ph:"Ej: Acto del 25 de mayo"},
          {label:"Fecha",       key:"fecha",       type:"date"},
          {label:"Fecha fin (opcional, si dura varios días)", key:"fecha_fin", type:"date"},
          {label:"Lugar",        key:"lugar",         type:"text", ph:"Ej: Patio del colegio"},
          {label:"URL ubicación", key:"url_ubicacion", type:"url",  ph:"Ej: https://maps.google.com/..."},
          {label:"Descripción",   key:"descripcion",   type:"text", ph:"Detalles adicionales"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
            {f.key==="fecha_fin"&&fechaFinInvalida&&<div style={{fontSize:11,color:"#EF4444",marginTop:4}}>La fecha fin no puede ser anterior a la fecha de inicio</div>}
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setForm(p=>({...p,todo_el_dia:!p.todo_el_dia,...(p.todo_el_dia?{}:{hora:"",hora_fin:""})}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.todo_el_dia?"#3B82F6":"#E2E8F0"}`,background:form.todo_el_dia?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.todo_el_dia?"#3B82F6":"#94A3B8"}}>Todo el día</button>
            {!form.todo_el_dia&&<input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto",flex:1}}/>}
            {!form.todo_el_dia&&form.hora&&<><span style={{fontSize:12,color:"#94A3B8"}}>a</span><input type="time" value={form.hora_fin} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={{...inp,width:"auto",flex:1}}/></>}
          </div>
        </div>
        <div style={{marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" id="confirma_asist" checked={!!form.confirma_asistencia} onChange={e=>setForm(p=>({...p,confirma_asistencia:e.target.checked}))} style={{width:16,height:16,cursor:"pointer",accentColor:"#3B82F6"}}/>
          <label htmlFor="confirma_asist" style={{fontSize:13,fontWeight:600,cursor:"pointer",color:"#0F172A"}}>Solicitar asistencia</label>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Adjuntos (opcional)</div>
          <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId={cursoEvento} onUploadingChange={setSubiendoAdj}/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={guardar} disabled={guardando||subiendoAdj||fechaFinInvalida} style={{flex:2,padding:11,borderRadius:10,border:"none",background:guardando||subiendoAdj||fechaFinInvalida?"#93C5FD":"#3B82F6",color:"white",cursor:guardando||subiendoAdj||fechaFinInvalida?"default":"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando...":"Guardar"}</button>
        </div>
      </Card>
    </div>
  );
}

export function EventoAsistenciaModal({ evento, onClose, misHijos=[], userId=null, tag=null }) {
  const [asistencia, setAsistencia] = useState({});
  const [hijosInfo,  setHijosInfo]  = useState({});
  const [todosHijos, setTodosHijos] = useState([]);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [cargando,   setCargando]   = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data: asist } = await supabase.from("evento_asistencia").select("*").eq("evento_id", evento.id);
    const mapaAsist = {};
    (asist||[]).forEach(r=>{ if(r.alumno_invitado_id) mapaAsist[r.alumno_invitado_id] = r.asiste||"pendiente"; });
    setAsistencia(mapaAsist);
    const { data: hijos } = await supabase.from("hijos").select("id,nombre,apellido,color").eq("curso_id", evento.curso_id);
    const hijosMap = {};
    (hijos||[]).forEach(h=>{ hijosMap[h.id]=h; });
    setHijosInfo(hijosMap);
    setTodosHijos(hijos||[]);
    if(userId) {
      const { data: u } = await supabase.from("usuarios").select("rol").eq("id",userId).single();
      setIsAdmin(u?.rol==="room"||u?.rol==="super");
    }
    setCargando(false);
  }, [evento.curso_id, evento.id, userId]);
  useCargar(cargar);


  const responder = async (alumnoId, asiste) => {
    if(!userId) return;
    setAsistencia(prev=>({...prev,[alumnoId]:asiste}));
    await supabase.from("evento_asistencia").upsert(
      { evento_id:evento.id, usuario_id:userId, alumno_invitado_id:alumnoId, asiste },
      { onConflict:"evento_id,alumno_invitado_id" }
    );
  };

  const misHijosEnCurso = misHijos.filter(hid=>hijosInfo[hid]);
  const confirmados = todosHijos.filter(h=>asistencia[h.id]==="si");
  const noVan       = todosHijos.filter(h=>asistencia[h.id]==="no");
  const talVez      = todosHijos.filter(h=>asistencia[h.id]==="tal_vez");
  const pendientes  = todosHijos.filter(h=>!asistencia[h.id]||asistencia[h.id]==="pendiente");
  const inicialAvatar = (h) => `${(h.nombre||"?")[0]}${(h.apellido||"")[0]||""}`.toUpperCase();

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:440,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:15,fontWeight:900}}>{evento.titulo}</div>
              <TagHijo tag={tag}/>
            </div>
            <div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>
              {fmtRangoFecha(evento.fecha, evento.fecha_fin)}
              {evento.hora?` · ${evento.hora}${evento.hora_fin?` – ${evento.hora_fin}`:""}` :""}
            </div>
            {evento.lugar&&<div style={{fontSize:12,color:"#94A3B8",marginTop:2}}>📍 {evento.lugar}</div>}
          </div>
          <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:30,height:30,cursor:"pointer",fontSize:14,color:"#94A3B8",flexShrink:0}}>x</button>
        </div>

        {cargando&&<div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>Cargando...</div>}

        {!cargando&&(
          <>
            {misHijosEnCurso.length>0&&(
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Tu asistencia</div>
                {misHijosEnCurso.map(hid=>{
                  const al  = hijosInfo[hid];
                  const est = asistencia[hid]||"pendiente";
                  return (
                    <div key={hid} style={{background:"#F8FAFC",borderRadius:12,padding:"12px 14px",marginBottom:8,border:"1.5px solid #E2E8F0"}}>
                      {misHijosEnCurso.length>1&&<div style={{fontSize:12,fontWeight:700,color:"#64748B",marginBottom:8}}>{al?.nombre} {al?.apellido}</div>}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>responder(hid,"si")} style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${est==="si"?"#10B981":"#E2E8F0"}`,background:est==="si"?"#F0FDF4":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:est==="si"?"#10B981":"#94A3B8"}}>Voy</button>
                        <button onClick={()=>responder(hid,"tal_vez")} style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${est==="tal_vez"?"#F59E0B":"#E2E8F0"}`,background:est==="tal_vez"?"#FFFBEB":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:est==="tal_vez"?"#F59E0B":"#94A3B8"}}>Tal vez</button>
                        <button onClick={()=>responder(hid,"no")} style={{flex:1,padding:"8px 0",borderRadius:10,border:`2px solid ${est==="no"?"#EF4444":"#E2E8F0"}`,background:est==="no"?"#FEF2F2":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:est==="no"?"#EF4444":"#94A3B8"}}>No voy</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumen del curso visible para todos */}
            {todosHijos.length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>
                  Resumen del curso · {confirmados.length} van · {talVez.length} tal vez · {noVan.length} no van · {pendientes.length} pendiente
                </div>
                {[{list:confirmados,label:"Confirman",color:"#10B981",bg:"#F0FDF4"},{list:talVez,label:"Tal vez",color:"#F59E0B",bg:"#FFFBEB"},{list:pendientes,label:"Pendiente",color:"#94A3B8",bg:"#F8FAFC"},{list:noVan,label:"No van",color:"#EF4444",bg:"#FEF2F2"}].map(({list,label,color,bg})=>
                  list.length>0&&(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:11,fontWeight:700,color,marginBottom:5}}>{label} ({list.length})</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {list.map(h=>(
                          <div key={h.id} style={{padding:"7px 10px",background:bg,borderRadius:9,display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:20,height:20,borderRadius:"50%",background:h.color||color,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8.5,fontWeight:800,color:"white"}}>{inicialAvatar(h)}</div>
                            <div style={{fontSize:13,fontWeight:600}}>{h.nombre} {h.apellido}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            {misHijosEnCurso.length===0&&!isAdmin&&(
              <div style={{textAlign:"center",padding:24,color:"#94A3B8",fontSize:13}}>No tenes hijos en este curso</div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// Publica el mismo evento en varios cursos a la vez (exclusivo de Super
// Admin / Admin de Colegio, desde EventosColegio) — mismo patrón que
// ComunicacionesAdmin para recordatorios: un grupo_id compartido marca las
// filas como parte del mismo evento, aunque cada una se edita/borra por
// curso como cualquier evento normal (ver specs/comunicaciones-multi-curso.md).
function EventoMultiCursoModal({ cursos, userId, onClose, onSave }) {
  const [cursosSel, setCursosSel] = useState([]);
  const [form, setForm] = useState({
    titulo: "", tipo: "acto", fecha: "", fecha_fin: "",
    hora: "", hora_fin: "", todo_el_dia: false,
    lugar: "", url_ubicacion: "", descripcion: "",
    confirma_asistencia: false, adjuntos: [],
  });
  const [subiendoAdj, setSubiendoAdj] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const fechaFinInvalida = form.fecha_fin && form.fecha && form.fecha_fin < form.fecha;

  const toggleCurso = (id) => setCursosSel(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const todosSeleccionados = cursos.length>0 && cursosSel.length===cursos.length;
  const seleccionarTodos = () => setCursosSel(todosSeleccionados ? [] : cursos.map(c=>c.id));
  const puedePublicar = !!form.titulo.trim() && !!form.fecha && !fechaFinInvalida && cursosSel.length>0 && !subiendoAdj;

  const publicar = async () => {
    if(!puedePublicar) return;
    setPublicando(true);
    setError(null);
    try {
      // grupo_id solo cuando son varios: con uno es un evento común del curso.
      const grupo_id = cursosSel.length > 1 ? uuidLite() : null;
      const payloadBase = { ...form, fecha_fin: form.fecha_fin || null };
      const rows = cursosSel.map(curso_id => ({ ...payloadBase, curso_id, grupo_id, creado_por: userId }));
      const { data: creados, error: insertErr } = await supabase.from("eventos").insert(rows).select();
      if(insertErr) throw insertErr;
      // Igual que EventoModal: si pide asistencia, una fila pendiente por
      // apoderado de cada curso alcanzado.
      if(form.confirma_asistencia && creados?.length) {
        for(const ev of creados) {
          const { data: hijos } = await supabase.from("hijos").select("id").eq("curso_id", ev.curso_id);
          const hijosIds = (hijos||[]).map(h=>h.id);
          if(!hijosIds.length) continue;
          const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id,hijo_id").in("hijo_id",hijosIds);
          const asistRows = (uh||[]).map(r=>({ evento_id:ev.id, usuario_id:r.usuario_id, alumno_invitado_id:r.hijo_id, asiste:"pendiente" }));
          if(asistRows.length) await supabase.from("evento_asistencia").upsert(asistRows, { onConflict:"evento_id,alumno_invitado_id", ignoreDuplicates:false });
        }
      }
      // Push deduplicado: un apoderado con hijos en 2+ cursos elegidos recibe uno solo.
      const userIds = [...new Set((await Promise.all(cursosSel.map(getUserIdsByCurso))).flat())];
      if(userIds.length) await sendPush({ type:"evento", payload:{ titulo:form.titulo, fecha:form.fecha||"", userIds } });
      onSave();
    } catch(e) {
      console.error("EventoMultiCursoModal.publicar:", e);
      setError(e?.message || "No se pudo publicar. Probá de nuevo.");
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:460,maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:17,fontWeight:800,color:"#0F172A",marginBottom:4}}>Nuevo evento</div>
        <div style={{fontSize:12.5,color:"#64748B",marginBottom:16}}>Elegí uno o varios cursos: en cada uno se publica como un evento propio.</div>

        {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12.5,fontWeight:700,color:"#B91C1C"}}>{error}</div>}

        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:6}}>Tipo</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {Object.entries(TIPO_CONFIG).filter(([k])=>k!=="cumple"&&k!=="festejo").map(([k,v])=>(
              <button key={k} onClick={()=>setForm(p=>({...p,tipo:k,confirma_asistencia:["paseo","acto","reunion"].includes(k)?p.confirma_asistencia:false}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.tipo===k?v.color:"#E2E8F0"}`,background:form.tipo===k?v.bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.tipo===k?v.color:"#94A3B8"}}>{v.emoji} {v.label}</button>
            ))}
          </div>
        </div>
        {[
          {label:"Título",      key:"titulo",      type:"text", ph:"Ej: Feriado — sin clases"},
          {label:"Fecha",       key:"fecha",       type:"date"},
          {label:"Fecha fin (opcional, si dura varios días)", key:"fecha_fin", type:"date"},
          {label:"Lugar",        key:"lugar",         type:"text", ph:"Ej: Patio del colegio"},
          {label:"URL ubicación", key:"url_ubicacion", type:"url",  ph:"Ej: https://maps.google.com/..."},
          {label:"Descripción",   key:"descripcion",   type:"text", ph:"Detalles adicionales"},
        ].map(f=>(
          <div key={f.key} style={{marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
            <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
            {f.key==="fecha_fin"&&fechaFinInvalida&&<div style={{fontSize:11,color:"#EF4444",marginTop:4}}>La fecha fin no puede ser anterior a la fecha de inicio</div>}
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setForm(p=>({...p,todo_el_dia:!p.todo_el_dia,...(p.todo_el_dia?{}:{hora:"",hora_fin:""})}))} style={{padding:"6px 12px",borderRadius:20,border:`2px solid ${form.todo_el_dia?"#3B82F6":"#E2E8F0"}`,background:form.todo_el_dia?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.todo_el_dia?"#3B82F6":"#94A3B8"}}>Todo el día</button>
            {!form.todo_el_dia&&<input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto",flex:1}}/>}
            {!form.todo_el_dia&&form.hora&&<><span style={{fontSize:12,color:"#94A3B8"}}>a</span><input type="time" value={form.hora_fin} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={{...inp,width:"auto",flex:1}}/></>}
          </div>
        </div>
        <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
          <input type="checkbox" id="confirma_asist_multi" checked={!!form.confirma_asistencia} onChange={e=>setForm(p=>({...p,confirma_asistencia:e.target.checked}))} style={{width:16,height:16,cursor:"pointer",accentColor:"#3B82F6"}}/>
          <label htmlFor="confirma_asist_multi" style={{fontSize:13,fontWeight:600,cursor:"pointer",color:"#0F172A"}}>Solicitar asistencia</label>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Adjuntos (opcional)</div>
          <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId="eventos-multi-curso" onUploadingChange={setSubiendoAdj}/>
        </div>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700}}>¿A qué cursos aplica?</div>
          {cursos.length>0&&<button onClick={seleccionarTodos} style={{border:"none",background:"none",color:"#3B82F6",cursor:"pointer",fontSize:12,fontWeight:700}}>{todosSeleccionados?"Ninguno":"Seleccionar todos"}</button>}
        </div>
        <div style={{marginBottom:20}}>
          <CursoListSelector cursos={cursos} seleccionados={cursosSel} onToggle={toggleCurso}/>
        </div>

        {!confirmando ? (
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
            <button onClick={()=>setConfirmando(true)} disabled={!puedePublicar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:puedePublicar?"#3B82F6":"#93C5FD",color:"white",cursor:puedePublicar?"pointer":"default",fontSize:13,fontWeight:700}}>Publicar</button>
          </div>
        ) : (
          <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>¿Publicar en {cursosSel.length} curso{cursosSel.length!==1?"s":""}?</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmando(false)} style={{flex:1,padding:10,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={publicar} disabled={publicando} style={{flex:2,padding:10,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{publicando?"Publicando...":"Sí, publicar"}</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * Sección "📅 Eventos" del panel del colegio (Super Admin / Admin de Colegio):
 * todos los eventos de los cursos del año, con quién los creó, para corregir o
 * borrar lo que haga falta. Mismos permisos que la RLS (puede_editar_evento):
 * super edita/borra cualquier evento; el colegio, solo los que creó el colegio
 * (creador colegio_admin o super). Los festejos solo se borran acá — se editan
 * desde Cumpleaños.
 */
// usuarios: los que el panel ya tiene cargados; solo se piden los autores que falten.
export function EventosColegio({ cursos = [], userId, esSuper = false, usuarios = [], abrirNuevo = null }) {
  const { showToast, Toast } = useToast();
  const [eventos, setEventos] = useState(null);
  const [autores, setAutores] = useState({});
  const [cursoSel, setCursoSel] = useState("");
  const [tipoSel, setTipoSel] = useState("");
  const [periodo, setPeriodo] = useState("proximos");
  const [busqueda, setBusqueda] = useState("");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [editando, setEditando] = useState(null); // evento a editar
  const [multiCurso, setMultiCurso] = useState(false);
  const [borrando, setBorrando] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  // "+ Crear → Evento" del panel: abrir el alta al llegar (abrirNuevo = nonce).
  useEffect(() => { if (abrirNuevo) Promise.resolve().then(() => setMultiCurso(true)); }, [abrirNuevo]);

  const ids = cursos.map(c => c.id).join(",");
  const cargar = useCallback(async () => {
    const cursoIds = ids ? ids.split(",") : [];
    if (!cursoIds.length) { setEventos([]); return; }
    // Los festejos son entre familias: ni se piden.
    const { data, error } = await supabase.from("eventos").select("*").in("curso_id", cursoIds).neq("tipo", "festejo").order("fecha");
    if (error) { showToast(`No se pudieron cargar los eventos: ${error.message}`, "error"); return; }
    const lista = data || [];
    const conocidos = Object.fromEntries(usuarios.map(u => [u.id, u]));
    const faltan = [...new Set(lista.map(e => e.creado_por).filter(id => id && !conocidos[id]))];
    const { data: us } = faltan.length ? await supabase.from("usuarios").select("id,nombre,apellido,rol").in("id", faltan) : { data: [] };
    setAutores({ ...conocidos, ...Object.fromEntries((us || []).map(u => [u.id, u])) });
    setEventos(lista);
  }, [ids, showToast, usuarios]);
  useCargar(cargar);

  const nombreCurso = (id) => cursos.find(c => c.id === id)?.nombre || "—";
  const autor = (id) => {
    const u = autores[id];
    if (!u) return "—";
    const n = fmtNombre(u);
    return u.rol === "super" || u.rol === "colegio_admin" ? `${n} (colegio)` : n;
  };
  const puede = (e) => esSuper || ["super", "colegio_admin"].includes(autores[e.creado_por]?.rol);

  const hoy = fmtLocalDate(new Date());
  const q = busqueda.trim().toLowerCase();
  // Los festejos son entre familias: el colegio no los ve (festejos-sin-colegio.sql;
  // super todavía sí por RLS, así que se filtran también acá).
  const lista = (eventos || [])
    .filter(e => e.tipo !== "festejo")
    .filter(e => !cursoSel || e.curso_id === cursoSel)
    .filter(e => !tipoSel || e.tipo === tipoSel)
    .filter(e => periodo === "proximos" ? (e.fecha_fin || e.fecha) >= hoy : (e.fecha_fin || e.fecha) < hoy)
    .filter(e => !q || `${e.titulo} ${e.descripcion || ""} ${e.lugar || ""}`.toLowerCase().includes(q));
  if (periodo === "pasados") lista.reverse();
  // Un evento cargado para varios cursos va en una sola fila
  // con "N cursos"; editar o eliminar aplica a todos. Filtrando un curso se ve
  // solo la fila de ese curso.
  const items = [];
  const porGrupo = new Map();
  for (const e of lista) {
    // También los cargados curso por curso: mismo título, fecha, hora, tipo y autor.
    const clave = e.grupo_id || [e.titulo, e.fecha, e.fecha_fin, e.hora, e.tipo, e.creado_por].join("|");
    const g = porGrupo.get(clave);
    if (g) { g.filas.push(e); continue; }
    const it = { ...e, filas: [e] };
    porGrupo.set(clave, it);
    items.push(it);
  }
  const cursosDe = (it) => it.filas.length > 1 ? `${it.filas.length} cursos` : nombreCurso(it.curso_id);

  // Edición de un evento multi-curso: EventoModal guarda la fila abierta y
  // acá se copian los mismos datos al resto de los cursos del grupo.
  const propagarGrupo = async (it) => {
    const otros = (it.filas || []).filter(f => f.id !== it.id);
    if (!otros.length) return;
    const { data: a } = await supabase.from("eventos").select("*").eq("id", it.id).single();
    if (!a) return;
    const cambios = Object.fromEntries(CAMPOS_GRUPO.map(k => [k, a[k]]));
    const { error } = await supabase.from("eventos").update(cambios).in("id", otros.map(o => o.id));
    if (error) { showToast(`Se guardó en un curso, pero no en los demás: ${error.message}`, "error"); return; }
    if (a.confirma_asistencia) for (const o of otros) await crearAsistenciaPendiente(o.id, o.curso_id);
  };

  const borrar = async () => {
    setConfirmando(true);
    const { error } = await supabase.from("eventos").delete().in("id", (borrando.filas || [borrando]).map(f => f.id));
    setConfirmando(false);
    if (!error) {
      borrarArchivos(borrando.adjuntos, "adjuntos");
      if (borrando.imagen_url) borrarArchivos([borrando.imagen_url], "eventos");
    }
    if (error) { showToast(`No se pudo eliminar: ${error.message}`, "error"); return; }
    showToast("Evento eliminado");
    setBorrando(null);
    cargar();
  };

  const gruposFiltro = [
    { key: "periodo", label: "Cuándo", value: periodo, onChange: setPeriodo, options: [{ value: "proximos", label: "Próximos" }, { value: "pasados", label: "Pasados" }] },
    { key: "curso", label: "Curso", value: cursoSel, onChange: setCursoSel, options: [{ value: "", label: "Todos" }, ...cursos.map(c => ({ value: c.id, label: c.nombre }))] },
    { key: "tipo", label: "Tipo", value: tipoSel, onChange: setTipoSel, options: [{ value: "", label: "Todos" }, ...Object.entries(TIPO_CONFIG).filter(([k]) => k !== "cumple" && k !== "festejo").map(([k, v]) => ({ value: k, label: v.label }))] },
  ];

  return (
    <div>
      <Toast />
      {editando && (
        <EventoModal
          evento={editando}
          cursoId={editando.curso_id}
          userId={userId}
          onClose={() => setEditando(null)}
          onSave={async () => { const it = editando; setEditando(null); await propagarGrupo(it); showToast(it.filas?.length > 1 ? `Evento guardado en ${it.filas.length} cursos` : "Evento guardado"); cargar(); }}
        />
      )}
      {multiCurso && (
        <EventoMultiCursoModal
          cursos={cursos}
          userId={userId}
          onClose={() => setMultiCurso(false)}
          onSave={() => { setMultiCurso(false); showToast("Evento publicado"); cargar(); }}
        />
      )}
      {borrando && (
        <ConfirmDestructivoModal
          titulo="¿Eliminar este evento?"
          detalle={`"${borrando.titulo}" · ${cursosDe(borrando)} · ${fmtRangoFecha(borrando.fecha, borrando.fecha_fin)}`}
          consecuencias={[borrando.filas?.length > 1 ? `Desaparece del calendario de las familias de los ${borrando.filas.length} cursos` : "Desaparece del calendario de las familias del curso", ...(borrando.confirma_asistencia || borrando.tipo === "festejo" ? ["Se borran también las confirmaciones de asistencia"] : [])]}
          confirmando={confirmando}
          onCancelar={() => setBorrando(null)}
          onConfirmar={borrar}
        />
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <Buscador value={busqueda} onChange={setBusqueda} placeholder="Buscar evento…" style={{ flex: "1 1 200px", minWidth: 0, marginBottom: 0 }} />
        <BotonFiltros grupos={gruposFiltro} onClick={() => setFiltrosAbiertos(true)} />
        <BotonNuevo ariaLabel="Nuevo evento" onClick={() => setMultiCurso(true)} />
      </div>
      {filtrosAbiertos && <FiltrosModal grupos={gruposFiltro} onClose={() => setFiltrosAbiertos(false)} />}

      {eventos === null ? <Spinner /> : items.length === 0 ? (
        <EmptyState icono="agenda" titulo={`${periodo === "proximos" ? "No hay eventos próximos" : "No hay eventos pasados"}${cursoSel ? " en este curso" : ""}`} accion="Nuevo evento" onAccion={() => setMultiCurso(true)} />
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {items.map((e, i) => {
            const cfg = TIPO_CONFIG[e.tipo] || TIPO_CONFIG.acto;
            return (
              <div key={e.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{e.titulo}</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {[fmtRangoFecha(e.fecha, e.fecha_fin), e.hora && e.todo_el_dia === false ? e.hora.slice(0, 5) : null, cursosDe(e), cfg.label].filter(Boolean).join(" · ")}
                  </div>
                  {e.filas.length > 1 ? (
                    <div title={e.filas.map(f => nombreCurso(f.curso_id)).join(", ")} style={{ fontSize: 12, color: "#94A3B8", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {e.filas.map(f => nombreCurso(f.curso_id)).join(", ")}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>Creado por {autor(e.creado_por)}</div>
                </div>
                {puede(e) ? <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {e.tipo !== "festejo" && (
                    <button onClick={() => setEditando(e)} aria-label="Editar evento" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2E8F0", background: "white", cursor: "pointer" }}><Icono nombre="lapiz" size={15} color="#475569" style={{ margin: "0 auto" }} /></button>
                  )}
                  <button onClick={() => setBorrando(e)} aria-label="Eliminar evento" style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2E8F0", background: "white", cursor: "pointer" }}><Icono nombre="papelera" size={15} color="#DC2626" style={{ margin: "0 auto" }} /></button>
                </div> : null}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
