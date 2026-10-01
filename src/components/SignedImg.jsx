// <img> para buckets privados de Storage (adjuntos, eventos). Resuelve una URL
// firmada a partir del valor guardado (URL pública vieja o path nuevo) y la
// re-firma si cambia. Ver src/lib/storageUrl.js.

import { useState, useEffect } from "react";
import { signStorageUrl } from "../lib/storageUrl";

// `miniatura`: pide la versión chica (.thumb.jpg, ver lib/miniaturas) y cae a
// la original si no existe. Para cualquier imagen mostrada chica.
export function useSignedUrl(stored, bucket, miniatura = false) {
  // La URL firmada se guarda junto con la clave (bucket + path) que la originó:
  // si cambia `stored`, la URL vieja deja de corresponder y no se muestra
  // mientras se firma la nueva.
  const clave = stored ? `${bucket}:${stored}:${miniatura ? "m" : "o"}` : null;
  const [firmada, setFirmada] = useState({ clave: null, url: "" });
  useEffect(() => {
    if (!stored) return;
    let vivo = true;
    signStorageUrl(stored, bucket, { miniatura }).then((u) => { if (vivo) setFirmada({ clave: `${bucket}:${stored}:${miniatura ? "m" : "o"}`, url: u || "" }); });
    return () => { vivo = false; };
  }, [stored, bucket, miniatura]);
  return firmada.clave === clave ? firmada.url : "";
}

export function SignedImg({ src, bucket, style, alt = "", onClick, miniatura = false }) {
  const url = useSignedUrl(src, bucket, miniatura);
  if (!url) return <div style={{ ...style, background: "#F1F5F9" }} />;
  return <img src={url} alt={alt} style={style} onClick={onClick} />;
}
