// @ts-nocheck
import { useState } from "react";

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
