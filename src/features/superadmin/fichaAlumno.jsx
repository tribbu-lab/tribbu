// Ficha de un alumno en el panel del colegio (web): todo lo suyo en un lugar
// — datos, familia, cambios en la salida, autorizaciones del curso con su
// respuesta y sus chats con Secretaría y las maestras. Se abre desde
// Personas → Alumnos. Lo de cada sección se pide en un solo lote.
import { useEffect, useState } from "react";
import { supabase } from "../../supabase";
import { fmtNombre, fmtF, fmtLocalDate } from "../../lib/helpers";
import { SELECT_CAMBIO_SALIDA, estadoCambio, fechaCambio, textoMotivo, textoRetira } from "../../lib/cambiosSalida";
import { Icono } from "../../components/Icono";

const titulo = { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "18px 0 8px" };
const caja = { border: "1px solid #E2E8F0", borderRadius: 12, background: "white" };
const fila = (i) => ({ padding: "10px 12px", borderTop: i ? "1px solid #F1F5F9" : "none" });
const vacio = { fontSize: 13, color: "#94A3B8", padding: "10px 12px" };
const fmtCuando = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

function edad(fecha) {
  if (!fecha) return null;
  const n = new Date(fecha + "T00:00:00"), h = new Date();
  let e = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
  return e >= 0 ? e : null;
}

export function FichaAlumno({ alumno, curso, onCerrar, onEditar, onIr }) {
  const [d, setD] = useState(null);
  const hoy = fmtLocalDate();

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from("cambios_salida").select(SELECT_CAMBIO_SALIDA).eq("hijo_id", alumno.id).order("fecha", { ascending: false }).limit(5),
      alumno.curso_id ? supabase.from("autorizaciones").select("id,titulo,fecha_evento,creado_en").eq("curso_id", alumno.curso_id).order("creado_en", { ascending: false }).limit(6) : { data: [] },
      supabase.from("autorizacion_respuestas").select("autorizacion_id,autoriza,retira,respondido_en").eq("hijo_id", alumno.id),
      supabase.from("conversaciones").select("id,tipo,ultimo_mensaje_en,archivada_en,maestros(nombre,apellido,materia)").eq("hijo_id", alumno.id).in("tipo", ["colegio", "docente"]).order("ultimo_mensaje_en", { ascending: false, nullsFirst: false }),
    ]).then(([sal, auts, resp, convs]) => {
      if (!vivo) return;
      setD({ salidas: sal.data || [], autorizaciones: auts.data || [], respuestas: resp.data || [], chats: convs.data || [] });
    });
    return () => { vivo = false; };
  }, [alumno.id, alumno.curso_id]);

  const apoderados = (alumno.usuarios || []).map((u) => u.usuarios).filter(Boolean);
  const anios = edad(alumno.fecha_nacimiento);
  const respuestaDe = new Map((d?.respuestas || []).map((r) => [r.autorizacion_id, r]));

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 300, display: "flex", justifyContent: "flex-end" }}>
      <div role="dialog" aria-label={`Ficha de ${fmtNombre(alumno)}`} onClick={(e) => e.stopPropagation()} style={{ background: "#F8FAFC", width: "100%", maxWidth: 520, height: "100%", overflowY: "auto", padding: "18px 20px 28px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: alumno.color || "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "white" }}>{`${(alumno.nombre || "")[0] || ""}${(alumno.apellido || "")[0] || ""}`.toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: "#0F172A" }}>{fmtNombre(alumno)}</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>
              {[curso?.nombre, alumno.fecha_nacimiento ? `${fmtF(alumno.fecha_nacimiento)}${anios != null ? ` (${anios} años)` : ""}` : null, alumno.dni ? `DNI ${alumno.dni}` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#94A3B8", padding: 4 }}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onEditar} style={{ padding: "8px 13px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>Editar datos</span>
          </button>
        </div>

        <div style={titulo}>Familia</div>
        <div style={caja}>
          {apoderados.length ? apoderados.map((p, i) => (
            <div key={p.id} style={fila(i)}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{fmtNombre(p)}</div>
              <div style={{ fontSize: 12.5, color: "#64748B" }}>{[p.email, p.telefono].filter(Boolean).join(" · ")}</div>
            </div>
          )) : <div style={{ ...vacio, color: "#B45309" }}>Sin apoderado vinculado: su familia todavía no recibe nada. Vinculalo desde Personas → Apoderados o con Configuración → Importar datos.</div>}
        </div>

        {!d ? <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 18 }}>Cargando…</div> : (
          <>
            <div style={titulo}>Cambios en la salida</div>
            <div style={caja}>
              {d.salidas.length ? d.salidas.map((c, i) => {
                const est = estadoCambio(c, hoy);
                return (
                  <div key={c.id} style={fila(i)}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>{fechaCambio(c.fecha, hoy)} · {(c.hora || "").slice(0, 5)}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: est.id === "visto" ? "#047857" : est.id === "pendiente" ? "#B45309" : "#94A3B8" }}>{est.id === "pendiente" ? "Sin ver" : est.label}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 2 }}>{textoMotivo(c)} · Se retira con {textoRetira(c)}</div>
                  </div>
                );
              }) : <div style={vacio}>No avisaron ningún cambio.</div>}
            </div>

            <div style={titulo}>Autorizaciones del curso</div>
            <div style={caja}>
              {d.autorizaciones.length ? d.autorizaciones.map((a, i) => {
                const r = respuestaDe.get(a.id);
                return (
                  <div key={a.id} style={{ ...fila(i), display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>{a.titulo}</span>
                      {a.fecha_evento ? <span style={{ display: "block", fontSize: 12.5, color: "#64748B" }}>Salida {fmtF(a.fecha_evento)}</span> : null}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: !r ? "#94A3B8" : r.autoriza ? "#047857" : "#B91C1C", whiteSpace: "nowrap" }}>{!r ? "Sin responder" : r.autoriza ? "Autorizó" : "No autorizó"}</span>
                  </div>
                );
              }) : <div style={vacio}>El curso no tiene autorizaciones.</div>}
            </div>

            <div style={titulo}>Mensajes</div>
            <div style={caja}>
              {d.chats.length ? d.chats.map((c, i) => (
                <div key={c.id} style={{ ...fila(i), display: "flex", gap: 8, alignItems: "center" }}>
                  <Icono nombre="mensaje" size={16} color="#94A3B8" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "#0F172A" }}>
                      {c.tipo === "colegio" ? "Con Secretaría" : `Con ${fmtNombre(c.maestros) || "una maestra"}${c.maestros?.materia ? ` (${c.maestros.materia})` : ""}`}
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "#64748B" }}>{c.ultimo_mensaje_en ? `Último mensaje: ${fmtCuando(c.ultimo_mensaje_en)}` : "Sin mensajes"}{c.archivada_en ? " · archivado" : ""}</span>
                  </span>
                </div>
              )) : <div style={vacio}>Su familia todavía no escribió.</div>}
              {d.chats.length ? (
                <div style={{ padding: "8px 12px", borderTop: "1px solid #F1F5F9" }}>
                  <button onClick={() => onIr("mensajes_familias")} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>Ir a Mensajes de familias →</span>
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
