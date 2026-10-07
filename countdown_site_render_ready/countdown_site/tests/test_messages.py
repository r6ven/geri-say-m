import io
import os
import re
import secrets
import unittest
from unittest.mock import patch
from app import app
import message_routes
from device_identity import COOKIE_NAME, StorageUnavailable


class MessageTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"MAINTENANCE_MODE":"false"})
        self.env.start()
        self.client = app.test_client()
        self.client.set_cookie(COOKIE_NAME, secrets.token_urlsafe(32))
        with patch.object(message_routes,"recognize",return_value={"recognized":True,"name":"Rıdvan"}):
            response = self.client.get("/messages",base_url="https://localhost")
        csrf = re.search(r'name="message-csrf" content="([^"]+)"',response.get_data(as_text=True)).group(1)
        self.headers={"Origin":"https://localhost","X-Message-CSRF":csrf}

    def tearDown(self): self.env.stop()

    def test_unknown_device_cannot_list_or_download_and_does_not_contact_storage(self):
        self.client.delete_cookie(COOKIE_NAME)
        with patch.object(message_routes,"storage_call") as call:
            for path in ["/api/messages","/api/messages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media"]:
                self.assertEqual(self.client.get(path).status_code,403)
            call.assert_not_called()

    def test_revoked_device_is_rejected_by_gateway(self):
        with patch.object(message_routes,"storage_call",return_value={"error":"unrecognized"}):
            self.assertEqual(self.client.get("/api/messages").status_code,403)

    def test_cross_origin_write_is_blocked(self):
        with patch.object(message_routes,"storage_call") as call:
            response=self.client.post("/api/messages",base_url="https://localhost",headers={**self.headers,"Origin":"https://other.example"},data={"text":"private"})
            self.assertEqual(response.status_code,403);call.assert_not_called()

    def test_send_uses_cookie_hash_and_validates_uploaded_bytes(self):
        with patch.object(message_routes,"storage_call",return_value={"sent":True}) as call:
            response=self.client.post("/api/messages",base_url="https://localhost",headers=self.headers,data={"text":"=HYPERLINK(test) ❤️","client_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","media":(io.BytesIO(b"GIF89a"+b"test"),"gif.gif")})
            self.assertEqual(response.status_code,200)
            self.assertEqual(call.call_args.kwargs["mime"],"image/gif")
            self.assertEqual(len(call.call_args.kwargs["device_hash"]),64)
            self.assertNotIn("person",call.call_args.kwargs)
            bad=self.client.post("/api/messages",base_url="https://localhost",headers=self.headers,data={"client_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","media":(io.BytesIO(b"<svg onload='alert(1)'>"),"image.png")})
            self.assertEqual(bad.status_code,400)
            large=self.client.post("/api/messages",base_url="https://localhost",headers=self.headers,data={"client_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","media":(io.BytesIO(b"GIF89a"+b"x"*(512*1024)),"gif.gif")})
            self.assertEqual(large.status_code,413)

    def test_media_is_private_and_storage_errors_fail_closed(self):
        with patch.object(message_routes,"storage_call",return_value={"mime":"image/gif","media":"R0lGODlh"}):
            response=self.client.get("/api/messages/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/media")
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.headers["Content-Type"],"image/gif")
            self.assertIn("no-store",response.headers["Cache-Control"])
        with patch.object(message_routes,"storage_call",side_effect=StorageUnavailable()):
            self.assertEqual(self.client.get("/api/messages").status_code,503)

    def test_read_requires_valid_csrf_and_bounded_ids(self):
        with patch.object(message_routes,"storage_call",return_value={"read":True}):
            self.assertEqual(self.client.post("/api/messages/read",base_url="https://localhost",headers=self.headers,json={"ids":["bad"]}).status_code,400)
            self.assertEqual(self.client.post("/api/messages/read",base_url="https://localhost",headers=self.headers,json={"ids":[]}).status_code,200)
