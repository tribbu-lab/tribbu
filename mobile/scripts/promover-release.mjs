#!/usr/bin/env node
// Promueve una versión ya subida por /store-release a producción en ambas
// tiendas, con las "Novedades" (y las Review Notes de ASC, si la sección
// "App Review" está) de mobile/stores/release-notes-<versión>.md, y deja las
// capturas de cada ficha iguales a las del repo (mobile/assets/store/screenshots).
// Specs: specs/promover-release-a-produccion.md, specs/capturas-de-tienda-al-dia.md
// · Skill: /store-promote.
//
//   node scripts/promover-release.mjs [--version 1.11.0] [--plataforma all|ios|android] [--solo-capturas] [--aplicar]
//
// Sin --aplicar solo lee y muestra el plan (el edit de Play se descarta).
// --solo-capturas: no promueve nada, solo sincroniza las capturas (Play en
// cualquier momento; iOS si hay una versión editable).
// Solo built-ins de Node: nada de dependencias.

import fs from "node:fs";
import path from "node:path";
import {
  Aborto, ESTADOS_EDITABLES, ESTADOS_ENVIADOS, MOBILE, PLAY_API, ascAppId, clienteAsc, estadoDe, pedir, tokenPlay,
} from "./tiendas.mjs";
import { estadoDelRepo, planAsc, planPlay, subirAsc, subirPlay } from "./capturas.mjs";

const MAX_PLAY = 500;
const MAX_ASC = 4000;
const MAX_REVIEW = 4000; // appStoreReviewDetail.notes

// Review Notes vencidas: el código demo de cuando existía el registro con código
// (sacado en 1.6.1) — mandarlas así deja al revisor sin forma de entrar.
const NOTAS_VENCIDAS = [/Y5WPT2/, /c[óo]digo\s+(de\s+invitaci[óo]n|demo)/i, /(invitation|demo)\s+code/i];


// ─── args ────────────────────────────────────────────────────────────────────

function leerArgs(argv) {
  const a = { plataforma: "all", aplicar: false, version: null, soloCapturas: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--aplicar") a.aplicar = true;
    else if (k === "--solo-capturas") a.soloCapturas = true;
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
  // Opcional: sin la sección se reusan las Review Notes que ya tiene ASC.
  const review = bloqueDeSeccion(md, "App Review");
  if (!play) throw new Aborto("Falta el bloque ``` de la sección '## Google Play' en las notas");
  if (!asc) throw new Aborto("Falta el bloque ``` de la sección '## App Store Connect' en las notas");
  if ([...play].length > MAX_PLAY) throw new Aborto(`Las notas de Play tienen ${[...play].length} caracteres (máx. ${MAX_PLAY})`);
  if ([...asc].length > MAX_ASC) throw new Aborto(`Las notas de ASC tienen ${[...asc].length} caracteres (máx. ${MAX_ASC})`);
  if (review && [...review].length > MAX_REVIEW) throw new Aborto(`Las Review Notes tienen ${[...review].length} caracteres (máx. ${MAX_REVIEW})`);
  if (review && NOTAS_VENCIDAS.some((re) => re.test(review))) {
    throw new Aborto("Las Review Notes de las notas mencionan un código de invitación/demo que ya no existe");
  }
  // El encabezado ("Android vc41 · iOS build 31 · …") nombra los binarios de
  // ESTA versión; los paréntesis posteriores hablan de builds descartados.
  const cabecera = md.split("\n").find((l) => /Android vc\d+|iOS build \d+/.test(l)) || "";
  const vc = cabecera.match(/Android vc(\d+)/)?.[1];
  const build = cabecera.match(/iOS build (\d+)/)?.[1];
  return { play, asc, review, vc: vc ? Number(vc) : null, build: build ? Number(build) : null };
}

// ─── Google Play ─────────────────────────────────────────────────────────────

const vcsDe = (track) => (track?.releases || []).flatMap((r) => (r.versionCodes || []).map(Number));

// Capturas que se van a subir a una tienda, o null (con el motivo en el log).
function capturasSubibles(cap, log) {
  if (cap.pendientes.length) { log("capturas: hay cambios sin commitear en el set del repo — no se tocan"); return false; }
  if (cap.errores.length) { log(`capturas: el set del repo tiene problemas (${cap.errores[0]}${cap.errores.length > 1 ? "…" : ""}) — no se tocan`); return false; }
  return true;
}

async function android({ version, notas, aplicar, soloCapturas, cap, log }) {
  const token = await tokenPlay();
  const edit = await pedir(`${PLAY_API}/edits`, { method: "POST", token, body: {} });
  const e = `${PLAY_API}/edits/${edit.id}`;
  let commiteado = false;
  try {
    // 1. Release: el vc más alto del track interno → producción.
    let release = null;
    if (!soloCapturas) {
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
      } else {
        release = { vc, nombre: relInterno?.name || version };
        log(`PUT production → vc${vc} "${release.nombre}" status=completed, notas es-419 (${[...notas.play].length} chars)`);
      }
    }

    // 2. Capturas de la ficha (es-419): van en el mismo edit que el release.
    let capturas = null;
    if (capturasSubibles(cap, log)) {
      const p = await planPlay({ token, e, man: cap.man });
      if (p.alDia) log(`capturas: al día (${p.publicadas.length})`);
      else {
        capturas = p;
        log(`capturas: reemplazar ${p.publicadas.length} → ${p.locales.length} (${p.locales.map((l) => l.nombre).join(", ")})`);
      }
    }

    const que = [release && `promover vc${release.vc}`, capturas && "reemplazar capturas"].filter(Boolean);
    if (!que.length) return { estado: soloCapturas ? "capturas al día" : "ya en producción, capturas sin cambios" };
    if (!aplicar) return { estado: `plan: ${que.join(" + ")}` };

    if (capturas) {
      await subirPlay({ token, e, editId: edit.id, locales: capturas.locales, log });
      log(`✔ capturas subidas al edit (${capturas.locales.length})`);
    }
    if (release) {
      await pedir(`${e}/tracks/production`, {
        method: "PUT", token,
        body: {
          track: "production",
          releases: [{
            name: release.nombre,
            versionCodes: [String(release.vc)],
            status: "completed",
            releaseNotes: [{ language: "es-419", text: notas.play }],
          }],
        },
      });
    }
    await pedir(`${e}:commit`, { method: "POST", token });
    commiteado = true;
    log(`✔ commit OK — ${que.join(" + ")} (pasa por la revisión de Google)`);
    return { estado: release ? `vc${release.vc} enviado a producción${capturas ? " + capturas nuevas" : ""}` : "capturas nuevas enviadas" };
  } finally {
    if (!commiteado) await pedir(e, { method: "DELETE", token }).catch(() => {});
  }
}

