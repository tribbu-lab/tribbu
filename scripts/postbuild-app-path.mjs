// Después de `vite build`: arma dist-web/, una copia de dist/ con el
// landing (apoderados.html) en index.html y la SPA movida a app.html.
//
// Por qué una copia aparte y no reordenar dist/ en el lugar (como hacía la
// primera versión de este script): dist/ es compartido — lo consume tanto
// Vercel (deploy web) como `npx cap sync android` (build de la app mobile
// vía Capacitor, ver CLAUDE.md), y Capacitor SIEMPRE toma dist/index.html
// como punto de entrada de la app nativa. Si dist/index.html pasara a ser
// el landing, `npm run build && npx cap sync android` empaquetaría el
// landing de marketing como pantalla de arranque del APK en vez de la app
// — un build mobile roto y silencioso. dist-web/ (vercel.json apunta ahí
// vía "outputDirectory") es solo para el deploy web; dist/ queda intacto
// con index.html = la SPA, como siempre.
//
// Por qué el reordenamiento en sí: en Vercel, un archivo real que matchea
// el path exacto (dist-web/index.html sirviendo "/") tiene prioridad sobre
// los rewrites custom — un rewrite "/" → "/apoderados.html" nunca se
// evaluaría mientras exista un index.html real ahí. Moviendo físicamente
// el landing a index.html no hace falta rewrite para "/": lo sirve Vercel
// solo. La SPA sí necesita rewrite ("/app" → "/app.html") porque "/app" no
// es un archivo real.
//
// No toca `npm run dev` (vite dev sirve el index.html del root del repo,
// sin pasar por este script) ni public/.
import { existsSync, cpSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dist = join(root, "dist");
const distWeb = join(root, "dist-web");
const spa = join(dist, "index.html");
const landing = join(dist, "apoderados.html");

if (!existsSync(spa) || !existsSync(landing)) {
  console.error("postbuild-app-path: falta dist/index.html o dist/apoderados.html — ¿corriste `vite build` antes?");
  process.exit(1);
}

rmSync(distWeb, { recursive: true, force: true });
cpSync(dist, distWeb, { recursive: true });

copyFileSync(join(distWeb, "index.html"), join(distWeb, "app.html"));
copyFileSync(join(distWeb, "apoderados.html"), join(distWeb, "index.html")); // index.html pasa a ser el landing

console.log("postbuild-app-path: dist-web/app.html = app (SPA), dist-web/index.html = landing — dist/ (Capacitor) sin tocar");
