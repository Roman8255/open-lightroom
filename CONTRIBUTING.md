# Contributing

1. Fork, create a branch, run the stack with `docker compose up --build`.
2. Schema changes **must** come with an Alembic migration (`make migration m="..."`).
3. Edit parameters live in three places that must stay in sync:
   `backend/app/schemas/edit.py`, `frontend/src/gl/params.ts`, `docs/edit-params.md`
   (plus the shader `frontend/src/gl/shader.ts` and CPU renderer `backend/app/services/render.py`).
4. Run `make lint` and `make test` before opening a PR.
5. By contributing you agree your work is licensed under AGPL-3.0.
