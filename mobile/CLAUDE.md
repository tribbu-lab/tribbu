# CLAUDE.md (app)

Se suma al `CLAUDE.md` de la raíz cuando se trabaja en `mobile/`.

## Emulador

**Emulador Android (esta máquina, Windows)**: AVD `tribbu_test` (`%LOCALAPPDATA%\Android\Sdk\emulator`). APK de prueba con el JS adentro: `mobile/android` + `./gradlew assembleDebug` con `JAVA_HOME` = Temurin 21 (no el JBR de Android Studio). Ver memoria `apk-build-java21`.

## Convenciones de UI

- **App**: RN + `StyleSheet`, tokens de `@shared/tokens`, íconos MaterialCommunityIcons `-outline` (emoji solo en contenido). Ver `mobile/DESIGN_SYSTEM.md`.
- App: en JSX nunca `cond && <X/>` si `cond` puede ser `0`/`""`; usar ternario. Todo `Modal` con `TextInput` lleva la receta anti-teclado (`KeyboardAvoidingView behavior="padding"` en iOS **y** Android + `ScrollView keyboardShouldPersistTaps="handled"` + `maxHeight`); un form dentro de `Sheet` va con `flexShrink:1`. iOS no apila Modals: cerrar uno antes de abrir otro (~350 ms).
- Pantallas de lista en la app: `useRecarga(cargar)` para recargar al volver.
