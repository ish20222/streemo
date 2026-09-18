"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PlaylistRef = { id: string; name: string } | null;

type Device = {
  id: string;
  name: string;
  location: string | null;
  pairingCode: string;
  deviceToken: string | null;
  status: string;
  lastSeenAt: string | null;
  videoEnabled: boolean;
  musicEnabled: boolean;
  audioSink: string;
  videoPlaylistId: string | null;
  musicPlaylistId: string | null;
  videoPlaylist: PlaylistRef;
  musicPlaylist: PlaylistRef;
  liveOnline: boolean;
};

type Playlist = { id: string; name: string; kind: string };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [dRes, pRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/playlists"),
    ]);
    if (dRes.ok) {
      const data = await dRes.json();
      setDevices(data.devices);
    }
    if (pRes.ok) {
      const data = await pRes.json();
      setPlaylists(data.playlists);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function createDevice(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, location: location || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to create device");
      return;
    }
    setName("");
    setLocation("");
    setSelected(data.device.id);
    await load();
  }

  async function updateDevice(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/devices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  }

  async function removeDevice(id: string) {
    if (!confirm("Delete this device?")) return;
    await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (selected === id) setSelected(null);
    await load();
  }

  const active = devices.find((d) => d.id === selected) || null;
  const videoPlaylists = playlists.filter((p) => p.kind === "video");
  const musicPlaylists = playlists.filter((p) => p.kind === "music");

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Devices
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Register Raspberry Pis and assign video / music queues
        </p>
      </header>

      <form onSubmit={createDevice} className="panel flex flex-col sm:flex-row gap-3">
        <input
          className="input"
          placeholder="Device name (e.g. Lobby screen)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="input"
          placeholder="Location (optional)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button className="btn btn-primary whitespace-nowrap" type="submit">
          Add device
        </button>
      </form>
      {error && <p className="text-[var(--danger)] text-sm">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          {devices.length === 0 && (
            <p className="text-[var(--muted)] text-sm panel">No devices yet.</p>
          )}
          {devices.map((d) => {
            const online = d.liveOnline || d.status === "online";
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelected(d.id)}
                className={`panel w-full text-left transition ${
                  selected === d.id ? "border-[var(--accent)]" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {d.location || "No location"}
                    </p>
                  </div>
                  <span className={`badge ${online ? "badge-online" : "badge-offline"}`}>
                    <span className="dot" />
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)] mt-2">
                  Pair code:{" "}
                  <span className="font-mono text-[var(--fg)] tracking-widest">
                    {d.pairingCode}
                  </span>
                  {d.deviceToken ? " · Paired" : " · Waiting to pair"}
                </p>
              </button>
            );
          })}
        </div>

        <div className="panel space-y-4">
          {!active && (
            <p className="text-[var(--muted)] text-sm">Select a device to configure</p>
          )}
          {active && (
            <>
              <div>
                <h2 className="font-semibold text-lg">{active.name}</h2>
                <p className="text-xs text-[var(--muted)] font-mono mt-1 break-all">
                  ID: {active.id}
                </p>
              </div>

              <label className="block text-sm text-[var(--muted)]">
                Audio sink
                <select
                  className="input mt-1"
                  value={
                    active.audioSink.startsWith("bluetooth:")
                      ? "bluetooth"
                      : active.audioSink
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "bluetooth") {
                      const mac = prompt(
                        "Bluetooth MAC (e.g. AA:BB:CC:DD:EE:FF)",
                        active.audioSink.replace(/^bluetooth:/, "")
                      );
                      if (mac) updateDevice(active.id, { audioSink: `bluetooth:${mac}` });
                    } else {
                      updateDevice(active.id, { audioSink: v });
                    }
                  }}
                >
                  <option value="analog">3.5mm analog</option>
                  <option value="hdmi">HDMI audio</option>
                  <option value="bluetooth">Bluetooth speaker</option>
                </select>
              </label>
              {active.audioSink.startsWith("bluetooth:") && (
                <p className="text-xs text-[var(--muted)]">
                  Sink: {active.audioSink}
                </p>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active.videoEnabled}
                  onChange={(e) =>
                    updateDevice(active.id, { videoEnabled: e.target.checked })
                  }
                />
                Video ads enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active.musicEnabled}
                  onChange={(e) =>
                    updateDevice(active.id, { musicEnabled: e.target.checked })
                  }
                />
                Music enabled
              </label>

              <label className="block text-sm text-[var(--muted)]">
                Video playlist
                <select
                  className="input mt-1"
                  value={active.videoPlaylistId || ""}
                  onChange={(e) =>
                    updateDevice(active.id, {
                      videoPlaylistId: e.target.value || null,
                    })
                  }
                >
                  <option value="">None</option>
                  {videoPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-[var(--muted)]">
                Music playlist
                <select
                  className="input mt-1"
                  value={active.musicPlaylistId || ""}
                  onChange={(e) =>
                    updateDevice(active.id, {
                      musicPlaylistId: e.target.value || null,
                    })
                  }
                >
                  <option value="">None</option>
                  {musicPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="pt-2 border-t border-[var(--border)]">
                <p className="text-sm text-[var(--muted)] mb-2">
                  On the Pi run:
                </p>
                <code className="block text-xs bg-[var(--bg)] p-3 rounded-lg break-all">
                  streemo-pair {active.pairingCode}
                </code>
              </div>

              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeDevice(active.id)}
              >
                Delete device
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
