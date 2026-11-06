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
import { aniosDeCursos, copiarLista, destinosDeCopia, LISTAS } from "../../lib/listasCurso";

const PESTANAS = [{ id: "utiles", label: "Útiles" }, { id: "libros", label: "Libros" }];
const ORDEN_NOMBRE = (a, b) => String(a.nombre).localeCompare(String(b.nombre), "es");
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
  const cursoIds = useMemo(() => (cursoId ? [cursoId] : []), [cursoId]);

  const Lista = tipo === "utiles" ? Utiles : Libros;
  return (
    <div>
      {copiar && curso ? <CopiarModal tipo={tipo} curso={curso} cursos={cursos} showToast={showToast} onClose={() => setCopiar(false)} /> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={ano ?? ""} onChange={(e) => { setAnoElegido(Number(e.target.value)); setCursoId(null); }} aria-label="Ciclo lectivo" style={{ ...SELECT, flex: "0 1 130px" }}>
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={cursoId || ""} onChange={(e) => setCursoId(e.target.value || null)} aria-label="Curso" style={{ ...SELECT, flex: "1 1 220px" }}>
          <option value="">Elegí un curso…</option>
          {delAno.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {curso ? (
          <button onClick={() => setCopiar(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
            <Icono nombre="copiar" size={15} color="#334155" />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Copiar a otros cursos</span>
          </button>
        ) : null}
      </div>
      {!curso ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>Elegí un curso para ver y editar sus listas.</div>
      ) : (
        <>
          <SubSeccion items={PESTANAS} activo={tipo} onIr={setTipo} />
          <Lista key={`${tipo}-${curso.id}`} gestion cursoId={curso.id} cursoIds={cursoIds} cursoNombre={curso.nombre} />
        </>
      )}
    </div>
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
