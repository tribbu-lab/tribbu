// Útiles y libros en el panel del colegio (web; mobile en
// mobile/features/superadmin/listas.jsx): elegís ciclo lectivo y curso, y se
// edita con las mismas pantallas que ven las familias (features/info, modo
// `gestion`). Copiar evita volver a tipear la lista en 3°A, 3°B, 3°C…
import { useMemo, useState } from "react";
import { supabase } from "../../supabase";
import { Card } from "../../components/Card";
import { CursoListSelector } from "../../components/CursoListSelector";
import { SubSeccion } from "../../components/SubSeccion";
import { Icono } from "../../components/Icono";
import { Libros, Utiles } from "../info";
import { Modal } from "./importar";
import { aniosDeCursos, aplicarLista, COLUMNAS_LISTA, copiarLista, destinosDeCopia, existentesDeLista, filasModeloLista, hayParaCargar, leerLista, LISTAS, resumenLectura, textoCargado } from "../../lib/listasCurso";

const PESTANAS = [{ id: "utiles", label: "Útiles" }, { id: "libros", label: "Libros" }];
const ORDEN_NOMBRE = (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es");
const BTN = { display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" };
const SELECT = { padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 600, background: "white", color: "#0F172A", fontFamily: "inherit" };

export function ListasAdmin({ cursos, anoActual, showToast }) {
  const anios = aniosDeCursos(cursos);
  const [anoElegido, setAnoElegido] = useState(null);
  const ano = anoElegido ?? (anios.includes(anoActual) ? anoActual : anios[0]);
  const delAno = cursos.filter((c) => c.año_lectivo === ano).sort(ORDEN_NOMBRE);
  const [cursoId, setCursoId] = useState(null);
  const curso = delAno.find((c) => c.id === cursoId) || null;
  const [tipo, setTipo] = useState("utiles");
  const [copiar, setCopiar] = useState(false);
  const [excel, setExcel] = useState(false);
  const [version, setVersion] = useState(0); // recarga la lista después de subir un Excel
  const cursoIds = useMemo(() => (cursoId ? [cursoId] : []), [cursoId]);

  const Lista = tipo === "utiles" ? Utiles : Libros;
  return (
    <div>
      {copiar && curso ? <CopiarModal tipo={tipo} curso={curso} cursos={cursos} showToast={showToast} onClose={() => setCopiar(false)} /> : null}
      {excel ? (
        <CargarExcelModal tipo={tipo} ano={ano} cursos={delAno} cursoActual={curso} onClose={() => setExcel(false)}
          onHecho={(m) => { setExcel(false); setVersion((n) => n + 1); showToast?.(m, "success"); }} />
      ) : null}
      <SubSeccion items={PESTANAS} activo={tipo} onIr={setTipo} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={ano ?? ""} onChange={(e) => { setAnoElegido(Number(e.target.value)); setCursoId(null); }} aria-label="Ciclo lectivo" style={{ ...SELECT, flex: "0 1 130px" }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={cursoId || ""} onChange={(e) => setCursoId(e.target.value || null)} aria-label="Curso" style={{ ...SELECT, flex: "1 1 220px" }}>
          <option value="">Elegí un curso…</option>
          {delAno.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <button onClick={() => setExcel(true)} disabled={!delAno.length} style={BTN}>Cargar desde Excel</button>
        {curso ? (
          <button onClick={() => setCopiar(true)} style={BTN}>
            <Icono nombre="copiar" size={15} color="#334155" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Copiar a otros cursos</span>
          </button>
        ) : null}
      </div>
      {!curso ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>Elegí un curso para ver y editar sus listas, o cargá muchos cursos de una vez desde Excel.</div>
      ) : (
        <Lista key={`${tipo}-${curso.id}-${version}`} gestion cursoId={curso.id} cursoIds={cursoIds} cursoNombre={curso.nombre} />
      )}
    </div>
  );
}

function CargarExcelModal({ tipo, ano, cursos, cursoActual, onClose, onHecho }) {
  const [leido, setLeido] = useState(null); // { archivo, nuevos, actualizar, sobran, sinCambios, errores, cursoIds }
  const [borrar, setBorrar] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");
  const nombreLista = tipo === "utiles" ? "útiles" : "libros";
  const ids = cursos.map((c) => c.id);

  const descargarModelo = async () => {
    setError("");
    try {
      const XLSX = await import("xlsx");
      const filas = filasModeloLista(tipo, await existentesDeLista(supabase, tipo, ids), cursos);
      const ws = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS_LISTA[tipo] });
      ws["!cols"] = COLUMNAS_LISTA[tipo].map((c) => ({ wch: c === "Curso" ? 16 : 26 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, nombreLista);
      XLSX.writeFile(wb, `${nombreLista} ${ano}.xlsx`);
    } catch (err) {
      setError(`No se pudo armar el modelo: ${err.message}`);
    }
  };

  const elegir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setTrabajando("Leyendo el archivo…"); setError(""); setLeido(null); setBorrar(false);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
      const existentes = await existentesDeLista(supabase, tipo, ids);
      setLeido({ archivo: file.name, ...leerLista(tipo, filas, { cursos, existentes, cursoPorDefecto: cursoActual?.id || null }) });
    } catch (err) {
      setError(`No se pudo leer el archivo: ${err.message}`);
    }
    setTrabajando("");
  };

  const cargar = async () => {
    setTrabajando("Cargando…"); setError("");
    const e = await aplicarLista(supabase, tipo, leido, { borrarSobrantes: borrar });
    setTrabajando("");
    if (e) { setError(`No se pudo cargar: ${e.message}`); return; }
    onHecho(`Listo: ${textoCargado(leido, borrar)}.`);
  };

  const puede = hayParaCargar(leido, borrar) && !trabajando;
  const resumen = leido ? resumenLectura(leido) : "";
  const nombresCursos = leido ? leido.cursoIds.map((id) => cursos.find((c) => c.id === id)?.nombre).join(", ") : "";
  return (
    <Modal titulo={`Cargar ${nombreLista} desde Excel`} subtitulo={`Cursos del ciclo lectivo ${ano}.`} onClose={onClose}
      pie={<>
        <button onClick={onClose} style={BTN}>Cancelar</button>
        <button onClick={cargar} disabled={!puede} style={{ ...BTN, border: "none", background: "#2563EB", color: "white", opacity: puede ? 1 : 0.5 }}>{trabajando === "Cargando…" ? "Cargando…" : "Cargar"}</button>
      </>}>
      <ol style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
        <li style={{ color: "#334155" }}>Descargá el modelo: trae lo que ya está cargado o, si no hay nada, un ejemplo (<b style={{ color: "#334155" }}>{COLUMNAS_LISTA[tipo].join(", ")}</b>).{" "}
          <button type="button" onClick={descargarModelo} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: "#2563EB", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>Descargar modelo</button>
        </li>
        <li style={{ color: "#334155" }}>Completalo en Excel, una fila por ítem. El curso tiene que estar escrito como en tribbu{cursoActual ? `; si lo dejás vacío, va a ${cursoActual.nombre}` : ""}.</li>
        <li style={{ color: "#334155" }}>Subilo acá, revisá y cargá. Lo que tiene el mismo nombre se actualiza y las familias no pierden sus marcas.</li>
      </ol>
      <label style={{ ...BTN, cursor: "pointer" }}>
        {leido ? "Elegir otro archivo" : "Elegir archivo"}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={elegir} style={{ display: "none" }} />
      </label>
      {trabajando && trabajando !== "Cargando…" ? <div style={{ marginTop: 10, fontSize: 12.5, color: "#64748B" }}>{trabajando}</div> : null}
      {leido ? (
        <div style={{ marginTop: 14, fontSize: 13, color: "#334155", lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: "#0F172A" }}>{leido.archivo}</div>
          {resumen ? <div style={{ marginTop: 4, color: "#334155" }}><b style={{ color: "#334155" }}>{resumen}</b>{nombresCursos ? ` en ${nombresCursos}` : ""}.</div> : <div style={{ marginTop: 4, color: "#DC2626" }}>No encontramos nada para cargar.</div>}
          {leido.errores.length ? (
            <div style={{ marginTop: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontWeight: 700, color: "#92400E" }}>{leido.errores.length} {leido.errores.length === 1 ? "fila no se va a cargar" : "filas no se van a cargar"}:</div>
              {leido.errores.slice(0, 12).map((x) => <div key={x.fila} style={{ fontSize: 12.5, color: "#92400E" }}>Fila {x.fila}: {x.motivo}</div>)}
              {leido.errores.length > 12 ? <div style={{ fontSize: 12.5, color: "#92400E" }}>…y {leido.errores.length - 12} más.</div> : null}
            </div>
          ) : null}
          {leido.sobran.length ? (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={borrar} onChange={(e) => setBorrar(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 13, color: "#334155" }}>Borrar {leido.sobran.length === 1 ? "el ítem" : `los ${leido.sobran.length} ítems`} de esos cursos que no {leido.sobran.length === 1 ? "está" : "están"} en el archivo. Las familias que {leido.sobran.length === 1 ? "lo" : "los"} habían marcado pierden esa marca.</span>
            </label>
          ) : null}
        </div>
      ) : null}
      {error ? <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "#DC2626" }}>{error}</div> : null}
    </Modal>
  );
}

