"""CPU reference renderer for export. Mirrors frontend/src/gl/shader.ts (same formulas;
clarity/sharpen/grain are approximations of the GPU versions)."""
import numpy as np
from PIL import Image, ImageFilter

from app.schemas.edit import HSL_BANDS, EditParams

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BAND_HUES = np.array([0, 30, 60, 120, 180, 240, 270, 300], dtype=np.float32)


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def curve_lut(points: list[list[float]], n: int = 256) -> np.ndarray:
    """Monotone cubic (Fritsch–Carlson) interpolation sampled into n entries."""
    xs = np.array([p[0] for p in points], dtype=np.float64)
    ys = np.array([p[1] for p in points], dtype=np.float64)
    k = len(xs)
    h = np.diff(xs)
    d = np.diff(ys) / h
    m = np.zeros(k)
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, k - 1):
        m[i] = 0.0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(k - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0
        else:
            a, b = m[i] / d[i], m[i + 1] / d[i]
            s = a * a + b * b
            if s > 9:
                t = 3 / np.sqrt(s)
                m[i], m[i + 1] = t * a * d[i], t * b * d[i]
    t_in = np.linspace(0, 1, n)
    idx = np.clip(np.searchsorted(xs, t_in, side="right") - 1, 0, k - 2)
    x0, hh = xs[idx], h[idx]
    t = np.clip((t_in - x0) / hh, 0, 1)
    h00 = 2 * t**3 - 3 * t**2 + 1
    h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2
    h11 = t**3 - t**2
    out = h00 * ys[idx] + h10 * hh * m[idx] + h01 * ys[idx + 1] + h11 * hh * m[idx + 1]
    return np.clip(out, 0, 1).astype(np.float32)


def rgb_to_hsv(c: np.ndarray) -> np.ndarray:
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    safe = np.where(d == 0, 1, d)
    h = np.where(mx == r, ((g - b) / safe) % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4))
    h = np.where(d == 0, 0, h) * 60
    s = np.where(mx == 0, 0, d / np.where(mx == 0, 1, mx))
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    h, s, v = hsv[..., 0] / 60.0, hsv[..., 1], hsv[..., 2]

    def f(n: float) -> np.ndarray:
        k = (n + h) % 6
        return v - v * s * np.clip(np.minimum(k, 4 - k), 0, 1)

    return np.stack([f(5), f(3), f(1)], -1)


def band_weights(hue: np.ndarray) -> np.ndarray:
    diff = np.abs(((hue[..., None] - BAND_HUES + 180) % 360) - 180)
    return np.clip(1 - diff / 45.0, 0, 1)  # (...,8) triangular, 45° falloff


def render(img: Image.Image, p: EditParams, seed: int = 0) -> Image.Image:
    src = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    h, w, _ = src.shape

    # exposure + white balance in linear light
    lin = srgb_to_linear(src) * (2.0**p.exposure)
    t, ti = p.temperature / 100.0, p.tint / 100.0
    lin *= np.array([1 + 0.25 * t, 1 - 0.15 * ti, 1 - 0.25 * t], dtype=np.float32)
    c = linear_to_srgb(lin)

    # tone regions
    L = (c @ LUMA)[..., None]
    c = c + (p.shadows / 100) * 0.25 * (1 - L) ** 2 + (p.highlights / 100) * 0.25 * L**2
    c = c + (p.whites / 100) * 0.15 * L**4 + (p.blacks / 100) * 0.15 * (1 - L) ** 4
    c = np.clip(c, 0, 1)
    c = np.clip((c - 0.5) * max(0.0, 1 + p.contrast / 100) + 0.5, 0, 1)

    if p.bw:
        c = np.repeat((c @ LUMA)[..., None], 3, axis=-1)

    # clarity: local contrast on luma, midtone-weighted
    if p.clarity:
        blur = np.asarray(
            Image.fromarray((c * 255).astype(np.uint8)).filter(
                ImageFilter.GaussianBlur(max(w, h) / 100)
            ),
            dtype=np.float32,
        ) / 255.0
        Lc = (c @ LUMA)[..., None]
        mid = 1 - (2 * Lc - 1) ** 2
        c = np.clip(c + (c - blur) * (p.clarity / 100) * 0.8 * mid, 0, 1)

    # vibrance / saturation
    L = (c @ LUMA)[..., None]
    sat = (c.max(-1) - c.min(-1))[..., None]
    c = L + (c - L) * (1 + (p.vibrance / 100) * (1 - sat))
    c = np.clip(L + (c - L) * (1 + p.saturation / 100), 0, 1)

    # HSL bands
    if any(b.hue or b.sat or b.lum for b in p.hsl.values()):
        hsv = rgb_to_hsv(c)
        wts = band_weights(hsv[..., 0]) * np.clip(hsv[..., 1:2], 0, 1)
        dh = sum(wts[..., i] * p.hsl[b].hue for i, b in enumerate(HSL_BANDS)) * 0.3
        ds = sum(wts[..., i] * p.hsl[b].sat for i, b in enumerate(HSL_BANDS)) / 100
        dl = sum(wts[..., i] * p.hsl[b].lum for i, b in enumerate(HSL_BANDS)) / 100
        hsv[..., 0] = (hsv[..., 0] + dh) % 360
        hsv[..., 1] = np.clip(hsv[..., 1] * (1 + ds), 0, 1)
        hsv[..., 2] = np.clip(hsv[..., 2] * (1 + dl * 0.5), 0, 1)
        c = hsv_to_rgb(hsv)

    # tone curve
    if p.curve != [[0.0, 0.0], [1.0, 1.0]]:
        lut = curve_lut(p.curve)
        c = np.interp(c, np.linspace(0, 1, 256), lut)

    # sharpening
    if p.sharpening:
        im = Image.fromarray((np.clip(c, 0, 1) * 255).astype(np.uint8))
        im = im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=int(p.sharpening), threshold=0))
        c = np.asarray(im, dtype=np.float32) / 255.0

    # vignette
    if p.vignette:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx / w - 0.5) * 2) ** 2 + ((yy / h - 0.5) * 2) ** 2) / 1.4142
        f = np.clip((d - 0.35) / 0.65, 0, 1) ** 2
        c = np.clip(c * (1 + (p.vignette / 100) * f[..., None] * 0.9), 0, 1)

    # grain
    if p.grain:
        rng = np.random.default_rng(seed)
        c = np.clip(c + rng.normal(0, 1, (h, w, 1)).astype(np.float32) * (p.grain / 100) * 0.08, 0, 1)

    return Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))
