// <Image> para buckets privados de Storage (adjuntos, eventos). Resuelve una
// URL firmada del valor guardado (URL pública vieja o path nuevo).
// Ver mobile/lib/storageUrl.js.

import { useState, useEffect } from "react";
import { Image, View } from "react-native";
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

export function SignedImage({ src, bucket, style, resizeMode = "cover" }) {
  const url = useSignedUrl(src, bucket);
  if (!url) return <View style={[style, { backgroundColor: "#E2E8F0" }]} />;
  return <Image source={{ uri: url }} style={style} resizeMode={resizeMode} />;
}