// ─── App Store Connect ───────────────────────────────────────────────────────

const resumenAsc = (p) => `reemplazar ${p.sets.map((x) => `${x.locale} ${x.capturas.length}`).join(", ")} → ${p.locales.length} (${p.locales.map((l) => l.nombre).join(", ")})`;

// --solo-capturas en iOS: las capturas son por versión y solo se cambian en una
// versión editable; si no hay, quedan para la próxima.
async function iosSoloCapturas({ g, w, app, aplicar, cap, log }) {
  const versiones = (await g(`/apps/${app}/appStoreVersions?filter[platform]=IOS&limit=50`)).data;
  const editable = versiones.find((v) => ESTADOS_EDITABLES.has(estadoDe(v)));
  const v = editable || versiones[0];
  if (!v) throw new Aborto("La app no tiene versiones en ASC");
  const nombre = `${v.attributes.versionString} (${estadoDe(v)})`;
  const p = await planAsc({ g, versionId: v.id, man: cap.man });
  if (p.alDia) { log(`capturas de ${nombre}: al día`); return { estado: "capturas al día" }; }
  if (!editable) {
    log(`capturas de ${nombre}: difieren de las del repo, pero no hay versión editable — quedan para la próxima versión`);
    return { estado: "capturas para la próxima versión" };
  }
  log(`capturas de ${nombre}: ${resumenAsc(p)}`);
  if (!aplicar) return { estado: "plan: reemplazar capturas" };
  await subirAsc({ g, w, versionId: v.id, man: cap.man, log });
  return { estado: `capturas nuevas en ${v.attributes.versionString}` };
}

