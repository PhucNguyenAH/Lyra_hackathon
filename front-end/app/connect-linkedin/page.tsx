"use client";

import { useEffect, useRef, useState } from "react";

type State =
  | "idle"
  | "awaiting_login"
  | "logged_in"
  | "saving"
  | "saved"
  | "error"
  | "cancelled";

export default function ConnectLinkedInPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<unknown>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function start() {
    setError(null);
    const res = await fetch("/api/auth/session/start", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
    if (!res.ok) {
      setState("error");
      setError(res.status === 401 ? "Invalid admin token" : `Start failed (${res.status})`);
      return;
    }
    // @ts-expect-error
    const { default: RFB } = await import("@novnc/novnc/core/rfb");
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/api/auth/session/vnc?token=${encodeURIComponent(token)}`;
    rfbRef.current = new RFB(screenRef.current as HTMLElement, url);
    setState("awaiting_login");
    pollRef.current = setInterval(pollStatus, 2000);
  }

  async function pollStatus() {
    const res = await fetch(`/api/auth/session/status?token=${encodeURIComponent(token)}`);
    if (!res.ok) return;
    const data = await res.json();
    setState(data.state);
    if (data.error) setError(data.error);
    if (["saved", "error", "cancelled"].includes(data.state) && pollRef.current) {
      clearInterval(pollRef.current);
    }
  }

  async function cancel() {
    await fetch("/api/auth/session/cancel", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
    if (pollRef.current) clearInterval(pollRef.current);
    setState("cancelled");
  }

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Connect LinkedIn</h1>
      <p>Log into LinkedIn in the streamed browser to create the scraper session.</p>

      {state === "idle" || state === "error" || state === "cancelled" ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, padding: 8 }}
          />
          <button onClick={start} disabled={!token}>Start login</button>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <strong>Status:</strong> {state} <button onClick={cancel}>Cancel</button>
        </div>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {state === "saved" && <p style={{ color: "green" }}>✅ Session saved — scraping is ready.</p>}

      <div
        ref={screenRef}
        style={{ width: "100%", height: 640, background: "#111", borderRadius: 8 }}
      />
    </main>
  );
}
