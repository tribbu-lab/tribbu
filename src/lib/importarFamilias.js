// Carga masiva de alumnos y familias (panel del colegio → Configuración →
// Importar datos). Puro: recibe las filas del Excel y lo que ya hay en la
// base, y devuelve qué crear, qué actualizar, qué vincular y qué filas tienen
// errores — la pantalla lo muestra antes de cargar y después lo aplica.
// Una fila por alumno, con hasta dos apoderados. Nunca borra: solo agrega o
// actualiza (borrar un alumno borra sus autorizaciones, chats y pagos).

export const COLUMNAS_FAMILIAS = ["Curso", "Nombre", "Apellido", "DNI", "Nacimiento", "Apoderado 1", "Email 1", "Apoderado 2", "Email 2"];

const clave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const limpio = (s) => String(s ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
const dniDe = (v) => String(v ?? "").replace(/[^\dA-Za-z]/g, "") || null;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fecha de Excel: Date, número de serie, "dd/mm/aaaa" o "aaaa-mm-dd" → "aaaa-mm-dd" (null si no hay o no es válida). */
export function fechaDeCelda(v) {
  if (v == null || v === "") return null;
  const ymd = (y, m, d) => (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);
  if (v instanceof Date && !isNaN(v)) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") { // días desde 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ymd(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  return m ? ymd(+m[3], +m[2], +m[1]) : null;
}

/** "María José Pérez" → { nombre: "María", apellido: "José Pérez" } (sin apellido si es una sola palabra). */
export function separarNombre(completo) {
  const partes = limpio(completo).split(" ").filter(Boolean);
  return { nombre: partes[0] || "", apellido: partes.slice(1).join(" ") || null };
}

/**
 * filas: objetos con las COLUMNAS_FAMILIAS. Datos actuales:
 *   cursos [{id,nombre}], alumnos [{id,nombre,apellido,curso_id,dni}],
 *   usuarios [{id,email}], vinculos [{usuario_id,hijo_id}].
 * Devuelve:
 *   alumnosNuevos [{ref, fila, curso_id, nombre, apellido, dni, fecha_nacimiento}]
 *   alumnosActualizar [{id, fila, cambios}]  (solo DNI / nacimiento que vienen)
 *   cuentasNuevas [{email, nombre, apellido}]
 *   vinculos [{email, alumno}]  alumno = id existente o ref de un alumno nuevo
 *   errores [{fila, motivo}]
 * Un alumno existente se reconoce por DNI o, si no, por nombre + apellido + curso.
 */
export function leerFamilias(filas, { cursos = [], alumnos = [], usuarios = [], vinculos = [] }) {
  const cursoDe = new Map(cursos.flatMap((c) => [[clave(c.nombre), c.id], [clave(String(c.nombre).split(" - ")[0]), c.id]]));
  const porDni = new Map(alumnos.filter((a) => a.dni).map((a) => [dniDe(a.dni), a]));
  const porNombre = new Map(alumnos.map((a) => [`${a.curso_id}|${clave(a.nombre)}|${clave(a.apellido)}`, a]));
  const usuarioDe = new Map(usuarios.filter((u) => u.email).map((u) => [clave(u.email), u.id]));
  const yaVinculado = new Set(vinculos.map((v) => `${v.usuario_id}|${v.hijo_id}`));

  const alumnosNuevos = [], alumnosActualizar = [], errores = [];
  const cuentas = new Map(), links = new Map(), vistos = new Set();
  filas.forEach((r, i) => {
    const fila = i + 2; // fila 1 = encabezados
    const v = (k) => r[k] ?? r[k.normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? "";
    if (!COLUMNAS_FAMILIAS.some((k) => String(v(k)).trim())) return; // fila vacía
    const nombre = limpio(v("Nombre")), apellido = limpio(v("Apellido")) || null;
    const nombreCurso = limpio(v("Curso"));
    const curso_id = cursoDe.get(clave(nombreCurso));
    const dni = dniDe(v("DNI"));
    const nacimientoTxt = String(v("Nacimiento")).trim();
    const fecha_nacimiento = fechaDeCelda(v("Nacimiento"));
    const apoderados = [1, 2].map((n) => ({ nombre: limpio(v(`Apoderado ${n}`)), email: clave(v(`Email ${n}`)) })).filter((a) => a.nombre || a.email);
    const motivo = !nombre ? "Falta el nombre del alumno"
      : !nombreCurso ? "Falta el curso"
      : !curso_id ? `No existe el curso "${nombreCurso}"`
      : nacimientoTxt && !fecha_nacimiento ? `Fecha de nacimiento no válida: "${nacimientoTxt}" (usá 25/03/2018)`
      : apoderados.find((a) => !a.email) ? "Un apoderado no tiene email"
      : apoderados.find((a) => !EMAIL.test(a.email)) ? `Email no válido: "${apoderados.find((a) => !EMAIL.test(a.email)).email}"`
      : null;
    if (motivo) { errores.push({ fila, motivo }); return; }
    const k = dni ? `dni:${dni}` : `${curso_id}|${clave(nombre)}|${clave(apellido)}`;
    if (vistos.has(k)) { errores.push({ fila, motivo: `${nombre} ${apellido || ""} está repetido en el archivo`.replace(/\s+/g, " ") }); return; }
    vistos.add(k);

    const existente = (dni && porDni.get(dni)) || porNombre.get(`${curso_id}|${clave(nombre)}|${clave(apellido)}`);
    let alumno;
    if (existente) {
      alumno = existente.id;
      const cambios = {};
      if (dni && dniDe(existente.dni) !== dni) cambios.dni = dni;
      if (fecha_nacimiento) cambios.fecha_nacimiento = fecha_nacimiento;
      if (existente.curso_id !== curso_id) cambios.curso_id = curso_id;
      if (Object.keys(cambios).length) alumnosActualizar.push({ id: existente.id, fila, cambios });
    } else {
      alumno = `nuevo:${fila}`;
      alumnosNuevos.push({ ref: alumno, fila, curso_id, nombre, apellido, dni, fecha_nacimiento });
    }
    for (const a of apoderados) {
      const usuarioId = usuarioDe.get(a.email);
      if (!usuarioId && !cuentas.has(a.email)) cuentas.set(a.email, { email: a.email, ...separarNombre(a.nombre || a.email.split("@")[0]) });
      if (usuarioId && existente && yaVinculado.has(`${usuarioId}|${existente.id}`)) continue;
      links.set(`${a.email}|${alumno}`, { email: a.email, alumno });
    }
  });
  return { alumnosNuevos, alumnosActualizar, cuentasNuevas: [...cuentas.values()], vinculos: [...links.values()], errores };
}
