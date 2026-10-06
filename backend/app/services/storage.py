from pathlib import Path

from app.core.config import settings

KINDS = ("original", "preview", "thumb")


def photo_path(user_id: int, photo_id: int, kind: str) -> Path:
    ext = "bin" if kind == "original" else "jpg"
    return settings.storage_dir / str(user_id) / str(photo_id) / f"{kind}.{ext}"


def delete_photo_files(user_id: int, photo_id: int) -> None:
    folder = settings.storage_dir / str(user_id) / str(photo_id)
    for p in folder.glob("*"):
        p.unlink(missing_ok=True)
    folder.rmdir() if folder.exists() else None
