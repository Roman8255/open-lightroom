// Keep in sync with backend/app/schemas/edit.py and docs/edit-params.md
export const HSL_BANDS = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
export type HslBandName = (typeof HSL_BANDS)[number];
export interface HslBand { hue: number; sat: number; lum: number }

export interface EditParams {
  temperature: number; tint: number;
  exposure: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number;
  clarity: number; vibrance: number; saturation: number;
  curve: [number, number][];
  hsl: Record<HslBandName, HslBand>;
  sharpening: number;
  vignette: number; grain: number;
}

export type NumericKey = {
  [K in keyof EditParams]: EditParams[K] extends number ? K : never;
}[keyof EditParams];

export const defaultParams = (): EditParams => ({
  temperature: 0, tint: 0,
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  clarity: 0, vibrance: 0, saturation: 0,
  curve: [[0, 0], [1, 1]],
  hsl: Object.fromEntries(HSL_BANDS.map((b) => [b, { hue: 0, sat: 0, lum: 0 }])) as Record<HslBandName, HslBand>,
  sharpening: 0,
  vignette: 0, grain: 0,
});

export const isDefault = (p: EditParams): boolean => JSON.stringify(p) === JSON.stringify(defaultParams());

export const withDefaults = (p: Partial<EditParams>): EditParams => ({ ...defaultParams(), ...p });
