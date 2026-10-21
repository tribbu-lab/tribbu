// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../supabase";
import { BotonNuevo } from "../../components/BotonNuevo";
import { borrarArchivos } from "../../lib/storageUrl";
import { T, ROL_LABEL, ROL_COLOR, ROL_BG, MESES,
         HIJO_COLORS_CUSTOM, HIJO_COLOR_DEFAULT } from "../../lib/theme";
import { fmtLocalDate, sanitize, ordenPorEnviado, coincideTexto } from "../../lib/helpers";
import { Card } from "../../components/Card";
import { Pill } from "../../components/Pill";
import { AdjuntosInput, AdjuntosList } from "../../components/Adjuntos";
import { ChipLecturas, LecturasModal } from "../../components/Lecturas";
import { useLecturas } from "../../hooks/useLecturas";
import { Spinner } from "../../components/Spinner";
import { Paginador } from "../../components/Paginador";
import { BotonFiltros, FiltrosModal } from "../../components/Filtros";
import { Buscador } from "../../components/Buscador";
import { Icono } from "../../components/Icono";
import { SignedImg } from "../../components/SignedImg";
import { separarAvisos, haceCuanto, fechaCortaAviso, fechaDelAviso, origenAviso, fotoDelAviso } from "../../lib/avisosLista";


import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { useCargar } from "../../hooks/useCargar";
import { SELECT_REC_CON_LEIDO, separarLeidos, conLeidoDe } from "../../lib/leidos";
import { useAutoresDocentes } from "../../hooks/useAutoresDocentes";
import { useMembretes } from "../../hooks/useMembretes";
import { textoPlano } from "../../lib/formato";
import { TextoConFormato } from "../../components/TextoConFormato";
import { EditorFormato } from "../../components/EditorFormato";
import { MembreteEncabezado, MembreteFirma } from "../../components/Membrete";
import { etiquetaDocente } from "../../lib/docentes";

// Último publicado primero (creado_en), no por la fecha del aviso: ordenar por
// `fecha` dejaba arriba un aviso con fecha lejana y los recién llegados abajo.
// La fecha del aviso (la del evento) sigue en la columna izquierda y cada fila
// dice además cuándo se envió (fmtEnviado).
const ordenAvisos = ordenPorEnviado;

