#!/usr/bin/env python3
"""Bed musical original para el spot de Tribbu. 30s, 44.1kHz estereo.

96 BPM (compas de 2.5s) para que la grilla caiga exacta en los cortes del
guion: 3.3 / 5.8 / 8.3 / 10.8 / 13.3 / 15.8 / 18.3 / 20.8 / 23.3 / 25.8 / 28.3.
Tonalidad Fa mayor. Sin samples ni material de terceros: todo sintesis.
"""
import numpy as np, wave, os

SR = 44100
DUR = 30.0
N = int(SR * DUR)
T = np.arange(N) / SR

L = np.zeros(N, np.float64)
R = np.zeros(N, np.float64)

BAR = 2.5          # 96 BPM, 4/4
BEAT = BAR / 4     # 0.625
GRID = 3.3         # el compas 0 arranca donde entra la solucion

# ------------------------------------------------------------------ utils
def idx(t):
    return int(max(0, min(N - 1, round(t * SR))))


def add(buf, t0, sig, gain=1.0):
    i = idx(t0)
    j = min(N, i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i] * gain


def stereo(t0, sig, gain=1.0, pan=0.0):
    """pan -1 izq .. +1 der (ley de potencia constante)."""
    a = (pan + 1) * np.pi / 4
    add(L, t0, sig, gain * np.cos(a) * 1.414 * 0.5)
    add(R, t0, sig, gain * np.sin(a) * 1.414 * 0.5)


def env_ad(n, atk, dec, curve=3.0):
    e = np.ones(n)
    na = min(n, int(atk * SR))
    if na > 1:
        e[:na] = np.linspace(0, 1, na) ** 1.4
    nd = min(n - na, int(dec * SR))
    if nd > 1:
        e[na:na + nd] = np.exp(-np.linspace(0, curve, nd))
        e[na + nd:] = 0
    return e


def fft_lowpass(x, fc, order=2.0):
    Nf = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(Nf, 1 / SR)
    X *= 1.0 / (1.0 + (f / max(fc, 1.0)) ** (2 * order)) ** 0.5
    return np.fft.irfft(X, Nf)


def fft_bandpass(x, lo, hi):
    Nf = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(Nf, 1 / SR)
    hp = (f / max(lo, 1.0)) ** 4 / (1 + (f / max(lo, 1.0)) ** 4)
    lp = 1.0 / (1.0 + (f / max(hi, 1.0)) ** 4)
    return np.fft.irfft(X * hp * lp, Nf)


# ------------------------------------------------------------------ voces
def pluck(freq, dur, bright=1.0):
    """Marimba/kalimba: fundamental + armonicos con decaimientos distintos."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.2)
    s += 0.42 * bright * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 6.5)
    s += 0.18 * bright * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 11.0)
    s += 0.09 * bright * np.sin(2 * np.pi * freq * 4.7 * t) * np.exp(-t * 17.0)
    # golpe del martillo
    k = int(0.004 * SR)
    s[:k] += np.random.RandomState(int(freq)).randn(k) * 0.25 * np.exp(-np.linspace(0, 6, k))
    return s * env_ad(n, 0.002, dur)


def pad(freqs, dur, detune=0.004):
    """Saw filtrado por sintesis aditiva, dos capas desafinadas."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f0 in freqs:
        for d in (1 - detune, 1 + detune):
            f = f0 * d
            v = np.zeros(n)
            for h in range(1, 11):
                if f * h > 7000:
                    break
                v += np.sin(2 * np.pi * f * h * t + h * 0.7) / (h ** 1.35)
            out += v
    out /= max(1, len(freqs) * 2)
    # el filtro se abre lentamente
    out = fft_lowpass(out, 1500, 1.6)
    e = np.ones(n)
    na = int(min(n, 0.5 * SR))
    e[:na] = np.linspace(0, 1, na) ** 1.6
    nr = int(min(n - na, 0.55 * SR))
    if nr > 1:
        e[-nr:] *= np.linspace(1, 0, nr) ** 1.3
    # respiracion
    e *= 1 + 0.06 * np.sin(2 * np.pi * 0.28 * t)
    return out * e


def bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
    return s * env_ad(n, 0.012, dur, 2.2)


