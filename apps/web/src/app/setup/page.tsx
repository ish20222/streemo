"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Setup failed");
      return;
    }
    router.push("/devices");
    router.refresh();
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-md panel">
        <p
          className="text-3xl font-bold tracking-tight mb-1"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
        >
          Streemo
        </p>
        <p className="text-[var(--muted)] mb-6 text-sm">
          Create the first admin account
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="text-sm text-[var(--muted)]">
            Name
            <input
              className="input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Email
            <input
              className="input mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="text-sm text-[var(--muted)]">
            Password (min 6)
            <input
              className="input mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {error && <p className="text-[var(--danger)] text-sm">{error}</p>}
          <button className="btn btn-primary mt-2" disabled={loading}>
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}
