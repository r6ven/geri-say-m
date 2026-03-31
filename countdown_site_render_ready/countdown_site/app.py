from flask import Flask, render_template
from datetime import datetime, timezone

app = Flask(__name__)

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
