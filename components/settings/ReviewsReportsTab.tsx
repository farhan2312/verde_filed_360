"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveReviewSettings, sendTestEmail, sendSampleEmails, type ReviewSettingsState } from "@/app/actions/review-settings";
import { SAMPLE_KINDS, type SampleKind } from "@/lib/review-sample-kinds";
import type { ReviewSettings } from "@/lib/review-settings";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]";
const INPUT = "w-full rounded-lg border border-[#E0E0E0] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#7DA02E]";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Settings → Reviews & Reports: review SLA, report/digest schedule (IST), email setup + test, recent sends. */
export function ReviewsReportsTab({ initial }: { initial: ReviewSettingsState }) {
  const router = useRouter();
  const [s, setS] = useState<ReviewSettings>(initial.settings);
  const [saving, startSave] = useTransition();
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState(initial.myEmail);
  const [testing, startTest] = useTransition();
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sampleTo, setSampleTo] = useState("");
  const [sampleKinds, setSampleKinds] = useState<SampleKind[]>(SAMPLE_KINDS.map((k) => k.kind));
  const [sampling, startSample] = useTransition();
  const [sampleMsg, setSampleMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { email, coverage, logs } = initial;
  const dirty = JSON.stringify(s) !== JSON.stringify(initial.settings);
  const set = <K extends keyof ReviewSettings>(k: K, v: ReviewSettings[K]) => { setS((p) => ({ ...p, [k]: v })); setSaveMsg(null); };

  const save = () => startSave(async () => {
    const r = await saveReviewSettings(s);
    setSaveMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error ?? "Save failed." });
    if (r.ok) router.refresh();
  });
  const test = () => startTest(async () => {
    setTestMsg(null);
    const r = await sendTestEmail(testTo);
    setTestMsg(r.ok ? { ok: true, text: `Sent to ${testTo.trim()} — check the inbox (and spam).` } : { ok: false, text: r.error ?? "Send failed." });
    router.refresh();
  });
  const sample = () => startSample(async () => {
    setSampleMsg(null);
    const r = await sendSampleEmails(sampleTo.split(/[,;\s]+/), sampleKinds);
    const failed = r.results?.filter((x) => !x.ok) ?? [];
    setSampleMsg(r.ok
      ? { ok: !failed.length, text: `Sent ${r.sent} email${r.sent === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} failed: ${failed[0].error}` : " — check the inboxes (and spam)."}` }
      : { ok: false, text: r.error ?? "Send failed." });
    router.refresh();
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-[18px]">
      {/* Schedule */}
      <div className={CARD}>
        <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">Review SLA & schedule</div>
        <p className="mb-4 text-[12.5px] text-[#757575]">All times are India time (IST). Changes apply from the next run.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Review SLA (hours)</label>
            <input type="number" min={1} max={720} className={INPUT} value={s.slaHours}
              onChange={(e) => set("slaHours", Math.round(Number(e.target.value) || 0))} />
            <p className="mt-1 text-[11px] text-[#9E9E9E]">A visit is overdue this long after it’s logged. Default 48.</p>
          </div>
          <div>
            <label className={LABEL}>Reporting week starts on</label>
            <select className={INPUT} value={s.weekStartDay} onChange={(e) => set("weekStartDay", Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[#9E9E9E]">Each weekly report covers 7 days from this day. Default Monday.</p>
          </div>
          <div>
            <label className={LABEL}>Weekly report runs</label>
            <div className="flex gap-2">
              <select className={INPUT} value={s.reportDay} onChange={(e) => set("reportDay", Number(e.target.value))}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <select className={`${INPUT} max-w-[110px]`} value={s.reportHour} onChange={(e) => set("reportHour", Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
              </select>
            </div>
            <p className="mt-1 text-[11px] text-[#9E9E9E]">Covers the last completed week. Default Monday 08:00.</p>
          </div>
          <div>
            <label className={LABEL}>Daily digest & SLA alert at</label>
            <select className={INPUT} value={s.digestHour} onChange={(e) => set("digestHour", Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[#9E9E9E]">RMs get their pending count; Central gets RMs past SLA. Default 09:00.</p>
          </div>
        </div>
      </div>

      {/* Email */}
      <div className={CARD}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-bold text-[#1A1C1A]">Email (Resend)</span>
          {email.ready
            ? <span className="rounded-full bg-[#F5F9EA] px-2 py-0.5 text-[11px] font-bold text-[#7DA02E]">Connected</span>
            : <span className="rounded-full bg-[#FFF3E0] px-2 py-0.5 text-[11px] font-bold text-[#E65100]">Not configured</span>}
        </div>
        {email.ready ? (
          <dl className="mb-4 grid gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-[110px_1fr]">
            <dt className="text-[#9E9E9E]">Sends from</dt><dd className="font-semibold text-[#1A1C1A]">{email.from}</dd>
            <dt className="text-[#9E9E9E]">Replies go to</dt><dd className="text-[#1A1C1A]">{email.replyTo || <span className="text-[#757575]">No-reply — emails say “please do not reply”</span>}</dd>
            <dt className="text-[#9E9E9E]">Links open</dt><dd className="text-[#1A1C1A]">{email.appUrl}</dd>
          </dl>
        ) : (
          <div className="mb-4 rounded-[10px] border border-[#F5CE8E] bg-[#FFF8E1] px-3.5 py-3 text-[12.5px] text-[#8D6E00]">
            <p className="font-bold">Email is not switched on yet — no message can leave the system.</p>
            <p className="mt-1.5">
              Everything else works without it: the review queue, the notification bell, the weekly reports, the
              trend and the hourly cron all keep running. Each email the app <i>would</i> have sent is recorded
              below under <b>Recent emails</b> as <i>Failed — not configured</i>, and nothing is marked as already
              sent, so real delivery begins the moment the key is in place.
            </p>
            <p className="mt-1.5">
              To turn it on, add <b>{email.missing.join(" and ")}</b> in
              Vercel → Project → Settings → Environment Variables, then redeploy. For example
              <code className="ml-1 rounded bg-white/70 px-1 py-0.5 text-[11.5px]">EMAIL_FROM = Verde Field Intel &lt;noreply@verdeagrotech.com&gt;</code>.
              The sending domain must be verified in Resend first. Then send a test below and tick
              “Send automatic emails”.
            </p>
          </div>
        )}

        <label className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 ${email.ready ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${s.emailEnabled ? "border-[#E9F2CF] bg-[#F1F8F1]" : "border-[#E0E0E0]"}`}>
          <input type="checkbox" disabled={!email.ready} checked={s.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7DA02E]" />
          <span>
            <span className="block text-[13px] font-semibold text-[#1A1C1A]">Send automatic emails</span>
            <span className="block text-[11.5px] text-[#757575]">RM daily digest, weekly report ready, Central SLA alert. Off by default — send a test first, then switch on and Save.</span>
          </span>
        </label>

        <div className="mt-4">
          <label className={LABEL}>Send a test email</label>
          <div className="flex flex-wrap gap-2">
            <input className={`${INPUT} min-w-[220px] flex-1`} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@verdeagrotech.com" />
            <button type="button" onClick={test} disabled={!email.ready || testing || !testTo.trim()}
              className="rounded-[10px] border border-[#7DA02E] px-4 py-2 text-[13px] font-semibold text-[#7DA02E] hover:bg-[#F5F9EA] disabled:opacity-50">
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
          {testMsg && <p className={`mt-1.5 text-[12px] font-semibold ${testMsg.ok ? "text-[#7DA02E]" : "text-[#C62828]"}`}>{testMsg.text}</p>}
          <p className="mt-1 text-[11px] text-[#9E9E9E]">Works even while automatic emails are off — but not until RESEND_API_KEY and EMAIL_FROM are set.</p>
        </div>

        <div className="mt-5 border-t border-[#F0F0F0] pt-4">
          <label className={LABEL}>Preview the real emails</label>
          <p className="mb-2 text-[11.5px] text-[#757575]">Sends the actual RM and Central emails, filled with live data (latest weekly reports, today’s backlog), marked “[Sample]”. Nobody else receives anything.</p>
          <input className={INPUT} value={sampleTo} onChange={(e) => setSampleTo(e.target.value)} placeholder="Addresses, comma-separated (up to 5)" />
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {SAMPLE_KINDS.map((k) => (
              <label key={k.kind} className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#1A1C1A]">
                <input type="checkbox" checked={sampleKinds.includes(k.kind)} className="h-4 w-4 accent-[#7DA02E]"
                  onChange={() => setSampleKinds((cur) => (cur.includes(k.kind) ? cur.filter((x) => x !== k.kind) : [...cur, k.kind]))} />
                {k.label}
              </label>
            ))}
          </div>
          <button type="button" onClick={sample} disabled={!email.ready || sampling || !sampleTo.trim() || !sampleKinds.length}
            className="mt-2.5 rounded-[10px] bg-[#7DA02E] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#66852A] disabled:opacity-50">
            {sampling ? "Sending…" : "Send sample emails"}
          </button>
          {sampleMsg && <p className={`mt-1.5 text-[12px] font-semibold ${sampleMsg.ok ? "text-[#7DA02E]" : "text-[#C62828]"}`}>{sampleMsg.text}</p>}
        </div>
      </div>

      <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-[12px] border border-black/[0.05] bg-white/95 px-4 py-3 shadow-[0_4px_14px_rgba(0,0,0,0.08)] backdrop-blur">
        {saveMsg && <span className={`text-[12.5px] font-semibold ${saveMsg.ok ? "text-[#7DA02E]" : "text-[#C62828]"}`}>{saveMsg.text}</span>}
        {dirty && !saveMsg && <span className="text-[12px] text-[#8D6E00]">Unsaved changes</span>}
        <button type="button" onClick={save} disabled={saving || !dirty}
          className="rounded-[10px] bg-[#7DA02E] px-5 py-2 text-[13px] font-bold text-white hover:bg-[#66852A] disabled:opacity-50">
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {/* Coverage */}
      <div className={CARD}>
        <div className="mb-1 text-[15px] font-bold text-[#1A1C1A]">Who can receive email</div>
        <p className="mb-3 text-[12.5px] text-[#757575]">Active users with a valid <b>Work email</b>. Anyone without one still gets in-app notifications.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {coverage.map((c) => {
            const full = c.total > 0 && c.reachable === c.total;
            return (
              <div key={c.role} className="rounded-[10px] border border-[#EEE] px-3.5 py-3">
                <div className="text-[11.5px] text-[#757575]">{c.role}</div>
                <div className={`text-[20px] font-bold ${full ? "text-[#7DA02E]" : "text-[#E65100]"}`}>{c.reachable}<span className="text-[13px] font-semibold text-[#9E9E9E]"> / {c.total}</span></div>
              </div>
            );
          })}
        </div>
        <Link href="/users" className="mt-3 inline-block text-[12.5px] font-semibold text-[#7DA02E] hover:underline">Fix missing emails in Users →</Link>
      </div>

      {/* Recent sends */}
      <div className={CARD}>
        <div className="mb-3 text-[15px] font-bold text-[#1A1C1A]">Recent emails</div>
        {logs.length === 0 ? (
          <p className="text-[12.5px] text-[#9E9E9E]">Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]"><th className="py-2">When</th><th>To</th><th>Type</th><th>Subject</th><th>Result</th></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l.id} className="border-b border-[#F5F5F5] align-top">
                  <td className="whitespace-nowrap py-2 text-[#757575]">{l.at}</td>
                  <td className="text-[#1A1C1A]">{l.to}</td>
                  <td className="text-[#616161]">{l.type}</td>
                  <td className="max-w-[200px] truncate text-[#616161]" title={l.subject}>{l.subject}</td>
                  <td>{l.ok ? <span className="font-semibold text-[#7DA02E]">Sent</span> : <span className="font-semibold text-[#C62828]" title={l.error}>Failed{l.error ? ` — ${l.error.slice(0, 60)}` : ""}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
