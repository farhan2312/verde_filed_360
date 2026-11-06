"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getUnreadNotificationCount, listMyNotifications, markAllNotificationsRead, markNotificationRead, type NotificationVM,
} from "@/app/actions/notifications";

const POLL_MS = 60_000;
const ICON: Record<string, string> = { NEW_VISITS: "📝", REPORT_READY: "📊", SLA_BREACH: "⏰", GENERIC: "🔔" };

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d} day${d > 1 ? "s" : ""} ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Header bell: unread badge (refreshed every minute while the tab is visible, and on navigation) and a
 * dropdown inbox. Clicking an item marks it read and opens its link.
 */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationVM[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => { getUnreadNotificationCount().then(setUnread).catch(() => {}); }, []);

  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") refreshCount(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [refreshCount]);
  useEffect(() => { refreshCount(); }, [pathname, refreshCount]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) { setItems(null); listMyNotifications().then(setItems).catch(() => setItems([])); }
  };

  const openItem = async (n: NotificationVM) => {
    setOpen(false);
    if (n.unread) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, unread: false } : x)) ?? null);
      await markNotificationRead(n.id);
    }
    if (n.href) router.push(n.href);
  };

  const readAll = async () => {
    setUnread(0);
    setItems((list) => list?.map((x) => ({ ...x, unread: false })) ?? null);
    await markAllNotificationsRead();
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className={`relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border bg-white transition-colors ${open ? "border-brand-400 text-brand-700" : "border-line text-ink-600 hover:border-brand-400 hover:text-brand-700"}`}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-[#C62828] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-[14px] border border-black/[0.06] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-[#F0F0F0] px-4 py-3">
            <span className="text-[13.5px] font-bold text-[#1A1C1A]">Notifications</span>
            {unread > 0 && <button type="button" onClick={readAll} className="text-[11.5px] font-semibold text-[#7DA02E] hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {items === null ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[#9E9E9E]">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[12.5px] text-[#9E9E9E]">You’re all caught up — no notifications yet.</div>
            ) : items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)}
                className={`flex w-full gap-3 border-b border-[#F5F5F5] px-4 py-3 text-left transition-colors hover:bg-[#F7FAF7] ${n.unread ? "bg-[#F3F9F3]" : ""}`}>
                <span className="mt-0.5 text-[16px] leading-none" aria-hidden>{ICON[n.type] ?? ICON.GENERIC}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12.5px] ${n.unread ? "font-bold text-[#1A1C1A]" : "font-semibold text-[#424242]"}`}>{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-[11.5px] leading-snug text-[#757575]">{n.body}</span>}
                  <span className="mt-1 block text-[10.5px] text-[#9E9E9E]">{ago(n.at)}</span>
                </span>
                {n.unread && <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#7DA02E]" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
