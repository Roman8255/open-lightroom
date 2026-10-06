from sqlalchemy import create_engine

import app.models  # noqa: F401  (register models)
from alembic import context
from app.core.config import settings
from app.core.db import Base

target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
