# Edit parameters

Stored as JSON in `edit_settings.params`; the server validates ranges and fills defaults. All numbers default to `0`
unless noted. Source of truth: `backend/app/schemas/edit.py` (mirrored in `frontend/src/gl/params.ts`).

| Group | Keys | Notes |
|---|---|---|
| Treatment | `bw` | luminance only; HSL *Luminance* sliders become the B&W mixer |
| White balance | `temperature`, `tint` (-100..100) | in linear light |
| Tone | `exposure` (-5..5 EV), `contrast`, `highlights`, `shadows`, `whites`, `blacks` | |
| Presence | `texture`, `clarity`, `dehaze`, `vibrance`, `saturation` (-100..100) | dark-channel dehaze |
| Curves | `curve`, `curve_r`, `curve_g`, `curve_b` | `[x, y]` points in 0..1 (2–32), monotone cubic; master first, then per channel |
| HSL | `hsl.{red,orange,yellow,green,aqua,blue,purple,magenta}.{hue,sat,lum}` | 45° triangular bands |
| Color grading | `grade.{shadows,midtones,highlights}.{hue 0..360,sat 0..100,lum}`, `grade.blending` (50), `grade.balance` | luminance-weighted tinting |
| Detail | `sharpening` (0..150), `sharpen_radius` (0.5..3, default 1), `noise_reduction` (0..100) | |
| Lens corrections | `distortion`, `lens_vignette` | manual profile |
| Transform | `vertical`, `horizontal`, `rotate` (-45..45°), `scale` (50..150, default 100), `aspect` | |
| Crop | `crop.{x,y,w,h}` (0..1, default full frame), `crop.angle` (-45..45°) | rect lives in the rotated frame |
| Effects | `vignette` (-100..100, post-crop), `grain` (0..100) | |
| Calibration | `cal.{shadow_tint, red_hue, red_sat, green_hue, green_sat, blue_hue, blue_sat}` | rotates/desaturates the RGB primaries |
| Spot removal | `spots[]` (max 32): `x,y,r` (r in image-height units), `sx,sy` source, `mode` clone/heal, `feather`, `opacity` | normalised source-image coordinates |
| Red eye | `red_eyes[]` (max 16): `x,y,r,amount` | |
| Local masks | `masks[]` (max 4): `type` linear/radial/brush, `enabled`, `invert`, geometry, `adj.{exposure,contrast,highlights,shadows,temperature,tint,saturation}` | see below |

## Masks
Coordinates are normalised to the **source** image, so masks follow the content when you crop or transform.
* **linear** – full effect at `(x1,y1)`, fading (smoothstep) to nothing at `(x2,y2)`.
* **radial** – ellipse `(cx,cy,rx,ry)`, `feather` 0..100 softens the edge; `invert` flips inside/outside.
* **brush** – `strokes[]` of `{size, feather, erase, points[]}`; stamps are placed every `size/4` and combined as a union (erase subtracts).

The same rasteriser exists in `frontend/src/gl/masks.ts` and `backend/app/services/render.py` (mask resolution ≤1024 px).

## Pipeline order
geometry (crop → scale/aspect → perspective → rotate → distortion) → spots → red eye → lens vignette → calibration →
tone → dehaze → local masks → noise reduction → clarity → texture → sharpening → vibrance/saturation → HSL (or B&W) →
color grading → curves → vignette → grain.

Exact on GPU and CPU: geometry, tone, color, grading, calibration, curves, masks, spots, red eye.
Approximations on the CPU/export: noise reduction, clarity, texture, sharpening, grain.
