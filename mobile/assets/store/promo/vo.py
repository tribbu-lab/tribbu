#!/usr/bin/env python3
"""Locucion del spot. Backend intercambiable: say | elevenlabs | openai.

    python3 vo.py say
    OPENAI_API_KEY=...     python3 vo.py openai [voz] [pack]
    ELEVENLABS_API_KEY=... python3 vo.py elevenlabs [voice_id] [pack]

`pack` es la direccion actoral (ver PACKS): "cine" (default) o "digital".
El texto y las marcas de tiempo son los mismos en los dos; lo que cambia es
como se pide que se lea. Escribe siempre audio/vo.wav — que es lo que consume
build.sh — y ademas deja una copia identificada en audio/vo-<pack>-<voz>.wav.
"""
import json, os, shutil, ssl, subprocess, sys, urllib.request

# El Python de python.org no usa el trust store del sistema: sin esto, las
# llamadas HTTPS fallan con CERTIFICATE_VERIFY_FAILED.
try:
    import certifi
    SSLCTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSLCTX = ssl.create_default_context()

ROOT = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(ROOT, "audio")
SEG = os.path.join(AUD, "seg")
SR = 44100
DUR = 30.0

# (id, t_inicio, slot_max_seg, texto)
SEGMENTS = [
    ("01", 0.22, 3.05, "Doscientos mensajes. Cero certezas."),
    ("02", 3.60, 4.60, "Tribbu ordena todo el curso en un lugar. Abrís, y ya sabés."),
    ("03", 8.70, 4.40, "Todo lo que viene, en una sola pantalla. Nunca más te enterás tarde."),
    ("04", 13.70, 4.40, "Los avisos importantes llegan al teléfono. Y no se pierden entre chats."),
    ("05", 18.70, 4.30, "Las colectas se organizan solas. Quién pagó, cuánto falta."),
    ("06", 23.80, 5.60, "Tribbu. La comunidad escolar, en orden. "
                        "Descargala gratis en App Store y Google Play."),
]

# Direcciones actorales. `estilo` va en todos los bloques; `bloques` afina cada uno.
PACKS = {
    # Corte cinematografico: arranca en el dolor y gira hacia la solucion.
    "cine": {
        "voz": "nova",
        "estilo": "Español rioplatense (Buenos Aires). Locución publicitaria, "
                  "ritmo ágil, sin arrastrar las palabras ni sonar a narrador "
                  "de documental. ",
        "bloques": {
            "01": "Seco, casi resignado. Es el dolor del oyente: NO sonar animado ni "
                  "publicitario acá. Pausa marcada en el punto.",
            "02": "Acá gira todo: soltá el aire, entra la solución. Cálido y con alivio.",
            "03": "Seguro y directo. Un beneficio, con punto final marcado.",
            "04": "Seguro y directo. Un beneficio, con punto final marcado.",
            "05": "Seguro y directo. La segunda frase, casi como una aclaración al pasar.",
            "06": "Cierre cálido, sin gritar. Que se escuche bien la palabra gratis.",
        },
    },
    # Voz típica de publicidad de producto digital: luminosa, con sonrisa,
    # energía pareja de punta a punta. Sin dramatismo ni pausas teatrales.
    "digital": {
        "voz": "shimmer",
        "estilo": "Español rioplatense neutro-porteño. Voz de publicidad de producto "
                  "digital: femenina, luminosa, con sonrisa en la voz. Energía alta "
                  "pero controlada, articulación muy clara, cadencia ágil y pareja. "
                  "Nada de dramatismo, susurros ni pausas teatrales: confianza, "
                  "cercanía y profesionalismo. ",
        "bloques": {
            "01": "Cómplice, con una sonrisa: describís algo que todos vivieron. "
                  "Ágil y liviano, nada de tono sombrío.",
            "02": "Entra la marca. Subí la energía un escalón, tono de solución. "
                  "Clara y resuelta, como quien te muestra el truco.",
            "03": "Beneficio, con pulso parejo y seguridad. Remarcá 'nunca más'.",
            "04": "Mismo pulso, sin bajar la energía. Remarcá 'no se pierden'.",
            "05": "Ágil y práctica. La enumeración del final, rápida y bien clara.",
            "06": "Cierre de marca: brillante, cálido y con llamada a la acción "
                  "de verdad. 'Gratis' bien marcado.",
        },
    },
}


def sh(*a, **kw):
    return subprocess.run(a, check=True, capture_output=True, **kw)


