"""CPU reference renderer for export. Mirrors frontend/src/gl/shader.ts stage by stage.

Stages: geometry (crop/transform/distortion) -> spots & red-eye -> lens vignette
        -> calibration -> tone (+ local masks) -> detail -> color -> grading -> curves -> effects.
Tone, color, curves, grading, geometry and masks use identical formulas on the GPU; NR, clarity,
texture, sharpening and grain are close approximations (different blur kernels / noise source).
"""
import math

import numpy as np
from PIL import Image, ImageFilter

from app.schemas.edit import HSL_BANDS, Calibration, EditParams, Mask

LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
BAND_HUES = np.array([0, 30, 60, 120, 180, 240, 270, 300], dtype=np.float32)
OUT_OF_FRAME = 0.11
MASK_RES = 1024
IDENTITY_CURVE = [[0.0, 0.0], [1.0, 1.0]]


# ───────────────────────── color helpers ─────────────────────────
def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c: np.ndarray) -> np.ndarray:
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def smoothstep(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def luma(c: np.ndarray) -> np.ndarray:
    return (c @ LUMA)[..., None]


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


def band_weights(hue: np.ndarray) -> np.ndarray:
    diff = np.abs(((hue[..., None] - BAND_HUES + 180) % 360) - 180)
    return np.clip(1 - diff / 45.0, 0, 1)  # (...,8) triangular, 45° falloff


def cal_matrix(cal: Calibration) -> np.ndarray:
    """Columns are the (rotated / desaturated) R, G, B primaries: c' = c @ M.T"""

    def prim(base: float, hue: float, sat: float) -> np.ndarray:
        h = (base + hue / 100 * 30) % 360
        v = hsv_to_rgb(np.array([h, 1.0, 1.0], dtype=np.float32))
        lum = float(v @ LUMA)
        return lum + (v - lum) * (1 + sat / 100)

    return np.stack(
        [prim(0, cal.red_hue, cal.red_sat), prim(120, cal.green_hue, cal.green_sat),
         prim(240, cal.blue_hue, cal.blue_sat)], axis=1,
    ).astype(np.float32)


def gblur(c: np.ndarray, sigma: float) -> np.ndarray:
    if sigma < 0.3:
        return c
    im = Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(sigma)), dtype=np.float32) / 255.0


# ───────────────────────── geometry ─────────────────────────
def is_identity_geometry(p: EditParams, ignore_crop: bool = False) -> bool:
    c = p.crop
    base = (p.distortion == 0 and p.vertical == 0 and p.horizontal == 0 and p.rotate == 0
            and p.scale == 100 and p.aspect == 0 and c.angle == 0)
    return base and (ignore_crop or (c.x == 0 and c.y == 0 and c.w == 1 and c.h == 1))


def src_coords(p: EditParams, ow: int, oh: int, aspect: float) -> tuple[np.ndarray, np.ndarray]:
    """Map output pixel centres to normalised source coordinates. Shapes (1,ow) and (oh,1) or (oh,ow)."""
    c = p.crop
    u = ((np.arange(ow, dtype=np.float32) + 0.5) / ow)[None, :]
    v = ((np.arange(oh, dtype=np.float32) + 0.5) / oh)[:, None]
    px, py = c.x + u * c.w, c.y + v * c.h
    if is_identity_geometry(p, ignore_crop=True):
        return px, py
    qx, qy = (px - 0.5) * aspect, py - 0.5
    s = p.scale / 100
    qx, qy = qx / s, qy / s
    qx = qx / (1 + p.aspect / 100 * 0.5)
    nx = qx * (1 + p.vertical / 100 * 0.5 * qy)
    ny = qy * (1 + p.horizontal / 100 * 0.5 * qx)
    th = math.radians(c.angle + p.rotate)
    rx = math.cos(th) * nx + math.sin(th) * ny
    ry = -math.sin(th) * nx + math.cos(th) * ny
    r2 = (rx * rx + ry * ry) / (0.25 * (aspect * aspect + 1))
    f = 1 + p.distortion / 100 * 0.35 * r2
    return rx * f / aspect + 0.5, ry * f + 0.5


