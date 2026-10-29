// Fotos escolares (supabase/fotos-escolares.sql, reglas en @shared/fotosEscolares).
// La Secretaría arma una sesión por curso (opciones con precio, copias por
// tamaño, vencimiento, datos de pago), sube las fotos y asigna cada una a su
// alumno. La familia ve solo las de su hijo (y las grupales) con la marca de
// agua grabada, elige y hace el pedido; si está pagado y la opción es digital,
// descarga el original. FotosEscolaresColegio es la sección del panel.
import { useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../supabase";
import { useCargar } from "../../hooks/useCargar";
import { useConfirmar } from "../../hooks/useConfirmar";
import { useSignedUrl } from "../../components/SignedImg";
import { BotonNuevo } from "../../components/BotonNuevo";
import { EmptyState } from "../../components/EmptyState";
import { SubSeccion } from "../../components/SubSeccion";
import { CursoListSelector } from "../../components/CursoListSelector";
import { BotonFiltros, FiltrosModal } from "../../components/Filtros";
import { Icono } from "../../components/Icono";
import { sanitize, fmtLocalDate, fmtM, fmtF, fmtNombre, uuidLite } from "../../lib/helpers";
import { sendPush, getUserIdsByCurso } from "../../lib/push";
import { prepararFotoEscolar } from "../../lib/imagenesWeb";
import {
  BUCKET_FOTOS, sesionVacia, opcionVacia, copiaVacia, copiarConfiguracion, validarSesion, filaSesion, sesionVencida,
  totalPedido, validarPedido, copiasParaGuardar, estadoPedido, puedeEditarPedido, fotosDeAlumno, fotoDescargable,
  pathsFoto, textoCopia, filasExcelPedidos,
} from "../../lib/fotosEscolares";

const inp = { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box", color: "#0F172A" };
const label = { fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 6, marginTop: 14 };
const linkBtn = { border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" };
const tituloLista = { fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: "#94A3B8", textTransform: "uppercase", margin: "20px 0 8px" };
const tarjeta = { border: "1px solid #E2E8F0", borderRadius: 14, background: "white", padding: "14px 16px", marginBottom: 10 };
const TONO = { pendiente: "#B45309", informado: "#2563EB", pagado: "#047857", entregado: "#047857", listo: "#047857", sin_pedido: "#94A3B8" };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const ordenArchivo =(a, b) => (a.orden - b.orden) || a.archivo.localeCompare(b.archivo, "es", { numeric: true });

function BotonPrimario({ onClick, disabled, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#2563EB", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit", minHeight: 40, ...style }}>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: "white" }}>{children}</span>
    </button>
  );
}
function BotonSecundario({ onClick, disabled, children, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1, fontFamily: "inherit", minHeight: 40, ...style }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#334155" }}>{children}</span>
    </button>
  );
}

// Imagen que no se puede guardar con clic derecho ni arrastrar (la marca de
// agua está grabada en el archivo; esto solo evita el "Guardar imagen como").
function FotoProtegida({ path, miniatura = false, style, onClick, alt = "" }) {
  const url = useSignedUrl(path, BUCKET_FOTOS, miniatura);
  const bloquear = (e) => e.preventDefault();
  return (
    <div onContextMenu={bloquear} onClick={onClick} style={{ position: "relative", overflow: "hidden", background: "#F1F5F9", cursor: onClick ? "pointer" : "default", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", ...style }}>
      {url ? <img src={url} alt={alt} draggable={false} onDragStart={bloquear} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} /> : null}
    </div>
  );
}

function Ampliada({ foto, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.88)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <button onClick={onClose} aria-label="Cerrar" style={{ ...linkBtn, position: "absolute", top: 14, right: 14, width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}><Icono nombre="cerrar" size={24} color="white" /></button>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "min(92vw, 900px)", width: "100%" }}>
        <FotoProtegida path={foto.path_muestra} alt={foto.archivo} style={{ width: "100%", aspectRatio: "3 / 4", maxHeight: "82vh", borderRadius: 12, background: "#0F172A" }} />
        <div style={{ textAlign: "center", marginTop: 8 }}><span style={{ fontSize: 13, color: "#E2E8F0" }}>{foto.tipo === "grupal" ? "Foto grupal" : foto.archivo}</span></div>
      </div>
    </div>
  );
}

async function descargarOriginal(foto) {
  const nombre = foto.archivo?.toLowerCase().endsWith(".jpg") ? foto.archivo : `${foto.archivo || "foto"}.jpg`;
  const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrl(foto.path, 120, { download: nombre });
  if (error || !data?.signedUrl) return false;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

function Stepper({ valor, onCambio, max = 20, etiqueta }) {
  const b = { width: 32, height: 32, borderRadius: 8, border: "1px solid #E2E8F0", background: "white", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }} aria-label={etiqueta}>
      <button type="button" style={b} onClick={() => onCambio(Math.max(0, valor - 1))} aria-label={`Una copia menos de ${etiqueta}`}><span style={{ fontSize: 16, fontWeight: 700, color: "#334155" }}>−</span></button>
      <span style={{ minWidth: 20, textAlign: "center", fontSize: 14, fontWeight: 800, color: valor ? "#0F172A" : "#94A3B8" }}>{valor}</span>
      <button type="button" style={b} onClick={() => onCambio(Math.min(max, valor + 1))} aria-label={`Una copia más de ${etiqueta}`}><span style={{ fontSize: 16, fontWeight: 700, color: "#334155" }}>+</span></button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Familia
// ─────────────────────────────────────────────────────────────────────────

/** Pedido de un alumno en una sesión: fotos, opción, copias, pago y descarga. */
function PedidoAlumno({ sesion, hijo, fotos, pedido, tag, onVolver, onCambio }) {
  const hoy = fmtLocalDate();
  const propias = fotos.filter((f) => f.tipo === "alumno");
  const todas = fotosDeAlumno(fotos, hijo.id);
  const editable = puedeEditarPedido(sesion, pedido, hoy);
  const [form, setForm] = useState(() => ({
    opcionId: pedido?.opcion_id || null,
    fotoId: pedido?.foto_id || (propias.length === 1 ? propias[0].id : null),
    copias: (pedido?.copias || []).map((c) => ({ foto_id: c.foto_id, copia_id: c.copia_id, cantidad: c.cantidad })),
    comentario: pedido?.comentario || "",
  }));
  const [editando, setEditando] = useState(!pedido);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ampliada, setAmpliada] = useState(null);
  const [confirmar, confirmUI] = useConfirmar();

  const cantidad = (fotoId, copiaId) => form.copias.find((c) => c.foto_id === fotoId && c.copia_id === copiaId)?.cantidad || 0;
  const setCantidad = (fotoId, copiaId, n) => setForm((p) => ({
    ...p,
    copias: [...p.copias.filter((c) => !(c.foto_id === fotoId && c.copia_id === copiaId)), ...(n > 0 ? [{ foto_id: fotoId, copia_id: copiaId, cantidad: n }] : [])],
  }));
  const total = totalPedido(sesion, form);

  const guardar = async () => {
    const err = validarPedido(sesion, form);
    if (err) { setError(err); return; }
    setGuardando(true); setError(null);
    const { error: e } = await supabase.rpc("guardar_pedido_fotos", {
      p_sesion: sesion.id, p_hijo: hijo.id, p_opcion: form.opcionId, p_foto: form.opcionId ? form.fotoId : null,
      p_copias: copiasParaGuardar(form.copias), p_comentario: sanitize(form.comentario || ""),
    });
    setGuardando(false);
    if (e) { setError(e.message?.length < 120 ? e.message : "No se pudo guardar. Probá de nuevo."); return; }
    setEditando(false);
    setAviso("Pedido guardado. Cuando pagues, avisá con “Ya pagué”.");
    onCambio();
  };

  const informarPago = async (valor) => {
    await supabase.rpc("informar_pago_fotos", { p_pedido: pedido.id, p_valor: valor });
    setAviso(valor ? "Listo: le avisamos a la Secretaría que pagaste." : null);
    onCambio();
  };

  const anular = async () => {
    if (!(await confirmar({ titulo: "Anular el pedido", detalle: "Se borra lo que elegiste. Podés volver a pedir hasta el vencimiento.", textoConfirmar: "Anular pedido" }))) return;
    await supabase.rpc("borrar_pedido_fotos", { p_pedido: pedido.id });
    onCambio();
    onVolver();
  };

  const descargar = async (f) => {
    if (!(await descargarOriginal(f))) setAviso("No se pudo descargar. Probá de nuevo en un rato.");
  };

  const est = estadoPedido(pedido);
  const fotoElegida = fotos.find((f) => f.id === pedido?.foto_id);

  return (
    <div style={{ maxWidth: 760 }}>
      {confirmUI}
      {ampliada && <Ampliada foto={ampliada} onClose={() => setAmpliada(null)} />}
      <button onClick={onVolver} style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 4, marginBottom: 10, minHeight: 36 }}>
        <Icono nombre="atras" size={18} color="#2563EB" /><span style={{ fontSize: 13.5, fontWeight: 700, color: "#2563EB" }}>Fotos escolares</span>
      </button>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#0F172A" }}>{sesion.titulo} · {hijo.nombre?.split(" ")[0]}</div>
      <div style={{ fontSize: 13, color: "#64748B", marginTop: 2, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {tag && <span style={{ width: 8, height: 8, borderRadius: 999, background: tag.color }} />}
        <span style={{ color: "#64748B" }}>{sesionVencida(sesion, hoy) ? `Venció el ${fmtF(sesion.vence)}` : `Podés pedir hasta el ${fmtF(sesion.vence)}`}</span>
      </div>
      {aviso && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", margin: "12px 0" }}><span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>{aviso}</span></div>}

      <div style={tituloLista}>Las fotos</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {todas.map((f) => (
          <div key={f.id}>
            <FotoProtegida path={f.path_muestra} miniatura alt={f.archivo} onClick={() => setAmpliada(f)} style={{ aspectRatio: "3 / 4", borderRadius: 12 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, gap: 6 }}>
              <span style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.tipo === "grupal" ? "Grupal" : f.archivo}</span>
              {fotoDescargable(f, pedido) && (
                <button onClick={() => descargar(f)} aria-label={`Descargar ${f.archivo}`} style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 3, minHeight: 32 }}>
                  <Icono nombre="descargar" size={16} color="#2563EB" /><span style={{ fontSize: 12.5, fontWeight: 700, color: "#2563EB" }}>Descargar</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>Son muestras con marca de agua. {sesion.opciones?.some((o) => o.digital) ? "Con una opción digital, cuando la Secretaría confirme el pago las podés descargar sin marca." : "Las fotos se entregan impresas en el colegio."}</div>

      {pedido && !editando ? (
        <>
          <div style={tituloLista}>Tu pedido</div>
          <div style={tarjeta}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{fmtM(Number(pedido.total) || 0)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: TONO[est.clave] }}>{est.texto}</span>
            </div>
            <div style={{ fontSize: 13, color: "#334155", marginTop: 8, lineHeight: 1.6 }}>
              {pedido.opcion_nombre && <div><span style={{ fontWeight: 700, color: "#0F172A" }}>{pedido.opcion_nombre}</span><span style={{ color: "#334155" }}>{pedido.digital ? " (digital)" : ""} con {fotoElegida?.archivo || "la foto elegida"}</span></div>}
              {(pedido.copias || []).map((c, i) => <div key={i}><span style={{ color: "#334155" }}>{textoCopia(c, fotos)}</span></div>)}
              {pedido.comentario && <div style={{ color: "#64748B" }}>“{pedido.comentario}”</div>}
            </div>
            {!pedido.pagado_en && sesion.datos_pago && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", borderRadius: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>Cómo pagar</div>
                <div style={{ fontSize: 13, color: "#0F172A", whiteSpace: "pre-wrap", marginTop: 2 }}>{sesion.datos_pago}</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              {!pedido.pagado_en && !pedido.informado_pago_en && <BotonPrimario onClick={() => informarPago(true)}>Ya pagué</BotonPrimario>}
              {!pedido.pagado_en && pedido.informado_pago_en && <button onClick={() => informarPago(false)} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#64748B" }}>Todavía no pagué</span></button>}
              {editable && <BotonSecundario onClick={() => setEditando(true)}>Cambiar pedido</BotonSecundario>}
              {editable && <button onClick={anular} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>Anular</span></button>}
            </div>
            {pedido.pagado_en && !pedido.digital && <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 10 }}>{pedido.entregado_en ? `Entregado el ${fmtF(pedido.entregado_en.slice(0, 10))}.` : "Las fotos impresas se entregan en el colegio."}</div>}
          </div>
        </>
      ) : editable ? (
        <>
          {sesion.opciones?.length > 0 && (
            <>
              <div style={tituloLista}>Elegí una opción</div>
              {sesion.opciones.map((o) => {
                const on = form.opcionId === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setForm((p) => ({ ...p, opcionId: on ? null : o.id }))} style={{ ...tarjeta, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", border: `1.5px solid ${on ? "#2563EB" : "#E2E8F0"}`, background: on ? "#EFF6FF" : "white", display: "block" }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{o.nombre}{o.digital ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "#2563EB" }}>  · DIGITAL</span> : null}</span>
                      <span style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{fmtM(Number(o.precio) || 0)}</span>
                    </span>
                    {o.incluye?.length > 0 && <span style={{ display: "block", fontSize: 12.5, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>{o.incluye.join(" · ")}</span>}
                  </button>
                );
              })}
              {form.opcionId && propias.length > 0 && (
                <>
                  <div style={label}>¿Con qué foto?</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {propias.map((f) => {
                      const on = form.fotoId === f.id;
                      return (
                        <button key={f.id} type="button" onClick={() => setForm((p) => ({ ...p, fotoId: f.id }))} aria-pressed={on} style={{ ...linkBtn, width: 96, borderRadius: 12, padding: 3, border: `2.5px solid ${on ? "#2563EB" : "transparent"}` }}>
                          <FotoProtegida path={f.path_muestra} miniatura alt={f.archivo} style={{ aspectRatio: "3 / 4", borderRadius: 9 }} />
                          <span style={{ display: "block", fontSize: 11, color: on ? "#2563EB" : "#64748B", fontWeight: on ? 800 : 500, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.archivo}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {sesion.copias?.length > 0 && (
            <>
              <div style={tituloLista}>Copias adicionales (opcional)</div>
              {todas.map((f) => (
                <div key={f.id} style={{ ...tarjeta, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <FotoProtegida path={f.path_muestra} miniatura alt={f.archivo} style={{ width: 56, height: 72, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{f.tipo === "grupal" ? "Foto grupal" : f.archivo}</div>
                    {sesion.copias.map((c) => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "3px 0" }}>
                        <span style={{ fontSize: 12.5, color: "#475569" }}>{c.tamano} · {fmtM(Number(c.precio) || 0)}</span>
                        <Stepper valor={cantidad(f.id, c.id)} onCambio={(n) => setCantidad(f.id, c.id, n)} etiqueta={`${c.tamano} de ${f.archivo}`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={label}>Comentario para la Secretaría (opcional)</div>
          <textarea value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} rows={2} maxLength={500} style={{ ...inp, resize: "vertical" }} />

          <div style={{ position: "sticky", bottom: 0, background: "white", borderTop: "1px solid #F1F5F9", marginTop: 14, padding: "12px 0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "#64748B" }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A" }}>{fmtM(total)}</div>
            </div>
            {pedido && <BotonSecundario onClick={() => setEditando(false)}>Cancelar</BotonSecundario>}
            <BotonPrimario onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar pedido"}</BotonPrimario>
          </div>
          {error && <div role="alert" style={{ fontSize: 12.5, color: "#DC2626" }}>{error}</div>}
        </>
      ) : (
        <div style={{ ...tarjeta, marginTop: 16 }}><span style={{ fontSize: 13, color: "#64748B" }}>El plazo para pedir estas fotos venció. Si necesitás algo, escribile a la Secretaría.</span></div>
      )}
    </div>
  );
}

/** Pantalla de las familias (Curso → Fotos escolares). */
export function FotosEscolares({ cursoIds = [], items = [], tagDeCurso = null }) {
  const [datos, setDatos] = useState(null);
  const [abierto, setAbierto] = useState(null); // { sesionId, hijoId }
  const hoy = fmtLocalDate();
  const misHijos = useMemo(() => items.filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)), [items, cursoIds]);

  const cargar = useCallback(async () => {
    if (!cursoIds.length) return;
    const [s, f, p] = await Promise.all([
      supabase.from("fotos_sesiones").select("*").in("curso_id", cursoIds).not("publicada_en", "is", null).order("vence", { ascending: false }),
      supabase.from("fotos").select("id,sesion_id,curso_id,tipo,hijo_id,archivo,path,path_muestra,path_miniatura,orden").in("curso_id", cursoIds),
      supabase.from("fotos_pedidos").select("*").in("curso_id", cursoIds),
    ]);
    if (s.error || f.error || p.error) { setDatos((d) => d || { sesiones: [], fotos: [], pedidos: [] }); return; }
    setDatos({ sesiones: s.data || [], fotos: (f.data || []).sort(ordenArchivo), pedidos: p.data || [] });
  }, [cursoIds]);
  useCargar(cargar);

  // Una tarjeta por sesión y alumno con fotos en ella.
  const tarjetas = useMemo(() => {
    if (!datos) return [];
    const out = [];
    for (const s of datos.sesiones) {
      for (const h of misHijos) {
        if (!datos.fotos.some((f) => f.sesion_id === s.id && f.hijo_id === h.id)) continue;
        out.push({ sesion: s, hijo: h, pedido: datos.pedidos.find((p) => p.sesion_id === s.id && p.hijo_id === h.id) || null });
      }
    }
    return out;
  }, [datos, misHijos]);

  const actual = abierto && tarjetas.find((t) => t.sesion.id === abierto.sesionId && t.hijo.id === abierto.hijoId);
  if (actual) {
    return (
      <PedidoAlumno
        key={`${actual.sesion.id}-${actual.hijo.id}`}
        sesion={actual.sesion} hijo={actual.hijo} pedido={actual.pedido} tag={tagDeCurso?.(actual.sesion.curso_id)}
        fotos={datos.fotos.filter((f) => f.sesion_id === actual.sesion.id)}
        onVolver={() => setAbierto(null)} onCambio={cargar}
      />
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Fotos escolares</div>
      <div style={{ fontSize: 13.5, color: "#64748B", marginTop: 2, marginBottom: 12 }}>Mirá las fotos de tu hijo y elegí cuáles querés.</div>
      {!datos ? <div style={{ padding: 30, textAlign: "center", color: "#94A3B8" }}>Cargando…</div> : !tarjetas.length ? (
        <EmptyState icono="camara" titulo="Todavía no hay fotos" nota="Cuando el colegio publique las fotos escolares, te avisamos y aparecen acá para que elijas." />
      ) : tarjetas.map(({ sesion, hijo, pedido }) => {
        const est = estadoPedido(pedido);
        const vencida = sesionVencida(sesion, hoy);
        const tag = tagDeCurso?.(sesion.curso_id);
        return (
          <button key={`${sesion.id}-${hijo.id}`} onClick={() => setAbierto({ sesionId: sesion.id, hijoId: hijo.id })} style={{ ...tarjeta, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icono nombre="camara" size={20} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{sesion.titulo} · {hijo.nombre?.split(" ")[0]}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "#64748B", marginTop: 2 }}>
                {tag && <span style={{ width: 8, height: 8, borderRadius: 999, background: tag.color }} />}
                <span style={{ color: "#64748B" }}>{vencida ? `Venció el ${fmtF(sesion.vence)}` : `Hasta el ${fmtF(sesion.vence)}`}</span>
              </span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: pedido ? TONO[est.clave] : vencida ? "#94A3B8" : "#B45309", whiteSpace: "nowrap" }}>{pedido ? est.texto : vencida ? "Sin pedido" : "Elegir fotos"}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Panel del colegio
// ─────────────────────────────────────────────────────────────────────────

function FormSesion({ inicial, cursos, otras, onClose, onGuardado }) {
  const hoy = fmtLocalDate();
  const nueva = !inicial?.id;
  const [form, setForm] = useState(() => (nueva ? sesionVacia() : copiarConfiguracionMismaIds(inicial)));
  const [cursoIds, setCursoIds] = useState(inicial?.curso_id ? [inicial.curso_id] : []);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setOpcion = (i, k, v) => setForm((p) => ({ ...p, opciones: p.opciones.map((o, j) => (j === i ? { ...o, [k]: v } : o)) }));
  const setCopia = (i, k, v) => setForm((p) => ({ ...p, copias: p.copias.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  const guardar = async () => {
    if (nueva && !cursoIds.length) { setError("Elegí al menos un curso."); return; }
    const err = validarSesion(form, nueva ? hoy : null);
    if (err) { setError(err); return; }
    setGuardando(true); setError(null);
    const fila = filaSesion(form, { sanitize });
    const { error: e } = nueva
      ? await supabase.from("fotos_sesiones").insert(cursoIds.map((curso_id) => ({ ...fila, curso_id })))
      : await supabase.from("fotos_sesiones").update(fila).eq("id", inicial.id);
    setGuardando(false);
    if (e) { setError("No se pudo guardar. Revisá los datos y probá de nuevo."); return; }
    onGuardado(nueva ? cursoIds.length : 0);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div role="dialog" aria-label={nueva ? "Nueva sesión de fotos" : "Editar sesión de fotos"} onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 16, padding: 22, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{nueva ? "Nueva sesión de fotos" : "Editar sesión de fotos"}</div>
        <div style={{ fontSize: 12.5, color: "#64748B", marginTop: 4, lineHeight: 1.45 }}>Como el sobre de la fotógrafa: opciones con precio, copias adicionales y hasta cuándo se pueden pedir. Las familias no ven nada hasta que la publiques.</div>

        {nueva && otras.length > 0 && (
          <>
            <div style={label}>Copiar precios de otra sesión (opcional)</div>
            <select defaultValue="" onChange={(e) => { const o = otras.find((x) => x.id === e.target.value); if (o) setForm(copiarConfiguracion(o)); }} style={inp}>
              <option value="">— Elegir —</option>
              {otras.map((o) => <option key={o.id} value={o.id}>{o.titulo} · {o.cursoNombre}</option>)}
            </select>
          </>
        )}

        {nueva && (
          <>
            <div style={label}>Cursos (una sesión por curso)</div>
            <CursoListSelector cursos={cursos} seleccionados={cursoIds} onToggle={(id) => setCursoIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
          </>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 220px" }}>
            <div style={label}>Título</div>
            <input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} maxLength={60} style={inp} />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <div style={label}>Válido hasta</div>
            <input type="date" min={nueva ? hoy : undefined} value={form.vence} onChange={(e) => set("vence", e.target.value)} style={inp} />
          </div>
        </div>

        <div style={label}>Opciones de impresión</div>
        {form.opciones.map((o, i) => (
          <div key={o.id} style={{ border: "1px solid #E2E8F0", borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={o.nombre} onChange={(e) => setOpcion(i, "nombre", e.target.value)} placeholder="Opción A" aria-label="Nombre de la opción" maxLength={40} style={{ ...inp, flex: "2 1 160px" }} />
              <input type="number" min={0} value={o.precio} onChange={(e) => setOpcion(i, "precio", e.target.value)} aria-label="Precio" style={{ ...inp, flex: "1 1 100px" }} />
            </div>
            <textarea value={(o.incluye || []).join("\n")} onChange={(e) => setOpcion(i, "incluye", e.target.value.split("\n"))} rows={3} placeholder={"Qué incluye, un ítem por línea\n1 carpeta contenedora\n1 foto grupal (15x21 cm)"} aria-label="Qué incluye" style={{ ...inp, marginTop: 8, resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, flexWrap: "wrap", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", minHeight: 32 }}>
                <input type="checkbox" checked={!!o.digital} onChange={(e) => setOpcion(i, "digital", e.target.checked)} />
                <span style={{ fontSize: 13, color: "#334155" }}>Digital: pagada, la familia descarga la foto sin marca</span>
              </label>
              <button onClick={() => setForm((p) => ({ ...p, opciones: p.opciones.filter((_, j) => j !== i) }))} style={linkBtn}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#DC2626" }}>Quitar</span></button>
            </div>
          </div>
        ))}
        <button onClick={() => setForm((p) => ({ ...p, opciones: [...p.opciones, opcionVacia(p.opciones.length)] }))} style={{ ...linkBtn, minHeight: 32 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>+ Agregar opción</span></button>

        <div style={label}>Copias adicionales (precio por copia)</div>
        {form.copias.map((c, i) => (
          <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input value={c.tamano} onChange={(e) => setCopia(i, "tamano", e.target.value)} placeholder="15x21" aria-label="Tamaño" maxLength={30} style={{ ...inp, flex: 2 }} />
            <input type="number" min={0} value={c.precio} onChange={(e) => setCopia(i, "precio", e.target.value)} aria-label="Precio" style={{ ...inp, flex: 1 }} />
            <button onClick={() => setForm((p) => ({ ...p, copias: p.copias.filter((_, j) => j !== i) }))} aria-label="Quitar tamaño" style={{ ...linkBtn, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}><Icono nombre="cerrar" size={16} color="#DC2626" /></button>
          </div>
        ))}
        <button onClick={() => setForm((p) => ({ ...p, copias: [...p.copias, copiaVacia()] }))} style={{ ...linkBtn, minHeight: 32 }}><span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>+ Agregar tamaño</span></button>

        <div style={label}>Cómo pagar</div>
        <textarea value={form.datos_pago} onChange={(e) => set("datos_pago", e.target.value)} rows={2} maxLength={400} placeholder="Ej.: transferencia al alias FOTOS.COLEGIO, o efectivo en Secretaría" style={{ ...inp, resize: "vertical" }} />

        {error && <div role="alert" style={{ fontSize: 12.5, color: "#DC2626", marginTop: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <BotonSecundario onClick={onClose} style={{ flex: 1 }}>Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={guardando} style={{ flex: 2 }}>{guardando ? "Guardando…" : "Guardar"}</BotonPrimario>
        </div>
      </div>
    </div>
  );
}
// Editar mantiene los ids de las opciones (los pedidos ya hechos los referencian).
const copiarConfiguracionMismaIds = (s) => ({
  titulo: s.titulo, vence: s.vence, datos_pago: s.datos_pago || "",
  opciones: (s.opciones || []).map((o) => ({ ...o, incluye: [...(o.incluye || [])] })),
  copias: (s.copias || []).map((c) => ({ ...c })),
});

/** Fotos de una sesión: subir y asignar a cada alumno (o grupal). */
function FotosSesion({ sesion, alumnos, fotos, colegioNombre, onCambio }) {
  const [pincel, setPincel] = useState(null); // hijo_id | "grupal" | null
  const [subiendo, setSubiendo] = useState(null); // { hechas, total, errores }
  const [ampliada, setAmpliada] = useState(null);
  const [confirmar, confirmUI] = useConfirmar();
  const input = useRef(null);
  const porAlumno = useMemo(() => {
    const m = new Map();
    for (const f of fotos) if (f.hijo_id) m.set(f.hijo_id, (m.get(f.hijo_id) || 0) + 1);
    return m;
  }, [fotos]);
  const sinAsignar = fotos.filter((f) => f.tipo === "alumno" && !f.hijo_id).length;

  const subir = async (files) => {
    const lista = [...files].filter((f) => f.type === "image/jpeg" || f.type === "image/png")
      .sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    if (!lista.length) return;
    const marca = `MUESTRA · ${colegioNombre || "tribbu"}`;
    // El orden sale del nombre del archivo, no de cuál termina de subir primero.
    const base = fotos.reduce((m, f) => Math.max(m, f.orden + 1), 0);
    const ordenDe = new Map(lista.map((f, i) => [f, base + i]));
    let hechas = 0, errores = 0;
    setSubiendo({ hechas, total: lista.length, errores });
    const una = async (file) => {
      const id = uuidLite();
      const p = pathsFoto(sesion.curso_id, sesion.id, id);
      try {
        const { original, muestra, mini } = await prepararFotoEscolar(file, marca);
        const st = supabase.storage.from(BUCKET_FOTOS);
        const r = await Promise.all([
          st.upload(p.path, original, { contentType: "image/jpeg" }),
          st.upload(p.path_muestra, muestra, { contentType: "image/jpeg" }),
          st.upload(p.path_miniatura, mini, { contentType: "image/jpeg" }),
        ]);
        if (r.some((x) => x.error)) throw new Error("upload");
        const { error } = await supabase.from("fotos").insert({ sesion_id: sesion.id, curso_id: sesion.curso_id, archivo: file.name.slice(0, 120), orden: ordenDe.get(file), ...p });
        if (error) throw error;
        hechas++;
      } catch {
        errores++;
        supabase.storage.from(BUCKET_FOTOS).remove([p.path, p.path_muestra, p.path_miniatura]);
      }
      setSubiendo({ hechas, total: lista.length, errores });
    };
    // De a 3 a la vez: más rápido sin saturar la conexión.
    const cola = [...lista];
    await Promise.all([0, 1, 2].map(async () => { while (cola.length) await una(cola.shift()); }));
    setSubiendo({ hechas, total: lista.length, errores, fin: true });
    onCambio();
  };

  const asignar = async (f) => {
    if (!pincel) { setAmpliada(f); return; }
    const cambio = pincel === "grupal"
      ? (f.tipo === "grupal" ? { tipo: "alumno", hijo_id: null } : { tipo: "grupal", hijo_id: null })
      : (f.hijo_id === pincel ? { tipo: "alumno", hijo_id: null } : { tipo: "alumno", hijo_id: pincel });
    await supabase.from("fotos").update(cambio).eq("id", f.id);
    onCambio();
  };

  const borrar = async (f) => {
    if (!(await confirmar({ titulo: "Borrar la foto", detalle: `Se borra ${f.archivo}. Si alguna familia la eligió, tiene que elegir otra.`, textoConfirmar: "Borrar" }))) return;
    await supabase.storage.from(BUCKET_FOTOS).remove([f.path, f.path_muestra, f.path_miniatura]);
    await supabase.from("fotos").delete().eq("id", f.id);
    setAmpliada(null);
    onCambio();
  };

  const nombrePincel = pincel === "grupal" ? "Grupal" : fmtNombre(alumnos.find((a) => a.id === pincel));
  const destinos = [{ id: "grupal", nombre: "Grupal (todo el curso)", n: fotos.filter((f) => f.tipo === "grupal").length }, ...alumnos.map((a) => ({ id: a.id, nombre: fmtNombre(a), n: porAlumno.get(a.id) || 0 }))];
  const idxPincel = destinos.findIndex((d) => d.id === pincel);
  const sinFotos = destinos.filter((d) => d.id !== "grupal" && !d.n).length;
  const mover = (paso) => setPincel(destinos[Math.min(destinos.length - 1, Math.max(0, idxPincel + paso))]?.id || null);
  const flecha = (off) => ({ width: 40, height: 40, borderRadius: 10, border: "1px solid #E2E8F0", background: "white", cursor: off ? "default" : "pointer", opacity: off ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" });
  return (
    <div>
      {confirmUI}
      {ampliada && (
        <div onClick={() => setAmpliada(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.88)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, flexDirection: "column", gap: 10 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(92vw, 640px)" }}>
            <FotoProtegida path={ampliada.path_muestra} style={{ width: "100%", aspectRatio: "3 / 4", maxHeight: "75vh", borderRadius: 12 }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, gap: 10 }}>
              <span style={{ fontSize: 13, color: "#E2E8F0" }}>{ampliada.archivo}</span>
              <button onClick={() => borrar(ampliada)} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#FCA5A5" }}>Borrar foto</span></button>
            </div>
          </div>
        </div>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png" multiple style={{ display: "none" }} onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <BotonPrimario onClick={() => input.current?.click()} disabled={!!subiendo && !subiendo.fin}>Subir fotos</BotonPrimario>
        {subiendo && <span style={{ fontSize: 13, color: subiendo.errores ? "#DC2626" : "#64748B" }}>{subiendo.fin ? `Listo: ${subiendo.hechas} subidas` : `Subiendo ${subiendo.hechas + subiendo.errores + 1} de ${subiendo.total}…`}{subiendo.errores ? ` · ${subiendo.errores} con error` : ""}</span>}
      </div>
      <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>Se suben las originales y el sistema arma una copia con marca de agua, que es lo único que ven las familias. Para asignar: elegí un alumno (o “Grupal”) y tocá sus fotos; tocá de nuevo para sacarla. Con › pasás al alumno siguiente.</div>

      {/* Barra compacta: un desplegable en vez de un chip por alumno (con 30
          alumnos los chips ocupaban media pantalla) y ‹ › para recorrer la
          lista en orden, que es como la fotógrafa entrega las fotos. */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#F8FAFC", padding: "8px 0", marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>Asignar a</span>
        <button type="button" onClick={() => mover(-1)} disabled={!pincel || idxPincel <= 0} aria-label="Alumno anterior" style={flecha(!pincel || idxPincel <= 0)}><Icono nombre="atras" size={18} color="#334155" /></button>
        <select value={pincel || ""} onChange={(e) => setPincel(e.target.value || null)} aria-label="Asignar a" style={{ ...inp, width: "auto", flex: "1 1 220px", maxWidth: 360, background: "white", borderColor: pincel ? "#2563EB" : "#E2E8F0" }}>
          <option value="">— Elegí un alumno —</option>
          {destinos.map((d) => <option key={d.id} value={d.id}>{d.n ? `${d.nombre} · ${d.n}` : `${d.nombre} · sin fotos`}</option>)}
        </select>
        <button type="button" onClick={() => mover(1)} disabled={idxPincel >= destinos.length - 1} aria-label="Alumno siguiente" style={flecha(idxPincel >= destinos.length - 1)}><Icono nombre="atras" size={18} color="#334155" style={{ transform: "rotate(180deg)" }} /></button>
        {sinFotos > 0 && <button type="button" onClick={() => setPincel(destinos.find((d) => d.id !== "grupal" && !d.n)?.id || null)} style={linkBtn}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#B45309" }}>{sinFotos === 1 ? "1 alumno sin fotos" : `${sinFotos} alumnos sin fotos`}</span></button>}
      </div>
      {pincel && <div style={{ fontSize: 13, fontWeight: 700, color: "#2563EB", marginBottom: 8 }}>Tocá las fotos de {nombrePincel}</div>}
      {sinAsignar > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#B45309", marginBottom: 8 }}>{sinAsignar === 1 ? "1 foto sin asignar" : `${sinAsignar} fotos sin asignar`}</div>}

      {!fotos.length ? <EmptyState icono="camara" titulo="Todavía no hay fotos" nota="Subí las fotos que te pasó la fotógrafa (JPG o PNG). Podés elegir muchas a la vez." accion="Subir fotos" onAccion={() => input.current?.click()} /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
          {fotos.map((f) => {
            const alumno = f.hijo_id ? alumnos.find((a) => a.id === f.hijo_id) : null;
            const marcada = pincel && ((pincel === "grupal" && f.tipo === "grupal") || f.hijo_id === pincel);
            return (
              <div key={f.id} style={{ borderRadius: 12, padding: 2, border: `2.5px solid ${marcada ? "#2563EB" : "transparent"}` }}>
                <FotoProtegida path={f.path_muestra} miniatura alt={f.archivo} onClick={() => asignar(f)} style={{ aspectRatio: "3 / 4", borderRadius: 9 }} />
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.archivo}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: f.tipo === "grupal" ? "#2563EB" : alumno ? "#0F172A" : "#B45309", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.tipo === "grupal" ? "Grupal" : alumno ? fmtNombre(alumno) : "Sin asignar"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Pedidos de una sesión: uno por alumno, con pagado / entregado y Excel. */
function PedidosSesion({ alumnos, fotos, pedidos, cursoNombre, onCambio }) {
  const [filtro, setFiltro] = useState("todos");
  const [verFiltros, setVerFiltros] = useState(false);
  const [buscar, setBuscar] = useState("");
  const [confirmar, confirmUI] = useConfirmar();
  const porHijo = new Map(pedidos.map((p) => [p.hijo_id, p]));
  const conFotos = alumnos.filter((a) => fotos.some((f) => f.hijo_id === a.id));
  const q = buscar.trim().toLowerCase();
  const filas = conFotos
    .map((a) => ({ a, p: porHijo.get(a.id) || null }))
    .filter(({ a, p }) => {
      if (q && !fmtNombre(a).toLowerCase().includes(q)) return false;
      const c = estadoPedido(p).clave;
      if (filtro === "sin_pedido") return !p;
      if (filtro === "pendiente") return c === "pendiente" || c === "informado";
      if (filtro === "informado") return c === "informado";
      if (filtro === "pagado") return !!p?.pagado_en;
      return true;
    });
  const total = pedidos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const cobrado = pedidos.filter((p) => p.pagado_en).reduce((s, p) => s + (Number(p.total) || 0), 0);

  const marcar = async (p, campo, valor) => {
    if (campo === "pagado" && !valor && !(await confirmar({ titulo: "Desmarcar el pago", detalle: p.digital ? "La familia deja de poder descargar las fotos." : "El pedido vuelve a figurar como no pagado.", textoConfirmar: "Desmarcar" }))) return;
    await supabase.rpc("marcar_pedido_fotos", { p_pedido: p.id, p_campo: campo, p_valor: valor });
    onCambio();
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(filasExcelPedidos({ pedidos, hijos: alumnos, fotos, curso: cursoNombre }));
    ws["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 40 }, { wch: 10 }, { wch: 26 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `Fotos - ${cursoNombre || "curso"}.xlsx`);
  };

  const grupos = [{ key: "estado", label: "Mostrar", value: filtro, onChange: setFiltro, options: [
    { value: "todos", label: "Todos los alumnos" }, { value: "sin_pedido", label: "Sin pedido" }, { value: "pendiente", label: "Falta pagar" },
    { value: "informado", label: "Pago informado" }, { value: "pagado", label: "Pagados" },
  ] }];

  return (
    <div>
      {confirmUI}
      {verFiltros && <FiltrosModal grupos={grupos} onClose={() => setVerFiltros(false)} />}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div><div style={{ fontSize: 12, color: "#64748B" }}>Pedidos</div><div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{pedidos.length} de {conFotos.length}</div></div>
        <div><div style={{ fontSize: 12, color: "#64748B" }}>Total pedido</div><div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{fmtM(total)}</div></div>
        <div><div style={{ fontSize: 12, color: "#64748B" }}>Cobrado</div><div style={{ fontSize: 18, fontWeight: 900, color: "#047857" }}>{fmtM(cobrado)}</div></div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar alumno" aria-label="Buscar alumno" style={{ ...inp, flex: "1 1 200px", width: "auto" }} />
        <BotonFiltros grupos={grupos} onClick={() => setVerFiltros(true)} />
        <BotonSecundario onClick={exportar} disabled={!pedidos.length}>Descargar Excel</BotonSecundario>
      </div>
      {!filas.length ? <EmptyState icono="bandeja" titulo="No hay pedidos para mostrar" nota="Cuando las familias elijan sus fotos, los pedidos aparecen acá." /> : filas.map(({ a, p }) => {
        const est = estadoPedido(p);
        const foto = p && fotos.find((f) => f.id === p.foto_id);
        return (
          <div key={a.id} style={tarjeta}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{fmtNombre(a)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: TONO[est.clave], whiteSpace: "nowrap" }}>{p ? est.texto : "Sin pedido"}</span>
            </div>
            {p && (
              <>
                <div style={{ fontSize: 13, color: "#334155", marginTop: 6, lineHeight: 1.55 }}>
                  {p.opcion_nombre && <div><span style={{ fontWeight: 700, color: "#0F172A" }}>{p.opcion_nombre}</span><span style={{ color: "#334155" }}>{p.digital ? " (digital)" : ""} · {foto?.archivo || "foto borrada"}</span></div>}
                  {(p.copias || []).map((c, i) => <div key={i}><span style={{ color: "#334155" }}>{textoCopia(c, fotos)}</span></div>)}
                  {p.comentario && <div style={{ color: "#64748B" }}>“{p.comentario}”</div>}
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 900, color: "#0F172A", marginRight: "auto" }}>{fmtM(Number(p.total) || 0)}</span>
                  {!p.pagado_en ? <BotonPrimario onClick={() => marcar(p, "pagado", true)} style={{ padding: "8px 14px" }}>Marcar pagado</BotonPrimario>
                    : <button onClick={() => marcar(p, "pagado", false)} style={linkBtn}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B" }}>Desmarcar pago</span></button>}
                  {p.pagado_en && !p.digital && (!p.entregado_en
                    ? <BotonSecundario onClick={() => marcar(p, "entregado", true)} style={{ padding: "8px 14px" }}>Marcar entregado</BotonSecundario>
                    : <button onClick={() => marcar(p, "entregado", false)} style={linkBtn}><span style={{ fontSize: 12.5, fontWeight: 700, color: "#64748B" }}>Desmarcar entregado</span></button>)}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Sección del panel del colegio (administrador, Secretaría, super): RLS acota a sus cursos. */
export function FotosEscolaresColegio({ cursos = [], hijos = [], colegioNombre }) {
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(null); // {} nueva | sesión a editar
  const [abierta, setAbierta] = useState(null);
  const [vista, setVista] = useState("fotos");
  const [aviso, setAviso] = useState(null);
  const [publicando, setPublicando] = useState(false);
  const [confirmar, confirmUI] = useConfirmar();
  const clave = cursos.map((c) => c.id).join(",");
  const ids = useMemo(() => (clave ? clave.split(",") : []), [clave]);
  const nombreCurso = (id) => cursos.find((c) => c.id === id)?.nombre || "";

  const cargar = useCallback(async () => {
    if (!ids.length) { setDatos({ sesiones: [], fotos: [], pedidos: [] }); return; }
    const [s, f, p] = await Promise.all([
      supabase.from("fotos_sesiones").select("*").in("curso_id", ids).order("creado_en", { ascending: false }),
      supabase.from("fotos").select("id,sesion_id,curso_id,tipo,hijo_id,archivo,path,path_muestra,path_miniatura,orden").in("curso_id", ids),
      supabase.from("fotos_pedidos").select("*").in("curso_id", ids),
    ]);
    if (s.error || f.error || p.error) { setDatos((d) => d || { sesiones: [], fotos: [], pedidos: [] }); return; }
    setDatos({ sesiones: s.data || [], fotos: (f.data || []).sort(ordenArchivo), pedidos: p.data || [] });
  }, [ids]);
  useCargar(cargar);

  const sesion = abierta && datos?.sesiones.find((s) => s.id === abierta);
  const fotosDe = (id) => (datos?.fotos || []).filter((f) => f.sesion_id === id);
  const pedidosDe = (id) => (datos?.pedidos || []).filter((p) => p.sesion_id === id);
  const alumnosDe = (cursoId) => hijos.filter((h) => h.curso_id === cursoId).sort((a, b) => fmtNombre(a).localeCompare(fmtNombre(b), "es"));

  const publicar = async (s) => {
    const fotos = fotosDe(s.id);
    const alumnos = alumnosDe(s.curso_id);
    const sinFoto = alumnos.filter((a) => !fotos.some((f) => f.hijo_id === a.id)).length;
    const sinAsignar = fotos.filter((f) => f.tipo === "alumno" && !f.hijo_id).length;
    const notas = [sinAsignar ? `${sinAsignar} fotos sin asignar (nadie las ve).` : null, sinFoto ? `${sinFoto} alumnos sin fotos.` : null].filter(Boolean).join(" ");
    if (!(await confirmar({ titulo: "Publicar las fotos", detalle: `Las familias de ${nombreCurso(s.curso_id)} reciben un aviso y pueden elegir hasta el ${fmtF(s.vence)}. ${notas}`.trim(), textoConfirmar: "Publicar", colorAccion: "#2563EB" }))) return;
    setPublicando(true);
    const { error } = await supabase.from("fotos_sesiones").update({ publicada_en: new Date().toISOString() }).eq("id", s.id);
    if (!error) {
      const userIds = await getUserIdsByCurso(s.curso_id);
      sendPush({ type: "fotos", payload: { titulo: `${s.titulo}: ya podés elegir las de tu hijo`, userIds } });
      setAviso("Publicadas. Las familias ya pueden elegir.");
    }
    setPublicando(false);
    cargar();
  };

  const borrarSesion = async (s) => {
    if (!(await confirmar({ titulo: "Borrar la sesión", detalle: "Se borran todas las fotos y los pedidos de esta sesión. No se puede deshacer.", textoConfirmar: "Borrar todo" }))) return;
    const paths = fotosDe(s.id).flatMap((f) => [f.path, f.path_muestra, f.path_miniatura]);
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from(BUCKET_FOTOS).remove(paths.slice(i, i + 100));
    await supabase.from("fotos_sesiones").delete().eq("id", s.id);
    setAbierta(null);
    cargar();
  };

  if (sesion) {
    const fotos = fotosDe(sesion.id);
    const pedidos = pedidosDe(sesion.id);
    return (
      <div style={{ maxWidth: 900 }}>
        {confirmUI}
        {form && <FormSesion inicial={form} cursos={cursos} otras={[]} onClose={() => setForm(null)} onGuardado={() => { setForm(null); cargar(); }} />}
        <button onClick={() => { setAbierta(null); setAviso(null); cargar(); }} style={{ ...linkBtn, display: "flex", alignItems: "center", gap: 4, marginBottom: 10, minHeight: 36 }}>
          <Icono nombre="atras" size={18} color="#2563EB" /><span style={{ fontSize: 13.5, fontWeight: 700, color: "#2563EB" }}>Fotos escolares</span>
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A" }}>{sesion.titulo} · {nombreCurso(sesion.curso_id)}</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{sesion.publicada_en ? "Publicada" : "Borrador: las familias todavía no la ven"} · hasta el {fmtF(sesion.vence)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setForm(sesion)} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>Editar precios</span></button>
            <button onClick={() => borrarSesion(sesion)} style={linkBtn}><span style={{ fontSize: 13, fontWeight: 700, color: "#DC2626" }}>Borrar</span></button>
            {!sesion.publicada_en && <BotonPrimario onClick={() => publicar(sesion)} disabled={publicando || !fotos.length}>Publicar y avisar</BotonPrimario>}
          </div>
        </div>
        {aviso && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", margin: "12px 0" }}><span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>{aviso}</span></div>}
        <div style={{ marginTop: 14 }}>
          <SubSeccion activo={vista} onIr={setVista} items={[{ id: "fotos", label: `Fotos (${fotos.length})` }, { id: "pedidos", label: `Pedidos (${pedidos.length})`, badge: pedidos.filter((p) => p.informado_pago_en && !p.pagado_en).length }]} />
        </div>
        {vista === "fotos"
          ? <FotosSesion sesion={sesion} alumnos={alumnosDe(sesion.curso_id)} fotos={fotos} colegioNombre={colegioNombre} onCambio={cargar} />
          : <PedidosSesion alumnos={alumnosDe(sesion.curso_id)} fotos={fotos} pedidos={pedidos} cursoNombre={nombreCurso(sesion.curso_id)} onCambio={cargar} />}
      </div>
    );
  }

  const hoy = fmtLocalDate();
  const otras = (datos?.sesiones || []).map((s) => ({ ...s, cursoNombre: nombreCurso(s.curso_id) }));
  return (
    <div style={{ maxWidth: 760 }}>
      {confirmUI}
      {form && <FormSesion inicial={form} cursos={cursos} otras={otras} onClose={() => setForm(null)} onGuardado={(n) => { setForm(null); setAviso(n > 1 ? `Listo: ${n} sesiones creadas (una por curso).` : "Sesión creada. Ahora subí las fotos."); cargar(); }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13.5, color: "#64748B", lineHeight: 1.5 }}>Las familias ven solo las fotos de su hijo, con marca de agua. Se borran solas al cerrar el año.</div>
        <BotonNuevo onClick={() => setForm({})} ariaLabel="Nueva sesión de fotos" />
      </div>
      {aviso && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, background: "#F0FDF4", marginBottom: 12 }}><span style={{ fontSize: 13, fontWeight: 600, color: "#047857" }}>{aviso}</span></div>}
      {!datos ? <div style={{ color: "#94A3B8", fontSize: 13 }}>Cargando…</div> : !datos.sesiones.length ? (
        <EmptyState icono="camara" titulo="No hay fotos escolares" nota="Creá una sesión por curso con los precios del sobre, subí las fotos y asignalas a cada alumno." accion="Nueva sesión de fotos" onAccion={() => setForm({})} />
      ) : datos.sesiones.map((s) => {
        const fotos = fotosDe(s.id);
        const pedidos = pedidosDe(s.id);
        const informados = pedidos.filter((p) => p.informado_pago_en && !p.pagado_en).length;
        const sinAsignar = fotos.filter((f) => f.tipo === "alumno" && !f.hijo_id).length;
        return (
          <button key={s.id} onClick={() => { setAbierta(s.id); setVista("fotos"); setAviso(null); cargar(); }} style={{ ...tarjeta, width: "100%", textAlign: "left", cursor: "pointer", fontFamily: "inherit", display: "block" }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{nombreCurso(s.curso_id)} · {s.titulo}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: !s.publicada_en ? "#B45309" : sesionVencida(s, hoy) ? "#94A3B8" : "#047857", whiteSpace: "nowrap" }}>{!s.publicada_en ? "Borrador" : sesionVencida(s, hoy) ? "Vencida" : "Publicada"}</span>
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 4 }}>
              {[`Hasta el ${fmtF(s.vence)}`, plural(fotos.length, "foto", "fotos"), sinAsignar ? `${sinAsignar} sin asignar` : null, plural(pedidos.length, "pedido", "pedidos"), plural(pedidos.filter((p) => p.pagado_en).length, "pagado", "pagados")].filter(Boolean).join(" · ")}
            </span>
            {informados > 0 && <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#2563EB", marginTop: 4 }}>{informados === 1 ? "1 familia avisó que pagó" : `${informados} familias avisaron que pagaron`}</span>}
          </button>
        );
      })}
    </div>
  );
}
