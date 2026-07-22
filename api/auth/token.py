"""Admin-token authentication for the /auth routes."""
import os
import secrets
from typing import Optional

from fastapi import Header, HTTPException

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN")


def require_admin_token(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """FastAPI dependency: 503 if the feature is disabled, 401 if unauthorized."""
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="login flow disabled (ADMIN_TOKEN unset)")
    if not x_admin_token or not secrets.compare_digest(x_admin_token, ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="invalid admin token")


def check_ws_token(token: Optional[str]) -> bool:
    """True only if ADMIN_TOKEN is set and matches (for websocket auth)."""
    if not ADMIN_TOKEN or not token:
        return False
    return secrets.compare_digest(token, ADMIN_TOKEN)
