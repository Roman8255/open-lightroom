import io
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import get_current_user
from app.models import EditHistory, EditSettings, Photo, User
from app.schemas.api import PhotoOut, PhotoPatch
from app.schemas.edit import EditOut, EditParams, ExportRequest, HistoryCreate, HistoryOut
from app.services import images, storage
from app.services.render import render

router = APIRouter(prefix="/photos", tags=["photos"])


def _out(photo: Photo) -> PhotoOut:
    out = PhotoOut.model_validate(photo)
    out.has_edits = photo.edit is not None and bool(photo.edit.params)
    return out


def _get_photo(db: Session, user: User, photo_id: int) -> Photo:
    photo = db.get(Photo, photo_id)
    if photo is None or photo.user_id != user.id:
        raise HTTPException(404, "Photo not found")
    return photo


@router.post("", response_model=list[PhotoOut], status_code=201)
async def upload(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    created: list[Photo] = []
    for f in files:
        data = await f.read()
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"{f.filename}: file too large")
        try:
            raw = images.open_image(data)
        except (UnidentifiedImageError, OSError):
            raise HTTPException(415, f"{f.filename}: unsupported image") from None
        exif, captured = images.read_exif(raw)
        img = images.normalize(raw)
        photo = Photo(
            user_id=user.id, filename=f.filename or "photo",
            mime_type=Image.MIME.get(raw.format, "image/jpeg"), size_bytes=len(data),
            width=img.width, height=img.height, exif=exif, captured_at=captured,
        )
        db.add(photo)
        db.flush()
        for kind, payload in (
            ("original", data),
            ("preview", images.make_derivative(img, images.PREVIEW_SIZE, 88)),
            ("thumb", images.make_derivative(img, images.THUMB_SIZE, 80)),
        ):
            path = storage.photo_path(user.id, photo.id, kind)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
        created.append(photo)
    db.commit()
    return [_out(p) for p in created]


@router.get("", response_model=list[PhotoOut])
def list_photos(
    rating_min: int = 0,
    flag: Literal[-1, 0, 1] | None = None,
    color_label: str | None = None,
    sort: Literal["captured_at", "created_at", "rating", "filename"] = "captured_at",
    order: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Photo).where(Photo.user_id == user.id, Photo.rating >= rating_min)
    if flag is not None:
        q = q.where(Photo.flag == flag)
    if color_label:
        q = q.where(Photo.color_label == color_label)
    col = getattr(Photo, sort)
    q = q.order_by(col.desc().nulls_last() if order == "desc" else col.asc().nulls_last(), Photo.id)
    return [_out(p) for p in db.scalars(q)]


@router.get("/{photo_id}", response_model=PhotoOut)
def get_photo(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _out(_get_photo(db, user, photo_id))


@router.patch("/{photo_id}", response_model=PhotoOut)
def patch_photo(
    photo_id: int, body: PhotoPatch,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    photo = _get_photo(db, user, photo_id)
    data = body.model_dump(exclude_unset=True)
    if "color_label" in data and data["color_label"] == "none":
        data["color_label"] = None
    for k, v in data.items():
        setattr(photo, k, v)
    db.commit()
    return _out(photo)


@router.delete("/{photo_id}", status_code=204)
def delete_photo(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    photo = _get_photo(db, user, photo_id)
    db.delete(photo)
    db.commit()
    storage.delete_photo_files(user.id, photo_id)


@router.get("/{photo_id}/file/{kind}")
def get_file(
    photo_id: int, kind: Literal["thumb", "preview", "original"],
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    photo = _get_photo(db, user, photo_id)
    path = storage.photo_path(user.id, photo_id, kind)
    if not path.exists():
        raise HTTPException(404, "File missing")
    media = photo.mime_type if kind == "original" else "image/jpeg"
    return FileResponse(path, media_type=media, headers={"Cache-Control": "private, max-age=3600"})


@router.get("/{photo_id}/edit", response_model=EditOut)
def get_edit(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    photo = _get_photo(db, user, photo_id)
    return EditOut(params=EditParams(**(photo.edit.params if photo.edit else {})))


@router.put("/{photo_id}/edit", response_model=EditOut)
def put_edit(
    photo_id: int, body: EditParams,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    photo = _get_photo(db, user, photo_id)
    params = body.model_dump()
    if photo.edit is None:
        photo.edit = EditSettings(params=params)
    else:
        photo.edit.params = params
    db.commit()
    return EditOut(params=body)


@router.get("/{photo_id}/history", response_model=list[HistoryOut])
def list_history(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _get_photo(db, user, photo_id)
    rows = db.scalars(
        select(EditHistory).where(EditHistory.photo_id == photo_id).order_by(EditHistory.id.desc())
    )
    return [
        HistoryOut(id=r.id, label=r.label, params=EditParams(**r.params), created_at=r.created_at.isoformat())
        for r in rows
    ]


@router.post("/{photo_id}/history", response_model=HistoryOut, status_code=201)
def add_history(
    photo_id: int, body: HistoryCreate,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    photo = _get_photo(db, user, photo_id)
    params = EditParams(**(photo.edit.params if photo.edit else {}))
    row = EditHistory(photo_id=photo_id, label=body.label, params=params.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return HistoryOut(id=row.id, label=row.label, params=params, created_at=row.created_at.isoformat())


@router.post("/{photo_id}/export")
def export(
    photo_id: int, body: ExportRequest,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    photo = _get_photo(db, user, photo_id)
    path = storage.photo_path(user.id, photo_id, "original")
    img = images.normalize(images.open_image(path.read_bytes()))
    if body.max_size:
        img.thumbnail((body.max_size, body.max_size), Image.Resampling.LANCZOS)
    out = render(img, EditParams(**(photo.edit.params if photo.edit else {})), seed=photo_id)
    buf = io.BytesIO()
    if body.format == "png":
        out.save(buf, "PNG")
    else:
        out.save(buf, "JPEG", quality=body.quality)
    stem = photo.filename.rsplit(".", 1)[0]
    ext = "png" if body.format == "png" else "jpg"
    return Response(
        buf.getvalue(), media_type=f"image/{body.format}",
        headers={"Content-Disposition": f'attachment; filename="{stem}-edit.{ext}"'},
    )
