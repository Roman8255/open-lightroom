# Open Lightroom

An open-source, web-based photo library and non-destructive editor inspired by Adobe Lightroom.
Familiar layout (Library / Develop modules, left & right panels, filmstrip, histogram, history,
keyboard shortcuts) so Lightroom users feel at home.

**Stack:** React + TypeScript + Vite + Tailwind · WebGL2 edit pipeline · FastAPI · PostgreSQL · Alembic migrations · Docker.

## Features (MVP)
- **Library:** import (drag & drop / picker), grid & loupe, filmstrip, star ratings, pick/reject flags,
  color labels, filtering & sorting, EXIF info, multi-select.
- **Develop (real-time, GPU):** white balance, exposure, contrast, highlights, shadows, whites, blacks,
  clarity, vibrance, saturation, tone curve, HSL, sharpening, vignette, grain.
- **Non-destructive:** originals are never modified; only edit parameters (JSON) are stored.
- History panel with undo/redo, snapshots, copy/paste settings, built-in presets, before/after.
- **Export** JPEG/PNG with quality and size (rendered server-side with the same pipeline).
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
`G` grid · `E` loupe · `D` develop · `0–5` rating · `P/X/U` pick/reject/unflag · `6–9` color labels ·
`←→` navigate · `\` before/after · `Ctrl/⌘+Z` undo · `Ctrl/⌘+Shift+Z` redo · `Ctrl/⌘+Shift+C/V` copy/paste settings.

## Architecture
See [docs/architecture.md](docs/architecture.md) and [docs/edit-params.md](docs/edit-params.md).

## License
[AGPL-3.0](LICENSE). You are free to use, modify and self-host this project. If you distribute it or run a
modified version as a network service, you must publish your source under the same license and keep the
copyright notices. Not affiliated with Adobe; "Lightroom" is a trademark of Adobe.
