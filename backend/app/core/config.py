from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://openlr:openlr@localhost:5432/openlr"
    secret_key: str = "dev-secret-change-me-please-0123456789"
    storage_dir: Path = Path("/data")
    cors_origins: str = "http://localhost:5173"
    token_ttl_minutes: int = 60 * 24 * 14
    cookie_secure: bool = False
    max_upload_mb: int = 100

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
