import { Card } from "@/components/ui";

export function KpiMini({
  label,
  value,
  valueColor,
  sub,
}: {
  label: string;
  value: string;
  valueColor: string;
  sub: string;
}) {
  return (
    <Card className="p-[22px] flex flex-col justify-center">
      <div className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-[0.8px]">
        {label}
      </div>
      <div className="text-[28px] font-bold mt-1.5" style={{ color: valueColor }}>
        {value}
      </div>
      <div className="text-[11px] text-[#9E9E9E] mt-1">{sub}</div>
    </Card>
  );
}
