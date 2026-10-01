// Adjuntos (imágenes/PDF) para recordatorios y eventos.
// - AdjuntosInput: control de carga para modales (valida tipo y tamaño, sube al
//   bucket "adjuntos" y devuelve el array actualizado vía onChange).
// - AdjuntosList: render de solo lectura para filas de lista (miniaturas con
//   lightbox para imágenes, chip con nombre para PDFs).
// Cada adjunto es { url, tipo: "imagen"|"pdf", nombre }.

import { useState, useRef } from "react";
import { supabase } from "../supabase";
import { T } from "../lib/theme";
import { sanitize } from "../lib/helpers";
import { signStorageUrl } from "../lib/storageUrl";
import { SignedImg } from "./SignedImg";
import { subirImagen } from "../lib/imagenesWeb";

export const MAX_ADJUNTOS = 3;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function AdjuntosInput({ adjuntos = [], onChange, cursoId, onUploadingChange }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error,    setError]    = useState("");
  const inputRef = useRef(null);

  const setUploading = (v) => { setSubiendo(v); onUploadingChange?.(v); };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setError("");
    const esPdf    = file.type === "application/pdf";
    const esImagen = file.type.startsWith("image/");
    if (!esImagen && !esPdf) { setError("Solo se permiten imágenes o PDF"); return; }
    if (file.size > MAX_BYTES) { setError("El archivo supera los 10 MB"); return; }

    setUploading(true);
    // Imágenes: original achicada + miniatura (lib/imagenesWeb). PDF, tal cual.
    let path, upError;
    if (esImagen) {
      ({ path, error: upError } = await subirImagen(supabase, "adjuntos", `${cursoId}/${Date.now()}`, file, { upsert: true }));
    } else {
      path = `${cursoId}/${Date.now()}.pdf`;
      ({ error: upError } = await supabase.storage.from("adjuntos").upload(path, file, { upsert: true, contentType: file.type }));
    }
    if (upError) {
      setError("Error al subir el archivo: " + upError.message);
    } else {
      // Bucket privado: se guarda el PATH, no una URL. Se firma al mostrar.
      onChange([...adjuntos, {
        url: path,
        tipo: esPdf ? "pdf" : "imagen",
        nombre: sanitize(file.name).slice(0, 80) || (esPdf ? "documento.pdf" : "imagen"),
      }]);
    }
    setUploading(false);
  };

  const quitar = (i) => { setError(""); onChange(adjuntos.filter((_, ix) => ix !== i)); };

  return (
    <div>
      {adjuntos.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
          {adjuntos.map((a, i) => (
            <div key={i} style={{position:"relative",display:"flex",alignItems:"center",gap:6,
              border:"1.5px solid #E2E8F0",borderRadius:10,background:T.bg,
              padding:a.tipo === "imagen" ? 3 : "8px 30px 8px 10px",maxWidth:"100%"}}>
              {a.tipo === "imagen" ? (
                <SignedImg src={a.url} bucket="adjuntos" alt={a.nombre} miniatura style={{width:52,height:52,objectFit:"cover",borderRadius:8,display:"block"}}/>
              ) : (
                <>
                  <span style={{fontSize:16,flexShrink:0}}>📄</span>
                  <span style={{fontSize:11,fontWeight:600,color:T.muted,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nombre}</span>
                </>
              )}
              <button onClick={() => quitar(i)} aria-label="Quitar adjunto"
                style={{position:"absolute",top:a.tipo === "imagen" ? -7 : "50%",right:a.tipo === "imagen" ? -7 : 6,
                  transform:a.tipo === "imagen" ? "none" : "translateY(-50%)",
                  width:20,height:20,borderRadius:10,border:"none",background:T.red,color:"white",
                  cursor:"pointer",fontSize:11,fontWeight:700,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
            </div>
          ))}
        </div>
      )}
      {adjuntos.length < MAX_ADJUNTOS && (
        <>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={handleFile} style={{display:"none"}}/>
          <button onClick={() => inputRef.current?.click()} disabled={subiendo}
            style={{padding:"7px 14px",borderRadius:8,border:"1.5px dashed #CBD5E1",background:"white",
              cursor:subiendo ? "default" : "pointer",fontSize:12,fontWeight:700,color:subiendo ? "#CBD5E1" : T.muted}}>
            {subiendo ? "Subiendo..." : "+ Adjuntar imagen o PDF"}
          </button>
        </>
      )}
      {error && <div style={{fontSize:11,fontWeight:600,color:T.red,marginTop:6}}>{error}</div>}
    </div>
  );
}

// Miniatura de una imagen de Storage privado que se abre en detalle (lightbox)
// al hacer click. La usan AdjuntosList, la invitación de un festejo (bucket
// "eventos") y la foto de Lost&Found.
export function ImagenAmpliable({ src, bucket = "adjuntos", alt = "", style }) {
  const [abierta, setAbierta] = useState(false);
  if (!src) return null;
  return (
    <>
      <SignedImg src={src} bucket={bucket} alt={alt} miniatura
        onClick={(e) => { e.stopPropagation(); setAbierta(true); }}
        style={{...style, cursor:"zoom-in"}}/>
      {abierta && (
        <div onClick={(e) => { e.stopPropagation(); setAbierta(false); }}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:300,display:"flex",
            alignItems:"center",justifyContent:"center",padding:20,cursor:"zoom-out"}}>
          <SignedImg src={src} bucket={bucket} alt={alt} style={{maxWidth:"100%",maxHeight:"90vh",borderRadius:12,objectFit:"contain"}}/>
        </div>
      )}
    </>
  );
}

export function AdjuntosList({ adjuntos }) {
  const items = adjuntos || [];
  if (items.length === 0) return null;
  const abrirPdf = async (e, a) => {
    e.stopPropagation();
    const url = await signStorageUrl(a.url, "adjuntos");
    if (url) window.open(url, "_blank", "noopener");
  };
  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:6}}>
      {items.map((a, i) => a.tipo === "imagen" ? (
        <ImagenAmpliable key={i} src={a.url} bucket="adjuntos" alt={a.nombre || "adjunto"}
          style={{width:56,height:56,objectFit:"cover",borderRadius:10,border:"1px solid #E2E8F0",display:"block"}}/>
      ) : (
        <button key={i} onClick={(e) => abrirPdf(e, a)}
          style={{display:"inline-flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:8,
            border:"1px solid #E2E8F0",background:T.bg,cursor:"pointer",maxWidth:180}}>
          <span style={{fontSize:13,flexShrink:0}}>📄</span>
          <span style={{fontSize:11,fontWeight:700,color:T.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.nombre || "Documento"}</span>
        </button>
      ))}
    </div>
  );
}
