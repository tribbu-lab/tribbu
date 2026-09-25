// Marketplace de cosas usadas (sección Comunidad — ver specs/marketplace.md).
// Las familias publican lo que ya no usan (uniformes, libros, disfraces…) con
// precio o "Lo regalo", hasta 3 fotos, y eligen si lo ve su curso o todo el
// colegio. "Me interesa" le avisa al vendedor (push) y recién ahí se comparten
// los contactos (RPCs contacto_articulo / interesados_articulo). Etapa 1 sin
// pagos: el vendedor marca "Vendido" (y opcionalmente a quién) — eso queda
// guardado para cobrar comisión más adelante. Vence a los 60 días; lo vendido
// se sigue viendo una semana, marcado.
import { useState, useCallback, useMemo } from "react";
import { supabase } from "../../supabase";
import { borrarArchivos } from "../../lib/storageUrl";
import { sanitize } from "../../lib/helpers";
import { sendPush } from "../../lib/push";
import { CATEGORIAS, categoria, CONDICIONES, condicion, MAX_FOTOS, DIAS_VIGENCIA, estaDisponible, estaVisible, ordenar, fmtPrecio, diasParaVencer, coincideBusqueda, filtroAlcance } from "../../lib/marketplace";
import { Card } from "../../components/Card";
import { SignedImg } from "../../components/SignedImg";
import { useCargar } from "../../hooks/useCargar";

