// Reglas del horario semanal de un curso, compartidas por web y mobile
// (@shared/horarios). Puro: sin supabase ni React — cada pantalla hace sus
// queries y aplica los "planes" que devuelven estas funciones.
//
// Modelo: un bloque = una fila de `horarios` (curso_id, dia, hora_inicio,
// hora_fin, clase_id; materia/docente/color los completa la base desde la
// clase). Una "serie" = los bloques de la misma clase a la misma hora en
// distintos días (Inglés 10:40–11:20 lunes, miércoles y viernes): el editor
// los muestra y edita juntos.

export const DIAS_HORARIO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_HABILES = DIAS_HORARIO.slice(0, 5);
export const DIA_CORTO = { Lunes: "Lun", Martes: "Mar", "Miércoles": "Mié", Jueves: "Jue", Viernes: "Vie", "Sábado": "Sáb" };

/** "Miercoles"/"miércoles" → "Miércoles" (el panel viejo del Room Parent guardaba sin tilde). */
export function normalizarDia(d) {
  const k = String(d || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return DIAS_HORARIO.find((x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === k) || d;
}

/** "08:40" / "08:40:00" → 520 (minutos desde las 00:00). */
export function aMin(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
/** 520 → "08:40" */
export function deMin(n) {
  const h = Math.floor(n / 60), m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

/** Error en castellano o null. */
export function validarBloque({ dias, hora_inicio, hora_fin, clase_id }) {
  if (!dias?.length) return "Elegí al menos un día.";
  if (!clase_id) return "Elegí la clase.";
  const a = aMin(hora_inicio), b = aMin(hora_fin);
  if (a == null || b == null) return "Completá la hora de inicio y de fin.";
  if (b <= a) return "La hora de fin tiene que ser después de la de inicio.";
  return null;
}

const solapa = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/**
 * Bloques que se pisan con el que se está por guardar (mismo día, horas que se
 * cruzan), sin contar los que se están editando. Para avisar, no para impedir:
 * un taller optativo puede convivir con otra cosa a propósito.
 */
export function superposiciones(horarios, { dias, hora_inicio, hora_fin }, excluirIds = []) {
  const fuera = new Set(excluirIds);
  const a = aMin(hora_inicio), b = aMin(hora_fin);
  if (a == null || b == null || b <= a) return [];
  return horarios.filter((h) => !fuera.has(h.id) && dias.includes(normalizarDia(h.dia))
    && solapa(a, b, aMin(h.hora_inicio), aMin(h.hora_fin)));
}

const claveSerie = (h) => `${h.clase_id || "txt:" + (h.materia || "")}|${hhmm(h.hora_inicio)}|${hhmm(h.hora_fin)}`;

/** Los bloques de la misma serie que `h` (incluido él), ordenados por día. */
export function serieDe(horarios, h) {
  const k = claveSerie(h);
  return horarios.filter((x) => claveSerie(x) === k)
    .sort((x, y) => DIAS_HORARIO.indexOf(normalizarDia(x.dia)) - DIAS_HORARIO.indexOf(normalizarDia(y.dia)));
}

/**
 * Plan para guardar un bloque en varios días.
 *   alcance: los bloques existentes que se están editando ([] si es nuevo).
 *   dias:    dónde tiene que quedar el bloque después de guardar.
 * Los del alcance que caen en un día elegido se actualizan; los días elegidos
 * sin bloque se insertan; los del alcance en días que se destildaron se borran.
 */
export function planGuardarBloque({ alcance = [], dias, hora_inicio, hora_fin, clase_id, curso_id }) {
  const datos = { hora_inicio: hhmm(hora_inicio), hora_fin: hhmm(hora_fin), clase_id, curso_id };
  const porDia = new Map(alcance.map((h) => [normalizarDia(h.dia), h]));
  const actualizar = [], insertar = [], borrar = [];
  for (const dia of DIAS_HORARIO.filter((d) => dias.includes(d))) {
    const ex = porDia.get(dia);
    if (ex) actualizar.push({ id: ex.id, datos: { ...datos, dia } });
    else insertar.push({ ...datos, dia });
  }
  for (const h of alcance) if (!dias.includes(normalizarDia(h.dia))) borrar.push(h.id);
  return { actualizar, insertar, borrar };
}

/** Datos de un bloque para insertarlo en otro día o curso. */
function copiaDe(h, { dia, curso_id, clase_id }) {
  const fila = { curso_id, dia, hora_inicio: hhmm(h.hora_inicio), hora_fin: hhmm(h.hora_fin), clase_id: clase_id ?? h.clase_id ?? null };
  // sin clase (bloques viejos de texto libre): se copia el texto
  if (!fila.clase_id) Object.assign(fila, { materia: h.materia, docente: h.docente, color: h.color });
  return fila;
}

/**
 * Copiar lo de un día a otros. Con `reemplazar`, primero se vacían los días
 * destino; si no, se agrega y se saltean los bloques que ya existen igual.
 */
export function planCopiarDia(horarios, origen, destinos, { reemplazar = false } = {}) {
  const delOrigen = horarios.filter((h) => normalizarDia(h.dia) === origen);
  const borrar = [], insertar = [];
  for (const dia of destinos.filter((d) => d !== origen)) {
    const enDestino = horarios.filter((h) => normalizarDia(h.dia) === dia);
    if (reemplazar) borrar.push(...enDestino.map((h) => h.id));
    const yaEsta = new Set(reemplazar ? [] : enDestino.map(claveSerie));
    for (const h of delOrigen) if (!yaEsta.has(claveSerie(h))) insertar.push(copiaDe(h, { dia, curso_id: h.curso_id }));
  }
  return { borrar, insertar };
}

/**
 * Copiar el horario de otro curso. `claseDestino(h)` devuelve el clase_id
 * equivalente en el curso destino (misma materia y maestra) o undefined si no
 * existe — esos bloques se informan en `sinClase` para crearla antes.
 */
export function planCopiarCurso(origen, destino, cursoDestinoId, claseDestino, { reemplazar = false } = {}) {
  const borrar = reemplazar ? destino.map((h) => h.id) : [];
  const yaEsta = new Set(reemplazar ? [] : destino.map((h) => `${normalizarDia(h.dia)}|${claveSerie({ ...h })}`));
  const insertar = [], sinClase = [];
  for (const h of origen) {
    let clase_id = null;
    if (h.clase_id) {
      clase_id = claseDestino(h);
      if (!clase_id) { sinClase.push(h); continue; }
    }
    const fila = copiaDe(h, { dia: normalizarDia(h.dia), curso_id: cursoDestinoId, clase_id });
    if (yaEsta.has(`${fila.dia}|${claveSerie(fila)}`)) continue;
    insertar.push(fila);
  }
  return { borrar, insertar, sinClase };
}

/** Días a mostrar: Lun–Vie siempre, Sábado si tiene algo o se pidió. */
export function diasVisibles(horarios, conSabado = false) {
  const hay = conSabado || horarios.some((h) => normalizarDia(h.dia) === "Sábado");
  return hay ? DIAS_HORARIO : DIAS_HABILES;
}

/** Rango de la grilla en minutos, redondeado a horas: al menos 08:00–15:00. */
export function rangoGrilla(horarios) {
  let desde = 8 * 60, hasta = 15 * 60;
  for (const h of horarios) {
    const a = aMin(h.hora_inicio), b = aMin(h.hora_fin);
    if (a != null) desde = Math.min(desde, Math.floor(a / 60) * 60);
    if (b != null) hasta = Math.max(hasta, Math.ceil(b / 60) * 60);
  }
  return { desde, hasta };
}

/**
 * Para dibujar bloques que se pisan uno al lado del otro: a cada bloque de un
 * día le asigna { carril, carriles } (columna y cantidad de columnas del grupo).
 */
export function carriles(bloques) {
  const orden = [...bloques].sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio) || aMin(a.hora_fin) - aMin(b.hora_fin));
  const res = new Map();
  let grupo = [], finGrupo = -1, finCarril = [];
  const cerrar = () => { for (const g of grupo) res.set(g.h.id, { carril: g.carril, carriles: finCarril.length }); grupo = []; finCarril = []; };
  for (const h of orden) {
    const a = aMin(h.hora_inicio), b = aMin(h.hora_fin);
    if (a >= finGrupo) cerrar();
    let c = finCarril.findIndex((f) => f <= a);
    if (c === -1) { c = finCarril.length; finCarril.push(b); } else finCarril[c] = b;
    grupo.push({ h, carril: c });
    finGrupo = Math.max(finGrupo, b);
  }
  cerrar();
  return res;
}

/**
 * Lo que ve una familia: las clases optativas solo si alguno de `hijos` está
 * anotado. `optativas` = Set de clase_id optativas; `anotados` = filas
 * {clase_id, hijo_id} (RLS ya devuelve solo las de sus hijos).
 */
export function horariosParaFamilia(horarios, { optativas, anotados, hijos }) {
  const mios = new Set(hijos || []);
  const clasesMias = new Set((anotados || []).filter((a) => mios.has(a.hijo_id)).map((a) => a.clase_id));
  return horarios.filter((h) => !h.clase_id || !optativas.has(h.clase_id) || clasesMias.has(h.clase_id));
}
