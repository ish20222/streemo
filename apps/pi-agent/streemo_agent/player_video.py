"""Fullscreen muted video ads on both Pi 4 HDMI ports (DRM/KMS).

- Uses HDMI-A-1 and HDMI-A-2 (both physical HDMI sockets on Pi 4)
- Starts / stops mpv per connector when a screen is plugged or unplugged
- Loops the queued playlist forever once media is cached
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import time
from pathlib import Path
from typing import Any

LOG = logging.getLogger("streemo-video")
STATE = Path(os.environ.get("STREEMO_STATE", "/var/lib/streemo/state"))
QUEUE = STATE / "video_queue.json"
CONFIG = STATE / "config.json"
SKIP = STATE / "video.skip"
PLAYBACK = STATE / "playback.json"
RELOAD_FLAG = STATE / "streemo-video.reload"

# Pi 4 physical ports map to these DRM connector names (kernel)
HDMI_CONNECTORS = ("HDMI-A-1", "HDMI-A-2")


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


def list_drm_hdmi_status() -> dict[str, bool]:
    """Return {connector_name: connected} for HDMI-A-1 / HDMI-A-2."""
    found: dict[str, bool] = {name: False for name in HDMI_CONNECTORS}
    drm_root = Path("/sys/class/drm")
    if not drm_root.exists():
        return found

    for entry in drm_root.iterdir():
        # e.g. card1-HDMI-A-1
        name = entry.name
        if "-HDMI-" not in name and "-HDMI_A_" not in name:
            # also match HDMI-A-1 style after cardN-
            pass
        status_file = entry / "status"
        if not status_file.exists():
            continue
        # Extract connector id: card1-HDMI-A-1 -> HDMI-A-1
        parts = name.split("-", 1)
        if len(parts) < 2:
            continue
        connector = parts[1]  # HDMI-A-1
        if connector not in found:
            # Normalize uncommon names
            if connector.replace("_", "-") in found:
                connector = connector.replace("_", "-")
            else:
                continue
        try:
            status = status_file.read_text().strip().lower()
            found[connector] = status == "connected"
        except OSError:
            continue
    return found


def connected_connectors() -> list[str]:
    status = list_drm_hdmi_status()
    connected = [c for c, ok in status.items() if ok]
    # If sysfs shows nothing but we're on a desktop session, still try both
    if not connected and (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
        LOG.debug("No DRM HDMI connected; using X11/Wayland fallback on primary")
        return ["DISPLAY"]
    return connected


def build_mpv_cmd(paths: list[str], connector: str) -> list[str]:
    base = [
        "mpv",
        "--fullscreen",
        "--loop-playlist=inf",
        "--no-osc",
        "--no-input-default-bindings",
        "--really-quiet",
        "--mute=yes",
        "--no-audio",
        "--hwdec=auto",
        "--keep-open=no",
        "--force-window=yes",
    ]
    if connector == "DISPLAY":
        return [*base, "--vo=gpu", *paths]

    # Direct DRM/KMS to a specific HDMI socket — works without a desktop
    return [
        *base,
        "--vo=gpu",
        "--gpu-context=drm",
        f"--drm-connector={connector}",
        *paths,
    ]


def stop_proc(proc: subprocess.Popen[bytes] | None) -> None:
    if not proc or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    reload_requested = False
    stopping = False

    def on_hup(*_a: Any) -> None:
        nonlocal reload_requested
        reload_requested = True
        LOG.info("SIGHUP — reload playlist")

    def on_term(*_a: Any) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGHUP, on_hup)
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    # One mpv process per HDMI connector
    procs: dict[str, subprocess.Popen[bytes]] = {}
    last_mtime = 0.0
    last_connectors: set[str] = set()
    index = 0
    paths: list[str] = []
    items: list[dict[str, Any]] = []

    LOG.info(
        "Video player ready — waiting for HDMI (HDMI-A-1 / HDMI-A-2) and queued ads"
    )

    while not stopping:
        if RELOAD_FLAG.exists():
            RELOAD_FLAG.unlink(missing_ok=True)
            reload_requested = True

        queue = read_json(QUEUE)
        config = read_json(CONFIG)
        items = queue.get("items") or []
        enabled = queue.get("enabled", True) and not config.get("paused", False)
        mtime = QUEUE.stat().st_mtime if QUEUE.exists() else 0.0

        if SKIP.exists():
            SKIP.unlink(missing_ok=True)
            index = (index + 1) % max(len(items), 1)
            reload_requested = True

        paths = [i["path"] for i in items if Path(i["path"]).exists()]
        if index and paths:
            ordered = paths[index:] + paths[:index]
        else:
            ordered = paths

        connectors = set(connected_connectors()) if enabled and ordered else set()

        # Drop players for unplugged screens
        for name in list(procs.keys()):
            if name not in connectors:
                LOG.info("HDMI %s disconnected — stopping player", name)
                stop_proc(procs.pop(name))

        # Restart all players if playlist/config changed
        playlist_changed = reload_requested or mtime != last_mtime
        if playlist_changed:
            for name in list(procs.keys()):
                stop_proc(procs.pop(name))
            reload_requested = False
            last_mtime = mtime

        # Start players for newly connected (or after playlist change)
        for name in connectors:
            proc = procs.get(name)
            dead = proc is not None and proc.poll() is not None
            if dead:
                LOG.warning("mpv on %s exited — restarting", name)
                procs.pop(name, None)
                proc = None
            if proc is None:
                LOG.info(
                    "Starting looping ads on %s (%d videos)",
                    name,
                    len(ordered),
                )
                procs[name] = subprocess.Popen(build_mpv_cmd(ordered, name))

        if connectors != last_connectors:
            if connectors:
                LOG.info("Active HDMI outputs: %s", ", ".join(sorted(connectors)))
            else:
                LOG.info("No HDMI screen connected — idle until a display is plugged in")
            last_connectors = set(connectors)

        if procs:
            write_playback(
                videoStatus="playing",
                videoMediaId=items[index % len(items)]["mediaId"] if items else None,
                hdmiOutputs=sorted(procs.keys()),
            )
        else:
            write_playback(
                videoStatus="idle",
                videoMediaId=None,
                hdmiOutputs=[],
            )

        time.sleep(1.5)

    for name in list(procs.keys()):
        stop_proc(procs.pop(name))


if __name__ == "__main__":
    main()
