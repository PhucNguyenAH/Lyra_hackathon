"""Unit tests for the SessionStore backends and selector."""
import pytest
from cryptography.fernet import Fernet
from api.session_store import (
    FileSessionStore, SupabaseSessionStore, build_session_store,
)

pytestmark = pytest.mark.unit

STATE = '{"cookies":[{"name":"li_at","value":"abc"}],"origins":[]}'


def test_file_store_round_trip(tmp_path):
    p = tmp_path / "sess.json"
    store = FileSessionStore(str(p))
    assert store.load() is None
    store.save(STATE)
    assert store.load() == STATE


class FakeTable:
    def __init__(self, rows):
        self._rows = rows
        self.upserted = None

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": self._rows})()

    def upsert(self, row):
        self.upserted = row
        return self


class FakeClient:
    def __init__(self, rows=None):
        self._table = FakeTable(rows or [])

    def table(self, name):
        return self._table


def test_supabase_store_save_encrypts_and_upserts():
    key = Fernet.generate_key()
    client = FakeClient()
    store = SupabaseSessionStore(client, Fernet(key))
    store.save(STATE)
    row = client._table.upserted
    assert row["id"] == "default"
    assert row["cipher_text"] != STATE                 # encrypted, not plaintext
    assert Fernet(key).decrypt(row["cipher_text"].encode()).decode() == STATE


def test_supabase_store_load_decrypts():
    key = Fernet.generate_key()
    cipher = Fernet(key).encrypt(STATE.encode()).decode()
    client = FakeClient(rows=[{"cipher_text": cipher}])
    store = SupabaseSessionStore(client, Fernet(key))
    assert store.load() == STATE


def test_supabase_store_load_none_when_no_row():
    client = FakeClient(rows=[])
    store = SupabaseSessionStore(client, Fernet(Fernet.generate_key()))
    assert store.load() is None


def test_supabase_store_load_none_on_bad_cipher():
    client = FakeClient(rows=[{"cipher_text": "not-a-valid-token"}])
    store = SupabaseSessionStore(client, Fernet(Fernet.generate_key()))
    assert store.load() is None


def test_build_selects_file_store_when_unconfigured(tmp_path):
    store = build_session_store(
        session_file=str(tmp_path / "s.json"),
        supabase_url=None, service_key=None, encryption_key=None,
    )
    assert isinstance(store, FileSessionStore)


def test_build_selects_file_store_when_key_missing(tmp_path):
    store = build_session_store(
        session_file=str(tmp_path / "s.json"),
        supabase_url="https://x.supabase.co", service_key="k", encryption_key=None,
    )
    assert isinstance(store, FileSessionStore)
