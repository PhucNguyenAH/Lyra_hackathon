"""Proxy a browser websocket to the local x11vnc TCP port (raw RFB)."""
import asyncio
import logging

from fastapi import WebSocket

from .token import check_ws_token

logger = logging.getLogger("api.auth.vnc_proxy")

VNC_HOST = "127.0.0.1"
VNC_PORT = 5900


async def vnc_websocket(ws: WebSocket) -> None:
    """Token-gated raw pipe between the noVNC client and x11vnc."""
    token = ws.query_params.get("token")
    if not check_ws_token(token):
        await ws.close(code=1008)  # policy violation
        return
    login_manager = ws.app.state.login_manager
    if login_manager.state != "awaiting_login":
        await ws.close(code=1008)  # policy violation: no active login session
        return
    await ws.accept()
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(VNC_HOST, VNC_PORT), timeout=10
        )
    except (OSError, asyncio.TimeoutError):
        logger.exception("Cannot reach x11vnc at %s:%s", VNC_HOST, VNC_PORT)
        await ws.close(code=1011)
        return

    async def ws_to_tcp():
        try:
            while True:
                data = await ws.receive_bytes()
                writer.write(data)
                await writer.drain()
        except Exception:
            pass

    async def tcp_to_ws():
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    break
                await ws.send_bytes(data)
        except Exception:
            pass

    t1 = asyncio.create_task(ws_to_tcp())
    t2 = asyncio.create_task(tcp_to_ws())
    try:
        await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
        for task in (t1, t2):
            if not task.done():
                task.cancel()
        await asyncio.gather(t1, t2, return_exceptions=True)
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        try:
            await ws.close()
        except Exception:
            pass
