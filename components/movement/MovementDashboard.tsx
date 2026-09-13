"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal, ModalHeader } from "@/components/interactive";
import { getProductMovement, type MovementOverview, type MoverRow, type DeadRow, type StoreRow, type ProductMovement } from "@/app/actions/movement";
import { searchProductOptions } from "@/app/actions/products";

const CARD = "rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]";
const n = (x: number) => Math.round(x).toLocaleString("en-IN");
const inr = (x: number) => "₹" + Math.round(x).toLocaleString("en-IN");
const short = (x: number) => (x >= 1e7 ? (x / 1e7).toFixed(1) + "Cr" : x >= 1e5 ? (x / 1e5).toFixed(1) + "L" : x >= 1e3 ? (x / 1e3).toFixed(0) + "k" : String(Math.round(x)));
const CAT_COLOR: Record<string, string> = {
  "FERTILIZER BULK": "#678722", "FERTILIZER": "#8CB337", "SEEDS": "#EDA942",
  "CPC (CROP PROTECTION CHEMICALS)": "#C62828", "MICRO NUTRIENTS": "#1565C0",
  "OTHERS": "#757575", "MECHANICAL SPRAYER": "#6A1B9A", "ELECTRICAL EQUIPMENT": "#00838F",
};
const catColor = (c: string) => CAT_COLOR[c] ?? "#616161";

