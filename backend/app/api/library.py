"""Collections, keywords, folders, comments, user presets and publishing (ZIP export)."""
import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models import (
    Collection,
    CollectionPhoto,
    Keyword,
    Photo,
    PhotoComment,
    User,
    UserPreset,
    photo_keywords,
)
from app.schemas.api import (
    CommentBody,
    CommentOut,
    CountedName,
    KeywordApply,
    NameBody,
    PhotoIds,
    PresetOut,
)
from app.schemas.edit import EditParams, ExportRequest
from app.services.exporter import render_export

router = APIRouter(tags=["library"])


def _own_photo_ids(db: Session, user: User, ids: list[int]) -> list[int]:
    return list(db.scalars(select(Photo.id).where(Photo.user_id == user.id, Photo.id.in_(ids))))


def _collection(db: Session, user: User, cid: int) -> Collection:
    c = db.get(Collection, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Collection not found")
    return c


# ── folders ──
@router.get("/folders", response_model=list[CountedName])
def folders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Photo.folder, func.count()).where(Photo.user_id == user.id).group_by(Photo.folder).order_by(Photo.folder)
    )
    return [CountedName(name=n, count=c) for n, c in rows]


# ── collections ──
@router.get("/collections", response_model=list[CountedName])
def list_collections(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Collection.id, Collection.name, func.count(CollectionPhoto.photo_id))
        .outerjoin(CollectionPhoto, CollectionPhoto.collection_id == Collection.id)
        .where(Collection.user_id == user.id)
        .group_by(Collection.id)
        .order_by(Collection.name)
    )
    return [CountedName(id=i, name=n, count=c) for i, n, c in rows]