export function RecordatoriosTab({ items=[], cursosDocente=[], cursoId, cursoIds=[], esVistaTodos=false, tagDeCurso=null, cursosAdmin=[], userId, isAdmin, isSuper=false, active, onBadgeChange, openAviso=null }) {
  const [recordatorios, setRecordatorios] = useState([]);
  const [leidosSet,     setLeidosSet]     = useState(new Set());
  const [modal,         setModal]         = useState(null);
  const [verLecturas,   setVerLecturas]   = useState(null); // aviso cuyo "¿quién lo leyó?" está abierto
  const [form,          setForm]          = useState({titulo:"",texto:"",fecha:"",hora_inicio:"",hora_fin:"",prioridad:"media",urgente:false,adjuntos:[],curso_id:null});
  const [saving,        setSaving]        = useState(false);
  const [subiendoAdj,   setSubiendoAdj]   = useState(false);
  const [alerta,        setAlerta]        = useState(null);
  const [alertaModal,   setAlertaModal]   = useState(false);
  const [filtroRango,   setFiltroRango]   = useState("all");
  const [filtroDesde,   setFiltroDesde]   = useState("");
  const [filtroHasta,   setFiltroHasta]   = useState("");
  const [filtroPrio,    setFiltroPrio]    = useState("all");
  const [filtroLeido,   setFiltroLeido]   = useState("all");
  const [filtroOrigen,  setFiltroOrigen]  = useState("all");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Avisos de docentes: etiqueta "👩‍🏫 Laura · Inglés" y filtro por origen.
  const docenteDe = useAutoresDocentes(recordatorios.map(r=>r.creado_por));
  // Comunicados del colegio con membrete (specs/comunicados-con-formato.md).
  const membreteDeAviso = useMembretes(recordatorios, items);
  const [expandidos,    setExpandidos]    = useState(()=>new Set());
  const toggleExpandido = (id) => setExpandidos(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; });
  const [pagina,        setPagina]        = useState(1);
  // Aviso al que se llegó desde la campanita: se resalta y se lleva a la vista.
  const [resaltado,     setResaltado]     = useState(null);
  const [destinoUsado,  setDestinoUsado]  = useState(null);
  // Llevar a la vista el aviso resaltado y sacar el resaltado a los pocos segundos.
  useEffect(()=>{
    if(!resaltado) return undefined;
    const t1 = setTimeout(()=>document.getElementById(`aviso-${resaltado}`)?.scrollIntoView({behavior:"smooth",block:"center"}), 150);
    const t2 = setTimeout(()=>setResaltado(null), 6000);
    return ()=>{ clearTimeout(t1); clearTimeout(t2); };
  },[resaltado]);
  const POR_PAG = 10;

  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const PRIO = { alta:{l:"Alta",c:"#EF4444",bg:"#FEF2F2"}, media:{l:"Media",c:"#F59E0B",bg:"#FFFBEB"}, baja:{l:"Baja",c:"#10B981",bg:"#F0FDF4"} };
  const hoyStr = fmtLocalDate();

  // Opciones de curso destino para el alta en vista "Todos" (label = hijo/s).
  const cursosOpciones = esVistaTodos
    ? cursoIds.map(cid=>({curso_id:cid, tag:tagDeCurso?.(cid)})).filter(o=>o.tag)
    : [];

  const cargar = useCallback(async () => {
    if(!cursoIds?.length) return;
    const [recsRes, al] = await Promise.all([
      // "¿Lo leí?" embebido (lib/leidos): sin pedir aparte todos mis leídos.
      conLeidoDe(supabase.from("recordatorios").select(SELECT_REC_CON_LEIDO), userId).in("curso_id",cursoIds).order("creado_en",{ascending:false}),
      cursoId
        ? supabase.from("alertas").select("*").eq("curso_id",cursoId).eq("activa",true).order("creado_en",{ascending:false}).limit(1)
        : Promise.resolve({data:[]}),
    ]);
    const { recs, leidos } = separarLeidos(recsRes.data);
    setRecordatorios(recs);
    setLeidosSet(leidos);
    setAlerta((al.data||[])[0]||null);
  }, [cursoId, cursoIds, userId]);
  useCargar(cargar, active); // también al volver a la pestaña


  const esPropio = (r) => r.creado_por === userId;
  // En vista "Todos" el permiso se resuelve contra el rol en el curso de la fila.
  // Igual que la RLS (puede_editar_recordatorio): cada uno edita/borra lo suyo;
  // la Room Parent además los avisos viejos sin creador de su curso. Las
  // Comunicaciones del colegio se gestionan desde el panel del colegio.
  const puedeEditar = (r) => esPropio(r) || (!r.creado_por && (esVistaTodos ? cursosAdmin.includes(r.curso_id) : isAdmin));

  const guardar = async () => {
    if(!form.texto?.trim()) return;
    // En vista "Todos" el alta exige un curso destino elegido en el modal.
    const cursoDestino = cursoId || form.curso_id;
    if(!modal?.id && !cursoDestino) return;
    // Horario solo con fecha (una hora sin día no se puede agendar) y fin solo
    // con inicio — mismo modelo que "Comunicación del colegio". Con fecha y
    // hora_inicio el aviso también entra al calendario sincronizado (feed ICS).
    const hora_inicio = form.fecha && form.hora_inicio ? form.hora_inicio : null;
    const hora_fin = hora_inicio && form.hora_fin ? form.hora_fin : null;
    if(hora_fin && hora_fin < hora_inicio) { alert("La hora de fin no puede ser anterior a la de inicio."); return; }
    setSaving(true);
    const payload = { titulo:sanitize(form.titulo)||null, texto:sanitize(form.texto), fecha:form.fecha||null, hora_inicio, hora_fin, prioridad:form.prioridad||"media", urgente:form.urgente||false, adjuntos:form.adjuntos||[], curso_id:cursoDestino };
    if(modal?.id) {
      // Al editar no se pisa curso_id: en vista "Todos" la fila puede ser de
      // otro curso y el payload la movería.
      const { curso_id:_cid, ...upd } = payload;
      await supabase.from("recordatorios").update(upd).eq("id",modal.id);
    } else {
      const { data: creado } = await supabase.from("recordatorios").insert({...payload, creado_por:userId}).select("id").single();
      // Avisan con push la Room Parent y la maestra del curso (no cualquier familia).
      if(isAdmin || cursosDocente.includes(cursoDestino)) {
        const userIds = await getUserIdsByCurso(cursoDestino);
        // `id` viaja en la notificación: al tocarla, la app abre este aviso.
        await sendPush({ type:"recordatorio", payload:{ titulo:form.titulo?.trim()||textoPlano(form.texto), id:creado?.id, userIds } });
      }
    }
    setSaving(false); setModal(null); cargar();
  };

  const eliminar = async (id) => {
    // Las lecturas se borran en cascada (permisos-avisos-pagos-asistencias.sql).
    const { data: borrados } = await supabase.from("recordatorios").delete().eq("id",id).select("adjuntos");
    borrarArchivos(borrados?.[0]?.adjuntos, "adjuntos");
    cargar();
    onBadgeChange?.();
  };

  const marcarLeido = async (id) => {
    if(!userId) return;
    const nid = id;
    if(leidosSet.has(nid)) {
      await supabase.from("recordatorio_leidos").delete().eq("recordatorio_id",nid).eq("usuario_id",userId);
      setLeidosSet(p=>{ const n=new Set(p); n.delete(nid); return n; });
      onBadgeChange?.();
    } else {
      await supabase.from("recordatorio_leidos").upsert({recordatorio_id:nid,usuario_id:userId},{onConflict:"recordatorio_id,usuario_id"});
      setLeidosSet(p=>new Set([...p,nid]));
      onBadgeChange?.();
    }
  };

  const marcarTodoLeido = async () => {
    if(!userId) return;
    const noLeidos = filtrados.filter(r=>!leidosSet.has(r.id) && !atencion.includes(r));
    if(!noLeidos.length) return;
    await supabase.from("recordatorio_leidos").upsert(
      noLeidos.map(r=>({recordatorio_id:r.id,usuario_id:userId})),
      {onConflict:"recordatorio_id,usuario_id"}
    );
    setLeidosSet(p=>new Set([...p,...noLeidos.map(r=>r.id)]));
    onBadgeChange?.();
  };

  const enviarAlerta = async (msg) => {
    await supabase.from("alertas").update({activa:false}).eq("curso_id",cursoId);
    await supabase.from("alertas").insert({curso_id:cursoId,mensaje:msg,hora:"Ahora",activa:true});
    const userIds = await getUserIdsByCurso(cursoId);
    await sendPush({ type:"alerta", payload:{ mensaje:msg, userIds } });
    cargar();
  };

  const dismissAlerta = async () => {
    if(alerta){ await supabase.from("alertas").update({activa:false}).eq("id",alerta.id); cargar(); }
  };

  const filtrados = recordatorios.filter(r=>{
    // Ocultar recordatorios de regalo (se manejan aparte). Los de colecta (colecta_vence) sí se muestran.
    if(r.tipo==="regalo_cumple") return false;
    if(!coincideTexto(busqueda, r.titulo, r.texto)) return false;
    if(filtroRango==="proximos" && r.fecha && r.fecha < hoyStr) return false;
    if(filtroRango==="pasados"  && (!r.fecha || r.fecha >= hoyStr)) return false;
    if(filtroRango==="personalizado"){
      if(filtroDesde && r.fecha && r.fecha < filtroDesde) return false;
      if(filtroHasta && r.fecha && r.fecha > filtroHasta) return false;
      if(filtroDesde && !r.fecha) return false;
    }
    if(filtroPrio!=="all" && r.prioridad!==filtroPrio) return false;
    if(filtroLeido==="leidos"   && !leidosSet.has(r.id)) return false;
    if(filtroLeido==="noleidos" &&  leidosSet.has(r.id)) return false;
    if(filtroOrigen==="colegio" && !r.grupo_id) return false;
    if(filtroOrigen==="docente" && !docenteDe(r.creado_por)) return false;
    if(filtroOrigen==="normal"  && (r.grupo_id || docenteDe(r.creado_por))) return false;
    return true;
  }).sort(ordenAvisos);

  // Resolver el aviso pedido en el render, cuando ya está cargado: limpiar
  // filtros (podría estar oculto), ir a su página, mostrarlo completo y resaltarlo.
  const destinoKey = openAviso ? `${openAviso.id}:${openAviso.n}` : null;
  const destino = destinoKey && destinoKey!==destinoUsado ? recordatorios.find(r=>r.id===openAviso.id && r.tipo!=="regalo_cumple") : null;
  if(destino) {
    setDestinoUsado(destinoKey);
    setFiltroRango("all"); setFiltroPrio("all"); setFiltroLeido("all"); setFiltroOrigen("all");
    const orden = recordatorios.filter(r=>r.tipo!=="regalo_cumple").sort(ordenAvisos);
    setPagina(Math.floor(orden.findIndex(r=>r.id===destino.id)/POR_PAG)+1);
    setExpandidos(p=>new Set([...p, destino.id]));
    setResaltado(destino.id);
  }

  // "Requiere tu atención" (alta/urgente sin leer) arriba; el resto, paginado.
  const { atencion, recientes } = separarAvisos(filtrados, leidosSet);
  const totalPags = Math.max(1,Math.ceil(recientes.length/POR_PAG));
  const pagina_ = Math.min(pagina,totalPags);
  const visible = recientes.slice((pagina_-1)*POR_PAG, pagina_*POR_PAG);
  const nombreCurso = (cid) => items.find(i=>i.curso_id===cid)?.cursos?.nombre || null;
  const origenDe = (r) => origenAviso(r, { docente: etiquetaDocente(docenteDe(r.creado_por)), curso: nombreCurso(r.curso_id) });
  const recientesSinLeer = recientes.filter(r=>!leidosSet.has(r.id));
  // Confirmación de lectura: la RPC solo devuelve los avisos que este usuario
  // puede auditar (propios, de su curso como Room Parent, o como colegio).
  const lecturas = useLecturas(visible.map(r=>r.id));

  // Filtros juntos en un botón (FiltrosModal) en vez de cuatro selects.
  const conPagina1 = (set) => (v) => { set(v); setPagina(1); };
  const gruposFiltro = [
    { key:"leido",  label:"Estado",           value:filtroLeido,  onChange:conPagina1(setFiltroLeido),  options:[{value:"all",label:"Todos"},{value:"noleidos",label:"Sin leer"},{value:"leidos",label:"Leídos"}] },
    { key:"rango",  label:"Fecha",            value:filtroRango,  onChange:conPagina1(setFiltroRango),  options:[{value:"all",label:"Todos"},{value:"proximos",label:"Próximos"},{value:"pasados",label:"Pasados"},{value:"personalizado",label:"Elegir fechas"}] },
    { key:"prio",   label:"Prioridad",        value:filtroPrio,   onChange:conPagina1(setFiltroPrio),   options:[{value:"all",label:"Todas"},{value:"alta",label:"Alta"},{value:"media",label:"Media"},{value:"baja",label:"Baja"}] },
    { key:"origen", label:"Quién lo publicó", value:filtroOrigen, onChange:conPagina1(setFiltroOrigen), options:[{value:"all",label:"Todos"},{value:"colegio",label:"El colegio"},{value:"docente",label:"Docentes"},{value:"normal",label:"Apoderados"}] },
  ];
  const limpiarFiltros = () => { setFiltroLeido("all"); setFiltroRango("all"); setFiltroPrio("all"); setFiltroOrigen("all"); setFiltroDesde(""); setFiltroHasta(""); setPagina(1); };

  return (
    <div style={{maxWidth:900}}>
      {verLecturas&&lecturas[verLecturas.id]&&<LecturasModal titulo={verLecturas.titulo||textoPlano(verLecturas.texto)} filas={lecturas[verLecturas.id]} onClose={()=>setVerLecturas(null)}/>}
      {/* El título lo da la pestaña "Avisos" de Comunicaciones. */}
      {filtrosAbiertos&&<FiltrosModal grupos={gruposFiltro} onClose={()=>setFiltrosAbiertos(false)} onLimpiar={limpiarFiltros}/>}
      <Buscador value={busqueda} onChange={(v)=>{setBusqueda(v);setPagina(1);}} placeholder="Buscar en avisos…"/>

      {isSuper&&(
        <div style={{marginBottom:16}}>
          {alerta?(
            <div style={{background:"linear-gradient(135deg,#EF4444,#B91C1C)",borderRadius:14,padding:"13px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
              <span style={{fontSize:20}}>🚨</span>
              <div style={{flex:1}}>
                <div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",marginBottom:2}}>Alerta activa</div>
                <div style={{fontSize:13,fontWeight:700,color:"white"}}>{alerta.mensaje}</div>
              </div>
              <div style={{display:"flex",gap:6}}>
                <button onClick={()=>setAlertaModal(true)} style={{padding:"5px 10px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.2)",color:"white",cursor:"pointer",fontSize:11,fontWeight:700}}>Editar</button>
                <button onClick={dismissAlerta} style={{padding:"5px 10px",borderRadius:8,border:"none",background:"rgba(255,255,255,0.15)",color:"white",cursor:"pointer",fontSize:11,fontWeight:700}}>x</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setAlertaModal(true)} style={{width:"100%",padding:"12px 16px",borderRadius:14,border:"2px dashed #FCA5A5",background:"#FFF1F2",color:"#EF4444",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:18}}>🚨</span>
              <div style={{textAlign:"left"}}>
                <div>Enviar alerta a toda la comunidad</div>
                <div style={{fontSize:11,fontWeight:500,color:"#F87171"}}>Solo para avisos urgentes</div>
              </div>
            </button>
          )}
          {alertaModal&&<AlertaModal onClose={()=>setAlertaModal(false)} onEnviar={msg=>{enviarAlerta(msg);setAlertaModal(false);}}/>}
        </div>
      )}

      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
          <div style={{minHeight:"100%",display:"flex",alignItems:"center",justifyContent:"center",padding:20,boxSizing:"border-box"}}>
          <Card style={{padding:24,width:"100%",maxWidth:420}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:14}}>{modal?.id?"Editar aviso":"Nuevo aviso"}</div>
            {!modal?.id&&cursosOpciones.length>0&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PARA EL CURSO DE</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {cursosOpciones.map(o=>{
                    const act = form.curso_id===o.curso_id;
                    return (
                      <button key={o.curso_id} onClick={()=>setForm(p=>({...p,curso_id:o.curso_id}))} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:`1.5px solid ${act?"#3B82F6":"#E2E8F0"}`,background:act?"#EFF6FF":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:act?"#3B82F6":"#94A3B8"}}>
                        <span style={{width:8,height:8,borderRadius:"50%",background:o.tag.color,display:"inline-block"}}/>
                        {o.tag.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>TÍTULO (opcional)</div>
              <input value={form.titulo||""} onChange={e=>setForm(p=>({...p,titulo:e.target.value}))} placeholder="Ej: Reunión de padres" style={inp}/>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>{form.titulo?.trim() ? "DESCRIPCIÓN" : "TEXTO"}</div>
              <EditorFormato value={form.texto} onChange={v=>setForm(p=>({...p,texto:v}))} placeholder={form.titulo?.trim() ? "Ej: En el SUM, traer la autorización firmada." : "Ej: Reunion de padres el viernes"} rows={4} style={{...inp,resize:"vertical"}}/>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{flex:"1 1 140px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>FECHA (opcional)</div>
                <input type="date" value={form.fecha||""} onChange={e=>setForm(p=>({...p,fecha:e.target.value}))} style={inp}/>
              </div>
              <div style={{flex:"1 1 90px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>HORA INICIO</div>
                <input type="time" value={form.hora_inicio||""} disabled={!form.fecha} onChange={e=>setForm(p=>({...p,hora_inicio:e.target.value}))} style={{...inp,opacity:form.fecha?1:0.5}}/>
              </div>
              <div style={{flex:"1 1 90px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>HORA FIN</div>
                <input type="time" value={form.hora_fin||""} disabled={!form.fecha||!form.hora_inicio} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={{...inp,opacity:form.fecha&&form.hora_inicio?1:0.5}}/>
              </div>
            </div>
            <div style={{fontSize:11,color:"#94A3B8",marginTop:-4,marginBottom:10}}>Con fecha y hora de inicio, el aviso también aparece en el calendario sincronizado de las familias.</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>PRIORIDAD</div>
              <div style={{display:"flex",gap:6}}>
                {["alta","media","baja"].map(p=>(
                  <button key={p} onClick={()=>setForm(f=>({...f,prioridad:p}))} style={{flex:1,padding:"7px 0",borderRadius:8,border:`1.5px solid ${form.prioridad===p?PRIO[p].c:"#E2E8F0"}`,background:form.prioridad===p?PRIO[p].bg:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.prioridad===p?PRIO[p].c:"#94A3B8"}}>{PRIO[p].l}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:14}}>
              <button onClick={()=>setForm(p=>({...p,urgente:!p.urgente}))} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${form.urgente?"#EF4444":"#E2E8F0"}`,background:form.urgente?"#FEF2F2":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:form.urgente?"#EF4444":"#94A3B8"}}>
                {form.urgente?"Urgente":"Marcar urgente"}
              </button>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>ADJUNTOS (opcional)</div>
              <AdjuntosInput adjuntos={form.adjuntos||[]} onChange={adj=>setForm(p=>({...p,adjuntos:adj}))} cursoId={cursoId||form.curso_id} onUploadingChange={setSubiendoAdj}/>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} disabled={saving||subiendoAdj} style={{flex:2,padding:11,borderRadius:10,border:"none",background:subiendoAdj?"#93C5FD":"#3B82F6",color:"white",cursor:subiendoAdj?"default":"pointer",fontSize:13,fontWeight:700}}>{saving?"Guardando...":"Guardar"}</button>
            </div>
          </Card>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:8,marginBottom:filtroRango==="personalizado"?8:12,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap"}}>
          <BotonFiltros grupos={gruposFiltro} onClick={()=>setFiltrosAbiertos(true)}/>
          <BotonNuevo ariaLabel="Nuevo aviso" onClick={()=>{setModal({});setForm({titulo:"",texto:"",fecha:"",hora_inicio:"",hora_fin:"",prioridad:"media",urgente:false,adjuntos:[],curso_id:cursoId||cursoIds[0]||null});}}/>
        </div>
      </div>
      {filtroRango==="personalizado"&&(
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748B",fontWeight:600}}>Desde</span>
            <input type="date" value={filtroDesde} onChange={e=>{setFiltroDesde(e.target.value);setPagina(1);}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",fontFamily:"inherit",background:"white"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748B",fontWeight:600}}>Hasta</span>
            <input type="date" value={filtroHasta} onChange={e=>{setFiltroHasta(e.target.value);setPagina(1);}} style={{padding:"6px 10px",borderRadius:8,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",fontFamily:"inherit",background:"white"}}/>
          </div>
          {(filtroDesde||filtroHasta)&&<button onClick={()=>{setFiltroDesde("");setFiltroHasta("");}} style={{padding:"5px 10px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,color:"#94A3B8"}}>Limpiar</button>}
        </div>
      )}

      {!atencion.length&&!recientes.length&&<div style={{textAlign:"center",padding:"32px 0",color:"#94A3B8",fontSize:13}}>Sin avisos</div>}
      {atencion.length>0&&(
        <>
          <div style={{display:"flex",alignItems:"center",gap:8,margin:"6px 0 10px"}}>
            <span style={{fontSize:17,fontWeight:800,color:"#0F172A"}}>Requiere tu atención</span>
            <span style={{minWidth:22,height:22,padding:"0 6px",borderRadius:999,background:"#FEE2E2",display:"inline-flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}><span style={{fontSize:12,fontWeight:800,color:"#DC2626"}}>{atencion.length}</span></span>
          </div>
          {atencion.map(r=>(
            <AvisoAtencion key={r.id} r={r} membrete={membreteDeAviso(r)} origen={origenDe(r)} resaltado={r.id===resaltado} abierto={expandidos.has(r.id)} onAbrir={()=>toggleExpandido(r.id)} onEntendido={()=>marcarLeido(r.id)}/>
          ))}
        </>
      )}
      {recientes.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,margin:"14px 0 10px"}}>
          <span style={{flex:1,fontSize:17,fontWeight:800,color:"#0F172A"}}>Recientes</span>
          {recientesSinLeer.length>0&&(
            <button onClick={marcarTodoLeido} style={{display:"inline-flex",alignItems:"center",gap:6,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",padding:0}}>
              <Icono nombre="checkDoble" size={17} color="#2563EB"/>
              <span style={{fontSize:13.5,fontWeight:700,color:"#2563EB"}}>Marcar todos como leídos</span>
            </button>
          )}
        </div>
      )}
      {visible.map(r=>(
        <AvisoCard key={r.id} r={r} membrete={membreteDeAviso(r)} origen={origenDe(r)} tag={tagDeCurso?.(r.curso_id)} esLeido={leidosSet.has(r.id)} resaltado={r.id===resaltado}
          abierto={expandidos.has(r.id)} onAbrir={()=>{ toggleExpandido(r.id); if(!leidosSet.has(r.id)) marcarLeido(r.id); }}
          onNoLeido={()=>marcarLeido(r.id)} lecturas={lecturas[r.id]} onVerLecturas={()=>setVerLecturas(r)}
          onEditar={puedeEditar(r)&&r.tipo!=="colecta_vence" ? ()=>{setModal(r);setForm({titulo:r.titulo||"",texto:r.texto||"",fecha:r.fecha||"",hora_inicio:r.hora_inicio?.slice(0,5)||"",hora_fin:r.hora_fin?.slice(0,5)||"",prioridad:r.prioridad||"media",urgente:r.urgente||false,adjuntos:r.adjuntos||[]});} : null}
          onBorrar={(puedeEditar(r)&&r.tipo!=="colecta_vence")||(isAdmin&&r.tipo==="colecta_vence") ? ()=>eliminar(r.id) : null}
          prio={PRIO[r.prioridad||"media"]||PRIO.media}/>
      ))}

      {totalPags>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16}}>
          <button onClick={()=>setPagina(p=>Math.max(1,p-1))} disabled={pagina_===1} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:pagina_===1?"default":"pointer",fontSize:12,color:pagina_===1?"#CBD5E1":"#0F172A"}}>Ant</button>
          <span style={{fontSize:12,color:"#64748B"}}>Pag {pagina_} de {totalPags}</span>
          <button onClick={()=>setPagina(p=>Math.min(totalPags,p+1))} disabled={pagina_===totalPags} style={{padding:"6px 14px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:pagina_===totalPags?"default":"pointer",fontSize:12,color:pagina_===totalPags?"#CBD5E1":"#0F172A"}}>Sig</button>
        </div>
      )}

    </div>
  );
}

// ── Tarjetas de Avisos (formato "Requiere tu atención" + "Recientes") ──
// Fecha del aviso como un dato más (una línea gris), no como una caja que
// parece un botón: "Vie 16 oct · 10:30–11:00 · mañana".
const FechaAviso = ({ r }) => {
  const f = fechaDelAviso(r.fecha, r.hora_inicio);
  if (!f) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
      <Icono nombre="agenda" size={15} color="#64748B" />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: "#64748B" }}>{f.texto}{r.hora_fin ? `–${String(r.hora_fin).slice(0, 5)}` : ""} · {f.rel.toLowerCase()}</span>
    </div>
  );
};
const PuntoNoLeido = () => <span aria-label="Sin leer" style={{ width: 9, height: 9, borderRadius: 999, background: "#2563EB", flexShrink: 0 }} />;

// "Recientes": prioridad, de quién viene, hace cuánto, punto de no leído,
// miniatura de la foto y la fecha. Clic = se abre entera y queda leída.
function AvisoCard({ r, membrete, origen, tag, prio, esLeido, resaltado, abierto, onAbrir, onNoLeido, lecturas, onVerLecturas, onEditar, onBorrar }) {
  const foto = fotoDelAviso(r);
  const link = { border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div id={`aviso-${r.id}`} onClick={onAbrir} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onAbrir(); }}
      style={{ background: "white", border: `${resaltado ? 2 : 1}px solid ${resaltado ? "#60A5FA" : "#E2E8F0"}`, borderRadius: 18, padding: 16, marginBottom: 12, cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, background: prio.bg }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: prio.c }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: prio.c }}>{prio.l}</span>
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{origen}</span>
        <span style={{ fontSize: 13, color: "#64748B", whiteSpace: "nowrap" }}>{haceCuanto(r.creado_en)}</span>
        {!esLeido && <PuntoNoLeido />}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {abierto && membrete && <div onClick={(e) => e.stopPropagation()}><MembreteEncabezado m={membrete} /></div>}
          {(r.titulo || !abierto) && <div style={{ fontSize: 16.5, fontWeight: 800, color: esLeido ? "#334155" : "#0F172A", lineHeight: 1.3, ...(abierto ? {} : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }) }}>{r.titulo || textoPlano(r.texto)}</div>}
          {abierto
            ? <div onClick={(e) => e.stopPropagation()} style={{ marginTop: r.titulo ? 6 : 0 }}><TextoConFormato texto={r.texto} fontSize={14} /><MembreteFirma m={membrete} /></div>
            : r.titulo && r.texto && <div style={{ fontSize: 14, color: "#64748B", marginTop: 4, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{textoPlano(r.texto)}</div>}
        </div>
        {foto && !abierto && <SignedImg src={foto.url} bucket="adjuntos" miniatura alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />}
      </div>
      <FechaAviso r={r} />
      {abierto && <div onClick={(e) => e.stopPropagation()}><AdjuntosList adjuntos={r.adjuntos} /></div>}
      {(tag || lecturas || onEditar || onBorrar || (abierto && esLeido)) && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          {tag && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: tag.color }} /><span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{tag.nombre}</span></span>}
          <ChipLecturas filas={lecturas} onClick={onVerLecturas} />
          <span style={{ flex: 1 }} />
          {abierto && esLeido && <button onClick={onNoLeido} style={link}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B" }}>Marcar no leído</span></button>}
          {onEditar && <button onClick={onEditar} style={link}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B" }}>Editar</span></button>}
          {onBorrar && <button onClick={onBorrar} style={link}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B" }}>Borrar</span></button>}
        </div>
      )}
    </div>
  );
}

// "Requiere tu atención": prioridad alta (o urgente) sin leer. "Entendido" la
// marca leída y pasa a Recientes.
function AvisoAtencion({ r, membrete, origen, resaltado, abierto, onAbrir, onEntendido }) {
  return (
    <div id={`aviso-${r.id}`} style={{ background: "#FEF2F2", border: `${resaltado ? 2 : 1}px solid ${resaltado ? "#F87171" : "#FECACA"}`, borderRadius: 18, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 999, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono nombre="alerta" size={21} color="#DC2626" /></span>
        <span style={{ display: "block", flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "#B91C1C" }}>{r.prioridad === "alta" ? "Prioridad alta" : "Urgente"} · {origen}</span>
          <span style={{ display: "block", fontSize: 13, color: "#64748B", marginTop: 1 }}>{[r.creado_en ? fechaCortaAviso(r.creado_en) : null, haceCuanto(r.creado_en)].filter(Boolean).join(" · ")}</span>
        </span>
        <PuntoNoLeido />
      </div>
      {abierto && membrete && <div style={{ marginTop: 12, background: "white", borderRadius: 12, padding: "12px 14px 0" }}><MembreteEncabezado m={membrete} /></div>}
      {(r.titulo || !abierto) && <div style={{ fontSize: 19, fontWeight: 800, color: "#0F172A", marginTop: 12, lineHeight: 1.3 }}>{r.titulo || textoPlano(r.texto)}</div>}
      {abierto
        ? <div style={{ marginTop: r.titulo ? 6 : 12 }}><TextoConFormato texto={r.texto} /><MembreteFirma m={membrete} /></div>
        : r.titulo && r.texto && <div style={{ fontSize: 14.5, color: "#334155", marginTop: 4, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{textoPlano(r.texto)}</div>}
      <FechaAviso r={r} />
      {abierto && <AdjuntosList adjuntos={r.adjuntos} />}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onAbrir} style={{ flex: 1, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, border: "1px solid #FECACA", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
          <Icono nombre="documento" size={18} color="#0F172A" /><span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{abierto ? "Ver menos" : "Ver comunicado"}</span>
        </button>
        <button onClick={onEntendido} style={{ flex: 1, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 12, border: "none", background: "#2563EB", cursor: "pointer", fontFamily: "inherit" }}>
          <Icono nombre="check" size={18} color="white" /><span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>Entendido</span>
        </button>
      </div>
    </div>
  );
}
