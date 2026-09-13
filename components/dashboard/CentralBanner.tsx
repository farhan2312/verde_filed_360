import { Card } from "@/components/ui";

const ORG_STATS = [
  { label: "Total Visits (All)", value: "3,412", delta: "↑ 14.2% vs last month" },
  { label: "Active Regions", value: "6", delta: "All operational" },
  { label: "Active ASRs", value: "24", delta: "5 inactive" },
  { label: "Org Conversion", value: "38.7%", delta: "↑ 2.1pp vs target" },
  { label: "Total Revenue", value: "₹48.2L", delta: "↑ 22% YoY" },
];

const REGION_BARS = [
  { name: "Agra", pct: 88, color: "#678722", label: "847 visits · 45%", labelDark: false },
  { name: "Amethi", pct: 76, color: "#8CB337", label: "712 visits · 52%", labelDark: false },
  { name: "Raebareli", pct: 62, color: "#B3D170", label: "584 visits · 38%", labelDark: false },
  { name: "Lakhimpur Kheri", pct: 48, color: "#C2D98D", label: "456 visits · 35%", labelDark: false },
  { name: "Mathura", pct: 38, color: "#D3E4AB", label: "378 visits · 31%", labelDark: false },
  { name: "Hathras", pct: 28, color: "#E4EFC9", label: "245 visits · 28%", labelDark: true },
];

const TOP_ASRS = [
  { rank: 1, name: "Raj Kumar", sub: "Agra · 94 visits", score: "96%", scoreColor: "#678722" },
  { rank: 2, name: "Amit Yadav", sub: "Firozabad · 87 visits", score: "88%", scoreColor: "#678722" },
  { rank: 3, name: "Vikram Singh", sub: "Mainpuri · 82 visits", score: "84%", scoreColor: "#8CB337" },
  { rank: 4, name: "Deepak Verma", sub: "Etah · 76 visits", score: "78%", scoreColor: "#B3D170" },
  { rank: 5, name: "Sunil Gupta", sub: "Mathura · 71 visits", score: "74%", scoreColor: "#D4881F" },
];

const ALERT_CARDS = [
  {
    accent: "#C62828",
    label: "Alert",
    text: "Hathras region has 42% lower visits than target. ASR Sunil Gupta inactive for 5 days. Immediate intervention needed.",
  },
  {
    accent: "#678722",
    label: "Achievement",
    text: "Firozabad crossed ₹12L monthly sales — highest ever. Tiloi (Amethi) & Shivgarh (Raebareli) leading on sugarcane conversion.",
  },
  {
    accent: "#D4881F",
    label: "Opportunity",
    text: "482 registered farmers have zero purchases. Targeted campaign could unlock ₹8–12L potential quarterly revenue.",
  },
];

export function CentralBanner() {
  return (
    <>
      <div
        className="mb-5 grid grid-cols-2 gap-5 rounded-[14px] px-5 py-[18px] text-white lg:grid-cols-5 lg:px-7 lg:py-[22px]"
        style={{ background: "linear-gradient(135deg,#4A148C,#7B1FA2,#9C27B0)" }}
      >
        {ORG_STATS.map((s) => (
          <div key={s.label}>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.8px] opacity-70">
              {s.label}
            </div>
            <div className="text-[26px] font-bold">{s.value}</div>
            <div className="mt-0.5 text-[11px] opacity-70">{s.delta}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            Region-wise Performance
          </div>
          <div className="flex flex-col gap-2.5">
            {REGION_BARS.map((r) => (
              <div key={r.name} className="flex items-center gap-3">
                <div className="w-[65px] text-xs font-semibold text-[#1A1C1A]">
                  {r.name}
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded-md bg-[#F0F0F0]">
                  <div
                    className="flex h-full items-center rounded-md pl-2"
                    style={{ width: `${r.pct}%`, background: r.color }}
                  >
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: r.labelDark ? "#424242" : "white" }}
                    >
                      {r.label}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-[22px]">
          <div className="mb-3.5 text-[15px] font-bold text-[#1A1C1A]">
            Top ASR Performers (Org-wide)
          </div>
          <div className="flex flex-col gap-2.5">
            {TOP_ASRS.map((a) => (
              <div
                key={a.rank}
                className="flex items-center gap-3 rounded-[10px] px-3 py-2"
                style={{ background: a.rank === 1 ? "#F3F8E6" : "#F5F7F5" }}
              >
                <div
                  className="w-[22px] text-sm font-bold"
                  style={{ color: a.rank === 1 ? "#EDA942" : "#9E9E9E" }}
                >
                  {a.rank}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-[#1A1C1A]">
                    {a.name}
                  </div>
                  <div className="text-[10px] text-[#757575]">{a.sub}</div>
                </div>
                <div
                  className="text-sm font-bold"
                  style={{ color: a.scoreColor }}
                >
                  {a.score}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {ALERT_CARDS.map((c) => (
          <Card
            key={c.label}
            className="border-l-[3px] p-[18px]"
            style={{ borderLeftColor: c.accent }}
          >
            <div
              className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.5px]"
              style={{ color: c.accent }}
            >
              {c.label}
            </div>
            <div className="text-xs leading-[1.55] text-[#616161]">{c.text}</div>
          </Card>
        ))}
      </div>
    </>
  );
}
