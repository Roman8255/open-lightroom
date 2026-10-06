"""Lightroom-style export: resize, output sharpening, format/quality, file-size limit, metadata, watermark, naming."""
import io
import math
import re
import zipfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.models import Photo
from app.schemas.edit import EditParams, ExportBatch, ExportNaming, ExportRequest, ResizeSpec
from app.services import images, storage
from app.services.render import render

EXIF_ORIENTATION, EXIF_ARTIST, EXIF_COPYRIGHT, EXIF_GPS_IFD = 0x0112, 0x013B, 0x8298, 0x8825
SHARPEN = {  # (radius, percent by amount) — approximations of LR's output-sharpening presets
    "screen": (0.8, {"low": 40, "standard": 70, "high": 110}),
    "matte": (1.2, {"low": 50, "standard": 90, "high": 140}),
    "glossy": (1.0, {"low": 35, "standard": 60, "high": 95}),
}


def target_scale(spec: ResizeSpec, w: int, h: int) -> float:
    """Scale factor to apply to a (w, h) frame; 1.0 means keep."""
    k = 1.0
    if spec.mode == "width_height" and (spec.width or spec.height):
        k = min((spec.width / w) if spec.width else math.inf, (spec.height / h) if spec.height else math.inf)
    elif spec.mode == "long" and spec.long_edge:
        k = spec.long_edge / max(w, h)
    elif spec.mode == "short" and spec.short_edge:
        k = spec.short_edge / min(w, h)
    elif spec.mode == "megapixels" and spec.megapixels:
        k = math.sqrt(spec.megapixels * 1_000_000 / (w * h))
    elif spec.mode == "percent" and spec.percent:
        k = spec.percent / 100
    return min(k, 1.0) if spec.no_enlarge else k


def _exif_bytes(raw: Image.Image, req: ExportRequest) -> bytes | None:
    if req.metadata == "none" and not req.copyright:
        return None
    exif = Image.Exif()
    if req.metadata == "all":
        exif = raw.getexif()
        exif[EXIF_ORIENTATION] = 1  # pixels are already upright
        if req.remove_location and EXIF_GPS_IFD in exif:
            del exif[EXIF_GPS_IFD]
    if req.copyright:
        exif[EXIF_COPYRIGHT] = req.copyright
        exif[EXIF_ARTIST] = req.copyright
    return exif.tobytes() or None


