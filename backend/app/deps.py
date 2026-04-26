"""
FastAPI Dependencies
DB connection pool + current-user shortcut.
"""
from __future__ import annotations
import os
import asyncpg
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import CurrentUser, decode_token

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/aiaccounting",
)

_pool: asyncpg.Pool | None = None
bearer_scheme = HTTPBearer()


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=20)


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()


async def get_db() -> asyncpg.Connection:
    if _pool is None:
        raise RuntimeError("DB pool not initialized")
    async with _pool.acquire() as conn:
        yield conn


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: asyncpg.Connection = Depends(get_db),
) -> CurrentUser:
    payload = decode_token(credentials.credentials)
    user_id = int(payload["sub"])
    company_id = payload["company_id"]
    role = payload["role"]

    # verify user still active
    row = await db.fetchrow(
        "SELECT id, name, email, is_active FROM users WHERE id=$1", user_id
    )
    if not row or not row["is_active"]:
        raise HTTPException(status_code=401, detail="User inactive or not found")

    return CurrentUser(
        user_id=row["id"],
        company_id=company_id,
        role=role,
        name=row["name"],
        email=row["email"],
    )
