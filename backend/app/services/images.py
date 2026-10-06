import io
from datetime import datetime, timezone

from PIL import ExifTags, Image, ImageOps

THUMB_SIZE = 480
PREVIEW_SIZE = 2048
EXIF_KEYS = {
    "Make": "make", "Model": "model", "LensModel": "lens", "FNumber": "aperture",
    "ExposureTime": "shutter", "ISOSpeedRatings": "iso", "FocalLength": "focal_length",
    "DateTimeOriginal": "date_time_original",
}
SUPPORTED = {"image/jpeg", "image/png", "image/webp", "image/tiff"}


def _jsonable(v):
    if isinstance(v, bytes):
        return v.decode(errors="ignore")
    if isinstance(v, tuple):
        return [_jsonable(x) for x in v]
    try:
        return float(v) if not isinstance(v, (int, float, str)) else v
    except (TypeError, ValueError):
        return str(v)


def read_exif(img: Image.Image) -> tuple[dict, datetime | None]:
    exif = img.getexif()
    merged = {**exif, **exif.get_ifd(0x8769)}  # base + Exif IFD
    out: dict = {}
    for tag_id, value in merged.items():
        name = ExifTags.TAGS.get(tag_id)
        if name in EXIF_KEYS:
            out[EXIF_KEYS[name]] = _jsonable(value)
    captured = None
    raw = out.get("date_time_original")
    if isinstance(raw, str):
        try:
            captured = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return out, captured


def open_image(data: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(data))
    img.load()
    return img


def normalize(img: Image.Image) -> Image.Image:
    """Apply EXIF orientation and convert to RGB."""
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def make_derivative(img: Image.Image, size: int, quality: int = 85) -> bytes:
    copy = img.copy()
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    copy.save(buf, "JPEG", quality=quality)
    return buf.getvalue()
