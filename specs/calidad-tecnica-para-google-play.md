---
title: Calidad técnica para Google Play
status: implemented
priority: high
---

## Summary

Google Play marcó la versión 1.13.0 de tribbu con un problema obligatorio y dos recomendaciones. Lo obligatorio es "DEX code optimization is below our threshold": la ofuscación está al 2%, el umbral es 25% y el plazo vence en febrero de 2027. Debajo de ese umbral Play baja la visibilidad de la app y puede limitar las publicaciones. Las recomendaciones son dos. La primera pide sacar las restricciones de orientación y tamaño para soportar pantallas grandes. La segunda avisa que la app usa APIs de edge-to-edge obsoletas. Este spec activa R8 en los builds de Android. También deja que la app rote en tablets y plegables, sin cambiar nada para las familias que la usan en el celular, que sigue en vertical. Por último, documenta por qué el aviso de edge-to-edge no se corrige desde tribbu: viene de las librerías.

## Acceptance Criteria

**Ofuscación y optimización (R8), obligatorio**

- [x] `expo-build-properties` (la versión de Expo 54, `~1.0.10`, instalada con `npx expo install`) está en `plugins` de `mobile/app.config.js` con `android.enableMinifyInReleaseBuilds: true` y `android.enableShrinkResourcesInReleaseBuilds: true`.
- [x] El AAB de producción sale compilado con R8. `BUNDLE-METADATA/com.android.tools/r8.json` reemplaza al `d8.json` de vc48, y el AAB trae `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`, así Play desofusca crashes y ANR sin subir nada a mano. _(2026-10-21: verificado en un AAB de `./gradlew bundleRelease` local con `r8.json` y `proguard.map` de 28 MB; el 89% de las clases del APK quedó con nombre ofuscado. Falta confirmarlo en el AAB de EAS del próximo release; el skill `/store-release` ya lo chequea.)_
- [x] La verificación de Firebase del skill `/store-release` sigue dando ≥ 1 (`943309263680` en `base/resources.pb`): el shrinking de recursos no saca `google-services`. _(AAB: 2; APK: 1; `FirebaseInitProvider: FirebaseApp initialization successful` en el emulador.)_
- [ ] Hay una prueba de humo sobre un build release minificado: el perfil `apk` instalado en el emulador. Pasan todos los módulos nativos: _(2026-10-21, build minificado en el emulador con la cuenta demo y sin escribir en producción. Probado: login con sesión que persiste, deep link `tribbu://recordatorios`, `Sheet` de Filtros, selector de PDF, de fotos y de fecha, "Calendario del dispositivo" (26 eventos), huella (avisa "No disponible" sin huella cargada), íconos, lista de Mensajes y el chat con las normas, y Excel con el selector para compartir. **Falta, en un teléfono real desde la prueba interna de Play:** push, porque `registerForPush` no corre en emulador (`Device.isDevice`); elegir, recortar y comprimir una foto (el selector se abre, pero no se eligió ninguna para no subir nada); y subir el Excel del menú, que necesita una cuenta del colegio.)_
  - Login con sesión que persiste al reiniciar.
  - Registro de push, recepción y que tocarla abra la pantalla correcta (`expo-notifications` + FCM).
  - Foto de perfil con elegir, recortar y comprimir (`expo-image-picker` + `expo-image-manipulator`).
  - Adjuntar un PDF (`expo-document-picker`).
  - Subir el Excel del menú (`expo-file-system` + `xlsx`) y exportar un Excel (`expo-sharing`).
  - "Calendario del dispositivo" (`expo-calendar`).
  - Desbloqueo con huella (`expo-local-authentication`).
  - Íconos (fuentes de `@expo/vector-icons`).
  - Sheets y animaciones (`react-native-reanimated`, `react-native-gesture-handler`).
  - Chat en vivo (Realtime).
  - Deep link `tribbu://recordatorios?openAviso=…`.
- [x] Si R8 rompe algo, se arregla con una regla puntual y comentada en `extraProguardRules`; no se desactiva la minificación. _(No hizo falta ninguna regla.)_
- [ ] En Play Console, la primera versión que salga con esto ya no muestra "DEX code optimization is below our threshold". _(Pendiente: se ve después del próximo release.)_

**Pantallas grandes (tablets y plegables)**

