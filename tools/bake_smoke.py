"""Wispy ground haze: long vertical fade, no left/right lobes.

Bakes img/smoke-loop.png. Pass --preview to also write a slide composite.
"""
from __future__ import annotations

from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "img"
N_FRAMES = 16
COLS = 4
FW, FH = 960, 540
OCTAVES = 5

# Match js/fx.js drawSmokeSheet geometry (fractions of the slide).
DRAW_Y = 0.50
DRAW_H = 0.54
DRAW_A = 0.58


def fade(t: np.ndarray) -> np.ndarray:
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def make_table(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.random((n, n, n), dtype=np.float32)


def sample3(table: np.ndarray, x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    n = table.shape[0]
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    z0 = np.floor(z).astype(np.int32)
    tx = fade(x - np.floor(x))
    ty = fade(y - np.floor(y))
    tz = fade(z - np.floor(z))
    x1 = (x0 + 1) % n
    y1 = (y0 + 1) % n
    z1 = (z0 + 1) % n
    x0 %= n
    y0 %= n
    z0 %= n
    c000 = table[z0, y0, x0]
    c100 = table[z0, y0, x1]
    c010 = table[z0, y1, x0]
    c110 = table[z0, y1, x1]
    c001 = table[z1, y0, x0]
    c101 = table[z1, y0, x1]
    c011 = table[z1, y1, x0]
    c111 = table[z1, y1, x1]
    c00 = c000 + (c100 - c000) * tx
    c10 = c010 + (c110 - c010) * tx
    c01 = c001 + (c101 - c001) * tx
    c11 = c011 + (c111 - c011) * tx
    c0 = c00 + (c10 - c00) * ty
    c1 = c01 + (c11 - c01) * ty
    return c0 + (c1 - c0) * tz


def fbm(table: np.ndarray, x: np.ndarray, y: np.ndarray, z: np.ndarray, octaves: int = OCTAVES) -> np.ndarray:
    v = np.zeros(x.shape, dtype=np.float32)
    a = 0.55
    f = 1.0
    s = 0.0
    for _ in range(octaves):
        v += a * sample3(table, x * f, y * f, z * f)
        s += a
        a *= 0.5
        f *= 2.03
    return v / s


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def field(table: np.ndarray, h: int, w: int, ang: float) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x = xx / (w - 1)
    y = yy / (h - 1)
    cz = 1.6 * np.cos(ang)
    sz = 1.6 * np.sin(ang)

    # Mild warp, stretched in X so puffs become sheets — never two round mounds.
    wx = fbm(table, x * 0.7 + 2.2, y * 3.8, cz, 4) * 2.0 - 1.0
    wy = fbm(table, x * 0.7 + 6.4, y * 3.8 + 2.1, sz, 4) * 2.0 - 1.0
    xn = x + wx * 0.05
    yn = np.clip(y + wy * 0.04, 0.0, 1.0)

    # Long falloff from the floor. Density lives in the function, not in a blur.
    rise = np.maximum(1.0 - yn, 0.0)
    atmos = np.exp(-np.power(rise * 1.62, 1.08))
    atmos *= smoothstep(0.0, 0.52, yn)

    # Ridged horizontal layers: survive a light blur as sheets, not cotton balls.
    sheet = fbm(table, xn * 0.95, yn * 6.4, cz, 5)
    fine = fbm(table, xn * 2.2 + 1.4, yn * 11.0, sz, 4)
    ridged = 1.0 - np.abs(sheet * 2.0 - 1.0)
    tex = 0.06 + 0.62 * np.power(np.clip(ridged, 0, 1), 1.55) + 0.32 * fine

    mid = smoothstep(0.16, 0.42, yn) * (1.0 - smoothstep(0.48, 0.86, yn))
    wisps = np.clip(fine - 0.55, 0.0, 1.0) ** 1.25 * mid * 0.34

    d = atmos * tex + wisps
    return np.clip(d, 0.0, 1.0).astype(np.float32)


def render_rgba(d: np.ndarray) -> Image.Image:
    h, w = d.shape
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    warm = np.clip((y - 0.18) / 0.82, 0.0, 1.0)
    # Pale veil: shape lives in alpha. Slightly warmer near the fire, cooler as it thins.
    r = 226.0 + 8.0 * warm
    g = 208.0 - 6.0 * (1.0 - warm)
    b = 192.0 - 18.0 * (1.0 - warm)
    r = np.broadcast_to(r, d.shape)
    g = np.broadcast_to(g, d.shape)
    b = np.broadcast_to(b, d.shape)
    alpha = np.power(np.clip(d, 0.0, 1.0), 0.88) * 155.0
    rgba = np.dstack(
        [
            np.clip(r, 0, 255).astype(np.uint8),
            np.clip(g, 0, 255).astype(np.uint8),
            np.clip(b, 0, 255).astype(np.uint8),
            np.clip(alpha, 0, 255).astype(np.uint8),
        ]
    )
    img = Image.fromarray(rgba, "RGBA")
    img = img.resize((FW, FH), Image.Resampling.BILINEAR)
    return blur_premult(img, rgb_radius=3.2, alpha_radius=8.0)


def blur_premult(img: Image.Image, rgb_radius: float, alpha_radius: float) -> Image.Image:
    """Blur in premultiplied space so the fade doesn't grow a pale rim."""
    arr = np.asarray(img).astype(np.float32)
    a = arr[:, :, 3:4] / 255.0
    prem = np.concatenate([arr[:, :, :3] * a, arr[:, :, 3:4]], axis=2)
    pimg = Image.fromarray(np.clip(prem, 0, 255).astype(np.uint8), "RGBA")
    ch = pimg.split()
    rgb = [c.filter(ImageFilter.GaussianBlur(radius=rgb_radius)) for c in ch[:3]]
    aa = ch[3].filter(ImageFilter.GaussianBlur(radius=alpha_radius))
    merged = np.asarray(Image.merge("RGBA", (*rgb, aa))).astype(np.float32)
    denom = np.maximum(merged[:, :, 3:4] / 255.0, 1e-4)
    rgb_out = np.clip(merged[:, :, :3] / denom, 0, 255)
    out = np.concatenate([rgb_out, merged[:, :, 3:4]], axis=2)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def slide_bg(w: int, h: int) -> Image.Image:
    """Approximate the live sky + fire so the preview matches the deck."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    x = xx / (w - 1)
    y = yy / (h - 1)
    r = 10.0 + 8.0 * y
    g = 8.0 + 2.0 * y
    b = 16.0 - 6.0 * y
    # .sky red wash ~70% 20%
    d1 = np.sqrt(((x - 0.70) / 0.55) ** 2 + ((y - 0.20) / 0.42) ** 2)
    k1 = np.clip(1.0 - d1, 0.0, 1.0) ** 1.4
    r += 90 * 0.55 * k1
    g += 30 * 0.22 * k1
    b += 40 * 0.14 * k1
    # hero radial ~72% 42%
    d2 = np.sqrt(((x - 0.72) / 0.48) ** 2 + ((y - 0.42) / 0.42) ** 2)
    k2 = np.clip(1.0 - d2, 0.0, 1.0) ** 1.6
    r += 226 * 0.34 * k2
    g += 59 * 0.12 * k2
    # floor fire: one wide ellipse, not two corner balls
    d3 = np.sqrt(((x - 0.50) / 0.78) ** 2 + ((y - 1.14) / 0.32) ** 2)
    k3 = np.clip(1.0 - d3, 0.0, 1.0) ** 1.25
    r += 255 * 0.28 * k3
    g += 100 * 0.14 * k3
    rgb = np.dstack(
        [
            np.clip(r, 0, 255).astype(np.uint8),
            np.clip(g, 0, 255).astype(np.uint8),
            np.clip(b, 0, 255).astype(np.uint8),
        ]
    )
    return Image.fromarray(rgb, "RGB").convert("RGBA")


def screen_fade_mask(w: int, h: int) -> Image.Image:
    """Same idea as the canvas destination-in gradient in fx.js."""
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    t = np.clip(y / 0.32, 0.0, 1.0)
    a = t * t * (3.0 - 2.0 * t)
    a = np.broadcast_to(a, (h, w)).copy()
    alpha = np.clip(a * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(alpha, "L")


def composite_look(frame: Image.Image, path: Path) -> None:
    w, h = 1600, 900
    bg = slide_bg(w, h)
    sw, sh = int(w * 1.04), int(h * DRAW_H)
    smoke = frame.resize((sw, sh), Image.Resampling.BILINEAR)
    fade_m = screen_fade_mask(sw, sh)
    smoke = Image.composite(smoke, Image.new("RGBA", smoke.size, (0, 0, 0, 0)), fade_m)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    layer.paste(smoke, (int(-w * 0.02), int(h * DRAW_Y)), smoke)
    # Match canvas globalAlpha
    layer.putalpha(layer.getchannel("A").point(lambda v: int(v * DRAW_A / 1.0)))
    out = Image.alpha_composite(bg, layer)

    draw = ImageDraw.Draw(out)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/times.ttf", 72)
        small = ImageFont.truetype("C:/Windows/Fonts/times.ttf", 28)
    except OSError:
        font = ImageFont.load_default()
        small = font
    draw.text((88, 210), "Cach mang", fill=(244, 234, 216), font=font)
    draw.text((88, 290), "thang Tam", fill=(244, 234, 216), font=font)
    draw.text((88, 372), "nam 1945", fill=(232, 206, 150), font=font)
    draw.text((90, 470), "Buoc ngoat khai sinh nuoc Viet Nam Dan chu Cong hoa", fill=(210, 196, 176), font=small)
    out.convert("RGB").save(path, optimize=True)
    print(f"wrote {path}")


def bake() -> None:
    OUT.mkdir(exist_ok=True)
    rng = np.random.default_rng(1945)
    table = make_table(32, rng)
    sim_h, sim_w = 180, 320
    frames = []
    for i in range(N_FRAMES):
        ang = 2.0 * np.pi * i / N_FRAMES
        d = field(table, sim_h, sim_w, ang)
        frames.append(render_rgba(d))

    rows = int(np.ceil(N_FRAMES / COLS))
    atlas = Image.new("RGBA", (COLS * FW, rows * FH), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        atlas.paste(fr, ((i % COLS) * FW, (i // COLS) * FH))
    dest = OUT / "smoke-loop.png"
    atlas.save(dest, optimize=True)
    print(f"wrote {dest} {atlas.size}  frames={N_FRAMES} cell={FW}x{FH}")
    if "--preview" in sys.argv:
        frames[0].save(OUT / "_smoke_cell.png")
        composite_look(frames[0], OUT / "_smoke_look.png")


if __name__ == "__main__":
    bake()
