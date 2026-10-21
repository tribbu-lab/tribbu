// Config plugin (solo Android): más memoria para el daemon de Gradle.
//
// Con R8 activo (expo-build-properties → enableMinifyInReleaseBuilds), el
// build release de EAS se cayó en :app:minifyReleaseWithR8 porque el daemon
// "se quedó sin JVM Metaspace" con los valores del template de Expo
// (-Xmx2048m -XX:MaxMetaspaceSize=512m). Pasó en el primer build de 1.13.1
// (2026-10-21) y quemó un versionCode. Acá se suben en el
// android/gradle.properties que genera prebuild.

const { withGradleProperties } = require("expo/config-plugins");

const JVMARGS = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";

module.exports = function withMemoriaGradle(config, { jvmargs = JVMARGS } = {}) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const item = { type: "property", key: "org.gradle.jvmargs", value: jvmargs };
    const i = props.findIndex((p) => p.type === "property" && p.key === "org.gradle.jvmargs");
    if (i >= 0) props[i] = item;
    else props.push(item);
    return cfg;
  });
};
