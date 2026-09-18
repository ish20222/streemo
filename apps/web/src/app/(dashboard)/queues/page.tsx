"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Media = {
  id: string;
  type: string;
  filename: string;
};

type Item = {
  id: string;
  position: number;
  media: Media;
};

type Playlist = {
  id: string;
  name: string;
  kind: string;
  items: Item[];
};

export default function QueuesPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"video" | "music">("video");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [pRes, mRes] = await Promise.all([
      fetch("/api/playlists"),
      fetch("/api/media"),
    ]);
    if (pRes.ok) {
      const data = await pRes.json();
      setPlaylists(data.playlists);
      if (!selected && data.playlists[0]) setSelected(data.playlists[0].id);
    }
    if (mRes.ok) {
      const data = await mRes.json();
      setMedia(data.media);
    }
  }, [selected]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = playlists.find((p) => p.id === selected) || null;

  async function createPlaylist(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, kind }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setName("");
    setSelected(data.playlist.id);
    await load();
  }

  async function addMedia(mediaId: string) {
    if (!active) return;
    await fetch(`/api/playlists/${active.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    await load();
  }

  async function removeItem(itemId: string) {
    if (!active) return;
    await fetch(`/api/playlists/${active.id}/items?itemId=${itemId}`, {
      method: "DELETE",
    });
    await load();
  }

  async function moveItem(itemId: string, dir: -1 | 1) {
    if (!active) return;
    const ids = active.items.map((i) => i.id);
    const idx = ids.indexOf(itemId);
    const next = idx + dir;
    if (next < 0 || next >= ids.length) return;
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    await fetch(`/api/playlists/${active.id}/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: ids }),
    });
    await load();
  }

  async function deletePlaylist() {
    if (!active || !confirm("Delete this queue?")) return;
    await fetch(`/api/playlists/${active.id}`, { method: "DELETE" });
    setSelected(null);
    await load();
  }

  const addable = media.filter((m) =>
    active?.kind === "video" ? m.type === "video" : m.type === "audio"
  );

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Queues
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Separate video ad and music playlists
        </p>
      </header>

      <form onSubmit={createPlaylist} className="panel flex flex-col sm:flex-row gap-3">
        <input
          className="input"
          placeholder="Playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <select
          className="input sm:w-40"
          value={kind}
          onChange={(e) => setKind(e.target.value as "video" | "music")}
        >
          <option value="video">Video ads</option>
          <option value="music">Music</option>
        </select>
        <button className="btn btn-primary whitespace-nowrap" type="submit">
          Create
        </button>
      </form>
      {error && <p className="text-[var(--danger)] text-sm">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {playlists.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={`panel w-full text-left ${
                selected === p.id ? "border-[var(--accent)]" : ""
              }`}
            >
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {p.kind} · {p.items?.length ?? 0} items
              </p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 panel space-y-4">
          {!active && (
            <p className="text-[var(--muted)] text-sm">Select or create a queue</p>
          )}
          {active && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-lg">{active.name}</h2>
                  <p className="text-xs text-[var(--muted)] capitalize">{active.kind} queue</p>
                </div>
                <button type="button" className="btn btn-danger text-sm" onClick={deletePlaylist}>
                  Delete
                </button>
              </div>

              <div className="space-y-2">
                {(active.items || []).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 bg-[var(--bg)] rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-[var(--muted)] w-6">{item.position + 1}</span>
                    <span className="flex-1 truncate text-sm">{item.media.filename}</span>
                    <button type="button" className="btn text-xs px-2 py-1" onClick={() => moveItem(item.id, -1)}>
                      ↑
                    </button>
                    <button type="button" className="btn text-xs px-2 py-1" onClick={() => moveItem(item.id, 1)}>
                      ↓
                    </button>
                    <button type="button" className="btn btn-danger text-xs px-2 py-1" onClick={() => removeItem(item.id)}>
                      ✕
                    </button>
                  </div>
                ))}
                {(active.items || []).length === 0 && (
                  <p className="text-sm text-[var(--muted)]">Queue is empty</p>
                )}
              </div>

              <div>
                <p className="text-sm text-[var(--muted)] mb-2">Add from library</p>
                <div className="flex flex-wrap gap-2">
                  {addable.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="btn text-sm"
                      onClick={() => addMedia(m.id)}
                    >
                      + {m.filename}
                    </button>
                  ))}
                  {addable.length === 0 && (
                    <p className="text-xs text-[var(--muted)]">
                      Upload matching {active.kind === "video" ? "videos" : "audio"} in Library first
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
