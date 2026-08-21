# tribbu · Sistema de diseño (mobile)

Sistema de tokens y componentes para la app React Native (Expo, iOS + Android). Formaliza la paleta que ya vive en la pantalla de login y en la web: base slate, azul de marca `#3B82F6`, cards blancas en light y overlays blancos con alpha sobre `#0F172A` en dark.

**Principios**

- **Un solo origen de color.** Los tokens son JS puro en `src/lib/tokens.js` (alias `@shared/tokens`), compartidos con la web. `src/lib/theme.js` (`T`, `ROL_*`, `HIJO_*`) sigue siendo la fuente de esos valores; `tokens.js` los extiende — nunca hardcodear hex en componentes.
- **Dual-theme con mismas claves.** `THEMES.light` (la app: cards blancas sobre slate-50) y `THEMES.dark` (la superficie de marca: login, AppHeader). Todo token semántico existe en ambos.
- **StyleSheet plano, sin librerías.** Todo se expresa con RN primitives + `StyleSheet`. Nada de NativeWind/styled-components.
- **44pt siempre.** Ningún control interactivo por debajo de `MIN_TOUCH` (44pt), sea por tamaño o por `hitSlop`.
- **Identidad por rol y por hijo es first-class.** padre=azul, admin=verde, super=violeta; cada hijo tiene su color elegible. Se consumen vía `roleTheme()` / `childTheme()`, nunca a mano.
- **Copy es-AR con voseo.** "Ingresá", "Creá el primero", "Repetí la contraseña". Verbos activos, sin jerga técnica; los errores dicen qué pasó y cómo seguir.

---

## 1 · Arquitectura

| Capa | Archivo | Qué contiene |
|---|---|---|
| Valores base | `src/lib/theme.js` | `T`, `ROL_LABEL/COLOR/BG`, `HIJO_COLORS_CUSTOM`, `MESES` (intacto) |
| Tokens | `src/lib/tokens.js` (`@shared/tokens`) | Rampas `SLATE`/`BLUE`, `STATUS`, `THEMES.light/dark`, `TYPE`, `SPACE`, `RADIUS`, `SHADOW`, `MIN_TOUCH`, `withAlpha`, `roleTheme`, `childTheme` |
| Tema RN | `mobile/context/Theme.jsx` | `ThemeScope`, `useTheme`, `makeThemedStyles` |
| Utilitarios | `mobile/components/ui.js` | Estilos compuestos light (`screen`, `h1`, `input`, `btnPrimary`, `hit44`…) |
| Componentes | `mobile/components/` | Primitivas del sistema (barrel en `index.js`) |

```jsx
import { Card, Button, Badge, useTheme } from "../components";
import { SPACE, TYPE } from "@shared/tokens";
```

### Estilos temables sin costo por render

`makeThemedStyles(make)` pre-crea **ambos** StyleSheets en tiempo de módulo y devuelve un hook que solo elige uno. Cero allocations por render → seguro dentro de `renderItem` de FlatList.

```jsx
const useStyles = makeThemedStyles((t) => ({
  fila: { backgroundColor: t.surface, borderColor: t.border },
}));

function Fila() {
  const s = useStyles();          // StyleSheet del tema activo
  return <View style={s.fila} />;
}
```

`<ThemeScope theme="dark">` envuelve superficies de marca (pantallas de auth). Sin ThemeScope, todo es light. El AppHeader es dark fijo: se estila directo con `THEMES.dark`.

---

## 2 · Color

### Rampas (primitivas — usarlas solo para derivar, no en componentes)

- `SLATE[50…900]` — neutros. `T.primary = SLATE[900]`, `T.bg = SLATE[50]`.
- `BLUE[50…700]` — marca. `T.accent = BLUE[500]`.

### Tokens semánticos (`THEMES.light` / `THEMES.dark`)

