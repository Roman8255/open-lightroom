# Open Lightroom

An open-source, web-based photo library and non-destructive editor inspired by Adobe Lightroom.
Familiar layout (Library / Develop modules, left & right panels, filmstrip, histogram, history,
keyboard shortcuts) so Lightroom users feel at home.

**Stack:** React + TypeScript + Vite + Tailwind · WebGL2 edit pipeline · FastAPI · PostgreSQL · Alembic migrations · Docker.

## Features
- **Library:** import (files, drag & drop, whole folders), grid & loupe, filmstrip, ratings, flags, color labels,
  Library Filter, Folders, **Collections**, **Keywords**, editable metadata, comments, Quick Develop, **Publish** to ZIP.
- **Develop (real-time, GPU):** Basic (WB, tone, texture, clarity, dehaze, vibrance, saturation), tone curves (RGB + channels),
  HSL / B&W, color grading, detail (sharpen, noise reduction), lens corrections, transform, effects, calibration.
- **Tools:** crop & straighten, spot removal (clone/heal), red eye, **graduated / radial filters and adjustment brush** with
  up to 4 masks, per-mask adjustments, invert, show/hide and mask overlay.
- **Non-destructive:** originals are never modified; only edit parameters (JSON) are stored.
- History with undo/redo, snapshots, copy/paste, user + built-in presets, before/after.
- **Export dialog like Lightroom:** file naming templates, JPEG / PNG / TIFF / WebP, quality, file-size limit, resize (width & height, long/short edge,
  megapixels, percent, don't enlarge), resolution, output sharpening, metadata (all / copyright / none, remove location), text watermark, presets.
- **Copy Settings dialog:** choose exactly which settings are copied; paste to one or all selected photos.
- Zoom to 100 % with the original image, before | after split view, clipping warnings, Navigator.
- Multi-user accounts (email + password).

See [docs/lightroom-feature-map.md](docs/lightroom-feature-map.md) for what is done and planned.

## Quick start
```bash
cp .env.example .env      # optional, defaults work for local dev
docker compose up --build
```
- App: http://localhost:5173
- API docs: http://localhost:8000/docs

Migrations run automatically on backend start. Useful commands:
```bash
make migration m="describe change"   # autogenerate a new Alembic migration
make migrate                         # apply migrations
make test                            # backend + frontend tests
make lint
```

## Production / HTTPS with Traefik
`lightroom.dev` serves the frontend and `api.lightroom.dev` the API (Traefik v3, Let's Encrypt).
```bash
# set DOMAIN, ACME_EMAIL, SECRET_KEY, POSTGRES_PASSWORD in .env; point DNS A records at the host
docker compose -f docker-compose.prod.yml up -d --build
```
**Local HTTPS** (self-made certificate instead of Let's Encrypt):
```bash
scripts/local-certs.sh        # creates certs/ (local CA + cert for lightroom.dev, *.lightroom.dev)
scripts/trust-local-ca.sh     # you run it: trusts the CA + adds /etc/hosts entry (asks for admin password)
docker compose -f docker-compose.prod.yml -f docker-compose.local.yml up --build
```

## Keyboard shortcuts
**Global / Library:** `G` grid · `E` loupe · `D` develop · `R` crop · `V` B&W · `0–5` rating · `P/X/U` pick/reject/unflag ·
`6–9` color labels · arrows navigate · `Ctrl/⌘+A` select all · `Del` delete · `Tab` hide side panels · `Shift+Tab` hide all ·
`L` dim / black out the interface · `F` fullscreen · `Ctrl/⌘+Shift+C` copy settings · `Ctrl/⌘+Shift+V` paste (to all selected in Library) ·
`Ctrl/⌘+Shift+E` export

**View (Develop):** `Space` / `Z` fit ⇄ 100 % (drag to pan, click toggles too) · `Y` before | after · `Alt+Y` before / after top-bottom ·
`\` before only · `J` clipping warnings

**Develop tools:** `R` crop · `Q` spot removal · `Shift+Q` red eye · `M` graduated filter · `Shift+M` radial filter · `K` brush ·
`Enter`/`Esc` finish tool · `X` (in crop) swap orientation

**Masks:** `Alt+1…4` select mask 1–4 (also switches to its tool) · `[` / `]` previous / next mask (brush & spot: size) ·
`H` show/hide selected mask · `Shift+I` invert · `O` mask overlay · `Del` delete mask/spot · hold `Alt` while painting to erase

**Editing:** `V` B&W · `Ctrl/⌘+Z` undo · `Ctrl/⌘+Shift+Z` redo · `Ctrl/⌘+Alt+C` copy with the last selection

## Architecture
See [docs/architecture.md](docs/architecture.md) and [docs/edit-params.md](docs/edit-params.md).

## License
[AGPL-3.0](LICENSE). You are free to use, modify and self-host this project. If you distribute it or run a
modified version as a network service, you must publish your source under the same license and keep the
copyright notices. Not affiliated with Adobe; "Lightroom" is a trademark of Adobe.
