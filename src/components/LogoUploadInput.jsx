// Subida del logo de un colegio — mismo patrón que AdjuntosInput
// (src/components/Adjuntos.jsx): sube al bucket público "adjuntos" y
// devuelve la URL pública. A diferencia de Adjuntos, es un solo archivo
// (no array) y vive en su propio prefijo `colegios/{colegioId}/logo.*`
// para no mezclarse con los adjuntos de recordatorios/eventos (que usan
// `{cursoId}/...`). `upsert:true` pisa el logo anterior en cada subida.
//
// Uso: <LogoUploadInput colegioId={colegioId} value={form.logo_url} onChange={url=>setForm(p=>({...p,logo_url:url}))}/>

import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { T } from "../lib/theme";
import { SignedImg } from "./SignedImg";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB — un logo no necesita más

export function LogoUploadInput({ colegioId, value, onChange }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file || !colegioId) return;
    setError("");
    if (!file.type.startsWith("image/")) { setError("Solo se permiten imágenes"); return; }
    if (file.size > MAX_BYTES) { setError("La imagen supera los 3 MB"); return; }

    setSubiendo(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `colegios/${colegioId}/logo.${ext}`;
    const { error: upError } = await supabase.storage.from("adjuntos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upError) {
      setError("Error al subir el logo: " + upError.message);
    } else {
      // Bucket privado: se guarda el PATH. Cada firmado genera una URL nueva,
      // así que el cache-bust del path fijo (upsert) es automático.
      onChange(path);
    }
    setSubiendo(false);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <div style={{width:44,height:44,borderRadius:10,border:"1.5px solid #E2E8F0",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0}}>
          {value ? <SignedImg src={value} bucket="adjuntos" alt="Logo" style={{width:"100%",height:"100%",objectFit:"contain"}}/> : <span style={{fontSize:16,opacity:0.3}}>🏫</span>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{display:"none"}}/>
        <button onClick={() => inputRef.current?.click()} disabled={subiendo || !colegioId}
          style={{padding:"7px 14px",borderRadius:8,border:"1.5px dashed #CBD5E1",background:"white",
            cursor:subiendo ? "default" : "pointer",fontSize:12,fontWeight:700,color:subiendo ? "#CBD5E1" : T.muted}}>
          {subiendo ? "Subiendo..." : value ? "Cambiar logo" : "+ Subir logo"}
        </button>
        {value && !subiendo && (
          <button onClick={() => onChange("")} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #FCA5A5",background:"#FEF2F2",cursor:"pointer",fontSize:11.5,fontWeight:700,color:T.red}}>Quitar</button>
        )}
      </div>
      {error && <div style={{fontSize:11,fontWeight:600,color:T.red,marginBottom:6}}>{error}</div>}
      <div style={{fontSize:10.5,color:"#94A3B8"}}>PNG o JPG, fondo transparente recomendado. Máx. 3 MB.</div>
    </div>
  );
}
