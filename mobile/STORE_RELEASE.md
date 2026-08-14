# Publicación en App Store y Google Play — runbook

Spec: `../specs/publicacion-appstore-google-play.md`. El pipeline técnico
(build + firma + submit vía EAS) ya funciona en ambas plataformas; este runbook
cubre el tramo manual de consolas, con el copy listo para pegar.

## Estado verificado (2026-08-14, vía Play Developer API)

- **Play track interno**: 1.1.0 / versionCode **7** `completed` (hay además un
  release `draft` viejo en interno — descartarlo).
- **Play alpha y beta**: releases `draft` de 1.1.0/vc7 sin publicar —
  descartarlos o completarlos; recomendado descartarlos y promover directo
  interno → producción para no mantener 4 tracks.
- **Play producción**: vacío. **Ficha**: solo el título "Tribbu" (es-419);
  faltan descripciones, gráficos y todos los cuestionarios.
- **iOS**: la app 6787757386 existe en App Store Connect y recibe builds por
  TestFlight; falta toda la ficha de App Store + revisión.
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

## ⚠️ Bloqueante iOS — eliminación de cuenta in-app (guideline 5.1.1(v))

La app **sí tiene creación de cuenta in-app** ("Registrarme con código de
invitación", `mobile/features/auth`). Apple exige que toda app con creación de
cuenta ofrezca también **eliminación de cuenta iniciada dentro de la app** (un
email de contacto NO alcanza). Antes de enviar a revisión, elegir una:

1. **Implementar "Eliminar mi cuenta"** en Más → Cuenta (recomendado): borra
   el usuario vía una Edge Function con service-role (patrón
   `manage-auth-user`) previa confirmación. Sirve también para el formulario
   de Data safety de Play.
2. **Quitar el registro por código del build de iOS** (dejar solo login): si
   no hay creación de cuenta in-app, la exigencia no aplica. Menos trabajo,
   pero pierde el alta autogestionada en iOS.

Las Review Notes de abajo asumen que se eligió una de las dos opciones —
ajustar la redacción según cuál.

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
promueve vc7 desde el track interno (no hace falta build nuevo).

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
5. **Promoción**: Release → Internal testing → release 1.1.0 (vc7) → Promote
   release → Production → rollout 100% → enviar a revisión (la primera
   revisión de producción puede tardar varios días).
6. **Verificar**: app instalable buscando "tribbu" desde un dispositivo
   no-tester (la propagación post-aprobación puede tardar horas).

## App Store (app 6787757386)

**Primero un build nuevo**: el cambio `supportsTablet: false` debe llegar al
binario que se envía a revisión.

```bash
cd mobile
npx -y eas-cli@latest build -p ios --profile production
npx -y eas-cli@latest submit -p ios --latest
```

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
   > invitation code from their school. [Si se implementó la opción 1:]
   > Account deletion is available in-app under "Más → Cuenta → Eliminar mi
   > cuenta". [Si se eligió la opción 2, quitar la frase anterior y aclarar
   > que este build no ofrece creación de cuenta.] The demo account provided
   > is a parent account with one child in a demo classroom pre-loaded with
   > sample data (calendar events, reminders, a fundraiser, lunch menu,
   > birthdays). Push notifications are scoped to the user's classroom.

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

En Play, además: "Data is encrypted in transit" → Sí; "Users can request data
deletion" → Sí (vía `privacidad@tribbu.app`, sección "Eliminación de cuenta"
de la política).
