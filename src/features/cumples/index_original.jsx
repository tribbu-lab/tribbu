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
import { ListToolbar } from "../../components";


import { sendPush, getUserIdsByCurso } from "../../lib/push";
import * as XLSX from "xlsx";

export function Cumpleanios({ cursoId, userId, isAdmin, misHijos=[], hijoActivo=null }) {
  const misHijosUniq = [...new Set(misHijos)];
  const [lista,setLista]               = useState([]);
  const [cumpleMap,setCumpleMap]       = useState({});
  const [festejoMap,setFestejoMap]     = useState({});
  const [editando,setEditando]         = useState(null);
  const [festejoModal,setFestejoModal] = useState(null);
  const [festejoDetalle,setFestejoDetalle] = useState(null);
  const [colectaRegaloModal,setColectaRegaloModal] = useState(null);
  const [invitaciones,setInvitaciones] = useState([]);
  const [montoRegalo,setMontoRegalo]   = useState(null);
  const [monedaRegalo,setMonedaRegalo] = useState("$");
  const [apoderados, setApoderados] = useState([]);

  const cargar = async () => {
    const [al,ma,cu,fest,inv] = await Promise.all([
      supabase.from("hijos").select("id,nombre,apellido,fecha_nacimiento,color").eq("curso_id",cursoId).order("nombre"),
      supabase.from("maestros").select("id,nombre,fecha_nacimiento, maestro_cursos!inner(curso_id)").eq("maestro_cursos.curso_id",cursoId),
      supabase.from("cumples").select("*, responsable:responsable_id(id,nombre,apellido)").eq("curso_id",cursoId),
      supabase.from("eventos").select("*").eq("curso_id",cursoId).eq("tipo","festejo"),
      // Traer invitaciones de los hijos del usuario en este curso (RLS filtra por apoderado del hijo)
      userId && misHijos?.length ? supabase.from("evento_asistencia").select("*, evento:evento_id(id,titulo,fecha,hora,hora_fin,lugar,tipo,imagen_url,url_ubicacion,descripcion)").in("alumno_invitado_id", misHijos) : Promise.resolve({data:[]}),
    ]);
    const curso = await supabase.from("cursos").select("monto_regalo,moneda_regalo").eq("id",cursoId).single();
    setMontoRegalo(curso.data?.monto_regalo||null);
    setMonedaRegalo(curso.data?.moneda_regalo||"$");
    const invFiltradas = (inv.data||[]).filter(i=>i.evento && (hijoActivo===null || i.alumno_invitado_id===hijoActivo));
    setInvitaciones(invFiltradas);
    const fmap = {};
    (fest.data||[]).forEach(f=>{ if(f.alumno_id) fmap[f.alumno_id]=f; });
    setFestejoMap(fmap);
    const alumnosUniq = Object.values((al.data||[]).reduce((acc,a)=>{ acc[a.id]=a; return acc; },{}));
    const maestrosUniq = Object.values((ma.data||[]).reduce((acc,m)=>{ acc[m.id]=m; return acc; },{}));
    const unified = [
      ...alumnosUniq.filter(a=>a.fecha_nacimiento).map(a=>({
        id:`a-${a.id}`, rawId:a.id, nombre:fmtNombre(a), tipo:"Alumno",
        fecha_nacimiento:a.fecha_nacimiento, color:a.color||"#3B82F6",
      })),
      ...maestrosUniq.filter(m=>m.fecha_nacimiento).map(m=>({
        id:`m-${m.id}`, rawId:m.id, nombre:m.nombre, tipo:"Maestro",
        fecha_nacimiento:m.fecha_nacimiento, color:"#8B5CF6",
      })),
    ];
    const tmpNextBday = (fecha) => {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const d = new Date(fecha+"T00:00:00");
      let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
      if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
      return (next - hoy) / (1000*60*60*24);
    };
    unified.sort((a,b)=>tmpNextBday(a.fecha_nacimiento)-tmpNextBday(b.fecha_nacimiento));
    setLista(unified);
    const { data: hijosDelCurso } = await supabase.from("hijos").select("id").eq("curso_id", cursoId);
    const hids = (hijosDelCurso||[]).map(h=>h.id);
    if(hids.length) {
      const { data: uhData } = await supabase.from("usuario_hijos").select("usuario_id").in("hijo_id", hids);
      const uids = [...new Set((uhData||[]).map(x=>x.usuario_id).filter(Boolean))];
      if(uids.length) {
        const { data: usData } = await supabase.from("usuarios").select("id,nombre,apellido").in("id", uids);
        setApoderados((usData||[]).sort((a,b)=>a.nombre.localeCompare(b.nombre)));
      }
    }
    const map = {};
    (cu.data||[]).forEach(c=>{
      if(c.alumno_id)      map[`a-${c.alumno_id}`]      = c;
      if(c.maestro_id_ref) map[`m-${c.maestro_id_ref}`] = c;
    });
    // Resolver responsable_id (usuario) → nombre del hijo compañero del curso
    // Usar uhData que ya tenemos cargado (apoderados del curso)
    const responsableUids = [...new Set((cu.data||[]).map(c=>c.responsable_id).filter(Boolean))];
    if(responsableUids.length && hids.length) {
      try {
        const { data: uhResp } = await supabase.from("usuario_hijos")
          .select("usuario_id, hijo_id")
          .in("usuario_id", responsableUids)
          .in("hijo_id", hids);
        if(uhResp?.length) {
          // Usar alumnosUniq que ya tenemos cargado
          const alumnoById = {};
          alumnosUniq.forEach(a=>{ alumnoById[a.id]=a; });
          const uidToHijo = {};
          (uhResp||[]).forEach(r=>{ if(alumnoById[r.hijo_id]) uidToHijo[r.usuario_id]=alumnoById[r.hijo_id]; });
          Object.values(map).forEach(c=>{ if(c.responsable_id && uidToHijo[c.responsable_id]) c._responsable_hijo = uidToHijo[c.responsable_id]; });
        }
      } catch(e) {
        // Si RLS bloquea, usar nombre del responsable (usuario) directamente
        console.log("No se pudo resolver hijo del responsable, usando nombre de usuario");
      }
    }
    setCumpleMap(map);
    await verificarRecordatoriosRegalo(map, unified);
  };

  const verificarRecordatoriosRegalo = async (cumpleMapActual, listaActual) => {
    const hoy = new Date(); hoy.setHours(0,0,0,0);

    // Calcular qué cumpleaños caen en los próximos 7 días y tienen responsable
    const pendientes = listaActual
      .map(item => {
        const cumple = cumpleMapActual[item.id];
        if(!cumple?.responsable_id) return null;
        const d = new Date(item.fecha_nacimiento+"T00:00:00");
        let next = new Date(hoy.getFullYear(), d.getMonth(), d.getDate());
        if(next < hoy) next.setFullYear(hoy.getFullYear()+1);
        const dias = Math.round((next - hoy) / (1000*60*60*24));
        if(dias > 7 || dias < 0) return null;
        return { item, cumple, dias, next };
      })
      .filter(Boolean);

    if(!pendientes.length) return;

    // Una sola query para ver qué recordatorios ya existen
    const refIds = pendientes.map(p => p.cumple.id);
    const { data: yaExisten } = await supabase.from("recordatorios")
      .select("ref_id, para_usuario_id")
      .eq("curso_id", cursoId)
      .eq("tipo", "regalo_cumple")
      .in("ref_id", refIds);

    const existeSet = new Set((yaExisten||[]).map(r => `${r.ref_id}_${r.para_usuario_id}`));

    // Insertar solo los que no existen — en un solo llamado batch
    const inserts = pendientes
      .filter(p => !existeSet.has(`${p.cumple.id}_${p.cumple.responsable_id}`))
      .map(({ item, cumple, dias, next }) => {
        const nombre = item.nombre.split(" ")[0];
        return {
          curso_id: cursoId, tipo: "regalo_cumple", ref_id: cumple.id,
          para_usuario_id: cumple.responsable_id,
          texto: `El cumple de ${nombre} es en ${dias===0?"hoy":dias===1?"1 dia":`${dias} dias`}. Ya compraste el regalo?`,
          emoji: "🎁", urgente: dias <= 2, prioridad: dias <= 2 ? "alta" : "media",
          fecha: next.toISOString().slice(0,10),
        };
      });

    if(inserts.length) {
      await supabase.from("recordatorios").insert(inserts);
    }
  };

  useEffect(()=>{ cargar(); },[cursoId]);

  const guardarResponsable = async ({responsable_id, comprado}) => {
    const isAlumno = editando.tipo==="Alumno";
    const cumpleExistente = cumpleMap[editando.id];
    const existenteId = cumpleExistente?.id || null;

    // responsable_id llega como rawId de hijos — resolver usuario_id vinculado
    let resolvedId = null;
    if(responsable_id) {
      const { data: uh } = await supabase.from("usuario_hijos").select("usuario_id").eq("hijo_id", responsable_id).limit(1);
      resolvedId = uh?.[0]?.usuario_id || null;
      console.log("guardarResponsable — hijo seleccionado:", responsable_id, "→ usuario:", resolvedId, "existenteId:", existenteId);
    }

    const payload = { responsable_id: resolvedId, comprado };

    if(existenteId) {
      const { error } = await supabase.from("cumples").update(payload).eq("id", existenteId);
      if(error) console.error("Error UPDATE cumple:", JSON.stringify(error));
    } else {
      const { error } = await supabase.from("cumples").insert({
        curso_id: cursoId,
        alumno_id: isAlumno ? editando.rawId : null,
        maestro_id_ref: !isAlumno ? editando.rawId : null,
        ...payload,
      });
      if(error) console.error("Error INSERT cumple:", JSON.stringify(error));
    }
    setEditando(null);
    await cargar();
  };

  const crearColectaRegalo = async ({maestroNombre, titulo, monto, moneda, fecha_limite, responsable_id}) => {
    const payload = {
      titulo: sanitize(titulo), tipo: "colecta",
      descripcion: `Colecta para el regalo de cumpleaños de ${maestroNombre}`,
      monto_sugerido: monto ? Number(monto) : null, moneda: moneda||"$",
      fecha_limite: fecha_limite||null,
      vencimiento: fecha_limite||new Date().toISOString().slice(0,10),
      curso_id: cursoId, activa: true, responsable_id: responsable_id||null,
    };
    const { error } = await supabase.from("colectas").insert(payload);
    if(!error) {
      const userIds = await getUserIdsByCurso(cursoId);
      await sendPush({ type:"colecta", payload:{ descripcion:`Colecta para el regalo de ${maestroNombre}`, userIds } });
    }
    setColectaRegaloModal(null);
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
    if(dias===1) return {l:"Manana",  c:"#F59E0B", bg:"#FEF3C7"};
    if(dias<=7)  return {l:`${dias}d`, c:"#F59E0B", bg:"#FEF3C7"};
    return              {l:`${dias}d`, c:"#94A3B8", bg:"#F1F5F9"};
  };

  const mesesNombres = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

  const ctrlCumple = useListControls(lista, {
    searchFn: (a,q)=> a.nombre.toLowerCase().includes(q),
    sortOptions:[
      {key:"proximo",  label:"Proximo cumpleaños", val:a=>nextBday(a.fecha_nacimiento)},
      {key:"nombre",   label:"Nombre",              val:a=>a.nombre},
      {key:"mes",      label:"Mes",                 val:a=>new Date(a.fecha_nacimiento+"T00:00:00").getMonth()},
    ],
    filterOptions:[
      {key:"mes",  label:"Mes",  options:mesesNombres.map((m,i)=>({value:String(i),label:m})), match:(a,v)=>new Date(a.fecha_nacimiento+"T00:00:00").getMonth()===parseInt(v)},
      {key:"tipo", label:"Tipo", options:[{value:"Alumno",label:"Alumnos"},{value:"Maestro",label:"Maestros"}], match:(a,v)=>a.tipo===v},
    ],
    pageSize:20,
  });
  const listaFiltrada = ctrlCumple.items;

  return (
    <div>
      {editando&&<ResponsableModal cumple={{...editando, responsable_id:cumpleMap[editando.id]?._responsable_hijo?.id||null, comprado:cumpleMap[editando.id]?.comprado||false}} alumnos={lista} onClose={()=>setEditando(null)} onSave={guardarResponsable}/>}
      {festejoModal&&<FestejoModal alumnoId={festejoModal.alumnoId} alumnoNombre={festejoModal.alumnoNombre} cursoId={cursoId} userId={userId} festejoExistente={festejoModal.festejo} onClose={()=>setFestejoModal(null)} onSave={()=>{ setFestejoModal(null); cargar(); }}/>}
      {festejoDetalle&&<FestejoDetalleModal evento={festejoDetalle} userId={userId} misHijos={misHijosUniq||[]} onClose={()=>setFestejoDetalle(null)} onUpdate={cargar}/>}
      {colectaRegaloModal&&<ColectaRegaloModal maestroNombre={colectaRegaloModal.maestroNombre} montoDefault={montoRegalo} monedaDefault={monedaRegalo} usuarios={apoderados} onClose={()=>setColectaRegaloModal(null)} onSave={crearColectaRegalo}/>}
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Cumpleaños 🎂</div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{fontSize:13,color:"#94A3B8"}}>{lista.length} cumpleaños en el curso</div>
        {montoRegalo&&<div style={{fontSize:12,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"4px 12px",borderRadius:20,border:"1px solid #BBF7D0"}}>🎁 Monto por familia: {monedaRegalo} {Number(montoRegalo).toLocaleString("es-AR")}</div>}
      </div>

      {/* Banner rápido: crear festejo de su hijo (apoderado o room parent) */}
      {misHijosUniq.length>0&&(()=>{
        const hijosConCumple = lista.filter(a=>a.tipo==="Alumno"&&misHijosUniq.includes(a.rawId));
        if(!hijosConCumple.length) return null;
        return hijosConCumple.map(a=>{
          const fest = festejoMap[a.rawId];
          const dias = nextBday(a.fecha_nacimiento);
          const bl   = bdayLabel(dias);
          return (
            <div key={a.rawId} style={{marginBottom:16,background:fest?"#F0FDF4":"linear-gradient(135deg,#FEF9C3,#FFFBEB)",border:`1.5px solid ${fest?"#BBF7D0":"#FCD34D"}`,borderRadius:16,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:28}}>🎂</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:800,color:"#0F172A",marginBottom:2}}>{a.nombre}</div>
                <div style={{fontSize:11,color:"#64748B"}}>{new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}<span style={{marginLeft:8,fontWeight:700,color:bl.c}}>{bl.l}</span></div>
              </div>
              {fest
                ? <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end"}}>
                    <button onClick={()=>setFestejoDetalle(fest)} style={{padding:"6px 12px",borderRadius:10,border:"none",background:"#10B981",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>🎉 Ver festejo</button>
                    <button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre,festejo:fest})} style={{padding:"4px 10px",borderRadius:8,border:"1px solid #BBF7D0",background:"white",cursor:"pointer",fontSize:11,color:"#10B981",fontWeight:600}}>Editar</button>
                  </div>
                : <button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre})} style={{padding:"8px 14px",borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>+ Crear festejo</button>
              }
            </div>
          );
        });
      })()}

      {invitaciones.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Mis invitaciones</div>
          {invitaciones.map(inv=>{
            const ev = inv.evento;
            if(!ev) return null;
            return (
              <div key={inv.id} style={{background:"#FFFBEB",border:"1.5px solid #FCD34D",borderRadius:14,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#0F172A"}}>{ev.titulo}</div>
                  <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{fmtF(ev.fecha)}{ev.hora?` · ${ev.hora}${ev.hora_fin?` – ${ev.hora_fin}`:""}`:""}{ev.lugar?` · ${ev.lugar}`:""}</div>
                  {inv.asiste==="si"&&<span style={{fontSize:10,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"2px 7px",borderRadius:8,marginTop:4,display:"inline-block"}}>Confirmado</span>}
                  {inv.asiste==="no"&&<span style={{fontSize:10,fontWeight:700,color:"#EF4444",background:"#FEF2F2",padding:"2px 7px",borderRadius:8,marginTop:4,display:"inline-block"}}>No va</span>}
                  {(!inv.asiste||inv.asiste==="pendiente")&&<span style={{fontSize:10,fontWeight:700,color:"#F59E0B",background:"#FFFBEB",padding:"2px 7px",borderRadius:8,marginTop:4,display:"inline-block"}}>Pendiente</span>}
                </div>
                <button onClick={()=>setFestejoDetalle(ev)} style={{padding:"6px 14px",borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,flexShrink:0}}>Ver / Responder</button>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <ListToolbar busqueda={ctrlCumple.busqueda} setBusqueda={ctrlCumple.setBusqueda} sortOptions={[{key:"proximo",label:"Proximo"},{key:"nombre",label:"Nombre"},{key:"mes",label:"Mes"}]} sortKey={ctrlCumple.sortKey} sortAsc={ctrlCumple.sortAsc} toggleSort={ctrlCumple.toggleSort} filterOptions={[{key:"mes",label:"Mes",options:mesesNombres.map((m,i)=>({value:String(i),label:m}))},{key:"tipo",label:"Tipo",options:[{value:"Alumno",label:"Alumnos"},{value:"Maestro",label:"Maestros"}]}]} filtros={ctrlCumple.filtros} setFiltro={ctrlCumple.setFiltro} resetFiltros={ctrlCumple.resetFiltros} total={ctrlCumple.total} placeholder="Buscar por nombre..."/>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {listaFiltrada.map(a=>{
            const dias = nextBday(a.fecha_nacimiento);
            const bl   = bdayLabel(dias);
            const cumple = cumpleMap[a.id]||{};
            const isAlumno = a.tipo==="Alumno";
            const esMiHijo = isAlumno && misHijosUniq.includes(a.rawId);
            const fest     = isAlumno ? festejoMap[a.rawId] : null;
            const resp = cumple.responsable;
            return (
              <div key={a.id} style={{background:"white",border:"1px solid #E2E8F0",borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#0F172A",marginBottom:2}}>{a.nombre}</div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:a.tipo==="Maestro"?"#F5F3FF":"#EFF6FF",color:a.tipo==="Maestro"?"#8B5CF6":"#3B82F6"}}>{a.tipo==="Maestro"?"👨‍🏫 Maestro":"🎒 Alumno"}</span>
                    <span style={{fontSize:11,color:"#94A3B8"}}>{new Date(a.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}</span>
                  </div>
                  {(cumple._responsable_hijo||cumple.responsable)&&<div style={{fontSize:11,color:"#64748B",marginTop:1}}>🎁 Regala: <strong>{cumple._responsable_hijo ? fmtNombre(cumple._responsable_hijo) : fmtNombre(cumple.responsable)}</strong></div>}
                  {cumple.comprado&&<span style={{fontSize:10,fontWeight:700,color:"#10B981",background:"#F0FDF4",padding:"2px 7px",borderRadius:8,marginTop:2,display:"inline-block"}}>✓ Regalo comprado</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:800,padding:"3px 8px",borderRadius:20,background:bl.bg,color:bl.c}}>{bl.l}</span>
                  {isAlumno&&(
                    <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {fest
                        ? <><button onClick={()=>setFestejoDetalle(fest)} style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:8,border:"1px solid #FCD34D",background:"#FFFBEB",cursor:"pointer",color:"#F59E0B"}}>🎉 {new Date(fest.fecha+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"short"})}</button>
                           {esMiHijo&&<button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre,festejo:fest})} style={{fontSize:10,padding:"2px 6px",borderRadius:6,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#94A3B8"}}>Editar</button>}</>
                        : (esMiHijo
                          ? <button onClick={()=>setFestejoModal({alumnoId:a.rawId,alumnoNombre:a.nombre})} style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",color:"#3B82F6"}}>+ Crear festejo</button>
                          : null)
                      }
                    </div>
                  )}
                  {isAdmin&&(
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>setEditando(a)} style={{fontSize:10,padding:"2px 8px",borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",color:"#64748B"}}>🎁 Regalo</button>
                      {a.tipo==="Maestro"&&<button onClick={()=>setColectaRegaloModal({maestroNombre:a.nombre,maestroId:a.rawId})} style={{fontSize:10,padding:"2px 8px",borderRadius:8,border:"1px solid #BFDBFE",background:"#EFF6FF",cursor:"pointer",color:"#3B82F6"}}>+ Colecta</button>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {lista.length>20&&<Paginador pagina={ctrlCumple.pagina} totalPag={ctrlCumple.totalPag} setPagina={ctrlCumple.setPagina}/>}
      </div>
    </div>
  );
}

export function FestejoModal({ alumnoId, alumnoNombre, cursoId, userId, festejoExistente, onClose, onSave }) {
  const [form, setForm] = useState({
    titulo:      festejoExistente?.titulo      || `🎉 Festejo de ${alumnoNombre}`,
    fecha:       festejoExistente?.fecha       || "",
    hora:        festejoExistente?.hora        || "",
    hora_fin:    festejoExistente?.hora_fin    || "",
    lugar:       festejoExistente?.lugar       || "",
    url_ubicacion: festejoExistente?.url_ubicacion || "",
    descripcion: festejoExistente?.descripcion || "",
    imagen_url:  festejoExistente?.imagen_url  || "",
    todo_el_dia: festejoExistente?.todo_el_dia !== false ? false : false,
  });
  const [alumnos,    setAlumnos]    = useState([]);
  const [invitados,  setInvitados]  = useState([]);
  const [guardando,  setGuardando]  = useState(false);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgUploading, setImgUploading] = useState(false);

  const inp = {width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  useEffect(()=>{
    supabase.from("hijos").select("id,nombre,apellido,color").eq("curso_id",cursoId).order("nombre")
      .then(r=>{ setAlumnos(r.data||[]); });
    if(festejoExistente?.id) {
      supabase.from("evento_asistencia").select("alumno_invitado_id").eq("evento_id", festejoExistente.id)
        .then(r=>setInvitados((r.data||[]).map(x=>x.alumno_invitado_id).filter(Boolean).filter(id=>id!==alumnoId)));
    }
  },[]);

  const toggleAlumno = (id) => setInvitados(p => p.includes(id) ? p.filter(x=>x!==id) : [...p,id]);
  const invitarTodos = () => setAlumnos(al => { setInvitados(al.filter(a=>a.id!==alumnoId).map(a=>a.id)); return al; });

  const handleImgChange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setImgFile(file);
    setImgUploading(true);
    const ext = file.name.split(".").pop();
    const path = `festejos/${cursoId}_${alumnoId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("eventos").upload(path, file, { upsert: true });
    if(!error) {
      const { data: urlData } = supabase.storage.from("eventos").getPublicUrl(path);
      setForm(p=>({...p, imagen_url: urlData.publicUrl}));
    } else {
      console.error("Error subiendo imagen:", error);
    }
    setImgUploading(false);
  };

  const guardar = async () => {
    if(!form.fecha || !form.titulo) return;
    setGuardando(true);
    let eventoId = festejoExistente?.id;

    // 1. Crear o actualizar evento
    if(eventoId) {
      await supabase.from("eventos").update({...form, tipo:"festejo", alumno_id:alumnoId, curso_id:cursoId, creado_por:userId}).eq("id", eventoId);
    } else {
      const { data, error } = await supabase.from("eventos").insert({...form, tipo:"festejo", alumno_id:alumnoId, curso_id:cursoId, creado_por:userId}).select("id").single();
      if(error || !data?.id) { console.error("Error creando evento:", error); setGuardando(false); return; }
      eventoId = data.id;
    }

    // 2. Sincronizar lista de invitados sin depender del DELETE global
    {
      // Leer filas existentes
      const { data: existentes } = await supabase
        .from("evento_asistencia")
        .select("id, alumno_invitado_id")
        .eq("evento_id", eventoId);

      const existentesSet = new Set((existentes||[]).map(r => r.alumno_invitado_id));
      const invitadosSet  = new Set(invitados);

      // Insertar solo los que no existen aún
      const nuevos = invitados.filter(hid => !existentesSet.has(hid));
      if(nuevos.length) {
        const rows = nuevos.map(hid => ({
          evento_id: eventoId,
          usuario_id: userId,
          alumno_invitado_id: hid,
          asiste: "pendiente",
        }));
        const insRes = await supabase.from("evento_asistencia").insert(rows);
        if(insRes.error) console.error("Error insertando asistencias:", insRes.error);
      }

      // Borrar solo los que fueron quitados de la lista (filas propias del creador)
      const quitados = (existentes||[]).filter(r => !invitadosSet.has(r.alumno_invitado_id)).map(r => r.id);
      if(quitados.length) {
        const delRes = await supabase.from("evento_asistencia").delete().in("id", quitados);
        if(delRes.error) console.error("Error borrando asistencias quitadas:", delRes.error);
      }
    }
    if(!festejoExistente) {
      const invitadosUserIds = await Promise.all(
        invitados.map(hid => supabase.from("usuario_hijos").select("usuario_id").eq("hijo_id", hid))
      );
      const userIds = [...new Set(invitadosUserIds.flatMap(r => (r.data||[]).map(v => v.usuario_id)))];
      if(userIds.length) await sendPush({ type:"festejo", payload:{ titulo:form.titulo, userIds } });
    }
    setGuardando(false);
    onSave();
  };

  const isMobile = useIsMobile();

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200,
      display:"flex", flexDirection:"column",
      justifyContent: isMobile ? "flex-end" : "center",
      alignItems: isMobile ? "stretch" : "center",
      padding: isMobile ? 0 : 20,
    }}>
      <div style={{
        background:"white",
        width:"100%",
        maxWidth: isMobile ? "100%" : 480,
        borderRadius: isMobile ? "20px 20px 0 0" : 20,
        maxHeight: isMobile ? "92dvh" : "88vh",
        display:"flex", flexDirection:"column",
        margin:0,
        overflow:"hidden",
        boxShadow:"0 10px 40px rgba(0,0,0,0.2)",
        border:"1px solid #E2E8F0",
      }}>
        {/* Área scrollable — todo el contenido menos los botones */}
        <div style={{overflowY:"auto", flex:1, padding:24, paddingBottom:12}}>
          <div style={{fontSize:16,fontWeight:900,marginBottom:4}}>🎉 {festejoExistente?"Editar festejo":"Nuevo festejo"}</div>
          <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Festejo de {alumnoNombre}</div>

          {[
            {label:"Título",       key:"titulo",        type:"text", ph:`Festejo de ${alumnoNombre}`},
            {label:"Fecha",        key:"fecha",         type:"date"},
            {label:"Lugar",        key:"lugar",         type:"text", ph:"Ej: Salón de eventos, casa, etc."},
            {label:"URL ubicación",key:"url_ubicacion", type:"url",  ph:"Ej: https://maps.google.com/..."},
            {label:"Descripción",  key:"descripcion",   type:"text", ph:"Info adicional para los invitados"},
          ].map(f=>(
            <div key={f.key} style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>{f.label}</div>
              <input type={f.type} value={form[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph||""} style={inp}/>
            </div>
          ))}

          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:5}}>Hora</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="time" value={form.hora} onChange={e=>setForm(p=>({...p,hora:e.target.value}))} style={{...inp,width:"auto",flex:1}}/>
              {form.hora&&<><span style={{fontSize:12,color:"#94A3B8"}}>a</span><input type="time" value={form.hora_fin} onChange={e=>setForm(p=>({...p,hora_fin:e.target.value}))} style={{...inp,width:"auto",flex:1}}/></>}
            </div>
          </div>

          {/* Imagen de invitación */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Imagen de invitación</div>
            {form.imagen_url && (
              <div style={{position:"relative",display:"inline-block",marginBottom:8}}>
                <img src={form.imagen_url} alt="Invitación" style={{width:"100%",maxHeight:180,objectFit:"contain",borderRadius:10,border:"1.5px solid #E2E8F0"}}/>
                <button onClick={()=>{ setForm(p=>({...p,imagen_url:""})); setImgFile(null); }} style={{position:"absolute",top:6,right:6,width:24,height:24,borderRadius:"50%",border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:13,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>
              </div>
            )}
            <label style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:10,border:"2px dashed #E2E8F0",background:"#F8FAFC",cursor:"pointer"}}>
              <span style={{fontSize:18}}>🖼️</span>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:imgUploading?"#94A3B8":"#3B82F6"}}>{imgUploading?"Subiendo...":form.imagen_url?"Cambiar imagen":"Subir imagen"}</div>
                <div style={{fontSize:11,color:"#94A3B8"}}>JPG, PNG, GIF</div>
              </div>
              <input type="file" accept="image/*" style={{display:"none"}} onChange={handleImgChange} disabled={imgUploading}/>
            </label>
          </div>

          <div style={{marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6}}>Invitados ({invitados.length})</div>
              <button type="button" onClick={invitarTodos} style={{fontSize:11,fontWeight:700,color:"#3B82F6",background:"#EFF6FF",border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer"}}>Invitar a todo el curso</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
              {alumnos.filter(a=>a.id!==alumnoId).map(a=>{
                const sel = invitados.includes(a.id);
                return (
                  <div key={a.id} onClick={()=>toggleAlumno(a.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:10,border:`1.5px solid ${sel?(a.color||"#3B82F6"):"#E2E8F0"}`,background:sel?(a.color||"#3B82F6")+"10":"white",cursor:"pointer"}}>
                    <span style={{fontSize:13,fontWeight:sel?700:500,flex:1,color:sel?(a.color||"#3B82F6"):"#0F172A"}}>{fmtNombre(a)}</span>
                    {sel&&<span style={{fontSize:12,color:a.color||"#3B82F6",fontWeight:700}}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Botones — siempre visibles, nunca scrollean */}
        <div style={{
          flexShrink:0,
          padding:"12px 24px",
          paddingBottom:`max(24px, env(safe-area-inset-bottom))`,
          borderTop:"1px solid #F1F5F9",
          background:"white",
        }}>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose} style={{flex:1,padding:13,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
            <button onClick={guardar} disabled={guardando||imgUploading} style={{flex:2,padding:13,borderRadius:10,border:"none",background:"#F59E0B",color:"white",cursor:"pointer",fontSize:14,fontWeight:700}}>{guardando?"Guardando...":"Publicar festejo"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Exportar lista de asistencia de un festejo a Excel
function exportarExcel({ evento, asistenciaDedup, alumnos }) {
  const ESTADO = { si: "Confirma", no: "No va", pendiente: "Pendiente" };

  const rows = asistenciaDedup.map(a => {
    const al = alumnos[a.alumno_invitado_id];
    return {
      "Alumno":    al ? `${al.nombre} ${al.apellido}` : "--",
      "Asistencia": ESTADO[a.asiste] || "Pendiente",
      "Hermanos":  Number(a.hermanos) || 0,
      "Adultos":   Number(a.adultos)  || 0,
      "Comentario": a.comentario || "",
    };
  });

  // Ordenar: confirman primero, luego pendientes, luego no van
  const ORDEN = { "Confirma": 0, "Pendiente": 1, "No va": 2 };
  rows.sort((a, b) => (ORDEN[a.Asistencia]||0) - (ORDEN[b.Asistencia]||0));

  // Totales al final
  const confirmados = asistenciaDedup.filter(a => a.asiste === "si");
  rows.push({});
  rows.push({
    "Alumno": "TOTAL CONFIRMADOS",
    "Asistencia": confirmados.length,
    "Hermanos": confirmados.reduce((s,a) => s + (Number(a.hermanos)||0), 0),
    "Adultos":  confirmados.reduce((s,a) => s + (Number(a.adultos)||0),  0),
    "Comentario": "",
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  // Ancho de columnas
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  const titulo = (evento.titulo || "Festejo").replace(/[/\\?*[\]]/g, "").slice(0, 28);
  XLSX.utils.book_append_sheet(wb, ws, "Asistencia");
  XLSX.writeFile(wb, `${titulo} - asistencia.xlsx`);
}

export function FestejoDetalleModal({ evento, userId, misHijos=[], onClose, onUpdate }) {
  const [asistencia, setAsistencia] = useState([]);
  const [alumnos,    setAlumnos]    = useState({});
  const [guardando,  setGuardando]  = useState(false);
  const [comentarios, setComentarios] = useState({});
  const [hermanos,    setHermanos]    = useState({});
  const [adultos,     setAdultos]     = useState({});
  const [imgZoom,    setImgZoom]    = useState(false);

  useEffect(()=>{ cargarDatos(); },[evento.id]);

  const cargarDatos = async () => {
    const { data: asist } = await supabase.from("evento_asistencia").select("*").eq("evento_id", evento.id);
    const rows = asist||[];
    const aids = [...new Set(rows.map(r=>r.alumno_invitado_id).filter(Boolean))];
    let alumnosMap = {};
    if(aids.length) {
      const { data: als } = await supabase.from("hijos").select("id,nombre,apellido").in("id", aids);
      (als||[]).forEach(a=>{ alumnosMap[a.id]=a; });
    }
    setAlumnos(alumnosMap);
    setAsistencia(rows);
    const coms={}, herm={}, adul={};
    rows.forEach(r=>{
      if(misHijos.includes(r.alumno_invitado_id)){
        coms[r.alumno_invitado_id]  = r.comentario||"";
        herm[r.alumno_invitado_id]  = r.hermanos!=null ? Number(r.hermanos)||0 : 0;
        adul[r.alumno_invitado_id]  = r.adultos!=null  ? Number(r.adultos)||0  : 0;
      }
    });
    setComentarios(coms); setHermanos(herm); setAdultos(adul);
  };

  const responder = async (alumnoId, asiste) => {
    setAsistencia(prev => prev.map(r => r.alumno_invitado_id===alumnoId ? {...r, asiste} : r));
    await supabase.from("evento_asistencia")
      .update({ asiste, comentario:comentarios[alumnoId]||null, hermanos:hermanos[alumnoId]??0, adultos:adultos[alumnoId]??0 })
      .eq("evento_id", evento.id).eq("alumno_invitado_id", alumnoId);
    onUpdate?.();
  };

  const guardarExtras = async (alumnoId) => {
    setGuardando(true);
    await supabase.from("evento_asistencia")
      .update({ comentario:comentarios[alumnoId]||null, hermanos:hermanos[alumnoId]??0, adultos:adultos[alumnoId]??0 })
      .eq("evento_id", evento.id).eq("alumno_invitado_id", alumnoId);
    await cargarDatos();
    setGuardando(false);
    onClose();
  };

  const setNumero = (setter, alumnoId, val) => {
    const n = Math.max(0, parseInt(val)||0);
    setter(p=>({...p,[alumnoId]:n}));
  };

  const dedupAsistencia = (rows) => {
    const PRIO = {"si":2,"no":1,"pendiente":0};
    const map = {};
    rows.forEach(r=>{ const k=r.alumno_invitado_id; if(!k) return; if(!map[k]||(PRIO[r.asiste]||0)>(PRIO[map[k].asiste]||0)) map[k]=r; });
    return Object.values(map);
  };
  const asistenciaDedup = dedupAsistencia(asistencia).filter(a=>a.alumno_invitado_id!==evento.alumno_id);
  const confirmados = asistenciaDedup.filter(a=>a.asiste==="si");
  const noVan       = asistenciaDedup.filter(a=>a.asiste==="no");
  const pendientes  = asistenciaDedup.filter(a=>a.asiste==="pendiente"||!a.asiste);

  const totalAlumnos  = confirmados.length;
  const totalHermanos = confirmados.reduce((s,a)=>s+(Number(a.hermanos)||0),0);
  const totalAdultos  = confirmados.reduce((s,a)=>s+(Number(a.adultos)||0),0);

  const inp    = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const inpNum = {...inp,width:60,textAlign:"center",padding:"7px 4px"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"16px 16px 32px",overflowY:"auto"}}>
      {/* Zoom overlay */}
      {imgZoom&&(
        <div onClick={()=>setImgZoom(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
          <img src={evento.imagen_url} alt="Invitación" style={{maxWidth:"100%",maxHeight:"90vh",objectFit:"contain",borderRadius:12}}/>
          <button onClick={()=>setImgZoom(false)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:36,height:36,cursor:"pointer",fontSize:18,color:"white"}}>✕</button>
        </div>
      )}
      <Card style={{padding:0,width:"100%",maxWidth:520,marginTop:"auto",marginBottom:"auto",flexShrink:0}}>
        {/* Header: info a la izquierda, imagen pequeña a la derecha */}
        <div style={{padding:"20px 20px 16px",display:"flex",alignItems:"flex-start",gap:14}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:17,fontWeight:900,marginBottom:4,color:"#0F172A",lineHeight:1.3}}>{evento.titulo}</div>
            <div style={{fontSize:12,color:"#64748B",marginBottom:3}}>
              {new Date(evento.fecha+"T00:00:00").toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long"})}
              {evento.hora?` · ${evento.hora}${evento.hora_fin?` – ${evento.hora_fin}`:""}` :""}
            </div>
            {evento.lugar&&<div style={{fontSize:12,color:"#64748B",marginBottom:2}}>
              {String.fromCodePoint(0x1F4CD)} {evento.lugar}
              {evento.url_ubicacion&&<a href={safeUrl(evento.url_ubicacion)||"#"} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginLeft:4}}>Ver mapa</a>}
            </div>}
            {evento.descripcion&&<div style={{fontSize:12,color:"#64748B",marginTop:4,lineHeight:1.4}}>{evento.descripcion}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8,flexShrink:0}}>
            {evento.imagen_url&&(
              <div onClick={()=>setImgZoom(true)} style={{cursor:"zoom-in",position:"relative"}}>
                <img src={evento.imagen_url} alt="Invitación" style={{width:80,height:80,objectFit:"cover",borderRadius:12,border:"1.5px solid #E2E8F0",display:"block"}}/>
                <div style={{position:"absolute",bottom:4,right:4,background:"rgba(0,0,0,0.45)",borderRadius:4,padding:"1px 4px",fontSize:9,color:"white",fontWeight:700}}>🔍</div>
              </div>
            )}
            <button onClick={onClose} style={{background:"#F1F5F9",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:13,color:"#94A3B8",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          </div>
        </div>
        <div style={{height:1,background:"#F1F5F9",margin:"0 20px"}}/>

        <div style={{padding:"16px 24px 24px"}}>

        {misHijos.filter(hid=>hid!==evento.alumno_id&&asistencia.some(a=>a.alumno_invitado_id===hid)).map(hid=>{
          const fila    = asistencia.find(a=>a.alumno_invitado_id===hid);
          const alumno  = alumnos[hid];
          const miAsiste = fila?.asiste;
          const hVal = hermanos[hid]??0;
          const aVal = adultos[hid]??0;
          return (
            <div key={hid} style={{background:"#F8FAFC",borderRadius:12,padding:14,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>
                {alumno ? `${alumno.nombre} ${alumno.apellido}` : "Tu hijo/a"}
              </div>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                <button onClick={()=>responder(hid,"si")} style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${miAsiste==="si"?"#10B981":"#E2E8F0"}`,background:miAsiste==="si"?"#F0FDF4":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:miAsiste==="si"?"#10B981":"#94A3B8"}}>Si va</button>
                <button onClick={()=>responder(hid,"no")} style={{flex:1,padding:"9px 0",borderRadius:10,border:`2px solid ${miAsiste==="no"?"#EF4444":"#E2E8F0"}`,background:miAsiste==="no"?"#FEF2F2":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:miAsiste==="no"?"#EF4444":"#94A3B8"}}>No va</button>
              </div>
              <div style={{display:"flex",gap:16,marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:6}}>Hermanos</div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <button onClick={()=>setNumero(setHermanos,hid,hVal-1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:16,fontWeight:700,color:"#64748B",lineHeight:1}}>-</button>
                    <input type="number" min="0" value={hVal} onChange={e=>setNumero(setHermanos,hid,e.target.value)} style={inpNum}/>
                    <button onClick={()=>setNumero(setHermanos,hid,hVal+1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:16,fontWeight:700,color:"#64748B",lineHeight:1}}>+</button>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:6}}>Adultos</div>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    <button onClick={()=>setNumero(setAdultos,hid,aVal-1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:16,fontWeight:700,color:"#64748B",lineHeight:1}}>-</button>
                    <input type="number" min="0" value={aVal} onChange={e=>setNumero(setAdultos,hid,e.target.value)} style={inpNum}/>
                    <button onClick={()=>setNumero(setAdultos,hid,aVal+1)} style={{width:28,height:28,borderRadius:8,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:16,fontWeight:700,color:"#64748B",lineHeight:1}}>+</button>
                  </div>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:4}}>Comentario</div>
                <input value={comentarios[hid]||""} onChange={e=>setComentarios(p=>({...p,[hid]:e.target.value}))} placeholder="Alergias, restricciones, etc." style={inp}/>
              </div>
              <button onClick={()=>guardarExtras(hid)} disabled={guardando} style={{width:"100%",padding:"8px 0",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{guardando?"Guardando...":"Guardar"}</button>
            </div>
          );
        })}

        {confirmados.length>0&&(
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{l:"Alumnos",v:totalAlumnos,c:"#3B82F6",bg:"#EFF6FF"},{l:"Hermanos",v:totalHermanos,c:"#8B5CF6",bg:"#F5F3FF"},{l:"Adultos",v:totalAdultos,c:"#F59E0B",bg:"#FFFBEB"}].map(({l,v,c,bg})=>(
              <div key={l} style={{flex:1,background:bg,borderRadius:10,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:10,fontWeight:700,color:c,textTransform:"uppercase",letterSpacing:0.5,marginTop:2}}>{l}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6}}>Lista de asistencia</div>
          {asistenciaDedup.length>0&&(
            <button
              onClick={()=>exportarExcel({ evento, asistenciaDedup, alumnos })}
              style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",borderRadius:8,
                border:"1px solid #10B981",background:"#F0FDF4",cursor:"pointer",
                fontSize:11,fontWeight:700,color:"#10B981"}}
            >
              📥 Exportar Excel
            </button>
          )}
        </div>
        {asistencia.length===0&&<div style={{fontSize:13,color:"#94A3B8",textAlign:"center",padding:"16px 0"}}>Sin respuestas aun</div>}
        {[{list:confirmados,label:"Confirman",color:"#10B981",bg:"#F0FDF4"},{list:pendientes,label:"Pendiente",color:"#F59E0B",bg:"#FFFBEB"},{list:noVan,label:"No van",color:"#EF4444",bg:"#FEF2F2"}].map(({list,label,color,bg})=>
          list.length>0&&(
            <div key={label} style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color,marginBottom:5}}>{label} ({list.length})</div>
              {list.map((a,i)=>{
                const al = alumnos[a.alumno_invitado_id];
                return (
                  <div key={i} style={{padding:"8px 10px",background:bg,borderRadius:10,marginBottom:5}}>
                    <div style={{fontSize:13,fontWeight:600}}>{al?`${al.nombre} ${al.apellido}`:"--"}</div>
                    <div style={{display:"flex",gap:10,marginTop:3,flexWrap:"wrap"}}>
                      {(Number(a.hermanos)||0)>0&&<span style={{fontSize:11,color:"#8B5CF6",fontWeight:600}}>{Number(a.hermanos)} herm.</span>}
                      {(Number(a.adultos)||0)>0&&<span style={{fontSize:11,color:"#F59E0B",fontWeight:600}}>{Number(a.adultos)} adultos</span>}
                      {a.comentario&&<span style={{fontSize:11,color:"#94A3B8"}}>{a.comentario}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        </div>
      </Card>
    </div>
  );
}

export function ResponsableModal({ cumple, alumnos, onClose, onSave }) {
  const [responsableId, setResponsableId] = useState(cumple?.responsable_id||null);
  const [comprado, setComprado]           = useState(cumple?.comprado||false);

  const handleGuardar = (e) => {
    e.stopPropagation();
    onSave({ responsable_id: responsableId, comprado });
  };

  // Compañeros: alumnos del curso excluyendo al cumpleañero
  const companeros = alumnos.filter(a => a.tipo==="Alumno" && a.rawId !== cumple.rawId);

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:420,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:17,fontWeight:900,marginBottom:4}}>🎁 Regalo de {cumple.nombre}</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:18}}>
          🎂 {new Date(cumple.fecha_nacimiento+"T00:00:00").toLocaleDateString("es-AR",{day:"numeric",month:"long"})}
          <span style={{marginLeft:8}}><Pill label={cumple.tipo==="Maestro"?"Maestro":"Alumno"} color={cumple.tipo==="Maestro"?"#8B5CF6":"#3B82F6"} bg={cumple.tipo==="Maestro"?"#F5F3FF":"#EFF6FF"}/></span>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>¿Quién regala?</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
            <div onClick={()=>setResponsableId(null)} style={{padding:"9px 12px",borderRadius:10,border:`2px solid ${!responsableId?"#94A3B8":"#E2E8F0"}`,background:!responsableId?"#F8FAFC":"white",cursor:"pointer",fontSize:13,color:"#94A3B8",fontWeight:600}}>Sin asignar</div>
            {companeros.map(a=>{
              const sel = responsableId===a.rawId;
              return (
                <div key={a.rawId} onClick={()=>setResponsableId(a.rawId)} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,border:`2px solid ${sel?(a.color||"#3B82F6"):"#E2E8F0"}`,background:sel?(a.color||"#3B82F6")+"18":"white",cursor:"pointer"}}>
                  <span style={{fontSize:13,fontWeight:sel?700:500,flex:1}}>{a.nombre}</span>
                  {sel&&<span style={{fontSize:13,color:a.color||"#3B82F6",fontWeight:700}}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.6,marginBottom:8}}>Estado del regalo</div>
          <button onClick={()=>setComprado(p=>!p)} style={{padding:"7px 14px",borderRadius:20,border:`2px solid ${comprado?"#10B981":"#E2E8F0"}`,background:comprado?"#F0FDF4":"white",cursor:"pointer",fontSize:12,fontWeight:700,color:comprado?"#10B981":"#94A3B8"}}>{comprado?"Comprado":"Pendiente"}</button>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={handleGuardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>Guardar</button>
        </div>
      </Card>
    </div>
  );
}

export function ColectaRegaloModal({ maestroNombre, montoDefault, monedaDefault="$", usuarios=[], onClose, onSave }) {
  const [titulo,      setTitulo]      = useState(`Regalo cumpleaños ${maestroNombre}`);
  const [monto,       setMonto]       = useState(montoDefault ? String(montoDefault) : "");
  const [moneda,      setMoneda]      = useState(monedaDefault||"$");
  const [fechaLimite, setFechaLimite] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [saving,      setSaving]      = useState(false);
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};
  const guardar = async () => {
    if(!titulo.trim()) return;
    setSaving(true);
    await onSave({maestroNombre, titulo, monto, moneda, fecha_limite: fechaLimite||null, responsable_id: responsableId ? Number(responsableId) : null});
    setSaving(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <Card style={{padding:24,width:"100%",maxWidth:420}}>
        <div style={{fontSize:15,fontWeight:900,marginBottom:4}}>🎁 Colecta regalo</div>
        <div style={{fontSize:12,color:"#94A3B8",marginBottom:16}}>Cumpleaños de {maestroNombre}</div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>TÍTULO</div>
          <input value={titulo} onChange={e=>setTitulo(e.target.value)} style={inp}/>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>MONTO SUGERIDO</div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <div style={{display:"flex",gap:4}}>
              {["$","USD"].map(m=>(
                <button key={m} type="button" onClick={()=>setMoneda(m)} style={{padding:"8px 14px",borderRadius:8,border:`2px solid ${moneda===m?"#3B82F6":"#E2E8F0"}`,background:moneda===m?"#EFF6FF":"white",cursor:"pointer",fontSize:13,fontWeight:700,color:moneda===m?"#3B82F6":"#94A3B8"}}>{m}</button>
              ))}
            </div>
            <input type="number" value={monto} onChange={e=>setMonto(e.target.value)} placeholder="Ej: 5000" style={{...inp,flex:1}}/>
          </div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>RESPONSABLE</div>
          <select value={responsableId} onChange={e=>setResponsableId(e.target.value)} style={inp}>
            <option value="">Sin asignar</option>
            {usuarios.map(u=>(
              <option key={u.id} value={u.id}>{u.nombre} {u.apellido||""}</option>
            ))}
          </select>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>FECHA LÍMITE</div>
          <input type="date" value={fechaLimite} onChange={e=>setFechaLimite(e.target.value)} style={inp}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#10B981",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{saving?"Creando...":"Crear colecta"}</button>
        </div>
      </Card>
    </div>
  );
}
