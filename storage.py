import os
import requests
from threading import Lock
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

# Headers required by Supabase PostgREST API
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

# Thread-safe in-memory cache
# Structure: { "room_code": [list of message dicts] }
_cache = {}
_lock = Lock()


def get_messages(room: str) -> list:
    """Return all stored messages for a room, checking cache first."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    
    with _lock:
        if room in _cache:
            return _cache[room]
            
    # Cache miss: fetch from Supabase
    try:
        url = f"{SUPABASE_URL}/rest/v1/messages?room=eq.{room}&select=*&order=ts.asc"
        res = requests.get(url, headers=HEADERS, timeout=5)
        res.raise_for_status()
        msgs = res.json()
        
        # Transform back to expected format
        for m in msgs:
            m["id"] = m["client_id"]
            
        with _lock:
            _cache[room] = msgs
            
        return msgs
    except Exception as e:
        print(f"Error getting messages: {e}")
        return []


def add_message(room: str, msg: dict) -> dict:
    """Add a message to the Supabase store and cache it instantly."""
    if not SUPABASE_URL or not SUPABASE_KEY:
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
    
    # Save to Supabase
    try:
        url = f"{SUPABASE_URL}/rest/v1/messages"
        requests.post(url, headers=HEADERS, json=data, timeout=5)
    except Exception as e:
        print(f"Error inserting message: {e}")
        
    return msg


def delete_message(room: str, msg_id: str) -> bool:
    """Delete a message by client_id from both cache and Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return False
        
    # Update cache
    with _lock:
        if room in _cache:
            _cache[room] = [m for m in _cache[room] if m.get("id") != msg_id]
            
    try:
        url = f"{SUPABASE_URL}/rest/v1/messages?client_id=eq.{msg_id}"
        res = requests.delete(url, headers=HEADERS, timeout=5)
        return res.status_code in [200, 204]
    except Exception as e:
        print(f"Error deleting message: {e}")
        return False


def mark_seen(room: str, up_to_ts: float, reader: str) -> None:
    """Mark all messages up to a timestamp as seen by reader in cache and Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
        
    # Update cache
    changed = False
    with _lock:
        if room in _cache:
            for m in _cache[room]:
                if m.get("ts", 0) <= up_to_ts and m.get("sender") != reader and not m.get("seen"):
                    m["seen"] = True
                    changed = True
                    
    # Only update DB if something actually changed
    if changed:
        try:
            # 1. Fetch IDs that need updating
            url = f"{SUPABASE_URL}/rest/v1/messages?room=eq.{room}&ts=lte.{up_to_ts}&sender=neq.{reader}&seen=eq.false&select=id"
            fetch_res = requests.get(url, headers=HEADERS, timeout=5)
            if fetch_res.status_code == 200:
                rows = fetch_res.json()
                if rows:
                    ids = [str(r["id"]) for r in rows]
                    ids_str = ",".join(ids)
                    
                    # 2. Update those IDs
                    update_url = f"{SUPABASE_URL}/rest/v1/messages?id=in.({ids_str})"
                    requests.patch(update_url, headers=HEADERS, json={"seen": True}, timeout=5)
        except Exception as e:
            print(f"Error marking seen: {e}")

def upsert_user(username: str, room: str, is_online: bool) -> None:
    """Insert or update a user's online status and last active timestamp in Supabase."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return
        
    try:
        url = f"{SUPABASE_URL}/rest/v1/users?on_conflict=username,room"
        data = {
            "username": username,
            "room": room,
            "is_online": is_online,
            "last_active": "now()"  # PostgREST handles now() on timestamp columns if mapped properly, 
                                    # but safer to just omit it and let default handle, 
                                    # or we can let Postgres handle it. Actually, for update, we need to pass a timestamp.
        }
        
        # Let's get current ISO timestamp
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        data["last_active"] = now
        
        # We use an upsert: POST with Prefer: resolution=merge-duplicates
        headers = HEADERS.copy()
        headers["Prefer"] = "resolution=merge-duplicates"
        
        requests.post(url, headers=headers, json=data, timeout=5)
    except Exception as e:
        print(f"Error upserting user: {e}")
