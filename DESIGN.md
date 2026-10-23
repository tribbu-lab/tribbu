# tribbu — Design system

> Documento de referencia para herramientas de diseño (Google Stitch, Figma, etc.)
> y para quien diseñe pantallas nuevas. Resume la identidad visual, los tokens y
> los patrones que ya usa la app. Fuente de verdad del código: `src/lib/tokens.js`
> y `src/lib/theme.js` (compartidos por web y mobile) y `mobile/DESIGN_SYSTEM.md`.

---

## 1. Producto

**tribbu** es la comunidad escolar en una app: reemplaza el grupo de WhatsApp de
padres por un lugar ordenado donde cada familia ve lo que tiene que resolver hoy.

- **Plataformas:** app mobile (iOS + Android) y web (`tribbu.ar/app`, también
  usada desde el celular). Diseñar **mobile-first**.
- **Idioma:** español rioplatense (Argentina), con voseo.
- **Usuarios:**
  - **Apoderado / familia** (el 90% del uso): padre o madre, a veces con varios
    hijos en distintos cursos. Usa la app pocos minutos por día, desde el celular.
  - **Room Parent:** un apoderado que además organiza su curso (avisos, colectas).
  - **Docente:** ve sus cursos, publica avisos y responde mensajes.
  - **Colegio:** administra todo desde un panel (mayormente en computadora).
- **Qué resuelve:** avisos del colegio y del curso, calendario y horario,
  cumpleaños e invitaciones, colectas, autorizaciones, encuestas, menú del
  comedor, mensajes (sin compartir el teléfono), talleres, marketplace y objetos
  perdidos.

**Principio rector:** *lo que importa, arriba; lo demás, en silencio.* Una
familia abre la app y en segundos sabe qué tiene que hacer (firmar, pagar,
confirmar, leer) y qué pasa esta semana.

---

## 2. Personalidad y tono

- **Cálida, ordenada y tranquila.** Nada de urgencia artificial ni colores
  estridentes: el rojo se reserva para lo realmente urgente.
- **Clara antes que linda.** Jerarquía fuerte, poco texto, una acción principal
  por tarjeta.
- **Copy es-AR con voseo:** "Anotá a Emma", "Creá el primero", "Escribile al
  colegio". Verbos activos, frases cortas, sin jerga técnica.
