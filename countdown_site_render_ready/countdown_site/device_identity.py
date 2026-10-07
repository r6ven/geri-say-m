"""Browser identity via a private Sheet and an authenticated Apps Script gateway."""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
import urllib.request

COOKIE_NAME = "__Host-site_device"
DEVICE_IDS = {"ridvan-phone", "ridvan-laptop", "seyda-phone", "seyda-laptop"}
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")


class StorageUnavailable(Exception):
    pass


def storage_enabled():
    return bool(os.environ.get("DEVICE_STORAGE_URL") and os.environ.get("DEVICE_STORAGE_SECRET"))


def digest(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def storage_call(action, **params):
    url = os.environ.get("DEVICE_STORAGE_URL", "")
    secret = os.environ.get("DEVICE_STORAGE_SECRET", "")
    if not re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec", url) or len(secret) < 32:
        raise StorageUnavailable()
    payload = json.dumps({"action": action, "timestamp": int(time.time()),
                         "nonce": secrets.token_urlsafe(24), **params}, separators=(",", ":"), ensure_ascii=False)
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    body = json.dumps({"payload": payload, "signature": signature}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read(1100000))
        if not isinstance(data, dict) or data.get("error") == "storage_unavailable":
            raise StorageUnavailable()
        return data
    except (ValueError, OSError) as exc:
        raise StorageUnavailable() from exc


def recognize(token):
    if not token or not TOKEN_PATTERN.fullmatch(token):
        return {"recognized": False}
    data = storage_call("recognize", device_hash=digest(token))
    if data.get("error"):
        raise StorageUnavailable()
    if not data.get("recognized"):
        return {"recognized": False}
    if data.get("device_id") not in DEVICE_IDS or data.get("person") not in ("ridvan", "seyda"):
        raise StorageUnavailable()
    if not data["device_id"].startswith(data["person"] + "-"):
        raise StorageUnavailable()
    return {"recognized": True, "device_id": data["device_id"], "person": data["person"],
            "name": "Rıdvan" if data["person"] == "ridvan" else "Şeyda", "label": data.get("label", "")}


def enroll(invite_token):
    if not isinstance(invite_token, str) or not TOKEN_PATTERN.fullmatch(invite_token):
        return {"error": "invalid_invite"}, None
    device_token = secrets.token_urlsafe(32)
    data = storage_call("claim", invite_hash=digest(invite_token), device_hash=digest(device_token))
    if data.get("error"):
        if data["error"] in ("invalid_invite", "already_registered"):
            return {"error": data["error"]}, None
        raise StorageUnavailable()
    if data.get("device_id") not in DEVICE_IDS:
        raise StorageUnavailable()
    return {"recognized": True, "device_id": data["device_id"], "name": data.get("name", ""),
            "label": data.get("label", "")}, device_token
