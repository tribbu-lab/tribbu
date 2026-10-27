// HTTP y credenciales de las APIs de las tiendas (Play Developer API y App Store
// Connect API), compartido por promover-release.mjs y capturas-tienda.mjs.
// Solo built-ins de Node: nada de dependencias.

import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = path.resolve(MOBILE, "..");
export const PAQUETE = "com.tribbu.app";
export const PLAY_API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}`;
export const PLAY_UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PAQUETE}`;
export const ASC_API = "https://api.appstoreconnect.apple.com/v1";
const PLAY_SA = path.join(MOBILE, "play-service-account.json");
const ASC_KEY_ID = process.env.ASC_KEY_ID || "332U7L8KB5";
const ASC_ISSUER_ID = process.env.ASC_ISSUER_ID || "a1c49f10-67ff-454f-9b91-682a89b53ad1";
const ASC_KEY_PATH = process.env.ASC_KEY_PATH
  || path.join(os.homedir(), ".appstoreconnect/private_keys", `AuthKey_${ASC_KEY_ID}.p8`);
const TIMEOUT_MS = 40_000;

// En esta máquina algunas APIs se cuelgan o no resuelven por IPv6 (también
// pasa con api.expo.dev): IPv4 primero.
dns.setDefaultResultOrder("ipv4first");

// Error esperable (falta un archivo, un estado no coincide…): se informa sin stack.
export class Aborto extends Error {}

// `body` va como JSON; `form`, como x-www-form-urlencoded; `binario` (Buffer)
// va tal cual con `tipo` como Content-Type. `headers` se suman a los de siempre.
export async function pedir(url, { method = "GET", token, body, form, binario, tipo, headers: extra } = {}) {
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; payload = new URLSearchParams(form).toString(); }
  else if (binario) { if (tipo) headers["Content-Type"] = tipo; payload = binario; }
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  let r;
  try {
    r = await fetch(url, { method, headers, body: payload, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`${method} ${url.replace(/\?.*/, "")} → sin respuesta (${e.cause?.code || e.name}). No reintenté: verificá el estado antes de volver a correr.`);
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

export async function tokenPlay() {
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

export function tokenAsc() {
  if (!fs.existsSync(ASC_KEY_PATH)) throw new Aborto(`Falta la key de ASC en ${ASC_KEY_PATH} (o seteá ASC_KEY_PATH)`);
  const ahora = Math.floor(Date.now() / 1000);
  const datos = `${b64({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" })}.${b64({
    iss: ASC_ISSUER_ID, iat: ahora, exp: ahora + 1200, aud: "appstoreconnect-v1",
  })}`;
  const firma = crypto.sign("sha256", Buffer.from(datos), { key: fs.readFileSync(ASC_KEY_PATH), dsaEncoding: "ieee-p1363" });
  return `${datos}.${firma.toString("base64url")}`;
}

export function ascAppId() {
  const eas = JSON.parse(fs.readFileSync(path.join(MOBILE, "eas.json"), "utf8"));
  const id = eas.submit?.production?.ios?.ascAppId;
  if (!id) throw new Aborto("Falta submit.production.ios.ascAppId en eas.json");
  return id;
}

// Cliente mínimo de ASC: g = GET, w = escritura con { data }, gOpcional = GET
// de un recurso que puede no existir (404 → null).
export function clienteAsc() {
  const token = tokenAsc();
  const g = (p) => pedir(`${ASC_API}${p}`, { token });
  const w = (p, method, data) => pedir(`${ASC_API}${p}`, { method, token, body: data === undefined ? undefined : { data } });
  const gOpcional = (p) => g(p).catch((e) => { if (/→ 404\b/.test(e.message)) return null; throw e; });
  return { token, g, w, gOpcional };
}

export const estadoDe = (v) => v.attributes.appVersionState || v.attributes.appStoreState;

// appVersionState de ASC
export const ESTADOS_EDITABLES = new Set([
  "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED",
  "INVALID_BINARY", "READY_FOR_REVIEW",
]);
export const ESTADOS_ENVIADOS = new Set([
  "WAITING_FOR_REVIEW", "IN_REVIEW", "WAITING_FOR_EXPORT_COMPLIANCE", "PENDING_DEVELOPER_RELEASE",
  "PENDING_APPLE_RELEASE", "PROCESSING_FOR_DISTRIBUTION", "READY_FOR_DISTRIBUTION", "ACCEPTED",
  "READY_FOR_SALE", "REPLACED_WITH_NEW_VERSION",
]);
