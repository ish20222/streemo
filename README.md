# Streemo — Advertising screens + music for Raspberry Pi

Dashboard and API hosted on **Railway**. Raspberry Pi 4 agents download, cache, and play **video ads** (HDMI) and **music** (3.5mm or Bluetooth) from separate queues.

## Architecture

| Piece | Role |
|--------|------|
| `apps/web` | Next.js dashboard + REST API + WebSocket (`/ws/devices`) |
| AWS S3 (or local disk) | Uploaded media storage |
| MongoDB (`streemo` database) | Users, devices, playlists, playback state |
| `apps/pi-agent` | Python agent + `mpv` video/music players |
| `deploy/pi` | Install script + systemd units |

Video audio is **muted by default**; the music service owns the speakers (`analog` / `hdmi` / `bluetooth:<mac>`).

## Quick start (local dashboard)

### Prerequisites

- Node 22+
- MongoDB (set `MONGODB_URI` — database name `streemo`)
- (Optional) AWS S3 bucket for production storage

```bash
cp apps/web/.env.example apps/web/.env
# Edit MONGODB_URI, AUTH_SECRET, DEVICE_TOKEN_SECRET, APP_URL
```

```bash
cd apps/web
npm install
npm run db:seed   # admin@streemo.local / admin123
npm run dev       # http://localhost:3000 (includes WebSocket)
```

First launch with an empty DB redirects to **Setup** to create the admin account (seed is optional).

Set `STORAGE_MODE=local` for local uploads under `apps/web/uploads`. For Railway, set `STORAGE_MODE=s3` and AWS credentials.

### Dashboard flow

1. **Devices** — Add a device → note the pairing code  
2. **Library** — Upload videos and audio  
3. **Queues** — Create a video playlist and a music playlist; add items; reorder  
4. **Devices** — Assign playlists; choose audio sink  
5. **Live** — Watch online status and send pause / skip / reload  

## Railway deploy

1. Create a Railway project from this repo  
2. Set environment variables:

```
MONGODB_URI=mongodb://ishananuradha:aezakmi%2540123@95.211.164.164:27017/streemo?authSource=admin
AUTH_SECRET=<long-random-string>
DEVICE_TOKEN_SECRET=<long-random-string>
APP_URL=https://your-service.up.railway.app
STORAGE_MODE=s3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=streemo
```

3. Deploy using [`railway.json`](railway.json) / [`apps/web/Dockerfile`](apps/web/Dockerfile)  

Open `APP_URL`, complete setup, then pair Pis.

## Raspberry Pi setup (Pi 4B, OS 13 Trixie, aarch64)

On the Pi (with this repo cloned, or copy `apps/pi-agent` + `deploy/pi`):

```bash
sudo bash deploy/pi/install.sh
sudo streemo-pair --server https://your-service.up.railway.app ABC123
sudo systemctl restart streemo-agent streemo-video streemo-music
sudo systemctl status streemo-agent streemo-video streemo-music
```

### Video / HDMI

Pi 4 has **two HDMI ports**. Streemo drives both (`HDMI-A-1` and `HDMI-A-2`):

- Plug a screen into **either** port → queued video ads start fullscreen and **loop forever**
- Plug screens into **both** ports → the same looping playlist plays on each output
- Unplug a screen → that output stops; the other keeps playing
- Hotplug is detected via DRM sysfs + a udev rule (`99-streemo-hdmi.rules`)

Video audio is muted; use the music service for speakers.

### Audio

- **3.5mm jack:** Dashboard sink = `analog`. Optionally: `sudo raspi-config nonint do_audio 1`  
- **HDMI audio:** Sink = `hdmi`  
- **Bluetooth:** Pair once on the Pi:

```bash
bluetoothctl
power on
scan on
pair AA:BB:CC:DD:EE:FF
trust AA:BB:CC:DD:EE:FF
connect AA:BB:CC:DD:EE:FF
```

Then in the dashboard set audio sink to **Bluetooth** and enter that MAC.

### Offline behavior

If the network drops, agents keep playing the last **cached** video and music queues. When connectivity returns, WebSocket reconnects and queues re-sync.

### Services

| Unit | Purpose |
|------|---------|
| `streemo-agent` | WebSocket, heartbeat, download/cache, write queue JSON |
| `streemo-video` | Fullscreen muted looping `mpv` on both HDMI ports |
| `streemo-music` | Audio-only `mpv` to chosen sink |

State files live in `/var/lib/streemo/state/`; media cache in `/var/lib/streemo/cache/`.

## API sketch (devices)

- `POST /api/devices/pair` — body `{ pairingCode }` → `{ deviceId, deviceToken }`  
- `GET /api/device/manifest` — `Authorization: Bearer <deviceToken>`  
- `WS /ws/devices?token=<deviceToken>` — `heartbeat`, `queue_updated`, `command`  

## Repo layout

```
apps/web/           Dashboard + API + WS server
apps/pi-agent/      Python package (agent, pair, players)
deploy/pi/          install.sh + systemd units
railway.json        Railway deploy config
```

## Notes

- Prefer short, compressed H.264 MP4 ads and common audio (MP3/AAC) for Pi 4 (2 GB)  
- Do not commit real `.env` secrets  
- Registration is open only until the first user exists  