export function MovementDashboard({ overview, movers, stores }: {
  overview: MovementOverview; movers: { fast: MoverRow[]; dead: DeadRow[] }; stores: StoreRow[];
}) {
  const [drill, setDrill] = useState<{ id: number; name: string } | null>(null);
  const maxTrend = Math.max(1, ...overview.trend.map((t) => t.units));
  const maxCat = Math.max(1, ...overview.categories.map((c) => c.rev));
  const maxStore = Math.max(1, ...stores.map((s) => s.rev));

  const KPIS = [
    ["Units sold", n(overview.kpis.units)], ["Revenue", inr(overview.kpis.rev)],
    ["Products moved", n(overview.kpis.products)], ["Bills", n(overview.kpis.bills)], ["Stores", String(overview.kpis.stores)],
  ] as const;

  return (
    <div className="animate-[fadeUp_0.4s_ease-out]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12.5px] text-[#757575]">Product velocity &amp; demand signal — a reorder guide from sales-out history (no live inventory).</div>
        <div className="flex items-center gap-2">
          <ProductSearch onPick={(id, name) => setDrill({ id, name })} />
          {overview.asof && <span className="rounded-full bg-[#F5F7F5] px-2.5 py-1 text-[11px] font-semibold text-[#616161]">as of {overview.asof}</span>}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-[14px] sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map(([label, val]) => (
          <div key={label} className={`${CARD} p-4`}>
            <div className="text-[11px] font-bold uppercase tracking-[0.4px] text-[#9E9E9E]">{label}</div>
            <div className="mt-1 text-[20px] font-bold text-[#1A1C1A]">{val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-[14px] lg:grid-cols-3">
        {/* Monthly trend */}
        <div className={`${CARD} p-4 lg:col-span-2`}>
          <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">Monthly units sold</div>
          <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 160 }}>
            {overview.trend.map((t) => (
              <div key={t.ym} className="group flex min-w-[16px] flex-1 flex-col items-center justify-end" title={`${t.ym}: ${n(t.units)} units · ${inr(t.rev)}`}>
                <div className="w-full rounded-t-[3px] bg-[#678722] transition-colors group-hover:bg-[#516A1B]" style={{ height: `${(t.units / maxTrend) * 130}px` }} />
                <div className="mt-1 rotate-0 text-[8px] text-[#BDBDBD]">{t.ym.slice(2)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category split */}
        <div className={`${CARD} p-4`}>
          <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">Revenue by category</div>
          <div className="flex flex-col gap-2">
            {overview.categories.slice(0, 8).map((c) => (
              <div key={c.cat}>
                <div className="flex justify-between text-[11px]"><span className="truncate font-medium text-[#424242]" title={c.cat}>{c.cat}</span><span className="text-[#9E9E9E]">{inr(c.rev)}</span></div>
                <div className="mt-0.5 h-2 rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full" style={{ width: `${(c.rev / maxCat) * 100}%`, background: catColor(c.cat) }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Movers */}
      <div className="mt-[14px] grid grid-cols-1 gap-[14px] lg:grid-cols-2">
        <MoverTable title="Fast movers" subtitle={`Top units in the 90 days to ${overview.asof ?? "—"}`} accent="#678722"
          rows={movers.fast.map((f) => ({ id: f.id, name: f.name, cat: f.cat, right: n(f.units) + " u", sub: inr(f.rev), onClick: () => setDrill({ id: f.id, name: f.name }) }))} />
        <MoverTable title="Dead stock" subtitle="No sale in 180+ days of activity" accent="#C62828"
          rows={movers.dead.map((d) => ({ id: d.id, name: d.name, cat: d.cat, right: d.daysIdle + "d idle", sub: `last ${d.last ?? "—"}`, onClick: () => setDrill({ id: d.id, name: d.name }) }))} />
      </div>

      {/* Store leaderboard */}
      <div className={`${CARD} mt-[14px] p-4`}>
        <div className="mb-3 text-[13px] font-bold text-[#1A1C1A]">Store leaderboard</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead><tr className="border-b border-[#EEE] text-[10px] font-bold uppercase text-[#9E9E9E]"><th className="py-2">Store</th><th className="text-right">Units</th><th className="text-right">Bills</th><th className="w-[40%]">Revenue</th></tr></thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.name} className="border-b border-[#F5F5F5]">
                  <td className="py-2 font-semibold text-[#1A1C1A]">{s.name}</td>
                  <td className="text-right text-[#616161]">{n(s.units)}</td>
                  <td className="text-right text-[#616161]">{n(s.bills)}</td>
                  <td><div className="flex items-center gap-2"><div className="h-2 flex-1 rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full bg-[#678722]" style={{ width: `${(s.rev / maxStore) * 100}%` }} /></div><span className="w-[70px] text-right text-[11px] font-semibold text-[#678722]">{inr(s.rev)}</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {drill && <ProductDrill product={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function MoverTable({ title, subtitle, accent, rows }: {
  title: string; subtitle: string; accent: string;
  rows: { id: number; name: string; cat: string | null; right: string; sub: string; onClick: () => void }[];
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="border-b border-[#F0F0F0] px-4 py-2.5" style={{ borderTop: `3px solid ${accent}` }}>
        <div className="text-[13px] font-bold text-[#1A1C1A]">{title}</div>
        <div className="text-[11px] text-[#9E9E9E]">{subtitle}</div>
      </div>
      {rows.length === 0 ? <div className="px-4 py-8 text-center text-[12.5px] text-[#9E9E9E]">None.</div> : rows.map((r) => (
        <button key={r.id} type="button" onClick={r.onClick} className="flex w-full items-center gap-3 border-b border-[#F5F5F5] px-4 py-2 text-left hover:bg-[#FAFAFA]">
          <div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-semibold text-[#1A1C1A]">{r.name}</div><div className="text-[10.5px] text-[#9E9E9E]">{r.cat ?? "—"}</div></div>
          <div className="text-right"><div className="text-[12.5px] font-bold" style={{ color: accent }}>{r.right}</div><div className="text-[10.5px] text-[#9E9E9E]">{r.sub}</div></div>
        </button>
      ))}
    </div>
  );
}

function ProductSearch({ onPick }: { onPick: (id: number, name: string) => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<{ id: number; name: string; category: string | null }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setOpts([]); return; }
    const t = setTimeout(async () => { setOpts(await searchProductOptions(q.trim(), -1)); setOpen(true); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} placeholder="Drill a product…"
        className="w-[200px] rounded-lg border border-[#E0E0E0] px-3 py-1.5 text-[12.5px]" />
      {open && opts.length > 0 && (
        <div className="absolute right-0 z-20 mt-1 max-h-[260px] w-[280px] overflow-y-auto rounded-[10px] border border-[#E0E0E0] bg-white shadow-lg">
          {opts.map((o) => (
            <button key={o.id} type="button" onClick={() => { onPick(o.id, o.name); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-[#F5FBF5]">
              <span className="truncate font-medium text-[#1A1C1A]">{o.name}</span><span className="ml-2 shrink-0 text-[10px] text-[#9E9E9E]">{o.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductDrill({ product, onClose }: { product: { id: number; name: string }; onClose: () => void }) {
  const [data, setData] = useState<ProductMovement | null>(null);
  const [, start] = useTransition();
  useEffect(() => { start(async () => setData(await getProductMovement(product.id))); }, [product.id]);
  const maxM = Math.max(1, ...(data?.monthly.map((m) => m.units) ?? [1]));
  const maxS = Math.max(1, ...(data?.stores.map((s) => s.units) ?? [1]));
  return (
    <Modal open onClose={onClose} className="max-w-[720px]">
      <ModalHeader eyebrow="Product movement" eyebrowColor="#678722" title={product.name} subtitle="Monthly units & top stores" onClose={onClose} />
      <div className="max-h-[64vh] overflow-y-auto px-5 py-4">
        {!data ? <div className="py-8 text-center text-[13px] text-[#9E9E9E]">Loading…</div> : (
          <>
            <div className="mb-1 text-[11px] font-bold uppercase text-[#9E9E9E]">Monthly units</div>
            <div className="mb-4 flex items-end gap-[3px]" style={{ height: 120 }}>
              {data.monthly.map((m) => (
                <div key={m.ym} className="flex min-w-[14px] flex-1 flex-col items-center justify-end" title={`${m.ym}: ${n(m.units)} units`}>
                  <div className="w-full rounded-t-[2px] bg-[#678722]" style={{ height: `${(m.units / maxM) * 96}px` }} />
                  <div className="mt-0.5 text-[7.5px] text-[#BDBDBD]">{m.ym.slice(2)}</div>
                </div>
              ))}
            </div>
            <div className="mb-1 text-[11px] font-bold uppercase text-[#9E9E9E]">Top stores</div>
            <div className="flex flex-col gap-1.5">
              {data.stores.map((s) => (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="w-[42%] truncate text-[12px] text-[#424242]">{s.name}</span>
                  <div className="h-2 flex-1 rounded-full bg-[#F0F0F0]"><div className="h-2 rounded-full bg-[#678722]" style={{ width: `${(s.units / maxS) * 100}%` }} /></div>
                  <span className="w-[50px] text-right text-[11px] font-semibold text-[#678722]">{short(s.units)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
