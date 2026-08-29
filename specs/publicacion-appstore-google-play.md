---
title: Publicación en App Store y Google Play
status: in-progress
priority: high
---

## Summary

Hoy la app mobile de tribbu solo llega a los apoderados por canales de prueba:
en iOS se distribuye vía TestFlight (requiere invitación) y en Android vive en
el track **interno** de Google Play (1.0.0/vc4 desde 2026-07-23, hoy 1.1.0).
Para que cualquier apoderado o Room Parent instale la app buscándola en la
tienda — sin invitaciones ni links especiales — falta completar el tramo
"de binario a tienda pública": fichas de las tiendas (textos, capturas,
gráficos), cuestionarios obligatorios (privacidad de datos, clasificación de
edad, acceso con credenciales de prueba), y el envío a revisión / promoción a
producción. El pipeline técnico (build + firma + submit vía EAS) ya está
operativo en ambas plataformas; este spec cubre exclusivamente lo que falta.

## Acceptance Criteria

### Comunes

- [x] La política de privacidad (`public/privacidad.html`, ya existente y
      linkeada desde el login) está accesible en una **URL pública productiva**
      — `https://tribbu-alpha.vercel.app/privacidad.html` (verificado 200,
      2026-08-14) — y esa URL exacta es la que debe cargarse en App Store
      Connect y en Play Console.
- [x] Existe un canal de **solicitud de eliminación de cuenta** documentado en
      la política de privacidad (alcanza con el mailto `privacidad@tribbu.app`
      ya presente, siempre que la política lo mencione explícitamente como vía
      de eliminación) — Google lo exige en Data safety cuando la app tiene
      cuentas; Apple 5.1.1(v) **no** exige borrado in-app porque tribbu no
      tiene auto-registro (las cuentas las crean admins), pero eso debe
      explicarse en las Review Notes.
- [x] Existe una **cuenta demo** funcional contra producción — `demo@tribbu.app`
      (María Torres, apoderada + Room Parent del curso demo "3°A — Primaria"
      con eventos, recordatorios, colecta y cumpleaños ficticios; credenciales
      en `mobile/STORE_RELEASE.md`) — falta cargarla en App Review (iOS) y en
      Play Console → App access (Android).
- [x] **Resuelto el bloqueante Apple 5.1.1(v)**: implementado "Eliminar mi
      cuenta" en Más → Cuenta (mobile) con doble confirmación, respaldado por
      la Edge Function `delete-account` (deployada; borra los datos propios
      del usuario vía JWT + service-role, anula referencias históricas y no
      toca `hijos`). QA end-to-end en emulador: cuenta de prueba eliminada de
      `usuarios`/Auth/dependencias. Los builds que se envíen a revisión deben
      incluir este código.
- [ ] El binario enviado a revisión en cada tienda es un build `production` de
      EAS con versión ≥ 1.1.0 y — en Android — versionCode ≥ 4 (los vc ≤ 3 se
      compilaron sin `google-services.json` y tienen push roto).
- [ ] Push verificado en el binario de tienda de cada plataforma (recibir una
      notificación real de recordatorio/evento en un dispositivo físico).

### iOS — App Store

- [x] Ficha completa en App Store Connect (app 6787757386): nombre, subtítulo,
      descripción, keywords, categoría (Educación), URL de soporte y URL de
      privacidad. Copy en español, con el vocabulario del dominio (curso,
      apoderado, recordatorio, colecta).
- [x] Capturas de pantalla del set requerido de iPhone subidas (generables
      desde el simulador con la cuenta demo).
- [x] Decisión tomada sobre iPad: se fijó `supportsTablet: false` en
      `mobile/app.config.js` (app phone-first; evita las capturas de iPad 13″)
      — requiere un build de iOS nuevo antes del envío.
- [x] Cuestionario **App Privacy** completado (datos recolectados: email,
      nombre, fotos/adjuntos subidos, identificadores de push; vinculados a la
      identidad; sin tracking ni ads).
- [x] Cuestionario de **clasificación de edad** completado (la app es para
      adultos/apoderados; el contenido no está dirigido a niños).
- [x] Review Notes cargadas (credenciales demo + modelo por invitación).
      **Rechazo 2026-08-27 por Guideline 3.2 (Business)**: Apple leyó el
      modelo por invitación como app interna de una organización. Respuesta
      y notas revisadas en `mobile/stores/appstoreconnect/issue-1-respuesta.md`
      (reescribir las Review Notes: hay auto-registro con código, cualquier
      colegio puede sumarse, gratis sin IAP). Plan B: Unlisted App Distribution.
- [ ] App re-enviada a revisión tras el rechazo 3.2 y aprobada: estado **Ready for Sale**, visible
      buscando "tribbu" en el App Store.

### Android — Google Play

- [ ] Ficha de la tienda completa en Play Console (`com.tribbu.app`):
      descripción corta (≤80) y completa (≤4000) en español, ícono 512×512,
      **feature graphic 1024×500**, y capturas de teléfono (generables desde el
      emulador con la cuenta demo).
