"use client";

import { useCallback, useEffect, useState } from "react";

type Media = {
  id: string;
  type: string;
  filename: string;
  mimeType: string;
  size: number;
  durationSec: number | null;
  checksum: string;
  createdAt: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LibraryPage() {
  const [media, setMedia] = useState<Media[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "video" | "audio">("all");

  const load = useCallback(async () => {
    const res = await fetch("/api/media");
    if (res.ok) {
      const data = await res.json();
      setMedia(data.media);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/media", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Failed: ${file.name}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this media file?")) return;
    await fetch(`/api/media/${id}`, { method: "DELETE" });
    await load();
  }

  const filtered = media.filter(
    (m) => filter === "all" || m.type === filter
  );

  return (
    <div className="space-y-6">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Library
        </h1>
        <p className="text-[var(--muted)] text-sm mt-1">
          Upload video ads and music tracks (cached on each Pi)
        </p>
      </header>

      <div className="panel flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <label className="btn btn-primary cursor-pointer">
          {uploading ? "Uploading…" : "Upload files"}
          <input
            type="file"
            accept="video/*,audio/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => onUpload(e.target.files)}
          />
        </label>
        <div className="flex gap-2">
          {(["all", "video", "audio"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`btn text-sm ${filter === f ? "btn-primary" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-[var(--danger)] text-sm">{error}</p>}

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="panel text-[var(--muted)] text-sm">No media yet.</p>
        )}
        {filtered.map((m) => (
          <div
            key={m.id}
            className="panel flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="badge"
                  style={{
                    background:
                      m.type === "video"
                        ? "rgba(91,159,212,0.15)"
                        : "rgba(232,168,74,0.15)",
                    color: m.type === "video" ? "var(--video)" : "var(--music)",
                  }}
                >
                  {m.type}
                </span>
                <p className="font-medium truncate max-w-md">{m.filename}</p>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                {formatBytes(m.size)} · {m.mimeType} ·{" "}
                <span className="font-mono">{m.checksum.slice(0, 12)}…</span>
              </p>
            </div>
            <button type="button" className="btn btn-danger text-sm" onClick={() => remove(m.id)}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
