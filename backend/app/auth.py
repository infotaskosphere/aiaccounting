"""
Auth Module — JWT + bcrypt
Exports: create_token, verify_password, hash_password,
         get_current_user, get_company_id, require_role,
         CurrentUser, decode_token
"""
from __future__ import annotations
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import bcrypt
import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-please")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

bearer_scheme = HTTPBearer()


# ─── CurrentUser dataclass ────────────────────────────────────────────────────

class CurrentUser:
    """
    Returned by deps.get_current_user (simple_mode / deps.py path).
    Attribute access: user.company_id, user.role, etc.
    """
    def __init__(self, user_id, company_id, role: str, name: str = "", email: str = ""):
        self.user_id    = user_id
        self.company_id = company_id
        self.role       = role
        self.name       = name
        self.email      = email

    # Dict-style access so main.py's user["sub"], user["company_id"] also work
    def __getitem__(self, key: str):
        mapping = {
            "sub":        str(self.user_id),
            "company_id": str(self.company_id),
            "role":       self.role,
            "name":       self.name,
            "email":      self.email,
        }
        return mapping[key]

    def get(self, key: str, default=None):
        try:
            return self[key]
        except KeyError:
            return default


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
) -> CurrentUser:
    """
    Decodes JWT and returns a CurrentUser.
    Supports both attribute access (user.company_id) and
    dict-style access (user["company_id"]) used in main.py.
    """
    payload = decode_token(credentials.credentials)
    return CurrentUser(
        user_id    = payload.get("sub"),
        company_id = payload.get("company_id"),
        role       = payload.get("role", ""),
        name       = payload.get("name", ""),
        email      = payload.get("email", ""),
    )


async def get_company_id(
    user: CurrentUser = Depends(get_current_user),
) -> str:
    """Convenience dep: extract company_id directly from the token."""
    if not user.company_id:
        raise HTTPException(status_code=401, detail="company_id missing in token")
    return str(user.company_id)


def require_role(*roles: str):
    """Dependency factory: require one of the given roles."""
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


# Convenience role aliases
require_admin      = require_role("admin", "owner")
require_accountant = require_role("admin", "owner", "accountant")