@router.post("/collections", response_model=CountedName, status_code=201)
def create_collection(body: NameBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    name = body.name.strip()
    if db.scalar(select(Collection.id).where(Collection.user_id == user.id, Collection.name == name)):
        raise HTTPException(409, "A collection with this name already exists")
    c = Collection(user_id=user.id, name=name)
    db.add(c)
    db.commit()
    return CountedName(id=c.id, name=c.name, count=0)


@router.patch("/collections/{cid}", response_model=CountedName)
def rename_collection(cid: int, body: NameBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = _collection(db, user, cid)
    c.name = body.name.strip()
    db.commit()
    n = db.scalar(select(func.count()).select_from(CollectionPhoto).where(CollectionPhoto.collection_id == cid))
    return CountedName(id=c.id, name=c.name, count=n or 0)


@router.delete("/collections/{cid}", status_code=204)
def delete_collection(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.delete(_collection(db, user, cid))
    db.commit()


@router.post("/collections/{cid}/photos", status_code=204)
def add_to_collection(cid: int, body: PhotoIds, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _collection(db, user, cid)
    ids = _own_photo_ids(db, user, body.photo_ids)
    if ids:
        db.execute(
            pg_insert(CollectionPhoto).values([{"collection_id": cid, "photo_id": i} for i in ids]).on_conflict_do_nothing()
        )
    db.commit()


@router.post("/collections/{cid}/photos/remove", status_code=204)
def remove_from_collection(cid: int, body: PhotoIds, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _collection(db, user, cid)
    db.execute(delete(CollectionPhoto).where(CollectionPhoto.collection_id == cid, CollectionPhoto.photo_id.in_(body.photo_ids)))
    db.commit()


@router.post("/collections/{cid}/export")
def publish_collection(cid: int, body: ExportRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Publish Services: render every photo of the collection with the given settings into a ZIP."""
    c = _collection(db, user, cid)
    photos = list(
        db.scalars(
            select(Photo).join(CollectionPhoto, CollectionPhoto.photo_id == Photo.id)
            .where(CollectionPhoto.collection_id == cid).order_by(Photo.id)
        )
    )
    if not photos:
        raise HTTPException(400, "Collection is empty")
    if len(photos) > 200:
        raise HTTPException(400, "Too many photos for a single publish (max 200)")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for n, ph in enumerate(photos, 1):
            data, _, ext = render_export(ph, body)
            zf.writestr(f"{n:03d}-{ph.filename.rsplit('.', 1)[0]}.{ext}", data)
    safe = "".join(ch if ch.isalnum() or ch in "-_ " else "_" for ch in c.name)
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{safe}.zip"'})


# ── keywords ──
@router.get("/keywords", response_model=list[CountedName])
def list_keywords(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Keyword.id, Keyword.name, func.count(photo_keywords.c.photo_id))
        .outerjoin(photo_keywords, photo_keywords.c.keyword_id == Keyword.id)
        .where(Keyword.user_id == user.id)
        .group_by(Keyword.id)
        .order_by(Keyword.name)
    )
    return [CountedName(id=i, name=n, count=c) for i, n, c in rows]


@router.post("/keywords/apply", status_code=204)
def apply_keywords(body: KeywordApply, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ids = _own_photo_ids(db, user, body.photo_ids)
    for raw in body.add:
        name = raw.strip().lower()[:100]
        if not name:
            continue
        kw = db.scalar(select(Keyword).where(Keyword.user_id == user.id, Keyword.name == name))
        if kw is None:
            kw = Keyword(user_id=user.id, name=name)
            db.add(kw)
            db.flush()
        if ids:
            db.execute(
                pg_insert(photo_keywords).values([{"photo_id": i, "keyword_id": kw.id} for i in ids]).on_conflict_do_nothing()
            )
    for raw in body.remove:
        kw = db.scalar(select(Keyword).where(Keyword.user_id == user.id, Keyword.name == raw.strip().lower()))
        if kw:
            db.execute(delete(photo_keywords).where(photo_keywords.c.keyword_id == kw.id, photo_keywords.c.photo_id.in_(ids)))
    db.commit()


@router.delete("/keywords/{kid}", status_code=204)
def delete_keyword(kid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    kw = db.get(Keyword, kid)
    if kw is None or kw.user_id != user.id:
        raise HTTPException(404, "Keyword not found")
    db.delete(kw)
    db.commit()


# ── comments ──
def _photo(db: Session, user: User, pid: int) -> Photo:
    p = db.get(Photo, pid)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Photo not found")
    return p


@router.get("/photos/{pid}/comments", response_model=list[CommentOut])
def list_comments(pid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _photo(db, user, pid)
    return list(db.scalars(select(PhotoComment).where(PhotoComment.photo_id == pid).order_by(PhotoComment.id)))


@router.post("/photos/{pid}/comments", response_model=CommentOut, status_code=201)
def add_comment(pid: int, body: CommentBody, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _photo(db, user, pid)
    c = PhotoComment(photo_id=pid, user_id=user.id, text=body.text.strip())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/comments/{cid}", status_code=204)
def delete_comment(cid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.get(PhotoComment, cid)
    if c is None or c.user_id != user.id:
        raise HTTPException(404, "Comment not found")
    db.delete(c)
    db.commit()


# ── user presets ──
@router.get("/presets", response_model=list[PresetOut])
def list_presets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return list(db.scalars(select(UserPreset).where(UserPreset.user_id == user.id).order_by(UserPreset.name)))


@router.put("/presets/{name}", response_model=PresetOut)
def save_preset(name: str, params: EditParams, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    name = name.strip()[:120]
    if not name:
        raise HTTPException(422, "Name required")
    row = db.scalar(select(UserPreset).where(UserPreset.user_id == user.id, UserPreset.name == name))
    if row is None:
        row = UserPreset(user_id=user.id, name=name, params=params.model_dump())
        db.add(row)
    else:
        row.params = params.model_dump()
    db.commit()
    return row


@router.delete("/presets/{pid}", status_code=204)
def delete_preset(pid: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    row = db.get(UserPreset, pid)
    if row is None or row.user_id != user.id:
        raise HTTPException(404, "Preset not found")
    db.delete(row)
    db.commit()