def bilinear(arr: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> np.ndarray:
    """Sample arr (h,w,C) at normalised coords (broadcastable) with clamp-to-edge."""
    h, w = arr.shape[:2]
    fx, fy = sx * w - 0.5, sy * h - 0.5
    x0, y0 = np.floor(fx), np.floor(fy)
    tx, ty = (fx - x0)[..., None], (fy - y0)[..., None]
    x0i, y0i = x0.astype(np.int64), y0.astype(np.int64)
    x1i, y1i = np.clip(x0i + 1, 0, w - 1), np.clip(y0i + 1, 0, h - 1)
    x0i, y0i = np.clip(x0i, 0, w - 1), np.clip(y0i, 0, h - 1)
    a = arr[y0i, x0i] * (1 - tx) + arr[y0i, x1i] * tx
    b = arr[y1i, x0i] * (1 - tx) + arr[y1i, x1i] * tx
    return a * (1 - ty) + b * ty


# ───────────────────────── masks ─────────────────────────
def raster_mask(m: Mask, mw: int, mh: int) -> np.ndarray:
    """Coverage 0..1 in source space, (mh, mw). Same algorithm as frontend/src/gl/masks.ts."""
    aspect = mw / mh
    X = ((np.arange(mw, dtype=np.float32) + 0.5) / mw)[None, :]
    Y = ((np.arange(mh, dtype=np.float32) + 0.5) / mh)[:, None]
    if m.type == "linear":
        dx, dy = (m.x2 - m.x1) * aspect, m.y2 - m.y1
        len2 = dx * dx + dy * dy
        if len2 < 1e-8:
            v = np.zeros((mh, mw), np.float32)
        else:
            t = ((X - m.x1) * aspect * dx + (Y - m.y1) * dy) / len2
            v = 1 - smoothstep(0, 1, t)
    elif m.type == "radial":
        d = np.hypot((X - m.cx) / m.rx, (Y - m.cy) / m.ry)
        inner = min(1 - m.feather / 100, 0.98)
        v = 1 - smoothstep(inner, 1, d)
    else:
        v = np.zeros((mh, mw), np.float32)
        budget = 20000
        for st in m.strokes:
            r = max(1.0, st.size * mh)
            inner = min(1 - st.feather, 0.98)
            pts = [(x * mw, y * mh) for x, y in st.points]
            stamps: list[tuple[float, float]] = []
            for i, (x, y) in enumerate(pts):
                if i == 0:
                    stamps.append((x, y))
                    continue
                px, py = pts[i - 1]
                n = max(1, math.ceil(math.hypot(x - px, y - py) / (0.25 * r)))
                stamps += [(px + (x - px) * k / n, py + (y - py) * k / n) for k in range(1, n + 1)]
            for cx, cy in stamps[: max(0, budget)]:
                x0, x1 = max(0, int(cx - r)), min(mw, int(cx + r) + 2)
                y0, y1 = max(0, int(cy - r)), min(mh, int(cy + r) + 2)
                if x0 >= x1 or y0 >= y1:
                    continue
                xx = np.arange(x0, x1, dtype=np.float32)[None, :] + 0.5
                yy = np.arange(y0, y1, dtype=np.float32)[:, None] + 0.5
                a = 1 - smoothstep(inner, 1, np.hypot(xx - cx, yy - cy) / r)
                sub = v[y0:y1, x0:x1]
                v[y0:y1, x0:x1] = sub * (1 - a) if st.erase else sub + a - sub * a
            budget -= len(stamps)
    v = v.astype(np.float32)
    return 1 - v if m.invert else v


def mask_stack(p: EditParams, W: int, H: int) -> np.ndarray | None:
    ms = [m for m in p.masks]
    if not ms:
        return None
    k = MASK_RES / max(W, H)
    mw, mh = max(2, round(W * min(1.0, k))), max(2, round(H * min(1.0, k)))
    out = np.zeros((mh, mw, 4), np.float32)
    for i, m in enumerate(ms):
        out[..., i] = raster_mask(m, mw, mh) if m.enabled else 0
    return out


# ───────────────────────── stages ─────────────────────────
def tone_stage(c, exposure, temp, tint, contrast, hl, sh, wh, bl):
    lin = srgb_to_linear(c) * (2.0**exposure)
    t, ti = temp / 100.0, tint / 100.0
    lin = lin * np.array([1 + 0.25 * t, 1 - 0.15 * ti, 1 - 0.25 * t], dtype=np.float32)
    c = linear_to_srgb(lin)
    L = luma(c)
    c = c + (sh / 100) * 0.25 * (1 - L) ** 2 + (hl / 100) * 0.25 * L**2
    c = c + (wh / 100) * 0.15 * L**4 + (bl / 100) * 0.15 * (1 - L) ** 4
    c = np.clip(c, 0, 1)
    return np.clip((c - 0.5) * max(0.0, 1 + contrast / 100) + 0.5, 0, 1)


def dehaze_stage(c: np.ndarray, amount: float) -> np.ndarray:
    d = amount / 100
    if d > 0:
        dark = c.min(-1, keepdims=True)
        t = np.clip(1 - d * dark / 0.9, 0.25, 1)
        return np.clip((c - 0.9) / t + 0.9, 0, 1)
    return c + (0.8 - c) * (-d * 0.35)


def apply_spots_and_eyes(g, src, p, sx, sy, aspect):
    oh, ow = g.shape[:2]
    for s in p.spots:
        d = np.hypot((sx - s.x) * aspect, sy - s.y) / s.r
        d = np.broadcast_to(d, (oh, ow))
        w = (1 - smoothstep(1 - max(s.feather, 0.02), 1, d)) * s.opacity
        idx = np.nonzero(w > 0)
        if not len(idx[0]):
            continue
        bx, by = np.broadcast_to(sx, (oh, ow))[idx], np.broadcast_to(sy, (oh, ow))[idx]
        samp = bilinear(src, bx + (s.sx - s.x), by + (s.sy - s.y))
        if s.mode == "heal":
            ring = [(s.r / aspect, 0), (-s.r / aspect, 0), (0, s.r), (0, -s.r)]
            dest = np.mean([bilinear(src, np.float32(s.x + a), np.float32(s.y + b)) for a, b in ring], axis=0)
            srcm = np.mean([bilinear(src, np.float32(s.sx + a), np.float32(s.sy + b)) for a, b in ring], axis=0)
            samp = samp + (dest - srcm).reshape(1, 3)
        wi = w[idx][:, None]
        g[idx] = np.clip(g[idx] * (1 - wi) + samp * wi, 0, 1)
    for e in p.red_eyes:
        d = np.broadcast_to(np.hypot((sx - e.x) * aspect, sy - e.y) / e.r, (oh, ow))
        m = (1 - smoothstep(0.6, 1, d)) * e.amount
        idx = np.nonzero(m > 0)
        if not len(idx[0]):
            continue
        c = g[idx]
        k = (np.clip((c[:, 0] - np.maximum(c[:, 1], c[:, 2])) * 4, 0, 1) * m[idx])
        target = np.maximum(c[:, 1], c[:, 2]) * 0.6
        c[:, 0] = c[:, 0] + (target - c[:, 0]) * k
        c[:, 1] *= 1 - 0.4 * k
        c[:, 2] *= 1 - 0.4 * k
        g[idx] = c
    return g


def render(img: Image.Image, p: EditParams, seed: int = 0) -> Image.Image:
    src = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    H, W, _ = src.shape
    aspect = W / H
    cr = p.crop
    ow, oh = max(1, round(W * cr.w)), max(1, round(H * cr.h))

    # 1 ─ geometry
    sx, sy = src_coords(p, ow, oh, aspect)
    if is_identity_geometry(p, ignore_crop=True):
        x0, y0 = round(cr.x * W), round(cr.y * H)
        g = src[y0 : y0 + oh, x0 : x0 + ow].copy()
        oh, ow = g.shape[:2]
        sx, sy = sx[:, :ow], sy[:oh, :]
    else:
        g = bilinear(src, sx, sy)
        oob = (sx < 0) | (sx > 1) | (sy < 0) | (sy > 1)
        g = np.where(np.broadcast_to(oob, (oh, ow))[..., None], OUT_OF_FRAME, g)
    # 2 ─ spots / red eye / lens vignette
    g = apply_spots_and_eyes(g, src, p, sx, sy, aspect)
    if p.lens_vignette:
        rn = np.hypot((sx - 0.5) * aspect, sy - 0.5) / (0.5 * math.sqrt(aspect * aspect + 1))
        g = np.clip(g * (1 + p.lens_vignette / 100 * 0.8 * rn**2)[..., None], 0, 1)
    ms = mask_stack(p, W, H)
    M = bilinear(ms, sx, sy) if ms is not None else None

    # 3 ─ calibration, tone, dehaze, local adjustments
    cal = p.cal
    if any(getattr(cal, k) for k in type(cal).model_fields):
        c = np.clip(g @ cal_matrix(cal).T, 0, 1)
        if cal.shadow_tint:
            L = luma(c)
            c = c.copy()
            c[..., 1:2] = np.clip(c[..., 1:2] + cal.shadow_tint / 100 * 0.06 * (1 - L) ** 2, 0, 1)
    else:
        c = g
    c = tone_stage(c, p.exposure, p.temperature, p.tint, p.contrast, p.highlights, p.shadows, p.whites, p.blacks)
    if p.dehaze:
        c = dehaze_stage(c, p.dehaze)
    for i, m in enumerate(p.masks):
        a = m.adj
        if M is None or not m.enabled or not any(getattr(a, k) for k in type(a).model_fields):
            continue
        adj = tone_stage(c, a.exposure, a.temperature, a.tint, a.contrast, a.highlights, a.shadows, 0, 0)
        L = luma(adj)
        adj = np.clip(L + (adj - L) * (1 + a.saturation / 100), 0, 1)
        c = c + (adj - c) * M[..., i : i + 1]

    # 4 ─ detail
    rs = max(ow, oh) / 2048
    if p.noise_reduction:
        blur = gblur(c, 2 * rs)
        wgt = np.exp(-((c - blur) ** 2).sum(-1, keepdims=True) / (0.0005 + 0.01 * p.noise_reduction / 100))
        c = c + (blur - c) * wgt * (p.noise_reduction / 100)
    if p.clarity:
        blur = gblur(c, max(ow, oh) / 100)
        mid = 1 - (2 * luma(c) - 1) ** 2
        c = np.clip(c + (c - blur) * (p.clarity / 100) * 0.8 * mid, 0, 1)
    if p.texture:
        c = np.clip(c + (c - gblur(c, 1.5 * rs)) * (p.texture / 100), 0, 1)
    if p.sharpening:
        c = np.clip(c + (c - gblur(c, 0.7 * p.sharpen_radius * rs)) * (p.sharpening / 100), 0, 1)

    # 5 ─ color: vibrance / saturation / HSL / B&W
    L = luma(c)
    sat = (c.max(-1) - c.min(-1))[..., None]
    c = L + (c - L) * (1 + (p.vibrance / 100) * (1 - sat))
    c = np.clip(L + (c - L) * (1 + p.saturation / 100), 0, 1)
    has_hsl = any(b.hue or b.sat or b.lum for b in p.hsl.values())
    if has_hsl or p.bw:
        hsv = rgb_to_hsv(c)
        wts = band_weights(hsv[..., 0]) * np.clip(hsv[..., 1:2], 0, 1)
        dh = sum(wts[..., i] * p.hsl[b].hue for i, b in enumerate(HSL_BANDS)) * 0.3
        ds = sum(wts[..., i] * p.hsl[b].sat for i, b in enumerate(HSL_BANDS)) / 100
        dl = sum(wts[..., i] * p.hsl[b].lum for i, b in enumerate(HSL_BANDS)) / 100
        if p.bw:
            c = np.repeat(np.clip(luma(c) * (1 + dl[..., None] * 0.8), 0, 1), 3, axis=-1)
        else:
            hsv[..., 0] = (hsv[..., 0] + dh) % 360
            hsv[..., 1] = np.clip(hsv[..., 1] * (1 + ds), 0, 1)
            hsv[..., 2] = np.clip(hsv[..., 2] * (1 + dl * 0.5), 0, 1)
            c = hsv_to_rgb(hsv)

    # 6 ─ color grading
    gr = p.grade
    if any(z.sat or z.lum for z in (gr.shadows, gr.midtones, gr.highlights)):
        L = luma(c)
        pivot, width = 0.5 + gr.balance / 100 * 0.25, 0.2 + gr.blending / 100 * 0.3
        ws = 1 - smoothstep(pivot - width, pivot, L)
        wh = smoothstep(pivot, pivot + width, L)
        wm = np.clip(1 - ws - wh, 0, 1)
        out = c.copy()
        for z, w in ((gr.shadows, ws), (gr.midtones, wm), (gr.highlights, wh)):
            rgb = hsv_to_rgb(np.array([z.hue, 1.0, 1.0], dtype=np.float32))
            tint = (rgb - float(rgb @ LUMA)) * (z.sat / 100)
            out = out + (tint * 0.35 + z.lum / 100 * 0.2) * w
        c = np.clip(out, 0, 1)

    # 7 ─ tone curves
    for pts, ch in ((p.curve, None), (p.curve_r, 0), (p.curve_g, 1), (p.curve_b, 2)):
        if pts != IDENTITY_CURVE:
            lut, xs = curve_lut(pts), np.linspace(0, 1, 256)
            if ch is None:
                c = np.interp(c, xs, lut)
            else:
                c = c.copy()
                c[..., ch] = np.interp(c[..., ch], xs, lut)
    c = c.astype(np.float32)

    # 8 ─ effects
    if p.vignette:
        yy, xx = np.mgrid[0:oh, 0:ow].astype(np.float32)
        d = np.sqrt(((xx / ow - 0.5) * 2) ** 2 + ((yy / oh - 0.5) * 2) ** 2) / 1.4142
        f = np.clip((d - 0.35) / 0.65, 0, 1) ** 2
        c = np.clip(c * (1 + (p.vignette / 100) * f[..., None] * 0.9), 0, 1)
    if p.grain:
        rng = np.random.default_rng(seed)
        c = np.clip(c + rng.normal(0, 1, (oh, ow, 1)).astype(np.float32) * (p.grain / 100) * 0.08, 0, 1)

    return Image.fromarray((np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8))
