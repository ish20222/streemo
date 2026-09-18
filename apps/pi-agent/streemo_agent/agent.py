"""
Streemo Pi agent — syncs queues from the dashboard and drives video/music players.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    import websocket  # websocket-client
except ImportError:
    websocket = None  # type: ignore

LOG = logging.getLogger("streemo")

DEFAULT_CACHE = Path(os.environ.get("STREEMO_CACHE", "/var/lib/streemo/cache"))
DEFAULT_STATE = Path(os.environ.get("STREEMO_STATE", "/var/lib/streemo/state"))
CONFIG_PATH = Path(os.environ.get("STREEMO_CONFIG", "/etc/streemo/device.env"))


def load_config(path: Path = CONFIG_PATH) -> dict[str, str]:
    cfg: dict[str, str] = {}
    if not path.exists():
        return cfg
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_dirs(*paths: Path) -> None:
    for p in paths:
        p.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


def signal_service(unit: str) -> None:
    """Ask player loops to reload via flag files (no root required)."""
    flag = DEFAULT_STATE / f"{unit}.reload"
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text(str(time.time()))
    try:
        subprocess.run(
            ["systemctl", "kill", "-s", "HUP", unit],
            check=False,
            capture_output=True,
        )
    except FileNotFoundError:
        pass


class CacheManager:
    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        ensure_dirs(cache_dir)

    def path_for(self, checksum: str, filename: str) -> Path:
        ext = Path(filename).suffix or ""
        return self.cache_dir / f"{checksum}{ext}"

    def download(self, url: str, dest: Path, expected_checksum: str) -> bool:
        if dest.exists() and sha256_file(dest) == expected_checksum:
            return True
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix(dest.suffix + ".partial")
        LOG.info("Downloading %s", dest.name)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "streemo-agent/1.0"})
            with urllib.request.urlopen(req, timeout=120) as resp, tmp.open("wb") as out:
                while True:
                    chunk = resp.read(1024 * 256)
                    if not chunk:
                        break
                    out.write(chunk)
            digest = sha256_file(tmp)
            if digest != expected_checksum:
                LOG.error(
                    "Checksum mismatch for %s: got %s want %s",
                    dest.name,
                    digest[:12],
                    expected_checksum[:12],
                )
                tmp.unlink(missing_ok=True)
                return False
            tmp.replace(dest)
            return True
        except Exception as exc:
            LOG.error("Download failed: %s", exc)
            tmp.unlink(missing_ok=True)
            return False

    def prune(self, keep_checksums: set[str]) -> None:
        for path in self.cache_dir.iterdir():
            if not path.is_file():
                continue
            if path.suffix == ".partial":
                path.unlink(missing_ok=True)
                continue
            stem = path.stem
            # filename is checksum + ext; stem may include dots in checksum? sha256 has none
            if stem not in keep_checksums:
                LOG.info("Pruning %s", path.name)
                path.unlink(missing_ok=True)


class StreemoAgent:
    def __init__(self) -> None:
        self.cfg = load_config()
        self.server_url = (
            os.environ.get("STREEMO_SERVER_URL")
            or self.cfg.get("STREEMO_SERVER_URL")
            or ""
        ).rstrip("/")
        self.device_token = (
            os.environ.get("STREEMO_DEVICE_TOKEN")
            or self.cfg.get("STREEMO_DEVICE_TOKEN")
            or ""
        )
        self.device_id = (
            os.environ.get("STREEMO_DEVICE_ID")
            or self.cfg.get("STREEMO_DEVICE_ID")
            or ""
        )
        self.cache = CacheManager(DEFAULT_CACHE)
        self.state_dir = DEFAULT_STATE
        ensure_dirs(self.state_dir, DEFAULT_CACHE)
        self._ws = None
        self._stop = threading.Event()
        self._manifest_lock = threading.Lock()
        self.playback: dict[str, Any] = {
            "videoMediaId": None,
            "musicMediaId": None,
            "videoStatus": "idle",
            "musicStatus": "idle",
            "videoPositionSec": None,
            "musicPositionSec": None,
        }
        self.audio_sink = "analog"
        self.video_enabled = True
        self.music_enabled = True
        self._paused = False

    def _api(self, path: str) -> Any:
        url = f"{self.server_url}{path}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {self.device_token}",
                "User-Agent": "streemo-agent/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())

    def fetch_manifest(self) -> dict[str, Any] | None:
        try:
            if self.device_id:
                return self._api(f"/api/devices/{self.device_id}/manifest")
            return self._api("/api/device/manifest")
        except Exception as exc:
            LOG.warning("Manifest fetch failed: %s", exc)
            return None

    def sync_manifest(self, manifest: dict[str, Any] | None = None) -> None:
        with self._manifest_lock:
            manifest = manifest or self.fetch_manifest()
            if not manifest:
                LOG.info("No manifest; keeping last cached queues")
                return

            self.audio_sink = manifest.get("audioSink") or "analog"
            self.video_enabled = bool(manifest.get("videoEnabled", True))
            self.music_enabled = bool(manifest.get("musicEnabled", True))
            if not self.device_id:
                self.device_id = manifest.get("deviceId") or self.device_id

            keep: set[str] = set()
            video_paths: list[dict[str, Any]] = []
            music_paths: list[dict[str, Any]] = []

            for item in manifest.get("videoQueue") or []:
                keep.add(item["checksum"])
                dest = self.cache.path_for(item["checksum"], item["filename"])
                ok = self.cache.download(item["downloadUrl"], dest, item["checksum"])
                if ok:
                    video_paths.append(
                        {
                            "mediaId": item["mediaId"],
                            "path": str(dest),
                            "checksum": item["checksum"],
                            "filename": item["filename"],
                        }
                    )

            for item in manifest.get("musicQueue") or []:
                keep.add(item["checksum"])
                dest = self.cache.path_for(item["checksum"], item["filename"])
                ok = self.cache.download(item["downloadUrl"], dest, item["checksum"])
                if ok:
                    music_paths.append(
                        {
                            "mediaId": item["mediaId"],
                            "path": str(dest),
                            "checksum": item["checksum"],
                            "filename": item["filename"],
                        }
                    )

            self.cache.prune(keep)

            write_json(
                self.state_dir / "video_queue.json",
                {
                    "enabled": self.video_enabled,
                    "muted": True,
                    "items": video_paths if self.video_enabled else [],
                    "updatedAt": time.time(),
                },
            )
            write_json(
                self.state_dir / "music_queue.json",
                {
                    "enabled": self.music_enabled,
                    "audioSink": self.audio_sink,
                    "items": music_paths if self.music_enabled else [],
                    "updatedAt": time.time(),
                },
            )
            write_json(
                self.state_dir / "config.json",
                {
                    "audioSink": self.audio_sink,
                    "videoEnabled": self.video_enabled,
                    "musicEnabled": self.music_enabled,
                    "paused": self._paused,
                },
            )
            signal_service("streemo-video")
            signal_service("streemo-music")
            LOG.info(
                "Synced queues: %d video, %d music (sink=%s)",
                len(video_paths),
                len(music_paths),
                self.audio_sink,
            )

    def clear_cache(self) -> None:
        for path in DEFAULT_CACHE.iterdir():
            if path.is_file():
                path.unlink(missing_ok=True)
        self.sync_manifest()

    def handle_command(self, msg: dict[str, Any]) -> None:
        action = msg.get("action")
        LOG.info("Command: %s", action)
        if action == "reload":
            self.sync_manifest()
        elif action == "clear_cache":
            self.clear_cache()
        elif action == "pause":
            self._paused = True
            write_json(
                self.state_dir / "config.json",
                {
                    "audioSink": self.audio_sink,
                    "videoEnabled": self.video_enabled,
                    "musicEnabled": self.music_enabled,
                    "paused": True,
                },
            )
            signal_service("streemo-video")
            signal_service("streemo-music")
        elif action == "resume":
            self._paused = False
            write_json(
                self.state_dir / "config.json",
                {
                    "audioSink": self.audio_sink,
                    "videoEnabled": self.video_enabled,
                    "musicEnabled": self.music_enabled,
                    "paused": False,
                },
            )
            signal_service("streemo-video")
            signal_service("streemo-music")
        elif action == "skip_video":
            (self.state_dir / "video.skip").write_text(str(time.time()))
            signal_service("streemo-video")
        elif action == "skip_music":
            (self.state_dir / "music.skip").write_text(str(time.time()))
            signal_service("streemo-music")

    def _ws_url(self) -> str:
        base = self.server_url.replace("https://", "wss://").replace("http://", "ws://")
        return f"{base}/ws/devices?token={self.device_token}"

    def _on_message(self, _ws: Any, message: str) -> None:
        try:
            msg = json.loads(message)
        except json.JSONDecodeError:
            return
        typ = msg.get("type")
        if typ == "queue_updated":
            threading.Thread(target=self.sync_manifest, daemon=True).start()
        elif typ == "command":
            self.handle_command(msg)
        elif typ == "config":
            if "audioSink" in msg and msg["audioSink"]:
                self.audio_sink = msg["audioSink"]
            if "videoEnabled" in msg:
                self.video_enabled = bool(msg["videoEnabled"])
            if "musicEnabled" in msg:
                self.music_enabled = bool(msg["musicEnabled"])
            threading.Thread(target=self.sync_manifest, daemon=True).start()

    def _heartbeat_loop(self, ws: Any) -> None:
        while not self._stop.is_set():
            # Read playback state written by players
            pb_path = self.state_dir / "playback.json"
            if pb_path.exists():
                try:
                    self.playback.update(json.loads(pb_path.read_text()))
                except Exception:
                    pass
            try:
                ws.send(
                    json.dumps({"type": "heartbeat", "playback": self.playback})
                )
            except Exception:
                break
            self._stop.wait(15)

    def run_ws(self) -> None:
        if websocket is None:
            LOG.error("websocket-client not installed")
            return
        while not self._stop.is_set():
            try:
                LOG.info("Connecting WebSocket…")
                ws = websocket.WebSocketApp(
                    self._ws_url(),
                    on_message=self._on_message,
                    on_error=lambda _w, e: LOG.warning("WS error: %s", e),
                    on_close=lambda *_: LOG.info("WS closed"),
                )
                self._ws = ws

                def on_open(_w: Any) -> None:
                    LOG.info("WS connected")
                    threading.Thread(
                        target=self._heartbeat_loop, args=(ws,), daemon=True
                    ).start()
                    threading.Thread(target=self.sync_manifest, daemon=True).start()

                ws.on_open = on_open
                ws.run_forever(ping_interval=30, ping_timeout=10)
            except Exception as exc:
                LOG.warning("WS loop error: %s", exc)
            if self._stop.is_set():
                break
            LOG.info("Reconnecting in 5s…")
            time.sleep(5)

    def run_poll_fallback(self) -> None:
        """If WS unavailable, poll manifest periodically (also used offline recovery)."""
        while not self._stop.is_set():
            self.sync_manifest()
            self._stop.wait(60)

    def run(self) -> None:
        if not self.server_url or not self.device_token:
            LOG.error(
                "Missing STREEMO_SERVER_URL or STREEMO_DEVICE_TOKEN. Run streemo-pair first."
            )
            sys.exit(1)

        # Initial sync so offline playback works from last cache after boot
        self.sync_manifest()

        if websocket is None:
            LOG.warning("Running in HTTP poll mode only")
            self.run_poll_fallback()
            return

        # WS primary + slow poll backup
        poll = threading.Thread(target=self.run_poll_fallback, daemon=True)
        poll.start()
        self.run_ws()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    agent = StreemoAgent()

    def _stop(*_args: Any) -> None:
        agent._stop.set()
        if agent._ws:
            try:
                agent._ws.close()
            except Exception:
                pass

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    agent.run()


if __name__ == "__main__":
    main()
