"use client";

import { useEffect } from "react";

/**
 * Pings /api/heartbeat so the user's `lastSeenAt` stays fresh while they have the app open — this is
 * what makes "Last active" read "Just now" for someone actively using the portal, instead of their
 * last sign-in (which can be up to 7 days ago). Fires on mount, every 2 minutes, and whenever the tab
 * becomes visible again; skips pinging a backgrounded tab. Best-effort — failures are swallowed.
 */
const INTERVAL_MS = 2 * 60 * 1000;

export function Heartbeat() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/heartbeat", { method: "POST", keepalive: true }).catch(() => {});
    };
    ping(); // on mount / login
    const id = setInterval(ping, INTERVAL_MS);
    const onVis = () => { if (document.visibilityState === "visible") ping(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return null;
}
