#!/usr/bin/env node
// Promueve una versión ya subida por /store-release a producción en ambas
// tiendas, con las "Novedades" de mobile/stores/release-notes-<versión>.md.
// Spec: specs/promover-release-a-produccion.md · Skill: /store-promote.
//
//   node scripts/promover-release.mjs [--version 1.11.0] [--plataforma all|ios|android] [--aplicar]
//
// Sin --aplicar solo lee y muestra el plan (el edit de Play se descarta).
// Solo built-ins de Node: nada de dependencias.

import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAQUETE = "com.tribbu.app";
const PLAY_SA = path.join(MOBILE, "play-service-account.json");
const ASC_KEY_ID = process.env.ASC_KEY_ID || "332U7L8KB5";
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || "a1c49f10-67ff-454f-9b91-682a89b53ad1";
const ASC_KEY_PATH = process.env.ASC_KEY_PATH
  || path.join(os.homedir(), ".appstoreconnect/private_keys", `AuthKey_${ASC_KEY_ID}.p8`);
const MAX_PLAY = 500;
const MAX_ASC = 4000;
const TIMEOUT_MS = 40_000;

// Review Notes vencidas: el código demo de cuando existía el registro con código
// (sacado en 1.6.1) — mandarlas así deja al revisor sin forma de entrar.
const NOTAS_VENCIDAS = [/Y5WPT2/, /c[óo]digo\s+(de\s+invitaci[óo]n|demo)/i, /(invitation|demo)\s+code/i];

// appVersionState de ASC
const ESTADOS_EDITABLES = new Set([
  "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
  "INVALID_BINARY", "READY_FOR_REVIEW",
]);
const ESTADOS_ENVIADOS = new Set([
  "WAITING_FOR_REVIEW", "IN_REVIEW", "WAITING_FOR_EXPORT_COMPLIANCE", "PENDING_DEVELOPER_RELEASE",
  "PENDING_APPLE_RELEASE", "PROCESSING_FOR_DISTRIBUTION", "READY_FOR_DISTRIBUTION", "ACCEPTED",
  "READY_FOR_SALE", "REPLACED_WITH_NEW_VERSION",
]);

class Aborto extends Error {}

// ─── args ────────────────────────────────────────────────────────────────────

function leerArgs(argv) {
  const a = { plataforma: "all", aplicar: false, version: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--aplicar") a.aplicar = true;
    else if (k === "--version") a.version = argv[++i];
    else if (k === "--plataforma") a.plataforma = argv[++i];
    else throw new Aborto(`Argumento desconocido: ${k}`);
  }
  if (!["all", "ios", "android"].includes(a.plataforma)) throw new Aborto(`--plataforma inválida: ${a.plataforma}`);
  if (!a.version) {
    const cfg = fs.readFileSync(path.join(MOBILE, "app.config.js"), "utf8");
    const m = cfg.match(/\bversion:\s*"([^"]+)"/);
    if (!m) throw new Aborto("No encontré expo.version en app.config.js — pasá --version");
    a.version = m[1];
  }
  return a;
}

// ─── notas ───────────────────────────────────────────────────────────────────

function bloqueDeSeccion(md, titulo) {
  const i = md.search(new RegExp(`^## ${titulo}`, "m"));
  if (i < 0) return null;
  const resto = md.slice(i);
  const m = resto.match(/^```[^\n]*\n([\s\S]*?)\n```/m);
  return m ? m[1].trim() : null;
}

function leerNotas(version) {
  const archivo = path.join(MOBILE, "stores", `release-notes-${version}.md`);
  if (!fs.existsSync(archivo)) throw new Aborto(`No existe ${path.relative(MOBILE, archivo)} (lo genera /store-release)`);
  const md = fs.readFileSync(archivo, "utf8");
  const play = bloqueDeSeccion(md, "Google Play");
  const asc = bloqueDeSeccion(md, "App Store Connect");
  if (!play) throw new Aborto("Falta el bloque ``` de la sección '## Google Play' en las notas");
  if (!asc) throw new Aborto("Falta el bloque ``` de la sección '## App Store Connect' en las notas");
  if ([...play].length > MAX_PLAY) throw new Aborto(`Las notas de Play tienen ${[...play].length} caracteres (máx. ${MAX_PLAY})`);
  if ([...asc].length > MAX_ASC) throw new Aborto(`Las notas de ASC tienen ${[...asc].length} caracteres (máx. ${MAX_ASC})`);
  // El encabezado ("Android vc41 · iOS build 31 · …") nombra los binarios de
  // ESTA versión; los paréntesis posteriores hablan de builds descartados.
  const cabecera = md.split("\n").find((l) => /Android vc\d+|iOS build \d+/.test(l)) || "";
  const vc = cabecera.match(/Android vc(\d+)/)?.[1];
  const build = cabecera.match(/iOS build (\d+)/)?.[1];
  return { play, asc, vc: vc ? Number(vc) : null, build: build ? Number(build) : null };
}