const MAX_FOTO_BYTES = 10 * 1024 * 1024;
const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box" };
const lbl = { fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5 };
const chip = (on) => ({ padding: "5px 11px", borderRadius: 14, border: `1px solid ${on ? "#3B82F6" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "white", color: on ? "#1D4ED8" : "#64748B", cursor: "pointer", fontSize: 12, fontWeight: 600 });
const btnPri = { padding: "9px 16px", borderRadius: 10, border: "none", background: "#3B82F6", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const btnSec = { padding: "9px 16px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", color: "#475569", cursor: "pointer", fontSize: 13, fontWeight: 700 };
const hace = (iso) => {
  const d = Math.round((Date.now() - new Date(iso)) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
};

async function cargarDatos(cursoIds, userId) {
  if (!cursoIds.length) return { articulos: [], misInteres: new Set(), interesadosDe: {} };
  const { data: cursos } = await supabase.from("cursos").select("id,colegio_id").in("id", cursoIds);
  const colegios = [...new Set((cursos || []).map((c) => c.colegio_id))];
  const hace7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase
    .from("marketplace_articulos")
    .select("*")
    .or(filtroAlcance(cursoIds, colegios))
    .or(`vence_en.gt.${new Date().toISOString()},vendido_en.gt.${hace7}`)
    .order("creado_en", { ascending: false });
  const articulos = data || [];
  const ids = articulos.map((a) => a.id);
  const [{ data: mios }, { data: conteo }] = ids.length
    ? await Promise.all([
        supabase.from("marketplace_interesados").select("articulo_id").eq("usuario_id", userId).in("articulo_id", ids),
        supabase.rpc("interesados_por_articulo", { p_ids: ids }),
      ])
    : [{ data: [] }, { data: [] }];
  return {
    articulos,
    misInteres: new Set((mios || []).map((r) => r.articulo_id)),
    interesadosDe: Object.fromEntries((conteo || []).map((r) => [r.articulo_id, r.cantidad])),
  };
}

function Modal({ titulo, onClose, children, ancho = 460 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={titulo} onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 20, width: "100%", maxWidth: ancho, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{titulo}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ContactoCard({ c }) {
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

function Tarjeta({ a, tag, onAbrir }) {
  const cat = categoria(a.categoria);
  const vendido = a.estado === "vendido";
  return (
    <button onClick={() => onAbrir(a)} style={{ padding: 0, border: "1px solid #E7ECF3", borderRadius: 16, background: "white", cursor: "pointer", textAlign: "left", overflow: "hidden", display: "flex", flexDirection: "column", opacity: vendido ? 0.65 : 1, fontFamily: "inherit" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", background: "#F1F5F9" }}>
        {a.fotos?.[0]
          ? <SignedImg src={a.fotos[0]} bucket="adjuntos" alt={a.titulo} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{cat.e}</div>}
        {vendido && <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 8, background: "#0F172A", color: "white" }}>VENDIDO</span>}
        {a.es_colegio && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: "#EEF2FF", color: "#4F46E5" }}>🏫 Colegio</span>}
      </div>
      <div style={{ padding: "10px 12px 12px" }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: a.es_regalo ? "#047857" : "#0F172A" }}>{fmtPrecio(a)}</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", marginTop: 2, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.titulo}</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
          {tag && <><span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color }} />{tag.nombre} ·</>}
          {condicion(a.condicion).l}{a.talle ? ` · T. ${a.talle}` : ""}
        </div>
      </div>
    </button>
  );
}

function Detalle({ a, userId, gestiona, yaMeInteresa, nInteresados, tag, onClose, onMeInteresa, onVerContacto, onVerInteresados, onVendido, onRenovar, onBorrar }) {
  const [foto, setFoto] = useState(0);
  const cat = categoria(a.categoria);
  const propio = a.publicado_por === userId;
  const vendido = a.estado === "vendido";
  const dias = diasParaVencer(a);
  return (
    <Modal titulo={a.titulo} onClose={onClose} ancho={520}>
      {a.fotos?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SignedImg src={a.fotos[foto]} bucket="adjuntos" alt={a.titulo} style={{ width: "100%", maxHeight: 340, objectFit: "contain", borderRadius: 12, background: "#F1F5F9", display: "block" }} />
          {a.fotos.length > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {a.fotos.map((f, i) => (
                <button key={f} onClick={() => setFoto(i)} aria-label={`Foto ${i + 1}`} style={{ padding: 0, border: `2px solid ${i === foto ? "#3B82F6" : "transparent"}`, borderRadius: 8, cursor: "pointer", background: "none" }}>
                  <SignedImg src={f} bucket="adjuntos" alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 6, display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontSize: 20, fontWeight: 900, color: a.es_regalo ? "#047857" : "#0F172A" }}>{fmtPrecio(a)}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0 8px" }}>
        {vendido && <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 8, background: "#0F172A", color: "white" }}>VENDIDO</span>}
        <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 8, background: "#F1F5F9", color: "#475569" }}>{cat.e} {cat.l}</span>
        <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 8, background: "#F1F5F9", color: "#475569" }}>{condicion(a.condicion).l}</span>
        {a.talle && <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 8, background: "#F1F5F9", color: "#475569" }}>Talle {a.talle}</span>}
        {a.es_colegio && <span style={{ fontSize: 11.5, padding: "3px 8px", borderRadius: 8, background: "#EEF2FF", color: "#4F46E5" }}>🏫 Colegio</span>}
      </div>
      {a.descripcion && <div style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.5, marginBottom: 8, whiteSpace: "pre-wrap" }}>{a.descripcion}</div>}
      <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 14 }}>
        {[tag?.nombre, a.alcance === "colegio" ? "todo el colegio" : "su curso", `publicado ${hace(a.creado_en)}`, propio && !vendido ? (dias > 0 ? `vence en ${dias} días` : "venció") : null].filter(Boolean).join(" · ")}
      </div>

      {!propio && !vendido && !yaMeInteresa && estaDisponible(a) && (
        <button onClick={() => onMeInteresa(a)} style={{ ...btnPri, width: "100%" }}>🙋 Me interesa</button>
      )}
      {!propio && yaMeInteresa && (
        <button onClick={() => onVerContacto(a)} style={{ ...btnSec, width: "100%", color: "#1D4ED8", borderColor: "#BFDBFE", background: "#EFF6FF" }}>📞 Ver contacto del vendedor</button>
      )}
      {!propio && !yaMeInteresa && nInteresados > 0 && !vendido && (
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 8, textAlign: "center" }}>🙋 {nInteresados === 1 ? "Ya hay 1 interesado" : `Ya hay ${nInteresados} interesados`}</div>
      )}

      {gestiona && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
          {nInteresados > 0 && <button onClick={() => onVerInteresados(a)} style={{ ...btnSec, color: "#047857", borderColor: "#BBF7D0", background: "#F0FDF4" }}>🙋 {nInteresados} {nInteresados === 1 ? "interesado" : "interesados"}</button>}
          {!vendido && <button onClick={() => onVendido(a)} style={btnSec}>✓ Vendido</button>}
          {!vendido && dias <= 10 && <button onClick={() => onRenovar(a)} style={btnSec}>↻ Renovar {DIAS_VIGENCIA} días</button>}
          <div style={{ flex: 1 }} />
          <button onClick={() => onBorrar(a)} style={{ ...btnSec, color: "#EF4444", borderColor: "#FEE2E2" }}>Borrar</button>
        </div>
      )}
    </Modal>
  );
}

function NuevoModal({ cursos, colegioId, comoColegio, userId, onClose, onCreado }) {
  const [form, setForm] = useState({ titulo: "", descripcion: "", categoria: "uniformes", condicion: "usado", talle: "", es_regalo: false, precio: "", alcance: "colegio", curso_id: cursos[0]?.id || null });
  const [fotos, setFotos] = useState([]); // File[]
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const elegirFotos = (lista) => {
    const nuevas = [...fotos, ...Array.from(lista || [])].slice(0, MAX_FOTOS);
    if (nuevas.some((f) => f.size > MAX_FOTO_BYTES)) { setError("Cada foto puede pesar hasta 10 MB."); return; }
    setError(null);
    setFotos(nuevas);
  };

  const publicar = async () => {
    if (!form.titulo.trim()) { setError("Contá qué es (ej: Buzo del uniforme talle 10)."); return; }
    const precio = Number(String(form.precio).replace(/\./g, "").replace(",", "."));
    if (!form.es_regalo && (!form.precio || !Number.isFinite(precio) || precio < 0)) { setError("Poné el precio o marcá \"Lo regalo\"."); return; }
    if (!fotos.length) { setError("Subí al menos una foto: es lo primero que se mira."); return; }
    if (form.alcance === "curso" && !form.curso_id) { setError("Elegí el curso."); return; }
    setGuardando(true); setError(null);
    const colegio = comoColegio ? colegioId : cursos.find((c) => c.id === form.curso_id)?.colegio_id;
    const paths = [];
    for (const f of fotos) {
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = `marketplace/${colegio}/${Date.now()}-${paths.length}.${ext}`;
      const { error: upErr } = await supabase.storage.from("adjuntos").upload(path, f, { contentType: f.type });
      if (upErr) { borrarArchivos(paths, "adjuntos"); setGuardando(false); setError("No se pudo subir una de las fotos."); return; }
      paths.push(path);
    }
    const fila = {
      titulo: sanitize(form.titulo), descripcion: sanitize(form.descripcion) || null, categoria: form.categoria,
      condicion: form.condicion, talle: sanitize(form.talle) || null, es_regalo: form.es_regalo,
      precio: form.es_regalo ? null : precio, fotos: paths, alcance: form.alcance,
      curso_id: form.alcance === "curso" || !comoColegio ? form.curso_id : null, colegio_id: colegio,
      publicado_por: userId, es_colegio: !!comoColegio,
    };
    const { data: nuevo, error: err } = await supabase.from("marketplace_articulos").insert(fila).select().single();
    if (err) { borrarArchivos(paths, "adjuntos"); setGuardando(false); setError("No se pudo publicar: " + err.message); return; }
    setGuardando(false);
    onCreado?.(nuevo);
    onClose();
  };

  return (
    <Modal titulo="Publicar en el Marketplace" onClose={onClose}>
      <div style={{ marginBottom: 12 }}>
        <div style={lbl}>FOTOS (hasta {MAX_FOTOS})</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {fotos.map((f, i) => (
            <div key={i} style={{ position: "relative" }}>
              <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, display: "block" }} />
              <button onClick={() => setFotos(fotos.filter((_, j) => j !== i))} aria-label="Quitar foto" style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: "50%", border: "none", background: "#0F172A", color: "white", cursor: "pointer", fontSize: 11 }}>✕</button>
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label style={{ width: 64, height: 64, borderRadius: 10, border: "1.5px dashed #CBD5E1", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748B", fontSize: 22 }}>
              +
              <input type="file" accept="image/*" multiple onChange={(e) => { elegirFotos(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
          )}
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>QUÉ ES</div>
        <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej: Buzo del uniforme talle 10" style={inp} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>CATEGORÍA</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATEGORIAS.map((c) => <button key={c.k} onClick={() => set("categoria", c.k)} style={chip(form.categoria === c.k)}>{c.e} {c.l}</button>)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 200px" }}>
          <div style={lbl}>ESTADO</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CONDICIONES.map((c) => <button key={c.k} onClick={() => set("condicion", c.k)} style={chip(form.condicion === c.k)}>{c.l}</button>)}
          </div>
        </div>
        <div style={{ flex: "1 1 100px" }}>
          <div style={lbl}>TALLE (opcional)</div>
          <input value={form.talle} onChange={(e) => set("talle", e.target.value)} placeholder="Ej: 10" style={inp} />
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>PRECIO</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 160px", opacity: form.es_regalo ? 0.4 : 1 }}>
            <span style={{ fontSize: 14, color: "#64748B" }}>$</span>
            <input value={form.precio} onChange={(e) => set("precio", e.target.value)} disabled={form.es_regalo} inputMode="decimal" placeholder="15000" style={inp} />
          </div>
          <button onClick={() => set("es_regalo", !form.es_regalo)} style={{ ...chip(form.es_regalo), padding: "8px 12px" }}>{form.es_regalo ? "✓ " : ""}🎁 Lo regalo</button>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={lbl}>DETALLE (opcional)</div>
        <textarea value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={3} placeholder="Marca, cómo está, dónde se retira…" style={{ ...inp, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={lbl}>¿QUIÉN LO VE?</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {[["colegio", "Todo el colegio"], ["curso", comoColegio ? "Un curso" : "Mi curso"]].map(([k, t]) => (
            <button key={k} onClick={() => set("alcance", k)} style={chip(form.alcance === k)}>{t}</button>
          ))}
        </div>
        {(form.alcance === "curso" || !comoColegio) && cursos.length > 1 && (
          <select value={form.curso_id || ""} onChange={(e) => set("curso_id", e.target.value)} style={inp} aria-label="Curso">
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 10 }}>Se ve {DIAS_VIGENCIA} días (lo podés renovar). Cuando alguien toca "Me interesa" te avisamos y se comparten los contactos. El pago lo arreglan entre ustedes.</div>
      {error && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ ...btnSec, flex: 1, color: "#94A3B8" }}>Cancelar</button>
        <button onClick={publicar} disabled={guardando} style={{ ...btnPri, flex: 2, opacity: guardando ? 0.6 : 1 }}>{guardando ? "Publicando…" : "Publicar"}</button>
      </div>
    </Modal>
  );
}

/** Lista + acciones, compartida por la pestaña de las familias y la sección del colegio. */
function Tablero({ cursoIds, cursosPublicar, colegioId, comoColegio, userId, puedeModerar, tagDeCurso }) {
  const [datos, setDatos] = useState(null);
  const [cat, setCat] = useState("todas");
  const [soloRegalos, setSoloRegalos] = useState(false);
  const [mios, setMios] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [interesando, setInteresando] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [contacto, setContacto] = useState(null); // { articulo, c }
  const [interesados, setInteresados] = useState(null); // { articulo, lista }
  const [vendiendo, setVendiendo] = useState(null); // { articulo, lista, comprador }

  const cargar = useCallback(async () => setDatos(await cargarDatos(cursoIds, userId)), [cursoIds, userId]);
  useCargar(cargar);

  const gestiona = (a) => a.publicado_por === userId || puedeModerar(a);

  const meInteresa = async () => {
    const a = interesando;
    const { error } = await supabase.from("marketplace_interesados").insert({ articulo_id: a.id, usuario_id: userId, mensaje: sanitize(mensaje) || null });
    if (error) { alert("No se pudo avisar. Probá de nuevo."); return; }
    if (a.publicado_por) await sendPush({ type: "marketplace", payload: { titulo: `Alguien está interesado en: ${a.titulo}`, userIds: [a.publicado_por] } });
    setInteresando(null); setMensaje(""); setAbierto(null);
    await cargar();
    verContacto(a);
  };
  const verContacto = async (a) => {
    setContacto({ articulo: a, c: null });
    const { data } = await supabase.rpc("contacto_articulo", { p_id: a.id });
    setContacto({ articulo: a, c: data?.[0] || { nombre: "—" } });
  };
  const verInteresados = async (a) => {
    setInteresados({ articulo: a, lista: null });
    const { data } = await supabase.rpc("interesados_articulo", { p_id: a.id });
    setInteresados({ articulo: a, lista: data || [] });
  };
  const abrirVendido = async (a) => {
    setVendiendo({ articulo: a, lista: null, comprador: "" });
    const { data } = await supabase.rpc("interesados_articulo", { p_id: a.id });
    setVendiendo({ articulo: a, lista: data || [], comprador: "" });
  };
  const confirmarVendido = async () => {
    const { articulo, comprador } = vendiendo;
    await supabase.from("marketplace_articulos").update({ estado: "vendido", vendido_en: new Date().toISOString(), comprador_id: comprador || null }).eq("id", articulo.id);
    setVendiendo(null); setAbierto(null);
    cargar();
  };
  const renovar = async (a) => {
    await supabase.from("marketplace_articulos").update({ vence_en: new Date(Date.now() + DIAS_VIGENCIA * 86400000).toISOString() }).eq("id", a.id);
    setAbierto(null);
    cargar();
  };
  const borrar = async (a) => {
    if (!confirm("¿Borrar esta publicación?")) return;
    const { error } = await supabase.from("marketplace_articulos").delete().eq("id", a.id);
    if (error) { alert("No se pudo borrar."); return; }
    borrarArchivos(a.fotos, "adjuntos");
    setAbierto(null);
    cargar();
  };

  const visibles = useMemo(() => ordenar((datos?.articulos || []).filter((a) => estaVisible(a) || a.publicado_por === userId)), [datos, userId]);
  if (!datos) return <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div>;
  const lista = visibles.filter((a) =>
    (cat === "todas" || a.categoria === cat) && (!soloRegalos || a.es_regalo) && (!mios || a.publicado_por === userId) && coincideBusqueda(a, busqueda));

  return (
    <div>
      {nuevo && <NuevoModal cursos={cursosPublicar} colegioId={colegioId} comoColegio={comoColegio} userId={userId} onClose={() => setNuevo(false)} onCreado={() => cargar()} />}
      {abierto && (
        <Detalle
          a={abierto} userId={userId} gestiona={gestiona(abierto)} yaMeInteresa={datos.misInteres.has(abierto.id)}
          nInteresados={datos.interesadosDe[abierto.id] || 0} tag={tagDeCurso?.(abierto.curso_id)}
          onClose={() => setAbierto(null)} onMeInteresa={(a) => { setInteresando(a); setMensaje(""); }} onVerContacto={verContacto}
          onVerInteresados={verInteresados} onVendido={abrirVendido} onRenovar={renovar} onBorrar={borrar}
        />
      )}
      {interesando && (
        <Modal titulo="🙋 Me interesa" onClose={() => setInteresando(null)}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 10, lineHeight: 1.5 }}>Le avisamos a quien lo publicó y se comparten los contactos de los dos para que se pongan de acuerdo.</div>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={2} placeholder="Mensaje (opcional): ej. ¿sigue disponible? Lo puedo retirar el viernes" style={{ ...inp, resize: "vertical", marginBottom: 10 }} />
          <button onClick={meInteresa} style={{ ...btnPri, width: "100%" }}>Avisar y ver el contacto</button>
        </Modal>
      )}
      {contacto && (
        <Modal titulo="📞 Contacto del vendedor" onClose={() => setContacto(null)} ancho={380}>
          <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>{contacto.articulo.titulo} · {fmtPrecio(contacto.articulo)}</div>
          <ContactoCard c={contacto.c} />
        </Modal>
      )}
      {interesados && (
        <Modal titulo="🙋 Interesados" onClose={() => setInteresados(null)} ancho={400}>
          <div style={{ fontSize: 12.5, color: "#64748B", marginBottom: 8 }}>{interesados.articulo.titulo}</div>
          {!interesados.lista ? <ContactoCard c={null} /> : interesados.lista.map((x) => <ContactoCard key={x.usuario_id} c={x} />)}
        </Modal>
      )}
      {vendiendo && (
        <Modal titulo="✓ Marcar como vendido" onClose={() => setVendiendo(null)} ancho={400}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>{vendiendo.articulo.titulo}</div>
          {vendiendo.lista?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={lbl}>¿A QUIÉN SE LO VENDISTE? (opcional)</div>
              <select value={vendiendo.comprador} onChange={(e) => setVendiendo((v) => ({ ...v, comprador: e.target.value }))} style={inp} aria-label="Comprador">
                <option value="">Prefiero no decirlo / a otra persona</option>
                {vendiendo.lista.map((x) => <option key={x.usuario_id} value={x.usuario_id}>{x.nombre}</option>)}
              </select>
            </div>
          )}
          <div style={{ fontSize: 11.5, color: "#94A3B8", marginBottom: 12 }}>Se sigue viendo una semana marcado como vendido y después desaparece.</div>
          <button onClick={confirmarVendido} style={{ ...btnPri, width: "100%" }}>Marcar vendido</button>
        </Modal>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar: buzo, talle 10, libro de inglés…" aria-label="Buscar en el Marketplace" style={{ ...inp, flex: "1 1 200px", background: "white" }} />
        <button onClick={() => setNuevo(true)} style={btnPri}>+ Publicar</button>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ k: "todas", l: "Todo", e: "" }, ...CATEGORIAS].map((c) => <button key={c.k} onClick={() => setCat(c.k)} style={chip(cat === c.k)}>{c.e} {c.l}</button>)}
        <button onClick={() => setSoloRegalos(!soloRegalos)} style={chip(soloRegalos)}>🎁 Regalos</button>
        <button onClick={() => setMios(!mios)} style={chip(mios)}>Mis publicaciones</button>
      </div>
      {!lista.length ? (
        <Card style={{ padding: 28, textAlign: "center" }}>
          <div style={{ fontSize: 30 }}>🛍️</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>{visibles.length ? "No hay nada con esos filtros" : "Todavía no hay nada publicado"}</div>
          <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 4 }}>¿Tenés un uniforme que ya no le entra, libros del año pasado o un disfraz? Publicalo.</div>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
          {lista.map((a) => <Tarjeta key={a.id} a={a} tag={tagDeCurso?.(a.curso_id)} onAbrir={setAbierto} />)}
        </div>
      )}
    </div>
  );
}

/** Pestaña de las familias (dentro de Comunidad). */
export function Marketplace({ cursoId, cursoIds = [], esVistaTodos = false, tagDeCurso = null, userId }) {
  const [cursos, setCursos] = useState([]);
  const cargarCursos = useCallback(async () => {
    if (!cursoIds.length) return;
    const { data } = await supabase.from("cursos").select("id,nombre,colegio_id").in("id", esVistaTodos ? cursoIds : [cursoId]);
    setCursos(data || []);
  }, [cursoIds, esVistaTodos, cursoId]);
  useCargar(cargarCursos);
  return <Tablero cursoIds={cursoIds} cursosPublicar={cursos} colegioId={cursos[0]?.colegio_id} comoColegio={false} userId={userId} puedeModerar={() => false} tagDeCurso={esVistaTodos ? tagDeCurso : null} />;
}

/** Sección del Super Admin: el colegio publica (feria de uniformes, etc.) y modera todo lo del colegio. */
export function MarketplaceColegio({ cursos, colegioId, userId }) {
  const clave = cursos.map((c) => c.id).join(",");
  const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);
  const tag = (cid) => {
    const c = cursos.find((x) => x.id === cid);
    return c ? { nombre: c.nombre, color: c.color || "#94A3B8" } : null;
  };
  return <Tablero cursoIds={ids} cursosPublicar={cursos} colegioId={colegioId} comoColegio userId={userId} puedeModerar={() => true} tagDeCurso={tag} />;
}
