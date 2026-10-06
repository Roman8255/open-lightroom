"""Edit parameter spec. Keep in sync with frontend/src/gl/params.ts and docs/edit-params.md."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

HSL_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]
Pct = Field(0, ge=-100, le=100)


class HslBand(BaseModel):
    hue: float = Pct
    sat: float = Pct
    lum: float = Pct


class GradeZone(BaseModel):
    hue: float = Field(0, ge=0, le=360)
    sat: float = Field(0, ge=0, le=100)
    lum: float = Pct


class Grading(BaseModel):
    shadows: GradeZone = Field(default_factory=GradeZone)
    midtones: GradeZone = Field(default_factory=GradeZone)
    highlights: GradeZone = Field(default_factory=GradeZone)
    blending: float = Field(50, ge=0, le=100)
    balance: float = Pct


class Calibration(BaseModel):
    shadow_tint: float = Pct
    red_hue: float = Pct
    red_sat: float = Pct
    green_hue: float = Pct
    green_sat: float = Pct
    blue_hue: float = Pct
    blue_sat: float = Pct


class Crop(BaseModel):
    x: float = Field(0, ge=0, le=1)
    y: float = Field(0, ge=0, le=1)
    w: float = Field(1, ge=0.02, le=1)
    h: float = Field(1, ge=0.02, le=1)
    angle: float = Field(0, ge=-45, le=45)

    @model_validator(mode="after")
    def _inside(self) -> "Crop":
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("crop must lie inside the image")
        return self


class Spot(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    r: float = Field(0.04, ge=0.003, le=0.3)  # radius in image-height units
    sx: float = Field(0.5, ge=0, le=1)
    sy: float = Field(0.5, ge=0, le=1)
    mode: Literal["clone", "heal"] = "heal"
    feather: float = Field(0.5, ge=0, le=1)
    opacity: float = Field(1, ge=0, le=1)


class RedEye(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    r: float = Field(0.02, ge=0.003, le=0.1)
    amount: float = Field(0.8, ge=0, le=1)


class MaskAdj(BaseModel):
    exposure: float = Field(0, ge=-5, le=5)
    contrast: float = Pct
    highlights: float = Pct
    shadows: float = Pct
    temperature: float = Pct
    tint: float = Pct
    saturation: float = Pct


class BrushStroke(BaseModel):
    size: float = Field(0.05, ge=0.003, le=0.3)
    feather: float = Field(0.5, ge=0, le=1)
    erase: bool = False
    points: list[list[float]] = Field(max_length=1500)

    @field_validator("points")
    @classmethod
    def _pts(cls, v: list[list[float]]) -> list[list[float]]:
        if any(len(p) != 2 for p in v):
            raise ValueError("points must be [x, y]")
        return [[min(1.0, max(0.0, x)), min(1.0, max(0.0, y))] for x, y in v]


class Mask(BaseModel):
    type: Literal["linear", "radial", "brush"]
    enabled: bool = True
    invert: bool = False
    # linear: full effect at (x1,y1) fading to none at (x2,y2)
    x1: float = Field(0.5, ge=0, le=1)
    y1: float = Field(0.3, ge=0, le=1)
    x2: float = Field(0.5, ge=0, le=1)
    y2: float = Field(0.7, ge=0, le=1)
    # radial ellipse (normalised units)
    cx: float = Field(0.5, ge=0, le=1)
    cy: float = Field(0.5, ge=0, le=1)
    rx: float = Field(0.25, ge=0.01, le=1)
    ry: float = Field(0.25, ge=0.01, le=1)
    feather: float = Field(50, ge=0, le=100)
    strokes: list[BrushStroke] = Field(default_factory=list, max_length=60)
    adj: MaskAdj = Field(default_factory=MaskAdj)


def _default_curve() -> list[list[float]]:
    return [[0.0, 0.0], [1.0, 1.0]]


def _clean_curve(v: list[list[float]]) -> list[list[float]]:
    if len(v) < 2 or len(v) > 32 or any(len(p) != 2 for p in v):
        raise ValueError("curve must have 2..32 [x, y] points")
    pts = sorted(([min(1.0, max(0.0, x)), min(1.0, max(0.0, y))] for x, y in v))
    xs = [p[0] for p in pts]
    if len(set(xs)) != len(xs):
        raise ValueError("curve x values must be unique")
    return pts


class EditParams(BaseModel):
    bw: bool = False
    # Basic
    temperature: float = Pct
    tint: float = Pct
    exposure: float = Field(0, ge=-5, le=5)
    contrast: float = Pct
    highlights: float = Pct
    shadows: float = Pct
    whites: float = Pct
    blacks: float = Pct
    texture: float = Pct
    clarity: float = Pct
    dehaze: float = Pct
    vibrance: float = Pct
    saturation: float = Pct
    # Tone curves (points in 0..1)
    curve: list[list[float]] = Field(default_factory=_default_curve)
    curve_r: list[list[float]] = Field(default_factory=_default_curve)
    curve_g: list[list[float]] = Field(default_factory=_default_curve)
    curve_b: list[list[float]] = Field(default_factory=_default_curve)
    hsl: dict[str, HslBand] = Field(default_factory=lambda: {b: HslBand() for b in HSL_BANDS})
    grade: Grading = Field(default_factory=Grading)
    # Detail
    sharpening: float = Field(0, ge=0, le=150)
    sharpen_radius: float = Field(1.0, ge=0.5, le=3)
    noise_reduction: float = Field(0, ge=0, le=100)
    # Lens corrections / transform
    distortion: float = Pct
    lens_vignette: float = Pct
    vertical: float = Pct
    horizontal: float = Pct
    rotate: float = Field(0, ge=-45, le=45)
    scale: float = Field(100, ge=50, le=150)
    aspect: float = Pct
    crop: Crop = Field(default_factory=Crop)
    # Effects
    vignette: float = Pct
    grain: float = Field(0, ge=0, le=100)
    cal: Calibration = Field(default_factory=Calibration)
    # Local corrections
    spots: list[Spot] = Field(default_factory=list, max_length=32)
    red_eyes: list[RedEye] = Field(default_factory=list, max_length=16)
    masks: list[Mask] = Field(default_factory=list, max_length=4)

    @field_validator("curve", "curve_r", "curve_g", "curve_b")
    @classmethod
    def _valid_curve(cls, v: list[list[float]]) -> list[list[float]]:
        return _clean_curve(v)

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


class ResizeSpec(BaseModel):
    mode: Literal["none", "width_height", "long", "short", "megapixels", "percent"] = "none"
    width: int | None = Field(None, ge=1, le=30000)
    height: int | None = Field(None, ge=1, le=30000)
    long_edge: int | None = Field(None, ge=1, le=30000)
    short_edge: int | None = Field(None, ge=1, le=30000)
    megapixels: float | None = Field(None, gt=0, le=500)
    percent: float | None = Field(None, gt=0, le=500)
    no_enlarge: bool = True


class OutputSharpen(BaseModel):
    target: Literal["none", "screen", "matte", "glossy"] = "none"
    amount: Literal["low", "standard", "high"] = "standard"


class Watermark(BaseModel):
    text: str = Field(min_length=1, max_length=120)
    size_pct: float = Field(4, ge=1, le=30)  # text height in % of the image's short edge
    opacity: float = Field(60, ge=5, le=100)
    position: Literal["tl", "tr", "bl", "br", "center"] = "br"


class ExportRequest(BaseModel):
    format: Literal["jpeg", "png", "tiff", "webp"] = "jpeg"
    quality: int = Field(90, ge=1, le=100)
    limit_kb: int | None = Field(None, ge=10, le=200000)  # JPEG / WebP only
    resize: ResizeSpec = Field(default_factory=ResizeSpec)
    max_size: int | None = Field(None, ge=16, le=20000)  # legacy: long edge in px
    ppi: int = Field(300, ge=72, le=1200)
    sharpen: OutputSharpen = Field(default_factory=OutputSharpen)
    metadata: Literal["all", "copyright", "none"] = "all"
    remove_location: bool = False
    copyright: str | None = Field(None, max_length=200)
    watermark: Watermark | None = None


class ExportNaming(BaseModel):
    template: Literal["filename", "custom", "custom_seq", "filename_seq", "date_filename", "custom_xofy"] = "filename"
    custom_text: str = Field("", max_length=100)
    start_number: int = Field(1, ge=0, le=999999)


class ExportBatch(BaseModel):
    photo_ids: list[int] = Field(min_length=1, max_length=500)
    settings: ExportRequest = Field(default_factory=ExportRequest)
    naming: ExportNaming = Field(default_factory=ExportNaming)
