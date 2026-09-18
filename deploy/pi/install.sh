#!/usr/bin/env bash
# Install Streemo agent on Raspberry Pi OS 13 (Trixie) aarch64 / Pi 4B
set -euo pipefail

STREEMO_ROOT="${STREEMO_ROOT:-/opt/streemo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Prefer repo layout when installing from a cloned Streemo repo
AGENT_SRC="${AGENT_SRC:-}"
if [[ -z "$AGENT_SRC" ]]; then
  if [[ -d "$SCRIPT_DIR/../../apps/pi-agent" ]]; then
    AGENT_SRC="$(cd "$SCRIPT_DIR/../../apps/pi-agent" && pwd)"
  elif [[ -d "$SCRIPT_DIR/pi-agent" ]]; then
    AGENT_SRC="$SCRIPT_DIR/pi-agent"
  else
    echo "Set AGENT_SRC to the apps/pi-agent directory" >&2
    exit 1
  fi
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

echo "==> Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  python3 python3-venv python3-pip \
  mpv \
  bluez bluez-tools \
  alsa-utils \
  curl ca-certificates

echo "==> Creating directories"
mkdir -p "$STREEMO_ROOT" /var/lib/streemo/cache /var/lib/streemo/state /etc/streemo
id streemo &>/dev/null || useradd --system --home /var/lib/streemo --shell /usr/sbin/nologin streemo
# Video needs access to DRM/GPU and audio to audio group
usermod -aG video,audio,render streemo 2>/dev/null || usermod -aG video,audio streemo
chown -R streemo:streemo /var/lib/streemo
mkdir -p /etc/streemo
chown root:streemo /etc/streemo
chmod 750 /etc/streemo
# device.env created by streemo-pair; ensure group can read
if [[ -f /etc/streemo/device.env ]]; then
  chown root:streemo /etc/streemo/device.env
  chmod 640 /etc/streemo/device.env
fi

echo "==> Installing Python agent"
rm -rf "$STREEMO_ROOT/venv"
python3 -m venv "$STREEMO_ROOT/venv"
# shellcheck disable=SC1091
source "$STREEMO_ROOT/venv/bin/activate"
pip install -U pip wheel
pip install "$AGENT_SRC"
deactivate

echo "==> Installing systemd units"
UNIT_SRC="$SCRIPT_DIR"
install -m 644 "$UNIT_SRC/streemo-agent.service" /etc/systemd/system/streemo-agent.service
install -m 644 "$UNIT_SRC/streemo-video.service" /etc/systemd/system/streemo-video.service
install -m 644 "$UNIT_SRC/streemo-music.service" /etc/systemd/system/streemo-music.service

# HDMI hotplug → reload video player immediately
if [[ -f "$UNIT_SRC/99-streemo-hdmi.rules" ]]; then
  install -m 644 "$UNIT_SRC/99-streemo-hdmi.rules" /etc/udev/rules.d/99-streemo-hdmi.rules
  udevadm control --reload-rules || true
fi

# Wrapper so PATH finds venv binaries
cat >/usr/local/bin/streemo-pair <<EOF
#!/bin/sh
exec $STREEMO_ROOT/venv/bin/streemo-pair "\$@"
EOF
chmod +x /usr/local/bin/streemo-pair

# Reduce screen blanking on console (HDMI ads stay visible)
if command -v raspi-config >/dev/null 2>&1; then
  # Disable screen blanking if available (ignore failures on older images)
  raspi-config nonint do_blanking 1 2>/dev/null || true
fi
mkdir -p /etc/xdg/labwc 2>/dev/null || true
# Console blank timeout off
if [[ -f /etc/kbd/config ]]; then
  sed -i 's/^BLANK_TIME=.*/BLANK_TIME=0/' /etc/kbd/config 2>/dev/null || true
fi
# Kernel console blank
if grep -q 'consoleblank=' /boot/firmware/cmdline.txt 2>/dev/null; then
  :
elif [[ -f /boot/firmware/cmdline.txt ]]; then
  # append consoleblank=0 once
  if ! grep -qw consoleblank=0 /boot/firmware/cmdline.txt; then
    sed -i 's/$/ consoleblank=0/' /boot/firmware/cmdline.txt
  fi
elif [[ -f /boot/cmdline.txt ]]; then
  if ! grep -qw consoleblank=0 /boot/cmdline.txt; then
    sed -i 's/$/ consoleblank=0/' /boot/cmdline.txt
  fi
fi

systemctl daemon-reload
systemctl enable streemo-agent streemo-video streemo-music
# Start immediately so plugging HDMI after install begins playback as soon as queue is synced
systemctl restart streemo-agent streemo-video streemo-music || systemctl start streemo-agent streemo-video streemo-music

echo ""
echo "Installed. Both HDMI ports (HDMI-A-1 / HDMI-A-2) are used for looping ad videos."
echo "When you plug a screen into either HDMI port, queued videos play on repeat automatically."
echo ""
echo "Next steps:"
echo "  1. Create a device in the Streemo dashboard and copy the pairing code"
echo "  2. sudo streemo-pair --server https://YOUR-APP.up.railway.app CODE"
echo "  3. Assign a video playlist — the Pi caches files and plays on any connected HDMI"
echo "  4. For Bluetooth music: pair with bluetoothctl, then set sink in dashboard"
echo ""
echo "Optional: force 3.5mm analog output for music"
echo "  sudo raspi-config nonint do_audio 1"
