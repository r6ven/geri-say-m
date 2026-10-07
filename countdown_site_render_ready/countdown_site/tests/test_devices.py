import copy
import hashlib
import hmac
import json
import os
import secrets
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app
import device_identity
import device_routes


class DeviceTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.token = secrets.token_urlsafe(32)
        self.records = {}
        self.invites = {device_identity.digest(self.token): "seyda-phone"}
        self.env = patch.dict(os.environ, {"DEVICE_STORAGE_URL": "https://script.google.com/macros/s/test/exec", "DEVICE_STORAGE_SECRET": "x" * 64})
        self.env.start()
        self.call = patch.object(device_identity, "storage_call", side_effect=self.storage)
        self.call.start()

    def tearDown(self):
        self.call.stop()
        self.env.stop()

    def storage(self, action, **params):
        if action == "claim":
            slot = self.invites.pop(params["invite_hash"], None)
            if not slot: return {"error": "invalid_invite"}
            record = {"recognized": True, "device_id": slot, "person": "seyda", "name": "Şeyda", "label": "Telefon"}
            self.records[params["device_hash"]] = record
            return record
        if action == "recognize":
            return copy.deepcopy(self.records.get(params["device_hash"], {"recognized": False}))
        raise AssertionError(action)

    def setup(self, client=None):
        client = client or self.client
        response = client.get("/device-setup", base_url="https://localhost")
        import re
        csrf = re.search(r'name="device-csrf" content="([^"]+)"', response.get_data(as_text=True)).group(1)
        return {"Origin": "https://localhost", "X-Device-CSRF": csrf}

    def claim(self, client=None, headers=None):
        client = client or self.client
        return client.post("/api/device/enroll", base_url="https://localhost", headers=headers or self.setup(client), json={"invite": self.token})

    def test_private_cookie_and_recognition_survive_new_client_session(self):
        response = self.claim()
        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.getlist("Set-Cookie")[0]
        for flag in ["__Host-site_device", "Secure", "HttpOnly", "SameSite=Strict", "Path=/"]:
            self.assertIn(flag, cookie_header)
        identity = self.client.get("/api/device", base_url="https://localhost").get_json()
        self.assertTrue(identity["recognized"])
        self.assertEqual(identity["person"], "seyda")
        self.assertNotIn("device_hash", identity)
        self.assertNotIn("invite", identity)
        cookie = self.client.get_cookie(device_identity.COOKIE_NAME)
        self.assertNotIn(cookie.value, json.dumps(self.records))
        self.assertNotIn(self.token, json.dumps(self.records))
        another_session = app.test_client()
        another_session.set_cookie(device_identity.COOKIE_NAME, cookie.value)
        self.assertTrue(another_session.get("/api/device", base_url="https://localhost").get_json()["recognized"])

    def test_invitation_is_single_use_and_other_device_stays_unknown(self):
        self.assertEqual(self.claim().status_code, 200)
        other = app.test_client()
        self.assertFalse(other.get("/api/device", base_url="https://localhost").get_json()["recognized"])
        self.assertEqual(self.claim(other).status_code, 400)
        self.assertIsNone(other.get_cookie(device_identity.COOKIE_NAME))

    def test_csrf_wrong_origin_and_invalid_body_do_not_consume_link(self):
        self.assertEqual(self.claim(headers={"Origin": "https://localhost"}).status_code, 403)
        headers = self.setup()
        headers["Origin"] = "https://attacker.example"
        self.assertEqual(self.claim(headers=headers).status_code, 403)
        headers = self.setup()
        self.assertEqual(self.client.post("/api/device/enroll", base_url="https://localhost", headers=headers, json=[]).status_code, 400)
        self.assertIn(device_identity.digest(self.token), self.invites)

    def test_proxy_https_origin_and_oversized_body(self):
        with patch.dict(os.environ, {"RENDER_EXTERNAL_URL": "https://geri-sayim.onrender.com"}):
            headers = self.setup()
            headers["Origin"] = "https://geri-sayim.onrender.com"
            self.assertEqual(self.claim(headers=headers).status_code, 200)
        headers = self.setup()
        self.assertEqual(self.client.post("/api/device/enroll", base_url="https://localhost", headers=headers, json={"invite": "x" * 3000}).status_code, 413)

    def test_active_browser_cannot_switch_identity(self):
        self.claim()
        self.assertEqual(self.claim().status_code, 409)

    def test_revocation_is_applied_on_next_visit(self):
        self.claim()
        self.records.clear()
        self.assertFalse(self.client.get("/api/device", base_url="https://localhost").get_json()["recognized"])

    def test_storage_failure_does_not_authenticate_or_set_cookie(self):
        with patch.object(device_identity, "storage_call", side_effect=device_identity.StorageUnavailable):
            self.assertEqual(self.claim().status_code, 503)
            self.assertIsNone(self.client.get_cookie(device_identity.COOKIE_NAME))

    def test_unconfigured_and_malformed_cookie_are_unknown(self):
        with patch.dict(os.environ, {"DEVICE_STORAGE_URL": "", "DEVICE_STORAGE_SECRET": ""}):
            self.assertEqual(self.client.get("/api/device").get_json(), {"recognized": False, "enabled": False})
        self.client.set_cookie(device_identity.COOKIE_NAME, "bad")
        self.assertFalse(self.client.get("/api/device", base_url="https://localhost").get_json()["recognized"])

    def test_page_headers_do_not_leak_invitation(self):
        response = self.client.get("/device-setup", base_url="https://localhost")
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertIn("script-src 'self'", response.headers["Content-Security-Policy"])


class SignedGatewayTests(unittest.TestCase):
    def test_gateway_request_has_valid_hmac_and_only_hashes(self):
        class Reply:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b'{"recognized": false}'
        with patch.dict(os.environ, {"DEVICE_STORAGE_URL": "https://script.google.com/macros/s/test/exec", "DEVICE_STORAGE_SECRET": "x" * 64}), patch.object(device_identity.urllib.request, "urlopen", return_value=Reply()) as send:
            token = secrets.token_urlsafe(32)
            device_identity.recognize(token)
            envelope = json.loads(send.call_args.args[0].data)
            self.assertNotIn(token, send.call_args.args[0].data.decode())
            expected = hmac.new(b"x" * 64, envelope["payload"].encode(), hashlib.sha256).hexdigest()
            self.assertEqual(expected, envelope["signature"])
            self.assertEqual(json.loads(envelope["payload"])["device_hash"], device_identity.digest(token))

    def test_invalid_gateway_and_bad_response_fail_closed(self):
        with patch.dict(os.environ, {"DEVICE_STORAGE_URL": "http://attacker.example", "DEVICE_STORAGE_SECRET": "x" * 64}):
            with self.assertRaises(device_identity.StorageUnavailable): device_identity.storage_call("recognize")
        with patch.object(device_identity, "storage_call", return_value={"recognized": True, "device_id": "ridvan-phone", "person": "seyda"}):
            with self.assertRaises(device_identity.StorageUnavailable): device_identity.recognize(secrets.token_urlsafe(32))


if __name__ == "__main__": unittest.main()
