from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import (
    COOKIE_NAME,
    create_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models import User
from app.schemas.api import Credentials, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(resp: Response, user_id: int) -> None:
    resp.set_cookie(
        COOKIE_NAME, create_token(user_id), httponly=True, samesite="lax",
        secure=settings.cookie_secure, max_age=settings.token_ttl_minutes * 60, path="/",
    )


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: Credentials, resp: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    _set_cookie(resp, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: Credentials, resp: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    _set_cookie(resp, user.id)
    return user


@router.post("/logout", status_code=204)
def logout(resp: Response):
    resp.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
