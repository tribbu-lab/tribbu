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

export const ROL_LABEL = { padre: "Apoderado", admin: "Room Parent", super: "Super Admin" };
export const ROL_COLOR = { padre: "#3B82F6",   admin: "#10B981",    super: "#8B5CF6" };
export const ROL_BG    = { padre: "#EFF6FF",   admin: "#F0FDF4",    super: "#F5F3FF" };

export const HIJO_COLORS_CUSTOM = [
  "#3B82F6","#10B981","#F59E0B","#EF4444",
  "#8B5CF6","#EC4899","#06B6D4","#F97316","#6366F1","#14B8A6",
];
export const HIJO_COLOR_DEFAULT = "#0F172A";

export const MESES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
