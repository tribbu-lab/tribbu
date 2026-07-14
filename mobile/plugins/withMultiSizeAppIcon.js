// Config plugin: genera un AppIcon.appiconset multi-tamaño clásico en vez del
// single-size (solo 1024) que escribe prebuild. Motivo: en builds instaladas
// por fuera del App Store (expo run:ios / dev), iOS no siempre deriva las
// renditions chicas desde el 1024 y la notificación muestra un ícono en blanco
// (la home screen sí funciona, lo que lo hace difícil de ver venir).
//
// Corre como mod de iOS después de que prebuild escribe el ícono single-size y
// lo reemplaza por el set completo. Usa `sips` (presente en macOS local y en
// los workers de iOS de EAS) para escalar desde el PNG fuente.

const { withDangerousMod } = require("expo/config-plugins");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// [idiom, puntos, escala] — set completo iPhone + iPad + marketing.
const SIZES = [
  ["iphone", 20, 2],
  ["iphone", 20, 3],
  ["iphone", 29, 2],
  ["iphone", 29, 3],
  ["iphone", 40, 2],
  ["iphone", 40, 3],
  ["iphone", 60, 2],
  ["iphone", 60, 3],
  ["ipad", 20, 1],
  ["ipad", 20, 2],
  ["ipad", 29, 1],
  ["ipad", 29, 2],
  ["ipad", 40, 1],
  ["ipad", 40, 2],
  ["ipad", 76, 1],
  ["ipad", 76, 2],
  ["ipad", 83.5, 2],
  ["ios-marketing", 1024, 1],
];

function writeIconSet(srcIcon, appiconsetDir) {
  fs.mkdirSync(appiconsetDir, { recursive: true });
  for (const f of fs.readdirSync(appiconsetDir)) {
    if (f.endsWith(".png")) fs.unlinkSync(path.join(appiconsetDir, f));
  }

  const images = [];
  for (const [idiom, pt, scale] of SIZES) {
    const px = Math.round(pt * scale);
    const filename = `AppIcon-${pt}x${pt}@${scale}x${idiom === "ipad" ? "-ipad" : ""}.png`;
    execFileSync(
      "sips",
      ["-z", String(px), String(px), srcIcon, "--out", path.join(appiconsetDir, filename)],
      { stdio: "ignore" }
    );
    images.push({ filename, idiom, scale: `${scale}x`, size: `${pt}x${pt}` });
  }

  fs.writeFileSync(
    path.join(appiconsetDir, "Contents.json"),
    JSON.stringify({ images, info: { author: "expo", version: 1 } }, null, 2)
  );
}

module.exports = function withMultiSizeAppIcon(config, { icon } = {}) {
  if (!icon) throw new Error("withMultiSizeAppIcon: falta la opción `icon`");
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const src = path.resolve(cfg.modRequest.projectRoot, icon);
      if (!fs.existsSync(src)) {
        throw new Error(`withMultiSizeAppIcon: no existe ${src}`);
      }
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        cfg.modRequest.projectName,
        "Images.xcassets",
        "AppIcon.appiconset"
      );
      writeIconSet(src, dir);
      return cfg;
    },
  ]);
};