- [ ] Declaraciones obligatorias completadas: **Content rating** (cuestionario
      IARC), **Data safety** (mismos datos que App Privacy de iOS + vía de
      eliminación de cuenta), **público objetivo** declarado como adultos
      (la app la usan apoderados; declarar que NO está dirigida a niños evita
      caer en la Families Policy pese al dominio escolar), **App access** con
      la cuenta demo, y declaración de ads (sin publicidad).
- [ ] Verificado si la cuenta de developer tiene el requisito de **closed
      testing previo a producción** (cuentas personales creadas después de
      nov-2023: 12 testers durante 14 días). Si aplica, el plan de testers está
      en marcha antes de la promoción; si no aplica (cuenta de organización o
      anterior), se promueve directo.
- [ ] Release **promovida del track interno a producción** (rollout 100%) —
      puede ser el mismo AAB ya subido o un build nuevo ≥ 1.1.0; no requiere
      cambiar `eas.json` (la promoción se hace en Play Console; opcionalmente
      se cambia `submit.production.android.track` a `"production"` para
      futuros submits directos).
- [ ] App visible e instalable buscando "tribbu" en Google Play desde un
      dispositivo no-tester.

## Technical Notes

- **Runbook de ejecución**: `mobile/STORE_RELEASE.md` — estado verificado por
  API (2026-08-14: interno 1.1.0/vc7 completed, drafts en alpha/beta, ficha
  solo con título), copy listo para pegar en ambas consolas, y la tabla
  App Privacy ↔ Data safety. URL productiva de la web:
  `https://tribbu-alpha.vercel.app` (`www.tribbu.app` apunta a un deploy viejo).
- **No hay (casi) código nuevo.** El trabajo es operativo: consolas de las
  tiendas + comandos EAS. Cambios de repo posibles: retocar
  `public/privacidad.html` (mención explícita de eliminación de cuenta),
  `mobile/app.config.js` (`supportsTablet` si se decide no soportar iPad, bump
  de `version` si se genera build nuevo) y `eas.json`
  (`submit.production.android.track` a `"production"` para futuros releases).
- **Pipeline existente** (todo desde `mobile/`, CLI vía `npx -y eas-cli@latest`,
  sesión de login en `~/.expo`):
  `eas build -p <ios|android> --profile production` →
  `eas submit -p <ios|android> --latest`. Firma 100% gestionada por EAS,
  `appVersionSource: remote` auto-incrementa versiones nativas. Destinos ya
  configurados en `mobile/eas.json > submit`: iOS `ascAppId: 6787757386`,
  Android `play-service-account.json` + `track: internal`.
- **Android ya probado end-to-end**: la release 1.0.0/vc4 entró por API al
  track interno (la restricción de "primera subida manual" de Google aplica a
  crear la app, no a la primera release). El service account
  (firebase-adminsdk de `tribbu-51d30`) ya tiene la Android Developer API
  habilitada y permisos de release en Play Console.
- **Gotchas ya resueltos que conviene no romper**: `google-services.json`
  llega a EAS como file env var `GOOGLE_SERVICES_JSON` (sin él, push roto —
  fue el caso de vc ≤ 3); `ITSAppUsesNonExemptEncryption: false` ya está en
  `app.config.js` (evita el "Missing Compliance" por build en TestFlight);
  `expo-image-picker` ya declara `microphonePermission: false` para no
  arrastrar `RECORD_AUDIO` a la declaración de permisos de Play.
- **Capturas**: iOS con el simulador (`npx expo run:ios --device "iPhone 17
  Pro"` + `xcrun simctl io booted screenshot`), Android con el emulador local
  (`adb exec-out screencap`) — ambos flujos ya documentados en
  `mobile/README.md` / `CLAUDE.md`. Usar la cuenta demo con datos reales de un
  curso de prueba (nunca datos de familias reales en capturas públicas).
- **Datos declarados en ambos cuestionarios de privacidad** (derivado del
  modelo de datos real): email y nombre (`usuarios`), nombres de hijos
  (`hijos`), fotos/PDFs subidos (bucket `adjuntos` + invitaciones de cumples),
  tokens de push (`push_tokens`), teléfono de contacto (`contactos`). Todo
  vinculado a la identidad del usuario; no hay analytics de terceros, ads ni
  tracking cross-app.
- Skills locales no aplicadas: tarea operativa de release, sin UI nueva ni
  componentes React (`vercel-react-best-practices` / `frontend-design`
  omitidos a propósito).

## Out of Scope

- Flujo de **eliminación de cuenta in-app** (botón "eliminar mi cuenta"): no lo
  exige Apple sin auto-registro; la vía por email es suficiente hoy. Si en el
  futuro se agrega registro público, esto pasa a ser obligatorio.
- ASO/marketing más allá de la ficha mínima (video promocional, pruebas A/B de
  ficha, localización a otros idiomas).
- Soporte/optimización de **iPad y tablets** como experiencia de primera clase
  (solo se decide capturas-vs-`supportsTablet: false`).
- Cambios de features o de backend: no se toca `src/`, Supabase ni las Edge
  Functions.
- Deploy o cambios de hosting de la web (solo se verifica que
  `privacidad.html` esté servida públicamente).
- Automatizar releases (CI/CD, fastlane, tracks graduales): la promoción y los
  cuestionarios se hacen manualmente en las consolas.
