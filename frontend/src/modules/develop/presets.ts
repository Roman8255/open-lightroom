import { type EditParams, LOOK_KEYS, clone, defaultParams } from "../../gl/params";

export interface Preset { name: string; params: Partial<EditParams> }

export const PRESETS: Preset[] = [
  { name: "Punch", params: { contrast: 25, vibrance: 30, clarity: 20, saturation: 8 } },
  { name: "Matte", params: { blacks: 40, contrast: -15, saturation: -10, highlights: -20 } },
  { name: "Warm Glow", params: { temperature: 25, tint: 5, exposure: 0.2, highlights: -25, vibrance: 15 } },
  { name: "Cool Fade", params: { temperature: -20, blacks: 25, saturation: -15, contrast: -10 } },
  { name: "B&W High Contrast", params: { saturation: -100, contrast: 45, clarity: 30, blacks: -15 } },
  { name: "Vintage", params: { temperature: 15, saturation: -20, blacks: 30, vignette: -30, grain: 25 } },
];

/** Applies a look: resets all "look" keys, then the preset's. Framing, spots and masks are untouched. */
export const applyPreset = (base: EditParams, preset: { params: Partial<EditParams> }): EditParams => {
  const d = defaultParams();
  const next: Record<string, unknown> = { ...base };
  for (const k of LOOK_KEYS) next[k] = clone(d[k]);
  for (const k of LOOK_KEYS) if (k in preset.params) next[k] = clone(preset.params[k]);
  return next as unknown as EditParams;
};

/** Extracts the look of an edit so it can be stored as a user preset. */
export const lookOf = (p: EditParams): EditParams => {
  const out: Record<string, unknown> = { ...defaultParams() };
  for (const k of LOOK_KEYS) out[k] = clone(p[k]);
  return out as unknown as EditParams;
};