// ─── http ────────────────────────────────────────────────────────────────────

async function pedir(url, { method = "GET", token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  try {
    r = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`${method} ${url} → sin respuesta (${e.cause?.code || e.name}). No reintenté: verificá el estado antes de volver a correr.`);
  }
  const texto = await r.text();
  const json = texto ? (() => { try { return JSON.parse(texto); } catch { return texto; } })() : null;
  if (!r.ok) {
    const det = typeof json === "object" ? JSON.stringify(json.errors || json.error || json) : texto;
    throw new Error(`${method} ${url.replace(/\?.*/, "")} → ${r.status}: ${det.slice(0, 800)}`);
  }
  return json;
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// ─── Google Play ─────────────────────────────────────────────────────────────

async function tokenPlay() {
  if (!fs.existsSync(PLAY_SA)) throw new Aborto("Falta mobile/play-service-account.json (gitignoreado; ver mobile/README.md)");
  const sa = JSON.parse(fs.readFileSync(PLAY_SA, "utf8"));
  const ahora = Math.floor(Date.now() / 1000);
  const datos = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri, iat: ahora, exp: ahora + 3600,
  })}`;
  const firma = crypto.sign("sha256", Buffer.from(datos), sa.private_key).toString("base64url");
  const r = await pedir(sa.token_uri, {
    method: "POST",
    form: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${datos}.${firma}` },
  });
  return r.access_token;
}

const vcsDe = (track) => (track?.releases || []).flatMap((r) => (r.versionCodes || []).map(Number));