def _watermark(img: Image.Image, wm) -> Image.Image:
    size = max(8, round(min(img.size) * wm.size_pct / 100))
    try:
        font = ImageFont.load_default(size=size)
    except TypeError:  # very old Pillow
        font = ImageFont.load_default()
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    box = d.textbbox((0, 0), wm.text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    m = round(min(img.size) * 0.03)
    x = {"tl": m, "bl": m, "tr": img.width - tw - m, "br": img.width - tw - m, "center": (img.width - tw) // 2}[wm.position]
    y = {"tl": m, "tr": m, "bl": img.height - th - m, "br": img.height - th - m, "center": (img.height - th) // 2}[wm.position]
    a = round(255 * wm.opacity / 100)
    d.text((x + 1, y + 1), wm.text, font=font, fill=(0, 0, 0, a // 2))  # soft shadow keeps it readable on any background
    d.text((x, y), wm.text, font=font, fill=(255, 255, 255, a))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def _encode(img: Image.Image, req: ExportRequest, exif: bytes | None) -> tuple[bytes, str, str]:
    dpi = (req.ppi, req.ppi)

    def save(fmt: str, **kw) -> bytes:
        buf = io.BytesIO()
        if exif and fmt in ("JPEG", "PNG", "WEBP"):
            kw["exif"] = exif
        img.save(buf, fmt, **kw)
        return buf.getvalue()

    if req.format == "png":
        return save("PNG", dpi=dpi, optimize=True), "image/png", "png"
    if req.format == "tiff":
        return save("TIFF", dpi=dpi, compression="tiff_lzw"), "image/tiff", "tif"
    fmt, media, ext = ("WEBP", "image/webp", "webp") if req.format == "webp" else ("JPEG", "image/jpeg", "jpg")
    extra = {"dpi": dpi} if fmt == "JPEG" else {}
    if fmt == "JPEG":
        extra["optimize"] = True
    data = save(fmt, quality=req.quality, **extra)
    if req.limit_kb and len(data) > req.limit_kb * 1024:
        lo, hi, best = 5, req.quality, None
        while lo <= hi:  # largest quality that fits the limit
            mid = (lo + hi) // 2
            cand = save(fmt, quality=mid, **extra)
            if len(cand) <= req.limit_kb * 1024:
                best, lo = cand, mid + 1
            else:
                hi = mid - 1
        data = best or save(fmt, quality=5, **extra)
    return data, media, ext


def render_export(photo: Photo, req: ExportRequest) -> tuple[bytes, str, str]:
    """Returns (bytes, media_type, extension)."""
    path = storage.photo_path(photo.user_id, photo.id, "original")
    raw = images.open_image(path.read_bytes())
    exif = _exif_bytes(raw, req)
    img = images.normalize(raw)
    params = EditParams(**(photo.edit.params if photo.edit else {}))

    resize = req.resize
    if req.max_size and resize.mode == "none":
        resize = ResizeSpec(mode="long", long_edge=req.max_size)
    nat_w, nat_h = max(1, round(img.width * params.crop.w)), max(1, round(img.height * params.crop.h))
    k = target_scale(resize, nat_w, nat_h)
    if k < 1:  # render at the target scale (faster, and local effects scale like the preview)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.Resampling.LANCZOS)
    out = render(img, params, seed=photo.id)
    if k > 1:
        out = out.resize((round(out.width * k), round(out.height * k)), Image.Resampling.LANCZOS)

    if req.sharpen.target != "none":
        radius, pct = SHARPEN[req.sharpen.target]
        r = min(2.5, max(0.5, radius * max(out.size) / 2048))
        out = out.filter(ImageFilter.UnsharpMask(radius=r, percent=pct[req.sharpen.amount], threshold=2))
    if req.watermark:
        out = _watermark(out, req.watermark)
    return _encode(out, req, exif)


def _safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", name).strip(". ") or "photo"


def export_name(photo: Photo, naming: ExportNaming, index: int, total: int, ext: str) -> str:
    stem = _safe(photo.filename.rsplit(".", 1)[0])
    custom, n = _safe(naming.custom_text) if naming.custom_text else "photo", naming.start_number + index
    width = max(3, len(str(naming.start_number + total - 1)))
    date = (photo.captured_at or photo.created_at).strftime("%Y-%m-%d")
    base = {
        "filename": stem,
        "custom": custom,
        "custom_seq": f"{custom}-{n:0{width}d}",
        "filename_seq": f"{stem}-{n:0{width}d}",
        "date_filename": f"{date}-{stem}",
        "custom_xofy": f"{custom} ({index + 1} of {total})",
    }[naming.template]
    return f"{base}.{ext}"


def export_batch(photos: list[Photo], batch: ExportBatch) -> tuple[bytes, str, str]:
    """One photo → the file itself; several → a ZIP. Returns (bytes, media_type, filename)."""
    files: list[tuple[str, bytes, str]] = []
    used: set[str] = set()
    for i, ph in enumerate(photos):
        data, media, ext = render_export(ph, batch.settings)
        name = export_name(ph, batch.naming, i, len(photos), ext)
        stem, dot, e = name.rpartition(".")
        k = 1
        while name.lower() in used:  # same name twice → "-2", "-3"…
            k += 1
            name = f"{stem}-{k}.{e}"
        used.add(name.lower())
        files.append((name, data, media))
    if len(files) == 1:
        return files[0][1], files[0][2], files[0][0]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for name, data, _ in files:
            zf.writestr(name, data)
    return buf.getvalue(), "application/zip", "export.zip"
