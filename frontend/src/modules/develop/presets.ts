import { type EditParams, defaultParams } from "../../gl/params";

export interface Preset { name: string; params: Partial<EditParams> }

export const PRESETS: Preset[] = [
  { name: "Punch", params: { contrast: 25, vibrance: 30, clarity: 20, saturation: 8 } },
  { name: "Matte", params: { blacks: 40, contrast: -15, saturation: -10, highlights: -20 } },
  { name: "Warm Glow", params: { temperature: 25, tint: 5, exposure: 0.2, highlights: -25, vibrance: 15 } },
  { name: "Cool Fade", params: { temperature: -20, blacks: 25, saturation: -15, contrast: -10 } },
  { name: "B&W High Contrast", params: { saturation: -100, contrast: 45, clarity: 30, blacks: -15 } },
  { name: "Vintage", params: { temperature: 15, saturation: -20, blacks: 30, vignette: -30, grain: 25 } },
];

export const applyPreset = (base: EditParams, preset: Preset): EditParams => ({ ...base, ...defaultParams(), ...preset.params, hsl: base.hsl, curve: base.curve });
