from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, library, photos
from app.core.config import settings

app = FastAPI(title="Open Lightroom API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api")
app.include_router(photos.router, prefix="/api")
app.include_router(library.router, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}
