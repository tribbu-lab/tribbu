// Capturas de las fichas de las tiendas: manifiesto (mobile/stores/capturas.json),
// detección de capturas viejas por git, y comparación/subida contra Google Play
// y App Store Connect. Lo usan capturas-tienda.mjs (detectar / capturar) y
// promover-release.mjs (subir). Spec: specs/capturas-de-tienda-al-dia.md.

import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Aborto, MOBILE, REPO, PLAY_UPLOAD, pedir } from "./tiendas.mjs";

export const MANIFIESTO = path.join(MOBILE, "stores", "capturas.json");
export const DIR_CAPTURAS = path.join(MOBILE, "assets", "store", "screenshots");
// Lo que se compara y se sube a cada tienda (la de 6.9" es la fuente de la de 6.5").
export const CARPETA_PLAY = "android";
export const CARPETA_ASC = "ios-6.5";
export const IDIOMA_PLAY = "es-419";
export const TIPO_ASC = "APP_IPHONE_65";
const ESPERA_ASC_MS = 5 * 60_000;

export const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

export function leerManifiesto() {
  if (!fs.existsSync(MANIFIESTO)) throw new Aborto(`No existe ${path.relative(REPO, MANIFIESTO)}`);
  return JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"));
}

// Reescribe solo el campo "desde" para no tocar el formato del resto del archivo.
export function guardarDesde(commit) {
  const txt = fs.readFileSync(MANIFIESTO, "utf8");
  fs.writeFileSync(MANIFIESTO, txt.replace(/("desde":\s*)"[^"]*"/, `$1"${commit}"`));
}

// Ancho y alto de un PNG (cabecera IHDR), sin depender de sips.
export function tamanoPng(archivo) {
  const b = fs.readFileSync(archivo);
  if (b.length < 24 || b.toString("ascii", 12, 16) !== "IHDR") throw new Aborto(`${archivo} no es un PNG`);
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

// Archivos de una carpeta en el orden del manifiesto, con sus hashes: MD5 es el
// sourceFileChecksum de ASC y SHA-256 el sha256 de las imágenes de Play.
export function archivosLocales(man, carpeta) {
  return man.capturas.map((c) => {
    const archivo = path.join(DIR_CAPTURAS, carpeta, `${c.id}.png`);
    if (!fs.existsSync(archivo)) throw new Aborto(`Falta ${path.relative(REPO, archivo)}`);
    const datos = fs.readFileSync(archivo);
    return {
      id: c.id, archivo, nombre: `${c.id}.png`, datos, bytes: datos.length,
      md5: crypto.createHash("md5").update(datos).digest("hex"),
      sha256: crypto.createHash("sha256").update(datos).digest("hex"),
    };
  });
}

// Problemas del set del repo: rutas que ya no existen, PNG faltantes o de otro tamaño.
export function validar(man) {
  const errores = [];
  for (const c of man.capturas) {
    if (!fs.existsSync(path.join(MOBILE, "app", "(tabs)", `${c.ruta}.jsx`))) {
      errores.push(`${c.id}: la ruta "${c.ruta}" no existe en mobile/app/(tabs)/`);
    }
  }
  for (const [carpeta, d] of Object.entries(man.dispositivos)) {
    for (const c of man.capturas) {
      const archivo = path.join(DIR_CAPTURAS, carpeta, `${c.id}.png`);
      if (!fs.existsSync(archivo)) { errores.push(`falta ${path.relative(REPO, archivo)}`); continue; }
      const t = tamanoPng(archivo);
      if (t.ancho !== d.ancho || t.alto !== d.alto) {
        errores.push(`${path.relative(REPO, archivo)} mide ${t.ancho}×${t.alto} (se espera ${d.ancho}×${d.alto})`);
      }
    }
  }
  return errores;
}

// Qué capturas cambiaron desde `desde`: cada una con los archivos de sus
// fuentes que tocaron los commits del rango. Si cambió algo de `comunes`,
// quedan todas viejas.
export function detectar(man = leerManifiesto()) {
  const rango = `${man.desde}..HEAD`;
  const cambiados = (rutas) => (rutas.length ? git("diff", "--name-only", rango, "--", ...rutas).split("\n").filter(Boolean) : []);
  const comunes = cambiados(man.comunes);
  const capturas = man.capturas.map((c) => {
    const archivos = [...new Set([...comunes, ...cambiados(c.fuentes)])];
    return { id: c.id, archivos };
  });
  const todas = [...new Set([...man.comunes, ...man.capturas.flatMap((c) => c.fuentes)])];
  const commits = git("log", "--oneline", "--no-merges", rango, "--", ...todas).split("\n").filter(Boolean);
  return { desde: man.desde, comunes, capturas, commits, alDia: capturas.every((c) => !c.archivos.length) };
}

// PNG del set con cambios sin commitear: no se suben (la ficha tiene que ser lo del repo).
export function sinCommitear() {
  return git("status", "--porcelain", "--", path.relative(REPO, DIR_CAPTURAS), path.relative(REPO, MANIFIESTO))
    .split("\n").filter(Boolean);
}

// Lo que se puede decir antes de tocar una tienda: si el set del repo se puede
// subir (commiteado y válido) y si quedó viejo respecto de HEAD (solo aviso).
export function estadoDelRepo() {
  const man = leerManifiesto();
  const pendientes = sinCommitear();
  const errores = validar(man);
  let viejas = [];
  try { viejas = detectar(man).capturas.filter((c) => c.archivos.length).map((c) => c.id); } catch { /* sin git: no se avisa */ }
  return { man, pendientes, errores, viejas, subible: !pendientes.length && !errores.length };
}

const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ─── Google Play ─────────────────────────────────────────────────────────────

// `e` = URL del edit abierto (…/edits/{id}).
export async function planPlay({ token, e, man }) {
  const publicadas = ((await pedir(`${e}/listings/${IDIOMA_PLAY}/phoneScreenshots`, { token })).images || []).map((i) => i.sha256);
  const locales = archivosLocales(man, CARPETA_PLAY);
  return { publicadas, locales, alDia: iguales(publicadas, locales.map((l) => l.sha256)) };
}

// Dentro del edit: borra las capturas de teléfono y sube las del repo en orden.
export async function subirPlay({ token, e, editId, locales, log }) {
  await pedir(`${e}/listings/${IDIOMA_PLAY}/phoneScreenshots`, { method: "DELETE", token });
  for (const l of locales) {
    await pedir(`${PLAY_UPLOAD}/edits/${editId}/listings/${IDIOMA_PLAY}/phoneScreenshots?uploadType=media`, {
      method: "POST", token, binario: l.datos, tipo: "image/png",
    });
    log(`  ↑ ${l.nombre}`);
  }
}

// ─── App Store Connect ───────────────────────────────────────────────────────

async function setsDeVersion(g, versionId) {
  const locs = (await g(`/appStoreVersions/${versionId}/appStoreVersionLocalizations`)).data;
  const sets = [];
  for (const l of locs) {
    const r = await g(`/appStoreVersionLocalizations/${l.id}/appScreenshotSets?filter[screenshotDisplayType]=${TIPO_ASC}&include=appScreenshots&limit[appScreenshots]=10`);
    const set = r.data[0] || null;
    const porId = new Map((r.included || []).map((x) => [x.id, x]));
    const capturas = (set?.relationships?.appScreenshots?.data || []).map((d) => porId.get(d.id)).filter(Boolean);
    sets.push({ locId: l.id, locale: l.attributes.locale, setId: set?.id || null, capturas });
  }
  return sets;
}

export async function planAsc({ g, versionId, man }) {
  const sets = await setsDeVersion(g, versionId);
  const locales = archivosLocales(man, CARPETA_ASC);
  const md5s = locales.map((l) => l.md5);
  const alDia = sets.length > 0 && sets.every((s) => iguales(s.capturas.map((c) => c.attributes.sourceFileChecksum), md5s));
  return { sets, locales, alDia };
}

// En cada locale de la versión (que tiene que ser editable): borra las capturas
// del set, sube las del repo (reserva → partes → commit con MD5), las ordena y
// espera a que ASC las procese. Lanza error si alguna falla o no termina.
export async function subirAsc({ g, w, versionId, man, log }) {
  const { sets, locales } = await planAsc({ g, versionId, man });
  for (const s of sets) {
    let setId = s.setId;
    if (!setId) {
      setId = (await w("/appScreenshotSets", "POST", {
        type: "appScreenshotSets", attributes: { screenshotDisplayType: TIPO_ASC },
        relationships: { appStoreVersionLocalization: { data: { type: "appStoreVersionLocalizations", id: s.locId } } },
      })).data.id;
    }
    for (const c of s.capturas) await w(`/appScreenshots/${c.id}`, "DELETE");
    const ids = [];
    for (const l of locales) {
      const res = (await w("/appScreenshots", "POST", {
        type: "appScreenshots", attributes: { fileName: l.nombre, fileSize: l.bytes },
        relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
      })).data;
      for (const op of res.attributes.uploadOperations || []) {
        await pedir(op.url, {
          method: op.method,
          binario: Buffer.from(l.datos.subarray(op.offset, op.offset + op.length)),
          headers: Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value])),
        });
      }
      await w(`/appScreenshots/${res.id}`, "PATCH", {
        type: "appScreenshots", id: res.id, attributes: { uploaded: true, sourceFileChecksum: l.md5 },
      });
      ids.push(res.id);
      log(`  ↑ ${s.locale} ${l.nombre}`);
    }
    await w(`/appScreenshotSets/${setId}/relationships/appScreenshots`, "PATCH", ids.map((id) => ({ type: "appScreenshots", id })));

    // ASC procesa cada imagen (UPLOAD_COMPLETE → COMPLETE); enviar a review con
    // una en proceso o FAILED deja la ficha rota.
    const limite = Date.now() + ESPERA_ASC_MS;
    for (;;) {
      const estados = await Promise.all(ids.map(async (id) => (await g(`/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state));
      if (estados.includes("FAILED")) throw new Error(`ASC rechazó una captura de ${s.locale} (assetDeliveryState FAILED)`);
      if (estados.every((x) => x === "COMPLETE")) break;
      if (Date.now() > limite) throw new Error(`Las capturas de ${s.locale} no terminaron de procesarse en 5 min (${estados.join(", ")})`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    log(`✔ capturas de ${s.locale} procesadas (${ids.length})`);
  }
}
