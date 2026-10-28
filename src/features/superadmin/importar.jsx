// Configuración → Importar datos (web): las cargas masivas en un solo lugar,
// todas con el mismo método (modelo, vista previa con errores, cargar).
//   · Alumnos y familias: una fila por alumno con hasta dos apoderados; crea o
//     actualiza alumnos, crea las cuentas que faltan y las vincula
//     (@shared/importarFamilias). Nunca borra.
//   · Horarios: ImportarHorarioModal (./horarios).
//   · Menú: lleva a Configuración → Menú (su carga mensual).
import { useState } from "react";
import { supabase } from "../../supabase";
import { authAdminCreate } from "../../lib/authAdmin";
import { fmtNombre } from "../../lib/helpers";
import { COLUMNAS_FAMILIAS, leerFamilias } from "../../lib/importarFamilias";
import { Icono } from "../../components/Icono";
import { ImportarHorarioModal } from "./horarios";

const COLORES = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
const btnPri = { padding: "9px 16px", borderRadius: 10, border: "none", background: "#2563EB", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" };
const btnSec = { padding: "8px 13px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 12.5, color: "#334155", fontWeight: 700, fontFamily: "inherit" };
const link = { border: "none", background: "none", padding: 0, cursor: "pointer", color: "#2563EB", fontWeight: 700, fontSize: 13, fontFamily: "inherit" };

// Contraseña al azar para las cuentas nuevas: la familia entra con "¿Olvidaste tu contraseña?".
function claveAlAzar() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const n = crypto.getRandomValues(new Uint32Array(18));
  return Array.from(n, (x) => abc[x % abc.length]).join("");
}

// Modelo = lo que ya hay (un alumno por fila con sus apoderados), para completar o corregir.
async function descargarModelo(cursos, hijos, usuarios) {
  const XLSX = await import("xlsx");
  const nombreCurso = new Map(cursos.map((c) => [c.id, c.nombre]));
  const apoderadosDe = (hid) => usuarios.filter((u) => (u.hijos || []).includes(hid) && u.email);
  const filas = hijos.filter((h) => nombreCurso.has(h.curso_id))
    .sort((a, b) => nombreCurso.get(a.curso_id).localeCompare(nombreCurso.get(b.curso_id), "es") || fmtNombre(a).localeCompare(fmtNombre(b), "es"))
    .map((h) => {
      const [a1, a2] = apoderadosDe(h.id);
      return {
        Curso: nombreCurso.get(h.curso_id), Nombre: h.nombre || "", Apellido: h.apellido || "", DNI: h.dni || "",
        Nacimiento: h.fecha_nacimiento ? h.fecha_nacimiento.split("-").reverse().join("/") : "",
        "Apoderado 1": a1 ? fmtNombre(a1) : "", "Email 1": a1?.email || "", "Apoderado 2": a2 ? fmtNombre(a2) : "", "Email 2": a2?.email || "",
      };
    });
  const ws = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS_FAMILIAS });
  ws["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 26 }, { wch: 22 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Alumnos y familias");
  XLSX.writeFile(wb, "alumnos y familias.xlsx");
}

function Modal({ titulo, subtitulo, onClose, children, pie }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, width: "100%", maxWidth: 580, maxHeight: "90vh", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
        <div style={{ padding: "18px 20px 8px" }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{titulo}</div>
          {subtitulo ? <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 3 }}>{subtitulo}</div> : null}
        </div>
        <div style={{ padding: "8px 20px", overflowY: "auto", flex: 1 }}>{children}</div>
        <div style={{ padding: "12px 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>{pie}</div>
      </div>
    </div>
  );
}

