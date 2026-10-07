import copy
import importlib.util
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("countdown_app", ROOT / "app.py")
site = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = site
spec.loader.exec_module(site)


class SiteTests(unittest.TestCase):
    def setUp(self):
        self.cache = copy.deepcopy(site.DAILY_PHOTO_CACHE)
        site.DAILY_PHOTO_CACHE.update(date=None, data=None, photos=[], listed_at=0.0, retry_at=0.0)
        self.client = site.app.test_client()

    def tearDown(self):
        site.DAILY_PHOTO_CACHE.clear()
        site.DAILY_PHOTO_CACHE.update(self.cache)

    def test_media_discovery_only_existing_files_and_numeric_order(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            for name in ["photo10.jpg", "photo2.jpg", "surpriz.jpg", "kapak.jpg", "nikah-surpriz.mp4", "notes.txt"]:
                (folder / name).touch()
            (folder / "photo3.jpg").mkdir()
            with patch.object(site, "PHOTO_DIR", folder):
                photos, videos = site.list_media()
            self.assertEqual([p["src"] for p in photos], ["photos/photo2.jpg", "photos/photo10.jpg", "photos/kapak.jpg", "photos/surpriz.jpg"])
            self.assertEqual(videos[0]["src"], "photos/nikah-surpriz.mp4")
            self.assertEqual(videos[0]["poster"], "photos/kapak.jpg")

    def test_rotation_has_no_repeats_until_all_photos_shown(self):
        photos = [{"id": str(i), "name": str(i)} for i in range(10)]
        start = date(2026, 10, 1)
        ids = [site.select_daily_photo(photos, (start + timedelta(days=i)).isoformat())["id"] for i in range(20)]
        self.assertEqual(len(set(ids[:10])), 10)
        self.assertEqual(ids[:10], ids[10:])
        self.assertTrue(all(a != b for a, b in zip(ids, ids[1:])))
        self.assertEqual(site.select_daily_photo(photos, start.isoformat()), site.select_daily_photo(list(reversed(photos)), start.isoformat()))

    def test_date_rollover_reuses_list_and_selects_next_photo(self):
        photos = [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]
        with patch.object(site, "fetch_drive_photos", return_value=photos) as fetch, patch.object(site.time, "monotonic", return_value=1000):
            with patch.object(site, "get_istanbul_today_key", return_value="2026-10-01"):
                first = site.choose_daily_photo()
            with patch.object(site, "get_istanbul_today_key", return_value="2026-10-02"):
                second = site.choose_daily_photo()
            self.assertEqual(fetch.call_count, 1)
            self.assertNotEqual(first["image_url"], second["image_url"])
            self.assertEqual(second["date"], "2026-10-02")

    def test_drive_failure_preserves_last_success_and_limits_retry(self):
        previous = {"date": "2026-10-01", "image_url": "old.jpg", "name": "Old", "stale": False}
        site.DAILY_PHOTO_CACHE.update(date=previous["date"], data=previous)
        with patch.object(site, "get_istanbul_today_key", return_value="2026-10-02"), patch.object(site.time, "monotonic", return_value=1000), patch.object(site, "fetch_drive_photos", side_effect=RuntimeError("private detail")) as fetch:
            first = self.client.get("/api/daily-photo")
            second = self.client.get("/api/daily-photo")
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json["stale"])
        self.assertEqual(first.json["image_url"], "old.jpg")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(first.headers["Cache-Control"], "no-store")

    def test_initial_drive_failure_has_safe_message(self):
        with patch.object(site, "fetch_drive_photos", side_effect=RuntimeError("private detail")):
            response = self.client.get("/api/daily-photo")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("private detail", response.get_data(as_text=True))
        self.assertEqual(response.headers["Retry-After"], "60")

    def test_schedule_endpoint_is_removed(self):
        self.assertEqual(self.client.get("/api/availability").status_code, 404)

    def test_home_has_accessible_menu_galleries_no_quiz_or_replay(self):
        with patch.object(site, "list_media", return_value=([{"src": "photos/surpriz.jpg", "title": "Sürpriz", "caption": "Not", "poster": None}], [])):
            response = self.client.get("/")
        html = response.get_data(as_text=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn('aria-controls="siteMenu"', html)
        self.assertIn('data-open-dialog="photosDialog"', html)
        self.assertIn('data-open-dialog="videosDialog"', html)
        self.assertIn('disabled>İletişim', html)
        self.assertIn('2026-10-31T00:00:00+03:00', html)
        self.assertNotIn("nikahReplayBox", html)
        self.assertNotIn("qsOverlay", html)
        self.assertNotIn("localStorage", html)
        self.assertEqual(self.client.get("/healthz").json, {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
