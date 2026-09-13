/**
 * Instant navigation skeleton. Next renders this the moment a link is clicked and keeps the
 * app shell (sidebar/header) on screen, so every page feels immediate instead of frozen while
 * its server component streams. A generic KPI-strip + table shape that reads sensibly for the
 * farmers / analytics / catalog / visits / master-data style pages.
 */
const Bar = ({ w = "100%", h = 14, className = "" }: { w?: string | number; h?: number; className?: string }) => (
  <div className={`animate-pulse rounded bg-[#ECECEC] ${className}`} style={{ width: w, height: h }} />
);

export default function AppLoading() {
  return (
    <div className="animate-[fadeUp_0.3s_ease-out]">
      {/* Title */}
      <div className="mb-5 flex flex-col gap-2">
        <Bar w={220} h={22} />
        <Bar w={320} h={13} />
      </div>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-[14px] lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-[14px] border border-black/[0.04] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <Bar w={90} h={11} />
            <div className="mt-2"><Bar w={70} h={22} /></div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="mb-3 flex flex-wrap gap-2 rounded-[14px] border border-black/[0.04] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <Bar w={220} h={38} className="!rounded-lg" />
        <Bar w={150} h={38} className="!rounded-lg" />
        <Bar w={150} h={38} className="!rounded-lg" />
        <Bar w={120} h={38} className="!rounded-lg" />
      </div>

      {/* Table shell */}
      <div className="overflow-hidden rounded-[14px] border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#F0F0F0] bg-[#FAFAFA] px-5 py-3.5">
          <Bar w={180} h={12} />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-[#F5F5F5] px-5 py-3.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-[#ECECEC]" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bar w="45%" h={13} />
              <Bar w="30%" h={11} />
            </div>
            <Bar w={80} h={12} />
            <Bar w={60} h={12} />
            <Bar w={70} h={20} className="!rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