- [x] El `AndroidManifest.xml` generado no tiene `android:screenOrientation` en `.MainActivity`, ni `resizeableActivity="false"`, ni `maxAspectRatio`/`minAspectRatio`.
- [x] En celulares (`smallestScreenWidthDp < 600`), la app sigue solo en vertical aunque el teléfono tenga la rotación automática activada. También queda en vertical si se abre con el teléfono en horizontal. _(Verificado con la rotación automática activada: al girar el emulador, la pantalla sigue en `ROTATION_0`. No se probó abrirla con el teléfono ya en horizontal; el bloqueo corre en `onCreate` antes de `super`.)_
- [x] En tablets y plegables abiertos (`smallestScreenWidthDp ≥ 600`), la app rota, se puede usar en vertical y en horizontal, y funciona en una ventana redimensionable (multiventana o modo escritorio). _(Simulado con `wm size 1600x2560`, lado chico de 610dp: al abrir y al agrandar con la app abierta, el log de eventos registra `wm_set_requested_orientation: [-1, …]` y la app rota a horizontal (975×610dp). La multiventana y el modo escritorio no se probaron.)_
- [x] `configChanges` de `.MainActivity` suma `smallestScreenSize`. Así, plegar, desplegar o redimensionar la ventana no recrea la Activity ni reinicia la app (hoy perdería el estado de React y la pantalla actual). _(Mismo PID y mismo `ActivityRecord` antes y después de agrandar y achicar; la app siguió en la misma pantalla.)_
- [x] En pantallas anchas, el contenido de las secciones de `(tabs)`, el `AppHeader`, la `FloatingTabBar`, las `Sheet` y el chat a pantalla completa quedan centrados con un ancho máximo, en lugar de estirarse a todo el ancho. En un celular no cambia nada visible. _(Visto en horizontal a 975dp: Hoy, Avisos, `Sheet` de Filtros, Mensajes y el chat con las normas.)_
- [ ] En horizontal se respetan los insets laterales (recorte de cámara o barra de navegación al costado): ningún contenido ni botón queda tapado. [skill: vercel-react-native-skills] _(Implementado con `useInsetsLaterales`; el emulador usa navegación por gestos y no tiene recorte lateral, así que en la práctica no se ejercitó.)_
- [ ] El panel del colegio (`(super)`, grilla de módulos y cada módulo) se puede usar en una tablet en horizontal. _(Implementado igual que `(tabs)`; no se probó, porque hace falta una cuenta del colegio.)_
- [ ] Probado en un emulador de tablet (Pixel Tablet, API 36), en la rotación de un plegable y en el AVD de celular `Medium_Phone_API_36.1`, que tiene que quedar en vertical. _(No hay `avdmanager` instalado: se simuló la tablet y el plegable en el AVD de celular con `wm size`, que también cubre el cambio de tamaño con la app abierta.)_
- [x] iOS no cambia: sigue con `orientation: "portrait"` y `supportsTablet: false`. _(El plugin solo tiene mods de Android; `npx expo export -p ios` OK.)_
- [ ] En Play Console, la versión nueva ya no muestra "Remove resizability and orientation restrictions…". _(Pendiente: se ve después del próximo release.)_

**Edge-to-edge (documentar, no corregir)**

- [x] `CLAUDE.md` (Mobile → Build & distribution) dice que el aviso de "deprecated APIs or parameters for edge-to-edge" viene de librerías y no de tribbu. Enumera las clases encontradas en el dex de vc48 y aclara que se revisa al actualizar Expo/React Native.
- [x] La app no agrega llamadas propias a esas APIs:
  - `StatusBar` sigue solo con `style`, sin `backgroundColor` ni `translucent`.
  - `app.config.js` no usa `androidStatusBar` ni `androidNavigationBar`.
  - No se llama a `setStatusBarColor` ni a `setNavigationBarColor` desde código nativo propio.

**Release y documentación**

- [ ] Sale en la próxima versión con bump de `expo.version`: 1.13.0 ya está en producción y en review. _(Pendiente: se hace al correr `/store-release`.)_
- [x] El skill `/store-release` suma a la verificación posterior al build: AAB con `r8.json` y `proguard.map`.
- [x] `mobile/STORE_RELEASE.md` o el skill recuerdan regenerar `mobile/android/` (`npx expo prebuild --clean` y reaplicar `debuggableVariants = []`) para la prueba local, porque se agregan plugins. _(En el skill `/store-release`.)_

## Technical Notes

- **Diagnóstico sobre el AAB de vc48** (`mobile/tribbu-production.aab`):
  - **Sin R8:** el dex se compiló con D8 (`BUNDLE-METADATA/com.android.tools/d8.json`) y el AAB no trae `proguard.map`. El 2% de ofuscación es solo lo que algunas librerías ya traen ofuscado.
  - **Orientación:** el manifest tiene `screenOrientation="portrait"` en `.MainActivity`, que sale de `orientation: "portrait"` en `app.config.js`. `configChanges` = `keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode`, sin `smallestScreenSize`.
  - **APIs de edge-to-edge** (`dexdump` sobre `base/dex/*.dex`): `setStatusBarColor`, `setNavigationBarColor`, `setDecorFitsSystemWindows` y `layoutInDisplayCutoutMode` se llaman solo desde librerías:
    - `androidx.activity.EdgeToEdgeApi23/26/28/29/30`
    - `androidx.core.splashscreen.SplashScreen$Impl31`
    - `androidx.core.view.WindowCompat`
    - `com.facebook.react.modules.statusbar.StatusBarModule`
    - `com.facebook.react.views.view.WindowUtilKt`
    - `com.google.android.material` (`BottomSheetDialog`, `EdgeToEdgeUtils`, `SheetDialog`)
    - `com.swmansion.rnscreens.ScreenWindowTraits`
    - `expo.modules.imagepicker.ExpoCropImageUtils`
