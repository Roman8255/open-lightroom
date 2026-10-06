"""Create or update a local dev user. Credentials come from the environment, never from the repo:

    docker compose exec -e SEED_EMAIL=me@example.com -e SEED_PASSWORD=secret \
        backend python -m scripts.seed_user
"""
import os
import sys

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User


def main() -> None:
    email, password = os.environ.get("SEED_EMAIL"), os.environ.get("SEED_PASSWORD")
    if not email or not password:
        sys.exit("Set SEED_EMAIL and SEED_PASSWORD")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email.lower()))
        if user:
            user.password_hash = hash_password(password)
            action = "updated"
        else:
            db.add(User(email=email.lower(), password_hash=hash_password(password)))
            action = "created"
        db.commit()
    print(f"User {email.lower()} {action}")


if __name__ == "__main__":
    main()
