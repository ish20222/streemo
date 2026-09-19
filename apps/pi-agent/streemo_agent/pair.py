"""Pair this Pi with a Streemo dashboard pairing code."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

CONFIG_DIR = Path("/etc/streemo")
CONFIG_PATH = CONFIG_DIR / "device.env"


def pair(server_url: str, pairing_code: str, name: str | None) -> None:
    server_url = server_url.rstrip("/")
    # Never send "name": null — Zod .optional() rejects null on older servers.
    payload: dict = {"pairingCode": pairing_code.upper().strip()}
    if name:
        payload["name"] = name
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{server_url}/api/devices/pair",
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "streemo-pair/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail or exc.reason}") from exc

    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    content = "\n".join(
        [
            f'STREEMO_SERVER_URL="{server_url}"',
            f'STREEMO_DEVICE_ID="{data["deviceId"]}"',
            f'STREEMO_DEVICE_TOKEN="{data["deviceToken"]}"',
            "",
        ]
    )
    CONFIG_PATH.write_text(content)
    os.chmod(CONFIG_PATH, 0o640)
    try:
        import grp
        import pwd

        gid = grp.getgrnam("streemo").gr_gid
        os.chown(CONFIG_PATH, 0, gid)
    except Exception:
        pass
    print(f"Paired as {data.get('name')} ({data['deviceId']})")
    print(f"Wrote {CONFIG_PATH}")
    print("Restart services: sudo systemctl restart streemo-agent streemo-video streemo-music")


def main() -> None:
    parser = argparse.ArgumentParser(description="Pair Raspberry Pi with Streemo")
    parser.add_argument("code", help="6-character pairing code from dashboard")
    parser.add_argument(
        "--server",
        default=os.environ.get("STREEMO_SERVER_URL", ""),
        help="Streemo server URL (https://…)",
    )
    parser.add_argument("--name", default=None, help="Optional device display name")
    args = parser.parse_args()
    if not args.server:
        print("Provide --server https://your-app.up.railway.app", file=sys.stderr)
        sys.exit(1)
    try:
        pair(args.server, args.code, args.name)
    except Exception as exc:
        print(f"Pairing failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
