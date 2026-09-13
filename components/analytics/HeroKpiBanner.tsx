/** Hero KPI strip — 4 live cells on a green gradient. */
export interface KpiCell {
  label: string;
  value: string;
  sub: string;
}

const FALLBACK: KpiCell[] = [
  { label: "Revenue (period)", value: "—", sub: "" },
  { label: "Active Customers", value: "—", sub: "" },
  { label: "Avg Bill Value", value: "—", sub: "" },
  { label: "Total Farmers", value: "—", sub: "" },
];

export function HeroKpiBanner({ cells }: { cells?: KpiCell[] }) {
  const list = cells && cells.length ? cells : FALLBACK;
  return (
    <div className="rounded-[14px] px-5 py-[18px] mb-5 grid grid-cols-2 gap-5 text-white bg-[linear-gradient(135deg,#516A1B,#678722,#8CB337)] lg:px-7 lg:py-[22px] lg:grid-cols-4">
      {list.map((c) => (
        <div key={c.label}>
          <div className="text-[10px] opacity-70 uppercase tracking-[0.8px] mb-1.5">
            {c.label}
          </div>
          <div className="text-[28px] font-bold">{c.value}</div>
          <div className="text-[11px] opacity-70 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
