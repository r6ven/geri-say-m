"""Read-only identity endpoint and explicit single-use browser enrollment."""
import secrets
import os
from flask import Blueprint, jsonify, make_response, render_template, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from device_identity import COOKIE_NAME, StorageUnavailable, enroll, recognize, storage_enabled

devices = Blueprint("devices", __name__)
ENROLL_COOKIE = "__Host-device_enroll"
# A configured gateway secret gives all workers the same CSRF signing key.
csrf_signer = URLSafeTimedSerializer(os.environ.get("DEVICE_STORAGE_SECRET") or secrets.token_bytes(32), salt="device-enrollment")


@devices.after_request
def private_headers(response):
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@devices.get("/device-setup")
def setup_page():
    nonce = secrets.token_urlsafe(32)
    response = make_response(render_template("device_setup.html", csrf_token=csrf_signer.dumps(nonce)))
    response.set_cookie(ENROLL_COOKIE, nonce, max_age=900, secure=True, httponly=True, samesite="Strict", path="/")
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response


@devices.post("/api/device/enroll")
def enroll_browser():
    if request.content_length and request.content_length > 2048:
        return jsonify({"error": "invalid_request"}), 413
    if not request.is_json:
        return jsonify({"error": "invalid_request"}), 400
    expected_origin = os.environ.get("RENDER_EXTERNAL_URL", request.host_url).rstrip("/")
    if request.headers.get("Origin") != expected_origin:
        return jsonify({"error": "invalid_request"}), 403
    try:
        nonce = csrf_signer.loads(request.headers.get("X-Device-CSRF", ""), max_age=900)
        cookie = request.cookies.get(ENROLL_COOKIE, "")
        if not cookie or not secrets.compare_digest(nonce, cookie):
            raise BadSignature("CSRF")
    except (BadSignature, SignatureExpired):
        return jsonify({"error": "invalid_request"}), 403
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "invalid_request"}), 400
    try:
        existing = recognize(request.cookies.get(COOKIE_NAME))
        if existing["recognized"]:
            return jsonify({"error": "already_registered", "name": existing["name"]}), 409
        data, token = enroll(body.get("invite"))
        if token is None:
            return jsonify(data), 400
        response = jsonify(data)
        response.set_cookie(COOKIE_NAME, token, max_age=365 * 86400, secure=True, httponly=True, samesite="Strict", path="/")
        response.delete_cookie(ENROLL_COOKIE, secure=True, httponly=True, samesite="Strict", path="/")
        return response
    except StorageUnavailable:
        return jsonify({"error": "storage_unavailable"}), 503


@devices.get("/api/device")
def current_browser():
    if not storage_enabled():
        return jsonify({"recognized": False, "enabled": False})
    try:
        return jsonify({**recognize(request.cookies.get(COOKIE_NAME)), "enabled": True})
    except StorageUnavailable:
        return jsonify({"recognized": False, "error": "storage_unavailable"}), 503
