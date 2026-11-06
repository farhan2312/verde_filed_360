import Link from "next/link";

/** Sub-navigation across the Weekly Reports area. Compare is Central / admin only. */
export function ReportsTabs({ active, showCompare }: { active: "reports" | "trend" | "compare"; showCompare: boolean }) {
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: "reports", label: "📊 Weekly reports", href: "/reports" },
    { key: "trend", label: "📈 Completion trend", href: "/reports/trend" },
    ...(showCompare ? [{ key: "compare" as const, label: "⇆ Compare regions", href: "/reports/compare" }] : []),
  ];
  return (
    <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-[#ECECEC]">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link key={t.key} href={t.href} prefetch={false} className="relative px-4 py-2.5 text-[13px] font-semibold" style={{ color: on ? "#7DA02E" : "#9E9E9E" }}>
            {t.label}
            {on && <span className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-[#7DA02E]" />}
          </Link>
        );
      })}
    </div>
  );
}
