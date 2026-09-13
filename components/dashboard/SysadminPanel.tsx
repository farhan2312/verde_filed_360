import Link from "next/link";
import { Card } from "@/components/ui";
import { SYSADMIN_STATS } from "@/lib/demo-metrics";
import { EditKpiButton } from "./EditKpiButton";
import type { KpiData } from "@/app/actions/dashboard";

export interface SystemEventVM {
  text: string;
  meta: string;
  dot: string;
}

const SYS_KPI_CARDS = [
  { label: "Active Users", value: SYSADMIN_STATS.activeUsers, sub: "1 inactive user", subColor: "#7DA02E", valueColor: "#1A1C1A" },
  { label: "Database Size", value: SYSADMIN_STATS.dbSize, sub: "68% of 3.5 GB limit", subColor: "#D4881F", valueColor: "#1A1C1A" },
  { label: "API Calls (Today)", value: SYSADMIN_STATS.apiCalls, sub: "Normal range", subColor: "#7DA02E", valueColor: "#1A1C1A" },
  { label: "System Uptime", value: SYSADMIN_STATS.uptime, sub: "Last 30 days", subColor: "#9E9E9E", valueColor: "#7DA02E" },
];

const QUICK_ACTIONS: { label: string; href?: string; icon: string }[] = [
  { label: "Manage Users", href: "/users", icon: "→" },
  { label: "System Settings", href: "/settings", icon: "→" },
  { label: "View Audit Log", href: "/audit", icon: "→" },
  { label: "Export Full Backup", icon: "↓" },
];

export function SysadminPanel({
  kpi,
  events,
}: {
  kpi: KpiData;
  events: SystemEventVM[];
}) {
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-[18px] lg:grid-cols-4">
        {SYS_KPI_CARDS.map((c) => (
          <Card key={c.label} className="p-[22px]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-[#9E9E9E]">
              {c.label}
            </div>
            <div
              className="mt-2 text-[30px] font-bold"
              style={{ color: c.valueColor }}
            >
              {c.value}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: c.subColor }}>
              {c.sub}
            </div>
          </Card>
        ))}
      </div>

      <EditKpiButton kpi={kpi} />

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            Quick Actions
          </div>
          <div className="flex flex-col gap-2.5">
            {QUICK_ACTIONS.map((a) =>
              a.href ? (
                <Link
                  key={a.label}
                  href={a.href}
                  className="flex items-center justify-between rounded-[10px] bg-[#FAFAFA] px-4 py-3 transition-colors hover:bg-[#F0F0F0]"
                >
                  <span className="text-[13px] font-semibold text-[#1A1C1A]">
                    {a.label}
                  </span>
                  <span className="text-lg text-[#BDBDBD]">{a.icon}</span>
                </Link>
              ) : (
                <div
                  key={a.label}
                  className="flex items-center justify-between rounded-[10px] bg-[#FAFAFA] px-4 py-3 transition-colors hover:bg-[#F0F0F0]"
                >
                  <span className="text-[13px] font-semibold text-[#1A1C1A]">
                    {a.label}
                  </span>
                  <span className="text-lg text-[#BDBDBD]">{a.icon}</span>
                </div>
              ),
            )}
          </div>
        </Card>

        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            Recent System Events
          </div>
          <div className="flex flex-col">
            {events.map((e, i) => (
              <div
                key={`${e.text}-${i}`}
                className="flex gap-2.5 py-2"
                style={{
                  borderBottom:
                    i < events.length - 1 ? "1px solid #F5F5F5" : undefined,
                }}
              >
                <div
                  className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full"
                  style={{ background: e.dot }}
                />
                <div>
                  <div className="text-xs text-[#424242]">{e.text}</div>
                  <div className="text-[10px] text-[#BDBDBD]">{e.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