def dur_of(path):
    out = sh("ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path).stdout.decode().strip()
    return float(out)


# ------------------------------------------------------------------ backends
def gen_say(text, out, rate=178, voice="Paulina"):
    aiff = out + ".aiff"
    sh("say", "-v", voice, "-r", str(rate), "-o", aiff, text)
    sh("ffmpeg", "-y", "-v", "error", "-i", aiff, "-ar", str(SR), "-ac", "1", out)
    os.remove(aiff)


def gen_elevenlabs(text, out, voice_id, instr="", speed=1.0):
    key = os.environ["ELEVENLABS_API_KEY"]
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                           "style": 0.35, "use_speaker_boost": True,
                           "speed": round(speed, 3)},
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        "xi-api-key": key, "Content-Type": "application/json"})
    mp3 = out + ".mp3"
    with urllib.request.urlopen(req, context=SSLCTX) as r, open(mp3, "wb") as f:
        f.write(r.read())
    sh("ffmpeg", "-y", "-v", "error", "-i", mp3, "-ar", str(SR), "-ac", "1", out)
    os.remove(mp3)


def gen_openai(text, out, voice="nova", instr="", speed=1.0):
    key = os.environ["OPENAI_API_KEY"]
    body = json.dumps({
        "model": "gpt-4o-mini-tts", "voice": voice, "input": text,
        "response_format": "wav", "speed": round(speed, 3), "instructions": instr,
    }).encode()
    req = urllib.request.Request("https://api.openai.com/v1/audio/speech", data=body,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json"})
    raw = out + ".raw.wav"
    with urllib.request.urlopen(req, context=SSLCTX) as r, open(raw, "wb") as f:
        f.write(r.read())
    sh("ffmpeg", "-y", "-v", "error", "-i", raw, "-ar", str(SR), "-ac", "1", out)
    os.remove(raw)


def fit_por_velocidad(gen, slot, out):
    """Los TTS neuronales respetan 'speed' pero no de forma exactamente lineal:
    se converge en un par de pasadas, mucho mejor que estirar con atempo."""
    sp = 1.0
    gen(speed=sp)
    d = dur_of(out)
    for _ in range(3):
        if d <= slot:
            break
        sp = min(1.35, sp * (d / slot) * 1.03)
        gen(speed=sp)
        d = dur_of(out)
    return d


def main():
    backend = sys.argv[1] if len(sys.argv) > 1 else "say"
    voz_arg = sys.argv[2] if len(sys.argv) > 2 else None
    pack_id = sys.argv[3] if len(sys.argv) > 3 else "cine"
    if pack_id not in PACKS:
        sys.exit(f"pack desconocido: {pack_id} (opciones: {', '.join(PACKS)})")
    pack = PACKS[pack_id]
    voz = voz_arg or pack["voz"]
    os.makedirs(SEG, exist_ok=True)
    print(f"pack '{pack_id}' · voz '{voz}' · backend '{backend}'")

    paths = []
    for sid, t0, slot, txt in SEGMENTS:
        out = os.path.join(SEG, f"{sid}.wav")
        instr = pack["estilo"] + pack["bloques"][sid]
        if backend == "say":
            gen_say(txt, out)
            d = dur_of(out)
            if d > slot:                       # reintento con el habla mas rapida
                gen_say(txt, out, rate=int(178 * d / slot) + 2)
                d = dur_of(out)
        elif backend == "openai":
            d = fit_por_velocidad(
                lambda speed: gen_openai(txt, out, voz, instr, speed), slot, out)
        elif backend == "elevenlabs":
            d = fit_por_velocidad(
                lambda speed: gen_elevenlabs(txt, out, voz, instr, speed), slot, out)
        else:
            sys.exit(f"backend desconocido: {backend}")

        # ultimo recurso si aun no entra (hasta 1.12x es transparente)
        if d > slot:
            tempo = min(1.12, d / slot)
            fixed = os.path.join(SEG, f"{sid}_fit.wav")
            sh("ffmpeg", "-y", "-v", "error", "-i", out, "-filter:a",
               f"atempo={tempo:.4f}", fixed)
            os.replace(fixed, out)
            d = dur_of(out)
        flag = "  << SE PASA" if d > slot + 0.05 else ""
        print(f"  {sid}  {d:5.2f}s / slot {slot:.2f}s  @{t0:5.2f}s{flag}")
        paths.append((out, t0))

    # mezcla en una pista de 30s con cada bloque en su marca
    ins, filt, mixi = [], [], []
    for i, (p, t0) in enumerate(paths):
        ins += ["-i", p]
        filt.append(f"[{i}:a]adelay={int(t0*1000)}|{int(t0*1000)},"
                    f"apad=whole_dur={DUR}[a{i}]")
        mixi.append(f"[a{i}]")
    graph = ";".join(filt) + ";" + "".join(mixi) + \
        f"amix=inputs={len(paths)}:normalize=0:duration=longest," \
        f"atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=11[out]"
    vo = os.path.join(AUD, "vo.wav")
    sh("ffmpeg", "-y", "-v", "error", *ins, "-filter_complex", graph,
       "-map", "[out]", "-ar", str(SR), "-ac", "1", vo)
    copia = os.path.join(AUD, f"vo-{pack_id}-{voz}.wav")
    shutil.copyfile(vo, copia)
    print(f"escrito {vo}\n        {copia}")


if __name__ == "__main__":
    main()
