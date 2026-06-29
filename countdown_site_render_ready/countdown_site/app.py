import os
import json
import hashlib
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo
from flask import Flask, render_template, jsonify
from datetime import datetime, timezone

app = Flask(__name__)

DAILY_PHOTO_CACHE = {
    "date": None,
    "data": None
}


def get_istanbul_today_key():
    return datetime.now(ZoneInfo("Europe/Istanbul")).strftime("%Y-%m-%d")


def fetch_drive_photos():
    api_key = os.environ.get("GOOGLE_API_KEY")
    folder_id = os.environ.get("DRIVE_FOLDER_ID")

    if not api_key or not folder_id:
        raise RuntimeError("GOOGLE_API_KEY veya DRIVE_FOLDER_ID eksik.")

    photos = []
    page_token = None

    while True:
        query = f"'{folder_id}' in parents and trashed = false"

        params = {
            "key": api_key,
            "q": query,
            "fields": "nextPageToken,files(id,name,mimeType)",
            "pageSize": "1000"
        }

        if page_token:
            params["pageToken"] = page_token

        url = "https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(params)

        with urllib.request.urlopen(url, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))

        for file in data.get("files", []):
            mime_type = file.get("mimeType", "")

            if mime_type.startswith("image/"):
                photos.append({
                    "id": file["id"],
                    "name": file.get("name", "Günün fotoğrafı"),
                    "mime_type": mime_type
                })

        page_token = data.get("nextPageToken")

        if not page_token:
            break

    photos.sort(key=lambda item: item["name"].lower())

    return photos


def choose_daily_photo():
    today_key = get_istanbul_today_key()

    if DAILY_PHOTO_CACHE["date"] == today_key and DAILY_PHOTO_CACHE["data"]:
        return DAILY_PHOTO_CACHE["data"]

    photos = fetch_drive_photos()

    if not photos:
        raise RuntimeError("Drive klasöründe görsel bulunamadı.")

    hash_value = hashlib.sha256(today_key.encode("utf-8")).hexdigest()
    selected_index = int(hash_value, 16) % len(photos)
    selected = photos[selected_index]

    file_id = selected["id"]

    result = {
        "date": today_key,
        "name": selected["name"],
        "image_url": f"https://drive.google.com/thumbnail?id={file_id}&sz=w1200",
        "download_url": f"https://drive.google.com/uc?export=download&id={file_id}",
        "view_url": f"https://drive.google.com/file/d/{file_id}/view"
    }

    DAILY_PHOTO_CACHE["date"] = today_key
    DAILY_PHOTO_CACHE["data"] = result

    return result


@app.route("/api/daily-photo")
def daily_photo():
    try:
        return jsonify(choose_daily_photo())
    except Exception as error:
        return jsonify({
            "error": str(error)
        }), 500

# Fotoğrafları static/photos içine aşağıdaki isimlerle koy:
# photo1.jpg, photo2.jpg, ... photo12.jpg
PHOTOS = [
    {"src": f"photos/photo{i}.jpg", "alt": f"Anı fotoğrafı {i}"}
    for i in range(1, 13)
]

COUNTDOWNS = [
    {
        "id": "countdown1",
        "title": "Birlikte geçen zaman",
        "label": "21 Haziran 2026",
        "target_iso": "2026-06-21T00:00:00",
        "accent": "gold"
    },
    {
        "id": "countdown2",
        "title": "31 Ekim 2026'ya",
        "label": "31 Ekim 2026",
        "target_iso": "2026-10-31T00:00:00",
        "accent": "rose"
    }
]

@app.route('/')
def home():
    return render_template(
        'index.html',
        countdowns=COUNTDOWNS,
        photos=PHOTOS,
        year=datetime.now(timezone.utc).year
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
