// Tokens de diseño centralizados
// Antes: `const T = {...}` en App.jsx línea 115
// Ahora: cualquier componente los importa desde acá

export const T = {
  primary: "#0F172A",
  accent:  "#3B82F6",
  bg:      "#F8FAFC",
  card:    "#FFFFFF",
  text:    "#1E293B",
  muted:   "#64748B",
  border:  "#F1F5F9",
  white:   "#FFFFFF",
  red:     "#EF4444",
  green:   "#10B981",
  yellow:  "#F59E0B",
  purple:  "#8B5CF6",
};

// admin -> room (2026-09-08): el rol interno de Room Parent pasó de "admin" a
// "room" (ver supabase/rol-admin-a-room.sql) — el label visible ya decía
// "Room Parent" desde antes, esto solo evita que el identificador se
// confunda con las nociones nuevas de admin de plataforma/colegio.
export const ROL_LABEL = { padre: "Apoderado", room: "Room Parent", super: "Super Admin", colegio_admin: "Admin de Colegio" };
export const ROL_COLOR = { padre: "#3B82F6",   room: "#10B981",    super: "#8B5CF6",       colegio_admin: "#F59E0B" };
export const ROL_BG    = { padre: "#EFF6FF",   room: "#F0FDF4",    super: "#F5F3FF",       colegio_admin: "#FFFBEB" };

export const HIJO_COLORS_CUSTOM = [
  "#F43F5E","#F97316","#EAB308","#22C55E",
  "#14B8A6","#3B82F6","#8B5CF6","#EC4899",
];
export const HIJO_COLOR_DEFAULT = "#0F172A";

export const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
