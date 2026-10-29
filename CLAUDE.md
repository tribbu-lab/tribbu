# CLAUDE.md

Guía para Claude Code en este repo. **Resumen**: el detalle de cada funcionalidad (historia, decisiones, SQL, gotchas puntuales) está en **`docs/notas-tecnicas.md`** — buscá ahí la sección de la feature antes de tocarla. Specs en `specs/`, SQL en `supabase/*.sql`, backlog vivo en `PENDIENTES.md`.

## Qué es

**tribbu**: app de comunidad escolar. Familias (apoderados), Room Parents, docentes y el colegio (administrador, Secretaría/Dirección por nivel, super) coordinan la vida de cada `curso`: avisos, calendario, cumpleaños, colectas, autorizaciones, encuestas, mensajes, talleres, comedor, marketplace, Lost & Found. Web = React + Vite SPA (`src/`, publicada en `www.tribbu.ar/app`); app = Expo / React Native (`mobile/`); backend = Supabase. **Todo el dominio y la UI están en español rioplatense (voseo)** — escribir los textos nuevos igual.

## Comandos

```bash
npm run dev      # web
npm run build    # build web (dist-web/)
npm run lint     # ESLint — debe quedar en 0 errores (CI bloquea)
cd mobile && npx eslint . && npx expo export -p android   # app: lint + bundle (gate de CI; usar `npx eslint .` como CI, `expo lint` no marca todo)
```

No hay tests. Validar = lint + build (+ bundle de la app) + QA a mano. CI: `.github/workflows/ci.yml`. Los ~45 warnings de `useEffect(()=>{cargar()})` son conocidos.

**Publicar**: la web la despliega Vercel sola con cada push a `main`. La app sale por las tiendas con las skills `/store-release` + `/store-promote` (runbook `mobile/STORE_RELEASE.md`).

**Base de datos**: el proyecto está linkeado (`gctymjhblvocvaenmdhr`). `npx supabase db query --linked -f archivo.sql` corre SQL contra prod. Cambios de RLS/RPC: escribir `supabase/<tema>.sql` idempotente, **probarlo antes en una transacción con `rollback`** (impersonando usuarios con `set local role authenticated` + `request.jwt.claims`), aplicarlo y anotar "aplicado" en las notas. Edge Functions: `npx supabase functions deploy <fn> --no-verify-jwt` (todas van así; chequean al llamador en código o con `x-cron-secret`).

**Emulador Android (esta máquina, Windows)**: AVD `tribbu_test` (`%LOCALAPPDATA%\Android\Sdk\emulator`). APK de prueba con el JS adentro: `mobile/android` + `./gradlew assembleDebug` con `JAVA_HOME` = Temurin 21 (no el JBR de Android Studio). Ver memoria `apk-build-java21`.

## Arquitectura (lo que hay que saber siempre)

### Web — `src/App.jsx`
Sin router: `tab` (espejada en `?tab=`, ver `TABS_VALIDOS`) elige la pantalla; cada feature es `src/features/<nombre>/index.jsx`, cargada con `React.lazy` (`aLazy()`). Las pestañas visitadas quedan montadas y ocultas (caché): un `cargar()` **no debe vaciar** el contenido (nada de `setDatos(null)`/spinner al recargar); las pantallas nuevas cargan con `useCargar`. Libs pesadas (`xlsx`) siempre con `await import()`. `navegarA(tab, params)` para deep-links internos; `TAB_MAP` para tipos de push.

### Navegación
Familias: **Hoy · Agenda · Comunicaciones · Curso** + **Mi cuenta** (web y app). Las secciones solo agrupan pantallas; las rutas no cambian. Panel del colegio (`src/features/superadmin`, `mobile/features/superadmin`), "modo simple": día a día arriba (Inicio · Comunicación · Mensajes · Personas · Comunidad), **Configuración** aparte abajo (grupo con `config:true`: cursos, horarios, materias, maestros, directivos, menú, uniformes, membrete, adopción, promoción) y un botón **"+ Crear"** único (`OPCIONES_CREAR`; Eventos y Autorizaciones reciben `abrirNuevo` = nonce para abrir el alta). Plataforma solo para super. Si cambiás navegación, actualizá web (escritorio y celular) y app.

