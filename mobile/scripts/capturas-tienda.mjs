#!/usr/bin/env node
// Capturas de las fichas de App Store y Google Play.
// Spec: specs/capturas-de-tienda-al-dia.md · Skills: /store-release, /store-promote.
//
//   node scripts/capturas-tienda.mjs detectar
//   node scripts/capturas-tienda.mjs capturar [--plataforma all|ios|android] [--sin-build] [--aab ./tribbu-production.aab]
//
// detectar: sin red. Qué capturas quedaron viejas desde el commit "desde" del
//   manifiesto (mobile/stores/capturas.json) y por qué archivos.
// capturar: con la cuenta demo (contraseña de la API de ASC), en el simulador
//   de iOS (build Release, Xcode 26.2) y el emulador de Android (el AAB del
//   release), con Maestro. Escribe en una carpeta temporal y reemplaza el set
//   del repo solo si salieron todas. Antes conviene correr
//   supabase/demo-al-dia.sql para que la cuenta demo tenga datos de hoy.
// Solo built-ins de Node; las herramientas (maestro, xcrun, adb, bundletool,
// sips) son de la máquina, no dependencias de la app.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Aborto, MOBILE, REPO, clienteAsc, ascAppId } from "./tiendas.mjs";
import { DIR_CAPTURAS, detectar, git, guardarDesde, leerManifiesto, tamanoPng, validar } from "./capturas.mjs";

const XCODE = "/Applications/Xcode-26.2.app/Contents/Developer";
const JAVA_HOME = process.env.JAVA_HOME || "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
const ANDROID_HOME = process.env.ANDROID_HOME || path.join(os.homedir(), "Library/Android/sdk");
const ADB = path.join(ANDROID_HOME, "platform-tools/adb");
const LOGIN = path.join(MOBILE, "stores", "capturas", "login.yaml");
const BUNDLE_ID = "com.tribbu.app";

// ─── args ────────────────────────────────────────────────────────────────────

function leerArgs(argv) {
  const a = { comando: argv[0], plataforma: "all", sinBuild: false, aab: path.join(MOBILE, "tribbu-production.aab") };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--plataforma") a.plataforma = argv[++i];
    else if (k === "--sin-build") a.sinBuild = true;
    else if (k === "--aab") a.aab = path.resolve(argv[++i]);
    else throw new Aborto(`Argumento desconocido: ${k}`);
  }
  if (!["detectar", "capturar"].includes(a.comando)) throw new Aborto("Uso: capturas-tienda.mjs detectar | capturar [--plataforma all|ios|android] [--sin-build] [--aab <ruta>]");
  if (!["all", "ios", "android"].includes(a.plataforma)) throw new Aborto(`--plataforma inválida: ${a.plataforma}`);
  return a;
}

// ─── detectar ────────────────────────────────────────────────────────────────

function cmdDetectar() {
  const man = leerManifiesto();
  const errores = validar(man);
  const d = detectar(man);
  console.log(`Capturas desde ${d.desde} (${d.commits.length} commits que tocan sus fuentes)`);
  for (const c of d.capturas) {
    if (!c.archivos.length) console.log(`  ${c.id}: al día`);
    else console.log(`  ${c.id}: VIEJA — ${c.archivos.slice(0, 6).join(", ")}${c.archivos.length > 6 ? ` y ${c.archivos.length - 6} más` : ""}`);
  }
  if (d.comunes.length) console.log(`Cambió algo común a todas: ${d.comunes.slice(0, 6).join(", ")}${d.comunes.length > 6 ? "…" : ""}`);
  if (d.commits.length) console.log(`Commits:\n${d.commits.slice(0, 15).map((c) => `  ${c}`).join("\n")}${d.commits.length > 15 ? `\n  … y ${d.commits.length - 15} más` : ""}`);
  for (const e of errores) console.log(`✖ ${e}`);
  if (errores.length) process.exit(1);
  console.log(d.alDia ? "\nResultado: capturas al día" : "\nResultado: hay capturas viejas — regenerar el set entero con `capturar`");
}

// ─── utilidades ──────────────────────────────────────────────────────────────

