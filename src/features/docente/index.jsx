// Vista de la docente (specs/docentes-clases-y-grupos.md, Fase B).
//
// AlumnosDocente: los alumnos de sus cursos con los NOMBRES de sus apoderados
// (RPC alumnos_de_curso_docente — nunca teléfono ni email; la docente no lee
// la tabla hijos ni usuarios de las familias) y "💬 Escribir a la familia",
// que abre el hilo alumno × maestra de Mensajes.
import { useState, useCallback } from "react";
import { supabase } from "../../supabase";
import { THEMES, SLATE } from "../../lib/tokens";
import { Spinner } from "../../components/Spinner";
import { useCargar } from "../../hooks/useCargar";

const C = THEMES.light;
const sinAcentos = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function AlumnosDocente({ cursoIds = [], tagDeCurso, esVistaTodos, maestroId, onEscribir }) {
  const [porCurso, setPorCurso] = useState(null); // { curso_id: [alumnos] }
  const [q, setQ] = useState("");

  const cargar = useCallback(async () => {
    if (!cursoIds.length) { setPorCurso({}); return; }
    const res = await Promise.all(cursoIds.map((cid) => supabase.rpc("alumnos_de_curso_docente", { p_curso: cid })));
    setPorCurso(Object.fromEntries(cursoIds.map((cid, i) => [cid, res[i].data || []])));
  }, [cursoIds]);
  useCargar(cargar);

  if (porCurso === null) return <Spinner />;
  const t = sinAcentos(q).trim();
  const coincide = (a) => !t || sinAcentos(`${a.nombre} ${a.apellido} ${(a.apoderados || []).map((p) => p.nombre).join(" ")}`).includes(t);
  const total = cursoIds.reduce((n, cid) => n + (porCurso[cid] || []).length, 0);

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, marginBottom: 4, color: C.textStrong }}>Alumnos</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>{total} alumnos. Escribile a la familia sin compartir teléfonos: el chat queda en Mensajes y el colegio lo puede ver.</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar alumno o familia…" aria-label="Buscar alumno"
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${C.borderStrong}`, fontSize: 13, outline: "none", fontFamily: "inherit", background: "white", boxSizing: "border-box", marginBottom: 14, color: C.text }} />
      {cursoIds.map((cid) => {
        const lista = (porCurso[cid] || []).filter(coincide);
        if (!lista.length) return null;
        const tag = esVistaTodos ? tagDeCurso?.(cid) : null;
        return (
          <div key={cid} style={{ marginBottom: 18 }}>
            {tag ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>{tag.nombre}</span>
              </div>
            ) : null}
            {lista.map((a) => (
              <div key={a.hijo_id} style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.textStrong }}>{a.apellido ? `${a.apellido}, ${a.nombre}` : a.nombre}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                    {(a.apoderados || []).length ? (a.apoderados || []).map((p) => p.nombre).join(" · ") : <span style={{ color: SLATE[400] }}>Sin apoderados con cuenta</span>}
                  </div>
                </div>
                {(a.apoderados || []).length && maestroId ? (
                  <button onClick={() => onEscribir({ hijo_id: a.hijo_id, maestro_id: maestroId, nombre: a.nombre, apellido: a.apellido, curso_id: cid })}
                    aria-label={`Escribir a la familia de ${a.nombre}`}
                    style={{ border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", minHeight: 32 }}>
                    💬 Escribir a la familia
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        );
      })}
      {!total ? <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, padding: 24 }}>Todavía no tenés alumnos: pedile al colegio que te asigne tus clases.</div> : null}
    </div>
  );
}
