// Config plugin: sube el IPHONEOS_DEPLOYMENT_TARGET de todos los targets de
// Pods a un mínimo (15.1, el de Expo SDK 54). Motivo: Xcode 27 pasó a tratar
// como ERROR un deployment target por debajo de su rango soportado (15.0+), y
// algunos targets de recursos de CocoaPods no heredan la plataforma del Podfile
// sino la del podspec — SDWebImage (9.0) y RNCAsyncStorage (13.4) rompían el
// archive con "ARCHIVE FAILED" (2026-10-09, release 1.12.0).
//
// Inyecta el ajuste al principio del `post_install` que escribe prebuild, antes
// de react_native_post_install. Idempotente (marca con un comentario).

const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARCA = "# tribbu: withPodsDeploymentTarget";

module.exports = function withPodsDeploymentTarget(config, { minimo = "15.1" } = {}) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let src = fs.readFileSync(podfile, "utf8");
      if (src.includes(MARCA)) return cfg;
      const ancla = "post_install do |installer|";
      if (!src.includes(ancla)) {
        throw new Error("withPodsDeploymentTarget: no encontré `post_install` en el Podfile");
      }
      const bloque = [
        ancla,
        `    ${MARCA}`,
        "    installer.pods_project.targets.each do |t|",
        "      t.build_configurations.each do |c|",
        "        actual = c.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
        `        if actual.nil? || Gem::Version.new(actual) < Gem::Version.new('${minimo}')`,
        `          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minimo}'`,
        "        end",
        "      end",
        "    end",
      ].join("\n");
      src = src.replace(ancla, bloque);
      fs.writeFileSync(podfile, src);
      return cfg;
    },
  ]);
};
