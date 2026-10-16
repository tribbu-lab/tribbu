// src/lib/menu.js
//
// Categorías del menú del comedor, una sola vez para el Inicio y para
// Comedor (web + mobile, @shared/menu). La tabla `menu` tiene 6 campos: el
// Excel del colegio carga hasta 3 platos principales (plato, plato2 y
// acompanamiento — este último es el "Plato principal 3", no una guarnición)
// y 2 postres.

export const CATEGORIAS_MENU = [
  { label: "Entrada", campos: ["entrada"] },
  { label: "Plato principal", campos: ["plato", "plato2", "acompanamiento"] },
  { label: "Postre", campos: ["postre", "postre2"] },
];

/**
 * Menú de un día como tabla: [{ label, platos: [..] }], solo las categorías
 * que tienen algo. Cada plato va en su propia línea.
 */
export const filasMenu = (menu) =>
  !menu
    ? []
    : CATEGORIAS_MENU.map((c) => ({ label: c.label, platos: c.campos.map((k) => menu[k]).filter(Boolean) })).filter((f) => f.platos.length);

// "Tomate/Jamon/Huevo/Cebolla" no tiene espacios y se salía de la tabla:
// un espacio de ancho cero después de cada "/" le permite cortar ahí.
export const platoCortable = (t) => String(t ?? "").replace(/\//g, "/​");
