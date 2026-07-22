"""Proxy a browser websocket to the local x11vnc TCP port (raw RFB)."""
import asyncio
import logging

from fastapi import WebSocket, WebSocketDisconnect

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
    await ws.accept()
    try:
        reader, writer = await asyncio.open_connection(VNC_HOST, VNC_PORT)
    except OSError:
        logger.exception("Cannot reach x11vnc at %s:%s", VNC_HOST, VNC_PORT)
        await ws.close(code=1011)
        return

    async def ws_to_tcp():
        try:
            while True:
                data = await ws.receive_bytes()
                writer.write(data)
                await writer.drain()
        except (WebSocketDisconnect, RuntimeError):
            pass

    async def tcp_to_ws():
        try:
            while True:
                data = await reader.read(65536)
                if not data:
                    break
                await ws.send_bytes(data)
        except (WebSocketDisconnect, RuntimeError, ConnectionError):
            pass

    try:
        await asyncio.gather(ws_to_tcp(), tcp_to_ws())
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