### "Mi acceso" — contrato de todas las pantallas
`items` = hijos (+ cursos de Room Parent / docente). Con hijos en más de un curso hay un ítem **"Todos"** (vista unificada, por defecto). Props que reciben las pantallas (web desde `App.jsx`, app desde `useSession()`):
- leer siempre con `.in("curso_id", cursoIds)`;
- `cursoId` es **null** en Todos e `isAdmin` es false en Todos;
- `tagDeCurso(curso_id)` → `{nombre, color}` solo en Todos, para marcar filas;
- **escribir con el `curso_id` de la entidad**, nunca con el `cursoId` de la sesión.

### Roles
`padre`/`room` (apoderado; Room Parent es por curso vía `usuario_cursos.rol`), `docente` (cuenta ligada a `maestros.usuario_id`; ve sus cursos por `clases`), `nivel_admin` (Secretaría/Dirección de ciertos niveles: mismo panel que el administrador sin las secciones de `SOLO_ADMIN_COLEGIO`), `colegio_admin` (administrador de un colegio, acotado por RLS), `super` (plataforma; RLS no lo acota, el cliente filtra por colegio). Los permisos viven en **RLS** (helpers `es_*`/`puede_*` en SQL); la UI solo los refleja.

### Lógica compartida
`src/lib/*.js` es puro (sin supabase) y lo usan web y app (`@shared/<archivo>` en mobile vía alias de Babel/Metro). **Reglas de negocio nuevas van ahí**, no copiadas por plataforma (las copias ya derivaron en bugs). Config y storage se inyectan por plataforma (`runtimeConfig.js`, `storage.js`) — no leer `import.meta.env` en `lib`.

### Rendimiento
Cada request a Supabase cuesta ~150–500 ms: la latencia = cantidad de requests **en serie**. Cargar en lotes con `Promise.all` (el Muro carga en dos lotes; la sesión en UNA query, `SELECT_USUARIO_SESION` en `src/lib/sesion.js`). `colegio_id`/`nivel` por curso salen de `items[].cursos`, no de otra query. Lecturas de avisos embebidas con `SELECT_REC_CON_LEIDO`/`conLeidoDe` (`src/lib/leidos.js`).

### Storage
Buckets `adjuntos` y `eventos` son **privados**: mostrar con `<SignedImg>` (web) / `<SignedImage>` (app), nunca `getPublicUrl`; en filas se guarda el **path**. `libros` es público. Cada imagen subida guarda una miniatura `<path>.thumb.jpg` (`subirImagen` web, `uploadImage`/`pickAndUploadImage` app); usar `miniatura` donde se ve chica. Fotos de Mensajes (`mensajes/…`) solo las leen los de esa conversación (política `puede_leer_foto_mensaje`). Al tocar políticas de Storage, revisar también `pg_policies.roles`.

## Convenciones de UI

- **Web**: estilos inline `style={{}}` (sin CSS modules/Tailwind), colores de `src/lib/tokens.js`/`theme.js`. `src/index.css` pone `*{color:…}`: el color **no se hereda**, hay que ponerlo en cada span anidado. Íconos de línea propios (`src/components/Icono.jsx`); no agregar librerías de íconos.
- **App**: RN + `StyleSheet`, tokens de `@shared/tokens`, íconos MaterialCommunityIcons `-outline` (emoji solo en contenido). Ver `mobile/DESIGN_SYSTEM.md`.
- **Sobrio**: pocos colores, sin emojis en navegación ni títulos, sin dependencias nuevas.
- Componentes únicos: `BotonNuevo` (crear), `Filtros`/`BotonFiltros` (filtros como chips en modal/Sheet), `EmptyState`, `ListToolbar` + `useListControls` (listas), `SubSeccion`/`SubTabs` (pestañas internas), `EditorFormato`/`TextoConFormato` (avisos con formato; en vistas previas usar `textoPlano`).
- **No usar `window.confirm`/`window.prompt`** (en navegadores embebidos devuelven al instante): `useConfirmar()` (`src/hooks/useConfirmar.jsx`).
- App: en JSX nunca `cond && <X/>` si `cond` puede ser `0`/`""`; usar ternario. Todo `Modal` con `TextInput` lleva la receta anti-teclado (`KeyboardAvoidingView behavior="padding"` en iOS **y** Android + `ScrollView keyboardShouldPersistTaps="handled"` + `maxHeight`); un form dentro de `Sheet` va con `flexShrink:1`. iOS no apila Modals: cerrar uno antes de abrir otro (~350 ms).
- Pantallas de lista en la app: `useRecarga(cargar)` para recargar al volver.

## Seguridad (no negociable)

