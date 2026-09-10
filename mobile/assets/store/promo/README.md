# Spot promocional de Tribbu — 30s vertical

Pipeline reproducible del video promocional. Todo se genera acá: no hay
material de terceros ni assets con licencia. Las capturas son las mismas de
`mobile/assets/store/screenshots/ios/` (iPhone 17 Pro Max, cuenta demo).

**Salida**: `out/tribbu-promo-30s.mp4` — 1080×1920, 30 fps, H.264 + AAC,
~7 MB, master a −14 LUFS.

## Estructura (guion completo en `guion.md`)

| Tiempo | Bloque |
|--------|--------|
| 0.0 – 3.4 | El problema: el grupo de padres desbordado. Sin logo, sin intro. |
| 3.4 – 8.3 | La solución + **un tap visible** en "Marcar leído" |
| 8.3 – 13.3 | Calendario — *"Nunca más te enterás tarde"* |
| 13.3 – 18.3 | Avisos — *"Lo importante no se pierde"* |
| 18.3 – 23.3 | Colectas — *"La plata del curso, resuelta"* |
| 23.3 – 30.0 | Logo + CTA + tiendas + `tribbu.ar` |

## Cómo se construye

```bash
python3 render.py     # 900 frames PNG -> frames/   (~3 min)
python3 music.py      # bed musical original       -> audio/music.wav
python3 vo.py say     # locución                   -> audio/vo.wav
./build.sh            # ensambla                   -> out/tribbu-promo-30s.mp4
```

`render.py --probe 60,300,620` renderiza solo esos frames, para iterar rápido.

## Locución — backend y **pack de tono** intercambiables

`vo.py` genera la pista (`audio/vo.wav`, cada bloque en su marca exacta).
**Cambiar de voz no obliga a re-renderizar el video**: alcanza con volver a
correr `vo.py` y `build.sh` (~20s).

```bash
OPENAI_API_KEY=... python3 vo.py openai <voz> <pack>
./build.sh out/tribbu-promo-30s-<pack>-<voz>.mp4
```

Los **packs** (constante `PACKS` en `vo.py`) son direcciones actorales: mismo
texto y mismas marcas de tiempo, distinta forma de pedir la lectura. Van como
`instructions` al TTS, con una nota por bloque además del estilo general.

| pack | voz por defecto | intención |
|------|-----------------|-----------|
| `cine` | `nova` | Arranca seco y resignado en el dolor, gira al entrar la solución. Más narrativo. |
| `digital` | `shimmer` | Voz típica de publicidad de producto digital: luminosa, sonrisa en la voz, energía pareja de punta a punta. |

Masters construidos: `out/tribbu-promo-30s-cine-nova.mp4` y
`out/tribbu-promo-30s-digital-shimmer.mp4`.

Para comparar voces sin rehacer el spot, `audio/audicion/comparativa.wav` tiene
la misma línea leída por shimmer → coral → sage → nova con la dirección
`digital`. Otros backends: `python3 vo.py say` (borrador local, sin API) y
`ELEVENLABS_API_KEY=... python3 vo.py elevenlabs <voice_id> <pack>`.

Cada bloque tiene un *slot* de tiempo. Si la locución se pasa, `vo.py` la vuelve
a pedir con mayor `speed` hasta que entra (converge en 2–3 pasadas) antes de
recurrir a `atempo`, que deforma el audio.

## Música

`music.py` la compone por síntesis: sin samples ni librerías de terceros, así
que **no hay riesgo de content claim**. Fa mayor, 96 BPM — el compás dura 2.5s,
de modo que la grilla musical cae exacta en los cortes del guion (3.3 / 5.8 /
8.3 / 10.8 / …). Arco: tensión filtrada → riser → se abre en la solución →
groove en los features → pico en el CTA → cola de 1s.

En el intro hay un *blip* por cada burbuja de chat que entra en pantalla: la
música está sincronizada al montaje, no debajo de él.

Para usar un track propio en su lugar: reemplazar `audio/music.wav` (30s,
44.1 kHz estéreo) y correr `./build.sh`. El ducking bajo la voz lo hace
`build.sh` con `sidechaincompress`, no hace falta tocar nada más.

## Notas

- Formato vertical 9:16, pensado para Reels / TikTok / Stories y para el
  *App Preview* de las tiendas. Para 16:9 o 1:1 hay que cambiar `W, H` en
  `render.py` y reacomodar la posición del teléfono (`PH_H`, `PH_Y`).
- El marco de iPhone, el wordmark y el spotlight de Colectas se dibujan por
  código. El wordmark se recorta del header de `01-inicio.png` y se le calcula
  el alfa contra el navy — no es una tipografía reconstruida.
- La barra de recaudación que crece en el bloque de Colectas es la barra real
  de la captura, animada de 0 a su valor verdadero ($16.000 de $32.000).