- **Errores:** dicen qué pasó y cómo seguir ("No se pudo guardar. Probá de nuevo
  en unos minutos."). Nunca culpan al usuario.
- **Vacíos que invitan:** "Estás al día ✨", "Todavía no hay eventos. Creá el
  primero." — no "No hay datos".
- **Emoji solo como contenido** (tipo de evento, comida, celebraciones:
  🎂 🍽️ 🎨 ✍️). La interfaz (navegación, botones de sistema) usa íconos de trazo.

---

## 3. Marca

- **Logo / wordmark:** `tribbu.` en serif (Georgia), peso 900, tracking
  negativo (≈ −4.5% del tamaño), **el punto final en azul de marca `#3B82F6`**
  (o en el color del colegio, si tiene uno). Sobre fondo oscuro, texto blanco.
- **Superficie de marca:** azul noche `#0F172A` (encabezado de la app, login,
  barra lateral del panel).
- **Ícono de app:** glifo blanco sobre `#0F172A`, esquinas redondeadas.

---

## 4. Color

### Paleta base

| Rol | Hex | Uso |
|---|---|---|
| Primario / texto fuerte | `#0F172A` | títulos, encabezado de marca, botón oscuro, chip activo |
| Acento de marca | `#3B82F6` | CTA principal, links, selección, punto del logo |
| Fondo de pantalla | `#F8FAFC` | fondo general (slate-50) |
| Superficie | `#FFFFFF` | tarjetas, hojas, modales |
| Texto | `#1E293B` | cuerpo |
| Texto secundario | `#64748B` | metadatos, descripciones |
| Texto tenue | `#94A3B8` | labels de sección, placeholders |
| Borde suave | `#F1F5F9` | separadores de lista |
| Borde de control | `#E2E8F0` | tarjetas (hairline), inputs, chips |

### Escalas

- **Slate (neutros):** 50 `#F8FAFC` · 100 `#F1F5F9` · 200 `#E2E8F0` · 300 `#CBD5E1` ·
  400 `#94A3B8` · 500 `#64748B` · 600 `#475569` · 700 `#334155` · 800 `#1E293B` · 900 `#0F172A`
- **Azul (marca):** 50 `#EFF6FF` · 100 `#DBEAFE` · 200 `#BFDBFE` · 300 `#93C5FD` ·
  400 `#60A5FA` · 500 `#3B82F6` · 600 `#2563EB` · 700 `#1D4ED8`

### Estados (pleno · fondo suave · borde)

| Estado | Pleno | Suave | Borde | Uso |
|---|---|---|---|---|
| Peligro / urgente | `#EF4444` | `#FEF2F2` | `#FCA5A5` | alertas urgentes, avisos sin leer, deuda, borrar |
| Éxito | `#10B981` | `#F0FDF4` | `#A7F3D0` | pagado, confirmado, inscripto |
| Atención | `#F59E0B` | `#FFFBEB` | `#FDE68A` | por vencer, pendiente, colectas (texto sobre suave: `#B45309`) |
| Info | `#3B82F6` | `#EFF6FF` | `#BFDBFE` | encuestas, información |
| Violeta | `#8B5CF6` | `#F5F3FF` | `#DDD6FE` | talleres, Super Admin |

Regla: el texto sobre un fondo suave usa el tono oscuro de la misma familia
(ej. ámbar `#B45309` sobre `#FFFBEB`), nunca gris ni negro.

### Color por rol

| Rol | Color | Fondo |
|---|---|---|
| Apoderado | `#3B82F6` | `#EFF6FF` |
| Room Parent | `#10B981` | `#F0FDF4` |
| Docente | `#0EA5E9` | `#F0F9FF` |
| Admin de colegio | `#F59E0B` | `#FFFBEB` |
| Super Admin | `#8B5CF6` | `#F5F3FF` |

### Color por hijo (identidad)

Cada hijo tiene un color elegible que lo identifica en toda la app (puntito de
8px junto al nombre, avatar, borde de sus tarjetas, columna en el calendario):
`#F43F5E` `#F97316` `#EAB308` `#22C55E` `#14B8A6` `#3B82F6` `#8B5CF6` `#EC4899`.
Variantes: fondo = color al 14% de opacidad, borde = color al 35%.

### Tema oscuro (superficie de marca)

Solo el encabezado, el login y la barra lateral del panel son oscuros: fondo
`#0F172A`, superficies blancas translúcidas (7–20% de opacidad), texto blanco al
92% / 60% / 40%. **La app en sí es clara.**

---

## 5. Tipografía

- **App mobile:** fuente del sistema (SF Pro / Roboto).
- **Web:** **DM Sans** (pesos 400, 500, 700, 800).
- **Logo:** Georgia (serif), 900.
- Jerarquía con **pesos fuertes (700–900)**: es la voz visual de tribbu.

| Estilo | Tamaño / peso | Uso |
|---|---|---|
| Display | 26 / 900, tracking −1 | logo, números protagonistas |
| Título de pantalla | 22 / 900 (web hasta 26) | "Hola, María", "Talleres" |
| Título de sección | 18 / 800 | título de card o modal |
| Título de fila | 15 / 800 | ítem de lista |
| Cuerpo | 14 / 400, interlineado 20 | texto general |
| Cuerpo fuerte | 14 / 700 | énfasis |
| Secundario | 13 / 400 | descripciones |
| Metadato | 12 / 400 | fechas, cursos |
| Label de sección | 11 / 700, MAYÚSCULAS, tracking 1, color `#94A3B8` | "PENDIENTES · 3", "PRÓXIMOS 15 DÍAS" |
| Chip | 12 / 600 | filtros, selectores |
| Pill / badge | 10 / 700, MAYÚSCULAS | "TALLER", "RESUELTO" |
| Dinero | 15 / 800, números tabulares | `$25.000` (formato es-AR) |
| Botón | 14 / 800 | texto de botones |

---

## 6. Espaciado, radios, elevación

- **Grilla de 4pt:** 4 · 8 · 12 · 16 · 20 · 24 · 32.
  Padding de pantalla 16 · padding de tarjeta 16–20 · gap entre controles 8.
- **Radios:** 6 · 8 · 10 (inputs) · 12 (botones) · 16 (tarjetas y hojas) · 20 ·
  999 (pills, chips, puntos).
- **Elevación:** **tarjetas planas**, sin sombra: fondo blanco + borde hairline
  `#E2E8F0` + radio 16. La sombra suave se reserva para lo que flota de verdad:
  barra de pestañas flotante, hojas inferiores, modales.
- **Objetivo táctil mínimo:** 44 × 44 pt, siempre.
- **Animaciones:** cortas y discretas (120 / 200 / 300 ms).

---

## 7. Iconografía

- **Interfaz:** íconos de trazo/outline (Material Community Icons variantes
  `-outline` en mobile; estilo equivalente a Tabler/Lucide outline). Tamaño 18–22.
- **Contenido:** emoji (tipos de evento 🎂 🎭 🚌, menú 🍽️, talleres 🎨,
  autorizaciones ✍️, colectas 💳, Lost & Found 🧦).

---

## 8. Layout mobile (app del apoderado)

```
┌──────────────────────────────┐
│ ENCABEZADO (oscuro #0F172A)  │  tribbu.   [🔍] [💬•]  (chip del hijo)
│ [Todos] [● Emma] [● Mateo] → │  selector de hijos/cursos, desliza horizontal
├──────────────────────────────┤
│ CONTENIDO (claro #F8FAFC)    │  scroll vertical
│                              │
│                              │
│ ╭──────────────────────────╮ │
│ │ Inicio Calend. Cumple    │ │  BARRA FLOTANTE (píldora blanca,
│ │ Avisos•  Más             │ │  sombra suave, pestaña activa con
│ ╰──────────────────────────╯ │  cápsula azul suave)
└──────────────────────────────┘
```

- **Encabezado oscuro fijo:** logo, buscar, mensajes (con punto rojo si hay sin
  leer). Con un solo hijo: chip con su color. Con varios: fila de chips
  deslizables ("Todos" primero = vista unificada).
- **Barra de pestañas flotante (5):** Inicio · Calendario · Cumpleaños · Avisos ·
  Más. Íconos de trazo + label corto; la activa con cápsula `#EFF6FF`; Avisos
  lleva globito rojo con el número sin leer. El contenido scrollea por detrás
  (reservar ~112px abajo).
- **"Más":** grilla de accesos agrupados con label de sección:
  *Del día a día* (Colectas, Autorizaciones, Encuestas, Comedor) ·
  *Del colegio* (Talleres, Comunidad, Info útil, Contacto) ·
  *Room Parent* (Admin del curso) · y abajo *Cuenta*.
- **Vista "Todos" (varios hijos):** cada fila/tarjeta lleva el puntito de color
  + primer nombre del hijo al que corresponde.

### Web desktop

Barra lateral fija oscura (`#0F172A`, 236px) con el logo, las secciones y "Mi
acceso" (hijos); contenido claro hasta 1200px de ancho. El panel del colegio
usa el mismo patrón, con un **Inicio** de resumen.

---

## 9. Componentes

| Componente | Descripción |
|---|---|
| **Tarjeta** | blanca, borde `#E2E8F0`, radio 16, padding 16; sin sombra |
| **Tarjeta accionable (pendiente)** | ícono en cuadrado suave de color + tipo (label de color) + título + metadato + botón de acción a la izquierda y chip de cuenta regresiva a la derecha ("Mañana", "en 4 días"); borde del color del estado |
| **Botón primario** | fondo `#3B82F6`, texto blanco 14/800, radio 12, alto 44 |
| **Botón secundario** | fondo blanco, borde `#E2E8F0`, texto `#334155` |
| **Botón oscuro** | fondo `#0F172A`, texto blanco (acciones fuertes en el panel) |
| **Botón peligro** | texto rojo sobre blanco, o rojo pleno para confirmar borrar |
| **Chip / filtro** | píldora, borde `#E2E8F0`; activo: fondo `#0F172A` y texto blanco |
| **Select-chip** | chip que muestra el filtro actual y abre una hoja con opciones |
| **Pill de estado** | fondo suave + texto del tono oscuro, 10–12/700 ("Inscripto ✓", "Pendiente", "Pagado") |
| **Chip de cuenta regresiva** | por urgencia: ≤3 días relleno azul con texto blanco; ≤7 días azul suave; más lejos gris |
| **Input** | fondo `#F8FAFC`, borde 1.5px `#E2E8F0`, radio 10, label MAYÚSCULA chica arriba; foco: borde azul; error: borde rojo + mensaje |
| **Hoja inferior (sheet)** | blanca, radio 16 arriba, título + cerrar; para formularios y opciones |
| **Avatar** | iniciales sobre el color del hijo al 14% |
| **Puntito de hijo** | 8px, color de identidad |
| **Estado vacío** | borde punteado, emoji o ícono, título + una línea + acción opcional |
| **Esqueleto** | bloques grises con pulso, mientras carga una lista |
| **Toast** | aviso breve abajo (mobile) o arriba (web), con tilde verde |
| **Burbuja de chat** | propia: azul `#3B82F6` texto blanco, esquina inferior derecha recta; ajena: blanca con borde, esquina inferior izquierda recta; nombre del autor en color arriba |

---

## 10. Pantallas clave (para generar)

1. **Inicio (Hoy):** saludo ("Hola, María" + fecha en label), **Pendientes**
   (carrusel de tarjetas accionables: aviso sin leer, colecta sin pagar,
   autorización sin firmar, invitación sin confirmar, inscripción abierta a un
   taller; vacío = "Estás al día ✨"), **Próximos 15 días** (lista con fecha en
   columna izquierda: día de la semana chico + número grande; título; curso y
   puntito del hijo; chip de cuenta regresiva) y **Comedor** (menú de hoy).
2. **Calendario:** pestañas Mes / Próximos / Horario. Mes: grilla sin bordes,
   hoy con anillo azul, día elegido relleno azul, puntitos de color por evento.
   Horario: tabla semanal por hijo, bloques del color de cada materia; talleres
   con ✦.
3. **Cumpleaños:** próximos cumples con avatar del color del chico, cuenta
   regresiva, invitación con confirmación de asistencia (adultos, hermanos y sus
   edades).
4. **Avisos:** lista de avisos del curso, de las maestras ("👩‍🏫 Vale ·
   Matemática") y del colegio ("🏫 Comunicación del colegio"), con adjuntos,
   no leídos marcados, filtros por origen.
5. **Mensajes:** lista de conversaciones (grupo del curso, 1 a 1, maestras,
   Secretaría) con no leídos; chat con burbujas. Nunca se muestra el teléfono.
6. **Colectas:** progreso (cuánto se juntó / meta), quién falta, "Registrar mi
   pago".
7. **Autorizaciones:** tarjeta por salida con, por hijo: Autorizo / No autorizo,
   quién lo retira, comentario; fecha límite.
8. **Talleres:** catálogo por hijo; tarjeta con foto, días y horario, profe,
   lugar, costo, "Quedan 3 lugares", modo (orden de llegada / aprobación /
   sorteo) y botón "Anotar a Emma"; estados: Inscripto ✓, En lista de espera
   (puesto 2), Pendiente de aprobación.
9. **Comunidad:** Marketplace (uniformes, libros, disfraces con fotos, precio o
   "Regalo") y Lost & Found (Perdí / Encontré, con foto).

---

## 11. Accesibilidad y reglas

- Contraste AA en texto de uso; los fondos suaves solo con su tono oscuro.
- Objetivos táctiles de 44pt; controles con icono sin texto llevan etiqueta
  accesible.
- Filas horizontales que no entran (chips, pestañas) **deslizan**; nunca se
  cortan ni empujan la pantalla de costado.
- Nada de scroll horizontal de página en 360–390px de ancho.
- Fechas y montos en formato argentino: "jueves 20 de octubre", `$25.000`.

### Hacer / no hacer

| Hacer | No hacer |
|---|---|
| Una acción principal por tarjeta | Varios botones azules compitiendo |
| Tarjetas planas con borde hairline | Sombras marcadas en todo |
| Label de sección en mayúscula chica gris | Títulos de sección grandes y pesados |
| Rojo solo para urgente/deuda | Rojo decorativo |
| Color del hijo para identificarlo | Usar el color del hijo como fondo de toda la pantalla |
| Emoji en contenido | Emoji en botones de sistema o navegación |
| Voseo y frases cortas | "Por favor", "exitosamente", jerga técnica |
