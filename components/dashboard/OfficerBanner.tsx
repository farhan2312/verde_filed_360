import { Card } from "@/components/ui";

const SCHEDULE = [
  { name: "Ramesh Kumar — Follow-up", sub: "Chandpur · Wheat pest check", time: "9:00 AM", bg: "#F3F8E6", dot: "#678722" },
  { name: "Anil Verma — New visit", sub: "Shamsabad · Seed demo", time: "11:30 AM", bg: "#F5F7F5", dot: "#D4881F" },
  { name: "Bharat Mishra — Product demo", sub: "Jaitpur · Large farmer outreach", time: "2:00 PM", bg: "#F5F7F5", dot: "#D4881F" },
  { name: "Rakesh Gupta — FPO follow-up", sub: "Etmadpur · Enrollment docs", time: "4:00 PM", bg: "#F5F7F5", dot: "#9E9E9E" },
];

const TARGETS = [
  { label: "Visits (Target: 100)", value: "94 / 100", pct: 94, color: "#678722" },
  { label: "Conversions (Target: 60)", value: "63 / 60", pct: 100, color: "#678722" },
  { label: "New Registrations (Target: 20)", value: "14 / 20", pct: 70, color: "#D4881F" },
  { label: "Data Completeness", value: "92%", pct: 92, color: "#678722" },
];

const HERO_STATS = [
  { value: "94", label: "My Visits" },
  { value: "67%", label: "My Conv." },
  { value: "8", label: "Pending" },
  { value: "96%", label: "Score" },
];

export function OfficerBanner() {
  return (
    <>
      <div
        className="mb-5 flex items-center gap-6 rounded-[14px] px-7 py-[22px] text-white"
        style={{ background: "linear-gradient(135deg,#0D47A1,#1565C0,#1E88E5)" }}
      >
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-white/15 text-xl font-bold">
          RK
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold">Welcome back, Raj Kumar</div>
          <div className="mt-0.5 text-xs opacity-70">
            Barabanki · Amethi · Raebareli · Lakhimpur Kheri
          </div>
        </div>
        <div className="flex flex-none gap-6">
          {HERO_STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-[10px] opacity-70">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            Today&apos;s Schedule
          </div>
          <div className="flex flex-col gap-2.5">
            {SCHEDULE.map((r) => (
              <div
                key={r.name}
                className="flex items-center gap-3 rounded-[10px] px-3.5 py-2.5"
                style={{ background: r.bg }}
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ background: r.dot }}
                />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[#1A1C1A]">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-[#757575]">{r.sub}</div>
                </div>
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: r.dot }}
                >
                  {r.time}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            My Targets vs Actual
          </div>
          <div className="flex flex-col gap-3.5">
            {TARGETS.map((t) => (
              <div key={t.label}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-[#616161]">{t.label}</span>
                  <span className="font-bold" style={{ color: t.color }}>
                    {t.value}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-[5px] bg-[#F0F0F0]">
                  <div
                    className="h-full rounded-[5px]"
                    style={{ width: `${t.pct}%`, background: t.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
