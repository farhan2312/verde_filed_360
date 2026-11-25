"use client";

// WhatsApp page → "📈 Opt-in analysis". Built for the marketing lead: where opt-ins come from, which
// stores / regions / RMs / officers are behind, how big the gap is, and who to target next.
//
// The RM filter and roll-up key off REGIONAL user ids (`rmIds`), never the `rm` display string: a Verde
// store can have several managers, and a store shared by two of them must appear under both.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { downloadB64 } from "@/lib/download";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  getOptInAnalytics, linkUnmatchedOptIns, exportOptInAnalyticsXlsx,
  type OptInAnalytics, type OptInStoreRow, type OptInOfficerRow, type OptInRollRow, type OptInOrigin, type StoreStatus,
} from "@/app/actions/whatsapp-optin-analytics";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => x.toLocaleString("en-IN");
const inr = (x: number) => (x >= 1e7 ? `₹${(x / 1e7).toFixed(2)} Cr` : x >= 1e5 ? `₹${(x / 1e5).toFixed(1)} L` : `₹${n(Math.round(x))}`);
const pct = (x: number, t: number) => (t > 0 ? (x / t) * 100 : 0);
const p1 = (v: number) => `${Math.round(v * 10) / 10}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dShort = (ymd: string) => { const [, m, d] = ymd.split("-").map(Number); return `${d} ${MONTHS[m - 1]}`; };
const fmtIst = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "—");
const fmtIstTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);

const WA = "#0B8A3D";       // WhatsApp-specific metrics (matches the Inbox accent)
const BRAND = "#7DA02E";    // Verde primary — tabs, active pills, actions
const BRAND_DK = "#66852A";
const BRAND_TINT = "#F5F9EA";
const ORIGIN_COLOR: Record<OptInOrigin, string> = { VISIT: "#1565C0", FARMER: WA, UNREGISTERED: "#EDA942" };
const ORIGIN_LABEL: Record<OptInOrigin, string> = { VISIT: "During a field visit", FARMER: "Registered farmer", UNREGISTERED: "Not registered" };
const STATUS_META: Record<StoreStatus, { label: string; color: string; bg: string }> = {
  NONE: { label: "No opt-ins", color: "#C62828", bg: "#FDECEA" },
  BELOW: { label: "Below median", color: "#E65100", bg: "#FFF3E0" },
  ABOVE: { label: "Above median", color: "#1565C0", bg: "#E3F2FD" },
  TOP: { label: "Top 25%", color: "#4F681F", bg: BRAND_TINT },
};
const PERIODS: { key: number | null; label: string }[] = [{ key: 7, label: "7 days" }, { key: 30, label: "30 days" }, { key: 90, label: "90 days" }, { key: null, label: "All time" }];
const periodWord = (p: number | null) => (p ? `last ${p} days` : "since launch");

function Tile({ label, value, sub, tone, note }: { label: string; value: string; sub?: React.ReactNode; tone?: string; note?: string }) {
  return (
    <div className={`${CARD} p-3.5`} title={note}>
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.4px] text-[#9E9E9E]">{label}</div>
      <div className="mt-1 text-[22px] font-bold leading-none tabular-nums" style={{ color: tone ?? "#1A1C1A" }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px] text-[#757575]">{sub}</div>}
    </div>
  );
}
function Pills<K extends string | number | null>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-[8px] border border-[#E0E0E0] bg-[#F5F7F5] p-0.5">
      {options.map((o) => (
        <button key={String(o.key)} type="button" onClick={() => onChange(o.key)} className="rounded-[6px] px-2.5 py-1 text-[11.5px] font-semibold transition-colors"
          style={{ background: value === o.key ? "#fff" : "transparent", color: value === o.key ? BRAND : "#9E9E9E", boxShadow: value === o.key ? "0 1px 2px rgba(0,0,0,0.1)" : "none" }}>{o.label}</button>
      ))}
    </div>
  );
}
function Title({ children, right, hint }: { children: React.ReactNode; right?: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13.5px] font-bold text-[#1A1C1A]">{children}</div>
        {right}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-[#9E9E9E]">{hint}</div>}
    </div>
  );
}
function Chip({ s }: { s: StoreStatus }) {
  const m = STATUS_META[s];
  return <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: m.color, background: m.bg }}>{m.label}</span>;
}

/* ── Daily trend: stacked bars by origin ── */
function TrendChart({ daily }: { daily: OptInAnalytics["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.visit + d.farmer + d.unregistered));
  const H = 150;
  const step = daily.length > 60 ? 14 : daily.length > 31 ? 7 : daily.length > 10 ? 3 : 1;
  const h = hover != null ? daily[hover] : null;
  return (
    <div className="relative">
      <div className="flex h-[150px] items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {daily.map((d, i) => {
          const tot = d.visit + d.farmer + d.unregistered;
          return (
            <div key={d.date} className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-end" onMouseEnter={() => setHover(i)}
              style={{ opacity: hover == null || hover === i ? 1 : 0.55 }}>
              {(["unregistered", "farmer", "visit"] as const).map((k) => {
                const v = d[k]; if (!v) return null;
                const c = k === "visit" ? ORIGIN_COLOR.VISIT : k === "farmer" ? ORIGIN_COLOR.FARMER : ORIGIN_COLOR.UNREGISTERED;
                return <div key={k} style={{ height: `${(v / max) * H}px`, background: c, borderTop: "1px solid #fff" }} className="first:rounded-t-[3px]" />;
              })}
              {tot === 0 && <div className="h-[2px] bg-[#EEEEEE]" />}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] text-[9.5px] text-[#9E9E9E]">
        {daily.map((d, i) => <div key={d.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">{i % step === 0 ? dShort(d.date) : ""}</div>)}
      </div>
      {h && (
        <div className="pointer-events-none absolute top-0 rounded-[8px] border border-[#E0E0E0] bg-white px-2.5 py-1.5 text-[11px] shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
          style={{ left: `${Math.min(75, (hover! / daily.length) * 100)}%` }}>
          <div className="font-semibold text-[#424242]">{dShort(h.date)} · {n(h.visit + h.farmer + h.unregistered)} opt-ins</div>
          {(["visit", "farmer", "unregistered"] as const).map((k) => {
            const o: OptInOrigin = k === "visit" ? "VISIT" : k === "farmer" ? "FARMER" : "UNREGISTERED";
            return <div key={k} className="flex items-center gap-1.5 text-[#616161]"><span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: ORIGIN_COLOR[o] }} />{ORIGIN_LABEL[o]}: <b className="text-[#1A1C1A]">{n(h[k])}</b></div>;
          })}
        </div>
      )}
    </div>
  );
}

function MiniBars({ values, labels, color, title }: { values: number[]; labels: string[]; color: string; title: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <div>
      <div className="mb-1.5 text-[11.5px] font-semibold text-[#616161]">{title}</div>
      <div className="flex h-[80px] items-end gap-[3px]">
        {values.map((v, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${labels[i]}: ${n(v)} (${p1(pct(v, total))})`}>
            <div className="rounded-t-[3px]" style={{ height: `${Math.max(v ? 3 : 1, (v / max) * 80)}px`, background: v ? color : "#EEEEEE" }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px] text-[9px] text-[#9E9E9E]">{labels.map((l, i) => <div key={i} className="min-w-0 flex-1 text-center">{l}</div>)}</div>
    </div>
  );
}

