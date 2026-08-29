# Publicación en App Store y Google Play — runbook

Spec: `../specs/publicacion-appstore-google-play.md`. El pipeline técnico
(build + firma + submit vía EAS) ya funciona en ambas plataformas; este runbook
cubre el tramo manual de consolas, con el copy listo para pegar.

## Estado verificado (2026-08-15, vía Play Developer API)

- **Play track interno**: 1.1.0 / versionCode **9** `completed` (submitteado
  2026-08-15 vía `eas submit --id c616bf17…`; **incluye la eliminación de
  cuenta in-app** — es el build a promover).
- **Play beta**: queda un release `draft` viejo de 1.1.0/vc7 — descartarlo
  (alpha ya está limpio). Promover directo interno → producción.
- **Play producción**: vacío. **Ficha**: solo el título "Tribbu" (es-419);
  faltan descripciones, gráficos y todos los cuestionarios.
- **iOS**: build 1.1.0 (con `supportsTablet: false` y eliminación de cuenta)
  subido a App Store Connect (6787757386) el 2026-08-15; falta la ficha de
  App Store + envío a revisión.
- **Web**: la URL productiva de la app es `https://tribbu-alpha.vercel.app`
  (auto-deploy activo en ese proyecto de Vercel). La política de privacidad
  está viva y actualizada en `https://tribbu-alpha.vercel.app/privacidad.html`
  (verificado 200 el 2026-08-14). Ojo: `www.tribbu.app` apunta a un deploy
  viejo — si más adelante el dominio pasa a producción, actualizar las URLs
  en ambas fichas.

## Paso 0 — Prerrequisitos (bloquean todo lo demás)

1. ~~Redeploy de la web~~ **Resuelto**: la política responde 200 en
   `https://tribbu-alpha.vercel.app/privacidad.html` — es la URL que va en
   ambas fichas.
2. ~~Cuenta demo para revisores~~ **Resuelto** (2026-08-14): existe la cuenta
   demo **`demo@tribbu.app` / `TribbuDemo2026!`** — María Torres, apoderada de
   Emma Torres y Room Parent del curso demo **"3°A — Primaria"** (curso solo
   con datos ficticios: 4 alumnos con cumpleaños, 3 eventos futuros —uno con
   confirmación de asistencia—, 3 recordatorios y 1 colecta con pagos
   parciales). Cargar estas credenciales en App Review (iOS) y App access
   (Play). No borrar el curso 3°A mientras la app esté en revisión.
3. **Capturas** (con la cuenta demo): las de **iOS ya están** en
   `mobile/assets/store/screenshots/ios/` (6 pantallas, 1320×2868 del
   iPhone 17 Pro Max — el tamaño 6.9″ que exige App Store Connect) y las de
   **Android** en `mobile/assets/store/screenshots/android/`. Regenerarlas:
   levantar la app (`npx expo run:ios|android`) y correr los flows de Maestro
   o capturar a mano (`xcrun simctl io booted screenshot` / `adb exec-out
   screencap`). Solo se exigen capturas de teléfono (iPad descartado:
   `supportsTablet: false`).

## ✅ Resuelto — eliminación de cuenta in-app (guideline 5.1.1(v))

