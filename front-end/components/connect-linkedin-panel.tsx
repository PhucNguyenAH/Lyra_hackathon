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

export function ConnectLinkedInPanel() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<unknown>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      (rfbRef.current as { disconnect?: () => void })?.disconnect?.();
      rfbRef.current = null;
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
    // @ts-expect-error - @novnc/novnc has no type declarations for its package entry point
    const { default: RFB } = await import("@novnc/novnc");
    // The VNC websocket connects DIRECTLY to the backend when a public backend
    // URL is configured, because Next.js rewrites do not reliably forward
    // WebSocket upgrades to external hosts. The HTTP start/status/cancel calls
    // above still go through the same-origin /api/* rewrite.
    const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL; // e.g. https://backend.up.railway.app
    let url: string;
    if (backendBase) {
      const wsBase = backendBase.replace(/^http/, "ws"); // https->wss, http->ws
      url = `${wsBase}/auth/session/vnc?token=${encodeURIComponent(token)}`; // NOTE: /auth not /api/auth when going direct
    } else {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      url = `${proto}://${window.location.host}/api/auth/session/vnc?token=${encodeURIComponent(token)}`;
    }
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
    if (["saved", "error", "cancelled"].includes(data.state)) {
      if (pollRef.current) clearInterval(pollRef.current);
      // The backend tears down the browser+VNC once the session reaches a
      // terminal state, so disconnect the RFB canvas here too (not just on
      // manual cancel/unmount).
      (rfbRef.current as { disconnect?: () => void })?.disconnect?.();
      rfbRef.current = null;
    }
  }

  async function cancel() {
    await fetch("/api/auth/session/cancel", {
      method: "POST",
      headers: { "X-Admin-Token": token },
    });
    if (pollRef.current) clearInterval(pollRef.current);
    (rfbRef.current as { disconnect?: () => void })?.disconnect?.();
    rfbRef.current = null;
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
