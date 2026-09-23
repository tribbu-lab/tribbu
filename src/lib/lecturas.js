// src/lib/lecturas.js
//
// Confirmación de lectura — lógica pura compartida por web y mobile
// (@shared/lecturas). Las filas vienen de la RPC lecturas_de_recordatorios.

/**
 * Une las lecturas de varias filas de una misma comunicación (una por curso,
 * mismo grupo_id) en una por familia: una familia con hijos en dos de los
 * cursos cuenta una vez, leída si leyó cualquiera (con la primera lectura).
 */
export const unirLecturasPorFamilia = (filas) => {
  const porUsuario = new Map();
  for (const l of filas) {
    const prev = porUsuario.get(l.usuario_id);
    if (!prev) {
      porUsuario.set(l.usuario_id, { ...l });
      continue;
    }
    if (l.leido_en && (!prev.leido_en || l.leido_en < prev.leido_en)) prev.leido_en = l.leido_en;
    if (l.hijos && !(prev.hijos || "").includes(l.hijos)) prev.hijos = [prev.hijos, l.hijos].filter(Boolean).join(", ");
    prev.tiene_app = prev.tiene_app || l.tiene_app;
  }
  return [...porUsuario.values()];
};
