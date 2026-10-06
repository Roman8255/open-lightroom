# Edit parameters

Stored as JSON in `edit_settings.params`. Defaults are all `0` except the curve. Server validates ranges.

| Key | Range | Notes |
|---|---|---|
| bw | bool | Black & White treatment (luminance only) |
| temperature, tint | -100..100 | white balance in linear light |
| exposure | -5..5 EV | multiplies linear light by 2^EV |
| contrast | -100..100 | around 0.5 mid-gray |
| highlights, shadows, whites, blacks | -100..100 | luminance-masked lift/lower |
| clarity | -100..100 | local contrast, midtone-weighted |
| vibrance, saturation | -100..100 | vibrance protects already saturated colors |
| curve | list of `[x, y]` in 0..1 (2–32 pts) | monotone cubic, master RGB |
| hsl.{red,orange,yellow,green,aqua,blue,purple,magenta}.{hue,sat,lum} | -100..100 | triangular 45° bands |
| sharpening | 0..150 | unsharp mask |
| vignette | -100..100 | negative darkens edges |
| grain | 0..100 | |
