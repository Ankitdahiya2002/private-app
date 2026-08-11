import os
import json
import datetime
import urllib.request
import urllib.error
from threading import Lock
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")


def _key() -> str:
    return os.environ.get("SUPABASE_KEY", SUPABASE_KEY)


def _base() -> str:
    return os.environ.get("SUPABASE_URL", SUPABASE_URL)


def _is_configured() -> bool:
    return bool(_key() and _base())


def _request(method: str, path: str, body: dict = None, prefer: str = None) -> dict | list | None:
    """Make a raw HTTP request to Supabase using urllib (gevent-safe)."""
    url = f"{_base()}/rest/v1/{path}"
    key = _key()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer or "return=representation"
    }

    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read()
            if raw:
                return json.loads(raw)
            return None
    except urllib.error.HTTPError as e:
        print(f"Supabase HTTP {e.code} on {method} {path}: {e.read().decode()}")
        return None
    except Exception as e:
        print(f"Supabase request error on {method} {path}: {e}")
        return None


# Thread-safe in-memory cache
# Structure: { "room_code": [list of message dicts] }
_cache = {}
_lock = Lock()


def get_messages(room: str) -> list:
    """Return all stored messages for a room, checking cache first."""
    if not _is_configured():
        return []

    with _lock:
        if room in _cache:
            return _cache[room]

    # Cache miss: fetch from Supabase
    result = _request("GET", f"messages?room=eq.{room}&select=*&order=ts.asc")
    msgs = result if isinstance(result, list) else []

    # Transform back to expected format
    for m in msgs:
        m["id"] = m.get("client_id", m.get("id"))

    with _lock:
        _cache[room] = msgs

    return msgs


def add_message(room: str, msg: dict) -> dict:
    """Add a message to the Supabase store and cache it instantly."""
    if not _is_configured():
        return msg

    data = {
        "client_id": msg.get("id"),
        "room": room,
        "sender": msg.get("sender"),
        "text": msg.get("text"),
        "image_url": msg.get("image_url"),
        "ts": msg.get("ts"),
        "seen": msg.get("seen", False)
    }

    # Instantly update cache
    with _lock:
        if room not in _cache:
            _cache[room] = []
        _cache[room].append(msg)

    # Save to Supabase (non-blocking, errors are logged)
    _request("POST", "messages", body=data)

    return msg


def delete_message(room: str, msg_id: str) -> bool:
    """Delete a message by client_id from both cache and Supabase."""
    if not _is_configured():
        return False

    # Update cache
    with _lock:
        if room in _cache:
            _cache[room] = [m for m in _cache[room] if m.get("id") != msg_id]

    result = _request("DELETE", f"messages?client_id=eq.{msg_id}", prefer="return=minimal")
    return result is not None


def mark_seen(room: str, up_to_ts: float, reader: str) -> None:
    """Mark all messages up to a timestamp as seen by reader in cache and Supabase."""
    if not _is_configured():
        return

    # Update cache
    changed = False
    with _lock:
        if room in _cache:
            for m in _cache[room]:
                if m.get("ts", 0) <= up_to_ts and m.get("sender") != reader and not m.get("seen"):
                    m["seen"] = True
                    changed = True

    if not changed:
        return

    # Fetch IDs that need updating
    rows = _request("GET", f"messages?room=eq.{room}&ts=lte.{up_to_ts}&sender=neq.{reader}&seen=eq.false&select=id")
    if rows:
        ids = [str(r["id"]) for r in rows]
        ids_str = ",".join(ids)
        _request("PATCH", f"messages?id=in.({ids_str})", body={"seen": True}, prefer="return=minimal")


def upsert_user(username: str, room: str, is_online: bool, ip_address: str = None, user_agent: str = None) -> None:
    """Insert or update a user's online status and tracking data in Supabase."""
    if not _is_configured():
        return

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = {
        "username": username,
        "room": room,
        "is_online": is_online,
        "last_active": now
    }

    if ip_address:
        data["ip_address"] = ip_address
    if user_agent:
        data["user_agent"] = user_agent

    _request("POST", "users?on_conflict=username,room", body=data, prefer="resolution=merge-duplicates")