| Token | Light | Dark (login/header) | Uso |
|---|---|---|---|
| `bg` | `#F8FAFC` | `#0F172A` | fondo de pantalla |
| `surface` | `#FFFFFF` | `rgba(255,255,255,0.07)` | cards |
| `surface2` | slate-100 | `rgba(…,0.10)` | controles secundarios |
| `surfaceActive` | slate-200 | `rgba(…,0.20)` | chip/control activo |
| `surfaceSunken` | slate-50 | `rgba(…,0.08)` | inputs sobre card |
| `surfaceRaised` | `#FFFFFF` | `#1E293B` | modals / sheets |
| `border` / `borderStrong` | slate-100 / slate-200 | `rgba(…,0.10)` / `rgba(…,0.15)` | cards / inputs y controles |
| `text` / `textStrong` | slate-800 / slate-900 | `rgba(255,255,255,0.92)` / `#FFF` | cuerpo / títulos |
| `textMuted` / `textFaint` | slate-500 / slate-400 | `rgba(…,0.60)` / `rgba(…,0.40)` | secundario / labels y placeholders |
| `accent` / `accentSoft` / `onAccent` | azul / blue-50 / blanco | azul / alpha azul | marca, CTA |
| `danger·success·warning` + `*Soft` + `*Border` | pleno / fondo suave / borde | variantes onDark | estados |
| `overlay` / `pressed` | slate-900 α.5 / α.06 | negro α.5 / blanco α.08 | modals / feedback táctil |

`STATUS` agrega `purple` y las variantes `onDark` puntuales (ej. errores sobre dark = `#FCA5A5`, como el login).

### Regla de uso

Componentes consumen **semánticos** (`t.surface`), nunca rampas ni hex. Si un valor no existe, se agrega el token — no se inventa el hex en el componente.

---

## 3 · Theming por rol y por hijo

```js
roleTheme("admin")  // { label:"Room Parent", main:"#10B981", soft:"#F0FDF4", border:α }
childTheme(color)   // { main, soft:α(0.14), border:α(0.35) } — default #0F172A
```

- **Rol** → `<RoleBadge rol="padre|admin|super"/>` en headers de card, listas de usuarios, permisos visibles. Colores canónicos de `ROL_*`; no re-mapear.
- **Hijo** → el color elegido por el usuario (via `getHijoColor`, ya inyectado por plataforma). Se aplica en: `ChildDot` (selector del header, filas), `Avatar` (iniciales), bordes/acentos de cards propias del hijo (`childTheme(c).border`). Siempre derivar con `childTheme` — el alpha garantiza contraste del texto encima.
- `withAlpha(hex, a)` es el único mecanismo para generar transparencias de un color de identidad.

---

## 4 · Tipografía (`TYPE`)

Sistema de pesos fuertes (700–900) — es la voz visual de tribbu. Fuente del sistema (SF/Roboto).

| Token | Especificación | Uso |
|---|---|---|
| `display` | 26 / 900 / ls −1 | logo, números protagonistas |
| `h1` | 22 / 900 | título de pantalla |
| `h2` | 18 / 800 | título de sección o modal |
| `h3` | 15 / 800 | título de fila/card |
| `body` / `bodyBold` | 14 / 400 · lh 20 / 700 | cuerpo |
| `small` | 13 / 400 · lh 18 | secundario |
| `caption` | 12 | metadatos, fechas |
| `label` | 11 / 700 / MAYÚS / ls 1 | section labels, labels de input |
| `chip` | 12 / 600 | chips, selectores |
| `pill` | 10 / 700 / MAYÚS | pills/badges |
| `money` | 15 / 800 / tabular-nums | montos es-AR |
| `btn` | 14 / 800 | texto de botón |

Jerarquía tipo de una card de lista: `h3` + `caption` muted + `money`/`Badge` a la derecha.

---

## 5 · Espaciado, radios, elevación, interacción

- **`SPACE`** (grilla 4pt): `xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32`. Padding de pantalla `lg`, de card `xl`, gap entre controles `sm`.
- **`RADIUS`**: `xs 6 · sm 8 · md 10 (inputs/controles) · lg 12 (botones) · xl 16 (sheets) · xxl 20 (cards) · full (pills/dots)`.
- **`SHADOW`**: `card` (la sombra suave estándar) y `raised` (modals). Siempre esparcir junto a `backgroundColor` (Android necesita bg para `elevation`).
- **Interacción**: `MIN_TOUCH 44`, `HIT_SLOP 8`, `DURATION.fast/base/slow (120/200/300ms)`. Feedback de press: opacidad 0.6–0.85 o `t.pressed`.

---

## 6 · Componentes

Todos en `mobile/components` (barrel `index.js`), temables salvo indicación.