function ImportarFamiliasModal({ cursos, hijos, usuarios, onClose, onHecho }) {
  const [leido, setLeido] = useState(null);
  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");

  const elegir = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(""); setLeido(null); setTrabajando("Leyendo el archivo…");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      const vinculos = usuarios.flatMap((u) => (u.hijos || []).map((hijo_id) => ({ usuario_id: u.id, hijo_id })));
      setLeido({ archivo: file.name, ...leerFamilias(filas, { cursos, alumnos: hijos, usuarios, vinculos }) });
    } catch (err) {
      setError(`No se pudo leer el archivo: ${err.message}`);
    }
    setTrabajando("");
  };

  const cargar = async () => {
    setError("");
    const idDe = new Map(); // ref de alumno nuevo → id
    const avisos = [];
    // 1) Alumnos nuevos (en orden: PostgREST devuelve las filas como se insertaron)
    if (leido.alumnosNuevos.length) {
      setTrabajando("Creando alumnos…");
      const filas = leido.alumnosNuevos.map((a) => ({
        nombre: a.nombre, apellido: a.apellido, curso_id: a.curso_id, dni: a.dni, fecha_nacimiento: a.fecha_nacimiento,
        avatar: `${a.nombre[0] || ""}${a.apellido?.[0] || ""}`.toUpperCase(), color: COLORES[a.fila % COLORES.length],
      }));
      const { data, error: e } = await supabase.from("hijos").insert(filas).select("id");
      if (e) { setTrabajando(""); setError(`No se pudieron crear los alumnos: ${e.message}`); return; }
      leido.alumnosNuevos.forEach((a, i) => idDe.set(a.ref, data[i]?.id));
    }
    // 2) Alumnos que ya estaban (DNI, nacimiento, curso)
    for (let i = 0; i < leido.alumnosActualizar.length; i += 20) {
      setTrabajando(`Actualizando alumnos… ${i} de ${leido.alumnosActualizar.length}`);
      const res = await Promise.all(leido.alumnosActualizar.slice(i, i + 20).map((a) => supabase.from("hijos").update(a.cambios).eq("id", a.id)));
      res.forEach((r, j) => { if (r.error) avisos.push(`Fila ${leido.alumnosActualizar[i + j].fila}: no se pudo actualizar (${r.error.message})`); });
    }
    // 3) Cuentas nuevas: Auth (contraseña al azar) + fila en usuarios
    const usuarioDe = new Map(usuarios.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u.id]));
    for (const [n, c] of leido.cuentasNuevas.entries()) {
      setTrabajando(`Creando cuentas… ${n + 1} de ${leido.cuentasNuevas.length}`);
      let auth_id = null;
      try { auth_id = (await authAdminCreate(c.email, claveAlAzar())).auth_id || null; }
      catch (err) { avisos.push(`${c.email}: no se pudo crear la cuenta para entrar (${err.message})`); }
      const { data, error: e } = await supabase.from("usuarios").insert({
        nombre: c.nombre, apellido: c.apellido, email: c.email, rol: "padre", activo: true, auth_id,
        avatar: `${c.nombre[0] || ""}${c.apellido?.[0] || ""}`.toUpperCase(),
      }).select("id").single();
      if (e) { avisos.push(`${c.email}: ${/duplicate|unique/i.test(e.message) ? "ya tiene una cuenta que no es de este colegio" : e.message}`); continue; }
      usuarioDe.set(c.email, data.id);
    }
    // 4) Vínculos apoderado ↔ alumno
    setTrabajando("Vinculando familias…");
    const links = leido.vinculos.map((v) => ({ usuario_id: usuarioDe.get(v.email), hijo_id: idDe.get(v.alumno) || v.alumno }))
      .filter((v) => v.usuario_id && v.hijo_id && !String(v.hijo_id).startsWith("nuevo:"));
    if (links.length) {
      const { error: e } = await supabase.from("usuario_hijos").insert(links);
      if (e) avisos.push(`No se pudieron vincular algunas familias: ${e.message}`);
    }
    setTrabajando("");
    onHecho({
      texto: `✓ ${leido.alumnosNuevos.length} alumnos nuevos, ${leido.alumnosActualizar.length} actualizados, ${leido.cuentasNuevas.length} cuentas y ${links.length} vínculos.`,
      avisos,
    });
  };

  const total = leido ? leido.alumnosNuevos.length + leido.alumnosActualizar.length + leido.cuentasNuevas.length + leido.vinculos.length : 0;
  return (
    <Modal titulo="Cargar alumnos y familias" subtitulo="Una fila por alumno, con hasta dos apoderados." onClose={trabajando ? () => {} : onClose}
      pie={<>
        <button onClick={onClose} disabled={!!trabajando} style={btnSec}>Cancelar</button>
        <button onClick={cargar} disabled={!total || !!trabajando} style={{ ...btnPri, opacity: total && !trabajando ? 1 : 0.5 }}>{trabajando && leido ? "Cargando…" : "Cargar"}</button>
      </>}>
      <ol style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        <li style={{ color: "#334155" }}>Descargá el modelo: tiene los alumnos que ya están, con sus apoderados (<b style={{ color: "#334155" }}>{COLUMNAS_FAMILIAS.join(", ")}</b>).{" "}
          <button type="button" onClick={() => descargarModelo(cursos, hijos, usuarios)} style={link}>Descargar modelo</button>
        </li>
        <li style={{ color: "#334155" }}>Sumá o corregí filas. El curso tiene que estar escrito como en tribbu; la fecha, como 25/03/2018. Los hermanos van en filas separadas con el mismo email.</li>
        <li style={{ color: "#334155" }}>Subilo acá, revisá y cargá. No se borra nada: lo que no está en el archivo queda como está.</li>
      </ol>
      <label style={{ ...btnSec, display: "inline-block" }}>
        {leido ? "Elegir otro archivo" : "Elegir archivo"}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={elegir} style={{ display: "none" }} disabled={!!trabajando} />
      </label>
      {trabajando ? <div style={{ marginTop: 10, fontSize: 12.5, color: "#64748B" }}>{trabajando}</div> : null}
      {leido ? (
        <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, color: "#0F172A" }}>{leido.archivo}</div>
          {total ? (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {leido.alumnosNuevos.length ? <li style={{ color: "#334155" }}><b style={{ color: "#334155" }}>{leido.alumnosNuevos.length}</b> alumnos nuevos</li> : null}
              {leido.alumnosActualizar.length ? <li style={{ color: "#334155" }}><b style={{ color: "#334155" }}>{leido.alumnosActualizar.length}</b> alumnos que ya estaban se actualizan (DNI, nacimiento o curso)</li> : null}
              {leido.cuentasNuevas.length ? <li style={{ color: "#334155" }}><b style={{ color: "#334155" }}>{leido.cuentasNuevas.length}</b> cuentas de apoderados nuevas (entran con “¿Olvidaste tu contraseña?” y su email)</li> : null}
              {leido.vinculos.length ? <li style={{ color: "#334155" }}><b style={{ color: "#334155" }}>{leido.vinculos.length}</b> apoderados quedan vinculados con sus hijos</li> : null}
            </ul>
          ) : <div style={{ color: "#64748B", marginTop: 4 }}>No hay nada nuevo para cargar: todo lo del archivo ya está en tribbu.</div>}
          {leido.errores.length ? (
            <div style={{ marginTop: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontWeight: 700, color: "#92400E" }}>{leido.errores.length} {leido.errores.length === 1 ? "fila no se va a cargar" : "filas no se van a cargar"}:</div>
              {leido.errores.slice(0, 12).map((x) => <div key={x.fila} style={{ fontSize: 12.5, color: "#92400E" }}>Fila {x.fila}: {x.motivo}</div>)}
              {leido.errores.length > 12 ? <div style={{ fontSize: 12.5, color: "#92400E" }}>…y {leido.errores.length - 12} más.</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <div role="alert" style={{ marginTop: 10, fontSize: 13, color: "#DC2626" }}>{error}</div> : null}
    </Modal>
  );
}

/** Página Configuración → Importar datos. */
export function ImportarDatos({ cursos = [], hijos = [], usuarios = [], colegioId, puedeMenu = false, onIr, onCambio, showToast }) {
  const [abierto, setAbierto] = useState(null); // "familias" | "horarios"
  const [resultado, setResultado] = useState(null); // { texto, avisos }
  const opciones = [
    { id: "familias", titulo: "Alumnos y familias", desc: "Alumnos por curso con sus apoderados: crea las cuentas que faltan y las vincula.", icono: "usuarios" },
    { id: "horarios", titulo: "Horarios", desc: "El horario semanal de todos los cursos: Curso, Día, Desde, Hasta, Materia y Maestra.", icono: "reloj" },
    puedeMenu ? { id: "menu", titulo: "Menú del comedor", desc: "El menú del mes desde el Excel del comedor.", icono: "cubiertos" } : null,
  ].filter(Boolean);
  return (
    <div style={{ maxWidth: 760 }}>
      {resultado ? (
        <div role="status" style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 12, background: resultado.avisos.length ? "#FFFBEB" : "#F0FDF4", border: `1px solid ${resultado.avisos.length ? "#FDE68A" : "#BBF7D0"}` }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "#065F46" }}>{resultado.texto}</div>
          {resultado.avisos.slice(0, 10).map((a) => <div key={a} style={{ fontSize: 12.5, color: "#92400E", marginTop: 2 }}>{a}</div>)}
          {resultado.avisos.length > 10 ? <div style={{ fontSize: 12.5, color: "#92400E" }}>…y {resultado.avisos.length - 10} más.</div> : null}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 10 }}>
        {opciones.map((o) => (
          <button key={o.id} onClick={() => (o.id === "menu" ? onIr("menu") : setAbierto(o.id))} style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 14, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono nombre={o.icono} size={19} color="#475569" /></span>
            <span style={{ flex: 1, minWidth: 0, display: "block" }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{o.titulo}</span>
              <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{o.desc}</span>
            </span>
            <Icono nombre="flecha" size={16} color="#94A3B8" />
          </button>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 14, lineHeight: 1.5 }}>
        Todas funcionan igual: descargás el modelo con lo que ya hay, lo completás en Excel, lo subís y antes de cargar ves qué entra y qué filas tienen algún problema.
      </div>
      {abierto === "familias" ? (
        <ImportarFamiliasModal cursos={cursos} hijos={hijos} usuarios={usuarios} onClose={() => setAbierto(null)}
          onHecho={(r) => { setAbierto(null); setResultado(r); onCambio?.(); }} />
      ) : null}
      {abierto === "horarios" ? (
        <ImportarHorarioModal cursos={cursos} colegioId={colegioId} onClose={() => setAbierto(null)}
          onHecho={(m) => { setAbierto(null); setResultado({ texto: m, avisos: [] }); showToast?.(m, "success"); }} />
      ) : null}
    </div>
  );
}
