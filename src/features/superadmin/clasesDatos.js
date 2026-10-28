// Datos de materias y clases (specs/docentes-clases-y-grupos.md, Fase A).
// Separado de clases.jsx para que ese archivo exporte solo componentes.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { fmtNombre } from "../../lib/helpers";
import { COLUMNAS_HORARIO, filasHorario, grillaHorario, diasVisibles } from "../../lib/horarios";

export const PALETA_MATERIAS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#0EA5E9", "#14B8A6", "#6366F1", "#64748B"];

/** Materias del colegio, ordenadas. */
export function useMaterias(colegioId) {
  const [materias, setMaterias] = useState(null);
  const recargar = useCallback(async () => {
    if (!colegioId) { setMaterias([]); return; }
    const { data } = await supabase.from("materias").select("*").eq("colegio_id", colegioId).order("orden").order("nombre");
    setMaterias(data || []);
  }, [colegioId]);
  useEffect(() => { Promise.resolve().then(recargar); }, [recargar]);
  return { materias, recargar };
}

/** Clases de un curso con su materia y maestra, ordenadas por materia. */
export async function cargarClasesCurso(cursoId) {
  const { data } = await supabase.from("clases")
    .select("id,curso_id,materia_id,maestro_id,optativa,materias(id,nombre,color,activo),maestros(id,nombre,apellido,activo)")
    .eq("curso_id", cursoId);
  return (data || []).sort((a, b) => (a.materias?.nombre || "").localeCompare(b.materias?.nombre || "", "es"));
}

/** "Inglés · Laura Fernández" */
export const etiquetaClase = (c) => [c.materias?.nombre, c.maestros ? fmtNombre(c.maestros) : null].filter(Boolean).join(" · ");

const nombreHoja = (s, usados) => {
  const base = String(s || "Curso").replace(/[\\/?*[\]:]/g, "").slice(0, 28) || "Curso";
  let n = base, i = 2;
  while (usados.has(n)) n = `${base.slice(0, 25)} ${i++}`;
  usados.add(n);
  return n;
};

/**
 * Excel del horario de esos cursos: hoja "Horarios" en formato lista (la misma
 * que se puede volver a cargar con ImportarHorarioModal) y una grilla por
 * curso para leer o imprimir.
 */
export async function exportarHorarios(cursos, nombreArchivo = "horarios") {
  const XLSX = await import("xlsx");
  const ids = cursos.map((c) => c.id);
  const { data } = ids.length ? await supabase.from("horarios").select("*").in("curso_id", ids) : { data: [] };
  const hs = data || [];
  const nombre = new Map(cursos.map((c) => [c.id, c.nombre]));
  const wb = XLSX.utils.book_new();
  const lista = XLSX.utils.json_to_sheet(filasHorario(hs, (id) => nombre.get(id)), { header: COLUMNAS_HORARIO });
  lista["!cols"] = [{ wch: 24 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 24 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, lista, "Horarios");
  const usados = new Set(["Horarios"]);
  for (const c of cursos) {
    const delCurso = hs.filter((h) => h.curso_id === c.id);
    if (!delCurso.length) continue;
    const ws = XLSX.utils.json_to_sheet(grillaHorario(delCurso));
    ws["!cols"] = [{ wch: 13 }, ...diasVisibles(delCurso).map(() => ({ wch: 26 }))];
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja(c.nombre, usados));
  }
  XLSX.writeFile(wb, `${nombreArchivo.replace(/[\\/:*?"<>|]/g, "").slice(0, 60) || "horarios"}.xlsx`);
}

/** Clases actuales de una maestra (para abrir el editor). */
export async function cargarClasesMaestro(maestroId) {
  if (!maestroId) return [];
  const { data } = await supabase.from("clases").select("id,curso_id,materia_id").eq("maestro_id", maestroId);
  return data || [];
}

/**
 * Aplica el borrador del editor: inserta las nuevas y borra las quitadas.
 * Solo toca clases de `cursosVisibles` (las de otros años no se pierden).
 */
export async function guardarClasesMaestro(maestroId, borrador, originales, cursosVisibles) {
  const visibles = new Set(cursosVisibles);
  const clave = (v) => `${v.curso_id}|${v.materia_id}`;
  const enBorrador = new Set(borrador.map(clave));
  const enOriginal = new Set(originales.map(clave));
  const quitar = originales.filter((o) => visibles.has(o.curso_id) && !enBorrador.has(clave(o))).map((o) => o.id);
  const agregar = borrador.filter((b) => !enOriginal.has(clave(b))).map((b) => ({ maestro_id: maestroId, curso_id: b.curso_id, materia_id: b.materia_id }));
  const [del, ins] = await Promise.all([
    quitar.length ? supabase.from("clases").delete().in("id", quitar) : { error: null },
    agregar.length ? supabase.from("clases").insert(agregar) : { error: null },
  ]);
  return del.error || ins.error || null;
}