const correr = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const intentar = (cmd, args, opts) => { try { return correr(cmd, args, opts); } catch { return null; } };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Corre un comando largo con la salida a un log; si falla, muestra la cola.
function correrConLog(cmd, args, { log, env, cwd, secretos = [] }) {
  const r = spawnSync(cmd, args, { cwd, env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  let salida = `${r.stdout || ""}${r.stderr || ""}`;
  for (const s of secretos) if (s) salida = salida.split(s).join("••••");
  fs.writeFileSync(log, salida);
  if (r.status !== 0) {
    throw new Aborto(`${path.basename(cmd)} ${args[0]} falló (exit ${r.status}). Últimas líneas de ${log}:\n${salida.split("\n").slice(-25).join("\n")}`);
  }
  return salida;
}

// Credenciales demo de la "Información de la revisión" de la última versión en
// ASC: son las mismas que usa el revisor. Nunca se imprimen.
async function credencialesDemo() {
  const { g, gOpcional } = clienteAsc();
  const versiones = (await g(`/apps/${ascAppId()}/appStoreVersions?filter[platform]=IOS&limit=5`)).data;
  for (const v of versiones) {
    const a = (await gOpcional(`/appStoreVersions/${v.id}/appStoreReviewDetail`))?.data?.attributes;
    if (a?.demoAccountName && a?.demoAccountPassword) return { email: a.demoAccountName, pass: a.demoAccountPassword };
  }
  throw new Aborto("No encontré la cuenta demo en la Información de la revisión de ASC");
}

// Flow de Maestro generado desde el manifiesto: login + cada pantalla por deep link.
// En iOS cada deep link abre un "Open in 'tribbu'?" (con demora: el tapOn
// opcional lo espera); en Android no hay diálogo.
function escribirFlow(man, carpetaSalida, archivo, plataforma) {
  const q = (s) => JSON.stringify(s);
  const pasos = [`- runFlow: ${q(LOGIN)}`];
  for (const c of man.capturas) {
    pasos.push(`- openLink: ${q(`tribbu://${c.ruta}`)}`);
    if (plataforma === "ios") pasos.push(`- tapOn: ${q({ text: "Open|Abrir", optional: true })}`);
    // YAML acepta JSON: los pasos del manifiesto van tal cual.
    for (const paso of c.pasos || []) pasos.push(`- ${JSON.stringify(paso)}`);
    pasos.push(`- extendedWaitUntil:\n    visible: ${q(c.debeVer)}\n    timeout: 30000`);
    if (c.noDebeVer) pasos.push(`- assertNotVisible: ${q(c.noDebeVer)}`);
    pasos.push("- waitForAnimationToEnd:\n    timeout: 5000");
    pasos.push(`- takeScreenshot: ${q(path.join(carpetaSalida, c.id))}`);
  }
  fs.writeFileSync(archivo, `appId: ${BUNDLE_ID}\n---\n${pasos.join("\n")}\n`);
}

function maestro(dispositivo, flow, cred, tmp, nombre) {
  const debug = path.join(tmp, `maestro-${nombre}`);
  try {
    correrConLog("maestro", ["--device", dispositivo, "test", flow, "--no-ansi",
      "-e", `DEMO_EMAIL=${cred.email}`, "-e", `DEMO_PASS=${cred.pass}`, "--debug-output", debug, "--flatten-debug-output"], {
      log: path.join(tmp, `maestro-${nombre}.log`), env: { JAVA_HOME }, cwd: tmp, secretos: [cred.pass],
    });
  } finally {
    // El debug de Maestro guarda los comandos con el texto tipeado (la contraseña).
    fs.rmSync(debug, { recursive: true, force: true });
  }
}

function comprobarCarpeta(man, carpeta, d) {
  for (const c of man.capturas) {
    const archivo = path.join(carpeta, `${c.id}.png`);
    if (!fs.existsSync(archivo)) throw new Aborto(`Maestro no dejó ${c.id}.png en ${carpeta}`);
    const t = tamanoPng(archivo);
    if (t.ancho !== d.ancho || t.alto !== d.alto) throw new Aborto(`${c.id}.png mide ${t.ancho}×${t.alto} (se espera ${d.ancho}×${d.alto})`);
  }
}

// ─── iOS ─────────────────────────────────────────────────────────────────────

function udidSimulador(nombre) {
  const devs = JSON.parse(correr("xcrun", ["simctl", "list", "devices", "available", "-j"])).devices;
  const ios = Object.entries(devs).filter(([rt]) => rt.includes("iOS")).flatMap(([, ds]) => ds);
  const d = ios.find((x) => x.name === nombre);
  if (!d) throw new Aborto(`No hay un simulador "${nombre}" (xcrun simctl list devices)`);
  return d.udid;
}

async function capturarIos({ man, args, cred, tmp, log }) {
  const d = man.dispositivos.ios;
  const udid = udidSimulador(d.simulador);
  intentar("xcrun", ["simctl", "boot", udid]);
  correr("xcrun", ["simctl", "bootstatus", udid, "-b"]);
  correr("xcrun", ["simctl", "ui", udid, "appearance", "light"]);
  log(`simulador ${d.simulador} (${udid})`);

  if (!args.sinBuild) {
    // Release para simulador: el JS va adentro (sin Metro ni LogBox) y no gasta
    // buildNumber. Xcode 26.2 por la misma razón que /store-release.
    const prod = JSON.parse(fs.readFileSync(path.join(MOBILE, "eas.json"), "utf8")).build.production.env || {};
    const env = { ...prod, DEVELOPER_DIR: XCODE, CI: "1" };
    if (!fs.existsSync(path.join(MOBILE, "ios"))) {
      log("prebuild de iOS…");
      correrConLog("npx", ["expo", "prebuild", "-p", "ios"], { log: path.join(tmp, "prebuild-ios.log"), env, cwd: MOBILE });
    }
    log("build Release para el simulador (10–25 min)…");
    correrConLog("npx", ["expo", "run:ios", "--configuration", "Release", "--device", udid, "--no-bundler"], {
      log: path.join(tmp, "build-ios.log"), env, cwd: MOBILE,
    });
  }
  if (intentar("xcrun", ["simctl", "get_app_container", udid, BUNDLE_ID]) == null) {
    throw new Aborto(`tribbu no está instalada en el simulador — corré sin --sin-build`);
  }

  const salida = path.join(tmp, "ios");
  fs.mkdirSync(salida, { recursive: true });
  const flow = path.join(tmp, "flow-ios.yaml");
  escribirFlow(man, salida, flow, "ios");
  correr("xcrun", ["simctl", "status_bar", udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active",
    "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "discharging", "--batteryLevel", "100"]);
  try {
    log("Maestro: login con la cuenta demo y capturas…");
    maestro(udid, flow, cred, tmp, "ios");
  } finally {
    intentar("xcrun", ["simctl", "status_bar", udid, "clear"]);
  }
  comprobarCarpeta(man, salida, d);

  // 6.5" (lo que tiene la ficha de ASC): derivada de la de 6.9", como siempre.
  const d65 = man.dispositivos["ios-6.5"];
  const salida65 = path.join(tmp, "ios-6.5");
  fs.mkdirSync(salida65, { recursive: true });
  for (const c of man.capturas) {
    correr("sips", ["-z", String(d65.alto), String(d65.ancho), path.join(salida, `${c.id}.png`), "--out", path.join(salida65, `${c.id}.png`)]);
  }
  comprobarCarpeta(man, salida65, d65);
  log(`✔ iOS: ${man.capturas.length} capturas (6.9" y 6.5")`);
}

// ─── Android ─────────────────────────────────────────────────────────────────

const adb = (serial, ...a) => correr(ADB, ["-s", serial, ...a]);

function emuladorConectado() {
  return correr(ADB, ["devices"]).split("\n").slice(1).map((l) => l.split("\t")).find(([s, e]) => s?.startsWith("emulator-") && e === "device")?.[0];
}

async function asegurarEmulador(avd, log) {
  let serial = emuladorConectado();
  if (serial) return { serial, lanzado: false };
  log(`levantando el emulador ${avd}…`);
  // DNS explícito: el qemu de esta máquina a veces pierde el DNS (memoria android-emulator-dns).
  const p = spawn(path.join(ANDROID_HOME, "emulator/emulator"), ["-avd", avd, "-no-snapshot-save", "-no-boot-anim", "-dns-server", "8.8.8.8,1.1.1.1"],
    { detached: true, stdio: "ignore" });
  p.unref();
  const limite = Date.now() + 4 * 60_000;
  while (Date.now() < limite) {
    serial = emuladorConectado();
    if (serial && intentar(ADB, ["-s", serial, "shell", "getprop", "sys.boot_completed"]) === "1") return { serial, lanzado: true };
    await dormir(3000);
  }
  throw new Aborto("El emulador no terminó de arrancar en 4 min");
}

function keystoreDebug() {
  const k = [path.join(os.homedir(), ".android/debug.keystore"), path.join(MOBILE, "android/app/debug.keystore")].find((x) => fs.existsSync(x));
  if (!k) throw new Aborto("No encontré un debug.keystore para firmar los splits del AAB");
  return k;
}

async function capturarAndroid({ man, args, cred, tmp, log }) {
  const d = man.dispositivos.android;
  if (!fs.existsSync(args.aab)) throw new Aborto(`No existe el AAB ${args.aab} (lo genera /store-release) — o pasá --aab`);
  const { serial, lanzado } = await asegurarEmulador(d.avd, log);
  log(`emulador ${serial}${lanzado ? " (lo levanté yo)" : ""}`);
  // El AVD es compartido (sesión de desgrava): solo se toca com.tribbu.app y se
  // restaura todo lo demás al terminar.
  const umbrales = ["sys_storage_threshold_percentage", "sys_storage_threshold_max_bytes"];
  // Sin autofill no aparece la hoja de Google Password Manager después del
  // login (tapa la app y con ella vimos crashear Fabric: RetryableMountingLayerException).
  const autofill = intentar(ADB, ["-s", serial, "shell", "settings", "get", "secure", "autofill_service"]);
  try {
    adb(serial, "shell", "settings", "put", "secure", "autofill_service", "null");
    adb(serial, "shell", "wm", "size", "reset");
    adb(serial, "shell", "cmd", "uimode", "night", "no");
    const tam = adb(serial, "shell", "wm", "size");
    if (!tam.includes(`${d.ancho}x${d.alto}`)) throw new Aborto(`El emulador mide ${tam} (se espera ${d.ancho}x${d.alto})`);

    if (!args.sinBuild) {
      log(`instalando ${path.basename(args.aab)} (splits de bundletool)…`);
      intentar(ADB, ["-s", serial, "uninstall", BUNDLE_ID]);
      adb(serial, "shell", "settings", "put", "global", umbrales[0], "1");
      adb(serial, "shell", "settings", "put", "global", umbrales[1], "104857600");
      const apks = path.join(tmp, "tribbu.apks");
      correrConLog("bundletool", ["build-apks", "--bundle", args.aab, "--output", apks, "--connected-device", "--device-id", serial,
        "--adb", ADB, "--ks", keystoreDebug(), "--ks-pass", "pass:android", "--ks-key-alias", "androiddebugkey", "--key-pass", "pass:android"],
      { log: path.join(tmp, "bundletool-build.log"), env: { JAVA_HOME } });
      correrConLog("bundletool", ["install-apks", "--apks", apks, "--device-id", serial, "--adb", ADB],
        { log: path.join(tmp, "bundletool-install.log"), env: { JAVA_HOME } });
    }
    if (!adb(serial, "shell", "pm", "list", "packages", BUNDLE_ID).includes(BUNDLE_ID)) {
      throw new Aborto("tribbu no está instalada en el emulador — corré sin --sin-build");
    }

    const salida = path.join(tmp, "android");
    fs.mkdirSync(salida, { recursive: true });
    const flow = path.join(tmp, "flow-android.yaml");
    escribirFlow(man, salida, flow, "android");
    // Modo demo de SystemUI: 9:41, batería llena, wifi, sin notificaciones.
    const demo = (...extra) => adb(serial, "shell", "am", "broadcast", "-a", "com.android.systemui.demo", ...extra);
    adb(serial, "shell", "settings", "put", "global", "sysui_demo_allowed", "1");
    demo("-e", "command", "enter");
    demo("-e", "command", "clock", "-e", "hhmm", "0941");
    demo("-e", "command", "battery", "-e", "level", "100", "-e", "plugged", "false");
    demo("-e", "command", "network", "-e", "wifi", "show", "-e", "level", "4", "-e", "mobile", "hide");
    demo("-e", "command", "notifications", "-e", "visible", "false");
    try {
      log("Maestro: login con la cuenta demo y capturas…");
      maestro(serial, flow, cred, tmp, "android");
    } finally {
      intentar(ADB, ["-s", serial, "shell", "am", "broadcast", "-a", "com.android.systemui.demo", "-e", "command", "exit"]);
    }
    comprobarCarpeta(man, salida, d);
    log(`✔ Android: ${man.capturas.length} capturas`);
  } finally {
    for (const u of umbrales) intentar(ADB, ["-s", serial, "shell", "settings", "delete", "global", u]);
    if (autofill && autofill !== "null") intentar(ADB, ["-s", serial, "shell", "settings", "put", "secure", "autofill_service", autofill]);
    if (lanzado) intentar(ADB, ["-s", serial, "emu", "kill"]);
  }
}

// ─── capturar ────────────────────────────────────────────────────────────────

async function cmdCapturar(args) {
  const man = leerManifiesto();
  const head = git("rev-parse", "--short", "HEAD");
  const sucio = git("status", "--porcelain", "--", "mobile", "src/lib").split("\n")
    .filter((l) => l && !/mobile\/(assets\/store|stores)\//.test(l));
  if (sucio.length) console.log(`⚠ Hay cambios sin commitear en mobile/ o src/lib/ — las capturas no van a ser de ${head}:\n${sucio.map((l) => `  ${l}`).join("\n")}`);
  console.log(`Capturar ${man.capturas.length} pantallas (${man.capturas.map((c) => c.id).join(", ")}) desde ${head} · ${args.plataforma}`);

  const cred = await credencialesDemo();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tribbu-capturas-"));
  const plataformas = args.plataforma === "all" ? ["ios", "android"] : [args.plataforma];
  for (const p of plataformas) {
    const log = (m) => console.log(`[${p}] ${m}`);
    await (p === "ios" ? capturarIos : capturarAndroid)({ man, args, cred, tmp, log });
  }

  // Todo salió: recién ahora se reemplaza el set del repo.
  const carpetas = plataformas.flatMap((p) => (p === "ios" ? ["ios", "ios-6.5"] : ["android"]));
  const ids = new Set(man.capturas.map((c) => `${c.id}.png`));
  for (const carpeta of carpetas) {
    const destino = path.join(DIR_CAPTURAS, carpeta);
    fs.mkdirSync(destino, { recursive: true });
    for (const f of fs.readdirSync(destino)) if (f.endsWith(".png") && !ids.has(f)) fs.rmSync(path.join(destino, f));
    for (const f of ids) fs.copyFileSync(path.join(tmp, carpeta, f), path.join(destino, f));
  }
  if (args.plataforma === "all") guardarDesde(head);
  else console.log(`⚠ Solo se capturó ${args.plataforma}: "desde" queda en ${man.desde} hasta capturar las dos plataformas`);
  console.log(`\n✔ Capturas en ${path.relative(REPO, DIR_CAPTURAS)}/{${carpetas.join(",")}}${args.plataforma === "all" ? ` · desde = ${head}` : ""}`);
  console.log(`Logs: ${tmp}`);
  console.log("Falta: revisión visual (cada captura nueva contra la anterior) y commit en un PR.");
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = leerArgs(process.argv.slice(2));
  if (args.comando === "detectar") cmdDetectar();
  else await cmdCapturar(args);
}

main().catch((e) => {
  console.error(e instanceof Aborto ? `✖ ${e.message}` : e);
  process.exit(1);
});