| Componente | API esencial | Notas |
|---|---|---|
| `Card` | `style` | blanca + `SHADOW.card` en light; overlay en dark |
| `Button` | `title, onPress, variant, size, loading, disabled, icon, full` | variantes `primary·secondary·outline·ghost·danger`; `sm` = 36pt + hitSlop → 44 efectivos; `loading` desactiva y muestra spinner |
| `Input` | `label, error, hint, right, …TextInput` | borde acento en foco, borde+mensaje en error; en dark replica el authInput del login |
| `Badge` | `label, tone, size, dot, color/bg` | tonos `accent·success·warning·danger·purple·neutral`; `dot` acepta color de hijo |
| `RoleBadge` | `rol` | label + colores canónicos del rol |
| `Pill` | `label, color, bg` | legacy estable; preferir `Badge` en código nuevo |
| `Avatar` | `nombre, apellido, color, uri, size` | iniciales sobre `childTheme(color).soft`; con `uri` muestra foto |
| `ChildDot` | `color, size` | indicador mínimo de identidad (8pt) |
| `EmptyState` | `emoji, title, note, actionLabel, onAction, compact` | un vacío invita a actuar: "Todavía no hay eventos. Creá el primero." |
| `Skeleton` / `SkeletonList` | `width,height,radius` / `rows, avatar` | pulso con native driver; preferir sobre `Spinner` cuando la forma de la lista es conocida |
| `Spinner` | `style` | carga genérica centrada |
| `Sheet` | `visible, onClose, title, position` | modal estándar: bottom-sheet (default) o diálogo centrado; overlay tocable, safe-area, KeyboardAvoiding |
| `SelectChip` | `label, value, options, onChange, prefix, icon` | filtro colapsado: chip (se tiñe si hay filtro activo) + Sheet de opciones scrolleable; `icon` (nombre MCI) muestra icono+valor con el label solo en Sheet/a11y (Recordatorios); `prefix=false` muestra el valor corto (`options[].short`) |
| `Money` | `value, tone, size` | `fmtM` es-AR + tabular-nums; tonos `success` (pagado) / `danger` (deuda) / `muted` |
| `ListToolbar` + `Paginador` | API de `useListControls` | patrón canónico de toda lista buscable/filtrable |
| `FloatingTabBar` | `state, navigation, badge` | navegación del sistema (patrón A3): píldora flotante **en overlay real** (`position:absolute`; el contenido scrollea por detrás — toda pantalla bajo las tabs reserva `TAB_BAR_SPACE` (112) como `paddingBottom` de su scroll), íconos de trazo, cápsula activa `accentSoft`, badge de Recordatorios; labels con `maxFontSizeMultiplier` 1.1 y "Recordatorios" abreviado a "Avisos" en la barra |
| `Placeholder` | `emoji, title, note` | pantalla de feature no portada |

### Recetas

```jsx
// Fila de pago (Finanzas)
<Card style={{ flexDirection: "row", alignItems: "center", gap: SPACE.md }}>
  <Avatar nombre={h.nombre} color={getHijoColor(h.id)} />
  <View style={{ flex: 1 }}>
    <Text style={[TYPE.h3, { color: t.text }]}>{h.nombre}</Text>
    <Badge tone={p.pagado ? "success" : "warning"} label={p.pagado ? "Pagado" : "Pendiente"} />
  </View>
  <Money value={p.monto} tone={p.pagado ? "success" : "default"} />
</Card>

// CRUD admin en Sheet
<Sheet visible={open} onClose={cerrar} title="Nuevo recordatorio">
  <Input label="Título" value={titulo} onChangeText={setTitulo} error={err} />
  <Button title="Guardar" onPress={guardar} loading={guardando} style={{ marginTop: SPACE.lg }} />
</Sheet>
```

---

## 7 · Patrones

**Listas (FlatList).** Toda lista usa `useListControls` + `ListToolbar` + `Paginador`. Reglas de virtualización: estilos de fila vía `makeThemedStyles` o `StyleSheet` de módulo (nunca objetos creados en `renderItem`), `keyExtractor` estable, componente de fila extraído (y `memo` si la fila es pesada), `EmptyState` como `ListEmptyComponent`, `SkeletonList` mientras carga.