def kick(dur=0.42):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 46 + 82 * np.exp(-t * 34)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    s += 0.20 * np.random.RandomState(7).randn(n) * np.exp(-t * 130)
    return s


def shaker(dur=0.12, seed=3):
    n = int(dur * SR)
    s = np.random.RandomState(seed).randn(n)
    s = fft_bandpass(s, 4200, 12000)
    return s * np.exp(-np.linspace(0, 12, n))


def blip(freq, dur=0.16):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) * np.exp(-t * 22)
    s += 0.3 * np.sin(2 * np.pi * freq * 2.02 * t) * np.exp(-t * 34)
    return s


# ------------------------------------------------------------------ armonia
F, C, Dm, Bb = "F", "C", "Dm", "Bb"
CHORDS = {
    F:  dict(triad=[349.23, 440.00, 523.25], root=174.61),
    C:  dict(triad=[261.63, 329.63, 392.00], root=130.81),
    Dm: dict(triad=[293.66, 349.23, 440.00], root=146.83),
    Bb: dict(triad=[233.08, 293.66, 349.23], root=116.54),
}
# un acorde por compas desde GRID
PROG = [F, C, Dm, Bb, F, C, Dm, Bb, F, C, F]

# =================================================================== 1. intro
# drone tenso en Re, con tremolo
n_in = int(3.7 * SR)
t_in = np.arange(n_in) / SR
drone = (np.sin(2 * np.pi * 73.42 * t_in) * 0.9
         + 0.5 * np.sin(2 * np.pi * 110.0 * t_in)
         + 0.25 * np.sin(2 * np.pi * 146.83 * t_in + 1.1))
drone *= (1 + 0.22 * np.sin(2 * np.pi * 5.5 * t_in))       # inquietud
drone *= np.clip(np.linspace(0, 1, n_in) * 3.2, 0, 1)
drone *= np.concatenate([np.ones(n_in - int(0.4 * SR)),
                         np.linspace(1, 0, int(0.4 * SR))])
drone = fft_lowpass(drone, 420, 1.4)
stereo(0.0, drone, 0.145, 0.0)

# un blip por cada burbuja de chat que entra en pantalla (sync con la imagen)
BUBBLES = [0.00, 0.16, 0.32, 0.48, 0.64, 0.78, 0.92, 1.08, 1.24, 1.40, 1.56, 1.74]
SCALE = [587.33, 659.25, 698.46, 783.99, 880.00]
for i, bt in enumerate(BUBBLES):
    f = SCALE[i % len(SCALE)] * (2 if i % 4 == 3 else 1)
    stereo(bt, blip(f), 0.050 + 0.009 * i, -0.55 if i % 2 else 0.55)

# riser hacia el corte de 3.3
n_r = int(1.15 * SR)
t_r = np.arange(n_r) / SR
noise = np.random.RandomState(11).randn(n_r)
riser = np.zeros(n_r)
step = int(0.05 * SR)
for k in range(0, n_r - step, step):                    # barrido de banda
    lo = 300 + 5200 * (k / n_r) ** 1.7
    riser[k:k + step] = fft_bandpass(noise[k:k + step], lo, lo * 2.6)
riser *= np.linspace(0, 1, n_r) ** 2.4
sweep = np.sin(2 * np.pi * np.cumsum(180 + 900 * (t_r / t_r[-1]) ** 2) / SR)
riser += 0.22 * sweep * np.linspace(0, 1, n_r) ** 3
stereo(3.3 - 1.15, riser, 0.30, 0.0)

# impacto en el downbeat de la solucion
imp = kick(0.7) * 1.0
stereo(3.3, imp, 0.85, 0.0)
n_w = int(1.6 * SR)
t_w = np.arange(n_w) / SR
whoosh = fft_bandpass(np.random.RandomState(5).randn(n_w), 200, 3000) * np.exp(-t_w * 3.2)
stereo(3.3, whoosh, 0.16, 0.0)

