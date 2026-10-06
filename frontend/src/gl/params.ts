// Keep in sync with backend/app/schemas/edit.py and docs/edit-params.md
export const HSL_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
export type HslBandName = (typeof HSL_BANDS)[number];
export interface HslBand { hue: number; sat: number; lum: number }
export interface GradeZone { hue: number; sat: number; lum: number }
export interface Grading { shadows: GradeZone; midtones: GradeZone; highlights: GradeZone; blending: number; balance: number }
export interface Calibration {
  shadow_tint: number; red_hue: number; red_sat: number; green_hue: number; green_sat: number; blue_hue: number; blue_sat: number;
}
export interface Crop { x: number; y: number; w: number; h: number; angle: number }
export interface Spot { x: number; y: number; r: number; sx: number; sy: number; mode: "clone" | "heal"; feather: number; opacity: number }
export interface RedEye { x: number; y: number; r: number; amount: number }
export interface MaskAdj { exposure: number; contrast: number; highlights: number; shadows: number; temperature: number; tint: number; saturation: number }
export interface BrushStroke { size: number; feather: number; erase: boolean; points: [number, number][] }
export interface Mask {
  type: "linear" | "radial" | "brush"; enabled: boolean; invert: boolean;
  x1: number; y1: number; x2: number; y2: number;
  cx: number; cy: number; rx: number; ry: number; feather: number;
  strokes: BrushStroke[]; adj: MaskAdj;
}
export type Curve = [number, number][];

export interface EditParams {
  bw: boolean;
  temperature: number; tint: number;
  exposure: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number;
  texture: number; clarity: number; dehaze: number; vibrance: number; saturation: number;
  curve: Curve; curve_r: Curve; curve_g: Curve; curve_b: Curve;
  hsl: Record<HslBandName, HslBand>;
  grade: Grading;
  sharpening: number; sharpen_radius: number; noise_reduction: number;
  distortion: number; lens_vignette: number;
  vertical: number; horizontal: number; rotate: number; scale: number; aspect: number;
  crop: Crop;
  vignette: number; grain: number;
  cal: Calibration;
  spots: Spot[]; red_eyes: RedEye[]; masks: Mask[];
}

export type NumericKey = { [K in keyof EditParams]: EditParams[K] extends number ? K : never }[keyof EditParams];

export const MAX_MASKS = 4;
export const MAX_SPOTS = 32;
export const MAX_EYES = 16;

const zone = (): GradeZone => ({ hue: 0, sat: 0, lum: 0 });
const idCurve = (): Curve => [[0, 0], [1, 1]];

export const defaultMaskAdj = (): MaskAdj => ({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0 });

export const newMask = (type: Mask["type"], geo: Partial<Mask> = {}): Mask => ({
  type, enabled: true, invert: false, x1: 0.5, y1: 0.3, x2: 0.5, y2: 0.7, cx: 0.5, cy: 0.5, rx: 0.25, ry: 0.25,
  feather: 50, strokes: [], adj: defaultMaskAdj(), ...geo,
});

export const defaultParams = (): EditParams => ({
  bw: false,
  temperature: 0, tint: 0,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
  curve: idCurve(), curve_r: idCurve(), curve_g: idCurve(), curve_b: idCurve(),
  hsl: Object.fromEntries(HSL_BANDS.map((b) => [b, { hue: 0, sat: 0, lum: 0 }])) as Record<HslBandName, HslBand>,
  grade: { shadows: zone(), midtones: zone(), highlights: zone(), blending: 50, balance: 0 },
  sharpening: 0, sharpen_radius: 1, noise_reduction: 0,
  distortion: 0, lens_vignette: 0,
  vertical: 0, horizontal: 0, rotate: 0, scale: 100, aspect: 0,
  crop: { x: 0, y: 0, w: 1, h: 1, angle: 0 },
  vignette: 0, grain: 0,
  cal: { shadow_tint: 0, red_hue: 0, red_sat: 0, green_hue: 0, green_sat: 0, blue_hue: 0, blue_sat: 0 },
  spots: [], red_eyes: [], masks: [],
});

export const isDefault = (p: EditParams): boolean => JSON.stringify(p) === JSON.stringify(defaultParams());
export const withDefaults = (p: Partial<EditParams>): EditParams => ({ ...defaultParams(), ...p });
export const clone = <T,>(v: T): T => structuredClone(v);

/** Keys that make up a "look" (what presets store/apply). Geometry, crop and local edits are never part of a preset. */
export const LOOK_KEYS: (keyof EditParams)[] = [
  "bw", "temperature", "tint", "exposure", "contrast", "highlights", "shadows", "whites", "blacks", "texture", "clarity", "dehaze",
  "vibrance", "saturation", "curve", "curve_r", "curve_g", "curve_b", "hsl", "grade", "sharpening", "sharpen_radius",
  "noise_reduction", "vignette", "grain", "cal", "lens_vignette",
];

export const isGeometryDefault = (p: EditParams): boolean =>
  p.distortion === 0 && p.vertical === 0 && p.horizontal === 0 && p.rotate === 0 && p.scale === 100 && p.aspect === 0 &&
  p.crop.angle === 0;
export const isIdentityGeometry = (p: EditParams, ignoreCrop = false): boolean =>
  isGeometryDefault(p) && (ignoreCrop || (p.crop.x === 0 && p.crop.y === 0 && p.crop.w === 1 && p.crop.h === 1));

export const isIdentityCurve = (c: Curve): boolean => c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1;

// ── color helpers shared with the shader uniforms (mirror backend render.py) ──
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.min(Math.max(Math.min(k, 4 - k), 0), 1);
  };
  return [f(5), f(3), f(1)];
}

/** Column-major 3x3 for GL: columns are the rotated/desaturated R, G, B primaries. */
export function calMatrix(cal: Calibration): Float32Array {
  const prim = (base: number, hue: number, sat: number) => {
    const v = hsvToRgb((((base + (hue / 100) * 30) % 360) + 360) % 360, 1, 1);
    const l = v[0] * LUMA[0] + v[1] * LUMA[1] + v[2] * LUMA[2];
    return v.map((x) => l + (x - l) * (1 + sat / 100));
  };
  return new Float32Array([...prim(0, cal.red_hue, cal.red_sat), ...prim(120, cal.green_hue, cal.green_sat), ...prim(240, cal.blue_hue, cal.blue_sat)]);
}
export const isCalDefault = (c: Calibration) => Object.values(c).every((v) => v === 0);

/** Tint vector of a grading zone: (rgb(hue) - luma) * sat. */
export function zoneTint(z: GradeZone): [number, number, number] {
  const rgb = hsvToRgb(z.hue, 1, 1);
  const l = rgb[0] * LUMA[0] + rgb[1] * LUMA[1] + rgb[2] * LUMA[2];
  return [(rgb[0] - l) * (z.sat / 100), (rgb[1] - l) * (z.sat / 100), (rgb[2] - l) * (z.sat / 100)];
}
export const isGradeActive = (g: Grading) => [g.shadows, g.midtones, g.highlights].some((z) => z.sat !== 0 || z.lum !== 0);