function CopiarModal({ tipo, curso, cursos, showToast, onClose }) {
  const [sel, setSel] = useState([]);
  const [copiando, setCopiando] = useState(false);
  const destinos = destinosDeCopia(cursos, curso);
  const nombreLista = LISTAS[tipo].tabla === "utiles" ? "útiles" : "libros";
  const toggle = (id) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const copiar = async () => {
    if (!sel.length || copiando) return;
    setCopiando(true);
    const { agregados, error } = await copiarLista(supabase, tipo, curso.id, sel);
    setCopiando(false);
    if (error) { showToast?.(`No se pudo copiar la lista: ${error.message}`, "error"); return; }
    showToast?.(agregados ? `Listo: ${agregados} ${agregados === 1 ? "ítem copiado" : "ítems copiados"}.` : "Esos cursos ya tenían todo lo de esta lista.", "success");
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Card style={{ padding: 24, width: "100%", maxWidth: 440 }}>
        <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6, color: "#0F172A" }}>Copiar los {nombreLista} de {curso.nombre}</div>
        <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 12, lineHeight: 1.4 }}>Se suman a los cursos que elijas, incluso los del año que viene. Lo que un curso ya tiene no se repite.</div>
        <CursoListSelector cursos={destinos} seleccionados={sel} onToggle={toggle} />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#64748B", fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={copiar} disabled={!sel.length || copiando} style={{ flex: 2, padding: 11, borderRadius: 10, border: "none", background: "#2563EB", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", opacity: !sel.length || copiando ? 0.6 : 1 }}>{copiando ? "Copiando…" : "Copiar"}</button>
        </div>
      </Card>
    </div>
  );
}
