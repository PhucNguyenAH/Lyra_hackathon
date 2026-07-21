"""Small IMAP boundary for retrieving unread messages without changing mailbox state."""

import html
import imaplib
import re
from email import message_from_bytes, policy
from email.header import decode_header
from email.message import Message
from typing import TypeAlias


BODY_CHAR_LIMIT = 3_000
DEFAULT_CHARSET = "utf-8"
FETCH_QUERY = "(BODY.PEEK[])"
HTML_TAG_PATTERN = re.compile(r"<[^>]+>")
MAILBOX_NAME = "INBOX"
SEARCH_CRITERION = "UNSEEN"

EmailData: TypeAlias = dict[str, str]


def _decode_header(value: str | None) -> str:
    """Decode mixed MIME header fragments so matching receives readable text."""
    if not value:
        return ""

    fragments: list[str] = []
    for fragment, charset in decode_header(value):
        if isinstance(fragment, bytes):
            fragments.append(fragment.decode(charset or DEFAULT_CHARSET, errors="replace"))
        else:
            fragments.append(fragment)
    return "".join(fragments).strip()


def _decode_payload(part: Message) -> str:
    """Decode malformed or missing charset declarations without dropping the email."""
    payload = part.get_payload(decode=True)
    if payload is None:
        raw_payload = part.get_payload()
        return raw_payload if isinstance(raw_payload, str) else ""
    return payload.decode(part.get_content_charset() or DEFAULT_CHARSET, errors="replace")


def _extract_body(message: Message) -> str:
    """Prefer human-readable plain text while retaining an HTML-only fallback."""
    plain_parts: list[str] = []
    html_parts: list[str] = []

    parts = message.walk() if message.is_multipart() else [message]
    for part in parts:
        if part.is_multipart() or part.get_content_disposition() == "attachment":
            continue

        content_type = part.get_content_type()
        decoded = _decode_payload(part)
        if content_type == "text/plain":
            plain_parts.append(decoded)
        elif content_type == "text/html":
            html_parts.append(decoded)

    body = "\n".join(plain_parts).strip()
    if not body and html_parts:
        body = html.unescape(HTML_TAG_PATTERN.sub(" ", "\n".join(html_parts)))

    return " ".join(body.split())[:BODY_CHAR_LIMIT]


def fetch_unseen(host: str, user: str, pwd: str) -> list[EmailData]:
    """Read unseen mail with PEEK so a failed watcher run can safely retry it."""
    client = imaplib.IMAP4_SSL(host)
    messages: list[EmailData] = []

    try:
        client.login(user, pwd)
        status, _ = client.select(MAILBOX_NAME, readonly=True)
        if status != "OK":
            raise RuntimeError(f"Unable to select IMAP mailbox: {status}")

        status, search_data = client.search(None, SEARCH_CRITERION)
        if status != "OK":
            raise RuntimeError(f"Unable to search IMAP mailbox: {status}")

        message_ids = search_data[0].split() if search_data and search_data[0] else []
        for message_id in message_ids:
            status, fetched_data = client.fetch(message_id, FETCH_QUERY)
            if status != "OK":
                continue

            raw_message = next(
                (item[1] for item in fetched_data if isinstance(item, tuple) and isinstance(item[1], bytes)),
                None,
            )
            if raw_message is None:
                continue

            parsed = message_from_bytes(raw_message, policy=policy.default)
            messages.append(
                {
                    "from": _decode_header(parsed.get("From")),
                    "subject": _decode_header(parsed.get("Subject")),
                    "body": _extract_body(parsed),
                }
            )

        return messages
    finally:
        try:
            client.close()
        except imaplib.IMAP4.error:
            pass
        try:
            client.logout()
        except imaplib.IMAP4.error:
            pass
