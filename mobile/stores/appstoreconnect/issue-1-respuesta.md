# Respuesta al rechazo — Guideline 3.2 (Business), submission 3e253611 (1.2.0 build 11, review 2026-08-27)

Dónde va: App Store Connect → la app → **App Review** (mensaje del rechazo) →
**Reply**. Responder en el hilo (no alcanza con re-enviar el build): Apple
espera las respuestas a sus 5 preguntas. Después, **Submit for Review** de
nuevo — puede ser el mismo build 11 o el 1.3.0 (16) ya subido (si se cambia,
poner también "1.3.0" en el campo Version de la ficha).

**Antes de enviar**, dos cosas que hacen verdadero lo que afirma el texto:

1. Crear un **código de invitación del curso demo "3°A — Primaria"** (Super
   Admin → Códigos, `usos_max` ≥ 20, dejarlo activo mientras dure la review)
   y pegarlo donde dice `[DEMO-CODE]`. Si preferís no darlo, borrar esa oración.
2. Deployar la landing con los CTAs "Pedir una demo" apuntando a
   `mailto:info@tribbu.ar` (ya editado en `public/apoderados.html`, falta
   commit + push → Vercel auto-deploya `www.tribbu.ar`). El revisor puede
   hacer clic para verificar que "cualquier colegio puede contactarnos".

---

## Texto para pegar (inglés)

Hello, and thank you for the detailed review.

We believe the assessment is incorrect: tribbu is not built for, owned by, or restricted to any single organization. It is a general-audience product for parents of school-age children, in the same category as other school-communication apps available on the App Store (e.g. ClassDojo, Remind, Bloomz). tribbu is developed and operated by us as an independent product, not by a school. Answers to your questions:

1. Is the app restricted to users who are part of a single company or organization?
No. Any school can adopt tribbu, and the users are the families (parents and guardians) of the students enrolled in each participating school — a broad consumer audience, not employees, members or partners of one organization. Content is organized per classroom, so each family sees the classrooms of their own children, but the platform itself is open to every school and every family.

2. Is the app designed for use by a limited or specific group of companies or organizations?
No. There is no closed list of clients and no exclusivity: any school — public or private, any grade level — can become a client by contacting us through our public website (https://www.tribbu.ar, "Pedir una demo" / info@tribbu.ar). We are launching commercially in Argentina and actively onboarding schools; the app is intended to serve any school community that wants it.

3. What features are intended for use by the general public?
All of them. The app's audience is parents: they use the classroom calendar with RSVP, reminders with read confirmation, shared fundraisers (a ledger of who contributed to a class gift), the school lunch menu, birthdays and party invitations, quick polls, useful info (supply lists, uniforms, books) and school contacts. The only gate is that a parent must join their child's classroom, exactly as a parent joins a class in the apps mentioned above. We have provided a demo parent account in App Review Information so you can use the app end to end. You can also try the self-registration flow yourself with the invitation code [DEMO-CODE] (demo classroom "3°A — Primaria"): on the login screen tap "Registrarme con código de invitación", enter the code, then create an account with any email and password — no approval or pre-registration is involved.

4. How do users obtain an account?
Two ways. (a) Self-registration in the app: the school (or the volunteer "Room Parent" of the classroom) shares one invitation code per classroom with the families; any parent with that code creates their own account (email + password) directly in the app, with no whitelist or approval step. (b) School administrators can also pre-create accounts for families. Users can delete their account at any time in the app (Más → Eliminar mi cuenta). The same account works in the web version at https://www.tribbu.ar/app.

5. Is there any paid content in the app?
No. The app is completely free for families: no paid features, no in-app purchases, no subscriptions and no advertising. Nothing can be bought or paid for inside the app. To avoid confusion: the "Colectas" (fundraisers) feature is only a shared record of who has already chipped in for a class gift or expense — no money is processed or collected through the app; families settle among themselves offline. Separately, schools may optionally contract an institutional communications plan (a web-based B2B service invoiced directly to the school); it does not unlock any content or feature for individual users inside the iOS app.

Given the above, we kindly ask you to continue the review under public App Store distribution. We are happy to provide any additional information.

Thank you,
Nicolás Albani — tribbu

---

## Notas (para nosotros)

- **Por qué saltó 3.2**: el revisor vio "acceso por invitación, cuentas creadas
  por administradores" en las Review Notes + un login sin registro abierto, y
  lo leyó como app interna de una organización. La respuesta reencuadra: el
  público son las familias (consumidores), el gate es *por aula* (como
  ClassDojo/Remind), y cualquier colegio puede sumarse. Las Review Notes
  originales decían "There is no public sign-up" — **reescribirlas** antes de
  re-enviar, porque contradicen esta respuesta:

  > tribbu is a school-community app for parents. Any school can adopt it; the
  > parents of each classroom join with an invitation code shared by their
  > school (self-registration in-app: "Registrarme con código de invitación"),
  > or the school pre-creates their accounts. Free, no in-app purchases. Demo
  > parent account provided below; demo invitation code: [DEMO-CODE]. Account
  > deletion: Más → Eliminar mi cuenta.

- **No citar como clientes** los nombres de la landing ("Colegio San Marcos",
  "Instituto Belgrano", "Santa Ana", "Newlands", "Los Robles") — son ejemplos
  de diseño, no clientes. Si Apple pide nombres de colegios, dar solo reales.
- **Si Apple insiste (segundo rechazo 3.2)**: la salida limpia es
  **Unlisted App Distribution** (developer.apple.com → Contact Us → "Request
  unlisted app distribution"): la app vive en el App Store con el mismo build,
  no aparece en búsquedas ni gráficos, se instala desde un link directo que
  el colegio comparte junto con el código — encaja perfecto con el modelo por
  invitación y no requiere Apple Business Manager. Se pide por formulario
  (1–3 días); una vez aprobada, la app se re-envía marcada como unlisted.
- Google Play ya está en producción con el mismo modelo (aprobado el
  2026-08-19); Play no tiene un equivalente a 3.2.
