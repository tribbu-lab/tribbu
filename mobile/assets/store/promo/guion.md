# Tribbu — spot promocional 30s (vertical 1080×1920)

Locución en **español rioplatense**, tono cálido y directo, ritmo de anuncio —
no de narrador de documental. La dirección de tono de cada bloque va como
`instructions` en la llamada al TTS (ver `vo.py`), no es solo una nota acá.

| # | Voz en off | En pantalla | Dirección |
|---|-----------|-------------|-----------|
| 1 · 0.0–3.4s | «Doscientos mensajes. Cero certezas.» | Burbujas del grupo de padres apilándose y superponiéndose sobre negro-azulado; contador "214 mensajes sin leer". Sin logo, sin intro. | Seco, casi resignado. Es el dolor: **no** sonar animado acá. |
| 2 · 3.4–8.3s | «Tribbu ordena todo el curso en un lugar. Abrís, y ya sabés.» | Las burbujas implosionan → sube el iPhone con Inicio. **Un tap visible** en "Marcar leído" → onda expansiva → check verde. | Acá gira todo: soltá el aire, entra la solución. |
| 3 · 8.3–13.3s | «Todo lo que viene, en una sola pantalla. Nunca más te enterás tarde.» | Calendario. Titular: **"Nunca más te enterás tarde"** | Un beneficio, con punto final marcado. |
| 4 · 13.3–18.3s | «Los avisos importantes llegan al teléfono. Y no se pierden entre chats.» | Recordatorios. Titular: **"Lo importante no se pierde"** | Ídem. |
| 5 · 18.3–23.3s | «Las colectas se organizan solas. Quién pagó, cuánto falta.» | Colectas, con spotlight sobre la tarjeta y la barra de recaudación creciendo. Titular: **"Las colectas del curso, resueltas"** | La segunda frase, como una aclaración al pasar. |
| 6 · 23.3–30.0s | «Tribbu. La comunidad escolar, en orden. Descargala gratis en App Store y Google Play.» | Logo + wordmark + tagline + botón + tiendas + `tribbu.ar` | Cierre cálido, sin gritar. Que se escuche "gratis". |

~63 palabras. Cada bloque tiene un *slot* de tiempo definido en `vo.py`; si la
locución se pasa, se re-pide al TTS a mayor `speed` hasta que entra (converge en
2–3 pasadas) antes de recurrir a `atempo`.

## Música

Original sintetizada, sin material de terceros (`music.py`). 96 BPM — el compás
dura 2.5s, así que la grilla musical cae **exacta** en cada corte del guion
(3.3 / 5.8 / 8.3 / 10.8 / 13.3 / …). Fa mayor, progresión I–V–vi–IV.

Arco: drone tenso y filtrado en el bloque 1, con un *blip* por cada burbuja que
entra en pantalla → riser → impacto y apertura en el bloque 2 → groove estable
en 3–5 → pico en el CTA → cola de 1s.

Ducking automático bajo la voz vía `sidechaincompress` en `build.sh`.
Master a −14 LUFS / pico −1.6 dBFS.
