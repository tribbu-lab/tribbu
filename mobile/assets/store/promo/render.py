#!/usr/bin/env python3
"""Render del spot promocional de Tribbu (1080x1920 @30fps, 30s).

Genera frames/f######.png. Sin dependencias mas alla de Pillow/numpy.
"""
import math, os, sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
import numpy as np

W, H, FPS, DUR = 1080, 1920, 30, 30.0
NFRAMES = int(DUR * FPS)

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.normpath(os.path.join(ROOT, "..", "screenshots", "ios"))
ICON = os.path.normpath(os.path.join(ROOT, "..", "..", "icon.png"))
OUT = os.path.join(ROOT, "frames")

# ---------------------------------------------------------------- paleta
NAVY_TOP = (9, 14, 28)
NAVY_BOT = (17, 26, 48)
BLUE = (59, 130, 246)
WHITE = (255, 255, 255)
MUTED = (148, 163, 184)
GREEN = (16, 185, 129)

SF = "/System/Library/Fonts/SFNS.ttf"
_fcache = {}


def font(size, weight="Bold"):
    k = (size, weight)
    if k not in _fcache:
        f = ImageFont.truetype(SF, size)
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
        _fcache[k] = f
    return _fcache[k]


# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(t, p=3):
    return 1 - (1 - clamp(t)) ** p


def ease_in_out(t):
    t = clamp(t)
    return 3 * t * t - 2 * t * t * t


def ease_out_back(t, s=1.5):
    t = clamp(t) - 1
    return t * t * ((s + 1) * t + s) + 1


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------- helpers
def layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))


