// src/lib/avisos.js — tipos de aviso automático que cada familia puede apagar
// (columnas de preferencias_avisos, ver supabase/preferencias-avisos.sql y la
// Edge Function avisos-automaticos). Compartido web/mobile (@shared/avisos).

export const TIPOS_AVISO = [
  { k: "evento_manana", titulo: "Eventos de mañana", desc: "A las 19 h, lo que tenés al día siguiente." },
  { k: "colecta_por_vencer", titulo: "Colectas por vencer", desc: "Dos días antes, si todavía no pagaste." },
  { k: "autorizacion_pendiente", titulo: "Autorizaciones sin responder", desc: "El día antes de la fecha límite." },
  { k: "resumen_semanal", titulo: "Resumen de la semana", desc: "Los domingos: eventos, colectas y cumples." },
];

/** Preferencias efectivas: sin fila (o sin columna) = activado. */
export const preferenciasEfectivas = (fila) => ({
  ...Object.fromEntries(TIPOS_AVISO.map((t) => [t.k, true])),
  ...Object.fromEntries(TIPOS_AVISO.filter((t) => fila && fila[t.k] === false).map((t) => [t.k, false])),
});

/** Fila para upsert en preferencias_avisos. */
export const filaPreferencias = (usuarioId, prefs) => ({
  usuario_id: usuarioId,
  actualizado_en: new Date().toISOString(),
  ...Object.fromEntries(TIPOS_AVISO.map((t) => [t.k, prefs[t.k] !== false])),
});
