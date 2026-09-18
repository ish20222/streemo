"use client";

import { useCallback, useEffect, useState } from "react";

type PlaybackState = {
  videoMediaId: string | null;
  musicMediaId: string | null;
  videoStatus: string;
  musicStatus: string;
  videoPositionSec: number | null;
  musicPositionSec: number | null;
} | null;

type Device = {
  id: string;
  name: string;
  status: string;
  liveOnline: boolean;
  lastSeenAt: string | null;
  playbackState: PlaybackState;
};

const actions = [
  { action: "pause", label: "Pause" },
  { action: "resume", label: "Resume" },
  { action: "skip_video", label: "Skip video" },
  { action: "skip_music", label: "Skip music" },
  { action: "reload", label: "Reload queues" },
  { action: "clear_cache", label: "Clear cache" },
] as const;

export default function LivePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/devices");
    if (res.ok) {
      const data = await res.json();
      setDevices(data.devices);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function sendCommand(deviceId: string, action: string) {
    setMsg("");
    const res = await fetch(`/api/devices/${deviceId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Command failed");
      return;
    }
    setMsg(
      data.delivered
        ? `Delivered ${action}`
        : `Queued ${action} (device offline — will apply on reconnect if agent polls)`
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Live
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Now playing and remote controls
        </p>
      </header>
      {msg && <p className="text-sm text-[var(--accent)]">{msg}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {devices.length === 0 && (
          <p className="panel text-[var(--muted)] text-sm">No devices</p>
        )}
        {devices.map((d) => {
          const online = d.liveOnline || d.status === "online";
          const pb = d.playbackState;
          return (
            <div key={d.id} className="panel space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {d.lastSeenAt
                      ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                      : "Never connected"}
                  </p>
                </div>
                <span className={`badge ${online ? "badge-online" : "badge-offline"}`}>
                  <span className="dot" />
                  {online ? "Online" : "Offline"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-[var(--bg)] rounded-lg p-3">
                  <p className="text-xs text-[var(--video)] mb-1">Video</p>
                  <p className="capitalize">{pb?.videoStatus || "idle"}</p>
                  <p className="text-xs text-[var(--muted)] font-mono truncate">
                    {pb?.videoMediaId || "—"}
                  </p>
                </div>
                <div className="bg-[var(--bg)] rounded-lg p-3">
                  <p className="text-xs text-[var(--music)] mb-1">Music</p>
                  <p className="capitalize">{pb?.musicStatus || "idle"}</p>
                  <p className="text-xs text-[var(--muted)] font-mono truncate">
                    {pb?.musicMediaId || "—"}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button
                    key={a.action}
                    type="button"
                    className="btn text-xs"
                    onClick={() => sendCommand(d.id, a.action)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
