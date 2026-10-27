// Filtros de las bandejas del panel del colegio (Mensajes de familias,
// Soporte, Denuncias). Puro: lo usan web y app con <BotonFiltros>/<FiltrosModal|
// FiltrosSheet>. Cada `filtrosX` arma los grupos (sin onChange, que pone cada
// plataforma con `conCambio`) y cada `filtrarX` aplica los valores elegidos.

const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const conCuenta = (label, n) => (n ? `${label} · ${n}` : label);

// grupos = [{ key, label, options, defecto }] + valores {key: valor} + set(key, valor)
// → los grupos que esperan los componentes de Filtros.
export const conCambio = (grupos, valores, set) =>
  grupos.map((g) => ({ ...g, value: valores[g.key] ?? g.defecto ?? g.options[0].value, onChange: (v) => set(g.key, v) }));

export const valoresPorDefecto = (grupos) => Object.fromEntries(grupos.map((g) => [g.key, g.defecto ?? g.options[0].value]));

// ── Mensajes de familias (RPC bandeja_colegio) ──────────────────────────────
// Por defecto muestra lo que espera respuesta de Secretaría, como antes.

export function filtrosBandejaColegio(hilos) {
  const lista = hilos || [];
  const sinResponder = lista.filter((h) => h.sin_responder).length;
  const cursos = [...new Set(lista.map((h) => h.curso).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return [
    { key: "estado", label: "Estado", defecto: "sin_responder", options: [{ value: "sin_responder", label: conCuenta("Sin responder", sinResponder) }, { value: "all", label: "Todas" }] },
    { key: "tipo", label: "Conversación", options: [{ value: "all", label: "Todas" }, { value: "colegio", label: "Con Secretaría" }, { value: "docente", label: "Con maestras" }] },
    ...(cursos.length > 1 ? [{ key: "curso", label: "Curso", options: [{ value: "all", label: "Todos" }, ...cursos.map((c) => ({ value: c, label: c }))] }] : []),
  ];
}

export function filtrarBandejaColegio(hilos, { estado = "sin_responder", tipo = "all", curso = "all" } = {}, q = "") {
  const t = sinAcentos(q);
  return (hilos || []).filter((h) => {
    if (estado === "sin_responder" && !h.sin_responder) return false;
    if (tipo !== "all" && h.tipo !== tipo) return false;
    if (curso !== "all" && h.curso !== curso) return false;
    if (t && !sinAcentos(`${h.alumno} ${h.curso} ${h.docente || ""}`).includes(t)) return false;
    return true;
  });
}

// ── Soporte (RPC bandeja_soporte, solo super) ───────────────────────────────

export function filtrosBandejaSoporte(hilos) {
  const sinResponder = (hilos || []).filter((h) => h.sin_responder && h.estado !== "resuelta").length;
  return [
    { key: "estado", label: "Estado", defecto: "sin_responder", options: [
      { value: "sin_responder", label: conCuenta("Sin responder", sinResponder) },
      { value: "abiertos", label: "Abiertas" }, { value: "resueltos", label: "Resueltas" }, { value: "all", label: "Todas" },
    ] },
  ];
}

export function filtrarBandejaSoporte(hilos, { estado = "sin_responder" } = {}, q = "") {
  const t = sinAcentos(q);
  return (hilos || []).filter((h) => {
    if (estado === "sin_responder" && !(h.sin_responder && h.estado !== "resuelta")) return false;
    if (estado === "abiertos" && h.estado !== "abierta") return false;
    if (estado === "resueltos" && h.estado !== "resuelta") return false;
    if (t && !sinAcentos(`${h.nombre} ${h.email} ${h.colegio || ""}`).includes(t)) return false;
    return true;
  });
}

// ── Denuncias de Mensajes ───────────────────────────────────────────────────

export function filtrosDenuncias(denuncias) {
  const pendientes = (denuncias || []).filter((d) => d.estado === "pendiente").length;
  return [
    { key: "estado", label: "Estado", defecto: "pendiente", options: [
      { value: "pendiente", label: conCuenta("Pendientes", pendientes) }, { value: "resuelta", label: "Resueltas" }, { value: "all", label: "Todas" },
    ] },
  ];
}

export function filtrarDenuncias(denuncias, { estado = "pendiente" } = {}) {
  return (denuncias || []).filter((d) => estado === "all" || d.estado === estado);
}
