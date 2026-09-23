// src/hooks/useLecturas.js — datos de confirmación de lectura (ver
// src/components/Lecturas.jsx y supabase/lecturas-y-adopcion.sql).
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

/** Carga las lecturas de varios avisos a la vez: { [recordatorio_id]: filas[] } */
export function useLecturas(ids) {
  const [porId, setPorId] = useState({});
  const clave = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    let vivo = true;
    const lista = clave ? clave.split(",") : [];
    if (!lista.length) return;
    supabase.rpc("lecturas_de_recordatorios", { p_ids: lista }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) { console.warn("No se pudieron cargar las lecturas:", error.message); return; }
      const agrupado = {};
      for (const f of data || []) (agrupado[f.recordatorio_id] ||= []).push(f);
      setPorId(agrupado);
    });
    return () => { vivo = false; };
  }, [clave]);
  return porId;
}

/** Resumen de una o varias listas de lecturas (varias = comunicación a varios cursos). */
export const resumenLecturas = (filas) => ({
  total: filas.length,
  leyeron: filas.filter((f) => f.leido_en).length,
});