# =================================================================== 2. cuerpo
for b, name in enumerate(PROG):
    t0 = GRID + b * BAR
    if t0 >= DUR:
        break
    ch = CHORDS[name]
    dur = min(BAR + 0.6, DUR - t0)
    seccion_cta = t0 >= 23.3
    # el bed crece: se abre en la solucion, sube por los features, pico en el CTA
    if seccion_cta:
        SG = 1.30
    elif t0 < 8.3:
        SG = 0.82
    else:
        SG = 0.88 + 0.12 * ((t0 - 8.3) / 15.0)

    # pad: entra en el primer compas, mas presente en el CTA
    g = 0.30 if not seccion_cta else 0.40
    stereo(t0, pad(ch["triad"], dur), g * SG, -0.18)
    stereo(t0, pad([f * 1.001 for f in ch["triad"]], dur), g * 0.85 * SG, 0.22)

    # bajo: raiz en 1 y en 3+
    stereo(t0, bass(ch["root"], BEAT * 2.2), 0.34 * SG, 0.0)
    stereo(t0 + BEAT * 2.5, bass(ch["root"], BEAT * 1.4), 0.20 * SG, 0.0)

    # arpegio de marimba en corcheas
    arp = ch["triad"]
    pattern = [0, 1, 2, 1, 0, 2, 1, 2]
    for k, si in enumerate(pattern):
        tt = t0 + k * BEAT / 2
        if tt >= DUR:
            break
        f = arp[si] * 2
        if k in (5, 7) and seccion_cta:
            f *= 2                     # contracanto brillante en el cierre
        vel = 0.30 if k % 2 == 0 else 0.19
        if b == 0:
            vel *= 0.55                # el arpegio se va sumando
        stereo(tt, pluck(f, 0.85), vel * SG, 0.30 if k % 2 else -0.24)

    # percusion: entra recien en el bloque de features
    if t0 >= 8.3 - 0.01:
        for beat in range(4):
            tt = t0 + beat * BEAT
            if beat in (0, 2):
                stereo(tt, kick(), (0.30 if beat == 0 else 0.20) * SG, 0.0)
            stereo(tt + BEAT / 2, shaker(seed=b * 4 + beat), 0.075 * SG, 0.4)
    elif t0 >= GRID:
        stereo(t0, kick(), 0.24, 0.0)

# acorde final que queda sonando
stereo(28.3, pad([349.23, 440.00, 523.25, 698.46], 1.7), 0.34, 0.0)
for k, f in enumerate([698.46, 880.00, 1046.50]):
    stereo(28.3 + k * 0.09, pluck(f, 1.6), 0.22, -0.3 + 0.3 * k)

# =================================================================== 3. mezcla
def reverb(x, decay=1.5, wet=0.20):
    n_ir = int(decay * SR)
    ir = np.random.RandomState(23).randn(n_ir) * np.exp(-np.linspace(0, 6.5, n_ir))
    ir[: int(0.012 * SR)] = 0                       # pre-delay
    ir = fft_lowpass(ir, 4200, 1.2)
    ir /= np.abs(ir).sum() / 12
    Nc = len(x) + n_ir - 1
    K = 1 << int(np.ceil(np.log2(Nc)))
    y = np.fft.irfft(np.fft.rfft(x, K) * np.fft.rfft(ir, K), K)[: len(x)]
    return x * (1 - wet) + y * wet


L = reverb(L, 1.5, 0.22)
R = reverb(R, 1.6, 0.22)

# el bed no debe pelear con la voz: recorte suave de la banda media-alta
L = L - 0.30 * fft_bandpass(L, 900, 3400)
R = R - 0.30 * fft_bandpass(R, 900, 3400)

# fade in / out
fi, fo = int(0.25 * SR), int(1.1 * SR)
for buf in (L, R):
    buf[:fi] *= np.linspace(0, 1, fi)
    buf[-fo:] *= np.linspace(1, 0, fo) ** 1.5

peak = max(np.abs(L).max(), np.abs(R).max())
L, R = L / peak * 0.89, R / peak * 0.89
# limitador blando
L, R = np.tanh(L * 1.12) / np.tanh(1.12), np.tanh(R * 1.12) / np.tanh(1.12)

out = np.empty(N * 2, np.float64)
out[0::2], out[1::2] = L, R
pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio", "music.wav")
os.makedirs(os.path.dirname(path), exist_ok=True)
with wave.open(path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("escrito", path, f"{DUR}s")
