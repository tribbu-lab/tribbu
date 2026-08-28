// Después de `vite build`: la SPA (dist/index.html) pasa a vivir en
// dist/app.html, y el landing (dist/apoderados.html, copiado tal cual desde
// public/ por Vite) pasa a ocupar dist/index.html.
//
// Por qué un paso aparte y no un simple rewrite "/" → "/apoderados.html" en
// vercel.json: en Vercel, un archivo estático que matchea el path exacto
// (acá, dist/index.html sirviendo "/") tiene prioridad sobre los rewrites
// custom — el rewrite de "/" nunca llega a evaluarse mientras exista un
// dist/index.html real. Moviendo físicamente el landing a dist/index.html
// no hace falta ningún rewrite para "/": lo sirve Vercel solo. La SPA sí
// necesita rewrite ("/app" → "/app.html") porque "/app" no es un archivo
// real.
//
// No toca `npm run dev` (vite dev sirve index.html del root del repo, sin
// pasar por este script) ni la estructura de `public/` — solo reordena
// dist/ después del build.
import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist");
const spa = join(dist, "index.html");
const landing = join(dist, "apoderados.html");

if (!existsSync(spa) || !existsSync(landing)) {
  console.error("postbuild-app-path: falta dist/index.html o dist/apoderados.html — ¿corriste `vite build` antes?");
  process.exit(1);
}

copyFileSync(spa, join(dist, "app.html"));
copyFileSync(landing, spa); // dist/index.html pasa a ser el landing

console.log("postbuild-app-path: dist/app.html = app (SPA), dist/index.html = landing");
