/** KPI strip — 4 cards: Total / Need Follow-up / Officers Active / Farmers Covered. */

interface KpiConfig {
  key: "total" | "followup" | "officers" | "farmers";
  label: string;
  tileBg: string;
  fill: string;
  icon: React.ReactNode;
}

const KPIS: KpiConfig[] = [
  {
    key: "total",
    label: "Total Visits",
    tileBg: "#F5F9EA",
    fill: "#7DA02E",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="#7DA02E">
        <rect x="2" y="2" width="14" height="3" rx="1" />
        <rect x="2" y="7" width="14" height="3" rx="1" opacity="0.7" />
        <rect x="2" y="12" width="9" height="3" rx="1" opacity="0.5" />
      </svg>
    ),
  },
  {
    key: "followup",
    label: "Need Follow-up",
    tileBg: "#FFF3E0",
    fill: "#E65100",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="#E65100">
        <path d="M9 1l2 5.5H17l-4.9 3.5 1.9 5.5L9 12l-5 3.5 1.9-5.5L1 6.5h6z" />
      </svg>
    ),
  },
  {
    key: "officers",
    label: "Officers Active",
    tileBg: "#E3F2FD",
    fill: "#1565C0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="#1565C0">
        <circle cx="9" cy="6" r="4" />
        <path d="M2 16c0-4 3-6 7-6s7 2 7 6" />
      </svg>
    ),
  },
  {
    key: "farmers",
    label: "Farmers Covered",
    tileBg: "#F3E5F5",
    fill: "#7B1FA2",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="#7B1FA2">
        <path d="M9 1L2 5v6c0 4 3.4 6.8 7 8 3.6-1.2 7-4 7-8V5L9 1z" />
      </svg>
    ),
  },
];

export function VisitKpiStrip({
  total,
  followup,
  officers,
  farmers,
}: {
  total: number;
  followup: number;
  officers: number;
  farmers: number;
}) {
  const values = { total, followup, officers, farmers };
  return (
    <div className="grid grid-cols-2 gap-[14px] mb-5 lg:grid-cols-4">
      {KPIS.map((k) => (
        <div
          key={k.key}
          className="bg-white rounded-xl px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-black/[0.03] flex items-center gap-[14px]"
        >
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: k.tileBg }}
          >
            {k.icon}
          </div>
          <div>
            <div className="text-2xl font-bold text-[#1A1C1A] leading-none">
              {values[k.key]}
            </div>
            <div className="text-[11px] text-[#9E9E9E] mt-[3px]">{k.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
