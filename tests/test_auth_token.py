"""Admin-token dependency behaviour."""
import importlib
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

pytestmark = pytest.mark.unit


def _app_with_token(monkeypatch, token):
    if token is None:
        monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    else:
        monkeypatch.setenv("ADMIN_TOKEN", token)
    import api.auth.token as tok
    importlib.reload(tok)
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(tok.require_admin_token)])
    def protected():
        return {"ok": True}

    return app, tok


def test_503_when_token_unset(monkeypatch):
    app, _ = _app_with_token(monkeypatch, None)
    r = TestClient(app).get("/protected")
    assert r.status_code == 503


def test_401_when_header_missing(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected")
    assert r.status_code == 401


def test_401_when_header_wrong(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected", headers={"X-Admin-Token": "nope"})
    assert r.status_code == 401


def test_200_when_header_correct(monkeypatch):
    app, _ = _app_with_token(monkeypatch, "secret")
    r = TestClient(app).get("/protected", headers={"X-Admin-Token": "secret"})
    assert r.status_code == 200


def test_check_ws_token(monkeypatch):
    _, tok = _app_with_token(monkeypatch, "secret")
    assert tok.check_ws_token("secret") is True
    assert tok.check_ws_token("nope") is False
    assert tok.check_ws_token(None) is False
