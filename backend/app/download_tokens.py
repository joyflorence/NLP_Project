"""Short-lived tokens for secure document download URLs."""

import time
import secrets
from pathlib import Path
from typing import Dict

_tokens: Dict[str, tuple] = {}  # token -> (document_id, file_path, expires_at)
_EXPIRY_SECONDS = 300


def add_download_token(document_id: str, file_path: str) -> str:
    """Create a download token. Returns the token string."""
    token = secrets.token_urlsafe(32)
    expires = time.time() + _EXPIRY_SECONDS
    _tokens[token] = (document_id, str(file_path), expires)
    return token


def get_download_path(token: str) -> Path | None:
    """Validate token and return file path if valid."""
    if token not in _tokens:
        return None
    doc_id, path, expires = _tokens[token]
    if time.time() > expires:
        del _tokens[token]
        return None
    return Path(path)
