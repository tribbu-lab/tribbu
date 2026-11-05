// "Cuentas en este navegador" (specs/perfil-multicuenta.md): lista, cambio con
// un clic y "Agregar otra cuenta". Va en Mi cuenta de la familia y del panel.
import { useState } from "react";
import { Icono } from "./Icono";
import { useConfirmar } from "../hooks/useConfirmar";
import { otrasCuentas } from "../lib/cuentas";

const input = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", fontFamily: "inherit", background: "#F8FAFC", boxSizing: "border-box", marginTop: 8, color: "#0F172A" };

// La contraseña no se guarda.
function AgregarModal({ emailInicial, onClose, onAgregar }) {
  const [email, setEmail] = useState(emailInicial || "");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    if (!email.trim() || !pass || enviando) return;
    setEnviando(true);
    setError("");
    const res = await onAgregar(email, pass);
    // Si salió bien, la página se recarga con la otra cuenta.
    if (res?.error) {
      setEnviando(false);
      setError(res.error);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={enviar} role="dialog" aria-modal="true" aria-label={emailInicial ? "Volvé a entrar" : "Agregar otra cuenta"} style={{ width: "100%", maxWidth: 400, background: "white", borderRadius: 16, padding: 20, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: 17, fontWeight: 800, color: "#0F172A" }}>{emailInicial ? "Volvé a entrar" : "Agregar otra cuenta"}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 6, display: "flex" }}><Icono nombre="cerrar" size={18} color="#64748B" /></button>
        </div>
        <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.4 }}>
          {emailInicial ? "La sesión de esta cuenta venció. Poné su contraseña una vez más." : "Tu otra cuenta de tribbu: la de otro colegio, o la de personal si además sos familia. Entrás una sola vez y después cambiás con un clic."}
        </div>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" autoComplete="username" aria-label="Correo" style={input} />
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Contraseña" autoComplete="current-password" aria-label="Contraseña" style={input} />
        {error ? <div role="alert" style={{ fontSize: 13, color: "#DC2626", marginTop: 8 }}>{error}</div> : null}
        <button type="submit" disabled={enviando} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10, border: "none", background: enviando ? "#93C5FD" : "#2563EB", color: "white", fontSize: 14, fontWeight: 700, cursor: enviando ? "default" : "pointer", fontFamily: "inherit" }}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

export function CuentasGuardadas({ cuentas: gestor }) {
  const { authId, cuentas, cambiarCuenta, agregarCuenta, quitarOtraCuenta } = gestor;
  const otras = otrasCuentas(cuentas, authId);
  // null = cerrado; "" = cuenta nueva; un mail = volver a entrar a una vencida.
  const [agregar, setAgregar] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const [error, setError] = useState("");
  const [confirmar, confirmUI] = useConfirmar();
  const abrir = async (c) => {
    if (abriendo) return;
    setAbriendo(c.auth_id);
    setError("");
    const res = await cambiarCuenta(c.auth_id);
    if (res?.ok) return; // se recarga la página
    setAbriendo(null);
    if (res?.vencida) setAgregar(c.email || "");
    else if (res?.error) setError(res.error);
  };
  const quitar = async (c) => {
    const ok = await confirmar({ titulo: "¿Quitar esta cuenta de este navegador?", detalle: `${c.nombre || c.email}: la cuenta no se borra. Para volver a usarla acá vas a tener que poner su contraseña.`, textoConfirmar: "Quitar" });
    if (ok) quitarOtraCuenta(c.auth_id);
  };
  const filaBase = { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", minHeight: 60, border: "none", background: "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit", boxSizing: "border-box" };
  const icono = (nombre) => (
    <span style={{ width: 36, height: 36, borderRadius: 10, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icono nombre={nombre} size={19} color="#475569" />
    </span>
  );
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", margin: "22px 0 8px" }}>Cuentas en este navegador</div>
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 16, background: "white", overflow: "hidden" }}>
        {otras.map((c, i) => (
          <div key={c.auth_id} style={{ display: "flex", alignItems: "center", borderTop: i ? "1px solid #F1F5F9" : "none" }}>
            <button onClick={() => abrir(c)} disabled={!!abriendo} style={{ ...filaBase, flex: 1, width: "auto", minWidth: 0 }}>
              {icono("usuarios")}
              <span style={{ flex: 1, minWidth: 0, display: "block" }}>
                <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre || c.email}</span>
                <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{abriendo === c.auth_id ? "Abriendo…" : c.etiqueta || c.email}</span>
              </span>
            </button>
            <button onClick={() => quitar(c)} aria-label={`Quitar la cuenta de ${c.nombre || c.email} de este navegador`} style={{ width: 44, height: 44, marginRight: 8, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icono nombre="cerrar" size={16} color="#94A3B8" />
            </button>
          </div>
        ))}
        <button onClick={() => setAgregar("")} style={{ ...filaBase, borderTop: otras.length ? "1px solid #F1F5F9" : "none" }}>
          {icono("usuarios")}
          <span style={{ flex: 1, minWidth: 0, display: "block" }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "#0F172A" }}>Agregar otra cuenta</span>
            <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 1 }}>De otro colegio, o de personal y de familia</span>
          </span>
          <span style={{ color: "#94A3B8", fontSize: 18 }}>›</span>
        </button>
      </div>
      {error ? <div role="alert" style={{ fontSize: 13, color: "#DC2626", marginTop: 8 }}>{error}</div> : null}
      {agregar !== null ? <AgregarModal emailInicial={agregar} onClose={() => setAgregar(null)} onAgregar={agregarCuenta} /> : null}
      {confirmUI}
    </>
  );
}