def rr(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def with_alpha(img, a):
    """Escala el canal alfa de una RGBA por a in [0,1]."""
    if a >= 0.999:
        return img
    if a <= 0.001:
        return Image.new("RGBA", img.size, (0, 0, 0, 0))
    r, g, b, al = img.split()
    return Image.merge("RGBA", (r, g, b, al.point(lambda v: int(v * a))))


def text(dst, xy, s, f, fill=WHITE, anchor="la", alpha=1.0, shadow=0):
    """Dibuja texto con alfa sobre una RGBA."""
    tmp = layer()
    d = ImageDraw.Draw(tmp)
    if shadow:
        d.text((xy[0], xy[1] + shadow), s, font=f, fill=(0, 0, 0, 110), anchor=anchor)
    d.text(xy, s, font=f, fill=fill + (255,) if len(fill) == 3 else fill, anchor=anchor)
    dst.alpha_composite(with_alpha(tmp, alpha))


def wrap(s, f, maxw):
    words, lines, cur = s.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if f.getlength(t) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ---------------------------------------------------------------- fondo
_bg_cache = {}


def background(t):
    """Gradiente navy + glow azul que respira. Cacheado por paso de 0.1s."""
    key = round(t * 4) / 4
    if key in _bg_cache:
        return _bg_cache[key].copy()
    y = np.linspace(0, 1, H)[:, None]
    grad = np.zeros((H, W, 3), np.float32)
    for i in range(3):
        grad[:, :, i] = lerp(NAVY_TOP[i], NAVY_BOT[i], y)

    # glow radial azul, deriva lenta
    gx = W * (0.5 + 0.16 * math.sin(key * 0.32))
    gy = H * (0.30 + 0.10 * math.cos(key * 0.24))
    xs = np.arange(W)[None, :]
    ys = np.arange(H)[:, None]
    d = np.sqrt(((xs - gx) / (W * 0.95)) ** 2 + ((ys - gy) / (H * 0.62)) ** 2)
    glow = np.clip(1 - d, 0, 1) ** 2.4
    pulse = 0.5 + 0.06 * math.sin(key * 1.1)
    for i in range(3):
        grad[:, :, i] += glow * (BLUE[i] * 0.30 * pulse)

    # vineta
    vd = np.sqrt(((xs - W / 2) / (W * 0.78)) ** 2 + ((ys - H / 2) / (H * 0.78)) ** 2)
    vig = np.clip(1 - 0.42 * np.clip(vd - 0.42, 0, None) ** 1.5, 0, 1)
    grad *= vig[:, :, None]

    img = Image.fromarray(np.clip(grad, 0, 255).astype(np.uint8)).convert("RGBA")
    _bg_cache[key] = img
    return img.copy()


# ---------------------------------------------------------------- telefono
_shots = {}


def shot(name):
    if name not in _shots:
        _shots[name] = Image.open(os.path.join(SHOTS, name)).convert("RGB")
    return _shots[name]


PH_H = 1560
PH_W = int(round(PH_H * 1320 / 2868))  # 718
PH_X = (W - PH_W) // 2
PH_Y = 400

_shadow_cache = {}


def phone(name, zoom=1.0, pan=0.0, size=None, overlay=None):
    """Device frame con la captura adentro. Devuelve RGBA del tamano del cuerpo."""
    ph_h = size or PH_H
    ph_w = int(round(ph_h * 1320 / 2868))
    bez = max(3, int(ph_h * 0.0105))
    r_out = int(ph_h * 0.074)
    r_in = r_out - bez

    body = Image.new("RGBA", (ph_w, ph_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    rr(bd, (0, 0, ph_w - 1, ph_h - 1), r_out, fill=(6, 9, 17, 255))
    # rim light
    rr(bd, (0, 0, ph_w - 1, ph_h - 1), r_out, outline=(90, 110, 150, 200), width=2)

    sw, sh = ph_w - 2 * bez, ph_h - 2 * bez
    src = shot(name)
    tw, th = sw, sh
    # cover-fit primero y RECIEN despues el zoom, si no el fit lo anula
    cover = max(tw / src.width, th / src.height) * zoom
    scr = src.resize((math.ceil(src.width * cover), math.ceil(src.height * cover)), Image.LANCZOS)
    ox = max(0, (scr.width - tw) // 2)
    oy = max(0, int((scr.height - th) * clamp(pan)))
    scr = scr.crop((ox, oy, ox + tw, oy + th)).convert("RGBA")

    mask = Image.new("L", (tw, th), 0)
    rr(ImageDraw.Draw(mask), (0, 0, tw - 1, th - 1), r_in, fill=255)
    body.paste(scr, (bez, bez), mask)

    # dynamic island
    iw, ih = int(ph_w * 0.285), int(ph_h * 0.0245)
    ix, iy = (ph_w - iw) // 2, int(ph_h * 0.0155)
    isl = Image.new("RGBA", (ph_w, ph_h), (0, 0, 0, 0))
    rr(ImageDraw.Draw(isl), (ix, iy, ix + iw, iy + ih), ih // 2, fill=(4, 6, 12, 255))
    body.alpha_composite(isl)
    return body


def phone_shadow(ph_w, ph_h):
    key = (ph_w, ph_h)
    if key in _shadow_cache:
        return _shadow_cache[key].copy()
    pad = 90
    s = Image.new("RGBA", (ph_w + 2 * pad, ph_h + 2 * pad), (0, 0, 0, 0))
    rr(ImageDraw.Draw(s), (pad, pad + 24, pad + ph_w, pad + ph_h + 24),
       int(ph_h * 0.074), fill=(0, 0, 0, 165))
    s = s.filter(ImageFilter.GaussianBlur(46))
    _shadow_cache[key] = s
    return s.copy()


def place_phone(dst, body, cx, cy, alpha=1.0, scale=1.0):
    if scale != 1.0:
        body = body.resize((max(1, int(body.width * scale)), max(1, int(body.height * scale))),
                           Image.LANCZOS)
    sh = phone_shadow(body.width, body.height)
    x, y = int(cx - body.width / 2), int(cy - body.height / 2)
    dst.alpha_composite(with_alpha(sh, alpha * 0.85), (x - 90, y - 90))
    dst.alpha_composite(with_alpha(body, alpha), (x, y))


# ---------------------------------------------------------------- wordmark
def wordmark(height):
    """Recorta el wordmark real del header y lo deja con alfa."""
    src = Image.open(os.path.join(SHOTS, "01-inicio.png")).convert("RGB").crop((44, 222, 268, 292))
    a = np.asarray(src).astype(np.float32)
    bg = np.array([15, 23, 42], np.float32)
    alpha = np.clip(((a - bg) / (255.0 - bg)).max(axis=2), 0, 1)
    safe = np.maximum(alpha, 1e-4)[:, :, None]
    col = np.clip((a - (1 - safe) * bg) / safe, 0, 255)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    w = int(im.width * height / im.height)
    return im.resize((w, height), Image.LANCZOS)


def app_icon(size):
    return Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)


# ================================================================ ESCENAS
# --- 1. el problema: caos de mensajes -----------------------------------
CHAOS = [
    # (texto, t_entrada, rotacion, y_rel, x_rel, ancho_max)
    ("Chicas, ¿alguien sabe si mañana hay clase?", 0.00, -4.2, 0.000, 0.04, 660),
    ("¿Quién está juntando la plata del regalo?",  0.16,  3.1, 0.085, 0.34, 620),
    ("Perdón, recién veo, no leí los 47 mensajes de ayer", 0.32, -2.0, 0.170, 0.02, 560),
    ("¿Hay que llevar pañuelos descartables??",    0.48,  4.6, 0.250, 0.38, 600),
    ("El cumple de Mateo ¿es el 25 o el 26?",      0.64, -3.4, 0.330, 0.10, 640),
    ("+12 mensajes nuevos",                        0.78,  2.2, 0.400, 0.48, 420),
    ("¿Alguien tiene la lista de útiles?",         0.92, -1.6, 0.462, 0.06, 580),
    ("¿A qué hora era la reunión de padres?",      1.08,  3.8, 0.545, 0.33, 620),
    ("Yo tampoco entendí nada la verdad",          1.24, -4.0, 0.628, 0.09, 560),
    ("¿Y el menú de hoy? ¿alguien lo tiene?",      1.40,  2.6, 0.706, 0.36, 600),
    ("chicas, se re pasaron de mensajes",        1.56, -2.8, 0.788, 0.05, 540),
    ("Pero entonces ¿mañana hay clase o no?",      1.74,  4.0, 0.860, 0.30, 620),
]


def scene_chaos(t, d):
    """0.0 - 3.4s. Se dibuja en su propia capa para poder implosionar al final."""
    lay = layer()
    f = font(42, "Semibold")
    scroll = int(ease_in_out(clamp(t / 3.2)) * 150)  # el hilo se va yendo para arriba

    for i, (msg, t0, rot, yr, xr, maxw) in enumerate(CHAOS):
        if t < t0:
            continue
        a = ease_out((t - t0) / 0.24)
        lines = wrap(msg, f, maxw)
        tw = max(f.getlength(l) for l in lines)
        lh = 52
        bw, bh = int(tw) + 64, 40 + lh * len(lines)
        pad = 46
        bub = Image.new("RGBA", (bw + 2 * pad, bh + 2 * pad), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bub)
        # los mas viejos quedan mas apagados -> da profundidad al apilado
        age = clamp((t - t0) / 1.6)
        base = (30, 41, 59) if i % 2 == 0 else (37, 56, 92)
        dim = lerp(1.0, 0.80, age)
        fill = tuple(int(c * dim) for c in base) + (255,)
        rr(bd, (pad, pad, pad + bw, pad + bh), 34, fill=fill,
           outline=(85, 101, 125, int(165 * dim)), width=2)
        tc = int(lerp(231, 186, age))
        for k, ln in enumerate(lines):
            bd.text((pad + 32, pad + 20 + k * lh + lh // 2), ln, font=f,
                    fill=(tc, tc + 6, tc + 16, 255), anchor="lm")
        bub = bub.rotate(rot, resample=Image.BICUBIC, expand=True)

        x = int(xr * W) - pad
        y = int(60 + yr * (H - 260)) - scroll - pad
        x += int(14 * math.sin(t * 2.1 + i * 1.7))
        y += int(lerp(54, 0, a)) + int(4.0 * (t / 3.0) ** 2 * math.sin(t * 19 + i * 2.3))
        lay.alpha_composite(with_alpha(bub, a * 0.98), (x, y))

    # contador de no leidos
    if t > 1.15:
        n = min(214, int((t - 1.15) * 205))
        ca = ease_out((t - 1.15) / 0.3)
        glow = layer()
        ImageDraw.Draw(glow).ellipse((W // 2 - 300, H - 400, W // 2 + 300, H - 130),
                                     fill=(9, 14, 28, 255))
        glow = glow.filter(ImageFilter.GaussianBlur(60))
        lay.alpha_composite(with_alpha(glow, ca * 0.96))
        text(lay, (W // 2, H - 296), f"{n}", font(148, "Heavy"), (239, 68, 68), "mm", ca)
        text(lay, (W // 2, H - 186), "MENSAJES SIN LEER", font(34, "Bold"), MUTED, "mm", ca * 0.92)

    # implosion final: todo se encoge hacia el centro y se va
    tail = 0.5
    if t > 3.4 - tail:
        p = ease_in_out((t - (3.4 - tail)) / tail)
        sc = lerp(1.0, 0.72, p)
        small = lay.resize((max(1, int(W * sc)), max(1, int(H * sc))), Image.LANCZOS)
        lay = layer()
        lay.alpha_composite(with_alpha(small, 1 - p),
                            (int((W - small.width) / 2), int((H - small.height) / 2)))
    d.alpha_composite(lay)


# --- 2. la solucion: un tap ---------------------------------------------
def scene_hero(t, d):
    """3.4 - 8.3s (t local desde 3.4)"""
    rise = ease_out(t / 0.85, 3)
    cy = lerp(H + PH_H * 0.55, PH_Y + PH_H / 2, rise)
    zoom = lerp(1.02, 1.0, ease_in_out(clamp(t / 2.2)))
    body = phone("01-inicio.png", zoom=zoom, pan=0.0)
    HERO_DUR = T_HERO - T_CHAOS
    salida = ease_in_out(clamp((t - (HERO_DUR - 0.34)) / 0.34))
    place_phone(d, body, W / 2 - salida * W * 0.95, cy,
                alpha=clamp(t / 0.35) * (1 - 0.7 * salida))

    # titular
    if t > 0.55:
        a = ease_out((t - 0.55) / 0.45) * (1 - clamp((t - (T_HERO - T_CHAOS - 0.34)) / 0.3))
        dy = int(lerp(26, 0, a))
        text(d, (W // 2, 210 + dy), "Todo el curso,", font(78, "Bold"), WHITE, "mm", a)
        text(d, (W // 2, 300 + dy), "en un solo lugar", font(78, "Bold"), BLUE, "mm", a)

    # --- el tap: sobre "Marcar leido" de la primera tarjeta de Pendientes
    sc = PH_H / 2868.0
    tap_x = PH_X + int(PH_W * 0.155)
    tap_y = PH_Y + int(1097 * sc)
    t_tap = 2.05
    if t > t_tap:
        e = t - t_tap
        # onda expansiva
        for k, delay in enumerate((0.0, 0.14)):
            if e < delay:
                continue
            p = clamp((e - delay) / 0.62)
            rad = int(lerp(14, 108, ease_out(p, 2)))
            al = (1 - p) ** 1.6 * 0.85
            ring = layer()
            ImageDraw.Draw(ring).ellipse(
                (tap_x - rad, tap_y - rad, tap_x + rad, tap_y + rad),
                outline=BLUE + (255,), width=max(2, int(7 * (1 - p) + 2)))
            d.alpha_composite(with_alpha(ring, al))
        # dedo/punto
        fp = clamp(e / 0.2)
        pr = int(lerp(34, 22, ease_out(fp)))
        if e < 0.75:
            dot = layer()
            ImageDraw.Draw(dot).ellipse((tap_x - pr, tap_y - pr, tap_x + pr, tap_y + pr),
                                        fill=WHITE + (235,))
            d.alpha_composite(with_alpha(dot, (1 - clamp((e - 0.42) / 0.33))))

    # resolucion: check verde + "listo"
    t_ok = t_tap + 0.5
    if t > t_ok:
        e = t - t_ok
        a = ease_out(e / 0.3) * (1 - clamp((e - 1.5) / 0.5))
        s = ease_out_back(clamp(e / 0.42), 2.2)
        rad = int(52 * s)
        chip = layer()
        cd = ImageDraw.Draw(chip)
        cd.ellipse((tap_x - rad, tap_y - rad, tap_x + rad, tap_y + rad), fill=GREEN + (255,))
        if s > 0.6:
            k = rad * 0.44
            cd.line([(tap_x - k, tap_y), (tap_x - k * 0.16, tap_y + k * 0.72),
                     (tap_x + k, tap_y - k * 0.66)], fill=WHITE + (255,),
                    width=max(3, int(rad * 0.18)), joint="curve")
        d.alpha_composite(with_alpha(chip, a))


# --- 3-5. features ------------------------------------------------------
FEATURES = [
    # (captura, linea1, linea2, pan, zoom_inicial)
    ("02-calendario.png", "Nunca más", "te enterás tarde", 0.0, 1.0),
    ("03-recordatorios.png", "Lo importante", "no se pierde", 0.0, 1.0),
    ("05-colectas.png", "Las colectas del curso,", "resueltas", 0.0, 1.0),
]


# geometria medida sobre 05-colectas.png (1320x2868)
BAR = (93, 1203, 1226, 1221)   # pista completa
BAR_FILL_X = 659               # donde termina el verde real ($16.000 de $32.000)
CARD = (48, 735, 1272, 1520)


def colectas_overlay(t):
    """Enfoca la tarjeta y hace crecer la barra de recaudacion real."""
    def fn(scr, cover, ox, oy):
        def PX(X):
            return X * cover - ox

        def PY(Y):
            return Y * cover - oy

        a = ease_out(clamp((t - 0.55) / 0.6))
        if a > 0.01:
            dim = Image.new("RGBA", scr.size, (6, 10, 22, int(150 * a)))
            hole = Image.new("L", scr.size, 255)
            ImageDraw.Draw(hole).rounded_rectangle(
                (PX(CARD[0]), PY(CARD[1]), PX(CARD[2]), PY(CARD[3])),
                radius=26 * cover, fill=0)
            hole = hole.filter(ImageFilter.GaussianBlur(34))
            dim.putalpha(ImageChops.multiply(dim.getchannel("A"), hole))
            scr.alpha_composite(dim)

        dd = ImageDraw.Draw(scr, "RGBA")
        x0, y0, x1, y1 = PX(BAR[0]), PY(BAR[1]), PX(BAR[2]), PY(BAR[3])
        r = (y1 - y0) / 2
        dd.rounded_rectangle((x0, y0, x1, y1), radius=r, fill=(226, 232, 240, 255))
        p = ease_out(clamp((t - 0.85) / 1.35), 2)
        xe = x0 + (PX(BAR_FILL_X) - x0) * p
        if xe - x0 > 2:
            dd.rounded_rectangle((x0, y0, xe, y1), radius=r, fill=(16, 185, 129, 255))
    return fn


def scene_feature(idx, t, dur, d):
    name, l1, l2, pan0, z0 = FEATURES[idx]
    TR = 0.34
    ins = ease_in_out(clamp((t + TR) / TR))
    exit_lead = TR if idx < 2 else 0.0      # el ultimo cruza con el CTA
    outp = ease_in_out(clamp((t - (dur - exit_lead)) / TR))

    # el telefono entra deslizando desde la derecha y sale hacia la izquierda
    dx = (1 - ins) * W * 0.95 - outp * W * 0.95
    zoom = z0 * lerp(1.0, 1.03, clamp(t / dur))
    pan = pan0 + 0.30 * ease_in_out(clamp(t / dur))
    tn = clamp(t / dur)
    ov = colectas_overlay(t) if name.startswith("05-") else None
    body = phone(name, zoom=zoom, pan=pan, overlay=ov)
    a = min(1.0, 0.4 + 0.6 * ins) * (1 - 0.7 * outp)
    place_phone(d, body, W / 2 + dx, PH_Y + PH_H / 2, alpha=a)

    # titular
    ta = ease_out(clamp((t + 0.10) / 0.4)) * (1 - clamp((t - (dur - 0.3)) / 0.3))
    ty = int(lerp(30, 0, ease_out(clamp((t - 0.12) / 0.5))))
    f = font(76, "Bold")
    text(d, (W // 2, 206 + ty), l1, f, WHITE, "mm", ta)
    text(d, (W // 2, 296 + ty), l2, f, BLUE, "mm", ta)

    # barra de progreso de los 3 features
    if ta > 0:
        seg_w, gap = 96, 14
        total = 3 * seg_w + 2 * gap
        x0 = (W - total) // 2
        bar = layer()
        bd = ImageDraw.Draw(bar)
        for i in range(3):
            x = x0 + i * (seg_w + gap)
            fillc = (255, 255, 255, 46)
            rr(bd, (x, 372, x + seg_w, 378), 3, fill=fillc)
            if i < idx:
                rr(bd, (x, 372, x + seg_w, 378), 3, fill=BLUE + (255,))
            elif i == idx:
                p = tn
                rr(bd, (x, 372, x + int(seg_w * p), 378), 3, fill=BLUE + (255,))
        d.alpha_composite(with_alpha(bar, ta * 0.95))


# --- 6. cierre ----------------------------------------------------------
_wm = None
_icon = None


def scene_cta(t, d):
    """23.3 - 30.0"""
    global _wm, _icon
    if _wm is None:
        _wm = wordmark(120)
        _icon = app_icon(230)

    # icono
    a1 = ease_out(clamp(t / 0.5))
    s = ease_out_back(clamp(t / 0.62), 1.35)
    sz = max(1, int(230 * lerp(0.55, 1.0, s)))
    ic = _icon.resize((sz, sz), Image.LANCZOS)
    gl = Image.new("RGBA", (sz + 160, sz + 160), (0, 0, 0, 0))
    rr(ImageDraw.Draw(gl), (80, 80, 80 + sz, 80 + sz), int(sz * 0.24), fill=BLUE + (120,))
    gl = gl.filter(ImageFilter.GaussianBlur(46))
    d.alpha_composite(with_alpha(gl, a1 * 0.8), (W // 2 - (sz + 160) // 2, 470 - 80))
    d.alpha_composite(with_alpha(ic, a1), (W // 2 - sz // 2, 470 + (230 - sz) // 2))

    # wordmark
    a2 = ease_out(clamp((t - 0.42) / 0.45))
    wmi = with_alpha(_wm, a2)
    d.alpha_composite(wmi, (W // 2 - _wm.width // 2, 790 + int(lerp(20, 0, a2))))

    # tagline
    a3 = ease_out(clamp((t - 0.72) / 0.45))
    text(d, (W // 2, 980 + int(lerp(18, 0, a3))), "La comunidad escolar, en orden.",
         font(46, "Medium"), (203, 213, 225), "mm", a3)

    # linea divisoria
    a4 = ease_out(clamp((t - 1.05) / 0.5))
    if a4 > 0:
        ln = layer()
        lw = int(300 * a4)
        ImageDraw.Draw(ln).rectangle((W // 2 - lw // 2, 1078, W // 2 + lw // 2, 1080),
                                     fill=(71, 85, 105, 255))
        d.alpha_composite(with_alpha(ln, a4))

    # CTA "Descargala gratis"
    a5 = ease_out(clamp((t - 1.35) / 0.5))
    if a5 > 0:
        yb = 1210 + int(lerp(22, 0, a5))
        bw, bh = 620, 132
        btn = layer()
        bd = ImageDraw.Draw(btn)
        pulse = 1 + 0.012 * math.sin((t - 1.35) * 3.4)
        bx0, bx1 = W // 2 - int(bw * pulse) // 2, W // 2 + int(bw * pulse) // 2
        rr(bd, (bx0, yb, bx1, yb + bh), bh // 2, fill=BLUE + (255,))
        bd.text(((bx0 + bx1) // 2, yb + bh // 2), "Descargala gratis",
                font=font(52, "Bold"), fill=WHITE + (255,), anchor="mm")
        d.alpha_composite(with_alpha(btn, a5))

    # tiendas
    a6 = ease_out(clamp((t - 1.7) / 0.5))
    if a6 > 0:
        text(d, (W // 2, 1432), "App Store  ·  Google Play", font(40, "Semibold"),
             (226, 232, 240), "mm", a6)
        text(d, (W // 2, 1520), "tribbu.ar", font(36, "Medium"), BLUE, "mm", a6 * 0.95)


# ================================================================ timeline
T_CHAOS, T_HERO = 3.4, 8.3
T_F = [8.3, 13.3, 18.3]
T_CTA = 23.3


def render_frame(i):
    t = i / FPS
    img = background(t)

    # las ventanas se solapan 0.34s a cada lado para que el push sea continuo
    if t < T_CHAOS:
        scene_chaos(t, img)
    if T_CHAOS <= t < T_HERO:
        scene_hero(t - T_CHAOS, img)
    for k in range(3):
        t0 = T_F[k]
        if t0 - 0.34 <= t < t0 + 5.0 + 0.34:
            scene_feature(k, t - t0, 5.0, img)
    if t >= T_CTA:
        scene_cta(t - T_CTA, img)

    # fundido de entrada y salida global
    if t < 0.35:
        img = with_alpha(img, ease_out(t / 0.35))
        base = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        base.alpha_composite(img)
        img = base
    if t > DUR - 0.55:
        k = clamp((t - (DUR - 0.55)) / 0.55)
        base = Image.new("RGBA", (W, H), (0, 0, 0, 255))
        base.alpha_composite(with_alpha(img, 1 - ease_in_out(k)))
        img = base

    return img.convert("RGB")


def main():
    os.makedirs(OUT, exist_ok=True)
    only = None
    if len(sys.argv) > 1 and sys.argv[1] == "--probe":
        only = [int(x) for x in sys.argv[2].split(",")]
    rng = only if only else range(NFRAMES)
    for n, i in enumerate(rng):
        render_frame(i).save(os.path.join(OUT, f"f{i:05d}.png"))
        if not only and n % 60 == 0:
            print(f"  {n}/{NFRAMES}", flush=True)
    print("listo", len(list(rng)), "frames")


if __name__ == "__main__":
    main()
