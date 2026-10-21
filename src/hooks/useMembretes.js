// Membretes de los comunicados del colegio (recordatorios.con_membrete): trae
// una vez por sesión los datos de membrete de los colegios que hacen falta y
// devuelve membreteDeAviso(r) → { nombre, logo, linea, firma } | null.
// El colegio y el nivel de cada aviso salen de "Mi acceso" (items[].cursos).
import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { membreteDe } from "../lib/formato";

const cache = new Map(); // colegio_id → fila de colegios

export function useMembretes(recordatorios, items) {
  const [, setVersion] = useState(0);
  const cursoDe = (cid) => (items || []).find((i) => i.curso_id === cid)?.cursos || null;
  const faltan = [...new Set((recordatorios || []).filter((r) => r.con_membrete).map((r) => cursoDe(r.curso_id)?.colegio_id).filter((id) => id && !cache.has(id)))];
  const clave = faltan.sort().join(",");
  useEffect(() => {
    if (!clave) return undefined;
    let vivo = true;
    supabase.from("colegios").select("id, nombre, logo_url, membrete_linea, membrete_firma, membrete_niveles").in("id", clave.split(","))
      .then(({ data }) => {
        (data || []).forEach((c) => cache.set(c.id, c));
        if (vivo) setVersion((v) => v + 1);
      });
    return () => { vivo = false; };
  }, [clave]);
  return (r) => {
    if (!r?.con_membrete) return null;
    const curso = cursoDe(r.curso_id);
    return membreteDe(cache.get(curso?.colegio_id), curso?.nivel);
  };
}
