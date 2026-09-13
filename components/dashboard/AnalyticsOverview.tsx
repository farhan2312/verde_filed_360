import Link from "next/link";
import { Card } from "@/components/ui";
import {
  KPI_CARDS,
  ACTIVITY_BARS,
  FUNNEL,
  CROPS,
  INSIGHTS,
} from "@/lib/demo-metrics";
import type { KpiData } from "@/app/actions/dashboard";

export interface RecentVisitVM {
  id: number;
  farmer: string;
  village: string;
  crop: string;
  officer: string;
  date: string;
  init: string;
  avatarBg: string;
  status: string;
  sBg: string;
  sColor: string;
}


/** Build a cumulative conic-gradient string from the crop distribution. */
function donutGradient(crops: typeof CROPS): string {
  let acc = 0;
  const stops = crops.map((c) => {
    const start = acc;
    acc += c.pct;
    return `${c.color} ${start}% ${acc}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

/* ── KPI cards grid (over kpiData) ── */
function KpiCardGrid({ kpi }: { kpi: KpiData }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-[18px] lg:grid-cols-4">
      {KPI_CARDS.map((k) => (
        <Card key={k.key} className="p-[22px] pb-[18px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-[#9E9E9E]">
            {k.title}
          </div>
          <div className="mt-2.5 flex items-end gap-2.5">
            <div className="text-[30px] font-bold leading-none text-[#1A1C1A]">
              {kpi[k.key]}
            </div>
            <span
              className="mb-1 rounded-[20px] px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: k.accent, background: k.bg }}
            >
              {k.change}
            </span>
          </div>
          <div className="mt-2 text-[10.5px] text-[#BDBDBD]">{k.sub}</div>
        </Card>
      ))}
    </div>
  );
}

/* ── Visit Activity bar chart (last 7 days) ── */
function VisitActivityChart() {
  const max = Math.max(...ACTIVITY_BARS.map((b) => b.c));
  const peak = ACTIVITY_BARS.reduce(
    (best, b, i) => (b.c > ACTIVITY_BARS[best].c ? i : best),
    0,
  );
  return (
    <Card className="p-[22px]">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-[15px] font-bold text-[#1A1C1A]">Visit Activity</div>
        <div className="text-[11px] text-[#9E9E9E]">Last 7 days</div>
      </div>
      <div className="flex h-40 items-end gap-2.5">
        {ACTIVITY_BARS.map((b, i) => (
          <div
            key={b.l}
            className="flex h-full flex-1 flex-col items-center justify-end"
          >
            <div className="mb-1.5 text-[11px] font-semibold text-[#424242]">
              {b.c}
            </div>
            <div
              className="w-full rounded-t-lg rounded-b-[2px]"
              style={{
                height: `${Math.round((b.c / max) * 140)}px`,
                background: i === peak ? "#7DA02E" : "#CCE09A",
              }}
            />
            <div className="mt-2 text-[10.5px] font-medium text-[#BDBDBD]">
              {b.l}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Lead Funnel ── */
function LeadFunnel() {
  return (
    <Card className="p-[22px]">
      <div className="mb-[18px] text-[15px] font-bold text-[#1A1C1A]">
        Lead Funnel
      </div>
      {FUNNEL.map((f) => (
        <div key={f.label} className="mb-3.5">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-[#616161]">{f.label}</span>
            <span className="font-bold text-[#1A1C1A]">{f.count}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-[5px] bg-[#F0F0F0]">
            <div
              className="h-full rounded-[5px]"
              style={{ width: `${f.pct}%`, background: f.color }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}

/* ── Recent Visits (role-filtered feed; rows link to /visits/[id]) ── */
function RecentVisits({ recent }: { recent: RecentVisitVM[] }) {
  return (
    <Card className="p-[22px]">
      <div className="mb-4 text-[15px] font-bold text-[#1A1C1A]">
        Recent Visits
      </div>
      {recent.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-[#9E9E9E]">
          No recent visits yet.
        </div>
      ) : (
        recent.map((v) => (
          <Link
            key={v.id}
            href={`/visits/${v.id}`}
            className="-mx-2 flex items-center gap-3.5 rounded-lg border-b border-[#F5F5F5] px-2 py-3 transition-colors hover:bg-[#F5FFF5]"
          >
            <div
              className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: v.avatarBg }}
            >
              {v.init}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-[#1A1C1A]">
                {v.farmer}
              </div>
              <div className="mt-px text-[11.5px] text-[#9E9E9E]">
                {v.village} · {v.crop}
              </div>
              <div className="mt-0.5 text-[10.5px] text-[#BDBDBD]">
                By {v.officer}
              </div>
            </div>
            <div className="flex-none text-right">
              <div className="text-[11px] text-[#BDBDBD]">{v.date}</div>
              <div className="mt-[3px] text-[10px] font-semibold text-[#7DA02E]">
                View →
              </div>
            </div>
            <div
              className="flex-none rounded-[20px] px-2.5 py-0.5 text-[10.5px] font-semibold"
              style={{ background: v.sBg, color: v.sColor }}
            >
              {v.status}
            </div>
          </Link>
        ))
      )}
    </Card>
  );
}

/* ── Top Crops donut ── */
function TopCropsDonut({ centerValue }: { centerValue: string }) {
  return (
    <Card className="p-[22px]">
      <div className="mb-[18px] text-[15px] font-bold text-[#1A1C1A]">
        Top Crops
      </div>
      <div className="mb-[18px] flex justify-center">
        <div
          className="relative h-40 w-40 rounded-full"
          style={{ background: donutGradient(CROPS) }}
        >
          <div className="absolute left-7 top-7 flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-white">
            <div className="text-2xl font-bold text-[#1A1C1A]">{centerValue}</div>
            <div className="text-[10px] text-[#9E9E9E]">visits</div>
          </div>
        </div>
      </div>
      {CROPS.map((c) => (
        <div key={c.name} className="mb-2 flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 flex-none rounded-[3px]"
            style={{ background: c.color }}
          />
          <div className="flex-1 text-xs text-[#616161]">{c.name}</div>
          <div className="text-xs font-semibold text-[#1A1C1A]">{c.pct}%</div>
        </div>
      ))}
    </Card>
  );
}

/* ── Smart Insights ── */
function SmartInsights() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {INSIGHTS.map((ins) => (
        <Card
          key={ins.title}
          className="border-t-[3px] p-[18px]"
          style={{ borderTopColor: ins.accent }}
        >
          <div
            className="mb-2 text-xs font-bold"
            style={{ color: ins.accent }}
          >
            {ins.title}
          </div>
          <div className="text-xs leading-[1.55] text-[#616161]">{ins.text}</div>
        </Card>
      ))}
    </div>
  );
}

/** Shared analytics block — renders for EVERY role (showAnalytics is always true). */
export function AnalyticsOverview({
  kpi,
  recent,
  cropTotal,
}: {
  kpi: KpiData;
  recent: RecentVisitVM[];
  cropTotal: string;
}) {
  return (
    <>
      <KpiCardGrid kpi={kpi} />

      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <VisitActivityChart />
        <LeadFunnel />
      </div>

      <div className="mb-[18px] grid grid-cols-1 gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <RecentVisits recent={recent} />
        <TopCropsDonut centerValue={cropTotal} />
      </div>

      <SmartInsights />
    </>
  );
}
