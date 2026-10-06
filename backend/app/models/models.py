from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, SmallInteger, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (Index("ix_photos_user_captured", "user_id", "captured_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int]
    width: Mapped[int]
    height: Mapped[int]
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exif: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    rating: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    flag: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")  # -1 reject, 1 pick
    color_label: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    edit: Mapped["EditSettings | None"] = relationship(
        back_populates="photo", cascade="all, delete-orphan", uselist=False
    )


class EditSettings(Base):
    __tablename__ = "edit_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(
        ForeignKey("photos.id", ondelete="CASCADE"), unique=True
    )
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    photo: Mapped[Photo] = relationship(back_populates="edit")


class EditHistory(Base):
    __tablename__ = "edit_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(128))
    params: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
