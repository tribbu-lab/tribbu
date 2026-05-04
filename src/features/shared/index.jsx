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


export function ListToolbar({ busqueda, setBusqueda, sortOptions, sortKey, sortAsc, toggleSort, filterOptions, filtros, setFiltro, resetFiltros, total, placeholder="Buscar..." }) {
  const hayFiltros = busqueda || Object.values(filtros).some(v=>v&&v!=="all");
  const s = {padding:"8px 12px",borderRadius:10,border:"1.5px solid #E2E8F0",fontSize:12,outline:"none",fontFamily:"inherit",background:"white",cursor:"pointer"};
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
        <input
          value={busqueda} onChange={e=>{setBusqueda(e.target.value);}}
          placeholder={placeholder}
          style={{flex:2,minWidth:160,...s,cursor:"text"}}
        />
        {sortOptions&&sortOptions.length>0&&(
          <select value={sortKey||""} onChange={e=>toggleSort(e.target.value)} style={{flex:1,minWidth:120,...s}}>
            {sortOptions.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
        {sortOptions&&<button onClick={()=>toggleSort(sortKey)} style={{...s,padding:"8px 10px",minWidth:36}}>{sortAsc?"↑":"↓"}</button>}
        {hayFiltros&&<button onClick={resetFiltros} style={{...s,color:"#EF4444",borderColor:"#FCA5A5",background:"#FEF2F2",fontWeight:700}}>Limpiar</button>}
      </div>
      {filterOptions&&filterOptions.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {filterOptions.map(f=>(
            <select key={f.key} value={filtros[f.key]||"all"} onChange={e=>setFiltro(f.key,e.target.value)} style={{...s,fontSize:11,padding:"5px 10px"}}>
              <option value="all">{f.label}: Todos</option>
              {f.options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>
      )}
      <div style={{fontSize:11,color:"#94A3B8",marginTop:6}}>{total} resultado{total!==1?"s":""}</div>
    </div>
  );
}

export function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [cat,  setCat]  = useState(0);
  const CATS = [
    { l:"😀 Caritas", e:["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😉","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🫢","🤫","🤔","🫠","🤐","🥴","😐","😑","😶","🫥","😏","😒","🙄","😬","🤥","🫨","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥱","🤯","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🤬","😤","😡","😠","🤡","💩","💀","☠️","👻","👽","👾","🤖"] },
    { l:"🐶 Animales", e:["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪲","🦟","🦗","🪳","🕷","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🫏","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿","🦔"] },
    { l:"⚽ Deportes", e:["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸","🥌","🎿","⛷","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺","🏇","🧘","🏌️","🏄","🚣","🧗","🚵","🚴","🤾","🏊","🤽"] },
    { l:"🍕 Comida",   e:["🍕","🍔","🍟","🌭","🌮","🌯","🥙","🧆","🥚","🍳","🥘","🍲","🫕","🥣","🥗","🍿","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🥟","🥠","🥡","🍦","🍧","🍨","🍩","🍪","🎂","🍰","🧁","🥧","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🫗","🥃","🍸","🍹","🧉","🍾"] },
    { l:"🎒 Escuela",  e:["🎒","📚","📖","📝","✏️","🖊","🖋","📏","📐","✂️","🖍","📌","📍","📎","🖇","📋","📁","📂","🗂","📓","📔","📒","📕","📗","📘","📙","📜","📄","📑","🗒","🗓","📅","📆","🗑","🗃","🗄","💼","🖥","💻","⌨️","🖨","📱","📲","☎️","📞","📟","📠","📺","📻","🧮","🔭","🔬","🔋","💡","🔦","🕯","🪄","🎓","🏫","🏛","⚗️","🧪","🧫","🧬","🔑","🗝","🔐","🔒","🔓"] },
    { l:"❤️ Símbolos", e:["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☯️","🕎","🔯","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","⛎","🔀","🔁","🔂","▶️","⏩","⏭","⏯","◀️","⏪","⏮","🔼","⏫","🔽","⏬","⏸","⏹","⏺","🎦","🔅","🔆","📶","📳","📴","📵","📡","🔇","🔔","🔕","🔈","🔉","🔊","📢","📣","🔔","🔕","🃏","🎴","🀄","🎭","🎨","🖼","🎪","🎤","🎧","🎼","🎵","🎶","🎹","🥁","🪘","🎷","🎺","🎸","🎻","🪕","🎲","♟","🎯","🎳","🎮","🕹"] },
  ];

  return (
    <div style={{position:"relative"}}>
      <button type="button" onClick={()=>setOpen(p=>!p)} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px",borderRadius:10,border:"1.5px solid #E2E8F0",background:"white",cursor:"pointer",fontSize:13,fontWeight:600}}>
        <span style={{fontSize:22,lineHeight:1}}>{value||"+"}</span>
        <span style={{color:"#94A3B8",fontSize:12}}>{value?"Cambiar":"Elegir emoji"} ▾</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:300,background:"white",border:"1.5px solid #E2E8F0",borderRadius:14,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",width:300,overflow:"hidden"}}>
          {/* Categorías */}
          <div style={{display:"flex",borderBottom:"1px solid #F1F5F9",overflowX:"auto",scrollbarWidth:"none"}}>
            {CATS.map((c,i)=>(
              <button key={i} type="button" onClick={()=>setCat(i)} style={{padding:"8px 10px",border:"none",background:"none",cursor:"pointer",fontSize:15,borderBottom:`2px solid ${cat===i?"#3B82F6":"transparent"}`,flexShrink:0,whiteSpace:"nowrap"}}>
                {c.l.split(" ")[0]}
              </button>
            ))}
          </div>
          {/* Grid */}
          <div style={{display:"flex",flexWrap:"wrap",padding:8,maxHeight:200,overflowY:"auto"}}>
            {CATS[cat].e.map(e=>(
              <button key={e} type="button" onClick={()=>{ onChange(e); setOpen(false); }} style={{width:36,height:36,border:"none",background:value===e?"#EFF6FF":"transparent",borderRadius:8,cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
