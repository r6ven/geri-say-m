"""Private messages: browser cookie authenticated by the signed Sheets gateway."""
import base64
import io
import os
import re
import secrets
from flask import Blueprint, jsonify, make_response, render_template, request, send_file
from itsdangerous import BadSignature, URLSafeTimedSerializer
from device_identity import COOKIE_NAME, TOKEN_PATTERN, StorageUnavailable, digest, storage_call, recognize

messages = Blueprint("messages", __name__)
MAX_MEDIA = 512 * 1024
UUID = re.compile(r"^[a-f0-9-]{36}$")
signer = URLSafeTimedSerializer(os.environ.get("DEVICE_STORAGE_SECRET") or secrets.token_bytes(32), salt="private-messages")


def call(action, **params):
    token = request.cookies.get(COOKIE_NAME, "")
    if not TOKEN_PATTERN.fullmatch(token):
        return {"error": "unrecognized"}
    return storage_call(action, device_hash=digest(token), **params)


@messages.after_request
def private(response):
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


@messages.before_request
def guard_writes():
    if request.method != "POST": return None
    origin = os.environ.get("RENDER_EXTERNAL_URL", request.host_url).rstrip("/")
    if request.headers.get("Origin") != origin: return jsonify(error="invalid_request"), 403
    try:
        expected = signer.loads(request.headers.get("X-Message-CSRF", ""), max_age=3600)
        if not secrets.compare_digest(expected, request.cookies.get("__Host-message_csrf", "")): raise BadSignature("CSRF")
    except BadSignature: return jsonify(error="invalid_request"), 403
    if request.content_length and request.content_length > MAX_MEDIA + 16384:
        return jsonify(error="too_large"), 413


@messages.errorhandler(StorageUnavailable)
def unavailable(_):
    return jsonify(error="storage_unavailable"), 503


def result(data):
    if data.get("error"):
        return jsonify(data), 403 if data["error"] == "unrecognized" else 400
    return jsonify(data)


@messages.get("/messages")
def inbox():
    identity = recognize(request.cookies.get(COOKIE_NAME))
    if not identity["recognized"]:
        return render_template("messages_locked.html"), 403
    nonce = secrets.token_urlsafe(32)
    response = make_response(render_template("messages.html", identity=identity, csrf_token=signer.dumps(nonce)))
    response.set_cookie("__Host-message_csrf", nonce, max_age=3600, secure=True, httponly=True, samesite="Strict", path="/")
    return response


@messages.get("/api/messages")
def list_messages():
    return result(call("messages_list"))


def media_type(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"): return "image/png"
    if data.startswith(b"\xff\xd8\xff"): return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"): return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "image/webp"
    return None


@messages.post("/api/messages")
def send_message():
    text = request.form.get("text", "").strip()
    client_id = request.form.get("client_id", "")
    if len(text) > 2000 or not UUID.fullmatch(client_id): return jsonify(error="invalid_request"), 400
    upload = request.files.get("media")
    data = upload.read(MAX_MEDIA + 1) if upload else b""
    if len(data) > MAX_MEDIA: return jsonify(error="too_large"), 413
    mime = media_type(data) if data else ""
    if data and not mime: return jsonify(error="invalid_media"), 400
    if not text and not data: return jsonify(error="empty_message"), 400
    return result(call("messages_send", text=text, client_id=client_id, mime=mime,
                       media=base64.b64encode(data).decode("ascii")))


@messages.post("/api/messages/read")
def mark_read():
    body = request.get_json(silent=True)
    ids = body.get("ids") if isinstance(body, dict) else None
    if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(i, str) or not UUID.fullmatch(i) for i in ids):
        return jsonify(error="invalid_request"), 400
    return result(call("messages_read", ids=ids))


@messages.get("/api/messages/<message_id>/media")
def attachment(message_id):
    if not UUID.fullmatch(message_id): return jsonify(error="not_found"), 404
    data = call("messages_media", message_id=message_id)
    if data.get("error"): return jsonify(error=data["error"]), 403 if data["error"] == "unrecognized" else 404
    try: decoded = base64.b64decode(data["media"], validate=True)
    except (KeyError, ValueError): raise StorageUnavailable()
    if len(decoded) > MAX_MEDIA or media_type(decoded) != data.get("mime"): raise StorageUnavailable()
    return send_file(io.BytesIO(decoded), mimetype=data["mime"], download_name="mesaj-gorseli", max_age=0)
