// "Curso" (reemplaza a "Más" y a la lista larga del menú) y "Mi cuenta"
// (las acciones de cuenta que estaban al pie del menú). Mismo contenido que la
// pantalla Curso de mobile (mobile/app/(tabs)/curso.jsx): filas agrupadas
// con un contador de lo que espera algo de la familia (@shared/gestiones).
import { useState, useCallback } from "react";
import { supabase } from "../../supabase";
import { useCargar } from "../../hooks/useCargar";
import { fmtLocalDate, iniciales } from "../../lib/helpers";
import { cargarGestiones } from "../../lib/gestiones";
import { Icono } from "../../components/Icono";

// Agrupado por quién lo organiza: el colegio (autorizaciones, comedor,
// talleres, info, contacto) o las familias del curso (colectas, encuestas,
// marketplace y objetos perdidos).
const GRUPOS_FAMILIA = [
  { titulo: "Del colegio", items: [
    { id: "autorizaciones", label: "Autorizaciones", desc: "Salidas y permisos", icono: "firma" },
    { id: "comedor", label: "Comedor", desc: "Menú y servicio de comedor", icono: "cubiertos" },
    { id: "talleres", label: "Talleres", desc: "Actividades e inscripciones", icono: "paleta" },
    { id: "info", label: "Info útil", desc: "Útiles, uniformes, libros y alumnos", icono: "info" },
    { id: "contacto", label: "Contacto", desc: "Secretaría y equipo del colegio", icono: "telefono" },
  ] },
  { titulo: "De la comunidad", items: [
    { id: "finanzas", label: "Colectas", desc: "Aportes y registro de pagos", icono: "moneda", cuenta: "colectas" },
    { id: "encuestas", label: "Encuestas", desc: "Consultas entre las familias", icono: "grafico" },
    { id: "comunidad", label: "Marketplace", desc: "Comprá, vendé o regalá cosas usadas", icono: "bolsa" },
    { id: "perdidos", label: "Lost & Found", desc: "Objetos perdidos y encontrados", icono: "lupa" },
  ] },
];
const GRUPO_ROOM = { titulo: "Room Parent", items: [
  { id: "admin", label: "Administrar el curso", desc: "Room Parent: datos del curso y horarios", icono: "ajustes" },
] };
const GRUPOS_DOCENTE = [
  { titulo: "Mis cursos", items: [
    { id: "alumnos", label: "Alumnos", desc: "Tus alumnos y sus familias", icono: "usuarios" },
    { id: "autorizaciones", label: "Autorizaciones", desc: "Salidas y permisos", icono: "firma" },
    { id: "encuestas", label: "Encuestas", desc: "Consultas a las familias", icono: "grafico" },
    { id: "talleres", label: "Mis talleres", desc: "Inscriptos y avisos", icono: "paleta" },
  ] },
];

const tituloGrupo = { fontSize: 15, fontWeight: 800, color: "#0F172A", margin: "22px 0 8px" };
const tarjeta = { border: "1px solid #E2E8F0", borderRadius: 16, background: "white", overflow: "hidden" };

function Fila({ icono, label, desc, n, onClick, peligro, primera, derecha }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 60, border: "none", borderTop: primera ? "none" : "1px solid #F1F5F9", background: "white", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
    >
      {icono ? (
        <span style={{ width: 36, height: 36, borderRadius: 10, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icono nombre={icono} size={19} color={peligro ? "#DC2626" : "#475569"} />
        </span>
      ) : null}
      <span style={{ flex: 1, minWidth: 0, display: "block" }}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: peligro ? "#DC2626" : "#0F172A" }}>{label}</span>
        {desc ? <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</span> : null}
      </span>
      {n > 0 ? (
        <span style={{ minWidth: 22, height: 22, padding: "0 6px", borderRadius: 999, background: "#EFF6FF", color: "#1D4ED8", fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>{n}</span>
      ) : null}
      {derecha ?? <span style={{ color: "#94A3B8", fontSize: 18 }}>›</span>}
    </button>
  );
}

export function Curso({ cursoIds, items, userId, isAdmin, esDocente, onNavigate }) {
  const [cuentas, setCuentas] = useState({});
  const cargar = useCallback(async () => {
    if (esDocente || !cursoIds?.length) return;
    const misHijos = (items || []).filter((i) => i._tipo === "hijo" && cursoIds.includes(i.curso_id)).map((i) => ({ id: i.id, curso_id: i.curso_id }));
    try {
      setCuentas(await cargarGestiones(supabase, { cursoIds, misHijos, userId, hoy: fmtLocalDate() }));
    } catch {
      // sin contadores: las filas siguen andando
    }
  }, [esDocente, cursoIds, items, userId]);
  useCargar(cargar);

  const grupos = esDocente ? GRUPOS_DOCENTE : isAdmin ? [...GRUPOS_FAMILIA, GRUPO_ROOM] : GRUPOS_FAMILIA;
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Curso</div>
      <div style={{ fontSize: 14, color: "#64748B", marginTop: 4 }}>Lo del colegio y lo que organizan las familias.</div>
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div style={tituloGrupo}>{g.titulo}</div>
          <div style={tarjeta}>
            {g.items.map((o, i) => (
              <Fila key={o.id} {...o} n={cuentas[o.cuenta || o.id] || 0} primera={i === 0} onClick={() => onNavigate?.(o.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiCuenta({ usuario, esDocente, onNotificaciones, onSoporte, onCambiarPass, onCerrarSesion, onEliminar }) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.3, color: "#0F172A" }}>Mi cuenta</div>
      <div style={{ ...tarjeta, display: "flex", alignItems: "center", gap: 12, padding: 14, marginTop: 16 }}>
        <span style={{ width: 44, height: 44, borderRadius: 999, background: "#1E293B", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, flexShrink: 0 }}>
          <span style={{ color: "white" }}>{iniciales(usuario)}</span>
        </span>
        <span style={{ display: "block", minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{[usuario?.nombre, usuario?.apellido].filter(Boolean).join(" ")}</span>
          {usuario?.email ? <span style={{ display: "block", fontSize: 12.5, color: "#64748B", marginTop: 1 }}>{usuario.email}</span> : null}
        </span>
      </div>
      {/* Los avisos automáticos son para familias: a una docente no le llega ninguno. */}
      {esDocente ? null : (
        <>
          <div style={tituloGrupo}>Preferencias</div>
          <div style={tarjeta}>
            <Fila icono="campana" label="Notificaciones" desc="Qué avisos automáticos querés recibir" primera onClick={onNotificaciones} />
          </div>
        </>
      )}
      <div style={tituloGrupo}>Cuenta</div>
      <div style={tarjeta}>
        <Fila icono="salvavidas" label="Ayuda y soporte" desc="Escribile al equipo de tribbu" primera onClick={onSoporte} />
        <Fila icono="llave" label="Cambiar contraseña" desc={usuario?.email || ""} onClick={onCambiarPass} />
        <Fila icono="salir" label="Cerrar sesión" onClick={onCerrarSesion} peligro derecha={null} />
        <Fila icono="papelera" label="Eliminar mi cuenta" desc="Borra tu cuenta y tus datos de forma permanente" onClick={onEliminar} peligro derecha={null} />
      </div>
    </div>
  );
}
