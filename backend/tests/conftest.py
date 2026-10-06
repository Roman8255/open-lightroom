import io
import os

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, text

base_url = os.environ["DATABASE_URL"]
test_url = base_url.rsplit("/", 1)[0] + "/openlr_test"
os.environ["DATABASE_URL"] = test_url
os.environ["STORAGE_DIR"] = "/tmp/olr-test-storage"

admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
with admin.connect() as c:
    c.execute(text("DROP DATABASE IF EXISTS openlr_test WITH (FORCE)"))
    c.execute(text("CREATE DATABASE openlr_test"))

from alembic.config import Config  # noqa: E402

from alembic import command  # noqa: E402

command.upgrade(Config("alembic.ini"), "head")  # tests exercise the real migrations

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def user_client(client):
    import uuid

    email = f"{uuid.uuid4().hex}@t.io"
    r = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201
    return client


@pytest.fixture()
def jpeg_bytes():
    img = Image.new("RGB", (120, 80), (200, 100, 50))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    return buf.getvalue()
