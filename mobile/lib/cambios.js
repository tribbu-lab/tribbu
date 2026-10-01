// "¿Hubo escrituras desde X?" — lo usa useRecarga para no saltear la recarga
// al volver a una pantalla cuando el propio usuario acaba de cambiar algo
// (crear un aviso, pagar, votar, marcar leído) aunque la pantalla se haya
// cargado hace pocos segundos.
//
// Lo marca el fetch del cliente de Supabase (lib/supabase.js) en cada
// escritura a una tabla (POST/PATCH/PUT/DELETE a /rest/v1/). Las RPC
// (/rest/v1/rpc/) no cuentan: varias pantallas las usan para LEER al cargar
// (objetos_reclamados, lecturas…) y marcarían "cambios" en cada carga.

let ultimoCambio = 0;

export const ultimoCambioEn = () => ultimoCambio;

const esEscritura = (url, metodo) =>
  metodo !== "GET" && metodo !== "HEAD" && url.includes("/rest/v1/") && !url.includes("/rest/v1/rpc/");

/** fetch para createClient({ global: { fetch } }): igual que fetch, y anota las escrituras. */
export const fetchQueAnotaCambios = (input, init) => {
  const metodo = (init?.method || "GET").toUpperCase();
  const url = typeof input === "string" ? input : input?.url || "";
  const p = fetch(input, init);
  if (!esEscritura(url, metodo)) return p;
  return p.then((res) => {
    ultimoCambio = Date.now();
    return res;
  });
};
