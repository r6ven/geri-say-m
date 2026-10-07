import hashlib
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, make_response, redirect, render_template, request, url_for
from device_routes import devices

app = Flask(__name__)
app.register_blueprint(devices)
ROOT = Path(__file__).resolve().parent
PHOTO_DIR = ROOT / "static" / "photos"
ISTANBUL = ZoneInfo("Europe/Istanbul")
SITE = json.loads((ROOT / "site_config.json").read_text(encoding="utf-8"))
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg"}
DAILY_PHOTO_CACHE = {"date": None, "data": None, "photos": [], "listed_at": 0.0, "retry_at": 0.0}
DAILY_PHOTO_LOCK = threading.Lock()
LIST_TTL = 900
RETRY_DELAY = 60


def maintenance_enabled():
    return os.environ.get("MAINTENANCE_MODE", "").lower() in {"1", "true", "yes"}


@app.context_processor
def device_destination():
    return {"device_next_url": url_for("maintenance") if maintenance_enabled() else url_for("home")}


def maintenance_response():
    response = make_response(render_template("maintenance.html"), 503)
    response.headers["Cache-Control"] = "no-store, private"
    response.headers["Retry-After"] = "3600"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


@app.before_request
def hide_site_during_maintenance():
    if not maintenance_enabled():
        return None
    if request.endpoint in {"health", "maintenance", "devices.setup_page", "devices.enroll_browser", "devices.current_browser"}:
        return None
    if request.endpoint == "static" and request.view_args.get("filename") in {"css/style.css", "css/maintenance.css", "js/device_setup.js"}:
        return None
    if request.path.startswith("/api/"):
        response = jsonify({"error": "maintenance", "message": "Site bakımda."})
        response.status_code = 503
        response.headers["Cache-Control"] = "no-store, private"
        return response
    return maintenance_response()


@app.get("/maintenance")
def maintenance():
    if not maintenance_enabled():
        return redirect(url_for("home"))
    return maintenance_response()


def get_istanbul_today_key():
    return datetime.now(ISTANBUL).date().isoformat()


def media_sort_key(path):
    if path.stem.startswith("photo") and path.stem[5:].isdigit():
        return (0, int(path.stem[5:]), path.name)
    return (1, 0, path.name.casefold())


def list_media():
    photos, videos = [], []
    for path in sorted(PHOTO_DIR.iterdir() if PHOTO_DIR.exists() else [], key=media_sort_key):
        if not path.is_file():
            continue
        extension = path.suffix.lower()
        if extension not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
            continue
        notes = SITE.get("media_notes", {}).get(path.name, {})
        numbered = path.stem.startswith("photo") and path.stem[5:].isdigit()
        default_title = f"Anı fotoğrafı {path.stem[5:]}" if numbered else path.stem.replace("-", " ")
        item = {
            "src": f"photos/{path.name}",
            "title": notes.get("title", default_title),
            "caption": notes.get("caption", "Birlikte bir an." if extension in IMAGE_EXTENSIONS else "Birlikte bir anımız."),
            "poster": f"photos/{notes['poster']}" if notes.get("poster") and (PHOTO_DIR / notes["poster"]).is_file() else None,
        }
        (photos if extension in IMAGE_EXTENSIONS else videos).append(item)
    return photos, videos


def fetch_drive_photos():
    api_key = os.environ.get("GOOGLE_API_KEY")
    folder_id = os.environ.get("DRIVE_FOLDER_ID")
    if not api_key or not folder_id:
        raise RuntimeError("Drive ayarları eksik")
    photos, page_token = [], None
    while True:
        params = {
            "key": api_key,
            "q": f"'{folder_id}' in parents and trashed = false and mimeType contains 'image/'",
            "fields": "nextPageToken,files(id,name,mimeType)",
            "pageSize": "1000", "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
        }
        if page_token:
            params["pageToken"] = page_token
        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))
        photos.extend({"id": file["id"], "name": file.get("name", "Günün fotoğrafı")}
                      for file in data.get("files", []) if file.get("mimeType", "").startswith("image/"))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return sorted({photo["id"]: photo for photo in photos}.values(), key=lambda photo: photo["id"])


def select_daily_photo(photos, today_key):
    # Sabit, karıştırılmış sıra: bütün fotoğraflar gösterilmeden aynı fotoğraf dönmez.
    ordered = sorted(photos, key=lambda photo: (hashlib.sha256(("daily-rotation-v1:" + photo["id"]).encode()).hexdigest(), photo["id"]))
    day_index = (date.fromisoformat(today_key) - date(2026, 1, 1)).days
    return ordered[day_index % len(ordered)]


def choose_daily_photo():
    today_key = get_istanbul_today_key()
    with DAILY_PHOTO_LOCK:
        cached = DAILY_PHOTO_CACHE
        now = time.monotonic()
        if now < cached["retry_at"]:
            if cached["data"]:
                return {**cached["data"], "stale": cached["date"] != today_key, "retry_after_seconds": RETRY_DELAY}
            raise RuntimeError("Drive geçici olarak kullanılamıyor")
        try:
            if not cached["photos"] or now - cached["listed_at"] >= LIST_TTL:
                photos = fetch_drive_photos()
                if not photos:
                    raise RuntimeError("Drive klasöründe görsel bulunamadı")
                cached["photos"], cached["listed_at"] = photos, now
            selected = select_daily_photo(cached["photos"], today_key)
            file_id = urllib.parse.quote(selected["id"], safe="")
            result = {
                "date": today_key, "name": selected["name"], "stale": False,
                "image_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1200",
                "download_url": f"https://drive.google.com/uc?export=download&id={file_id}",
            }
            cached.update(date=today_key, data=result, retry_at=0.0)
            return result
        except Exception:
            cached["retry_at"] = now + RETRY_DELAY
            if cached["data"]:
                app.logger.warning("Günlük fotoğraf yenilenemedi; son başarılı fotoğraf kullanılıyor.")
                return {**cached["data"], "stale": cached["date"] != today_key, "retry_after_seconds": RETRY_DELAY}
            raise


@app.get("/api/daily-photo")
def daily_photo():
    try:
        response = jsonify(choose_daily_photo())
    except Exception:
        app.logger.warning("Günlük Drive fotoğrafı alınamadı.")
        response = jsonify({"error": "Günün karesi şu an yüklenemiyor.", "retry_after_seconds": RETRY_DELAY})
        response.status_code = 503
        response.headers["Retry-After"] = str(RETRY_DELAY)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/healthz")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
def home():
    photos, videos = list_media()
    return render_template("index.html", site=SITE, photos=photos, videos=videos, year=datetime.now(ISTANBUL).year)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=os.environ.get("FLASK_DEBUG") == "1")