- El cliente usa solo la clave **publicable**. La clave de servicio **nunca** en `src/` ni `mobile/`; operaciones privilegiadas van por Edge Functions (`manage-auth-user` para cuentas: solo `super`/`colegio_admin`/`nivel_admin` con alcance chequeado adentro — **nunca** `admin`/Room Parent).
- El repo de GitHub es **público**: no commitear claves, `.env`, `google-services.json`, `play-service-account.json` ni documentos internos.
- Edge Functions leen claves por `supabase/functions/_shared/claves.ts`; las legacy JWT keys están desactivadas.
- Las cuentas se crean con `admin.createUser` (vía `manage-auth-user`), **nunca** insertando en `auth.users` (queda `instance_id` NULL y Auth no la ve).
- Datos de contacto de familias no se exponen entre familias (todo se habla por Mensajes). Festejos solo los ven los invitados; colectas solo las familias del curso.
- Push: `sendPush` (`src/lib/push.js`) con el JWT del usuario; destinatarios con `getUserIdsByCurso` (RPC `usuarios_de_curso`). Los push de Mensajes los manda la base (trigger → `mensajes-push`).

## Índice de funcionalidades → detalle

Sección homónima en `docs/notas-tecnicas.md` + spec/SQL principal:

| Funcionalidad | Spec / SQL |
|---|---|
| Vista "Todos" (varios hijos) | `specs/vista-unificada-hijos-mobile.md` |
| Navegación 4 secciones, Inicio "Hoy", rediseño | `specs/rediseno-etapas-2-3-4.md` |
| Avisos (recordatorios), formato y membrete, lecturas | `specs/comunicados-con-formato.md`, `supabase/lecturas-y-adopcion.sql` |
| Calendario, eventos multi-curso, sincronización ICS | `specs/sincronizacion-de-calendario.md`, `specs/eleccion-de-calendario-mobile.md` |
| Colectas (participantes, "Ya transferí") | `supabase/colectas-*.sql`, `supabase/colecta-participantes.sql` |
| Autorizaciones | `specs/autorizaciones.md` |
| Fotos escolares (marca de agua, pedidos, descarga digital) | `supabase/fotos-escolares.sql`, `src/lib/fotosEscolares.js` |
| Cambios en la salida (Secretaría del nivel) | `supabase/cambios-salida.sql`, `src/lib/cambiosSalida.js` |
| Encuestas | `specs/encuestas.md` |
| Mensajes (1 a 1, grupos, difusión, Secretaría, docentes, personal, archivo, fotos) | `specs/mensajes.md`, `specs/docentes-clases-y-grupos.md`, `supabase/mensajes*.sql` |
| Docentes, materias y clases, horarios | `specs/docentes-clases-y-grupos.md`, `supabase/materias-*.sql`, `supabase/horarios-talleres.sql` |
| Roles por nivel (Secretaría), menú por nivel | `specs/roles-por-nivel.md` |
| Talleres extraprogramáticos | `specs/talleres-extraprogramaticos.md` |
| Marketplace, Lost & Found | `specs/marketplace.md`, `specs/perdidos-y-encontrados.md` |
| Multi-colegio, año lectivo y promoción | `specs/multi-colegio.md`, `specs/ano-lectivo-y-promocion-de-curso.md` |
| Avisos automáticos (push diario/semanal) | `supabase/avisos-automaticos*.sql` |
| Auth: recuperación de contraseña, cuentas, borrar cuenta | `specs/recuperacion-de-contrasena-por-email.md` |
| App: build, tiendas, capturas de las fichas, R8, pantallas grandes, huella | `mobile/STORE_RELEASE.md`, `specs/capturas-de-tienda-al-dia.md`, `specs/calidad-tecnica-para-google-play.md`, `specs/desbloqueo-con-huella-digital.md` |

## Skills (`.claude/skills/`)

`spec` (escribir spec), `implement` (feature de punta a punta), `fix-bug` (bug con causa raíz y validación), `store-release` / `store-promote` (publicar la app), `agent-browser` (manejar un navegador para QA), `vercel-react-best-practices`, `vercel-react-native-skills`, `frontend-design`, `web-design-guidelines`.

## Higiene del repo

Los `*.cjs` de la raíz son scripts de migración de una sola vez (no correrlos); `backup_tribbu.cjs` es el backup completo vigente (necesita una clave `sb_secret_…` por variable de entorno). Al terminar una feature: actualizar `docs/notas-tecnicas.md` (detalle), este archivo solo si cambia algo que hay que saber siempre, y `PENDIENTES.md`.