**Formularios y modals.** CRUD admin en `Sheet` (bottom). Confirmaciones destructivas en `Sheet position="center"` con `Button variant="danger"` + `ghost` para cancelar. Labels con `TYPE.label`; errores por campo en el `Input`, error global con `t.danger`.

**Dinero.** Siempre `fmtM`/`Money` (es-AR, `$1.234`). En columnas, `tabular-nums` alinea solo. Deuda en `danger`, pagado en `success`.

**Import/export Excel.** Botón de export = `Button variant="outline" icon="📄" size="sm"`; durante el proceso `loading`. Flujos via `mobile/lib/media.js`.

**Estados.** Cargando → `SkeletonList` (o `Spinner`); vacío → `EmptyState` con CTA si el rol puede crear; error → mensaje en `t.danger` + botón "Reintentar".

**Inicio (patrón A3).** Pendientes = carrusel horizontal de cards accionables (recordatorio sin leer · colecta sin pagar · invitación sin responder, con deep-link `openFestejo`) con snap + dots; sin pendientes, el slot no desaparece: empty punteado "Estás al día ✨". Debajo, agenda unificada de 15 días (eventos + cumples por proximidad) con countdown por urgencia — ≤3 días lleno (`accent`), ≤7 teñido (`accentSoft`), resto neutro — y card de Comedor (hoy o próximo día con servicio). Cargando: saludo inmediato + `SkeletonList` (no Spinner). Header A3: campana con punto de no-leídas + chip del hijo (dot de color, abre el color picker); cuenta (contraseña/salir) en "Más". Implementación de referencia: `features/muro`, `components/AppHeader`, `app/(tabs)/mas`.

**Íconos.** UI = `@expo/vector-icons` (MaterialCommunityIcons, variantes `-outline`, trazo). El emoji queda reservado para contenido (tipos de evento, celebraciones, comida) — nunca para chrome de UI.

**Renderizado condicional.** Nunca `cond && <X/>` si `cond` puede ser `0`/`""` — usar ternario con `null` (regla RN del proyecto).

**Accesibilidad.** 44pt mínimos; `accessibilityRole`/`accessibilityLabel` en controles sin texto (ya incluidos en las primitivas); pares texto/fondo del tema cumplen AA en tamaños de uso (los `*Soft` solo con su color pleno correspondiente, ej. `warning` sobre `warningSoft` usa amber-700 en light).

---

**A3 en toda la app.** Desde la adopción app-wide: `Card` ya no lleva sombra (borde hairline `borderStrong` + radio 16 — `SHADOW.raised` queda solo para superficies que realmente flotan: FloatingTabBar, sheets); todas las pantallas porteadas usan la piel A3 (título 21/800, `TYPE.label`, chips de estado soft, countdown por urgencia — también en Cumpleaños); los filtros largos colapsan en **select-chips** (`components/SelectChip`; en listas ordenables el orden se fija al criterio natural — Cumpleaños: próximo primero — y el control de orden desaparece); la grilla del mes de Calendario es sin bordes por día (hoy = anillo accent, seleccionado = relleno accent); segmentados: inactivo blanco con borde, activo relleno `SLATE[900]`.

## 8 · Normalizaciones respecto del código previo

Cambios visuales menores e intencionales al formalizar (todos sub-píxel o de contraste equivalente): radio de botón primario 11→12 (`RADIUS.lg`); alphas del header/login redondeados a los pasos del tema (0.05→0.07, 0.7→0.6, overlay 0.4→0.5); tracking del título del color-picker 0.6→1 (`TYPE.label`); chips 20→`RADIUS.full`; `Paginador` gana hitSlop vertical (44pt efectivos).

## 9 · Cómo adoptar en features

1. Importar tokens de `@shared/tokens` y componentes del barrel — borrar hex locales al tocar un archivo.
2. Mapa rápido: `#F8FAFC→t.bg/surfaceSunken · #FFFFFF→t.surface · #F1F5F9→t.border · #E2E8F0→t.borderStrong · #1E293B→t.text · #64748B→t.textMuted · #94A3B8→t.textFaint/placeholder · #0F172A→t.textStrong · #3B82F6→t.accent · #EFF6FF→t.accentSoft · rgba(255,255,255,x)→tokens dark`.
3. Pantallas de auth: envolver en `<ThemeScope theme="dark">` y usar las mismas primitivas (`Input`, `Button outline`) en lugar de estilos locales.
