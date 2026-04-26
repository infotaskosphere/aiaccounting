"""
Auth Module — JWT + bcrypt
Exports: create_token, verify_password, hash_password,
         get_current_user, get_company_id, require_role
"""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import bcrypt
import jwt
import asyncpg

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-please")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

bearer_scheme = HTTPBearer()


# ─── Password ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_token(user_id: str, company_id: str, role: str) -> str:
    """Create a signed JWT. Aliased as create_access_token for compatibility."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub":        str(user_id),
        "company_id": str(company_id),
        "role":       role,
        "exp":        expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# Backward-compat alias
create_access_token = create_token


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ─── FastAPI deps ─────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Returns the JWT payload as a plain dict so callers can use
    user["sub"], user["company_id"], user["role"] etc.
    """
    return decode_token(credentials.credentials)


async def get_company_id(
    user: dict = Depends(get_current_user),
) -> str:
    """Convenience dep: extract company_id directly from the token."""
    company_id = user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="company_id missing in token")
    return company_id


def require_role(*roles: str):
    """Dependency factory: require one of the given roles."""
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


# Convenience role aliases
require_admin      = require_role("admin", "owner")
require_accountant = require_role("admin", "owner", "accountant")
