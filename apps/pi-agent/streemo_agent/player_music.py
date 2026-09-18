"""Music playlist player via mpv — analog (3.5mm), HDMI, or Bluetooth sink."""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

LOG = logging.getLogger("streemo-music")
STATE = Path(os.environ.get("STREEMO_STATE", "/var/lib/streemo/state"))
QUEUE = STATE / "music_queue.json"
CONFIG = STATE / "config.json"
SKIP = STATE / "music.skip"
PLAYBACK = STATE / "playback.json"
RELOAD_FLAG = STATE / "streemo-music.reload"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception:
        return {}


def write_playback(**kwargs: Any) -> None:
    data = read_json(PLAYBACK)
    data.update(kwargs)
    STATE.mkdir(parents=True, exist_ok=True)
    PLAYBACK.write_text(json.dumps(data))


def resolve_audio_device(sink: str) -> list[str]:
    """
    Map Streemo audioSink to mpv flags.
    - analog: onboard 3.5mm (ALSA default / hw:headphones on Pi)
    - hdmi: HDMI audio
    - bluetooth:<mac>: Pulse/PipeWire bluez sink
    """
    sink = (sink or "analog").strip().lower()
    if sink == "hdmi":
        return ["--audio-device=alsa/hw:0,1"]
    if sink.startswith("bluetooth:"):
        mac = sink.split(":", 1)[1].replace(":", "_").lower()
        # PipeWire / Pulse bluez sink naming
        return [f"--audio-device=pulse/bluez_sink.{mac}.a2dp_sink"]
    # analog / default — prefer headphones jack on Pi 4
    return ["--audio-device=alsa/hw:0,0"]


def build_mpv_cmd(paths: list[str], sink: str) -> list[str]:
    return [
        "mpv",
        "--no-video",
        "--loop-playlist=inf",
        "--really-quiet",
        *resolve_audio_device(sink),
        *paths,
    ]


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    reload_requested = False

    def on_hup(*_a: Any) -> None:
        nonlocal reload_requested
        reload_requested = True
        LOG.info("SIGHUP — reload playlist")

    signal.signal(signal.SIGHUP, on_hup)

    proc: subprocess.Popen[bytes] | None = None
    last_mtime = 0.0
    last_sink = ""
    index = 0

    while True:
        if RELOAD_FLAG.exists():
            RELOAD_FLAG.unlink(missing_ok=True)
            reload_requested = True

        queue = read_json(QUEUE)
        config = read_json(CONFIG)
        items = queue.get("items") or []
        sink = config.get("audioSink") or queue.get("audioSink") or "analog"
        enabled = queue.get("enabled", True) and not config.get("paused", False)
        mtime = QUEUE.stat().st_mtime if QUEUE.exists() else 0.0

        if SKIP.exists():
            SKIP.unlink(missing_ok=True)
            index = (index + 1) % max(len(items), 1)
            reload_requested = True

        paths = [i["path"] for i in items if Path(i["path"]).exists()]
        if index and paths:
            paths = paths[index:] + paths[:index]

        need_restart = (
            reload_requested
            or mtime != last_mtime
            or sink != last_sink
            or (proc is None and enabled and paths)
            or (proc is not None and proc.poll() is not None)
        )

        if not enabled or not paths:
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                proc = None
            write_playback(musicStatus="idle", musicMediaId=None)
            reload_requested = False
            last_mtime = mtime
            last_sink = sink
            time.sleep(2)
            continue

        if need_restart:
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
            LOG.info("Starting music playlist (%d items, sink=%s)", len(paths), sink)
            proc = subprocess.Popen(build_mpv_cmd(paths, sink))
            write_playback(
                musicStatus="playing",
                musicMediaId=items[index % len(items)]["mediaId"] if items else None,
            )
            reload_requested = False
            last_mtime = mtime
            last_sink = sink

        time.sleep(1)


if __name__ == "__main__":
    main()
