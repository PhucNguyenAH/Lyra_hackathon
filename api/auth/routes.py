"""HTTP + websocket routes for the interactive login flow."""
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket

from .login_session import LoginInProgress
from .token import check_ws_token, require_admin_token
from .vnc_proxy import vnc_websocket

router = APIRouter(prefix="/auth")


@router.post("/session/start", dependencies=[Depends(require_admin_token)])
async def start_session(request: Request):
    manager = request.app.state.login_manager
    try:
        return await manager.start()
    except LoginInProgress:
        raise HTTPException(status_code=409, detail="a login session is already active")


@router.get("/session/status")
async def session_status(request: Request):
    if not check_ws_token(request.query_params.get("token")):
        raise HTTPException(status_code=401, detail="invalid admin token")
    return request.app.state.login_manager.status()


@router.post("/session/cancel", dependencies=[Depends(require_admin_token)])
async def cancel_session(request: Request):
    await request.app.state.login_manager.cancel()
    return {"state": "cancelled"}


@router.websocket("/session/vnc")
async def session_vnc(websocket: WebSocket):
    await vnc_websocket(websocket)
