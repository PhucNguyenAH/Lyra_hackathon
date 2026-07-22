"""Persistence for the LinkedIn session: file or encrypted Supabase row."""
import logging
import os
from typing import Optional

logger = logging.getLogger("api.session_store")

TABLE = "linkedin_sessions"
ROW_ID = "default"


class FileSessionStore:
    """Reads/writes the session JSON as a local file (Phase-1 behavior)."""

    def __init__(self, path: str) -> None:
        self.path = path

    def load(self) -> Optional[str]:
        if not os.path.exists(self.path):
            return None
        with open(self.path) as fh:
            return fh.read()

    def save(self, state_json: str) -> None:
        parent = os.path.dirname(self.path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(self.path, "w") as fh:
            fh.write(state_json)


class SupabaseSessionStore:
    """Stores the session as a Fernet-encrypted singleton row in Supabase."""

    def __init__(self, client, fernet, table: str = TABLE, row_id: str = ROW_ID) -> None:
        self.client = client
        self.fernet = fernet
        self.table = table
        self.row_id = row_id

    def load(self) -> Optional[str]:
        try:
            resp = (
                self.client.table(self.table)
                .select("cipher_text")
                .eq("id", self.row_id)
                .limit(1)
                .execute()
            )
            rows = resp.data or []
            if not rows:
                return None
            cipher = rows[0]["cipher_text"]
            return self.fernet.decrypt(cipher.encode()).decode()
        except Exception:
            logger.exception("Failed to load session from Supabase")
            return None

    def save(self, state_json: str) -> None:
        cipher = self.fernet.encrypt(state_json.encode()).decode()
        self.client.table(self.table).upsert({"id": self.row_id, "cipher_text": cipher}).execute()


def build_session_store(*, session_file: str, supabase_url, service_key, encryption_key):
    """Pick the Supabase store when fully configured, else the file store."""
    if supabase_url and service_key and encryption_key:
        try:
            from supabase import create_client
            from cryptography.fernet import Fernet

            client = create_client(supabase_url, service_key)
            key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
            logger.info("Using Supabase session store (encrypted at rest)")
            return SupabaseSessionStore(client, Fernet(key))
        except Exception:
            logger.exception("Supabase session store unavailable; using file store")
            return FileSessionStore(session_file)
    if supabase_url or service_key:
        logger.warning(
            "Supabase partially configured; need SUPABASE_URL + "
            "SUPABASE_SERVICE_ROLE_KEY + SESSION_ENCRYPTION_KEY. Using file store."
        )
    return FileSessionStore(session_file)
