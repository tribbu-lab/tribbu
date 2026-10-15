// Perdidos y encontrados (ver specs/perdidos-y-encontrados.md). Las familias
// publican lo que buscan ("Perdí") y lo que encontraron ("Encontré"); el
// colegio publica su caja de objetos perdidos desde el Super Admin. Cada
// publicación se ve en su curso (o en todo el colegio si así se eligió), vence a
// los 30 días (lo marcado "Resuelto" sigue listado, atenuado, hasta entonces), y
// al publicar no se manda push. Quien
// reconoce algo avisa ("¡Es mío!" / "Lo tengo yo") y recién ahí se comparten
// los contactos (RPCs contacto_objeto_perdido / avisos_objeto_perdido).
import { useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabase";
import { BotonNuevo } from "../../components/BotonNuevo";
import { BotonFiltros, FiltrosModal } from "../../components/Filtros";
import { borrarArchivos } from "../../lib/storageUrl";
import { sanitize, fmtLocalDate } from "../../lib/helpers";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { CATEGORIAS, categoria, estaVigente, estaVisible, ordenarVisibles, coincidencias, filtroAlcance, cargarReclamados, avisaAlCurso, textoPushPublicado } from "../../lib/perdidos";
import { Card } from "../../components/Card";
import { ImagenAmpliable } from "../../components/Adjuntos";
import { subirImagen } from "../../lib/imagenesWeb";
import { useCargar } from "../../hooks/useCargar";

const MAX_FOTO = 10 * 1024 * 1024;
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };
const lbl = { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 };
const btnSecundario = { padding: "7px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" };
const btnTexto = { border: "none", background: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", padding: "4px 2px" };
const fmtDia = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" }) : null);
const hace = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

// Publicaciones vigentes de estos cursos (o de alcance colegio en sus colegios) +
// qué avisé yo y cuántos avisos tienen las mías. colegios ya viene resuelto
// por quien llama (de "Mi acceso"/items o del propio listado del colegio) —
// evita repetir la consulta a "cursos" que ya hizo cargarCursos.
async function cargarDatos(cursoIds, colegios, userId) {
  if (!cursoIds.length) return { objetos: [], misAvisos: new Set(), avisosDe: {}, reclamados: new Set() };
  const filtro = filtroAlcance(cursoIds, colegios);
  const { data: objs } = await supabase
    .from("objetos_perdidos")
    .select("*")
    .or(filtro)
    .gt("vence_en", new Date().toISOString())
    .order("creado_en", { ascending: false });
  const objetos = objs || [];
  const ids = objetos.map((o) => o.id);
  const { data: avisos } = ids.length
    ? await supabase.from("objeto_perdido_avisos").select("objeto_id,usuario_id").in("objeto_id", ids)
    : { data: [] };
  const misAvisos = new Set((avisos || []).filter((a) => a.usuario_id === userId).map((a) => a.objeto_id));
  const avisosDe = {};
  for (const a of avisos || []) avisosDe[a.objeto_id] = (avisosDe[a.objeto_id] || 0) + 1;
  const reclamados = await cargarReclamados(supabase, ids);
  return { objetos, misAvisos, avisosDe, reclamados };
}

function Tarjeta({ o, userId, gestiona, yaAvise, reclamado, nAvisos, tag, sugerencias, onAvisar, onVerContacto, onVerAvisos, onResuelto, onBorrar, onVerSugerencia }) {
  const cat = categoria(o.categoria);
  const propio = o.publicado_por === userId;
  const resuelta = o.estado === "resuelto";
  return (
    // Sobria (como el resto del rediseño): blanco, grises y azul solo en la acción.
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 16, background: "white", overflow: "hidden", marginBottom: 12, opacity: resuelta ? 0.65 : 1 }}>
      <div style={{ display: "flex", gap: 14, padding: 16 }}>
        {o.foto
          ? <ImagenAmpliable src={o.foto} bucket="adjuntos" alt={o.titulo} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 12, flexShrink: 0, background: "#F1F5F9" }} />
          : <div style={{ width: 84, height: 84, borderRadius: 12, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 11.5, fontWeight: 600, color: "#94A3B8" }}>Sin foto</span></div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>{[o.tipo === "perdido" ? "Buscan" : "Encontrado", cat.l, o.es_colegio ? "Caja del colegio" : o.alcance === "colegio" ? "Todo el colegio" : null].filter(Boolean).join(" · ")}</span>
            {resuelta && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 999, background: "#F1F5F9", color: "#475569" }}>Resuelto</span>}
            {tag && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#475569" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: tag.color }} /><span style={{ color: "#475569" }}>{tag.nombre}</span></span>}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", lineHeight: 1.3, marginTop: 3 }}>{o.titulo}</div>
          {o.descripcion && <div style={{ fontSize: 13, color: "#475569", marginTop: 3, lineHeight: 1.45 }}>{o.descripcion}</div>}
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
            {[o.lugar, o.fecha && fmtDia(o.fecha), `publicado ${hace(o.creado_en)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      {sugerencias?.length > 0 && (
        <div style={{ padding: "10px 16px", background: "#F8FAFC", borderTop: "1px solid #F1F5F9", fontSize: 12.5 }}>
          <span style={{ color: "#475569", fontWeight: 600 }}>¿Será {sugerencias.length === 1 ? "este" : "alguno de estos"}? </span>
          {sugerencias.map((s, i) => (
            <button key={s.objeto.id} onClick={() => onVerSugerencia(s.objeto)} style={{ border: "none", background: "none", padding: 0, color: "#2563EB", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>
              {s.objeto.titulo}{i < sugerencias.length - 1 ? ", " : ""}
            </button>
          ))}
        </div>
      )}
      {!propio && !yaAvise && reclamado && !resuelta && (
        <div style={{ padding: "0 16px 10px", fontSize: 12.5, color: "#64748B" }}>
          {o.tipo === "encontrado" ? "Alguien ya avisó que es suyo" : "Alguien ya avisó que lo tiene"}
        </div>
      )}
      {(!propio || gestiona) && (
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderTop: "1px solid #F1F5F9", flexWrap: "wrap", alignItems: "center" }}>
          {!propio && !yaAvise && !resuelta && (
            <button onClick={() => onAvisar(o)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#2563EB", cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{o.tipo === "encontrado" ? "¡Es mío!" : "Lo tengo yo"}</span>
            </button>
          )}
          {!propio && yaAvise && (
            <button onClick={() => onVerContacto(o)} style={btnSecundario}><span style={{ color: "#0F172A" }}>Ver contacto</span></button>
          )}
          {gestiona && nAvisos > 0 && (
            <button onClick={() => onVerAvisos(o)} style={btnSecundario}><span style={{ color: "#0F172A" }}>{nAvisos} {nAvisos === 1 ? "aviso" : "avisos"}</span></button>
          )}
          <div style={{ flex: 1 }} />
          {gestiona && !resuelta && <button onClick={() => onResuelto(o)} style={btnTexto}><span style={{ color: "#475569" }}>Marcar resuelto</span></button>}
          {gestiona && <button onClick={() => onBorrar(o)} style={btnTexto}><span style={{ color: "#64748B" }}>Borrar</span></button>}
        </div>
      )}
    </div>
  );
}

function Modal({ titulo, onClose, children, ancho = 440 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: ancho, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{titulo}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Contacto({ c }) {
  if (!c) return <div style={{ fontSize: 13, color: "#94A3B8" }}>Cargando…</div>;
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#F8FAFC", marginBottom: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{c.nombre}</div>
      {c.telefono && <a href={`tel:${c.telefono}`} style={{ display: "block", fontSize: 13, color: "#2563EB", marginTop: 4 }}>📞 {c.telefono}</a>}
      {c.telefono && <a href={`https://wa.me/${c.telefono.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" style={{ display: "block", fontSize: 13, color: "#16A34A", marginTop: 2 }}>💬 WhatsApp</a>}
      {c.email && <a href={`mailto:${c.email}`} style={{ display: "block", fontSize: 13, color: "#2563EB", marginTop: 2 }}>✉️ {c.email}</a>}
      {!c.telefono && !c.email && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>No cargó teléfono ni email.</div>}
      {c.mensaje && <div style={{ fontSize: 12.5, color: "#475569", marginTop: 6 }}>“{c.mensaje}”</div>}
    </div>
  );
}

/** Alta. `cursos`: [{ id, nombre, colegio_id }] donde puede publicar; `comoColegio`: publica el colegio. */
function NuevoModal({ cursos, colegioId, comoColegio, userId, candidatos, onClose, onCreado }) {
  const [form, setForm] = useState({ tipo: "encontrado", categoria: "ropa", titulo: "", descripcion: "", lugar: "", fecha: fmtLocalDate(), alcance: comoColegio ? "colegio" : "curso", curso_id: cursos[0]?.id || null });
  const [foto, setFoto] = useState(null); // File
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const publicar = async () => {
    if (!form.titulo.trim()) { setError("Contá qué es (ej: Campera azul talle 8)."); return; }
    if (form.tipo === "encontrado" && !foto) { setError("Para un objeto encontrado, la foto es lo que permite reconocerlo."); return; }
    if (form.alcance === "curso" && !form.curso_id) { setError("Elegí el curso."); return; }
    if (foto && foto.size > MAX_FOTO) { setError("La foto supera 10 MB."); return; }
    setGuardando(true); setError(null);
    const colegio = comoColegio ? colegioId : cursos.find((c) => c.id === form.curso_id)?.colegio_id;
    let path = null;
    if (foto) {
      // Original achicada + miniatura (lib/imagenesWeb).
      const res = await subirImagen(supabase, "adjuntos", `perdidos/${colegio}/${Date.now()}`, foto);
      path = res.path;
      const upErr = res.error;
      if (upErr) { setGuardando(false); setError("No se pudo subir la foto."); return; }
    }
    const fila = {
      tipo: form.tipo, categoria: form.categoria, titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null,
      lugar: sanitize(form.lugar) || null, fecha: form.fecha || null, foto: path, alcance: form.alcance,
      curso_id: form.alcance === "curso" || !comoColegio ? form.curso_id : null, colegio_id: colegio,
      publicado_por: userId, es_colegio: !!comoColegio,
    };
    const { data: nuevo, error: err } = await supabase.from("objetos_perdidos").insert(fila).select().single();
    if (err) { setGuardando(false); setError("No se pudo publicar: " + err.message); return; }
    // Un "Encontré" nuevo avisa a quien busca algo parecido, con un texto propio.
    let duenos = [];
    if (nuevo.tipo === "encontrado") {
      duenos = [...new Set(coincidencias(nuevo, candidatos, { max: 10 }).map((x) => x.objeto.publicado_por).filter((u) => u && u !== userId))];
      if (duenos.length) await sendPush({ type: "perdido", payload: { titulo: `Puede que hayan encontrado lo que buscás: ${nuevo.titulo}`, userIds: duenos, objetoId: nuevo.id } });
    }
    // Lo publicado para "Mi curso" avisa al resto del curso (lo de todo el colegio, no).
    if (avisaAlCurso(nuevo)) {
      const curso = (await getUserIdsByCurso(nuevo.curso_id)).filter((u) => u !== userId && !duenos.includes(u));
      if (curso.length) await sendPush({ type: "perdido", payload: { titulo: textoPushPublicado(nuevo), userIds: curso, objetoId: nuevo.id } });
    }
    setGuardando(false);
    onCreado?.(nuevo);
    onClose();
  };

  const opcionTipo = (t, txt) => (
    <button onClick={() => set("tipo", t)} style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${form.tipo === t ? "#3B82F6" : "#E2E8F0"}`, background: form.tipo === t ? "#EFF6FF" : "white", color: form.tipo === t ? "#1D4ED8" : "#64748B", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{txt}</button>
  );
  return (
    <Modal titulo="Publicar" onClose={onClose}>
      {!comoColegio && <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{opcionTipo("perdido", "Perdí algo")}{opcionTipo("encontrado", "Encontré algo")}</div>}
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>CATEGORÍA</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATEGORIAS.map((c) => (
            <button key={c.k} onClick={() => set("categoria", c.k)} style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${form.categoria === c.k ? "#3B82F6" : "#E2E8F0"}`, background: form.categoria === c.k ? "#EFF6FF" : "white", cursor: "pointer", fontSize: 12, fontWeight: 600, color: form.categoria === c.k ? "#1D4ED8" : "#475569" }}>{c.l}</button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>QUÉ ES</div>
        <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej: Campera azul talle 8" style={inp} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>DETALLE (opcional)</div>
        <textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={2} placeholder="Marca, tiene nombre bordado, etc. Mejor no poner el nombre completo del chico." style={{ ...inp, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 180px" }}>
          <div style={lbl}>{form.tipo === "perdido" ? "DÓNDE SE PERDIÓ (opcional)" : "DÓNDE ESTÁ AHORA"}</div>
          <input value={form.lugar} onChange={(e) => set("lugar", e.target.value)} placeholder={form.tipo === "perdido" ? "Ej: en el patio, en el micro" : "Ej: lo tiene preceptoría / lo tengo yo"} style={inp} />
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <div style={lbl}>FECHA</div>
          <input type="date" value={form.fecha} onChange={(e) => set("fecha", e.target.value)} style={inp} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>FOTO {form.tipo === "encontrado" ? "" : "(opcional)"}</div>
        <input type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
      </div>
      {(!comoColegio || cursos.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          <div style={lbl}>¿QUIÉN LO VE?</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {[["curso", comoColegio ? "Un curso" : "Mi curso"], ["colegio", "Todo el colegio"]].map(([k, t]) => (
              <button key={k} onClick={() => set("alcance", k)} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${form.alcance === k ? "#3B82F6" : "#E2E8F0"}`, background: form.alcance === k ? "#EFF6FF" : "white", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>{t}</button>
            ))}
          </div>
          {(form.alcance === "curso" || !comoColegio) && cursos.length > 1 && (
            <select value={form.curso_id || ""} onChange={(e) => set("curso_id", e.target.value)} style={inp}>
              {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {form.alcance === "colegio" && !comoColegio && <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4 }}>Usalo si se perdió en un lugar común (patio, micro, gimnasio).</div>}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 10 }}>Se ve 30 días (si lo marcás resuelto, sigue en la lista como resuelto). No se manda notificación a nadie al publicar.</div>
      {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontSize: 13, color: "#94A3B8" }}>Cancelar</button>
        <button onClick={publicar} disabled={guardando} style={{ flex: 2, padding: 10, borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Publicando…" : "Publicar"}</button>
      </div>
    </Modal>
  );
}

/** Lista + acciones, compartida por la pestaña de las familias y la sección del colegio. */
function Tablero({ cursoIds, cursosPublicar, colegioId, comoColegio, userId, puedeModerar, tagDeCurso }) {
  const [datos, setDatos] = useState(null);
  const [tab, setTab] = useState("encontrado");
  const [cat, setCat] = useState("todas");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const gruposFiltro = [{ key: "cat", label: "Categoría", value: cat, onChange: setCat, options: [{ value: "todas", label: "Todas" }, ...CATEGORIAS.map((c) => ({ value: c.k, label: c.l }))] }];
  const [nuevo, setNuevo] = useState(false);
  const [avisando, setAvisando] = useState(null); // objeto
  const [mensaje, setMensaje] = useState("");
  const [contacto, setContacto] = useState(null); // { objeto, c }
  const [avisos, setAvisos] = useState(null); // { objeto, lista }
  const [resaltado, setResaltado] = useState(null);

  const colegios = useMemo(() => [...new Set(cursosPublicar.map((c) => c.colegio_id).filter(Boolean))], [cursosPublicar]);
  const cargar = useCallback(async () => setDatos(await cargarDatos(cursoIds, colegios, userId)), [cursoIds, colegios, userId]);
  useCargar(cargar);

  const gestiona = (o) => o.publicado_por === userId || puedeModerar(o);

  const avisar = async () => {
    const o = avisando;
    const { error } = await supabase.from("objeto_perdido_avisos").insert({ objeto_id: o.id, usuario_id: userId, mensaje: sanitize(mensaje) || null });
    if (error) { alert("No se pudo avisar. Probá de nuevo."); return; }
    if (o.publicado_por) {
      await sendPush({ type: "perdido", payload: { titulo: `${o.tipo === "encontrado" ? "Alguien dice que es suyo" : "Alguien lo tiene"}: ${o.titulo}`, userIds: [o.publicado_por], objetoId: o.id } });
    }
    setAvisando(null); setMensaje("");
    await cargar();
    verContacto(o);
  };
  const verContacto = async (o) => {
    setContacto({ objeto: o, c: null });
    const { data } = await supabase.rpc("contacto_objeto_perdido", { p_id: o.id });
    setContacto({ objeto: o, c: data?.[0] || { nombre: "—" } });
  };
  const verAvisos = async (o) => {
    setAvisos({ objeto: o, lista: null });
    const { data } = await supabase.rpc("avisos_objeto_perdido", { p_id: o.id });
    setAvisos({ objeto: o, lista: data || [] });
  };
  const resuelto = async (o) => {
    await supabase.from("objetos_perdidos").update({ estado: "resuelto", resuelto_en: new Date().toISOString() }).eq("id", o.id);
    cargar();
  };
  const borrar = async (o) => {
    if (!confirm("¿Borrar esta publicación?")) return;
    await supabase.from("objetos_perdidos").delete().eq("id", o.id);
    if (o.foto) borrarArchivos([o.foto], "adjuntos");
    cargar();
  };
  const verSugerencia = (s) => {
    setTab(s.tipo); setCat("todas"); setResaltado(s.id);
    setTimeout(() => document.getElementById(`obj-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const vigentes = useMemo(() => (datos?.objetos || []).filter((o) => estaVigente(o)), [datos]);
  const visibles = useMemo(() => ordenarVisibles((datos?.objetos || []).filter((o) => estaVisible(o))), [datos]);
  if (!datos) return <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div>;
  const lista = visibles.filter((o) => o.tipo === tab && (cat === "todas" || o.categoria === cat));
  const cuenta = (t) => visibles.filter((o) => o.tipo === t).length;

  return (
    <div>
      {nuevo && <NuevoModal cursos={cursosPublicar} colegioId={colegioId} comoColegio={comoColegio} userId={userId} candidatos={vigentes} onClose={() => setNuevo(false)} onCreado={(n) => { cargar(); setTab(n.tipo); }} />}
      {avisando && (
        <Modal titulo={avisando.tipo === "encontrado" ? "¡Es mío!" : "Lo tengo yo"} onClose={() => setAvisando(null)}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 10, lineHeight: 1.5 }}>
            Le avisamos a quien lo publicó y se comparten los contactos de los dos para que se pongan de acuerdo.
          </div>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={2} placeholder="Mensaje (opcional): ej. tiene el nombre bordado adentro" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
          <button onClick={avisar} style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Avisar y ver el contacto</button>
        </Modal>
      )}
      {contacto && (
        <Modal titulo="Contacto" onClose={() => setContacto(null)} ancho={380}>
          <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>{contacto.objeto.titulo}</div>
          <Contacto c={contacto.c} />
        </Modal>
      )}
      {avisos && (
        <Modal titulo="Quiénes avisaron" onClose={() => setAvisos(null)} ancho={400}>
          <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>{avisos.objeto.titulo}</div>
          {!avisos.lista ? <Contacto c={null} /> : avisos.lista.map((a) => <Contacto key={a.usuario_id} c={a} />)}
          <button onClick={() => { resuelto(avisos.objeto); setAvisos(null); }} style={{ width: "100%", marginTop: 6, padding: 9, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", color: "#0F172A", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Ya está resuelto</button>
        </Modal>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {/* Encontrados / Buscan: mismo control segmentado gris que las pestañas internas. */}
        <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 999, padding: 4 }}>
          {[["encontrado", "Encontrados"], ["perdido", "Buscan"]].map(([t, txt]) => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "7px 16px", borderRadius: 999, border: tab === t ? "1px solid #E2E8F0" : "1px solid transparent", cursor: "pointer", fontFamily: "inherit", background: tab === t ? "white" : "transparent" }}>
              <span style={{ fontSize: 13, fontWeight: tab === t ? 800 : 600, color: tab === t ? "#1D4ED8" : "#64748B" }}>{txt} {cuenta(t)}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <BotonFiltros grupos={gruposFiltro} onClick={() => setFiltrosAbiertos(true)} />
        <BotonNuevo onClick={() => setNuevo(true)} ariaLabel="Publicar un objeto" />
      </div>
      {filtrosAbiertos && <FiltrosModal grupos={gruposFiltro} onClose={() => setFiltrosAbiertos(false)} />}
      {!lista.length && (
        <Card style={{ padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{tab === "encontrado" ? "No hay objetos encontrados" : "Nadie está buscando nada"}</div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>Las publicaciones se ven 30 días, también las resueltas.</div>
        </Card>
      )}
      {lista.map((o) => (
        <div key={o.id} id={`obj-${o.id}`} style={{ borderRadius: 16, outline: resaltado === o.id ? "2px solid #2563EB" : "none" }}>
          <Tarjeta
            o={o}
            userId={userId}
            gestiona={gestiona(o)}
            yaAvise={datos.misAvisos.has(o.id)}
            nAvisos={datos.avisosDe[o.id] || 0}
            tag={tagDeCurso?.(o.curso_id)}
            reclamado={datos.reclamados.has(o.id)}
            sugerencias={o.publicado_por === userId && o.estado === "abierto" ? coincidencias(o, vigentes.filter((x) => !datos.reclamados.has(x.id))) : null}
            onAvisar={(x) => { setAvisando(x); setMensaje(""); }}
            onVerContacto={verContacto}
            onVerAvisos={verAvisos}
            onResuelto={resuelto}
            onBorrar={borrar}
            onVerSugerencia={verSugerencia}
          />
        </div>
      ))}
    </div>
  );
}

/** Pestaña de las familias. */
export function Perdidos({ cursoId, cursoIds = [], esVistaTodos = false, tagDeCurso = null, cursosAdmin = [], userId, items = [], embebido = false }) {
  // nombre/colegio_id de cada curso ya vienen en "Mi acceso" (items[].cursos) —
  // evita una consulta a "cursos" en cada carga (items[].curso_id / .cursos.*
  // vienen de App.jsx, que ya los cargó al loguearse).
  const cursos = useMemo(() => {
    const ids = esVistaTodos ? cursoIds : cursoId ? [cursoId] : [];
    return ids
      .map((id) => {
        const it = items.find((i) => i.curso_id === id);
        return it?.cursos ? { id, nombre: it.cursos.nombre, colegio_id: it.cursos.colegio_id } : null;
      })
      .filter(Boolean);
  }, [items, esVistaTodos, cursoIds, cursoId]);
  const puedeModerar = (o) => !!o.curso_id && cursosAdmin.includes(o.curso_id);
  return (
    <div style={{ maxWidth: 760 }}>
      {/* Dentro de Comunidad el título lo pone la sección. */}
      {!embebido && <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3 }}>Lost &amp; Found</div>}
      <div style={{ fontSize: 13, color: "#94A3B8", marginBottom: 16 }}>Lo que se perdió y lo que apareció en tu curso y en el colegio</div>
      <Tablero cursoIds={cursoIds} cursosPublicar={cursos} colegioId={cursos[0]?.colegio_id} comoColegio={false} userId={userId} puedeModerar={puedeModerar} tagDeCurso={esVistaTodos ? tagDeCurso : null} />
    </div>
  );
}

/** Sección del Super Admin: el colegio publica (su caja de objetos perdidos) y modera todo lo del colegio. */
export function PerdidosColegio({ cursos, colegioId, userId }) {
  const clave = cursos.map((c) => c.id).join(",");
  const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);
  const tag = (cid) => {
    const c = cursos.find((x) => x.id === cid);
    return c ? { nombre: c.nombre, color: c.color || "#94A3B8" } : null;
  };
  return <Tablero cursoIds={ids} cursosPublicar={cursos} colegioId={colegioId} comoColegio userId={userId} puedeModerar={() => true} tagDeCurso={tag} />;
}
