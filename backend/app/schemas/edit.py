"""Edit parameter spec. Keep in sync with frontend/src/gl/params.ts and docs/edit-params.md."""
from pydantic import BaseModel, Field, field_validator

HSL_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]


class HslBand(BaseModel):
    hue: float = Field(0, ge=-100, le=100)
    sat: float = Field(0, ge=-100, le=100)
    lum: float = Field(0, ge=-100, le=100)


def _default_curve() -> list[list[float]]:
    return [[0.0, 0.0], [1.0, 1.0]]


class EditParams(BaseModel):
    # Basic – white balance
    temperature: float = Field(0, ge=-100, le=100)
    tint: float = Field(0, ge=-100, le=100)
    # Basic – tone
    exposure: float = Field(0, ge=-5, le=5)
    contrast: float = Field(0, ge=-100, le=100)
    highlights: float = Field(0, ge=-100, le=100)
    shadows: float = Field(0, ge=-100, le=100)
    whites: float = Field(0, ge=-100, le=100)
    blacks: float = Field(0, ge=-100, le=100)
    # Basic – presence
    clarity: float = Field(0, ge=-100, le=100)
    vibrance: float = Field(0, ge=-100, le=100)
    saturation: float = Field(0, ge=-100, le=100)
    # Tone curve (master, points in 0..1)
    curve: list[list[float]] = Field(default_factory=_default_curve)
    # HSL
    hsl: dict[str, HslBand] = Field(default_factory=lambda: {b: HslBand() for b in HSL_BANDS})
    # Detail
    sharpening: float = Field(0, ge=0, le=150)
    # Effects
    vignette: float = Field(0, ge=-100, le=100)
    grain: float = Field(0, ge=0, le=100)

    @field_validator("curve")
    @classmethod
    def _valid_curve(cls, v: list[list[float]]) -> list[list[float]]:
        if len(v) < 2 or len(v) > 32 or any(len(p) != 2 for p in v):
            raise ValueError("curve must have 2..32 [x, y] points")
        pts = sorted(([min(1.0, max(0.0, x)), min(1.0, max(0.0, y))] for x, y in v))
        xs = [p[0] for p in pts]
        if len(set(xs)) != len(xs):
            raise ValueError("curve x values must be unique")
        return pts

    @field_validator("hsl")
    @classmethod
    def _valid_hsl(cls, v: dict[str, HslBand]) -> dict[str, HslBand]:
        out = {b: HslBand() for b in HSL_BANDS}
        for k, band in v.items():
            if k not in out:
                raise ValueError(f"unknown hsl band {k}")
            out[k] = band
        return out


class EditOut(BaseModel):
    params: EditParams


class HistoryCreate(BaseModel):
    label: str = Field(max_length=128)


class HistoryOut(BaseModel):
    id: int
    label: str
    params: EditParams
    created_at: str


class ExportRequest(BaseModel):
    format: str = Field("jpeg", pattern="^(jpeg|png)$")
    quality: int = Field(90, ge=1, le=100)
    max_size: int | None = Field(None, ge=16, le=20000)  # long edge in px
