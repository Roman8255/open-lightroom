import io

from PIL import Image

from app.models import Photo
from app.schemas.edit import EditParams, ExportRequest
from app.services import images, storage
from app.services.render import render


def render_export(photo: Photo, req: ExportRequest) -> tuple[bytes, str, str]:
    """Returns (bytes, media_type, extension)."""
    path = storage.photo_path(photo.user_id, photo.id, "original")
    img = images.normalize(images.open_image(path.read_bytes()))
    params = EditParams(**(photo.edit.params if photo.edit else {}))
    if req.max_size:
        crop_long = max(img.width * params.crop.w, img.height * params.crop.h)
        k = req.max_size / crop_long
        if k < 1:
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.Resampling.LANCZOS)
    out = render(img, params, seed=photo.id)
    buf = io.BytesIO()
    if req.format == "png":
        out.save(buf, "PNG")
        return buf.getvalue(), "image/png", "png"
    out.save(buf, "JPEG", quality=req.quality)
    return buf.getvalue(), "image/jpeg", "jpg"