La app tiene creación de cuenta in-app ("Registrarme con código de
invitación"), por lo que Apple exige eliminación de cuenta iniciada dentro de
la app. **Implementado** (2026-08-14): **Más → Cuenta → "Eliminar mi cuenta"**
(doble confirmación destructiva) llama a la Edge Function **`delete-account`**
(deployada), que identifica al usuario por su JWT y borra sus datos con la
service-role del lado servidor: push_tokens, leídos, asistencias,
adquiridos, recordatorios personales, accesos (usuario_cursos/usuario_hijos)
y la fila de `usuarios` + el usuario de Auth; anula referencias históricas
(pagos/colectas/cumples como responsable) y **no toca los hijos** (datos del
colegio, pueden tener otro apoderado). El rol `super` no puede autoeliminarse.
QA end-to-end verificado en emulador con un usuario descartable.

Esto también responde "sí" a la vía de eliminación in-app en Data safety de
Play. Requiere que el build enviado a revisión incluya este código (build
nuevo en ambas tiendas a partir de acá).

## Copy compartido (listo para pegar)

**Descripción larga** (App Store + Play):

> tribbu es la app de la comunidad escolar del curso: un solo lugar donde los
> apoderados y los Room Parents se organizan sin cadenas de mensajes.
>
> • Calendario del curso: eventos, reuniones y actividades, con confirmación
> de asistencia.
> • Recordatorios: lo importante de la semana, con adjuntos (imágenes y PDF)
> y aviso de leído.
> • Colectas: organizá regalos y gastos compartidos, con seguimiento de pagos.
> • Comedor: el menú del día, la semana y el mes, siempre a mano.
> • Cumpleaños y festejos: invitaciones, confirmaciones e ideas de regalo.
> • Contactos del curso y datos útiles: útiles, uniformes y libros.
> • Notificaciones push solo de tu curso: enterate de lo que importa, sin ruido.
>
> El acceso es por invitación de la institución: los administradores del
> colegio crean las cuentas y cada apoderado ve únicamente los cursos de sus
> hijos.

## Google Play (`com.tribbu.app`)

Todo en [Play Console](https://play.google.com/console). El AAB ya está: se
promueve vc9 desde el track interno (ya submitteado; no hace falta build nuevo).

1. **Ficha principal de la tienda** (Grow → Store presence → Main store listing):
   - Nombre: `tribbu — comunidad escolar` (o dejar "Tribbu")
   - Descripción corta (≤80): `La app del curso: calendario, recordatorios, colectas, comedor y cumpleaños.`
   - Descripción completa: la de arriba.
   - Ícono 512×512: `mobile/assets/icon.png`.
   - Feature graphic 1024×500: `mobile/assets/store/feature-graphic.png`
     (generado desde el ícono; reemplazable por un arte mejor).
   - Capturas de teléfono (mín. 2): las del paso 0.
2. **Declaraciones** (Policy → App content), en este orden:
   - **Privacy policy**: `https://tribbu-alpha.vercel.app/privacidad.html`.
   - **App access**: "All or some functionality is restricted" → cargar las
     credenciales demo + nota: "El acceso es por invitación; las cuentas las
     crea el colegio. La cuenta provista es un apoderado con datos de ejemplo."
   - **Ads**: No contiene publicidad.
   - **Content rating**: cuestionario IARC, categoría "Utility/Productivity/
     Communication"; sin violencia/apuestas/contenido sexual → rating Everyone.
   - **Target audience**: **18+** (la app la usan apoderados adultos; NO
     marcar que apela a niños — eso activaría la Families Policy).
   - **Data safety**: ver tabla abajo.
   - **News app**: No. **COVID-19**: No. **Government app**: No.
3. **Limpieza de tracks**: descartar el release `draft` del track interno y
   los `draft` de alpha/beta (Release → los 3 tracks → Discard release).
4. **Requisito de closed testing**: si la cuenta de developer es **personal y
   creada después de nov-2023**, Play exige 12 testers durante 14 días en
   closed testing antes de habilitar producción (Play Console lo muestra en
   Dashboard → "Apply for production access"). Si la opción "Promote to
   production" aparece habilitada, no aplica.
5. **Promoción**: Release → Internal testing → release 1.1.0 (vc9) → Promote
   release → Production → rollout 100% → enviar a revisión (la primera
   revisión de producción puede tardar varios días).
6. **Verificar**: app instalable buscando "tribbu" desde un dispositivo
   no-tester (la propagación post-aprobación puede tardar horas).

## App Store (app 6787757386)

~~Primero un build nuevo~~ **Hecho** (2026-08-15): build 1.1.0 de iOS con
`supportsTablet: false` + eliminación de cuenta in-app subido a App Store
Connect vía `eas submit` (aparece en TestFlight tras el procesamiento de
Apple, ~5–10 min). Es el build a seleccionar en la versión de App Store.

Luego en [App Store Connect](https://appstoreconnect.apple.com):

1. **Ficha** (App → versión 1.1.0 → plataforma iOS):
   - Nombre (≤30): `tribbu — comunidad escolar`
   - Subtítulo (≤30): `Organizá el curso de tu hijo`
   - Keywords (≤100): `colegio,curso,apoderados,padres,escuela,recordatorios,colecta,comedor,cumpleaños,calendario`
   - Descripción: la compartida de arriba.
   - Categoría: Educación (secundaria: Productividad).
   - Support URL: `https://tribbu-alpha.vercel.app` · Privacy Policy URL:
     `https://tribbu-alpha.vercel.app/privacidad.html`.
   - Capturas iPhone 6.9″ (obligatorias; las 6.5″ se derivan solas).
   - Seleccionar el build recién subido.
2. **App Privacy** (cuestionario): ver tabla abajo. "Do you or your
   third-party partners collect data?" → Sí. Tracking (ATT): **No**.
3. **Age rating**: cuestionario sin contenido sensible → 4+ (la app es para
   adultos pero el rating mide contenido, no audiencia).
4. **App Review Information**: credenciales demo + estas notas (en inglés):

   > tribbu is an invitation-only app for school communities (parents and
   > "room parents" of a classroom). There is no public sign-up: accounts are
   > created by each school's administrators, or by parents who received an
   > invitation code from their school. Account deletion is available in-app
   > under "Más → Eliminar mi cuenta" (guideline 5.1.1(v)). The demo account
   > provided is a parent account with one child in a demo classroom
   > pre-loaded with sample data (calendar events, reminders, a fundraiser,
   > lunch menu, birthdays). Push notifications are scoped to the user's
   > classroom.

5. **Enviar a revisión** → estado "Ready for Sale".

## Datos a declarar (App Privacy ↔ Data safety)

Sin ads, sin tracking, sin analytics de terceros. Todo se recolecta para
funcionalidad de la app, vinculado a la identidad del usuario, cifrado en
tránsito, y con vía de eliminación (email). Fuente: modelo de datos real.

| Dato | Origen (tabla) | iOS App Privacy | Play Data safety |
|---|---|---|---|
| Email | `usuarios` | Contact Info → Email Address | Personal info → Email address |
| Nombre y apellido | `usuarios` | Contact Info → Name | Personal info → Name |
| Teléfono (opcional) | `contactos` | Contact Info → Phone Number | Personal info → Phone number |
| Nombre y fecha de nac. de hijos | `hijos`, `cumples` | User Content → Other User Content | Personal info → Name (cargado por admins) |
| Fotos y PDFs adjuntos | bucket `adjuntos`, invitaciones | User Content → Photos or Videos | Photos and videos / Files and docs |
| Contenido generado (eventos, recordatorios, mensajes) | `eventos`, `recordatorios`, etc. | User Content → Other User Content | Other user-generated content |
| Token de push (identificador de dispositivo) | `push_tokens` | Identifiers → Device ID | Device or other IDs |

**Play — detalle por tipo de dato** (wizard "Data types" → "Data usage and
handling"). Común a todos: solo **Collected** (nunca "Shared": Supabase/Expo
son service providers, no es sharing según Play), **ephemeral: No**, y purpose
**App functionality** (sin Analytics/Ads/Fraud/Personalization). Diferencias:

| Dato | Required/Optional | Purposes extra |
|---|---|---|
| Name | Required | + Account management |
| Email address | Required (login) | + Account management |
| Phone number | Optional | — |
| Photos | Optional (adjuntos) | — |
| Files and docs | Optional (PDFs) | — |
| Other user-generated content | Optional | — |
| Device or other IDs (push token) | Optional (permiso de notificaciones) | — |

En Play, además: "Data is encrypted in transit" → Sí; "Users can request data
deletion" → Sí. **Delete account URL** (campo obligatorio del formulario):
`https://tribbu-alpha.vercel.app/eliminar-cuenta.html` — página dedicada con
los pasos (in-app y por email), qué se elimina y qué se conserva
(`public/eliminar-cuenta.html`). Método de creación de cuenta: **"Username and
password"** solamente (email+contraseña; sin 2FA/OTP/SSO — el código de
invitación no es un método de autenticación sino un requisito de alta).

### Permiso de calendario (desde 2026-08-28, `expo-calendar`)

La opción Android "Calendario del dispositivo" (Calendario → Sincronizar)
agrega `READ_CALENDAR` y `WRITE_CALENDAR` al manifest, y el plugin deja
`NSCalendarsUsageDescription` en el Info.plist de iOS aunque iOS no lo use
(su "calendario del dispositivo" es `webcal://`). Qué implica en cada tienda:

- **Play → Data safety: no se agrega el tipo "Calendar"**. Ese tipo aplica a
  datos de calendario que salen del dispositivo. La app solo *escribe* los
  eventos del feed en un calendario "Tribbu" propio y *lee* la lista de
  calendarios para encontrar el suyo; nada de eso se transmite ni se guarda
  en Supabase (el mapa UID→eventId vive en AsyncStorage). Si el revisor
  pregunta, esa es la respuesta: procesamiento on-device, sin recolección.
- **Play → App content → Permissions**: `READ/WRITE_CALENDAR` no son
  permisos sensibles (no piden formulario de declaración como SMS/Call
  Log/Location). Solo aparecen listados automáticamente en la ficha.
- **App Store → App Privacy: sin cambios.** iOS no llama a EventKit. Si la
  revisión objeta el string de calendario en el Info.plist sin uso visible,
  la respuesta es la misma (declarado por el plugin, solo se usa en
  Android) — o se saca el plugin del build de iOS.
- **Release notes sugeridas**: "Sincronizá el calendario del curso con tu
  calendario: elegí el del teléfono o Google Calendar."

## ⚠️ Rechazo App Store 2026-08-27 — Guideline 3.2 (Business)

Apple rechazó la 1.2.0 (11) (submission 3e253611) por 3.2: leyó "acceso por
invitación / cuentas creadas por administradores" como app interna de una
organización y sugiere distribución custom (ABM/ASM) o **unlisted**. Hay que
**responder en el hilo** (App Review → Reply) las 5 preguntas y re-enviar.
Respuesta lista para pegar + notas: `mobile/stores/appstoreconnect/issue-1-respuesta.md`.
Argumento: público = familias (consumidores), gate por aula como
ClassDojo/Remind, cualquier colegio puede sumarse (landing `www.tribbu.ar` →
"Pedir una demo" / `info@tribbu.ar`), auto-registro in-app con código, gratis
sin IAP (Colectas no procesa dinero). Antes de enviar: crear un código de
invitación del curso demo para el revisor y **reescribir las Review Notes**
(las de arriba dicen "no public sign-up" y contradicen la respuesta — usar la
versión de `issue-1-respuesta.md`). Plan B si insisten: Unlisted App
Distribution (link directo, mismo build, sin ABM).

## APK compartible (distribución directa, fuera de las tiendas)

Para compartir la app por fuera de Play (WhatsApp/Drive/link directo) existe el
perfil **`apk`** de `eas.json`: extiende `production` (misma firma remota de
EAS — se instala encima de la versión de Play y viceversa —, mismas env vars de
Supabase) pero genera un `.apk` instalable directo en vez de `.aab`. Cada build
también incrementa el `versionCode` remoto (comparte la secuencia con los
builds de tienda). Build local (no consume cuota cloud, 10–25 min), desde
`mobile/`:

```bash
GOOGLE_SERVICES_JSON="$PWD/google-services.json" \
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
ANDROID_HOME="$HOME/Library/Android/sdk" \
npx -y eas-cli@latest build -p android --profile apk --local \
  --non-interactive --output ./tribbu-compartible.apk
```

- **`GOOGLE_SERVICES_JSON` con ruta absoluta es OBLIGATORIO** en builds
  locales: el archivo está gitignoreado (no entra al tarball del build) y la
  file env var de EAS es *secret* (no baja a `--local`) — sin él la APK sale
  **sin Firebase y el push no registra** (el bug de las APKs 1.0.0 de julio
  2026).
- Verificar antes de compartir (debe dar ≥1):
  `unzip -p tribbu-compartible.apk resources.arsc | grep -a -c 943309263680`.
- No hay submit: el `.apk` (gitignoreado, nunca commitearlo) se comparte
  directo; al instalar, Android pide habilitar "instalar apps desconocidas"
  para el origen desde el que se abre.

### Después de cada `expo prebuild --clean`: reaplicar `debuggableVariants = []`

`mobile/android/` es gitignored y prebuild lo regenera desde cero, así que
este ajuste local se pierde cada vez que se agrega o quita un módulo nativo
(`expo-calendar`, `expo-local-authentication`, …). En
`mobile/android/app/build.gradle`, dentro del bloque `react { … }`, debajo de
la línea comentada `// debuggableVariants = ["liteDebug", "prodDebug"]`:

```gradle
debuggableVariants = []
```

Con la lista vacía, **también el variant debug embebe el bundle JS y los
assets**, y la APK de `./gradlew assembleDebug` corre sola en cualquier
teléfono sin Metro — es lo que hace "compartible" a la APK compartible. Sin
el fix, la APK debug abre en negro buscando `localhost:8081`. Los builds de
EAS (`production`/`apk`) no lo necesitan: usan el variant release.

### Compilar la APK desde otra computadora

Con el repo clonado, el **único archivo del ambiente de desarrollo a
compartir** (por canal seguro — nunca commitearlo) es
**`mobile/google-services.json`**, la config de Firebase para el push. Nada
más: `play-service-account.json` es solo para submits a Play, y no hace falta
`.env` (las vars de Supabase van inline en el perfil `production` de
`eas.json`, y el `projectId` de EAS está hardcodeado en `app.config.js`).

El resto son accesos y toolchain, no archivos:

- **Login de EAS** con una cuenta con acceso al proyecto (owner
  `albatross-tech`): `npx eas-cli login`. El keystore de firma y el
  `versionCode` viven en los servers de EAS y se resuelven solos al buildear.
- **Node LTS** + `npm install` en `mobile/`.
- **JDK 17** (sirve el JBR de Android Studio) y **Android SDK**, apuntados por
  `JAVA_HOME` / `ANDROID_HOME` (ajustar las rutas del comando a esa máquina).
  Los builds locales de EAS corren en macOS/Linux (en Windows, vía WSL).
