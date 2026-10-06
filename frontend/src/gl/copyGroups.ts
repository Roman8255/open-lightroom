import type { EditParams } from "./params";
import { clone } from "./params";

export interface CopyItem { id: string; label: string; keys: (keyof EditParams)[]; off?: boolean }
export interface CopySection { id: string; label: string; items: CopyItem[] }

/** Mirrors Lightroom's "Copy Settings" dialog. Crop, spot removal and red eye are unchecked by default (like LR). */
export const COPY_SECTIONS: CopySection[] = [
  { id: "wb", label: "White Balance", items: [{ id: "wb", label: "White Balance", keys: ["temperature", "tint"] }] },
  { id: "tone", label: "Basic Tone", items: [
    { id: "exposure", label: "Exposure", keys: ["exposure"] }, { id: "contrast", label: "Contrast", keys: ["contrast"] },
    { id: "highlights", label: "Highlights", keys: ["highlights"] }, { id: "shadows", label: "Shadows", keys: ["shadows"] },
    { id: "whites", label: "Whites", keys: ["whites"] }, { id: "blacks", label: "Blacks", keys: ["blacks"] },
  ] },
  { id: "presence", label: "Presence", items: [
    { id: "texture", label: "Texture", keys: ["texture"] }, { id: "clarity", label: "Clarity", keys: ["clarity"] },
    { id: "dehaze", label: "Dehaze", keys: ["dehaze"] }, { id: "vibrance", label: "Vibrance", keys: ["vibrance"] },
    { id: "saturation", label: "Saturation", keys: ["saturation"] },
  ] },
  { id: "curve", label: "Tone Curve", items: [{ id: "curve", label: "Tone Curve (RGB + channels)", keys: ["curve", "curve_r", "curve_g", "curve_b"] }] },
  { id: "color", label: "Color", items: [
    { id: "bw", label: "Treatment (Color / B&W)", keys: ["bw"] }, { id: "hsl", label: "Color Mixer (HSL)", keys: ["hsl"] },
    { id: "grade", label: "Color Grading", keys: ["grade"] },
  ] },
  { id: "detail", label: "Detail", items: [
    { id: "sharpening", label: "Sharpening", keys: ["sharpening", "sharpen_radius"] },
    { id: "nr", label: "Noise Reduction", keys: ["noise_reduction"] },
  ] },
  { id: "lens", label: "Lens Corrections", items: [{ id: "lens", label: "Distortion & Vignetting", keys: ["distortion", "lens_vignette"] }] },
  { id: "transform", label: "Transform", items: [{ id: "transform", label: "Transform", keys: ["vertical", "horizontal", "rotate", "scale", "aspect"] }] },
  { id: "effects", label: "Effects", items: [
    { id: "vignette", label: "Post-Crop Vignetting", keys: ["vignette"] }, { id: "grain", label: "Grain", keys: ["grain"] },
  ] },
  { id: "calibration", label: "Calibration", items: [{ id: "cal", label: "Calibration", keys: ["cal"] }] },
  { id: "geometry", label: "Crop & Local", items: [
    { id: "crop", label: "Crop & Straighten", keys: ["crop"], off: true },
    { id: "spots", label: "Spot Removal", keys: ["spots"], off: true },
    { id: "red_eyes", label: "Red Eye Correction", keys: ["red_eyes"], off: true },
    { id: "masks", label: "Masking (graduated, radial, brush)", keys: ["masks"] },
  ] },
];

export const allItems = (): CopyItem[] => COPY_SECTIONS.flatMap((s) => s.items);
export const defaultCopySelection = (): Record<string, boolean> => Object.fromEntries(allItems().map((i) => [i.id, !i.off]));

const STORE_KEY = "olr.copySelection";
export function loadCopySelection(): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Record<string, boolean> | null;
    return { ...defaultCopySelection(), ...(saved ?? {}) };
  } catch { return defaultCopySelection(); }
}
export function saveCopySelection(sel: Record<string, boolean>) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(sel)); } catch { /* storage unavailable */ }
}

export interface ClipboardSettings { keys: (keyof EditParams)[]; values: Partial<EditParams> }

export function pickSettings(source: EditParams, selection: Record<string, boolean>): ClipboardSettings {
  const keys = allItems().filter((i) => selection[i.id]).flatMap((i) => i.keys);
  const values: Record<string, unknown> = {};
  for (const k of keys) values[k] = clone(source[k]);
  return { keys, values: values as Partial<EditParams> };
}

export const applySettings = (base: EditParams, clip: ClipboardSettings): EditParams => ({ ...base, ...clone(clip.values) });
