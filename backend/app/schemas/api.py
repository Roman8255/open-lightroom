from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


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
    created_at: datetime
    has_edits: bool = False


class PhotoPatch(BaseModel):
    rating: int | None = Field(None, ge=0, le=5)
    flag: int | None = Field(None, ge=-1, le=1)
    color_label: str | None = Field(None, pattern="^(red|yellow|green|blue|purple|none)$")
