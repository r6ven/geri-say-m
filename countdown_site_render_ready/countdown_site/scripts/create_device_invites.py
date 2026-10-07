"""Run locally with Render's storage URL/secret. Printed URLs are private."""
import argparse
import secrets
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from device_identity import DEVICE_IDS, StorageUnavailable, digest, storage_call


def main():
    parser = argparse.ArgumentParser(description="Generate single-use enrollment links (72h).")
    parser.add_argument("--site-url", default="https://geri-sayim.onrender.com")
    parser.add_argument("--device", choices=sorted(DEVICE_IDS), action="append")
    args = parser.parse_args()
    parsed = urlparse(args.site_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        parser.error("Use the site's HTTPS origin only.")
    for slot in args.device or sorted(DEVICE_IDS):
        token = secrets.token_urlsafe(32)
        # Small allowance for network delay between client and gateway clocks.
        result = storage_call("create_invite", device_id=slot, invite_hash=digest(token), expires=int((time.time() + 71 * 3600) * 1000))
        if not result.get("created"):
            print(f"{slot}: {result.get('error', 'storage_unavailable')}", file=sys.stderr)
            continue
        print(f"{slot}: {args.site_url.rstrip('/')}/device-setup#invite={token}")


if __name__ == "__main__":
    try: main()
    except StorageUnavailable:
        sys.exit("Storage connection unavailable; no secret values were printed.")