/* ── Sortable store table ── */
type StoreSort = "potential" | "opted" | "optedPeriod" | "rate" | "withMobile" | "visits" | "conv" | "hniGap" | "last";
function StoreTable({ rows, data }: { rows: OptInStoreRow[]; data: OptInAnalytics }) {
  const [sort, setSort] = useState<StoreSort>("potential");
  const [status, setStatus] = useState<StoreStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = rows.filter((r) => (status === "ALL" || r.status === status) && (!t || `${r.name} ${r.code} ${r.region} ${r.rm}`.toLowerCase().includes(t)));
    const key = (r: OptInStoreRow): number => sort === "hniGap" ? r.hni - r.hniOpted : sort === "last" ? -(daysAgo(r.lastOptIn) ?? 99999) : r[sort];
    return f.sort((a, b) => key(b) - key(a) || b.withMobile - a.withMobile);
  }, [rows, sort, status, q]);
  const maxRate = Math.max(data.benchmark.topRate * 1.5, ...rows.map((r) => r.rate), 0.1);
  const counts = (s: StoreStatus) => rows.filter((r) => r.status === s).length;
  const Th = ({ k, children, left }: { k?: StoreSort; children: React.ReactNode; left?: boolean }) => (
    <th className={`whitespace-nowrap px-2 py-1.5 ${left ? "text-left" : "text-right"} ${k ? "cursor-pointer hover:text-[#7DA02E]" : ""}`} onClick={k ? () => setSort(k) : undefined}
      style={{ color: k && sort === k ? BRAND : undefined }}>{children}{k && sort === k ? " ▾" : ""}</th>
  );
  return (
    <div className={`${CARD} p-4`}>
      <Title hint={<>Opt-in rate = opt-ins per 1,000 farmers with a mobile. Median store {data.benchmark.medianRate}, top quarter {data.benchmark.topRate}+. “Potential” = extra opt-ins if the store reached the top-quarter rate — sorted biggest gap first. Click a column to sort.</>}
        right={<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search store, region, RM…" className="w-[200px] rounded-[8px] border border-[#E0E0E0] px-2.5 py-1 text-[12px]" />}>
        🏪 Stores — where to focus
      </Title>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {(["ALL", "NONE", "BELOW", "ABOVE", "TOP"] as const).map((s) => {
          const on = status === s;
          const m = s === "ALL" ? { label: "All stores", color: "#424242", bg: "#F5F5F5" } : STATUS_META[s];
          return (
            <button key={s} type="button" onClick={() => setStatus(s)} className="rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold"
              style={{ borderColor: on ? m.color : "#E0E0E0", background: on ? m.bg : "#fff", color: on ? m.color : "#757575" }}>
              {m.label} · {s === "ALL" ? rows.length : counts(s)}
            </button>
          );
        })}
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-[#ECECEC] text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[#757575]">
              <Th left>Store</Th><Th left>Region · RM</Th><Th k="withMobile">Farmers w/ mobile</Th>
              <Th k="optedPeriod">Opt-ins ({periodWord(data.periodDays)})</Th><Th k="opted">All time</Th><Th k="rate">Per 1,000</Th>
              <Th k="visits">Visits</Th><Th k="conv">Visit → opt-in</Th><Th k="hniGap">HNI opted</Th><Th k="potential">Potential</Th><Th k="last">Last opt-in</Th><Th left>Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const ago = daysAgo(r.lastOptIn);
              return (
                <tr key={r.id ?? r.name} className="border-b border-[#F5F5F5] hover:bg-[#FAFBF6]">
                  <td className="px-2 py-1.5 text-left">
                    {r.id != null ? <Link href={`/stores/${r.id}`} className="font-semibold text-[#1565C0] hover:underline">{r.name}</Link> : <span className="font-semibold">{r.name}</span>}
                    <div className="text-[10.5px] text-[#9E9E9E]">{r.code} · {r.officers} officer{r.officers === 1 ? "" : "s"}</div>
                  </td>
                  <td className="px-2 py-1.5 text-left text-[11.5px] text-[#616161]">{r.region || "—"}<div className="text-[10.5px] text-[#9E9E9E]" title={r.rmNames.length > 1 ? `Shared by ${r.rmNames.length} regional managers` : undefined}>{r.rm || "—"}</div></td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#616161]">{n(r.withMobile)}</td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: r.optedPeriod ? WA : "#BDBDBD" }}>{n(r.optedPeriod)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{n(r.opted)}{r.fromVisits ? <div className="text-[10px] text-[#1565C0]">{n(r.fromVisits)} on visits</div> : null}</td>
                  <td className="px-2 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="relative h-[8px] w-[60px] overflow-hidden rounded-full bg-[#F0F0F0]">
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (r.rate / maxRate) * 100)}%`, background: STATUS_META[r.status].color }} />
                        <div className="absolute inset-y-0 w-[2px] bg-[#424242]" style={{ left: `${Math.min(100, (data.benchmark.medianRate / maxRate) * 100)}%` }} title={`Median ${data.benchmark.medianRate}`} />
                      </div>
                      <span className="w-[32px] tabular-nums">{r.rate}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#616161]">{n(r.visits)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" title={`${n(r.convertedVisits)} of ${n(r.eligibleVisits)} visits to farmers not yet opted in produced an opt-in`}>
                    {r.eligibleVisits ? <>{p1(r.conv)} <span className="text-[10px] text-[#9E9E9E]">{n(r.convertedVisits)}/{n(r.eligibleVisits)}</span></> : <span className="text-[#BDBDBD]">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{n(r.hniOpted)} <span className="text-[10px] text-[#9E9E9E]">/ {n(r.hni)}</span></td>
                  <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: r.potential ? "#C62828" : "#BDBDBD" }}>{r.potential ? `+${n(r.potential)}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right text-[11.5px] tabular-nums" style={{ color: ago == null ? "#BDBDBD" : ago > 30 ? "#E65100" : "#616161" }}>{ago == null ? "never" : ago === 0 ? "today" : `${ago}d ago`}</td>
                  <td className="px-2 py-1.5 text-left"><Chip s={r.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="py-6 text-center text-[12px] text-[#BDBDBD]">No stores match.</div>}
      </div>
    </div>
  );
}

/* ── Region / RM roll-up ── */
function RollTable({ data, rows, first }: { data: OptInAnalytics; rows: OptInRollRow[]; first: string }) {
  const max = Math.max(0.1, ...rows.map((r) => r.rate));
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12px]">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-[#ECECEC] text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[#757575]">
            <th className="px-2 py-1.5 text-left">{first}</th><th className="px-2 py-1.5 text-right">Stores</th><th className="px-2 py-1.5 text-right">No opt-ins</th>
            <th className="px-2 py-1.5 text-right">Opt-ins ({periodWord(data.periodDays)})</th><th className="px-2 py-1.5 text-right">All time</th>
            <th className="px-2 py-1.5 text-left">Per 1,000 farmers</th><th className="px-2 py-1.5 text-right">Visit → opt-in</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.id ?? ""}|${r.label}`} className="border-b border-[#F5F5F5]">
              <td className="max-w-[220px] truncate px-2 py-1.5 font-semibold text-[#1A1C1A]" title={r.label}>{r.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-[#616161]">{n(r.stores)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: r.zeroStores ? "#C62828" : "#BDBDBD" }}>{n(r.zeroStores)}</td>
              <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: WA }}>{n(r.optedPeriod)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{n(r.opted)}</td>
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <div className="relative h-[10px] w-[140px] overflow-hidden rounded-full bg-[#F0F0F0]">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(r.rate / max) * 100}%`, background: r.rate >= data.benchmark.medianRate ? WA : "#E65100" }} />
                  </div>
                  <span className="tabular-nums">{r.rate}</span>
                </div>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.eligibleVisits ? `${p1(r.conv)}` : "—"} <span className="text-[10px] text-[#9E9E9E]">{n(r.converted)}/{n(r.eligibleVisits)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Officers ── */
function OfficerTable({ rows, data }: { rows: OptInOfficerRow[]; data: OptInAnalytics }) {
  const [view, setView] = useState<"coach" | "top" | "all">("coach");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    let f = rows.filter((o) => !t || `${o.name} ${o.code} ${o.store} ${o.region}`.toLowerCase().includes(t));
    if (view === "coach") f = f.filter((o) => o.visits >= 5 && o.converted === 0).sort((a, b) => b.eligibleVisits - a.eligibleVisits);
    else if (view === "top") f = f.filter((o) => o.credited > 0).sort((a, b) => b.credited - a.credited || b.conv - a.conv);
    else f = [...f].sort((a, b) => b.visits - a.visits);
    return f;
  }, [rows, view, q]);
  return (
    <div className={`${CARD} p-4`}>
      <Title hint={<>Visits = visits filled in the {periodWord(data.periodDays)}. “Visit → opt-in” = visits to farmers not yet opted in that produced an opt-in within a day (the farmer scanned the QR on the visit form). “Credited” = all opt-ins from that officer’s visits.</>}
        right={<div className="flex flex-wrap items-center gap-2">
          <Pills options={[{ key: "coach" as const, label: "Needs coaching" }, { key: "top" as const, label: "Top performers" }, { key: "all" as const, label: "All officers" }]} value={view} onChange={setView} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search officer / store…" className="w-[170px] rounded-[8px] border border-[#E0E0E0] px-2.5 py-1 text-[12px]" />
        </div>}>
        🧑‍🌾 Agri officers
      </Title>
      {view === "coach" && <div className="mb-2 rounded-[8px] bg-[#FFF8E1] px-3 py-1.5 text-[11.5px] text-[#8D6E00]">Officers with 5+ visits in the period and no opt-in from any of them — most visits first. Ask them to show the WhatsApp QR on the last page of the visit form.</div>}
      <div className="max-h-[460px] overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-[12px]">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-[#ECECEC] text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[#757575]">
              <th className="px-2 py-1.5 text-left">Officer</th><th className="px-2 py-1.5 text-left">Store · region</th>
              <th className="px-2 py-1.5 text-right">Visits</th><th className="px-2 py-1.5 text-right">Not yet opted in</th><th className="px-2 py-1.5 text-right">Produced opt-in</th>
              <th className="px-2 py-1.5 text-right">Conversion</th><th className="px-2 py-1.5 text-right">Credited (all time)</th><th className="px-2 py-1.5 text-right">Last opt-in</th><th className="px-2 py-1.5 text-right">Last visit</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((o) => (
              <tr key={o.key} className="border-b border-[#F5F5F5]">
                <td className="px-2 py-1.5 font-semibold text-[#1A1C1A]">{o.name}{o.code && <span className="ml-1 text-[10.5px] font-normal text-[#9E9E9E]">{o.code}</span>}</td>
                <td className="px-2 py-1.5 text-[11.5px] text-[#616161]">{o.store}<span className="text-[#9E9E9E]">{o.region ? ` · ${o.region}` : ""}</span></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{n(o.visits)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[#616161]">{n(o.eligibleVisits)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: o.converted ? "#1565C0" : "#BDBDBD" }}>{n(o.converted)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{o.eligibleVisits ? p1(o.conv) : "—"}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums" style={{ color: o.credited ? WA : "#BDBDBD" }}>{n(o.credited)}</td>
                <td className="px-2 py-1.5 text-right text-[11.5px] text-[#616161]">{fmtIst(o.lastOptIn)}</td>
                <td className="px-2 py-1.5 text-right text-[11.5px] text-[#616161]">{fmtIst(o.lastVisit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="py-6 text-center text-[12px] text-[#BDBDBD]">{view === "coach" ? "Nobody to coach — every active officer has produced an opt-in." : "No officers match."}</div>}
        {list.length > 300 && <div className="py-2 text-center text-[11px] text-[#9E9E9E]">Showing 300 of {n(list.length)} — use search or the Excel download.</div>}
      </div>
    </div>
  );
}

function SegCoverage({ title, rows }: { title: string; rows: OptInAnalytics["segments"]["value"] }) {
  const max = Math.max(0.1, ...rows.map((r) => (r.total ? (r.opted / r.total) * 1000 : 0)));
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold text-[#616161]">{title}</div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const rate = r.total ? Math.round((r.opted / r.total) * 10000) / 10 : 0;
          return (
            <div key={r.key} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-[96px] shrink-0 truncate font-semibold" style={{ color: r.color }}>{r.label}</span>
              <div className="relative h-[12px] flex-1 overflow-hidden rounded-[4px] bg-[#F3F3F3]"><div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${(rate / max) * 100}%`, background: r.color }} /></div>
              <span className="w-[150px] shrink-0 text-right tabular-nums text-[#616161]"><b className="text-[#1A1C1A]">{rate}</b> per 1,000 · {n(r.opted)}/{n(r.total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OptInAnalyticsTab() {
  const [period, setPeriod] = useState<number | null>(30);
  const [data, setData] = useState<OptInAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState("");
  const [rmId, setRmId] = useState<number | null>(null); // REGIONAL User id — never the display name
  const [rollDim, setRollDim] = useState<"region" | "rm">("region");
  const [origin, setOrigin] = useState<OptInOrigin | "ALL" | "UNLINKED">("ALL");
  const [lq, setLq] = useState("");
  const [busy, setBusy] = useState<"" | "link" | "xlsx">("");
  const seq = useRef(0);
  const { confirm, dialog } = useConfirm();

  const load = (p: number | null) => {
    const mine = ++seq.current;
    setLoading(true);
    getOptInAnalytics(p).then((d) => { if (mine === seq.current) { setData(d); setLoading(false); } }).catch(() => { if (mine === seq.current) setLoading(false); });
  };
  useEffect(() => { load(period); }, [period]);

  const regions = useMemo(() => [...new Set((data?.stores ?? []).map((s) => s.region).filter(Boolean))].sort(), [data]);
  // One option per manager, from the id lists — a store shared by two RMs feeds both, never a combined row.
  const rmOptions = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of data?.stores ?? []) if (!region || s.region === region) s.rmIds.forEach((id, i) => m.set(id, s.rmNames[i]));
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, region]);
  const stores = useMemo(() => (data?.stores ?? []).filter((s) => (!region || s.region === region) && (rmId == null || s.rmIds.includes(rmId))), [data, region, rmId]);
  const storeNames = useMemo(() => new Set(stores.map((s) => s.name)), [stores]);
  const filtered = !!(region || rmId != null);
  const officers = useMemo(() => (data?.officers ?? []).filter((o) => !filtered || storeNames.has(o.store)), [data, filtered, storeNames]);

  if (!data) return <div className={`${CARD} py-10 text-center text-[13px] text-[#9E9E9E]`}>{loading ? "Crunching opt-ins…" : "Couldn't load the opt-in analysis."}</div>;
  const k = data.kpi;

  // Filter-aware headline numbers (region / RM filter sums the store rows).
  const sum = (f: (s: OptInStoreRow) => number) => stores.reduce((t, s) => t + f(s), 0);
  const fOpted = filtered ? sum((s) => s.opted) : k.registered;
  const fMobile = filtered ? sum((s) => s.withMobile) : k.farmersWithMobile;
  const fPeriod = filtered ? sum((s) => s.optedPeriod) : k.inPeriod;
  const fElig = filtered ? sum((s) => s.eligibleVisits) : k.eligibleVisits;
  const fConv = filtered ? sum((s) => s.convertedVisits) : k.convertedVisits;
  const fZero = stores.filter((s) => s.opted === 0).length;
  const delta = k.prevPeriod != null && !filtered ? k.inPeriod - k.prevPeriod : null;

  // Focus lists for the marketing lead.
  const bigGaps = [...stores].sort((a, b) => b.potential - a.potential).filter((s) => s.potential > 0).slice(0, 5);
  const zeroBig = stores.filter((s) => s.opted === 0).sort((a, b) => b.withMobile - a.withMobile).slice(0, 5);
  const coach = officers.filter((o) => o.visits >= 5 && o.converted === 0).sort((a, b) => b.eligibleVisits - a.eligibleVisits).slice(0, 5);
  const ranked = officers.filter((o) => o.eligibleVisits >= 20).sort((a, b) => b.conv - a.conv);
  const topConv = ranked.length >= 5 ? ranked[Math.floor(ranked.length * 0.1)]?.conv ?? 0 : 0;
  const visitUpside = topConv > 0 ? Math.max(0, Math.round((fElig * topConv) / 100) - fConv) : 0;
  const totalPotential = sum((s) => s.potential);
  const hni = data.segments.value.find((s) => s.key === "HNI");
  const reg = data.segments.value.find((s) => s.key === "REGULAR");
  const hniRate = hni && hni.total ? (hni.opted / hni.total) * 1000 : 0, regRate = reg && reg.total ? (reg.opted / reg.total) * 1000 : 0;

  const listRows = data.list.filter((r) =>
    (origin === "ALL" || (origin === "UNLINKED" ? r.farmerId != null && !r.linked : r.origin === origin)) &&
    (!filtered || storeNames.has(r.store)) &&
    (!lq.trim() || `${r.mobile} ${r.name} ${r.farmerName} ${r.store} ${r.officer}`.toLowerCase().includes(lq.trim().toLowerCase())));

  const doLink = async () => {
    if (!(await confirm({ title: "Link opt-ins to farmers?", message: `${k.unlinked} opt-ins came from numbers that now belong to a registered farmer (they were registered after messaging us). Linking marks those farmers as opted in, so they count on Store 360 and in WhatsApp-only campaign filters.`, confirmLabel: "Link them" }))) return;
    setBusy("link");
    const r = await linkUnmatchedOptIns();
    setBusy("");
    if (!r.ok) alert(r.error ?? "Couldn't link."); else load(period);
  };
  const doXlsx = async () => {
    setBusy("xlsx");
    try {
      const r = await exportOptInAnalyticsXlsx(period);
      if (r.ok && r.b64 && r.filename) downloadB64(r.b64, r.filename); else alert(r.error ?? "Export failed.");
    } finally { setBusy(""); }
  };
  const sel = "rounded-[8px] border border-[#E0E0E0] bg-white px-2 py-1 text-[12px] text-[#424242]";

  return (
    <div className="flex flex-col gap-4" style={{ opacity: loading ? 0.6 : 1 }}>
      {dialog}
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Pills options={PERIODS} value={period} onChange={setPeriod} />
        <select value={region} onChange={(e) => { setRegion(e.target.value); setRmId(null); }} className={sel}>
          <option value="">All regions</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={rmId ?? ""} onChange={(e) => setRmId(e.target.value ? Number(e.target.value) : null)} className={sel}>
          <option value="">All RMs</option>{rmOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {filtered && <button type="button" onClick={() => { setRegion(""); setRmId(null); }} className="text-[11.5px] font-semibold text-[#9E9E9E] hover:text-[#424242]">✕ Clear</button>}
        <span className="text-[11px] text-[#9E9E9E]">{loading ? "Updating…" : `Updated ${fmtIstTime(data.generatedAt)}`}</span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => load(period)} className="rounded-[8px] border border-[#E0E0E0] px-3 py-1.5 text-[12px] font-semibold text-[#616161] hover:bg-[#F5F5F5]">↻ Refresh</button>
          <button type="button" onClick={doXlsx} disabled={busy !== ""} className="rounded-[8px] border px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40" style={{ borderColor: BRAND, color: BRAND }}>{busy === "xlsx" ? "Exporting…" : "⬇ Excel"}</button>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={`Opt-ins · ${periodWord(data.periodDays)}`} value={n(fPeriod)} tone={WA}
          sub={delta != null ? <span style={{ color: delta >= 0 ? BRAND_DK : "#C62828" }}>{delta >= 0 ? "▲" : "▼"} {n(Math.abs(delta))} vs previous {data.periodDays} days</span> : <>{n(k.total)} all time</>} />
        <Tile label="Opted-in farmers" value={n(fOpted)} sub={<>{filtered ? "registered + visit, these stores" : <>{n(k.unregistered)} more numbers aren&apos;t registered farmers</>}</>} />
        <Tile label="Per 1,000 farmers" value={String(fMobile ? Math.round((fOpted / fMobile) * 10000) / 10 : 0)} sub={<>of {n(fMobile)} farmers with a mobile · median store {data.benchmark.medianRate}</>} />
        <Tile label="Visit → opt-in" value={p1(pct(fConv, fElig))} tone={pct(fConv, fElig) < 2 ? "#C62828" : "#1565C0"} sub={<>{n(fConv)} of {n(fElig)} visits ({periodWord(data.periodDays)})</>} />
        <Tile label="Stores with no opt-ins" value={`${n(fZero)}`} tone={fZero ? "#C62828" : BRAND_DK} sub={<>of {n(stores.length)} stores</>} />
        <Tile label="Officers to coach" value={n(filtered ? officers.filter((o) => o.visits >= 5 && o.converted === 0).length : k.officersZero)} tone="#E65100" sub={<>5+ visits, no opt-in from them</>} />
        <Tile label="Came during field visits" value={n(k.fromVisits)} tone="#1565C0" sub={<>{p1(pct(k.fromVisits, k.total))} of all opt-ins</>} />
        <Tile label="Bought after opting in" value={n(k.buyersAfter)} sub={<>{inr(k.salesAfter)} base sales since opting in</>} />
      </div>

      {/* Where to focus */}
      <div className={`${CARD} border-l-4 p-4`} style={{ borderLeftColor: BRAND }}>
        <Title>🎯 Where to focus</Title>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div>
            <div className="mb-1 text-[12px] font-bold text-[#C62828]">Biggest gaps — +{n(totalPotential)} opt-ins possible</div>
            <div className="mb-1.5 text-[11px] text-[#9E9E9E]">If these stores reached the top-quarter rate ({data.benchmark.topRate} per 1,000)</div>
            {bigGaps.length === 0 ? <div className="text-[12px] text-[#BDBDBD]">No gaps.</div> : bigGaps.map((s) => (
              <div key={s.name} className="flex items-center justify-between border-b border-[#F5F5F5] py-1 text-[12px]">
                <span className="truncate">{s.id != null ? <Link href={`/stores/${s.id}`} className="font-semibold text-[#1565C0] hover:underline">{s.name}</Link> : s.name} <span className="text-[10.5px] text-[#9E9E9E]">{s.region}</span></span>
                <span className="shrink-0 tabular-nums"><b className="text-[#C62828]">+{n(s.potential)}</b> <span className="text-[10.5px] text-[#9E9E9E]">{n(s.opted)} now</span></span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[12px] font-bold text-[#C62828]">Big stores with zero opt-ins</div>
            <div className="mb-1.5 text-[11px] text-[#9E9E9E]">Largest farmer base first — quickest wins</div>
            {zeroBig.length === 0 ? <div className="text-[12px]" style={{ color: BRAND_DK }}>Every store has at least one opt-in.</div> : zeroBig.map((s) => (
              <div key={s.name} className="flex items-center justify-between border-b border-[#F5F5F5] py-1 text-[12px]">
                <span className="truncate">{s.id != null ? <Link href={`/stores/${s.id}`} className="font-semibold text-[#1565C0] hover:underline">{s.name}</Link> : s.name} <span className="text-[10.5px] text-[#9E9E9E]">{s.rm}</span></span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#616161]">{n(s.withMobile)} farmers · {n(s.visits)} visits</span>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-[12px] font-bold text-[#E65100]">Officers visiting but not converting</div>
            <div className="mb-1.5 text-[11px] text-[#9E9E9E]">Most visits with no opt-in — remind them to show the QR</div>
            {coach.length === 0 ? <div className="text-[12px]" style={{ color: BRAND_DK }}>Nobody — nice.</div> : coach.map((o) => (
              <div key={o.key} className="flex items-center justify-between border-b border-[#F5F5F5] py-1 text-[12px]">
                <span className="truncate font-semibold text-[#1A1C1A]">{o.name} <span className="text-[10.5px] font-normal text-[#9E9E9E]">{o.store}</span></span>
                <span className="shrink-0 text-[11px] tabular-nums text-[#616161]">{n(o.visits)} visits · 0 opt-ins</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-[#F0F0F0] pt-3 text-[12px] text-[#424242]">
          <div>📋 Only <b>{n(fConv)}</b> of <b>{n(fElig)}</b> visits ({p1(pct(fConv, fElig))}) in the {periodWord(data.periodDays)} ended with the farmer opting in.
            {visitUpside > 0 && <> If every officer converted like the top 10% ({p1(topConv)}), that&apos;s about <b style={{ color: BRAND_DK }}>+{n(visitUpside)}</b> more opt-ins.</>}</div>
          {hni && hniRate > 0 && <div>💎 HNI farmers opt in at <b>{Math.round(hniRate * 10) / 10}</b> per 1,000{regRate > 0 ? <> — {Math.round((hniRate / regRate) * 10) / 10}× Regular farmers</> : null}. <b>{n(hni.total - hni.opted)}</b> HNI farmers still aren&apos;t on WhatsApp — the most valuable people to invite.</div>}
          {k.unregistered > 0 && <div>📇 <b>{n(k.unregistered)}</b> numbers opted in but aren&apos;t registered farmers — leads to register (filter “Not registered” in the list below).</div>}
          {k.unlinked > 0 && (
            <div className="flex flex-wrap items-center gap-2">🔗 <span><b>{n(k.unlinked)}</b> opt-ins are from farmers registered after they messaged us, so their farmer record isn&apos;t marked opted in yet (they&apos;re counted here by mobile).</span>
              <button type="button" onClick={doLink} disabled={busy !== ""} className="rounded-[7px] px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40" style={{ background: BRAND }}>{busy === "link" ? "Linking…" : `Link ${n(k.unlinked)} now`}</button>
            </div>
          )}
        </div>
      </div>

      {/* Trend + origin */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={`${CARD} p-4 lg:col-span-2`}>
          <Title hint="Each bar is one day (IST), split by how the opt-in came."
            right={<div className="flex flex-wrap gap-2.5 text-[11px] text-[#616161]">{(Object.keys(ORIGIN_LABEL) as OptInOrigin[]).map((o) => <span key={o} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: ORIGIN_COLOR[o] }} />{ORIGIN_LABEL[o]}</span>)}</div>}>
            📈 Opt-ins per day
          </Title>
          <TrendChart daily={data.daily} />
        </div>
        <div className={`${CARD} p-4`}>
          <Title hint={`All ${n(k.total)} opt-ins`}>How people opt in</Title>
          {(() => {
            const parts: { o: OptInOrigin; v: number }[] = [{ o: "VISIT", v: k.fromVisits }, { o: "FARMER", v: k.registered - k.fromVisits }, { o: "UNREGISTERED", v: k.unregistered }];
            return (<>
              <div className="flex h-[16px] gap-[2px] overflow-hidden rounded-[5px]">{parts.filter((p) => p.v > 0).map((p) => <div key={p.o} style={{ width: `${pct(p.v, k.total)}%`, background: ORIGIN_COLOR[p.o] }} title={`${ORIGIN_LABEL[p.o]}: ${n(p.v)}`} />)}</div>
              <div className="mt-2 flex flex-col gap-1">{parts.map((p) => (
                <div key={p.o} className="flex items-center justify-between text-[12px]"><span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: ORIGIN_COLOR[p.o] }} />{ORIGIN_LABEL[p.o]}</span><span className="tabular-nums"><b>{n(p.v)}</b> <span className="text-[10.5px] text-[#9E9E9E]">{p1(pct(p.v, k.total))}</span></span></div>
              ))}</div>
            </>);
          })()}
          <div className="mt-3 border-t border-[#F0F0F0] pt-2.5 text-[12px] text-[#424242]">
            <div className="mb-1 text-[11.5px] font-semibold text-[#616161]">Engagement</div>
            <div className="flex justify-between"><span>Messaged us in the last 30 days</span><b className="tabular-nums">{n(k.active30)}</b></div>
            <div className="flex justify-between"><span>Sent more than one message</span><b className="tabular-nums">{n(k.engaged)}</b></div>
            <div className="flex justify-between"><span>We replied to</span><b className="tabular-nums">{n(k.replied)}</b></div>
            <div className="mt-1.5 text-[11px] text-[#9E9E9E]">Opt-in message language ({periodWord(data.periodDays)}): English {n(data.language.english)} · Hindi {n(data.language.hindi)} · other {n(data.language.other)}</div>
          </div>
        </div>
      </div>

      <StoreTable rows={stores} data={data} />

      <div className={`${CARD} p-4`}>
        <Title hint="Lowest opt-in rate first — the regions / RMs that most need a push. A store with two regional managers counts under each of them, so the RM rows can add up to more than the store total."
          right={<Pills options={[{ key: "region" as const, label: "By region" }, { key: "rm" as const, label: "By RM" }]} value={rollDim} onChange={setRollDim} />}>
          🗺️ Regions &amp; RMs
        </Title>
        <RollTable data={data} first={rollDim === "region" ? "Region" : "RM"}
          rows={(rollDim === "region" ? data.regions : data.rms).filter((r) =>
            !filtered || (rollDim === "region"
              ? !region || r.label === region
              : (rmId == null || r.id === rmId) && (!region || stores.some((s) => r.id != null && s.rmIds.includes(r.id)))))} />
      </div>

      <OfficerTable rows={officers} data={data} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <Title hint="Opt-ins per 1,000 farmers in each segment — are we reaching the valuable ones?">💎 Who is opting in</Title>
          <div className="flex flex-col gap-4">
            <SegCoverage title="Value segment" rows={data.segments.value} />
            <SegCoverage title="Lifecycle" rows={data.segments.lifecycle} />
          </div>
        </div>
        <div className={`${CARD} p-4`}>
          <Title hint="Test-group farmers of each active campaign who can be messaged on WhatsApp (opted in).">📣 WhatsApp reach of active campaigns</Title>
          {data.campaigns.length === 0 ? <div className="text-[12px] text-[#BDBDBD]">No active campaigns.</div> : (
            <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto">
              {data.campaigns.map((c) => (
                <div key={c.id} className="text-[12px]">
                  <div className="flex justify-between gap-2"><span className="truncate font-semibold text-[#1A1C1A]" title={c.name}>{c.name}</span><span className="shrink-0 tabular-nums text-[#616161]"><b style={{ color: WA }}>{n(c.opted)}</b> / {n(c.test)} · {p1(pct(c.opted, c.test))}</span></div>
                  <div className="mt-0.5 h-[6px] overflow-hidden rounded-full bg-[#F0F0F0]"><div className="h-full rounded-full" style={{ width: `${Math.max(c.opted ? 1 : 0, pct(c.opted, c.test))}%`, background: WA }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`${CARD} p-4`}>
        <Title hint={`When farmers scan / message (IST, ${periodWord(data.periodDays)}) — plan QR drives and broadcasts around the busy hours.`}>🕘 When people opt in</Title>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="md:col-span-2"><MiniBars title="Hour of day" values={data.hours} labels={data.hours.map((_, i) => (i % 3 === 0 ? `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i < 12 ? "a" : "p"}` : ""))} color={WA} /></div>
          <MiniBars title="Day of week" values={data.weekdays} labels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]} color="#1565C0" />
        </div>
      </div>

      {/* Opt-in list */}
      <div className={`${CARD} p-4`}>
        <Title hint="Every opt-in, newest first, with how it came and who gets credit."
          right={<div className="flex flex-wrap items-center gap-2">
            <Pills options={[{ key: "ALL" as const, label: "All" }, { key: "VISIT" as const, label: "Field visit" }, { key: "FARMER" as const, label: "Registered" }, { key: "UNREGISTERED" as const, label: "Not registered" }, { key: "UNLINKED" as const, label: "Not linked" }]} value={origin} onChange={setOrigin} />
            <input value={lq} onChange={(e) => setLq(e.target.value)} placeholder="Search number, name, store…" className="w-[180px] rounded-[8px] border border-[#E0E0E0] px-2.5 py-1 text-[12px]" />
          </div>}>
          📋 Opt-ins ({n(listRows.length)})
        </Title>
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-[12px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#ECECEC] text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[#757575]">
                <th className="px-2 py-1.5 text-left">Opted in</th><th className="px-2 py-1.5 text-left">Number · WhatsApp name</th><th className="px-2 py-1.5 text-left">How</th>
                <th className="px-2 py-1.5 text-left">Farmer</th><th className="px-2 py-1.5 text-left">Store</th><th className="px-2 py-1.5 text-left">Officer (visit)</th><th className="px-2 py-1.5 text-right">Messages</th>
              </tr>
            </thead>
            <tbody>
              {listRows.slice(0, 500).map((r) => (
                <tr key={r.mobile} className="border-b border-[#F5F5F5]">
                  <td className="whitespace-nowrap px-2 py-1.5 text-[11.5px] text-[#616161]">{fmtIstTime(r.optInAt)}</td>
                  <td className="px-2 py-1.5"><span className="tabular-nums font-semibold text-[#1A1C1A]">{r.mobile}</span>{r.name && <span className="ml-1 text-[11px] text-[#9E9E9E]">{r.name}</span>}</td>
                  <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1 text-[11.5px]"><span className="inline-block h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[r.origin] }} />{ORIGIN_LABEL[r.origin]}</span></td>
                  <td className="px-2 py-1.5">{r.farmerId != null ? <><Link href={`/farmers/${r.farmerId}`} className="font-semibold text-[#1565C0] hover:underline">{r.farmerName || `#${r.farmerId}`}</Link>{!r.linked && <span className="ml-1 rounded bg-[#FFF3E0] px-1 text-[10px] font-semibold text-[#E65100]" title="Matches by mobile; not linked to the farmer record yet">not linked</span>}</> : <span className="text-[#BDBDBD]">—</span>}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-[#616161]">{r.store || "—"}</td>
                  <td className="px-2 py-1.5 text-[11.5px] text-[#616161]">{r.officer || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{n(r.messages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {listRows.length > 500 && <div className="py-2 text-center text-[11px] text-[#9E9E9E]">Showing 500 of {n(listRows.length)} — the Excel download has them all.</div>}
        </div>
      </div>

      <div className="text-[11px] leading-relaxed text-[#9E9E9E]">
        How opt-ins are credited: the QR on the visit form is the same for everyone, so an opt-in counts as “during a field visit” when the number messaged us within 12 hours before to 24 hours after a visit to that farmer — the officer who filled that visit gets the credit, at the visit&apos;s store. Otherwise a registered farmer counts for their home store; numbers that match no farmer have no store. The region / RM filter applies to the store, region, officer and list sections and the store-based tiles; picking an RM shows every store they manage, including ones they share with another manager.
      </div>
    </div>
  );
}
