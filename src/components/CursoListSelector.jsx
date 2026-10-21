import { NIVELES, nivelesDeCursos } from "../lib/niveles";

// Lista de cursos con checkbox (o radio si multi=false) para elegir uno o
// varios — usado por los flujos multi-curso de Super Admin (Comunicaciones,
// Eventos). Con cursos de más de un nivel (roles-por-nivel), arriba van chips
// por nivel que tildan o destildan todos los cursos de ese nivel.
export function CursoListSelector({ cursos, seleccionados, onToggle, multi=true, maxHeight=220 }) {
  const niveles = multi ? nivelesDeCursos(cursos) : [];
  const toggleNivel = (k) => {
    const delNivel = cursos.filter(c=>c.nivel===k);
    const todos = delNivel.every(c=>seleccionados.includes(c.id));
    delNivel.filter(c=>todos ? seleccionados.includes(c.id) : !seleccionados.includes(c.id)).forEach(c=>onToggle(c.id));
  };
  return (
    <>
      {niveles.length>1&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {NIVELES.filter(n=>niveles.includes(n.k)).map(n=>{
            const delNivel = cursos.filter(c=>c.nivel===n.k);
            const on = delNivel.every(c=>seleccionados.includes(c.id));
            return (
              <button key={n.k} type="button" onClick={()=>toggleNivel(n.k)} aria-pressed={on}
                style={{padding:"5px 11px",borderRadius:999,border:`1px solid ${on?"#3B82F6":"#E2E8F0"}`,background:on?"#EFF6FF":"white",color:on?"#1D4ED8":"#64748B",cursor:"pointer",fontSize:12,fontWeight:700}}>
                {on?"✓ ":""}Todo {n.l}
              </button>
            );
          })}
        </div>
      )}
      <div style={{border:"1.5px solid #E2E8F0",borderRadius:12,maxHeight,overflowY:"auto"}}>
        {cursos.map((c,i)=>{
          const sel = seleccionados.includes(c.id);
          return (
            <label key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",cursor:"pointer",borderTop:i>0?"1px solid #F1F5F9":"none",background:sel?(c.color+"0D"):"white"}}>
              <input type={multi?"checkbox":"radio"} name={multi?undefined:"curso-list-selector"} checked={sel} onChange={()=>onToggle(c.id)} style={{width:16,height:16,accentColor:c.color,cursor:"pointer",flexShrink:0}}/>
              <span style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:sel?700:500,color:sel?"#0F172A":"#475569",flex:1}}>{c.avatar} {c.nombre}</span>
            </label>
          );
        })}
        {cursos.length===0&&<div style={{padding:14,fontSize:12,color:"#94A3B8",textAlign:"center"}}>Sin cursos</div>}
      </div>
    </>
  );
}
