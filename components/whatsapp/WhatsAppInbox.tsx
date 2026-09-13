"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { initials } from "@/lib/format";
import { Modal, ModalHeader } from "@/components/interactive";
import { useConfirm } from "@/components/ConfirmDialog";
import { fillPreview } from "@/lib/wa-template-presets";
import {
  listConversations, getThread, sendReply, sendTemplateReply,
  listQuickReplies, saveQuickReply, deleteQuickReply, getApprovedTemplates,
  type InboxData, type ConversationVM, type ThreadVM, type QuickReplyVM, type ReplyTemplate,
} from "@/app/actions/whatsapp-inbox";

type Filter = "all" | "unread" | "unmatched";
const DAY = 86_400_000;

/** Full international number (waId) as +<code><number>; falls back to the 10-digit key. */
const phoneOf = (c: { waId?: string | null; mobile: string }) => {
  const full = (c.waId ?? "").replace(/\D/g, "");
  return full ? `+${full}` : c.mobile;
};

const relTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < DAY) return `${Math.floor(d / 3_600_000)}h`;
  if (d < 7 * DAY) return `${Math.floor(d / DAY)}d`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });

export function WhatsAppInbox({ initial }: { initial: InboxData | null }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [data, setData] = useState<InboxData | null>(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadVM | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [quickReplies, setQuickReplies] = useState<QuickReplyVM[]>([]);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [manageQR, setManageQR] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = (f: Filter, term: string) => listConversations(f, term).then(setData);
  const loadQuickReplies = () => listQuickReplies().then(setQuickReplies);
  useEffect(() => { loadQuickReplies(); getApprovedTemplates().then(setTemplates); }, []);
  const reloadThread = () => { if (selected) getThread(selected).then(setThread); load(filter, q); };
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(filter, q), 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [filter, q]); // eslint-disable-line

  const open = (mobile: string) => {
    setSelected(mobile); setThread(null); setLoadingThread(true);
    getThread(mobile).then((t) => {
      setThread(t); setLoadingThread(false);
      // Clear the unread badge locally.
      setData((d) => d ? { ...d, conversations: d.conversations.map((c) => c.mobile === mobile ? { ...c, unreadCount: 0 } : c), totalUnread: Math.max(0, d.totalUnread - (d.conversations.find((c) => c.mobile === mobile)?.unreadCount ?? 0)) } : d);
    });
  };

  const convos = data?.conversations ?? [];

  return (
    <div className="animate-fadeUp">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-[18px] font-bold text-[#1A1C1A]">💬 WhatsApp Inbox</h1>
        {(data?.totalUnread ?? 0) > 0 && <span className="rounded-full bg-[#E53935] px-2 py-0.5 text-[11px] font-bold text-white">{data!.totalUnread} unread</span>}
        <span className="text-[12px] text-[#9E9E9E]">{data?.total ?? 0} contacts have messaged the official number</span>
        <button type="button" onClick={() => load(filter, q)} className="ml-auto rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">↻ Refresh</button>
      </div>

      <div className="flex h-[calc(100vh-190px)] min-h-[460px] overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-[#F0F0F0] sm:w-[340px] ${selected ? "hidden sm:flex" : "flex"}`}>
          <div className="border-b border-[#F0F0F0] p-2.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number, message…"
              className="mb-2 w-full rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12.5px] outline-none focus:border-[#7DA02E]" />
            <div className="flex gap-1">
              {([["all", "All"], ["unread", "Unread"], ["unmatched", "Not registered"]] as [Filter, string][]).map(([f, l]) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className="rounded-full px-3 py-1 text-[11.5px] font-semibold"
                  style={{ background: filter === f ? "#F5F9EA" : "#F5F5F5", color: filter === f ? "#7DA02E" : "#9E9E9E" }}>{l}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convos.length === 0 ? (
              <div className="px-4 py-12 text-center text-[12.5px] text-[#9E9E9E]">No conversations{q ? " match" : " yet"}.</div>
            ) : convos.map((c) => <ConvRow key={c.mobile} c={c} active={c.mobile === selected} onClick={() => open(c.mobile)} />)}
          </div>
        </div>

        {/* Thread */}
        <div className={`min-w-0 flex-1 flex-col bg-[#F7F6F3] ${selected ? "flex" : "hidden sm:flex"}`}>
          {!selected ? (
            <div className="grid h-full place-items-center text-center text-[13px] text-[#9E9E9E]">
              <div><div className="text-[34px]">💬</div><div className="mt-1">Pick a conversation to read the full record</div></div>
            </div>
          ) : loadingThread || !thread ? (
            <div className="grid h-full place-items-center text-[13px] text-[#9E9E9E]">Loading…</div>
          ) : (
            <ThreadView thread={thread} quickReplies={quickReplies} templates={templates}
              onBack={() => { setSelected(null); setThread(null); }} onSent={reloadThread}
              onManageQuickReplies={() => setManageQR(true)} />
          )}
        </div>
      </div>

      <div className="mt-2 text-[11px] text-[#9E9E9E]">Free-text replies work inside the 24-hour window; once it closes, use an approved template. Every message is recorded here.</div>

      {manageQR && <QuickRepliesManager initial={quickReplies} onClose={() => setManageQR(false)} onChanged={loadQuickReplies} />}
    </div>
  );
}

function ConvRow({ c, active, onClick }: { c: ConversationVM; active: boolean; onClick: () => void }) {
  const phone = phoneOf(c);
  const title = c.name || phone;
  return (
    <button type="button" onClick={onClick}
      className="flex w-full items-center gap-2.5 border-b border-[#F7F7F7] px-3 py-2.5 text-left hover:bg-[#FAFBFA]"
      style={{ background: active ? "#F1F8F1" : undefined }}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#25D366]/15 text-[12px] font-bold text-[#0B8A3D]">{initials(title)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-[#1A1C1A]">{title}</span>
          {c.within24h && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#25D366]" title="Reply window open (messaged in last 24h)" />}
          <span className="ml-auto shrink-0 text-[10.5px] text-[#9E9E9E]">{relTime(c.lastMessageAt)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#757575]">{c.lastDirection === "OUT" ? "You: " : ""}{c.lastMessage || "—"}</span>
          {c.unreadCount > 0 && <span className="shrink-0 rounded-full bg-[#25D366] px-1.5 py-0.5 text-[9px] font-bold text-white">{c.unreadCount}</span>}
        </div>
        <div className="mt-0.5 text-[10px] text-[#BDBDBD]">{phone}{c.farmerId ? " · Registered farmer" : " · Not registered farmer"}</div>
      </div>
    </button>
  );
}

function ThreadView({ thread, quickReplies, templates, onBack, onSent, onManageQuickReplies }: {
  thread: ThreadVM; quickReplies: QuickReplyVM[]; templates: ReplyTemplate[];
  onBack: () => void; onSent: () => void; onManageQuickReplies: () => void;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [thread.mobile, thread.messages.length]);
  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-[#E7E7E7] bg-white px-3.5 py-2.5">
        <button type="button" onClick={onBack} className="sm:hidden text-[16px] text-[#616161]">←</button>
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366]/15 text-[12px] font-bold text-[#0B8A3D]">{initials(thread.name || phoneOf(thread))}</div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-[#1A1C1A]">{thread.name || phoneOf(thread)}</div>
          <div className="text-[11px] text-[#9E9E9E]">
            {phoneOf(thread)}
            {thread.farmerId ? <> · <Link href={`/farmers/${thread.farmerId}`} className="font-semibold text-[#1565C0] hover:underline">{thread.farmerName || "View farmer"}</Link></> : " · Not registered farmer"}
          </div>
        </div>
        <span className="ml-auto rounded-full px-2 py-0.5 text-[10.5px] font-bold"
          style={{ background: thread.within24h ? "#F5F9EA" : "#FFF3E0", color: thread.within24h ? "#7DA02E" : "#E65100" }}>
          {thread.within24h ? "● Session open" : "Session closed · template only"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-4">
        {thread.messages.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-[#9E9E9E]">
            No per-message record before this contact&apos;s messages started being logged.
            {thread.firstMessage && <div className="mt-1 text-[#BDBDBD]">First message on record: “{thread.firstMessage}”</div>}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {thread.messages.map((m) => {
              const out = m.direction === "OUT";
              const isMedia = m.type !== "text" && !!m.mediaId;
              return (
                <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[78%] rounded-[10px] px-3 py-2 text-[13px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,0.08)]"
                    style={{ background: out ? "#DCF8C6" : "#fff", borderTopLeftRadius: out ? undefined : 3, borderTopRightRadius: out ? 3 : undefined }}>
                    {isMedia
                      ? <span className="italic text-[#616161]">📎 {m.type} {m.mediaMime ? `(${m.mediaMime})` : ""}</span>
                      : <span className="whitespace-pre-wrap text-[#1A1C1A]" dir="auto">{m.text}</span>}
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-[#9E9E9E]">
                      {fmtTime(m.at)}
                      {out && m.status && <span className={m.status === "FAILED" ? "text-[#C62828]" : "text-[#4FC3F7]"}>· {m.status.toLowerCase()}</span>}
                    </div>
                    {out && m.status === "FAILED" && m.errorText && <div className="text-[9.5px] text-[#C62828]">{m.errorText}</div>}
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
        )}
      </div>

      <Composer thread={thread} quickReplies={quickReplies} templates={templates} onSent={onSent} onManageQuickReplies={onManageQuickReplies} />
    </>
  );
}

function Composer({ thread, quickReplies, templates, onSent, onManageQuickReplies }: {
  thread: ThreadVM; quickReplies: QuickReplyVM[]; templates: ReplyTemplate[]; onSent: () => void; onManageQuickReplies: () => void;
}) {
  const [mode, setMode] = useState<"text" | "template">(thread.within24h ? "text" : "template");
  const [text, setText] = useState("");
  const [tplName, setTplName] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const selTpl = templates.find((t) => t.name === tplName) ?? null;
  const INP = "rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#7DA02E]";

  const pickTpl = (name: string) => { setTplName(name); const t = templates.find((x) => x.name === name); setParams(t ? Array(t.varCount).fill("") : []); };

  const sendText = () => {
    setErr(null); const body = text.trim(); if (!body) return;
    start(async () => { const r = await sendReply(thread.mobile, body); if (!r.ok) { setErr(r.error ?? "Failed."); return; } setText(""); onSent(); });
  };
  const sendTpl = () => {
    setErr(null);
    if (!selTpl) { setErr("Pick a template."); return; }
    if (selTpl.varCount > 0 && params.slice(0, selTpl.varCount).some((p) => !p.trim())) { setErr("Fill every template value."); return; }
    start(async () => {
      const r = await sendTemplateReply({ mobile: thread.mobile, templateName: selTpl.name, language: selTpl.language, bodyParams: params.slice(0, selTpl.varCount) });
      if (!r.ok) { setErr(r.error ?? "Failed."); return; }
      setTplName(""); setParams([]); onSent();
    });
  };

  return (
    <div className="border-t border-[#E7E7E7] bg-white p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="inline-flex rounded-[8px] border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
          {(["text", "template"] as const).map((mo) => {
            const disabled = mo === "text" && !thread.within24h;
            return (
              <button key={mo} type="button" disabled={disabled} onClick={() => setMode(mo)}
                className="rounded-[6px] px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
                style={{ background: mode === mo ? "#fff" : "transparent", color: mode === mo ? "#0B8A3D" : "#9E9E9E", boxShadow: mode === mo ? "0 1px 2px rgba(0,0,0,0.12)" : "none" }}>
                {mo === "text" ? "Reply" : "Template"}
              </button>
            );
          })}
        </div>
        {!thread.within24h && <span className="text-[10.5px] text-[#E65100]">24h window closed — template only</span>}
        <button type="button" onClick={onManageQuickReplies} className="ml-auto text-[11px] font-semibold text-[#6A1B9A] hover:underline">⚙ Quick replies</button>
      </div>

      {mode === "text" ? (
        <>
          {quickReplies.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickReplies.map((qr) => (
                <button key={qr.id} type="button" onClick={() => setText(qr.text)} title={qr.text}
                  className="rounded-full border border-[#E0E0E0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#616161] hover:border-[#0B8A3D] hover:text-[#0B8A3D]">{qr.label}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Type a reply…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              className={`${INP} max-h-[120px] min-h-[40px] flex-1 resize-none`} />
            <button type="button" onClick={sendText} disabled={sending || !text.trim()}
              className="rounded-full bg-[#0B8A3D] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{sending ? "…" : "Send"}</button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.length === 0 ? (
            <div className="rounded-[8px] bg-[#FEF6E9] px-3 py-2 text-[11.5px] text-[#8D6E00]">No approved templates yet. Create &amp; submit one in Settings → WhatsApp Templates.</div>
          ) : (
            <>
              <select value={tplName} onChange={(e) => pickTpl(e.target.value)} className={`${INP} bg-white`}>
                <option value="">Pick an approved template…</option>
                {templates.map((t) => <option key={`${t.name}-${t.language}`} value={t.name}>{t.name} ({t.language}){t.varCount ? ` · ${t.varCount} var` : ""}</option>)}
              </select>
              {selTpl && selTpl.varCount > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Array.from({ length: selTpl.varCount }).map((_, i) => {
                    const label = selTpl.labels?.[i]?.trim() || `Variable ${i + 1}`;
                    return (
                      <div key={i}>
                        <label className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.3px] text-[#9E9E9E]">
                          <span className="mr-1 font-mono text-[#BDBDBD]">{`{{${i + 1}}}`}</span>{label}
                        </label>
                        <input value={params[i] ?? ""} onChange={(e) => setParams((p) => { const n = [...p]; n[i] = e.target.value; return n; })}
                          placeholder={label} className={`${INP} w-full`} />
                      </div>
                    );
                  })}
                </div>
              )}
              {selTpl && (
                <div className="rounded-[10px] rounded-tl-[3px] bg-[#DCF8C6] px-3 py-2 text-[12.5px] text-[#1A1C1A]" dir="auto" style={{ whiteSpace: "pre-wrap" }}>{fillPreview(selTpl.body, params)}</div>
              )}
              <button type="button" onClick={sendTpl} disabled={sending || !selTpl}
                className="self-end rounded-full bg-[#0B8A3D] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">{sending ? "Sending…" : "Send template"}</button>
            </>
          )}
        </div>
      )}
      {err && <div className="mt-1.5 text-[11px] font-semibold text-[#C62828]">{err}</div>}
    </div>
  );
}

function QuickRepliesManager({ initial, onClose, onChanged }: { initial: QuickReplyVM[]; onClose: () => void; onChanged: () => void }) {
  const { confirm, dialog } = useConfirm();
  const [rows, setRows] = useState(initial);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const reload = () => listQuickReplies().then((r) => { setRows(r); onChanged(); });

  const add = () => {
    setErr(null);
    start(async () => { const r = await saveQuickReply({ label, text }); if (!r.ok) { setErr(r.error ?? "Failed."); return; } setLabel(""); setText(""); reload(); });
  };
  const remove = async (qr: QuickReplyVM) => {
    if (!(await confirm({ title: "Delete quick reply?", message: qr.label, confirmLabel: "Delete" }))) return;
    start(async () => { await deleteQuickReply(qr.id); reload(); });
  };
  const INP = "rounded-[10px] border border-[#E0E0E0] px-3 py-2 text-[13px] outline-none focus:border-[#7DA02E]";

  return (
    <Modal open onClose={onClose} className="max-w-[520px]">
      {dialog}
      <ModalHeader eyebrow="WhatsApp" eyebrowColor="#6A1B9A" title="Quick replies" subtitle="Canned messages for one-click reply" onClose={onClose} />
      <div className="max-h-[76vh] overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#EEE] p-3">
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. Price list)" className={INP} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Message text…" className={`${INP} resize-y`} />
          {err && <div className="text-[11px] font-semibold text-[#C62828]">{err}</div>}
          <button type="button" onClick={add} className="self-start rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[12.5px] font-semibold text-white">+ Add quick reply</button>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {rows.length === 0 ? <div className="text-[12px] text-[#BDBDBD]">No quick replies yet.</div> : rows.map((qr) => (
            <div key={qr.id} className="flex items-start gap-2 rounded-[10px] border border-[#F0F0F0] px-3 py-2">
              <div className="min-w-0 flex-1"><div className="text-[12.5px] font-semibold text-[#1A1C1A]">{qr.label}</div><div className="truncate text-[11.5px] text-[#757575]">{qr.text}</div></div>
              <button type="button" onClick={() => remove(qr)} className="rounded-md bg-[#FDECEA] px-2 py-1 text-[11px] font-semibold text-[#C62828] hover:bg-[#FADBD8]">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
