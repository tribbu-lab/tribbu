// <Image> para buckets privados de Storage (adjuntos, eventos). Resuelve una
// URL firmada del valor guardado (URL pública vieja o path nuevo).
// Ver mobile/lib/storageUrl.js.

import { useState, useEffect } from "react";
import { Image, View } from "react-native";
import { signStorageUrl } from "../lib/storageUrl";

// `miniatura`: pide la versión chica (.thumb.jpg, ver @shared/miniaturas) y
// cae a la original si no existe. Para cualquier imagen mostrada chica.
export function useSignedUrl(stored, bucket, miniatura = false) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let vivo = true;
    if (!stored) { setUrl(""); return; }
    signStorageUrl(stored, bucket, { miniatura }).then((u) => { if (vivo) setUrl(u || ""); });
    return () => { vivo = false; };
  }, [stored, bucket, miniatura]);
  return url;
}

export function SignedImage({ src, bucket, style, resizeMode = "cover", miniatura = false }) {
  const url = useSignedUrl(src, bucket, miniatura);
  if (!url) return <View style={[style, { backgroundColor: "#E2E8F0" }]} />;
  return <Image source={{ uri: url }} style={style} resizeMode={resizeMode} />;
}
