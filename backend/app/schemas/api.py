from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=255, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginBody(BaseModel):
    """Login does not enforce the registration password policy (seeded/dev accounts may differ)."""
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str


class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str
    mime_type: str
    size_bytes: int
    width: int
    height: int
    captured_at: datetime | None
    exif: dict
    rating: int
    flag: int
    color_label: str | None
    folder: str = "Uploads"
    title: str | None = None
    caption: str | None = None
    keywords: list[str] = Field(default_factory=list)
    created_at: datetime
    has_edits: bool = False

    @field_validator("keywords", mode="before")
    @classmethod
    def _keyword_names(cls, v):
        return sorted(getattr(k, "name", k) for k in v)


class PhotoPatch(BaseModel):
    rating: int | None = Field(None, ge=0, le=5)
    flag: int | None = Field(None, ge=-1, le=1)
    color_label: str | None = Field(None, pattern="^(red|yellow|green|blue|purple|none)$")
    title: str | None = Field(None, max_length=255)
    caption: str | None = Field(None, max_length=5000)


class NameBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class PhotoIds(BaseModel):
    photo_ids: list[int] = Field(min_length=1, max_length=2000)


class KeywordApply(BaseModel):
    photo_ids: list[int] = Field(min_length=1, max_length=2000)
    add: list[str] = Field(default_factory=list, max_length=50)
    remove: list[str] = Field(default_factory=list, max_length=50)


class CommentBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    text: str
    created_at: datetime


class CountedName(BaseModel):
    id: int | None = None
    name: str
    count: int


class PresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    params: dict