async function ios({ version, notas, aplicar, soloCapturas, cap, log }) {
  const { g, w, gOpcional } = clienteAsc();
  const app = ascAppId();
  const subibles = capturasSubibles(cap, log);
  if (soloCapturas) return subibles ? iosSoloCapturas({ g, w, app, aplicar, cap, log }) : { estado: "capturas: no se tocan" };

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
      if (subibles) {
        const p = await planAsc({ g, versionId: misma.id, man: cap.man });
        log(p.alDia ? "capturas: al día" : `capturas: difieren de las del repo, pero ${version} ya no es editable — quedan para la próxima versión`);
      }
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
  // Si las notas de release traen la sección "App Review", esas reemplazan a las actuales.
  const fuenteNotas = versionObj || editable || versiones[0];
  const detalle = fuenteNotas ? (await gOpcional(`/appStoreVersions/${fuenteNotas.id}/appStoreReviewDetail`))?.data : null;
  const reviewNotes = detalle?.attributes?.notes || "";
  const reemplazarNotas = !!notas.review && notas.review !== reviewNotes.trim();
  const origen = fuenteNotas?.attributes.versionString || "—";
  if (!notas.review) log(`Review Notes actuales (de ${origen}):\n${reviewNotes ? reviewNotes.replace(/^/gm, "    │ ") : "    │ (vacías)"}`);
  else if (!reemplazarNotas) log(`Review Notes: las de ${origen} ya son las de release-notes-${version}.md`);
  else log(`Review Notes: se reemplazan las de ${origen} por las de release-notes-${version}.md (${[...notas.review].length} chars):\n${notas.review.replace(/^/gm, "    │ ")}`);
  if (detalle?.attributes?.demoAccountRequired != null) {
    log(`cuenta demo: ${detalle.attributes.demoAccountRequired ? `sí (${detalle.attributes.demoAccountName || "sin usuario"})` : "no requerida"}`);
  }
  const notasVencidas = NOTAS_VENCIDAS.some((re) => re.test(notas.review || reviewNotes));
  if (notasVencidas) log("⚠ Las Review Notes mencionan un código de invitación/demo que ya no existe — NO se envía a review");

  log(`asignar build ${nBuild} y cargar "Novedades" (${[...notas.asc].length} chars) en todos los locales`);

  // Capturas: contra la versión que se va a usar o, si se crea, contra la última
  // (ASC copia las capturas de la versión anterior al crear una).
  if (subibles && fuenteNotas) {
    const p = await planAsc({ g, versionId: fuenteNotas.id, man: cap.man });
    log(p.alDia ? "capturas: al día" : `capturas: ${resumenAsc(p)}`);
  }
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

  if (reemplazarNotas) {
    // Solo el campo notes: contacto y cuenta demo quedan como estén. ASC copia la
    // "Información de la revisión" al crear la versión; si no lo hizo, se crea
    // copiando esos datos de la versión de origen.
    const det = (await gOpcional(`/appStoreVersions/${versionObj.id}/appStoreReviewDetail`))?.data;
    if (det) {
      await w(`/appStoreReviewDetails/${det.id}`, "PATCH", {
        type: "appStoreReviewDetails", id: det.id, attributes: { notes: notas.review },
      });
    } else {
      const a = detalle?.attributes || {};
      const campos = ["contactFirstName", "contactLastName", "contactPhone", "contactEmail",
        "demoAccountName", "demoAccountPassword", "demoAccountRequired"];
      await w("/appStoreReviewDetails", "POST", {
        type: "appStoreReviewDetails",
        attributes: { ...Object.fromEntries(campos.filter((k) => a[k] != null).map((k) => [k, a[k]])), notes: notas.review },
        relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: versionObj.id } } },
      });
    }
    log("✔ Review Notes cargadas");
  }

  if (subibles) {
    const p = await planAsc({ g, versionId: versionObj.id, man: cap.man });
    if (!p.alDia) {
      try {
        await subirAsc({ g, w, versionId: versionObj.id, man: cap.man, log });
      } catch (err) {
        log(`✖ capturas: ${err.message}`);
        return { estado: `versión ${version} lista con build ${nBuild}, SIN enviar (fallaron las capturas)`, bloqueado: true };
      }
    }
  }

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
  const notas = args.soloCapturas ? null : leerNotas(args.version);
  const modo = args.aplicar ? "APLICANDO" : "PLAN (sin cambios)";
  if (notas) {
    console.log(`Promover ${args.version} → producción · ${modo}`);
    console.log(`notas: Play ${[...notas.play].length}/${MAX_PLAY} chars · ASC ${[...notas.asc].length}/${MAX_ASC} chars · encabezado vc${notas.vc ?? "?"} / build ${notas.build ?? "?"}`);
  } else console.log(`Capturas de las fichas · ${modo}`);
  const cap = estadoDelRepo();
  console.log(`capturas del repo: ${cap.man.capturas.map((c) => c.id).join(", ")} (desde ${cap.man.desde})`);
  if (cap.viejas.length) console.log(`⚠ las capturas del repo quedaron viejas respecto de HEAD (${cap.viejas.join(", ")}): regenerarlas con scripts/capturas-tienda.mjs capturar`);

  // Android primero (commit atómico); un fallo no frena a la otra plataforma.
  const plataformas = args.plataforma === "all" ? ["android", "ios"] : [args.plataforma];
  const resultados = {};
  let fallo = false;
  for (const p of plataformas) {
    const log = (m) => console.log(`[${p}] ${m}`);
    try {
      const r = await (p === "android" ? android : ios)({ ...args, notas, cap, log });
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
