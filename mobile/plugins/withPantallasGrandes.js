// Config plugin (solo Android): soporte de pantallas grandes sin cambiar nada
// en el celular. Ver specs/calidad-tecnica-para-google-play.md.
//
// Google Play marcaba "Remove resizability and orientation restrictions…"
// (1.13.0) por el android:screenOrientation="portrait" que prebuild le pone a
// .MainActivity a partir de `orientation: "portrait"` en app.config.js. Ese
// valor queda (iOS lo sigue usando) y acá, solo en Android:
//
// 1. Manifest: se saca android:screenOrientation de .MainActivity y se suma
//    smallestScreenSize a android:configChanges — sin él, plegar/desplegar o
//    redimensionar la ventana recrea la Activity y reinicia React (se pierde
//    la pantalla en la que estaba).
// 2. MainActivity.kt: los celulares (smallestScreenWidthDp < 600) se bloquean
//    en vertical desde el código, antes del primer frame (en onCreate, antes de
//    super) y de nuevo en cada cambio de configuración (plegar/desplegar).
//    Tablets y plegables abiertos quedan libres. Android 16 (targetSdk 36)
//    ignora igual cualquier bloqueo en pantallas >= 600dp.
//
// Idempotente: cada bloque inyectado lleva una marca.

const { withAndroidManifest, withMainActivity } = require("expo/config-plugins");

const MARCA = "// tribbu: withPantallasGrandes";
const ANCHO_TABLET_DP = 600;

function conManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$["android:name"] === ".MainActivity");
    if (!main) throw new Error("withPantallasGrandes: no encontré .MainActivity en el AndroidManifest");
    delete main.$["android:screenOrientation"];
    const cambios = new Set((main.$["android:configChanges"] || "").split("|").filter(Boolean));
    cambios.add("smallestScreenSize");
    main.$["android:configChanges"] = [...cambios].join("|");
    return cfg;
  });
}

function conMainActivity(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withPantallasGrandes: se esperaba MainActivity en Kotlin");
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARCA)) return cfg;

    const llamadaOnCreate = "super.onCreate(null)";
    const cierreClase = /\n}\s*$/;
    if (!src.includes(llamadaOnCreate) || !cierreClase.test(src)) {
      throw new Error("withPantallasGrandes: MainActivity.kt no tiene la forma esperada (super.onCreate(null) / cierre de clase)");
    }

    src = src.replace(llamadaOnCreate, `${MARCA}\n    verticalSoloEnCelulares(resources.configuration)\n    ${llamadaOnCreate}`);
    // En onConfigurationChanged se usa newConfig (la configuración que llega al
    // callback). Para verificar en el emulador, `adb shell wm size 1600x2560`
    // con la app abierta: el log de eventos tiene que mostrar
    // `wm_set_requested_orientation: [-1, com.tribbu.app/.MainActivity]` y la
    // app tiene que rotar. La línea requestedOrientation de `dumpsys activity`
    // NO sirve para esto: puede seguir diciendo PORTRAIT.
    src = src.replace(cierreClase, `

  ${MARCA}
  // Celular (< ${ANCHO_TABLET_DP}dp de lado chico): solo vertical. Tablet o plegable abierto: libre.
  private fun verticalSoloEnCelulares(config: android.content.res.Configuration) {
    requestedOrientation =
      if (config.smallestScreenWidthDp < ${ANCHO_TABLET_DP}) android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  }

  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    verticalSoloEnCelulares(newConfig)
  }
}
`);
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withPantallasGrandes(config) {
  return conMainActivity(conManifest(config));
};
