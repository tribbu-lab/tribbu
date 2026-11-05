// src/lib/pagosColegio.js — reglas de Pagos al colegio (specs/pagos-colegio.md).
// Puro: lo usan web y app (@shared/pagosColegio).

export const ESTADO_PAGO = {
  pendiente: { l: "Pendiente", c: "#B45309", bg: "#FFFBEB" },
  informado: { l: "Avisó que pagó", c: "#1D4ED8", bg: "#EFF6FF" },
  pagado: { l: "Confirmado", c: "#047857", bg: "#ECFDF5" },
};

/** Monto con separador de miles: "$ 15.000". */
export const montoPago = (p) => `${p?.moneda || "$"} ${Number(p?.monto || 0).toLocaleString("es-AR")}`;

/** Cuántos alumnos hay en cada estado. */
export const resumenPago = (filas) => {
  const r = { pendiente: 0, informado: 0, pagado: 0, total: 0 };
  for (const f of filas || []) {
    if (r[f.estado] !== undefined) r[f.estado] += 1;
    r.total += 1;
  }
  return r;
};

/** "1 confirmado · 2 avisaron · 3 pendientes". */
export const textoResumenPago = (r) =>
  `${r.pagado} ${r.pagado === 1 ? "confirmado" : "confirmados"} · ${r.informado} ${r.informado === 1 ? "avisó" : "avisaron"} · ${r.pendiente} ${r.pendiente === 1 ? "pendiente" : "pendientes"}`;

/** Para Hoy: un pago por fila, con los hijos míos que todavía no avisaron. */
export const pagosPendientesFamilia = (filas, cursoIds) => {
  const porPago = new Map();
  for (const f of filas || []) {
    const p = f.pagos_colegio;
    if (!p?.activo || f.estado !== "pendiente" || !(cursoIds || []).includes(p.curso_id)) continue;
    if (!porPago.has(p.id)) porPago.set(p.id, { ...p, hijos: [] });
    porPago.get(p.id).hijos.push(f.hijo_id);
  }
  return [...porPago.values()];
};

/** Globito del panel: alumnos cuya familia avisó y el colegio todavía no confirmó. */
export async function contarPagosPorConfirmar(supabase) {
  const { count } = await supabase.from("pago_colegio_alumnos").select("hijo_id, pagos_colegio!inner(activo)", { count: "exact", head: true })
    .eq("estado", "informado").eq("pagos_colegio.activo", true);
  return count || 0;
}

/** Globito de la familia: pagos abiertos con algún hijo todavía pendiente. */
export async function contarPagosPendientes(supabase, hijoIds, cursoIds) {
  if (!hijoIds?.length || !cursoIds?.length) return 0;
  const { data } = await supabase.from("pago_colegio_alumnos").select("hijo_id,estado,pagos_colegio(*)").in("hijo_id", hijoIds).eq("estado", "pendiente");
  return pagosPendientesFamilia(data, cursoIds).length;
}

/** Filas para el alta de un pago: todos los alumnos del curso salvo los excluidos. */
export const filasAlumnosDePago = (pagoId, hijosDelCurso, excluidos) =>
  (hijosDelCurso || []).filter((h) => !(excluidos || []).includes(h.id)).map((h) => ({ pago_id: pagoId, hijo_id: h.id }));

/** Valida el formulario de alta. Devuelve el mensaje de error o null. */
export const errorFormularioPago = (form, cursosElegidos) => {
  if (!form?.titulo?.trim()) return "Poné un título.";
  const monto = Number(String(form?.monto ?? "").replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(monto) || monto <= 0) return "Poné un monto mayor a cero.";
  if (!cursosElegidos?.length) return "Elegí al menos un curso.";
  return null;
};

export const montoDeFormulario = (valor) => Number(String(valor ?? "").replace(/\./g, "").replace(",", "."));
