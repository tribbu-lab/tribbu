// src/hooks/useAutoresDocentes.js — quién de los autores de una lista es
// docente, para etiquetar lo que publicó ("👩‍🏫 Laura · Inglés"). Una sola
// request por lote de ids nuevos (RPC autores_docentes) y caché de módulo:
// los mismos autores se repiten en Avisos, Muro y Calendario.
import { useEffect, useState } from "react";
import { supabase } from "../supabase";

const cache = new Map(); // usuario_id → {nombre, materias} | null (no es docente)

export function useAutoresDocentes(ids) {
  const clave = [...new Set((ids || []).filter(Boolean))].sort().join(",");
  const [, setVersion] = useState(0);
  useEffect(() => {
    const faltan = clave ? clave.split(",").filter((id) => !cache.has(id)) : [];
    if (!faltan.length) return undefined;
    let vivo = true;
    supabase.rpc("autores_docentes", { p_ids: faltan }).then(({ data }) => {
      for (const id of faltan) cache.set(id, null);
      for (const r of data || []) cache.set(r.usuario_id, { nombre: r.nombre, materias: r.materias });
      if (vivo) setVersion((v) => v + 1);
    });
    return () => { vivo = false; };
  }, [clave]);
  return (id) => (id ? cache.get(id) || null : null);
}