- **R8:** los nombres de las opciones de `expo-build-properties` 1.0.x (Expo 54) se verificaron en sus tipos: `enableMinifyInReleaseBuilds`, `enableShrinkResourcesInReleaseBuilds` y `extraProguardRules` (el viejo `enableProguardInReleaseBuilds` es de versiones anteriores a la 54). React Native, los módulos de Expo y Firebase traen sus propias reglas, así que el riesgo está en código que usa reflexión. El JS (Hermes) no se ve afectado. Solo cambia el build release: `npx expo run:android` (debug) queda igual. El perfil `apk` de `eas.json` extiende `production` y también sale minificado: es el que se usa para la prueba de humo (`eas build -p android --profile apk --local`, luego `adb install`). El build va a tardar algo más.
- **Orientación sin tocar iOS:** `orientation` de `app.config.js` aplica a las dos plataformas, así que queda en `"portrait"`. Android se ajusta con un config plugin propio, `mobile/plugins/withPantallasGrandes.js`, de la misma familia que `withPodsDeploymentTarget.js`, usando `withAndroidManifest`: le saca `android:screenOrientation` a `.MainActivity` y agrega `smallestScreenSize` a `android:configChanges`.
- **Vertical en celulares:** se decide al abrir y en cada cambio de configuración. Hay dos opciones:
  - **Recomendada, bloqueo nativo:** `withMainActivity` inyecta en `MainActivity.onCreate` (antes de `super`) y en `onConfigurationChanged` algo como `requestedOrientation = if (resources.configuration.smallestScreenWidthDp < 600) SCREEN_ORIENTATION_PORTRAIT else SCREEN_ORIENTATION_UNSPECIFIED`. Aplica antes del primer frame, no agrega dependencias y acompaña el plegar y desplegar.
  - **Alternativa:** `expo-screen-orientation` `~9.0.9` con `lockAsync` desde `app/_layout.jsx` y un listener de dimensiones. Es más simple de mantener, pero corre recién cuando carga el JS: un celular en horizontal muestra el splash girado un instante.

  Android 16 (targetSdk 36) ignora igual el bloqueo en pantallas de ≥ 600dp, así que la regla "solo celulares" deja el mismo comportamiento en Android 15 y anteriores. Riesgo: si el chequeo de Play también mira pedidos de orientación en tiempo de ejecución, y no solo el manifest, el aviso podría seguir. En ese caso es aceptable, porque el celular tiene que quedar en vertical.
- **Ancho máximo:** una constante solo de mobile, por ejemplo `ANCHO_MAX_CONTENIDO = 720` en `mobile/lib/layout.js`. Se aplica con `width: "100%"`, `maxWidth` y `alignSelf: "center"` en:
  - El contenedor de `app/(tabs)/_layout.jsx` (envuelve `AppHeader` y `Tabs`).
  - La `FloatingTabBar` (posicionada en forma absoluta: centrarla).
  - La tarjeta de `components/Sheet.jsx` (hoy usa todo el ancho, con `maxHeight: "88%"`).
  - El `Modal` del chat en `features/mensajes`.
  - `app/(super)`.

  Hay que usar `useWindowDimensions()` (no `Dimensions.get` una sola vez) para que reaccione a la rotación y al redimensionado. Estilos solo con `StyleSheet` y tokens de `@shared/tokens`, como el resto de mobile.
- **Prueba en tablet:** crear un AVD de Pixel Tablet con API 36 (`~/Library/Android/sdk`, igual que `Medium_Phone_API_36.1`). Para el plegable sirve el "Resizable" o el "Pixel Fold" del emulador.
- **Edge-to-edge:** Expo 54 ya activa edge-to-edge por defecto, y en Android 16 no se puede desactivar. En la app, `<StatusBar style="light" />` de `expo-status-bar` en `app/_layout.jsx` solo fija el color de los íconos. Los `Modal statusBarTranslucent` de `AppHeader`, Marketplace y Mensajes se dejan como están. No hay nada que cambiar en tribbu.
- Nada de esto toca Supabase, la web (`src/`) ni la lógica compartida `@shared`.

## Out of Scope

- Actualizar Expo SDK o React Native, y parchear librerías para que dejen de llamar a las APIs de edge-to-edge obsoletas. El aviso queda hasta una actualización de Expo, y androidx también lo dispara.
- Rotación en celulares (siguen solo en vertical).
- Diseños específicos para tablet (dos columnas, lista y detalle) más allá de centrar el contenido con ancho máximo.
- iPad: `supportsTablet` sigue en `false`, y la orientación en iOS no cambia.
- Reporte de crashes propio (Crashlytics, Sentry). Play desofusca con el `proguard.map` que viaja en el AAB.
- Otros avisos de Play Console o del informe previo al lanzamiento que no están en esta captura.
- La app web y la vieja app de Capacitor (`android/` de la raíz).
