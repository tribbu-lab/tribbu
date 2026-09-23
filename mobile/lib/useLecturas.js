// mobile/lib/useLecturas.js — puerto RN de src/hooks/useLecturas.js.
// Confirmación de lectura de avisos: RPC lecturas_de_recordatorios
// (supabase/lecturas-y-adopcion.sql), que solo devuelve los avisos que el
// usuario puede auditar (autor, Room Parent del curso, colegio).
import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** { [recordatorio_id]: filas[] } para los ids dados. */
export function useLecturas(ids) {
  const [porId, setPorId] = useState({});
  const clave = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    let vivo = true;
    const lista = clave ? clave.split(",") : [];
    if (!lista.length) return;
    supabase.rpc("lecturas_de_recordatorios", { p_ids: lista }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) {
        console.warn("No se pudieron cargar las lecturas:", error.message);
        return;
      }
      const agrupado = {};
      for (const f of data || []) (agrupado[f.recordatorio_id] ||= []).push(f);
      setPorId(agrupado);
    });
    return () => {
      vivo = false;
    };
  }, [clave]);
  return porId;
}
