// backup_tribbu.cjs — backup completo de tribbu (datos + archivos de Storage).
//
// Uso (la key nunca va hardcodeada acá):
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node backup_tribbu.cjs
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node backup_tribbu.cjs --sin-archivos   # solo tablas
//
// Genera la carpeta tribbu_backup_AAAA-MM-DD/ (gitignored) con:
//   data.json        todas las tablas de `public`, fila por fila
//   auth_users.json  cuentas de Supabase Auth (id, email, fechas) — Auth no
//                    expone los hashes de contraseña, así que restaurar una
//                    cuenta implica volver a crearla y resetear su clave
//   storage/<bucket>/<path>  cada archivo de los buckets (adjuntos, eventos, libros)
//
// Las tablas se descubren solas (vía el esquema OpenAPI de PostgREST), así
// que una tabla nueva entra al backup sin tocar este archivo. Cada tabla se
// baja paginada y ordenada por su clave primaria: PostgREST corta en 1000
// filas por pedido, y antes una tabla más grande quedaba truncada sin aviso.

const fs   = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gctymjhblvocvaenmdhr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SIN_ARCHIVOS = process.argv.includes("--sin-archivos");
const PAGINA = 1000;

const headers = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };

async function pedir(url, opts = {}) {
  const res = await fetch(SUPABASE_URL + url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  return res;
}

// Tablas + columnas de clave primaria, desde el OpenAPI de PostgREST
// (las PK vienen marcadas con "<pk/>" en la descripción de la columna).
async function descubrirTablas() {
  const spec = await (await pedir("/rest/v1/", { headers: { Accept: "application/openapi+json" } })).json();
  return Object.entries(spec.definitions || {})
    .map(([nombre, def]) => {
      const cols = Object.entries(def.properties || {});
      const pk = cols.filter(([, p]) => (p.description || "").includes("<pk/>")).map(([col]) => col);
      // Sin PK (tablas puente como usuario_hijos): ordenar por todas las
      // columnas para que la paginación sea determinista igual.
      return { nombre, pk: pk.length ? pk : cols.map(([col]) => col) };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

async function bajarTabla({ nombre, pk }) {
  const orden = pk.length ? "&order=" + pk.map(c => encodeURIComponent(c) + ".asc").join(",") : "";
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const res = await pedir(`/rest/v1/${encodeURIComponent(nombre)}?select=*${orden}`, {
      headers: { Range: `${desde}-${desde + PAGINA - 1}`, "Range-Unit": "items" },
    });
    const lote = await res.json();
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return filas;
}

async function bajarAuthUsers() {
  const usuarios = [];
  for (let page = 1; ; page++) {
    const { users = [] } = await (await pedir(`/auth/v1/admin/users?page=${page}&per_page=1000`)).json();
    usuarios.push(...users.map(u => ({
      id: u.id, email: u.email, created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at, email_confirmed_at: u.email_confirmed_at,
    })));
    if (users.length < 1000) break;
  }
  return usuarios;
}

// Lista recursiva: en la API de Storage, las "carpetas" vienen con id null.
async function listarBucket(bucket, prefijo = "") {
  const archivos = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await (await pedir(`/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    })).json();
    for (const it of items) {
      const ruta = prefijo ? `${prefijo}/${it.name}` : it.name;
      if (it.id === null) archivos.push(...await listarBucket(bucket, ruta));
      else archivos.push(ruta);
    }
    if (items.length < 1000) break;
  }
  return archivos;
}

async function bajarStorage(destino) {
  const buckets = await (await pedir("/storage/v1/bucket")).json();
  const resumen = {};
  for (const { id: bucket } of buckets) {
    const archivos = await listarBucket(bucket);
    let ok = 0, errores = 0;
    for (const ruta of archivos) {
      try {
        const res = await pedir(`/storage/v1/object/authenticated/${bucket}/${ruta.split("/").map(encodeURIComponent).join("/")}`);
        const archivo = path.join(destino, bucket, ...ruta.split("/"));
        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        fs.writeFileSync(archivo, Buffer.from(await res.arrayBuffer()));
        ok++;
      } catch (e) {
        errores++;
        console.log(`  ERR ${bucket}/${ruta}: ${e.message}`);
      }
    }
    resumen[bucket] = { archivos: archivos.length, ok, errores };
    console.log(`  ${errores ? "!! " : "OK "} ${bucket}: ${ok}/${archivos.length} archivos`);
  }
  return resumen;
}

async function main() {
  if (!SUPABASE_KEY) {
    console.error("Falta la Service Role Key: corré con SUPABASE_SERVICE_ROLE_KEY=tu_key node backup_tribbu.cjs");
    process.exit(1);
  }
  const carpeta = "tribbu_backup_" + new Date().toISOString().slice(0, 10);
  fs.mkdirSync(carpeta, { recursive: true });
  let huboErrores = false;

  console.log("Tablas:");
  const backup = { timestamp: new Date().toISOString(), tables: {} };
  for (const tabla of await descubrirTablas()) {
    try {
      backup.tables[tabla.nombre] = await bajarTabla(tabla);
      console.log(`  OK  ${tabla.nombre}: ${backup.tables[tabla.nombre].length} filas`);
    } catch (e) {
      huboErrores = true;
      console.log(`  ERR ${tabla.nombre}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(carpeta, "data.json"), JSON.stringify(backup, null, 2));

  console.log("\nCuentas de Auth:");
  try {
    const usuarios = await bajarAuthUsers();
    fs.writeFileSync(path.join(carpeta, "auth_users.json"), JSON.stringify(usuarios, null, 2));
    console.log(`  OK  ${usuarios.length} cuentas`);
  } catch (e) {
    huboErrores = true;
    console.log(`  ERR auth: ${e.message}`);
  }

  if (!SIN_ARCHIVOS) {
    console.log("\nStorage:");
    try {
      const resumen = await bajarStorage(path.join(carpeta, "storage"));
      if (Object.values(resumen).some(r => r.errores)) huboErrores = true;
    } catch (e) {
      huboErrores = true;
      console.log(`  ERR storage: ${e.message}`);
    }
  }

  console.log(`\nBackup guardado en ${carpeta}/${huboErrores ? "  — CON ERRORES, revisar arriba" : ""}`);
  process.exit(huboErrores ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
