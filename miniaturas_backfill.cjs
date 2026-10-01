// miniaturas_backfill.cjs — genera las miniaturas (.thumb.jpg) de las fotos que
// ya estaban subidas antes de que la app las generara al subir (ver
// src/lib/miniaturas.js). Correr UNA vez; es idempotente (saltea las que ya
// tienen miniatura), así que se puede volver a correr sin problema.
//
// Uso (la key nunca va hardcodeada acá):
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node miniaturas_backfill.cjs --dry   # solo cuenta
//   SUPABASE_SERVICE_ROLE_KEY=tu_key node miniaturas_backfill.cjs         # genera
//
// Solo AGREGA archivos <path>.thumb.jpg al lado de cada imagen de los buckets
// privados `adjuntos` y `eventos`. Nunca modifica ni borra las originales.
// Saltea los logos de colegio (colegios/…), que no se muestran como miniatura.

// jimp (JS puro) y no sharp: en esta máquina Windows bloquea el binario nativo
// de sharp (Application Control). Para unas decenas de fotos alcanza.
const { Jimp } = require("jimp");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://gctymjhblvocvaenmdhr.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");
const BUCKETS = ["adjuntos", "eventos"];
const ES_IMAGEN = /\.(jpe?g|png)$/i; // lo que decodifica jimp (las de la app son JPG/PNG)
const ES_MINI = /\.thumb\.jpg$/i;

const headers = { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY };

async function pedir(url, opts = {}) {
  const res = await fetch(SUPABASE_URL + url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  return res;
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

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

async function main() {
  if (!SUPABASE_KEY) {
    console.error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
    process.exit(1);
  }
  // Mismas medidas que la app (src/lib/miniaturas.js es ESM).
  const { MINI_LADO, CALIDAD_MINI, pathMiniatura } = await import("./src/lib/miniaturas.js");

  let hechas = 0, yaTenian = 0, fallidas = 0, kbAntes = 0, kbDespues = 0;
  for (const bucket of BUCKETS) {
    const archivos = await listarBucket(bucket);
    const existentes = new Set(archivos);
    const imagenes = archivos.filter((p) => ES_IMAGEN.test(p) && !ES_MINI.test(p) && !p.startsWith("colegios/"));
    const pendientes = imagenes.filter((p) => !existentes.has(pathMiniatura(p)));
    yaTenian += imagenes.length - pendientes.length;
    console.log(`${bucket}: ${imagenes.length} imágenes, ${pendientes.length} sin miniatura`);
    if (DRY) continue;

    for (const p of pendientes) {
      try {
        const original = Buffer.from(await (await pedir(`/storage/v1/object/${bucket}/${enc(p)}`)).arrayBuffer());
        const img = await Jimp.read(original); // aplica la orientación EXIF
        if (Math.max(img.width, img.height) > MINI_LADO) img.scaleToFit({ w: MINI_LADO, h: MINI_LADO });
        // Fondo blanco: un PNG transparente no queda negro en JPEG.
        const fondo = new Jimp({ width: img.width, height: img.height, color: 0xffffffff });
        fondo.composite(img, 0, 0);
        const mini = await fondo.getBuffer("image/jpeg", { quality: Math.round(CALIDAD_MINI * 100) });
        await pedir(`/storage/v1/object/${bucket}/${enc(pathMiniatura(p))}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
          body: mini,
        });
        hechas++;
        kbAntes += original.length / 1024;
        kbDespues += mini.length / 1024;
        console.log(`  ✓ ${bucket}/${p}  ${Math.round(original.length / 1024)} KB → ${Math.round(mini.length / 1024)} KB`);
      } catch (e) {
        fallidas++;
        console.log(`  ✗ ${bucket}/${p}: ${e.message}`);
      }
    }
  }
  console.log(DRY
    ? `\n--dry: no se generó nada. ${yaTenian} ya tenían miniatura.`
    : `\nListo: ${hechas} miniaturas nuevas (${Math.round(kbAntes)} KB de originales → ${Math.round(kbDespues)} KB), ${yaTenian} ya tenían, ${fallidas} fallaron.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
