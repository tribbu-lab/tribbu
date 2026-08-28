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
import { Alumnos } from "../contacto";


// Encabezado de sección por curso (solo vista "Todos"): dot + nombre del hijo.
function CursoHeader({ tag }) {
  if(!tag) return null;
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:4,marginBottom:8}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:tag.color,flexShrink:0}}/>
      <span style={{fontSize:11,fontWeight:700,color:"#64748B"}}>{tag.nombre}</span>
    </div>
  );
}

export function InfoUtil({ cursoId, cursoIds, esVistaTodos, tagDeCurso, isAdmin, userId, cursoNombre="" }) {
  const [sec,setSec] = useState("utiles");

  return (
    <div>
      <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>Info Útil</div>
      <div style={{fontSize:13,color:"#94A3B8",marginBottom:18}}>Listas y uniformes del curso</div>
      <div style={{display:"flex",gap:7,marginBottom:18,maxWidth:440}}>
        {[{id:"utiles",l:"Útiles"},{id:"uniformes",l:"Uniformes"},{id:"libros",l:"Libros"},{id:"alumnos",l:"Alumnos"}].map(s=>(
          <button key={s.id} onClick={()=>setSec(s.id)} style={{flex:1,padding:"8px 6px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:sec===s.id?"#0F172A":"white",color:sec===s.id?"white":"#94A3B8",boxShadow:sec===s.id?"0 3px 12px rgba(0,0,0,0.15)":"0 1px 6px rgba(0,0,0,0.06)"}}>{s.l}</button>
        ))}
      </div>
      {sec==="utiles"    &&<Utiles    cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={userId} isAdmin={isAdmin} cursoNombre={cursoNombre}/>}
      {sec==="uniformes" &&<Uniformes cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={userId} isAdmin={isAdmin} cursoNombre={cursoNombre}/>}
      {sec==="libros"    &&<Libros    cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} userId={userId} isAdmin={isAdmin} cursoNombre={cursoNombre}/>}
      {sec==="alumnos"   &&<Alumnos   cursoId={cursoId} cursoIds={cursoIds} esVistaTodos={esVistaTodos} tagDeCurso={tagDeCurso} isAdmin={isAdmin}/>}
    </div>
  );
}

export function Libros({ cursoId, cursoIds, esVistaTodos, tagDeCurso, userId, isAdmin, cursoNombre="" }) {
  const [libros,    setLibros]    = useState([]);
  const [adquiridos,setAdquiridos]= useState(new Set());
  const [modal,     setModal]     = useState(null); // null | "nuevo" | libro obj
  const isMobile = useIsMobile();
  const [form,      setForm]      = useState({});
  const [busqueda,  setBusqueda]  = useState("");
  const [filtroMat, setFiltroMat] = useState("all");
  const [togglingId,setTogglingId]= useState(null);
  const [imgPreview,setImgPreview]= useState(null); // {url, nombre}

  const cargar = async () => {
    if(!cursoIds?.length) { setLibros([]); setAdquiridos(new Set()); return; }
    const [lb, adq] = await Promise.all([
      supabase.from("libros").select("*").in("curso_id", cursoIds).order("materia").order("nombre"),
      userId ? supabase.from("libro_adquirido").select("libro_id").eq("usuario_id", userId) : Promise.resolve({data:[]}),
    ]);
    setLibros(lb.data||[]);
    setAdquiridos(new Set((adq.data||[]).map(r=>r.libro_id)));
  };

  const cursosKey = (cursoIds||[]).join(",");
  useEffect(()=>{ cargar(); },[cursosKey]);

  const toggleAdquirido = async (libroId) => {
    if(!userId) return;
    setTogglingId(libroId);
    if(adquiridos.has(libroId)) {
      await supabase.from("libro_adquirido").delete().eq("libro_id",libroId).eq("usuario_id",userId);
      setAdquiridos(p=>{ const n=new Set(p); n.delete(libroId); return n; });
    } else {
      await supabase.from("libro_adquirido").insert({libro_id:libroId, usuario_id:userId});
      setAdquiridos(p=>new Set([...p,libroId]));
    }
    setTogglingId(null);
  };

  const guardar = async () => {
    if(!cursoId) return; // en vista "Todos" no hay curso activo (isAdmin ya es false)
    if(!form.nombre?.trim()) return;
    let imagen_url = form.imagen_url||null;
    if(form._file) {
      const ext = form._file.name.split(".").pop().toLowerCase();
      const path = `${cursoId}/${Date.now()}.${ext}`;
      const { data: upData, error: upError } = await supabase.storage.from("libros").upload(path, form._file, {upsert:true, contentType: form._file.type});
      if(upError) {
        alert("Error al subir imagen: " + upError.message);
      } else {
        const { data: pub } = supabase.storage.from("libros").getPublicUrl(path);
        imagen_url = pub?.publicUrl || null;
      }
    }
    const payload = {nombre:form.nombre.trim(), editorial:form.editorial||null, materia:form.materia||null, curso_id:cursoId, imagen_url, url_descarga:form.url_descarga||null};
    if(modal?.id) {
      await supabase.from("libros").update(payload).eq("id",modal.id);
    } else {
      await supabase.from("libros").insert(payload);
    }
    setModal(null); setForm({}); cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("libro_adquirido").delete().eq("libro_id",id);
    await supabase.from("libros").delete().eq("id",id);
    cargar();
  };

  const materias = [...new Set(libros.map(l=>l.materia).filter(Boolean))].sort();
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const filtrados = libros.filter(l=> {
    const q = busqueda.toLowerCase();
    if(q && !l.nombre?.toLowerCase().includes(q) && !(l.materia||"").toLowerCase().includes(q) && !(l.editorial||"").toLowerCase().includes(q)) return false;
    if(filtroMat!=="all" && l.materia!==filtroMat) return false;
    return true;
  });

  const adquiridosCount = libros.filter(l=>adquiridos.has(l.id)).length;

  // Vista "Todos": secciones por curso (solo si hay libros de más de un curso).
  const cursosConDatos = esVistaTodos
    ? (cursoIds||[]).filter(cid=>filtrados.some(l=>l.curso_id===cid))
    : [];
  const porCurso = cursosConDatos.length>1;

  // Group by materia
  const renderGrupos = (items) => {
    const agrupados = items.reduce((acc,l)=>{ const k=l.materia||"Sin materia"; (acc[k]=acc[k]||[]).push(l); return acc; },{});
    return Object.entries(agrupados).sort(([a],[b])=>a.localeCompare(b,"es")).map(([materia,grupo])=>(
      <div key={materia} style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",textTransform:"uppercase",letterSpacing:0.8,marginBottom:6,paddingLeft:2}}>{materia}</div>
        {grupo.map(l=>{
          const adq = adquiridos.has(l.id);
          return (
            <Card key={l.id} style={{padding:"12px 14px",marginBottom:7,display:"flex",alignItems:"center",gap:12,opacity:adq?0.75:1,borderLeft:`3px solid ${adq?"#10B981":"#E2E8F0"}`}}>
              <button onClick={()=>toggleAdquirido(l.id)} disabled={togglingId===l.id} style={{width:24,height:24,borderRadius:6,border:`2px solid ${adq?"#10B981":"#CBD5E1"}`,background:adq?"#10B981":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:13,color:"white",fontWeight:900,transition:"all 0.15s"}}>
                {adq?"✓":""}
              </button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,textDecoration:adq?"line-through":"none",color:adq?"#94A3B8":"#0F172A"}}>{l.nombre}</div>
                {l.editorial&&<div style={{fontSize:11,color:"#94A3B8",marginTop:1}}>{l.editorial}</div>}
                {l.url_descarga&&<a href={safeUrl(l.url_descarga)||"#"} target="_blank" rel="noreferrer" style={{fontSize:11,fontWeight:700,color:"#3B82F6",marginTop:3,display:"inline-block"}}>Descargar</a>}
              </div>
              {l.imagen_url&&(
                <img src={l.imagen_url} alt={l.nombre} style={{width:44,height:60,objectFit:"cover",borderRadius:7,border:"1px solid #E2E8F0",flexShrink:0,cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.10)"}} onClick={()=>setImgPreview({url:l.imagen_url,nombre:l.nombre})}/>
              )}
              {isAdmin&&(
                <div style={{display:"flex",gap:5,flexShrink:0}}>
                  <button onClick={()=>{setModal(l);setForm({...l});}} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:11,color:"#64748B"}}>✏️</button>
                  <button onClick={()=>eliminar(l.id)} style={{padding:"4px 8px",borderRadius:7,border:"1px solid #FEE2E2",background:"#FEF2F2",cursor:"pointer",fontSize:11,color:"#EF4444"}}>🗑</button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    ));
  };

  return (
    <div style={isMobile?{maxWidth:600}:undefined}>
      {/* Modal edicion */}
      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{modal?.id?"Editar libro":"Nuevo libro"}</div>
            {[{label:"Nombre",key:"nombre",ph:"Ej: Matemáticas 3"},{label:"Editorial",key:"editorial",ph:"Ej: Santillana"},{label:"Materia",key:"materia",ph:"Ej: Matemáticas"}].map(f=>(
              <div key={f.key} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>{f.label.toUpperCase()}</div>
                <input value={form[f.key]||""} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph} style={inp}/>
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>TAPA DEL LIBRO</div>
              {(form.imagen_url&&!form._file)&&(
                <div style={{marginBottom:8,position:"relative",display:"inline-block"}}>
                  <img src={form.imagen_url} alt="tapa" style={{width:80,height:110,objectFit:"cover",borderRadius:8,border:"1px solid #E2E8F0"}}/>
                  <button onClick={()=>setForm(p=>({...p,imagen_url:null}))} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              )}
              {form._file&&(
                <div style={{marginBottom:8,position:"relative",display:"inline-block"}}>
                  <img src={URL.createObjectURL(form._file)} alt="preview" style={{width:80,height:110,objectFit:"cover",borderRadius:8,border:"2px solid #3B82F6"}}/>
                  <button onClick={()=>setForm(p=>({...p,_file:null}))} style={{position:"absolute",top:-6,right:-6,width:20,height:20,borderRadius:"50%",border:"none",background:"#EF4444",color:"white",cursor:"pointer",fontSize:11,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              )}
              <label style={{display:"block",padding:"8px 12px",borderRadius:10,border:"1.5px dashed #CBD5E1",background:"#F8FAFC",cursor:"pointer",fontSize:12,color:"#64748B",textAlign:"center"}}>
                {form._file||form.imagen_url?"Cambiar imagen":"Subir imagen (JPG, PNG)"}
                <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{ if(e.target.files[0]) setForm(p=>({...p,_file:e.target.files[0]})); }}/>
              </label>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>LINK DE DESCARGA</div>
              <input value={form.url_descarga||""} onChange={e=>setForm(p=>({...p,url_descarga:e.target.value}))} placeholder="Ej: https://drive.google.com/..." style={inp}/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button onClick={()=>{setModal(null);setForm({});}} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal?.id?"Guardar cambios":"Agregar libro"}</button>
            </div>
          </Card>
        </div>
      )}

      {/* Image preview modal */}
      {imgPreview&&(
        <div onClick={()=>setImgPreview(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
          <img src={imgPreview.url} alt={imgPreview.nombre} style={{maxWidth:"100%",maxHeight:"75vh",borderRadius:12,boxShadow:"0 8px 40px rgba(0,0,0,0.5)",objectFit:"contain"}} onClick={e=>e.stopPropagation()}/>
          <div style={{color:"white",fontSize:14,fontWeight:700,marginTop:14}}>{imgPreview.nombre}</div>
          <button onClick={()=>setImgPreview(null)} style={{marginTop:12,padding:"8px 24px",borderRadius:20,border:"none",background:"rgba(255,255,255,0.15)",color:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>Cerrar</button>
        </div>
      )}

      {/* Header + stats */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:13,color:"#94A3B8"}}>{adquiridosCount} de {libros.length} adquiridos</div>
          {libros.length>0&&<div style={{marginTop:4,height:5,width:200,background:"#E2E8F0",borderRadius:10,overflow:"hidden"}}><div style={{height:"100%",background:"#10B981",width:`${(adquiridosCount/libros.length)*100}%`,borderRadius:10,transition:"width 0.3s"}}/></div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{ const grupos=libros.reduce((acc,l)=>{ const k=l.materia||"Sin materia";(acc[k]=acc[k]||[]).push({Nombre:l.nombre,Editorial:l.editorial||"","Link":l.url_descarga||""});return acc;},{}); exportarPDF(libros.map(l=>({Nombre:l.nombre,Editorial:l.editorial||"",Materia:l.materia||"","Link":l.url_descarga||""})),"libros",{titulo:"Lista de Libros",curso:cursoNombre,columnas:["Nombre","Editorial","Materia","Link"],grupos}); }} style={{padding:"7px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:"#64748B"}}>Exportar</button>
          {isAdmin&&<button onClick={()=>{setModal({});setForm({});}} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar libro</button>}
        </div>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, materia o editorial..." style={{flex:2,minWidth:160,padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",background:"white",boxSizing:"border-box"}}/>
        <select value={filtroMat} onChange={e=>setFiltroMat(e.target.value)} style={{flex:1,minWidth:120,padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white"}}>
          <option value="all">Todas las materias</option>
          {materias.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        {(busqueda||filtroMat!=="all")&&<button onClick={()=>{setBusqueda("");setFiltroMat("all");}} style={{padding:"8px 12px",borderRadius:10,border:"1px solid #FCA5A5",background:"#FEF2F2",cursor:"pointer",fontSize:12,fontWeight:700,color:"#EF4444"}}>Limpiar</button>}
      </div>
      <div style={{fontSize:11,color:"#94A3B8",marginBottom:12}}>{filtrados.length} libro{filtrados.length!==1?"s":""}</div>

      {filtrados.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Sin libros para mostrar</div>}

      {/* Agrupados por materia (en vista "Todos": secciones por curso) */}
      {porCurso
        ? cursosConDatos.map(cid=>(
            <div key={cid}>
              <CursoHeader tag={tagDeCurso?.(cid)}/>
              {renderGrupos(filtrados.filter(l=>l.curso_id===cid))}
            </div>
          ))
        : <div style={isMobile?undefined:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,alignItems:"start"}}>{renderGrupos(filtrados)}</div>}
    </div>
  );
}

export function Utiles({ cursoId, cursoIds, esVistaTodos, tagDeCurso, userId, isAdmin, cursoNombre="" }) {
  const [utiles,    setUtiles]    = useState([]);
  const [adquiridos,setAdquiridos]= useState(new Set());
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState({});
  const [busqueda,  setBusqueda]  = useState("");
  const [filtroCat, setFiltroCat] = useState("all");
  const [togglingId,setTogglingId]= useState(null);
  const isMobile = useIsMobile();

  const cargar = async () => {
    if(!cursoIds?.length) { setUtiles([]); setAdquiridos(new Set()); return; }
    const [ut, adq] = await Promise.all([
      supabase.from("utiles").select("*").in("curso_id", cursoIds).order("categoria").order("item"),
      userId ? supabase.from("util_adquirido").select("util_id").eq("usuario_id", userId) : Promise.resolve({data:[]}),
    ]);
    setUtiles(ut.data||[]);
    setAdquiridos(new Set((adq.data||[]).map(r=>r.util_id)));
  };
  const cursosKey = (cursoIds||[]).join(",");
  useEffect(()=>{ cargar(); },[cursosKey]);

  const toggleAdquirido = async (id) => {
    if(!userId) return;
    setTogglingId(id);
    if(adquiridos.has(id)) {
      await supabase.from("util_adquirido").delete().eq("util_id",id).eq("usuario_id",userId);
      setAdquiridos(p=>{ const n=new Set(p); n.delete(id); return n; });
    } else {
      await supabase.from("util_adquirido").insert({util_id:id, usuario_id:userId});
      setAdquiridos(p=>new Set([...p,id]));
    }
    setTogglingId(null);
  };

  const guardar = async () => {
    if(!cursoId) return; // en vista "Todos" no hay curso activo (isAdmin ya es false)
    if(!form.item?.trim()) return;
    const payload = {item:form.item.trim(), categoria:form.categoria||null, cantidad:form.cantidad||null, comentario:form.comentario||null, curso_id:cursoId};
    if(modal?.id) await supabase.from("utiles").update(payload).eq("id",modal.id);
    else          await supabase.from("utiles").insert(payload);
    setModal(null); setForm({}); cargar();
  };

  const eliminar = async (id) => {
    await supabase.from("util_adquirido").delete().eq("util_id",id);
    await supabase.from("utiles").delete().eq("id",id);
    cargar();
  };

  const categorias = [...new Set(utiles.map(u=>u.categoria).filter(Boolean))].sort();
  const inp = {width:"100%",padding:"9px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit",background:"#F8FAFC",boxSizing:"border-box"};

  const filtrados = utiles.filter(u=>{
    const q = busqueda.toLowerCase();
    if(q && !u.item?.toLowerCase().includes(q) && !(u.categoria||"").toLowerCase().includes(q)) return false;
    if(filtroCat!=="all" && u.categoria!==filtroCat) return false;
    return true;
  });

  const adquiridosCount = utiles.filter(u=>adquiridos.has(u.id)).length;

  // Vista "Todos": secciones por curso (solo si hay útiles de más de un curso).
  const cursosConDatos = esVistaTodos
    ? (cursoIds||[]).filter(cid=>filtrados.some(u=>u.curso_id===cid))
    : [];
  const porCurso = cursosConDatos.length>1;

  const renderGrupos = (lista) => {
    const agrupados = lista.reduce((acc,u)=>{ const k=u.categoria||"Sin categoría"; (acc[k]=acc[k]||[]).push(u); return acc; },{});
    return Object.entries(agrupados).sort(([a],[b])=>{
        if(a==="Notas") return -1; if(b==="Notas") return 1;
        if(a==="Sin categoría") return 1; if(b==="Sin categoría") return -1;
        return a.localeCompare(b,"es");
      }).map(([cat,items])=>(
      <div key={cat} style={{marginBottom:14,maxWidth:600}}>
        {/* Categoría header */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:"#F1F5F9",borderRadius:8,marginBottom:0}}>
          <span style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:0.8,flex:1}}>{cat}</span>
          <span style={{fontSize:10,color:"#94A3B8"}}>{items.filter(u=>adquiridos.has(u.id)).length}/{items.length}</span>
        </div>
        {/* Table rows */}
        <div style={{border:"1px solid #E2E8F0",borderTop:"none",borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
          {items.map((u,ri)=>{
            const adq = adquiridos.has(u.id);
            const isLast = ri===items.length-1;
            return (
              <div key={u.id} style={{display:"flex",alignItems:"center",gap:0,background:adq?"#F0FDF4":ri%2===0?"white":"#FAFAFA",borderBottom:isLast?"none":"1px solid #F1F5F9",minHeight:36}}>
                {/* check */}
                <div style={{width:40,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,borderRight:"1px solid #F1F5F9",alignSelf:"stretch"}}>
                  <button onClick={()=>toggleAdquirido(u.id)} disabled={togglingId===u.id} style={{width:20,height:20,borderRadius:5,border:`2px solid ${adq?"#10B981":"#CBD5E1"}`,background:adq?"#10B981":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"white",fontWeight:900,flexShrink:0}}>
                    {adq?"✓":""}
                  </button>
                </div>
                {/* nombre */}
                <div style={{flex:1,padding:"7px 10px",minWidth:0}}>
                  <span style={{fontSize:13,fontWeight:500,textDecoration:adq?"line-through":"none",color:adq?"#94A3B8":"#0F172A"}}>{u.item}</span>
                  {u.comentario&&<span style={{fontSize:11,color:"#94A3B8",marginLeft:8}}>{u.comentario}</span>}
                </div>
                {/* cantidad */}
                {u.cantidad&&(
                  <div style={{width:70,padding:"7px 10px",borderLeft:"1px solid #F1F5F9",flexShrink:0,textAlign:"center"}}>
                    <span style={{fontSize:12,color:"#475569",fontWeight:600}}>{u.cantidad}</span>
                  </div>
                )}
                {/* admin actions */}
                {isAdmin&&(
                  <div style={{display:"flex",gap:3,padding:"0 8px",flexShrink:0,borderLeft:"1px solid #F1F5F9",alignSelf:"stretch",alignItems:"center"}}>
                    <button onClick={()=>{setModal(u);setForm({...u});}} style={{padding:"3px 6px",borderRadius:5,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:10,color:"#64748B"}}>✏️</button>
                    <button onClick={()=>eliminar(u.id)} style={{padding:"3px 6px",borderRadius:5,border:"none",background:"transparent",cursor:"pointer",fontSize:10,color:"#EF4444"}}>🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ));
  };

  const exportar = () => {
    const grupos = utiles.reduce((acc,u)=>{ const k=u.categoria||"Sin categoría"; (acc[k]=acc[k]||[]).push({Nombre:u.item, Cantidad:u.cantidad||"", Comentario:u.comentario||""}); return acc; },{});
    exportarPDF(utiles.map(u=>({Nombre:u.item,Cantidad:u.cantidad||"",Comentario:u.comentario||""})),"utiles",{ titulo:"Lista de Útiles Escolares", curso:cursoNombre, columnas:["Nombre","Cantidad","Comentario"], grupos });
  };

  return (
    <div style={isMobile?{maxWidth:600}:undefined}>
      {modal!==null&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <Card style={{padding:24,width:"100%",maxWidth:400}}>
            <div style={{fontSize:15,fontWeight:900,marginBottom:16}}>{modal?.id?"Editar útil":"Nuevo útil"}</div>
            {[{l:"Nombre",k:"item",ph:"Ej: Cartuchera"},{l:"Categoría",k:"categoria",ph:"Ej: Papelería"},{l:"Cantidad",k:"cantidad",ph:"Ej: 2 unidades"},{l:"Comentario",k:"comentario",ph:"Ej: Con cierre doble"}].map(f=>(
              <div key={f.k} style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:"#94A3B8",marginBottom:5}}>{f.l.toUpperCase()}</div>
                {f.k==="comentario"
                  ? <textarea value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} rows={2} style={{...inp,resize:"none"}}/>
                  : <input value={form[f.k]||""} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.ph} style={inp}/>
                }
              </div>
            ))}
            <div style={{display:"flex",gap:10,marginTop:6}}>
              <button onClick={()=>{setModal(null);setForm({});}} style={{flex:1,padding:11,borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600,color:"#94A3B8"}}>Cancelar</button>
              <button onClick={guardar} style={{flex:2,padding:11,borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:13,fontWeight:700}}>{modal?.id?"Guardar cambios":"Agregar útil"}</button>
            </div>
          </Card>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:13,color:"#94A3B8"}}>{adquiridosCount} de {utiles.length} adquiridos</div>
          {utiles.length>0&&<div style={{marginTop:4,height:5,width:200,background:"#E2E8F0",borderRadius:10,overflow:"hidden"}}><div style={{height:"100%",background:"#10B981",width:`${(adquiridosCount/utiles.length)*100}%`,borderRadius:10,transition:"width 0.3s"}}/></div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportar} style={{padding:"7px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:"#64748B"}}>Exportar</button>
          {isAdmin&&<button onClick={()=>{setModal({});setForm({});}} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"#3B82F6",color:"white",cursor:"pointer",fontSize:12,fontWeight:700}}>+ Agregar</button>}
        </div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre o categoría..." style={{flex:2,minWidth:160,padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:13,outline:"none",background:"white",boxSizing:"border-box"}}/>
        <select value={filtroCat} onChange={e=>setFiltroCat(e.target.value)} style={{flex:1,minWidth:120,padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",background:"white"}}>
          <option value="all">Todas las categorías</option>
          {categorias.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        {(busqueda||filtroCat!=="all")&&<button onClick={()=>{setBusqueda("");setFiltroCat("all");}} style={{padding:"8px 12px",borderRadius:10,border:"1px solid #FCA5A5",background:"#FEF2F2",cursor:"pointer",fontSize:12,fontWeight:700,color:"#EF4444"}}>Limpiar</button>}
      </div>
      <div style={{fontSize:11,color:"#94A3B8",marginBottom:12}}>{filtrados.length} ítem{filtrados.length!==1?"s":""}</div>

      {filtrados.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>Sin útiles para mostrar</div>}

      {porCurso
        ? cursosConDatos.map(cid=>(
            <div key={cid}>
              <CursoHeader tag={tagDeCurso?.(cid)}/>
              {renderGrupos(filtrados.filter(u=>u.curso_id===cid))}
            </div>
          ))
        : <div style={isMobile?undefined:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,alignItems:"start"}}>{renderGrupos(filtrados)}</div>}
    </div>
  );
}

export function Uniformes({ cursoId, cursoIds, esVistaTodos, tagDeCurso, isAdmin, userId, cursoNombre="" }) {
  const [uniformes,  setUniformes]  = useState([]);
  const [idsPorCurso,setIdsPorCurso]= useState({}); // curso_id → [uniforme_id] (para agrupar en "Todos")
  const [adquiridos, setAdquiridos] = useState(new Set());
  const [togglingId, setTogglingId] = useState(null);
  const isMobile = useIsMobile();

  const cargar = async () => {
    if(!cursoIds?.length) { setUniformes([]); setIdsPorCurso({}); return; }
    // Get uniforme IDs linked to these cursos
    const { data: links } = await supabase.from("uniforme_cursos").select("uniforme_id, curso_id").in("curso_id",cursoIds);
    const mapa = {};
    (links||[]).forEach(r=>{ (mapa[r.curso_id]=mapa[r.curso_id]||[]).push(r.uniforme_id); });
    setIdsPorCurso(mapa);
    const ids = [...new Set((links||[]).map(r=>r.uniforme_id))];
    if(!ids.length) { setUniformes([]); return; }
    const [uni, adq] = await Promise.all([
      supabase.from("uniformes").select("*, uniforme_items(id,item)").in("id",ids),
      supabase.from("uniforme_adquirido").select("uniforme_item_id").eq("usuario_id",userId),
    ]);
    const sorted = (uni.data||[]).sort((a,b)=>a.tipo.localeCompare(b.tipo,"es"));
    setUniformes(sorted);
    setAdquiridos(new Set((adq.data||[]).map(r=>r.uniforme_item_id)));
  };

  const cursosKey = (cursoIds||[]).join(",");
  useEffect(()=>{ cargar(); },[cursosKey]);

  const toggleAdquirido = async (itemId) => {
    setTogglingId(itemId);
    if(adquiridos.has(itemId)) {
      await supabase.from("uniforme_adquirido").delete().eq("uniforme_item_id",itemId).eq("usuario_id",userId);
      setAdquiridos(p=>{ const n=new Set(p); n.delete(itemId); return n; });
    } else {
      await supabase.from("uniforme_adquirido").insert({uniforme_item_id:itemId, usuario_id:userId});
      setAdquiridos(p=>new Set([...p,itemId]));
    }
    setTogglingId(null);
  };

  const allItems = uniformes.flatMap(u=>(u.uniforme_items||[]));
  const total    = allItems.length;
  const adqCount = allItems.filter(it=>adquiridos.has(it.id)).length;
  const pct      = total ? Math.round(adqCount/total*100) : 0;

  const exportar = () => exportarPDF(
    uniformes.flatMap(u=>(u.uniforme_items||[]).map(it=>({Tipo:u.tipo,Ítem:it.item,Adquirido:adquiridos.has(it.id)?"✓":""}))),
    "uniformes", { titulo:"Lista de Uniformes", curso:cursoNombre, columnas:["Tipo","Ítem","Adquirido"] }
  );

  // Vista "Todos": secciones por curso (solo si hay uniformes en más de un curso).
  const cursosConDatos = esVistaTodos
    ? (cursoIds||[]).filter(cid=>(idsPorCurso[cid]||[]).length>0)
    : [];
  const porCurso = cursosConDatos.length>1;

  const renderUniforme = (u, i, key) => {
    const items = u.uniforme_items||[];
    const bg = ["#EEF2FF","#F0FDF4","#FFF7ED"][i%3];
    return (
      <Card key={key} style={{marginBottom:12,overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:bg,borderBottom:"1px solid #F1F5F9"}}>
          <div style={{width:34,height:34,borderRadius:10,background:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{u.emoji||"👕"}</div>
          <span style={{fontSize:14,fontWeight:800,flex:1}}>{u.tipo}</span>
        </div>
        <div>
          {items.sort((a,b)=>a.item.localeCompare(b.item,"es")).map((it,j)=>{
            const adq = adquiridos.has(it.id);
            return (
              <div key={it.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:j<items.length-1?"1px solid #F8FAFC":"none",background:j%2===0?"white":"#FAFAFA",opacity:adq?0.7:1}}>
                <button onClick={()=>toggleAdquirido(it.id)} disabled={togglingId===it.id} style={{width:24,height:24,borderRadius:6,border:`2px solid ${adq?"#10B981":"#CBD5E1"}`,background:adq?"#10B981":"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:13,color:"white",fontWeight:900,transition:"all 0.15s"}}>
                  {adq?"✓":""}
                </button>
                <span style={{fontSize:13,flex:1,textDecoration:adq?"line-through":"none",color:adq?"#94A3B8":"#0F172A"}}>{it.item}</span>
              </div>
            );
          })}
          {items.length===0&&<div style={{padding:"12px 14px",fontSize:12,color:"#94A3B8"}}>Sin ítems cargados.</div>}
        </div>
      </Card>
    );
  };

  return (
    <div style={isMobile?{maxWidth:600}:undefined}>
      {total>0&&(
        <div style={{marginBottom:14,maxWidth:600}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:700,color:"#64748B",marginBottom:5}}>
            <span>Adquiridos</span><span>{adqCount} / {total} ({pct}%)</span>
          </div>
          <div style={{height:6,borderRadius:10,background:"#E2E8F0",overflow:"hidden"}}>
            <div style={{height:"100%",width:pct+"%",background:"#10B981",borderRadius:10,transition:"width 0.3s"}}/>
          </div>
        </div>
      )}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        {total>0&&<button onClick={exportar} style={{padding:"7px 14px",borderRadius:10,border:"1px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:12,fontWeight:700,color:"#64748B"}}>Exportar</button>}
      </div>
      {porCurso
        ? cursosConDatos.map(cid=>{
            const idsDelCurso = new Set(idsPorCurso[cid]||[]);
            return (
              <div key={cid}>
                <CursoHeader tag={tagDeCurso?.(cid)}/>
                {uniformes.filter(u=>idsDelCurso.has(u.id)).map((u,i)=>renderUniforme(u,i,`${cid}-${u.id}`))}
              </div>
            );
          })
        : <div style={isMobile?undefined:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12,alignItems:"start"}}>{uniformes.map((u,i)=>renderUniforme(u,i,u.id))}</div>}
      {uniformes.length===0&&<div style={{textAlign:"center",padding:32,color:"#94A3B8",fontSize:13}}>No hay uniformes asignados a este curso.</div>}
    </div>
  );
}
