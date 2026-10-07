import os
import unittest
from unittest.mock import patch
from app import app


class MaintenanceTests(unittest.TestCase):
    def test_site_and_direct_media_are_hidden_but_enrollment_stays_available(self):
        with patch.dict(os.environ, {"MAINTENANCE_MODE": "true"}):
            client = app.test_client()
            for path in ["/", "/maintenance", "/photos", "/static/photos/photo1.jpg"]:
                response = client.get(path)
                self.assertEqual(response.status_code, 503)
                self.assertIn("Kocan bir şeyler deniyor", response.get_data(as_text=True))
                self.assertIn("no-store", response.headers["Cache-Control"])
            self.assertEqual(client.get("/api/daily-photo").get_json()["error"], "maintenance")
            self.assertEqual(client.get("/healthz").status_code, 200)
            self.assertEqual(client.get("/api/device").status_code, 200)
            setup = client.get("/device-setup")
            self.assertEqual(setup.status_code, 200)
            self.assertIn('name="device-next" content="/maintenance"', setup.get_data(as_text=True))
            self.assertEqual(client.get("/static/js/device_setup.js").status_code, 200)
            self.assertEqual(client.get("/static/css/maintenance.css").status_code, 200)
            self.assertEqual(client.post("/api/device/enroll", json={}).status_code, 403)

    def test_disabling_maintenance_restores_site_and_destination(self):
        with patch.dict(os.environ, {"MAINTENANCE_MODE": "false"}):
            client = app.test_client()
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/maintenance").headers["Location"], "/")
            self.assertIn('name="device-next" content="/"', client.get("/device-setup").get_data(as_text=True))