async function android({ version, notas, aplicar, log }) {
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}`;
  const token = await tokenPlay();
  const edit = await pedir(`${base}/edits`, { method: "POST", token, body: {} });
  const e = `${base}/edits/${edit.id}`;
  let commiteado = false;
  try {
    const interno = await pedir(`${e}/tracks/internal`, { token });
    const prod = await pedir(`${e}/tracks/production`, { token });
    const vcs = vcsDe(interno);
    if (!vcs.length) throw new Aborto("El track interno está vacío");
    const vc = Math.max(...vcs);
    const relInterno = interno.releases.find((r) => (r.versionCodes || []).map(Number).includes(vc));
    log(`interno: vc${vc} (${relInterno?.name || "sin nombre"}, ${relInterno?.status})`);
    log(`producción hoy: ${(prod.releases || []).map((r) => `${r.name || "?"} [${(r.versionCodes || []).join(",")}] ${r.status}`).join(" · ") || "vacío"}`);
    if (notas.vc && notas.vc !== vc) {
      throw new Aborto(`Las notas dicen vc${notas.vc} pero el último del track interno es vc${vc} — ¿falta subir el AAB o son las notas de otra versión?`);
    }
    if (vcsDe(prod).includes(vc)) {
      log(`vc${vc} ya está en producción — nada que hacer`);
      return { estado: `ya en producción (vc${vc})` };
    }
    log(`PUT production → vc${vc} "${relInterno?.name || version}" status=completed, notas es-419 (${[...notas.play].length} chars)`);
    if (!aplicar) return { estado: `plan: promover vc${vc}` };
    await pedir(`${e}/tracks/production`, {
      method: "PUT", token,
      body: {
        track: "production",
        releases: [{
          name: relInterno?.name || version,
          versionCodes: [String(vc)],
          status: "completed",
          releaseNotes: [{ language: "es-419", text: notas.play }],
        }],
      },
    });
    await pedir(`${e}:commit`, { method: "POST", token });
    commiteado = true;
    log(`✔ commit OK — vc${vc} enviado a producción (pasa por la revisión de Google)`);
    return { estado: `vc${vc} enviado a producción` };
  } finally {
    if (!commiteado) await pedir(e, { method: "DELETE", token }).catch(() => {});
  }
}

// ─── App Store Connect ───────────────────────────────────────────────────────

function tokenAsc() {
  if (!fs.existsSync(ASC_KEY_PATH)) throw new Aborto(`Falta la key de ASC en ${ASC_KEY_PATH} (o seteá ASC_KEY_PATH)`);
  const ahora = Math.floor(Date.now() / 1000);
  const datos = `${b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64({
    iss: ASC_ISSUER_ID, iat: ahora, exp: ahora + 1200, aud: "appstoreconnect-v1",
  })}`;
  const firma = crypto.sign("sha256", Buffer.from(datos), { key: fs.readFileSync(ASC_KEY_PATH), dsaEncoding: "ieee-p1363" });
  return `${datos}.${firma.toString("base64url")}`;
}

function ascAppId() {
  const eas = JSON.parse(fs.readFileSync(path.join(MOBILE, "eas.json"), "utf8"));
  const id = eas.submit?.production?.ios?.ascAppId;
  if (!id) throw new Aborto("Falta submit.production.ios.ascAppId en eas.json");
  return id;
}

const estadoDe = (v) => v.attributes.appVersionState || v.attributes.appStoreState;

async function ios({ version, notas, aplicar, log }) {
  const API = "https://api.appstoreconnect.apple.com/v1";
  const token = tokenAsc();
  const app = ascAppId();
  const g = (p) => pedir(`${API}${p}`, { token });
  const w = (p, method, data) => pedir(`${API}${p}`, { method, token, body: { data } });

  // 1. Build
  const builds = (await g(`/builds?filter[app]=${app}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}&limit=50`)).data;
  if (!builds.length) throw new Aborto(`No hay builds de ${version} en ASC — ¿se subió con /store-release?`);
  const build = builds.sort((a, b) => Number(b.attributes.version) - Number(a.attributes.version))[0];
  const nBuild = Number(build.attributes.version);
  log(`build: ${version} (${nBuild}) ${build.attributes.processingState}, usesNonExemptEncryption=${build.attributes.usesNonExemptEncryption}`);
  if (notas.build && notas.build !== nBuild) {
    throw new Aborto(`Las notas dicen build ${notas.build} pero el último de ${version} en ASC es ${nBuild}`);
  }
  if (build.attributes.processingState !== "VALID") {
    throw new Aborto(`El build ${nBuild} está ${build.attributes.processingState} — reintentá en unos minutos`);
  }
  if (build.attributes.usesNonExemptEncryption == null) {
    const cfg = fs.readFileSync(path.join(MOBILE, "app.config.js"), "utf8");
    if (!/ITSAppUsesNonExemptEncryption/.test(cfg)) {
      throw new Aborto("El build no tiene declarado el cumplimiento de exportación y app.config.js no define ITSAppUsesNonExemptEncryption — resolvelo en ASC");
    }
  }

  // 2. Versión
  const versiones = (await g(`/apps/${app}/appStoreVersions?filter[platform]=IOS&limit=50&include=build`)).data;
  const buildDe = async (v) => (v.relationships?.build?.data?.id) ?? (await g(`/appStoreVersions/${v.id}/build`)).data?.id;
  const misma = versiones.find((v) => v.attributes.versionString === version);
  const editable = versiones.find((v) => ESTADOS_EDITABLES.has(estadoDe(v)));

  if (misma && ESTADOS_ENVIADOS.has(estadoDe(misma))) {
    const idBuild = await buildDe(misma);
    if (idBuild === build.id) {
      log(`${version} ya está ${estadoDe(misma)} con el build ${nBuild} — nada que hacer`);
      return { estado: `ya ${estadoDe(misma)} (build ${nBuild})` };
    }
    throw new Aborto(`${version} ya está ${estadoDe(misma)} con OTRO build — sacala de review en ASC si querés cambiarlo (fuera del alcance del script)`);
  }

  let versionObj = misma && ESTADOS_EDITABLES.has(estadoDe(misma)) ? misma : null;
  let accion;
  if (versionObj) accion = `reusar versión ${version} (${estadoDe(versionObj)})`;
  else if (editable) accion = `RENOMBRAR la versión editable ${editable.attributes.versionString} (${estadoDe(editable)}) a ${version} — ASC admite una sola versión editable`;
  else accion = `crear versión ${version} (releaseType AFTER_APPROVAL)`;
  log(accion);

  // Review Notes: de la versión que se va a usar, o de la última si todavía no existe.
  const fuenteNotas = versionObj || editable || versiones[0];
  const detalle = fuenteNotas ? (await g(`/appStoreVersions/${fuenteNotas.id}/appStoreReviewDetail`).catch(() => null))?.data : null;
  const reviewNotes = detalle?.attributes?.notes || "";
  log(`Review Notes actuales (de ${fuenteNotas?.attributes.versionString || "—"}):\n${reviewNotes ? reviewNotes.replace(/^/gm, "    │ ") : "    │ (vacías)"}`);
  if (detalle?.attributes?.demoAccountRequired != null) {
    log(`cuenta demo: ${detalle.attributes.demoAccountRequired ? `sí (${detalle.attributes.demoAccountName || "sin usuario"})` : "no requerida"}`);
  }
  const notasVencidas = NOTAS_VENCIDAS.some((re) => re.test(reviewNotes));
  if (notasVencidas) log("⚠ Las Review Notes mencionan un código de invitación/demo que ya no existe — NO se envía a review");

  log(`asignar build ${nBuild} y cargar "Novedades" (${[...notas.asc].length} chars) en todos los locales`);
  if (!aplicar) {
    if (versionObj) {
      const locs = (await g(`/appStoreVersions/${versionObj.id}/appStoreVersionLocalizations`)).data;
      log(`locales: ${locs.map((l) => l.attributes.locale).join(", ")}`);
    }
    log(notasVencidas ? "envío a review: BLOQUEADO por Review Notes" : "enviar a review (reviewSubmission)");
    return { estado: notasVencidas ? "plan: preparar versión, review bloqueado" : `plan: enviar ${version} (${nBuild}) a review` };
  }

  // 3. Aplicar
  if (!versionObj && editable) {
    versionObj = (await w(`/appStoreVersions/${editable.id}`, "PATCH", {
      type: "appStoreVersions", id: editable.id, attributes: { versionString: version },
    })).data;
  } else if (!versionObj) {
    versionObj = (await w("/appStoreVersions", "POST", {
      type: "appStoreVersions",
      attributes: { platform: "IOS", versionString: version, releaseType: "AFTER_APPROVAL" },
      relationships: { app: { data: { type: "apps", id: app } } },
    })).data;
  }
  log(`✔ versión ${version} (${versionObj.id})`);

  await w(`/appStoreVersions/${versionObj.id}/relationships/build`, "PATCH", { type: "builds", id: build.id });
  log(`✔ build ${nBuild} asignado`);

  const locs = (await g(`/appStoreVersions/${versionObj.id}/appStoreVersionLocalizations`)).data;
  for (const l of locs) {
    await w(`/appStoreVersionLocalizations/${l.id}`, "PATCH", {
      type: "appStoreVersionLocalizations", id: l.id, attributes: { whatsNew: notas.asc },
    });
  }
  log(`✔ Novedades cargadas en ${locs.map((l) => l.attributes.locale).join(", ")}`);

  if (notasVencidas) {
    return { estado: `versión ${version} lista con build ${nBuild}, SIN enviar (Review Notes vencidas)`, bloqueado: true };
  }

  // 4. Review submission: reusar una abierta o crear una.
  const abiertas = (await g(`/reviewSubmissions?filter[app]=${app}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW,UNRESOLVED_ISSUES&limit=10`)).data;
  let sub = abiertas[0];
  if (!sub) {
    sub = (await w("/reviewSubmissions", "POST", {
      type: "reviewSubmissions", attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: app } } },
    })).data;
  }
  const items = await g(`/reviewSubmissions/${sub.id}/items?include=appStoreVersion&limit=50`);
  const yaEsta = items.data.some((it) => it.relationships?.appStoreVersion?.data?.id === versionObj.id);
  if (!yaEsta) {
    await w("/reviewSubmissionItems", "POST", {
      type: "reviewSubmissionItems",
      relationships: {
        reviewSubmission: { data: { type: "reviewSubmissions", id: sub.id } },
        appStoreVersion: { data: { type: "appStoreVersions", id: versionObj.id } },
      },
    });
  }
  await w(`/reviewSubmissions/${sub.id}`, "PATCH", { type: "reviewSubmissions", id: sub.id, attributes: { submitted: true } });
  log(`✔ enviada a review (reviewSubmission ${sub.id})`);
  return { estado: `${version} (${nBuild}) enviada a review` };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const notas = leerNotas(args.version);
  console.log(`Promover ${args.version} → producción · ${args.aplicar ? "APLICANDO" : "PLAN (sin cambios)"}`);
  console.log(`notas: Play ${[...notas.play].length}/${MAX_PLAY} chars · ASC ${[...notas.asc].length}/${MAX_ASC} chars · encabezado vc${notas.vc ?? "?"} / build ${notas.build ?? "?"}`);

  // Android primero (commit atómico); un fallo no frena a la otra plataforma.
  const plataformas = args.plataforma === "all" ? ["android", "ios"] : [args.plataforma];
  const resultados = {};
  let fallo = false;
  for (const p of plataformas) {
    const log = (m) => console.log(`[${p}] ${m}`);
    try {
      const r = await (p === "android" ? android : ios)({ ...args, notas, log });
      resultados[p] = r.estado;
      if (r.bloqueado) fallo = true;
    } catch (e) {
      fallo = true;
      resultados[p] = `ERROR: ${e.message}`;
      log(`✖ ${e.message}`);
    }
  }
  console.log("\nResumen:");
  for (const [p, r] of Object.entries(resultados)) console.log(`  ${p}: ${r}`);
  process.exit(fallo ? 1 : 0);
}

main().catch((e) => {
  console.error(`✖ ${e.message}`);
  process.exit(1);
});
