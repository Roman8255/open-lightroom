# Architecture

```
Browser (React, WebGL2)  ──/api──▶  FastAPI  ──▶  PostgreSQL (metadata, edits JSONB)
                                       └────────▶  Storage volume (original / preview 2048px / thumb 480px)
```

- **Non-destructive editing:** a photo has one `edit_settings.params` JSONB document. `edit_history`
  stores named snapshots. Undo/redo history lives in the browser while editing.
- **Real-time preview:** the 2048px preview JPEG is uploaded as a WebGL texture and one fragment shader
  (`frontend/src/gl/shader.ts`) applies all adjustments each frame.
- **Export:** `backend/app/services/render.py` re-implements the same pipeline with numpy on the original
  image. Tone/color/curve/HSL/vignette match; clarity, sharpening and grain are close approximations.
- **Auth:** email+password, JWT in an httpOnly SameSite=Lax cookie. In dev, Vite proxies `/api` to the
  backend so everything is same-origin (put a reverse proxy in front for production).
- **Storage:** local filesystem behind `app/services/storage.py` (swap for S3/MinIO later).
- **Migrations:** Alembic; `alembic upgrade head` runs on backend startup.

## Roadmap / known limits
RAW support (rawpy), crop/rotate, local masks, presets saved per user, collections, keywords,
lens corrections, zoom/pan at 100% in Develop, pagination for very large libraries.
