// <img> para buckets privados de Storage (adjuntos, eventos). Resuelve una URL
// firmada a partir del valor guardado (URL pública vieja o path nuevo) y la
// re-firma si cambia. Ver src/lib/storageUrl.js.

import { useState, useEffect } from "react";
import { signStorageUrl } from "../lib/storageUrl";

export function useSignedUrl(stored, bucket) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let vivo = true;
    if (!stored) { setUrl(""); return; }
    signStorageUrl(stored, bucket).then((u) => { if (vivo) setUrl(u || ""); });
    return () => { vivo = false; };
  }, [stored, bucket]);
  return url;
}

export function SignedImg({ src, bucket, style, alt = "", onClick }) {
  const url = useSignedUrl(src, bucket);
  if (!url) return <div style={{ ...style, background: "#F1F5F9" }} />;
  return <img src={url} alt={alt} style={style} onClick={onClick} />;
}
