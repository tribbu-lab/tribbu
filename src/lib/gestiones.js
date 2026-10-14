// Contadores de "Gestiones" de la pantalla Colegio (web + mobile, @shared/gestiones):
// cuántas autorizaciones, colectas y encuestas esperan algo de esta familia.
// Puro: cada pantalla hace sus consultas (dos lotes) y pasa las filas.
import { colectasActivas, colectasPendientes, encuestasAbiertas } from "./muro";
import { autorizacionesPendientes } from "./autorizaciones";

/**
 * Carga y cuenta en dos lotes en paralelo (recibe el cliente, como
 * cargarReclamados en @shared/perdidos). misHijos = [{ id, curso_id }].
 */
export async function cargarGestiones(supabase, { cursoIds = [], misHijos = [], userId, hoy }) {
  if (!cursoIds.length || !misHijos.length) return { autorizaciones: 0, colectas: 0, encuestas: 0 };
  const hijosIds = misHijos.map((h) => h.id);
  const [auts, cols, encs] = await Promise.all([
    supabase.from("autorizaciones").select("id,curso_id,fecha_limite").in("curso_id", cursoIds),
    supabase.from("colectas").select("id,curso_id,activa,vencimiento").in("curso_id", cursoIds).eq("activa", true),
    supabase.from("encuestas").select("*").in("curso_id", cursoIds),
  ]);
  const autorizaciones = auts.data || [], colectas = cols.data || [], encuestas = encs.data || [];
  const vacio = Promise.resolve({ data: [] });
  const [resp, pags, vots] = await Promise.all([
    autorizaciones.length ? supabase.from("autorizacion_respuestas").select("autorizacion_id,hijo_id").in("autorizacion_id", autorizaciones.map((a) => a.id)).in("hijo_id", hijosIds) : vacio,
    colectas.length ? supabase.from("colecta_pagos").select("colecta_id,alumno_id,estado").in("colecta_id", colectas.map((c) => c.id)).in("alumno_id", hijosIds) : vacio,
    userId && encuestas.length ? supabase.from("encuesta_votos").select("encuesta_id").eq("usuario_id", userId).in("encuesta_id", encuestas.map((e) => e.id)) : vacio,
  ]);
  return contarGestiones({ autorizaciones, respuestas: resp.data || [], colectas, pagos: pags.data || [], encuestas, votos: vots.data || [], misHijos, hoy });
}

/**
 * misHijos =[{ id, curso_id }] (los items "hijo" de Mi acceso, filtrados a
 * los cursos en vista). Sin hijos (docente) todo da 0.
 */
export function contarGestiones({ autorizaciones = [], respuestas = [], colectas = [], pagos = [], encuestas = [], votos = [], misHijos = [], hoy }) {
  if (!misHijos.length) return { autorizaciones: 0, colectas: 0, encuestas: 0 };
  const porCurso = new Map();
  for (const h of misHijos) porCurso.set(h.curso_id, [...(porCurso.get(h.curso_id) || []), h.id]);
  const votadas = new Set(votos.map((v) => v.encuesta_id));
  return {
    autorizaciones: autorizacionesPendientes(autorizaciones, misHijos, respuestas, hoy).length,
    colectas: colectasPendientes(colectasActivas(colectas, "9999-12-31"), pagos, porCurso).length,
    encuestas: encuestasAbiertas(encuestas, hoy).filter((e) => !votadas.has(e.id)).length,
  };
}
